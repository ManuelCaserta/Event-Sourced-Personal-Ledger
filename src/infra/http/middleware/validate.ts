import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

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
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}

