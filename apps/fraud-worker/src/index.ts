import { Worker, type Job } from 'bullmq';
import { createMetrics } from '@ledgerguard/observability';
import {
  evaluateRule,
  summarizeRisk,
  type FraudRule
} from '@ledgerguard/fraud-engine';
import { env } from './config.js';
import { pool, redis, withTenant } from './shared.js';
import { startHealthServer } from './health.js';

interface FraudJob {
  tenantId: string;
  transactionId: string;
}

const WORKER = 'fraud';
const metrics = createMetrics('ledgerguard_fraud_');
const healthServer = startHealthServer(env.WORKER_HEALTH_PORT, WORKER, metrics.registry);

function distanceKm(
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
): number | null {
  if ([lat1, lon1, lat2, lon2].some((value) => value == null)) return null;
  const rad = (value: number) => (value * Math.PI) / 180;
  const earth = 6371;
  const dLat = rad(Number(lat2) - Number(lat1));
  const dLon = rad(Number(lon2) - Number(lon1));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(Number(lat1))) *
      Math.cos(rad(Number(lat2))) *
      Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function evaluate(tenantId: string, transactionId: string): Promise<void> {
  await withTenant(tenantId, async (client) => {
    const transaction = (
      await client.query(
        `SELECT *
         FROM transactions
         WHERE id = $1
         FOR UPDATE`,
        [transactionId]
      )
    ).rows[0];

    if (!transaction) throw new Error('Transação não encontrada');

    const rulesResult = await client.query(
      `SELECT
         r.id,
         r.name,
         r.kind,
         v.id AS version_id,
         v.config,
         v.score,
         v.severity
       FROM fraud_rules r
       JOIN fraud_rule_versions v ON v.id = r.active_version_id
       WHERE r.enabled = true`
    );

    const duplicateCount = Number(
      (
        await client.query(
          `SELECT count(*)::int AS total
           FROM transactions
           WHERE id <> $1
             AND (
               ($2::text IS NOT NULL AND card_token_hash = $2)
               OR ($2::text IS NULL AND external_id = $4)
             )
             AND amount_cents = $5
             AND occurred_at BETWEEN $3::timestamptz - interval '2 minutes'
                                 AND $3::timestamptz + interval '2 minutes'`,
          [
            transactionId,
            transaction.card_token_hash,
            transaction.occurred_at,
            transaction.external_id,
            transaction.amount_cents
          ]
        )
      ).rows[0]?.total ?? 0
    ) + 1;

    const velocityCount = Number(
      (
        await client.query(
          `SELECT count(*)::int AS total
           FROM transactions
           WHERE id <> $1
             AND card_token_hash IS NOT DISTINCT FROM $2
             AND card_token_hash IS NOT NULL
             AND occurred_at BETWEEN $3::timestamptz - interval '10 minutes'
                                 AND $3::timestamptz`,
          [transactionId, transaction.card_token_hash, transaction.occurred_at]
        )
      ).rows[0]?.total ?? 0
    ) + 1;

    const previous = (
      await client.query(
        `SELECT card_tsn, latitude, longitude
         FROM transactions
         WHERE id <> $1
           AND card_token_hash IS NOT DISTINCT FROM $2
           AND card_token_hash IS NOT NULL
           AND occurred_at < $3
         ORDER BY occurred_at DESC
         LIMIT 1`,
        [transactionId, transaction.card_token_hash, transaction.occurred_at]
      )
    ).rows[0];

    const rules: FraudRule[] = rulesResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      config: row.config ?? {},
      score: Number(row.score),
      severity: row.severity
    }));

    const context = {
      amount: Number(transaction.amount_cents) / 100,
      duplicateCount,
      velocityCount,
      lastCardTsn: previous?.card_tsn == null ? null : Number(previous.card_tsn),
      cardTsn: transaction.card_tsn == null ? null : Number(transaction.card_tsn),
      distanceKm: distanceKm(
        previous?.latitude == null ? null : Number(previous.latitude),
        previous?.longitude == null ? null : Number(previous.longitude),
        transaction.latitude == null ? null : Number(transaction.latitude),
        transaction.longitude == null ? null : Number(transaction.longitude)
      )
    };

    const results = rules.map((rule) => evaluateRule(rule, context));
    const summary = summarizeRisk(results);

    await client.query(
      `DELETE FROM fraud_evaluations
       WHERE transaction_id = $1`,
      [transactionId]
    );

    for (const result of results) {
      const row = rulesResult.rows.find((candidate) => candidate.id === result.ruleId);
      if (!row) continue;
      await client.query(
        `INSERT INTO fraud_evaluations(
           tenant_id, transaction_id, rule_id, rule_version_id,
           matched, score, reason, risk_level
         )
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          tenantId,
          transactionId,
          result.ruleId,
          row.version_id,
          result.matched,
          result.score,
          result.reason,
          result.severity
        ]
      );
    }

    const flagged = summary.level === 'HIGH' || summary.level === 'CRITICAL';
    await client.query(
      `UPDATE transactions
       SET
         risk_score = $2,
         risk_level = $3,
         status = CASE WHEN $4 THEN 'FLAGGED' ELSE status END,
         updated_at = now()
       WHERE id = $1`,
      [transactionId, summary.score, summary.level, flagged]
    );

    if (flagged) {
      const priority = summary.level === 'CRITICAL' ? 'URGENT' : 'HIGH';
      const caseRow = (
        await client.query(
          `INSERT INTO fraud_cases(
             tenant_id, transaction_id, status, priority,
             risk_score, risk_level, summary
           )
           VALUES($1,$2,'OPEN',$3,$4,$5,$6)
           ON CONFLICT(tenant_id, transaction_id)
           DO UPDATE SET
             priority = EXCLUDED.priority,
             risk_score = EXCLUDED.risk_score,
             risk_level = EXCLUDED.risk_level,
             summary = EXCLUDED.summary,
             updated_at = now()
           RETURNING *`,
          [
            tenantId,
            transactionId,
            priority,
            summary.score,
            summary.level,
            summary.reasons.join(' | ') || 'Risco elevado'
          ]
        )
      ).rows[0];

      await client.query(
        `INSERT INTO case_events(
           tenant_id, case_id, event_type, payload
         )
         VALUES($1,$2,'CASE_OPENED',$3)`,
        [
          tenantId,
          caseRow.id,
          JSON.stringify({ score: summary.score, level: summary.level, reasons: summary.reasons })
        ]
      );
    }

    await client.query(
      `INSERT INTO outbox(
         tenant_id, aggregate_type, aggregate_id, event_type, payload, status
       )
       VALUES($1,'transaction',$2,'FRAUD_EVALUATED',$3,'PENDING')`,
      [
        tenantId,
        transactionId,
        JSON.stringify({ transactionId, riskScore: summary.score, riskLevel: summary.level })
      ]
    );
  });
}

const worker = new Worker<FraudJob>(
  'ledgerguard-fraud',
  async (job: Job<FraudJob>) => {
    const end = metrics.duration.startTimer({ worker: WORKER });
    try {
      await evaluate(job.data.tenantId, job.data.transactionId);
      metrics.jobs.inc({ worker: WORKER, status: 'success' });
    } catch (error) {
      metrics.jobs.inc({ worker: WORKER, status: 'failed' });
      throw error;
    } finally {
      end();
    }
  },
  { connection: redis, concurrency: 16 }
);

worker.on('failed', (job, error) => {
  console.error(JSON.stringify({ level: 'error', worker: WORKER, jobId: job?.id, error: error.message }));
});

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  healthServer.close();
  await worker.close();
  await redis.quit();
  await pool.end();
  console.log(JSON.stringify({ level: 'info', worker: WORKER, signal, event: 'shutdown' }));
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  console.error(error);
  void shutdown('uncaughtException');
});
process.on('unhandledRejection', (error) => {
  console.error(error);
  void shutdown('unhandledRejection');
});
