import { Worker, type Job } from 'bullmq';
import { createMetrics } from '@ledgerguard/observability';
import { env } from './config.js';
import { pool, redis, withTenant } from './shared.js';
import { startHealthServer } from './health.js';

interface ReconciliationJob {
  tenantId: string;
  batchId: string;
}

const WORKER = 'reconciliation';
const metrics = createMetrics('ledgerguard_reconciliation_');
const healthServer = startHealthServer(env.WORKER_HEALTH_PORT, WORKER, metrics.registry);

async function reconcile(tenantId: string, batchId: string): Promise<void> {
  await withTenant(tenantId, async (client) => {
    const batch = (
      await client.query(
        `SELECT *
         FROM reconciliation_batches
         WHERE id = $1
         FOR UPDATE`,
        [batchId]
      )
    ).rows[0];

    if (!batch) throw new Error('Lote de conciliação não encontrado');

    await client.query(
      `UPDATE reconciliation_batches
       SET status = 'PROCESSING', started_at = coalesce(started_at, now()), updated_at = now()
       WHERE id = $1`,
      [batchId]
    );

    const items = await client.query(
      `SELECT *
       FROM reconciliation_items
       WHERE batch_id = $1
       ORDER BY created_at
       FOR UPDATE`,
      [batchId]
    );

    let sourceTotal = 0n;
    let internalTotal = 0n;

    for (const item of items.rows) {
      const internal = (
        await client.query(
          `SELECT id, amount_cents, occurred_at
           FROM transactions
           WHERE external_id = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [item.external_id]
        )
      ).rows[0];

      const sourceAmount = BigInt(item.source_amount_cents);
      sourceTotal += sourceAmount;
      const internalAmount = internal ? BigInt(internal.amount_cents) : null;
      if (internalAmount != null) internalTotal += internalAmount;

      const difference = internalAmount == null ? sourceAmount : sourceAmount - internalAmount;
      const status =
        !internal
          ? 'MISSING_INTERNAL'
          : difference === 0n
            ? 'MATCHED'
            : 'AMOUNT_DIVERGENCE';

      await client.query(
        `UPDATE reconciliation_items
         SET
           transaction_id = $2,
           internal_amount_cents = $3,
           difference_cents = $4,
           status = $5,
           updated_at = now()
         WHERE id = $1`,
        [
          item.id,
          internal?.id ?? null,
          internalAmount?.toString() ?? null,
          difference.toString(),
          status
        ]
      );

      if (status === 'MATCHED' && internal?.id) {
        await client.query(
          `UPDATE transactions
           SET status = CASE
             WHEN status = 'POSTED' THEN 'RECONCILED'
             ELSE status
           END,
           updated_at = now()
           WHERE id = $1`,
          [internal.id]
        );
      }
    }

    const difference = sourceTotal - internalTotal;
    const divergent = Number(
      (
        await client.query(
          `SELECT count(*)::int AS total
           FROM reconciliation_items
           WHERE batch_id = $1
             AND status <> 'MATCHED'`,
          [batchId]
        )
      ).rows[0]?.total ?? 0
    );

    await client.query(
      `UPDATE reconciliation_batches
       SET
         status = $2,
         total_source_cents = $3,
         total_internal_cents = $4,
         difference_cents = $5,
         finished_at = now(),
         updated_at = now()
       WHERE id = $1`,
      [
        batchId,
        divergent === 0 ? 'COMPLETED' : 'COMPLETED_WITH_DIVERGENCES',
        sourceTotal.toString(),
        internalTotal.toString(),
        difference.toString()
      ]
    );
  });
}

const worker = new Worker<ReconciliationJob>(
  'ledgerguard-reconciliation',
  async (job: Job<ReconciliationJob>) => {
    const end = metrics.duration.startTimer({ worker: WORKER });
    try {
      await reconcile(job.data.tenantId, job.data.batchId);
      metrics.jobs.inc({ worker: WORKER, status: 'success' });
    } catch (error) {
      metrics.jobs.inc({ worker: WORKER, status: 'failed' });
      await withTenant(job.data.tenantId, async (client) => {
        await client.query(
          `UPDATE reconciliation_batches
           SET status = 'FAILED', finished_at = now(), updated_at = now()
           WHERE id = $1`,
          [job.data.batchId]
        );
      }).catch(() => undefined);
      throw error;
    } finally {
      end();
    }
  },
  { connection: redis, concurrency: 6 }
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
