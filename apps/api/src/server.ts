import { buildApp } from './app.js';
import { env } from './config/env.js';
import { pool, migratorPool } from './db/pool.js';
import { closeQueues } from './lib/queue.js';

const app = await buildApp();
await app.listen({
  host: '0.0.0.0',
  port: env.API_PORT
});

let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;

  app.log.info({ signal }, 'shutting down');
  await app.close();
  await closeQueues();
  await pool.end();
  await migratorPool.end();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
