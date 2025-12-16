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
import { asyncHandler } from '../middleware/asyncHandler.js';
import { randomUUID } from 'crypto';

/**
 * @openapi
 * /api/accounts:
 *   post:
 *     tags: [Accounts]
 *     summary: Create an account
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, currency, allowNegative]
 *             properties:
 *               name: { type: string, example: "Checking" }
 *               currency: { type: string, example: "USD" }
 *               allowNegative: { type: boolean, example: false }
 *     responses:
 *       201:
 *         description: Created
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
 *       409:
 *         description: Conflict (idempotency or concurrency)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 *   get:
 *     tags: [Accounts]
 *     summary: List accounts
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /api/accounts/{id}:
 *   get:
 *     tags: [Accounts]
 *     summary: Get account details
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: OK
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
 * /api/accounts/{id}/movements:
 *   get:
 *     tags: [Movements]
 *     summary: Get account movements (paginated)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, example: 50 }
 *       - in: query
 *         name: cursor
 *         required: false
 *         schema: { type: integer, example: 123 }
 *     responses:
 *       200:
 *         description: OK
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /api/accounts/{id}/movements.csv:
 *   get:
 *     tags: [Movements]
 *     summary: Export account movements as CSV
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
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
  // Accept query params as strings (from Express) or numbers (if previously parsed)
  limit: z.coerce.number().int().optional().default(50),
  cursor: z.coerce.number().int().optional(),
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
    asyncHandler(async (req: AuthRequest, res) => {
      const body = createAccountBodySchema.parse(req.body);
      const result = await createAccountUseCase.execute({
        userId: req.userId!,
        name: body.name,
        currency: body.currency,
        allowNegative: body.allowNegative,
        idempotencyKey: randomUUID(),
      });
      res.status(201).json(result);
    })
  );

  // List accounts
  router.get(
    '/accounts',
    asyncHandler(async (req: AuthRequest, res) => {
      const accounts = await queries.getAccounts(req.userId!);
      res.json(accounts);
    })
  );

  // Get account
  router.get(
    '/accounts/:id',
    asyncHandler(async (req: AuthRequest, res) => {
      const account = await queries.getAccount(req.params.id, req.userId!);
      if (!account) {
        res.status(404).json({ code: 'NOT_FOUND', message: 'Account not found' });
        return;
      }
      res.json(account);
    })
  );

  // Record income
  router.post(
    '/accounts/:id/income',
    validate({
      params: recordIncomeParamsSchema,
      body: recordIncomeBodySchema,
    }),
    asyncHandler(async (req: AuthRequest, res) => {
      const params = recordIncomeParamsSchema.parse(req.params);
      const body = recordIncomeBodySchema.parse(req.body);
      const result = await recordIncomeUseCase.execute({
        userId: req.userId!,
        accountId: params.id,
        amountCents: body.amountCents,
        occurredAt: new Date(body.occurredAt),
        description: body.description,
        idempotencyKey: randomUUID(),
      });
      res.json(result);
    })
  );

  // Record expense
  router.post(
    '/accounts/:id/expense',
    validate({
      params: recordExpenseParamsSchema,
      body: recordExpenseBodySchema,
    }),
    asyncHandler(async (req: AuthRequest, res) => {
      const params = recordExpenseParamsSchema.parse(req.params);
      const body = recordExpenseBodySchema.parse(req.body);
      const result = await recordExpenseUseCase.execute({
        userId: req.userId!,
        accountId: params.id,
        amountCents: body.amountCents,
        occurredAt: new Date(body.occurredAt),
        description: body.description,
        idempotencyKey: randomUUID(),
      });
      res.json(result);
    })
  );

  // Transfer
  router.post(
    '/transfers',
    validate({ body: transferBodySchema }),
    asyncHandler(async (req: AuthRequest, res) => {
      const body = transferBodySchema.parse(req.body);
      const result = await transferUseCase.execute({
        userId: req.userId!,
        fromAccountId: body.fromAccountId,
        toAccountId: body.toAccountId,
        amountCents: body.amountCents,
        occurredAt: new Date(body.occurredAt),
        description: body.description,
        idempotencyKey: randomUUID(),
      });
      res.json(result);
    })
  );

  // Get movements
  router.get(
    '/accounts/:id/movements',
    validate({
      params: getMovementsParamsSchema,
      query: getMovementsQuerySchema,
    }),
    asyncHandler(async (req: AuthRequest, res) => {
      const params = getMovementsParamsSchema.parse(req.params);
      const query = getMovementsQuerySchema.parse(req.query);
      const result = await queries.getMovements(params.id, req.userId!, query.limit, query.cursor);
      res.json(result);
    })
  );

  // CSV export
  router.get(
    '/accounts/:id/movements.csv',
    asyncHandler(async (req: AuthRequest, res) => {
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
    })
  );

  return router;
}

