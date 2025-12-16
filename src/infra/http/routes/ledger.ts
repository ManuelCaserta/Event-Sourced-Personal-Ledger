import { Router } from 'express';
import { z } from 'zod';
import { CreateAccountUseCase } from '../../../application/ledger/createAccount.js';
import { RecordIncomeUseCase } from '../../../application/ledger/recordIncome.js';
import { RecordExpenseUseCase } from '../../../application/ledger/recordExpense.js';
import { TransferUseCase } from '../../../application/ledger/transfer.js';
import { LedgerQueries } from '../../../application/ledger/queries.js';
import { EventStoreRepo } from '../../db/eventStoreRepo.js';
import { CommandDedupRepo } from '../../db/commandDedupRepo.js';
import { Projector } from '../../db/projector.js';
import { ProjectionsRepo } from '../../db/projectionsRepo.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { randomUUID } from 'crypto';

/**
 * @openapi
 * /api/accounts/{id}/income:
 *   post:
 *     tags: [Transactions]
 *     summary: Record income
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amountCents, occurredAt]
 *             properties:
 *               amountCents: { type: integer, example: 1000 }
 *               occurredAt: { type: string, format: date-time }
 *               description: { type: string }
 *     responses:
 *       200: { description: OK }
 *       400:
 *         description: Validation or domain error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Account not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /api/accounts/{id}/expense:
 *   post:
 *     tags: [Transactions]
 *     summary: Record expense
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amountCents, occurredAt]
 *             properties:
 *               amountCents: { type: integer, example: 1000 }
 *               occurredAt: { type: string, format: date-time }
 *               description: { type: string }
 *     responses:
 *       200: { description: OK }
 *       400:
 *         description: Validation or domain error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Account not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Insufficient balance
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /api/transfers:
 *   post:
 *     tags: [Transfers]
 *     summary: Transfer between accounts (atomic)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromAccountId, toAccountId, amountCents, occurredAt]
 *             properties:
 *               fromAccountId: { type: string, format: uuid }
 *               toAccountId: { type: string, format: uuid }
 *               amountCents: { type: integer, example: 1000 }
 *               occurredAt: { type: string, format: date-time }
 *               description: { type: string }
 *     responses:
 *       200: { description: OK }
 *       400:
 *         description: Validation or domain error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Account not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Insufficient balance or concurrency conflict
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */

const createAccountBodySchema = z.object({
  name: z.string().min(1),
  currency: z.string().length(3),
  allowNegative: z.boolean(),
});

const recordIncomeParamsSchema = z.object({
  id: z.string().uuid(),
});

const recordIncomeBodySchema = z.object({
  // Let domain validation return stable error codes (e.g. INVALID_AMOUNT)
  amountCents: z.number().int(),
  occurredAt: z.string().datetime(),
  description: z.string().optional(),
});

const recordExpenseParamsSchema = z.object({
  id: z.string().uuid(),
});

const recordExpenseBodySchema = z.object({
  // Let domain validation return stable error codes (e.g. INVALID_AMOUNT)
  amountCents: z.number().int(),
  occurredAt: z.string().datetime(),
  description: z.string().optional(),
});

const transferBodySchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  // Let domain validation return stable error codes (e.g. INVALID_AMOUNT)
  amountCents: z.number().int(),
  occurredAt: z.string().datetime(),
  description: z.string().optional(),
});

const getMovementsParamsSchema = z.object({
  id: z.string().uuid(),
});

const getMovementsQuerySchema = z.object({
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 50)),
  cursor: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
});

export function createLedgerRoutes(jwtSecret: string) {
  const router = Router();
  const projector = new Projector();
  const eventStore = new EventStoreRepo(projector);
  const commandDedup = new CommandDedupRepo();
  const projectionsRepo = new ProjectionsRepo();

  const createAccountUseCase = new CreateAccountUseCase(eventStore, commandDedup);
  const recordIncomeUseCase = new RecordIncomeUseCase(eventStore, commandDedup);
  const recordExpenseUseCase = new RecordExpenseUseCase(eventStore, commandDedup);
  const transferUseCase = new TransferUseCase(eventStore, commandDedup);
  const queries = new LedgerQueries(projectionsRepo);

  // All routes require authentication
  router.use(authMiddleware(jwtSecret));

  // Create account
  router.post(
    '/accounts',
    validate({ body: createAccountBodySchema }),
    async (req: AuthRequest, res, next) => {
      try {
        const result = await createAccountUseCase.execute({
          userId: req.userId!,
          name: req.body.name,
          currency: req.body.currency,
          allowNegative: req.body.allowNegative,
          idempotencyKey: randomUUID(),
        });
        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  // List accounts
  router.get('/accounts', async (req: AuthRequest, res, next) => {
    try {
      const accounts = await queries.getAccounts(req.userId!);
      res.json(accounts);
    } catch (error) {
      next(error);
    }
  });

  // Get account
  router.get('/accounts/:id', async (req: AuthRequest, res, next) => {
    try {
      const account = await queries.getAccount(req.params.id, req.userId!);
      if (!account) {
        res.status(404).json({ code: 'NOT_FOUND', message: 'Account not found' });
        return;
      }
      res.json(account);
    } catch (error) {
      next(error);
    }
  });

  // Record income
  router.post(
    '/accounts/:id/income',
    validate({
      params: recordIncomeParamsSchema,
      body: recordIncomeBodySchema,
    }),
    async (req: AuthRequest, res, next) => {
      try {
        const result = await recordIncomeUseCase.execute({
          userId: req.userId!,
          accountId: req.params.id,
          amountCents: req.body.amountCents,
          occurredAt: new Date(req.body.occurredAt),
          description: req.body.description,
          idempotencyKey: randomUUID(),
        });
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  // Record expense
  router.post(
    '/accounts/:id/expense',
    validate({
      params: recordExpenseParamsSchema,
      body: recordExpenseBodySchema,
    }),
    async (req: AuthRequest, res, next) => {
      try {
        const result = await recordExpenseUseCase.execute({
          userId: req.userId!,
          accountId: req.params.id,
          amountCents: req.body.amountCents,
          occurredAt: new Date(req.body.occurredAt),
          description: req.body.description,
          idempotencyKey: randomUUID(),
        });
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  // Transfer
  router.post(
    '/transfers',
    validate({ body: transferBodySchema }),
    async (req: AuthRequest, res, next) => {
      try {
        const result = await transferUseCase.execute({
          userId: req.userId!,
          fromAccountId: req.body.fromAccountId,
          toAccountId: req.body.toAccountId,
          amountCents: req.body.amountCents,
          occurredAt: new Date(req.body.occurredAt),
          description: req.body.description,
          idempotencyKey: randomUUID(),
        });
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get movements
  router.get(
    '/accounts/:id/movements',
    validate({
      params: getMovementsParamsSchema,
      query: getMovementsQuerySchema,
    }),
    async (req: AuthRequest, res, next) => {
      try {
        const result = await queries.getMovements(
          req.params.id,
          req.userId!,
          req.query.limit as number | undefined,
          req.query.cursor as number | undefined
        );
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  // CSV export
  router.get('/accounts/:id/movements.csv', async (req: AuthRequest, res, next) => {
    try {
      const account = await queries.getAccount(req.params.id, req.userId!);
      if (!account) {
        res.status(404).json({ code: 'NOT_FOUND', message: 'Account not found' });
        return;
      }

      const { movements } = await queries.getMovements(req.params.id, req.userId!, 10000);

      // Generate CSV
      const csvHeader = 'Date,Type,Amount,Description\n';
      const csvRows = movements
        .map((m) => {
          const date = m.occurredAt.toISOString().split('T')[0];
          const type = m.kind;
          const amount = (m.amountCents / 100).toFixed(2);
          const description = (m.description || '').replace(/"/g, '""'); // Escape quotes
          return `${date},${type},${amount},"${description}"`;
        })
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="movements-${account.name.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.csv"`
      );
      res.send(csvHeader + csvRows);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

