import pg from 'pg';
import { Redis } from 'ioredis';
import { env } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.WORKER_DATABASE_URL,
  max: 10
});

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
