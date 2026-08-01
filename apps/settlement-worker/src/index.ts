import { Worker, type Job } from 'bullmq';
import { createMetrics } from '@ledgerguard/observability';
import { env } from './config.js';
import { pool, redis, withTenant } from './shared.js';
import { startHealthServer } from './health.js';

interface SettlementJob {
  tenantId: string;
  settlementId: string;
}

const WORKER = 'settlement';
const metrics = createMetrics('ledgerguard_settlement_');
const healthServer = startHealthServer(env.WORKER_HEALTH_PORT, WORKER, metrics.registry);

async function calculate(tenantId: string, settlementId: string): Promise<void> {
  await withTenant(tenantId, async (client) => {
    const settlement = (
      await client.query(
        `SELECT *
         FROM settlements
         WHERE id = $1
         FOR UPDATE`,
        [settlementId]
      )
    ).rows[0];

    if (!settlement) throw new Error('Fechamento não encontrado');
    if (settlement.status === 'CLOSED') return;

    await client.query(
      `UPDATE settlements
       SET status = 'PROCESSING', updated_at = now()
       WHERE id = $1`,
      [settlementId]
    );

    const transactions = (
      await client.query(
        `SELECT
           count(*)::int AS total,
           coalesce(sum(amount_cents), 0)::bigint AS gross
         FROM transactions
         WHERE occurred_at >= $1::date
           AND occurred_at < $1::date + interval '1 day'
           AND status NOT IN ('FAILED')`,
        [settlement.settlement_date]
      )
    ).rows[0];

    const refunds = (
      await client.query(
        `SELECT coalesce(sum(r.amount_cents), 0)::bigint AS total
         FROM refunds r
         JOIN transactions t ON t.id = r.transaction_id
         WHERE t.occurred_at >= $1::date
           AND t.occurred_at < $1::date + interval '1 day'
           AND r.status = 'PROCESSED'`,
        [settlement.settlement_date]
      )
    ).rows[0];

    const chargebacks = (
      await client.query(
        `SELECT coalesce(sum(c.amount_cents), 0)::bigint AS total
         FROM chargebacks c
         JOIN transactions t ON t.id = c.transaction_id
         WHERE t.occurred_at >= $1::date
           AND t.occurred_at < $1::date + interval '1 day'
           AND c.status NOT IN ('REJECTED','CANCELLED')`,
        [settlement.settlement_date]
      )
    ).rows[0];

    const gross = BigInt(transactions.gross);
    const refund = BigInt(refunds.total);
    const chargeback = BigInt(chargebacks.total);
    const net = gross - refund - chargeback;

    await client.query(
      `UPDATE settlements
       SET
         status = 'READY',
         total_transactions = $2,
         gross_amount_cents = $3,
         refund_amount_cents = $4,
         chargeback_amount_cents = $5,
         net_amount_cents = $6,
         updated_at = now()
       WHERE id = $1`,
      [
        settlementId,
        transactions.total,
        gross.toString(),
        refund.toString(),
        chargeback.toString(),
        net.toString()
      ]
    );
  });
}

const worker = new Worker<SettlementJob>(
  'ledgerguard-settlement',
  async (job: Job<SettlementJob>) => {
    const end = metrics.duration.startTimer({ worker: WORKER });
    try {
      await calculate(job.data.tenantId, job.data.settlementId);
      metrics.jobs.inc({ worker: WORKER, status: 'success' });
    } catch (error) {
      metrics.jobs.inc({ worker: WORKER, status: 'failed' });
      await withTenant(job.data.tenantId, async (client) => {
        await client.query(
          `UPDATE settlements
           SET status = 'FAILED', updated_at = now()
           WHERE id = $1`,
          [job.data.settlementId]
        );
      }).catch(() => undefined);
      throw error;
    } finally {
      end();
    }
  },
  { connection: redis, concurrency: 4 }
);

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
