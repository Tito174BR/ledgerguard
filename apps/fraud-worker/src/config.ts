import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  WORKER_DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  WORKER_HEALTH_PORT: z.coerce.number().default(3334)
});

export const env = schema.parse(process.env);
