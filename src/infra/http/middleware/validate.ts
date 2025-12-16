import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import type { ErrorResponse } from './errorHandler.js';

export interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Zod validation middleware.
 * Validates request body, params, and query against provided schemas.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body) as unknown as typeof req.body;
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as unknown as typeof req.params;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as unknown as typeof req.query;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const body: ErrorResponse = {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: {
            issues: error.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        };
        res.status(400).json(body);
        return;
      }
      next(error);
    }
  };
}

