import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter (60 requests per minute per user).
 * Uses in-memory store (resets on server restart).
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per window
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter rate limiter for login endpoint (10 requests per minute per IP).
 */
export const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per window
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Use IP address for login (no user ID available yet)
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
});

