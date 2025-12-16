import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { pool } from './pool.js';

const MIGRATIONS_DIR = join(process.cwd(), 'src/infra/db/migrations');

interface Migration {
  filename: string;
  version: number;
}

async function getMigrations(): Promise<Migration[]> {
  const files = await readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter((f) => f.endsWith('.sql'))
    .map((filename) => {
      const match = filename.match(/^(\d+)_/);
      if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }
      return {
        filename,
        version: parseInt(match[1], 10),
      };
    })
    .sort((a, b) => a.version - b.version);

  return sqlFiles;
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<number[]> {
  const result = await pool.query<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  return result.rows.map((row) => row.version);
}

async function applyMigration(filename: string, version: number): Promise<void> {
  const filePath = join(MIGRATIONS_DIR, filename);
  const sql = await readFile(filePath, 'utf-8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Execute migration SQL
    await client.query(sql);

    // Record migration
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1)',
      [version]
    );

    await client.query('COMMIT');
    console.log(`✓ Applied migration ${version}: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function migrate(): Promise<void> {
  try {
    console.log('Starting migrations...');

    await ensureMigrationsTable();
    const migrations = await getMigrations();
    const applied = await getAppliedMigrations();

    const pending = migrations.filter((m) => !applied.includes(m.version));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Found ${pending.length} pending migration(s)`);

    for (const migration of pending) {
      await applyMigration(migration.filename, migration.version);
    }

    console.log('All migrations applied successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations
void migrate();

