import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { pool } from '../../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('E2E: Full Ledger Flow', () => {
  let app: any;
  let token: string;
  let userId: string;
  let accountId1: string;
  let accountId2: string;

  beforeAll(async () => {
    // Lazy import to avoid requiring JWT_SECRET when this suite is skipped.
    const mod = await import('../server.js');
    app = mod.default;

    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    // Clean up test data
    if (userId) {
      await pool.query('DELETE FROM read_movements WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM read_accounts WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM events WHERE aggregate_id IN (SELECT account_id FROM read_accounts WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM command_dedup WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });

  it('should complete full ledger workflow', async () => {
    // 1. Register user
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: `e2e-test-${Date.now()}@example.com`,
        password: 'password123',
      });

    expect(registerRes.status).toBe(201);
    userId = registerRes.body.userId;

    // 2. Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: registerRes.body.email,
        password: 'password123',
      });

    expect(loginRes.status).toBe(200);
    token = loginRes.body.token;
    expect(token).toBeTruthy();

    // 3. Create first account
    const createAccount1Res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Checking Account',
        currency: 'USD',
        allowNegative: false,
      });

    expect(createAccount1Res.status).toBe(201);
    accountId1 = createAccount1Res.body.accountId;

    // 4. Create second account
    const createAccount2Res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Savings Account',
        currency: 'USD',
        allowNegative: false,
      });

    expect(createAccount2Res.status).toBe(201);
    accountId2 = createAccount2Res.body.accountId;

    // 5. List accounts
    const listAccountsRes = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(listAccountsRes.status).toBe(200);
    expect(listAccountsRes.body).toHaveLength(2);

    // 6. Record income on first account
    const incomeRes = await request(app)
      .post(`/api/accounts/${accountId1}/income`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        amountCents: 10000,
        occurredAt: new Date().toISOString(),
        description: 'Salary',
      });

    expect(incomeRes.status).toBe(200);
    expect(incomeRes.body.newBalance).toBe(10000);

    // 7. Record expense on first account
    const expenseRes = await request(app)
      .post(`/api/accounts/${accountId1}/expense`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        amountCents: 3000,
        occurredAt: new Date().toISOString(),
        description: 'Groceries',
      });

    expect(expenseRes.status).toBe(200);
    expect(expenseRes.body.newBalance).toBe(7000);

    // 8. Transfer from first to second account
    const transferRes = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fromAccountId: accountId1,
        toAccountId: accountId2,
        amountCents: 2000,
        occurredAt: new Date().toISOString(),
        description: 'Transfer to savings',
      });

    expect(transferRes.status).toBe(200);
    expect(transferRes.body.fromAccountBalance).toBe(5000);
    expect(transferRes.body.toAccountBalance).toBe(2000);

    // 9. Get account details
    const getAccountRes = await request(app)
      .get(`/api/accounts/${accountId1}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getAccountRes.status).toBe(200);
    expect(getAccountRes.body.balanceCents).toBe(5000);

    // 10. Get movements
    const movementsRes = await request(app)
      .get(`/api/accounts/${accountId1}/movements`)
      .set('Authorization', `Bearer ${token}`);

    expect(movementsRes.status).toBe(200);
    expect(movementsRes.body.movements).toHaveLength(3); // income, expense, transfer_out
    expect(movementsRes.body.movements[0].kind).toBe('transfer_out');
    expect(movementsRes.body.movements[1].kind).toBe('expense');
    expect(movementsRes.body.movements[2].kind).toBe('income');

    // 11. Export CSV
    const csvRes = await request(app)
      .get(`/api/accounts/${accountId1}/movements.csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('Date,Type,Amount,Description');
    expect(csvRes.text).toContain('income');
    expect(csvRes.text).toContain('expense');
    expect(csvRes.text).toContain('transfer_out');

    // 12. Verify final balances
    const finalAccountsRes = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${token}`);

    const checking = finalAccountsRes.body.find((a: any) => a.accountId === accountId1);
    const savings = finalAccountsRes.body.find((a: any) => a.accountId === accountId2);

    expect(checking.balanceCents).toBe(5000);
    expect(savings.balanceCents).toBe(2000);
  });
});

