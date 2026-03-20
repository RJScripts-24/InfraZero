import { Pool } from 'pg';
import { env } from './env';

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
});
