import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { ErrorResponse } from './errorHandler.js';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export function authMiddleware(jwtSecret: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const body: ErrorResponse = {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      };
      res.status(401).json(body);
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
      req.userId = decoded.userId;
      req.userEmail = decoded.email;
      next();
    } catch (error) {
      const body: ErrorResponse = {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      };
      res.status(401).json(body);
      return;
    }
  };
}

