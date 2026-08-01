import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

export const ingestionQueue = new Queue('ledgerguard-ingestion', { connection });
export const fraudQueue = new Queue('ledgerguard-fraud', { connection });
export const reconciliationQueue = new Queue('ledgerguard-reconciliation', { connection });
export const settlementQueue = new Queue('ledgerguard-settlement', { connection });

export async function closeQueues(): Promise<void> {
  await Promise.all([
    ingestionQueue.close(),
    fraudQueue.close(),
    reconciliationQueue.close(),
    settlementQueue.close()
  ]);
  await connection.quit();
}
