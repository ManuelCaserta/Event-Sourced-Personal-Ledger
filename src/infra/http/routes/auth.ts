import { Router } from 'express';
import { z } from 'zod';
import { RegisterUseCase } from '../../../application/auth/register.js';
import { LoginUseCase } from '../../../application/auth/login.js';
import { UserRepo } from '../../../infra/db/userRepo.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';

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
    async (req, res, next) => {
      try {
        const result = await registerUseCase.execute(req.body);
        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/login',
    loginRateLimiter,
    validate({ body: loginBodySchema }),
    async (req, res, next) => {
      try {
        const result = await loginUseCase.execute(req.body);
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

