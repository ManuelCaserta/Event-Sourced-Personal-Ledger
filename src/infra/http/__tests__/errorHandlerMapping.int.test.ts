import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { pool } from '../../db/pool.js';
import { createAuthRoutes } from '../routes/auth.js';
import { createLedgerRoutes } from '../routes/ledger.js';
import { errorHandler } from '../middleware/errorHandler.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('HTTP error mapping (ErrorResponse)', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  let app: express.Application;
  let token: string;
  let userId: string;
  let accountId1: string;
  let accountId2: string;

  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    if (userId) {
      await pool.query('DELETE FROM read_movements WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM read_accounts WHERE user_id = $1', [userId]);
      await pool.query(
        'DELETE FROM events WHERE aggregate_id IN (SELECT account_id FROM read_accounts WHERE user_id = $1)',
        [userId]
      );
      await pool.query('DELETE FROM command_dedup WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRoutes(JWT_SECRET));
    app.use('/api', createLedgerRoutes(JWT_SECRET));
    app.use(errorHandler);

    // Register + login
    const email = `errmap-${Date.now()}@example.com`;
    const registerRes = await request(app).post('/api/auth/register').send({
      email,
      password: 'password123',
    });
    expect(registerRes.status).toBe(201);
    userId = registerRes.body.userId;

    const loginRes = await request(app).post('/api/auth/login').send({
      email,
      password: 'password123',
    });
    expect(loginRes.status).toBe(200);
    token = loginRes.body.token;

    // Create two accounts
    const create1 = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A1', currency: 'USD', allowNegative: false });
    expect(create1.status).toBe(201);
    accountId1 = create1.body.accountId;

    const create2 = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A2', currency: 'USD', allowNegative: false });
    expect(create2.status).toBe(201);
    accountId2 = create2.body.accountId;
  });

  it('maps InvalidAmountError -> 400 INVALID_AMOUNT', async () => {
    const res = await request(app)
      .post(`/api/accounts/${accountId1}/income`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        amountCents: -1,
        occurredAt: new Date().toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'INVALID_AMOUNT');
    expect(res.body).toHaveProperty('message');
  });

  it('maps InsufficientBalanceError -> 409 INSUFFICIENT_BALANCE', async () => {
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fromAccountId: accountId1,
        toAccountId: accountId2,
        amountCents: 100,
        occurredAt: new Date().toISOString(),
      });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('code', 'INSUFFICIENT_BALANCE');
    expect(res.body).toHaveProperty('message');
  });
});


