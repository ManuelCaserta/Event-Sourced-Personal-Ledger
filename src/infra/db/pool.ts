import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

const missingDatabaseUrlError = new Error('DATABASE_URL environment variable is not set');

// Avoid throwing at import-time so unit-only test runs can still execute.
// Integration code will fail fast when attempting to use the pool.
const missingPool = new Proxy(
  {},
  {
    get() {
      throw missingDatabaseUrlError;
    },
  }
) as unknown as InstanceType<typeof Pool>;

export const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  : missingPool;

if (DATABASE_URL) {
  // Test connection on startup
  pool.on('connect', () => {
    console.log('Database connection established');
  });

  pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
  });
}

