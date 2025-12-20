import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { pool } from '../../db/pool.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('GET /healthz', () => {
  let app: any;

  beforeAll(async () => {
    // Ensure server module can load in tests even if JWT_SECRET isn't set in the environment.
    process.env.JWT_SECRET ||= 'test-secret';
    const mod = await import('../server.js');
    app = mod.default;

    await pool.query('SELECT 1');
  });

  it('returns 200 when DB is reachable', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  // Note: To test DB-down scenario (500 response), manually stop the database
  // and verify: GET /healthz returns 500 {code:'DB_UNAVAILABLE', message:'Database unavailable'}
  // within ~2 seconds.
});


