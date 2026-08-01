import { Client } from 'minio';
import { env } from '../config/env.js';

export const minio = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL === 'true',
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY
});

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function ensureBucket(): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const exists = await minio.bucketExists(env.MINIO_BUCKET);
      if (!exists) {
        await minio.makeBucket(env.MINIO_BUCKET);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 30) await wait(Math.min(1000 * attempt, 5000));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('MinIO indisponível');
}
