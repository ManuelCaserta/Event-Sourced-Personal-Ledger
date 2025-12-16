import { Router } from 'express';
import { z } from 'zod';
import { RegisterUseCase } from '../../../application/auth/register.js';
import { LoginUseCase } from '../../../application/auth/login.js';
import { UserRepo } from '../../../infra/db/userRepo.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and receive JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Authenticated
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function createAuthRoutes(jwtSecret: string) {
  const router = Router();
  const userRepo = new UserRepo();
  const registerUseCase = new RegisterUseCase(userRepo);
  const loginUseCase = new LoginUseCase(userRepo, jwtSecret);

  router.post(
    '/register',
    validate({ body: registerBodySchema }),
    asyncHandler(async (req, res) => {
      const body = registerBodySchema.parse(req.body);
      const result = await registerUseCase.execute(body);
      res.status(201).json(result);
    })
  );

  router.post(
    '/login',
    loginRateLimiter,
    validate({ body: loginBodySchema }),
    asyncHandler(async (req, res) => {
      const body = loginBodySchema.parse(req.body);
      const result = await loginUseCase.execute(body);
      res.status(200).json(result);
    })
  );

  return router;
}

