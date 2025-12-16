import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../pool.js';
import { Projector } from '../projector.js';
import {
  AccountCreated,
  IncomeRecorded,
  ExpenseRecorded,
  TransferSent,
  TransferReceived,
} from '../../../domain/ledger/events.js';
import { randomUUID } from 'crypto';

describe('Projector', () => {
  const projector = new Projector();
  let userId: string;
  let accountId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Ensure database is ready
    await pool.query('SELECT 1');

    // Create a test user
    const userResult = await pool.query<{ id: string }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      ['projector-test@example.com', 'hash']
    );
    testUserId = userResult.rows[0].id;
  });

  afterAll(async () => {
    // Clean up
    await pool.query('DELETE FROM read_movements WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM read_accounts WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  beforeEach(() => {
    userId = testUserId;
    accountId = randomUUID();
  });

  afterEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM read_movements WHERE account_id = $1', [accountId]);
    await pool.query('DELETE FROM read_accounts WHERE account_id = $1', [accountId]);
  });

  describe('projectAccountCreated', () => {
    it('should create account in read_accounts', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const event: AccountCreated = {
          type: 'AccountCreated',
          eventVersion: 1,
          name: 'Test Account',
          currency: 'USD',
          allowNegative: false,
        };

        await projector.project(
          client,
          event,
          {
            eventSeq: 1,
            eventId: randomUUID(),
            aggregateId: accountId,
            userId,
            occurredAt: new Date(),
          }
        );

        await client.query('COMMIT');

        const result = await pool.query(
          'SELECT * FROM read_accounts WHERE account_id = $1',
          [accountId]
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].name).toBe('Test Account');
        expect(result.rows[0].currency).toBe('USD');
        expect(result.rows[0].allow_negative).toBe(false);
        expect(result.rows[0].balance_cents).toBe(0);
      } finally {
        client.release();
      }
    });
  });

  describe('projectIncomeRecorded', () => {
    it('should update balance and create movement', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Create account first
        const createEvent: AccountCreated = {
          type: 'AccountCreated',
          eventVersion: 1,
          name: 'Test',
          currency: 'USD',
          allowNegative: false,
        };

        await projector.project(
          client,
          createEvent,
          {
            eventSeq: 1,
            eventId: randomUUID(),
            aggregateId: accountId,
            userId,
            occurredAt: new Date(),
          }
        );

        // Record income
        const incomeEvent: IncomeRecorded = {
          type: 'IncomeRecorded',
          eventVersion: 1,
          amountCents: 1000,
          occurredAt: new Date('2024-01-01'),
          description: 'Salary',
        };

        await projector.project(
          client,
          incomeEvent,
          {
            eventSeq: 2,
            eventId: randomUUID(),
            aggregateId: accountId,
            userId,
            occurredAt: incomeEvent.occurredAt,
          }
        );

        await client.query('COMMIT');

        // Check account balance
        const accountResult = await pool.query(
          'SELECT balance_cents FROM read_accounts WHERE account_id = $1',
          [accountId]
        );
        expect(accountResult.rows[0].balance_cents).toBe(1000);

        // Check movement
        const movementResult = await pool.query(
          'SELECT * FROM read_movements WHERE account_id = $1',
          [accountId]
        );
        expect(movementResult.rows).toHaveLength(1);
        expect(movementResult.rows[0].kind).toBe('income');
        expect(movementResult.rows[0].amount_cents).toBe(1000);
        expect(movementResult.rows[0].description).toBe('Salary');
      } finally {
        client.release();
      }
    });
  });

  describe('projectExpenseRecorded', () => {
    it('should decrease balance and create movement', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Create account with initial balance
        const createEvent: AccountCreated = {
          type: 'AccountCreated',
          eventVersion: 1,
          name: 'Test',
          currency: 'USD',
          allowNegative: false,
        };

        await projector.project(
          client,
          createEvent,
          {
            eventSeq: 1,
            eventId: randomUUID(),
            aggregateId: accountId,
            userId,
            occurredAt: new Date(),
          }
        );

        const incomeEvent: IncomeRecorded = {
          type: 'IncomeRecorded',
          eventVersion: 1,
          amountCents: 2000,
          occurredAt: new Date('2024-01-01'),
        };

        await projector.project(
          client,
          incomeEvent,
          {
            eventSeq: 2,
            eventId: randomUUID(),
            aggregateId: accountId,
            userId,
            occurredAt: incomeEvent.occurredAt,
          }
        );

        // Record expense
        const expenseEvent: ExpenseRecorded = {
          type: 'ExpenseRecorded',
          eventVersion: 1,
          amountCents: 500,
          occurredAt: new Date('2024-01-02'),
          description: 'Groceries',
        };

        await projector.project(
          client,
          expenseEvent,
          {
            eventSeq: 3,
            eventId: randomUUID(),
            aggregateId: accountId,
            userId,
            occurredAt: expenseEvent.occurredAt,
          }
        );

        await client.query('COMMIT');

        // Check account balance
        const accountResult = await pool.query(
          'SELECT balance_cents FROM read_accounts WHERE account_id = $1',
          [accountId]
        );
        expect(accountResult.rows[0].balance_cents).toBe(1500);

        // Check movements
        const movementResult = await pool.query(
          'SELECT * FROM read_movements WHERE account_id = $1 ORDER BY occurred_at',
          [accountId]
        );
        expect(movementResult.rows).toHaveLength(2);
        expect(movementResult.rows[1].kind).toBe('expense');
        expect(movementResult.rows[1].amount_cents).toBe(500);
      } finally {
        client.release();
      }
    });
  });

  describe('projectTransferSent', () => {
    it('should decrease balance and create transfer_out movement', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Create account
        const createEvent: AccountCreated = {
          type: 'AccountCreated',
          eventVersion: 1,
          name: 'Source',
          currency: 'USD',
          allowNegative: false,
        };

        await projector.project(
          client,
          createEvent,
          {
            eventSeq: 1,
            eventId: randomUUID(),
            aggregateId: accountId,
            userId,
            occurredAt: new Date(),
          }
        );

        // Add initial balance
        const incomeEvent: IncomeRecorded = {
          type: 'IncomeRecorded',
          eventVersion: 1,
          amountCents: 1000,
          occurredAt: new Date('2024-01-01'),
        };

        await projector.project(
          client,
          incomeEvent,
          {
            eventSeq: 2,
            eventId: randomUUID(),
            aggregateId: accountId,
            userId,
            occurredAt: incomeEvent.occurredAt,
          }
        );

        // Send transfer
        const transferId = randomUUID();
        const transferEvent: TransferSent = {
          type: 'TransferSent',
          eventVersion: 1,
          transferId,
          toAccountId: randomUUID(),
          amountCents: 300,
          occurredAt: new Date('2024-01-02'),
          description: 'Transfer to savings',
        };

        await projector.project(
          client,
          transferEvent,
          {
            eventSeq: 3,
            eventId: randomUUID(),
            aggregateId: accountId,
            userId,
            occurredAt: transferEvent.occurredAt,
          }
        );

        await client.query('COMMIT');

        // Check balance
        const accountResult = await pool.query(
          'SELECT balance_cents FROM read_accounts WHERE account_id = $1',
          [accountId]
        );
        expect(accountResult.rows[0].balance_cents).toBe(700);

        // Check movement
        const movementResult = await pool.query(
          'SELECT * FROM read_movements WHERE account_id = $1 AND kind = $2',
          [accountId, 'transfer_out']
        );
        expect(movementResult.rows).toHaveLength(1);
        expect(movementResult.rows[0].transfer_id).toBe(transferId);
        expect(movementResult.rows[0].amount_cents).toBe(300);
      } finally {
        client.release();
      }
    });
  });

  describe('projectTransferReceived', () => {
    it('should increase balance and create transfer_in movement', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Create account
        const createEvent: AccountCreated = {
          type: 'AccountCreated',
          eventVersion: 1,
          name: 'Destination',
          currency: 'USD',
          allowNegative: false,
        };

        await projector.project(
          client,
          createEvent,
          {
            eventSeq: 1,
            eventId: randomUUID(),
            aggregateId: accountId,
            userId,
            occurredAt: new Date(),
          }
        );

        // Receive transfer
        const transferId = randomUUID();
        const transferEvent: TransferReceived = {
          type: 'TransferReceived',
          eventVersion: 1,
          transferId,
          fromAccountId: randomUUID(),
          amountCents: 500,
          occurredAt: new Date('2024-01-01'),
        };

        await projector.project(
          client,
          transferEvent,
          {
            eventSeq: 2,
            eventId: randomUUID(),
            aggregateId: accountId,
            userId,
            occurredAt: transferEvent.occurredAt,
          }
        );

        await client.query('COMMIT');

        // Check balance
        const accountResult = await pool.query(
          'SELECT balance_cents FROM read_accounts WHERE account_id = $1',
          [accountId]
        );
        expect(accountResult.rows[0].balance_cents).toBe(500);

        // Check movement
        const movementResult = await pool.query(
          'SELECT * FROM read_movements WHERE account_id = $1 AND kind = $2',
          [accountId, 'transfer_in']
        );
        expect(movementResult.rows).toHaveLength(1);
        expect(movementResult.rows[0].transfer_id).toBe(transferId);
      } finally {
        client.release();
      }
    });
  });
});

