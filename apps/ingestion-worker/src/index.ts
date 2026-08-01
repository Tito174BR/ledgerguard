import { Queue, Worker, type Job } from 'bullmq';
import { createMetrics } from '@ledgerguard/observability';
import {
  assertBalanced,
  buildChargebackPostings,
  buildRefundPostings,
  buildTransactionPostings
} from '@ledgerguard/ledger-core';
import { env } from './config.js';
import { pool, redis, withTenant } from './shared.js';
import { startHealthServer } from './health.js';

type TransactionIngestionJob = {
  tenantId: string;
  transactionId: string;
};

type RefundIngestionJob = {
  tenantId: string;
  refundId: string;
};

type ChargebackIngestionJob = {
  tenantId: string;
  chargebackId: string;
};

type IngestionJob =
  | TransactionIngestionJob
  | RefundIngestionJob
  | ChargebackIngestionJob;

function isTransactionJob(data: IngestionJob): data is TransactionIngestionJob {
  return 'transactionId' in data && typeof data.transactionId === 'string';
}

function isRefundJob(data: IngestionJob): data is RefundIngestionJob {
  return 'refundId' in data && typeof data.refundId === 'string';
}

function isChargebackJob(data: IngestionJob): data is ChargebackIngestionJob {
  return 'chargebackId' in data && typeof data.chargebackId === 'string';
}

const WORKER = 'ingestion';
const metrics = createMetrics('ledgerguard_ingestion_');
const healthServer = startHealthServer(env.WORKER_HEALTH_PORT, WORKER, metrics.registry);
const fraudQueue = new Queue('ledgerguard-fraud', { connection: redis });

async function accountMap(
  client: import('pg').PoolClient,
  tenantId: string
): Promise<Map<string, string>> {
  const result = await client.query(
    `SELECT id, code
     FROM ledger_accounts
     WHERE tenant_id = $1`,
    [tenantId]
  );
  return new Map(result.rows.map((row) => [row.code, row.id]));
}

async function processTransaction(tenantId: string, transactionId: string): Promise<void> {
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
    if (['POSTED', 'FLAGGED', 'RECONCILED', 'REFUNDED', 'CHARGEBACK'].includes(transaction.status)) {
      return;
    }

    await client.query(
      `UPDATE transactions
       SET status = 'PROCESSING', updated_at = now()
       WHERE id = $1`,
      [transactionId]
    );

    const postings = buildTransactionPostings(Number(transaction.amount_cents) / 100);
    assertBalanced(postings);
    const accounts = await accountMap(client, tenantId);

    for (const posting of postings) {
      const accountId = accounts.get(posting.accountCode);
      if (!accountId) throw new Error(`Conta contábil ausente: ${posting.accountCode}`);

      await client.query(
        `INSERT INTO ledger_entries(
           tenant_id, transaction_id, account_id, side, amount_cents,
           memo, reference_type, reference_id
         )
         SELECT $1,$2,$3,$4,$5,$6,'TRANSACTION',$2
         WHERE NOT EXISTS (
           SELECT 1 FROM ledger_entries
           WHERE tenant_id = $1
             AND transaction_id = $2
             AND account_id = $3
             AND side = $4
             AND reference_type = 'TRANSACTION'
         )`,
        [
          tenantId,
          transactionId,
          accountId,
          posting.side,
          posting.amountCents.toString(),
          posting.memo ?? null
        ]
      );
    }

    await client.query(
      `UPDATE transactions
       SET status = 'POSTED', updated_at = now()
       WHERE id = $1`,
      [transactionId]
    );

    await client.query(
      `INSERT INTO outbox(
         tenant_id, aggregate_type, aggregate_id, event_type, payload, status
       )
       VALUES($1,'transaction',$2,'TRANSACTION_POSTED',$3,'PENDING')`,
      [
        tenantId,
        transactionId,
        JSON.stringify({ transactionId, tenantId })
      ]
    );
  });

  await fraudQueue.add(
    'evaluate',
    { tenantId, transactionId },
    {
      jobId: `fraud-${transactionId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000
    }
  );
}

async function processRefund(tenantId: string, refundId: string): Promise<void> {
  await withTenant(tenantId, async (client) => {
    const refund = (
      await client.query(
        `SELECT r.*, t.amount_cents AS transaction_amount
         FROM refunds r
         JOIN transactions t ON t.id = r.transaction_id
         WHERE r.id = $1
         FOR UPDATE`,
        [refundId]
      )
    ).rows[0];

    if (!refund) throw new Error('Reembolso não encontrado');
    if (refund.status === 'PROCESSED') return;
    if (BigInt(refund.amount_cents) > BigInt(refund.transaction_amount)) {
      throw new Error('Reembolso maior que a transação');
    }

    const postings = buildRefundPostings(Number(refund.amount_cents) / 100);
    assertBalanced(postings);
    const accounts = await accountMap(client, tenantId);

    for (const posting of postings) {
      const accountId = accounts.get(posting.accountCode);
      if (!accountId) throw new Error(`Conta contábil ausente: ${posting.accountCode}`);

      await client.query(
        `INSERT INTO ledger_entries(
           tenant_id, transaction_id, account_id, side, amount_cents,
           memo, reference_type, reference_id
         )
         SELECT $1,$2,$3,$4,$5,$6,'REFUND',$7
         WHERE NOT EXISTS (
           SELECT 1 FROM ledger_entries
           WHERE tenant_id = $1
             AND reference_type = 'REFUND'
             AND reference_id = $7
             AND account_id = $3
             AND side = $4
         )`,
        [
          tenantId,
          refund.transaction_id,
          accountId,
          posting.side,
          posting.amountCents.toString(),
          posting.memo ?? null,
          refundId
        ]
      );
    }

    await client.query(
      `UPDATE refunds
       SET status = 'PROCESSED', processed_at = now()
       WHERE id = $1`,
      [refundId]
    );

    await client.query(
      `UPDATE transactions
       SET status = 'REFUNDED', updated_at = now()
       WHERE id = $1`,
      [refund.transaction_id]
    );
  });
}



async function processChargeback(tenantId: string, chargebackId: string): Promise<void> {
  await withTenant(tenantId, async (client) => {
    const chargeback = (
      await client.query(
        `SELECT c.*, t.amount_cents AS transaction_amount
         FROM chargebacks c
         JOIN transactions t ON t.id = c.transaction_id
         WHERE c.id = $1
         FOR UPDATE`,
        [chargebackId]
      )
    ).rows[0];

    if (!chargeback) throw new Error('Chargeback não encontrado');
    if (chargeback.status === 'POSTED') return;
    if (BigInt(chargeback.amount_cents) > BigInt(chargeback.transaction_amount)) {
      throw new Error('Chargeback maior que a transação');
    }

    const postings = buildChargebackPostings(Number(chargeback.amount_cents) / 100);
    assertBalanced(postings);
    const accounts = await accountMap(client, tenantId);

    for (const posting of postings) {
      const accountId = accounts.get(posting.accountCode);
      if (!accountId) throw new Error(`Conta contábil ausente: ${posting.accountCode}`);

      await client.query(
        `INSERT INTO ledger_entries(
           tenant_id, transaction_id, account_id, side, amount_cents,
           memo, reference_type, reference_id
         )
         SELECT $1,$2,$3,$4,$5,$6,'CHARGEBACK',$7
         WHERE NOT EXISTS (
           SELECT 1 FROM ledger_entries
           WHERE tenant_id = $1
             AND reference_type = 'CHARGEBACK'
             AND reference_id = $7
             AND account_id = $3
             AND side = $4
         )`,
        [
          tenantId,
          chargeback.transaction_id,
          accountId,
          posting.side,
          posting.amountCents.toString(),
          posting.memo ?? null,
          chargebackId
        ]
      );
    }

    await client.query(
      `UPDATE chargebacks
       SET status = 'POSTED', updated_at = now()
       WHERE id = $1`,
      [chargebackId]
    );
    await client.query(
      `UPDATE transactions
       SET status = 'CHARGEBACK', updated_at = now()
       WHERE id = $1`,
      [chargeback.transaction_id]
    );
  });
}

async function dispatchOutbox(): Promise<void> {
  const tenants = await pool.query(
    `SELECT id
     FROM tenants
     WHERE status = 'ACTIVE'`
  );

  for (const tenant of tenants.rows) {
    await withTenant(tenant.id, async (client) => {
      const events = await client.query(
        `SELECT *
         FROM outbox
         WHERE status = 'PENDING'
           AND available_at <= now()
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 100`
      );

      for (const event of events.rows) {
        try {
          await redis.publish(
            'ledgerguard.events',
            JSON.stringify({
              id: event.id,
              tenantId: event.tenant_id,
              eventType: event.event_type,
              aggregateType: event.aggregate_type,
              aggregateId: event.aggregate_id,
              payload: event.payload,
              createdAt: event.created_at
            })
          );
          await client.query(
            `UPDATE outbox
             SET status = 'PROCESSED',
                 processed_at = now(),
                 attempts = attempts + 1
             WHERE id = $1`,
            [event.id]
          );
        } catch {
          await client.query(
            `UPDATE outbox
             SET attempts = attempts + 1,
                 available_at = now() + make_interval(secs => least(300, power(2, least(attempts + 1, 8))::int))
             WHERE id = $1`,
            [event.id]
          );
        }
      }
    });
  }
}

const outboxTimer = setInterval(() => {
  void dispatchOutbox().catch((error) => {
    console.error(JSON.stringify({
      level: 'error',
      worker: WORKER,
      event: 'outbox_dispatch_failed',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }));
  });
}, 5000);
outboxTimer.unref();
void dispatchOutbox();

const worker = new Worker<IngestionJob>(
  'ledgerguard-ingestion',
  async (job: Job<IngestionJob>) => {
    const end = metrics.duration.startTimer({ worker: WORKER });
    const data = job.data;

    try {
      if (job.name === 'refund') {
        if (!isRefundJob(data)) throw new Error('Payload de reembolso inválido');
        await processRefund(data.tenantId, data.refundId);
      } else if (job.name === 'chargeback') {
        if (!isChargebackJob(data)) throw new Error('Payload de chargeback inválido');
        await processChargeback(data.tenantId, data.chargebackId);
      } else if (job.name === 'ingest') {
        if (!isTransactionJob(data)) throw new Error('Payload de transação inválido');
        await processTransaction(data.tenantId, data.transactionId);
      } else {
        throw new Error(`Tipo de job não suportado: ${job.name}`);
      }

      metrics.jobs.inc({ worker: WORKER, status: 'success' });
    } catch (error) {
      metrics.jobs.inc({ worker: WORKER, status: 'failed' });

      if (isTransactionJob(data)) {
        const { tenantId, transactionId } = data;
        const processingError = error instanceof Error ? error.message : 'Erro desconhecido';

        await withTenant(tenantId, async (client) => {
          await client.query(
            `UPDATE transactions
             SET status = 'FAILED',
                 metadata = metadata || jsonb_build_object('processingError', $2::text),
                 updated_at = now()
             WHERE id = $1`,
            [transactionId, processingError]
          );
        }).catch(() => undefined);
      }

      throw error;
    } finally {
      end();
    }
  },
  { connection: redis, concurrency: 12 }
);

worker.on('completed', (job) => {
  console.log(JSON.stringify({ level: 'info', worker: WORKER, jobId: job.id, event: 'completed' }));
});
worker.on('failed', (job, error) => {
  console.error(JSON.stringify({ level: 'error', worker: WORKER, jobId: job?.id, error: error.message }));
});

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  console.log(JSON.stringify({ level: 'info', worker: WORKER, signal, event: 'shutdown' }));
  healthServer.close();
  clearInterval(outboxTimer);
  await worker.close();
  await fraudQueue.close();
  await redis.quit();
  await pool.end();
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
