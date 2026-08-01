import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratorPool } from '../db/pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../db/migrations');

await migratorPool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations(
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const migrations = (await fs.readdir(migrationsDir))
  .filter((file) => file.endsWith('.sql'))
  .sort();

for (const name of migrations) {
  const exists = await migratorPool.query(
    'SELECT 1 FROM schema_migrations WHERE name = $1',
    [name]
  );

  if (exists.rowCount) continue;

  const sql = await fs.readFile(path.join(migrationsDir, name), 'utf8');
  const client = await migratorPool.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    await client.query('COMMIT');
    console.log(`Applied ${name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

await migratorPool.end();
console.log('Migrations completed');
