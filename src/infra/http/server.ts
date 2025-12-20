import express from 'express';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { createAuthRoutes } from './routes/auth.js';
import { createLedgerRoutes } from './routes/ledger.js';
import { createSwaggerRoutes } from './routes/swagger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { pool } from '../db/pool.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Middleware
app.use(express.json());
app.use(apiRateLimiter);

// Serve static files (dashboard)
app.use(express.static(join(__dirname, '../../web/public')));

/**
 * Helper to add timeout to a promise.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error('timeout'));
      }, ms);
    }),
  ]);
}

// Health check endpoint (no auth required)
app.get('/healthz', (req, res, next) => {
  withTimeout(pool.query('SELECT 1'), 2000)
    .then(() => {
      res.status(200).json({ status: 'ok' });
    })
    .catch(() => {
      res.status(500).json({
        code: 'DB_UNAVAILABLE',
        message: 'Database unavailable',
      });
    })
    .catch(next);
});

// Swagger/OpenAPI docs
app.use(createSwaggerRoutes());

// Auth routes
app.use('/api/auth', createAuthRoutes(JWT_SECRET));

// Ledger routes (protected)
app.use('/api', createLedgerRoutes(JWT_SECRET));

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/healthz`);
});

export default app;

