import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAuthRoutes } from '../routes/auth.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { pool } from '../../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Auth API', () => {
  let app: express.Application;
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  const uniqueEmail = (label: string) =>
    `vitest-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRoutes(JWT_SECRET));

    // Protected route for testing
    app.get(
      '/api/protected',
      authMiddleware(JWT_SECRET),
      (req: AuthRequest, res) => {
        res.json({ userId: req.userId, email: req.userEmail });
      }
    );

    app.use(errorHandler);
  });

  afterEach(async () => {
    // Clean up test users
    await pool.query("DELETE FROM users WHERE email LIKE 'vitest-%@example.com'");
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const email = uniqueEmail('newuser');
      const response = await request(app).post('/api/auth/register').send({
        email,
        password: 'password123',
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('email', email);
    });

    it('should reject invalid email', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'invalid-email',
        password: 'password123',
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(response.body).toHaveProperty('message', 'Validation failed');
    });

    it('should reject short password', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'user@example.com',
        password: 'short',
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(response.body).toHaveProperty('message', 'Validation failed');
    });

    it('should reject duplicate email', async () => {
      const email = uniqueEmail('duplicate');
      await request(app).post('/api/auth/register').send({
        email,
        password: 'password123',
      });

      const response = await request(app).post('/api/auth/register').send({
        email,
        password: 'password123',
      });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'CONFLICT');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/auth/login', () => {
    let loginEmail: string;
    beforeEach(async () => {
      // Register a user for login tests
      loginEmail = uniqueEmail('login');
      await request(app).post('/api/auth/register').send({
        email: loginEmail,
        password: 'password123',
      });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: loginEmail,
        password: 'password123',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('email', loginEmail);
    });

    it('should reject invalid email', async () => {
      const email = uniqueEmail('nonexistent');
      const response = await request(app).post('/api/auth/login').send({
        email,
        password: 'password123',
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code', 'UNAUTHORIZED');
      expect(response.body).toHaveProperty('message', 'Invalid email or password');
    });

    it('should reject invalid password', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: loginEmail,
        password: 'wrongpassword',
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code', 'UNAUTHORIZED');
      expect(response.body).toHaveProperty('message', 'Invalid email or password');
    });

    it('should reject invalid email format', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'invalid-email',
        password: 'password123',
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(response.body).toHaveProperty('message', 'Validation failed');
    });
  });

  describe('Protected routes', () => {
    let token: string;
    let userId: string;
    let email: string;

    beforeEach(async () => {
      // Register and login
      email = uniqueEmail('protected');
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'password123',
        });

      userId = registerResponse.body.userId;

      const loginResponse = await request(app).post('/api/auth/login').send({
        email,
        password: 'password123',
      });

      token = loginResponse.body.token;
    });

    it('should allow access with valid JWT', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId', userId);
      expect(response.body).toHaveProperty('email', email);
    });

    it('should reject request without token', async () => {
      const response = await request(app).get('/api/protected');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code', 'UNAUTHORIZED');
      expect(response.body).toHaveProperty('message');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code', 'UNAUTHORIZED');
      expect(response.body).toHaveProperty('message');
    });

    it('should reject request with malformed header', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code', 'UNAUTHORIZED');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Rate limiting', () => {
    it('should enforce rate limit on login', async () => {
      const email = uniqueEmail('ratelimit');
      await request(app).post('/api/auth/register').send({
        email,
        password: 'password123',
      });

      // Make 11 requests (limit is 10)
      const requests = Array.from({ length: 11 }, () =>
        request(app).post('/api/auth/login').send({
          email,
          password: 'wrongpassword',
        })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(
        (r) =>
          r.status === 429 ||
          r.body?.code === 'RATE_LIMITED' ||
          r.text.includes('Too many login attempts')
      );

      // We verify the middleware is in place (429 or RATE_LIMITED).
      expect(rateLimited).toBe(true);
    });
  });
});

