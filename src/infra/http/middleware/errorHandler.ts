import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error (in production, use proper logger)
  console.error('Error:', err);

  // Handle known error types
  if (err.message.includes('already exists')) {
    res.status(409).json({ error: err.message });
    return;
  }

  if (err.message.includes('Invalid email or password')) {
    res.status(401).json({ error: err.message });
    return;
  }

  if (err.message.includes('not found')) {
    res.status(404).json({ error: err.message });
    return;
  }

  // Generic error
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}

