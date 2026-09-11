/**
 * Applies every SQL file in database/migrations in filename order.
 *
 * Each applied filename is recorded in schema_migrations, so re-running is a
 * no-op. Run with `npm run db:migrate` from backend/.
 */
import fs from 'fs';
import path from 'path';
import { dbPool } from '../config/database';
import { logger } from '../utils/logger';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');

const run = async (): Promise<void> => {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await dbPool.query<{ filename: string }>('SELECT filename FROM public.schema_migrations');
  const applied = new Set(rows.map((row) => row.filename));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      logger.info(`[Migrate] skip ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO public.schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info(`[Migrate] applied ${file}`);
      count += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      client.release();
    }
  }

  logger.info(`[Migrate] done - ${count} newly applied, ${files.length} total.`);
};

run()
  .then(() => dbPool.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    logger.error(`[Migrate] ${error instanceof Error ? error.message : String(error)}`);
    await dbPool.end().catch(() => undefined);
    process.exit(1);
  });
