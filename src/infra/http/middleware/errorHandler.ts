import { Request, Response, NextFunction } from 'express';
import {
  InvalidAmountError,
  InvalidCurrencyError,
  InsufficientBalanceError,
  CurrencyMismatchError,
  CurrencyImmutableError,
} from '../../../domain/ledger/errors.js';
import { ConcurrencyError } from '../../db/eventStoreRepo.js';
import { NotFoundError, UnauthorizedError, ConflictError } from '../../../application/errors.js';
import { ZodError } from 'zod';

/**
 * Standard error response shape for all API errors.
 */
export interface ErrorResponse {
  code: string;
  message: string;
  details?: object;
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error (in production, use proper logger)
  console.error('Error:', err);

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: {
        issues: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    };
    res.status(400).json(response);
    return;
  }

  // Handle domain errors - InvalidAmountError, InvalidCurrencyError -> 400
  if (err instanceof InvalidAmountError) {
    const response: ErrorResponse = {
      code: 'INVALID_AMOUNT',
      message: err.message,
    };
    res.status(400).json(response);
    return;
  }

  if (err instanceof InvalidCurrencyError) {
    const response: ErrorResponse = {
      code: 'INVALID_CURRENCY',
      message: err.message,
    };
    res.status(400).json(response);
    return;
  }

  // InsufficientBalanceError -> 409
  if (err instanceof InsufficientBalanceError) {
    const response: ErrorResponse = {
      code: 'INSUFFICIENT_BALANCE',
      message: err.message,
    };
    res.status(409).json(response);
    return;
  }

  // CurrencyMismatchError, CurrencyImmutableError -> 400
  if (err instanceof CurrencyMismatchError) {
    const response: ErrorResponse = {
      code: 'CURRENCY_MISMATCH',
      message: err.message,
    };
    res.status(400).json(response);
    return;
  }

  if (err instanceof CurrencyImmutableError) {
    const response: ErrorResponse = {
      code: 'CURRENCY_IMMUTABLE',
      message: err.message,
    };
    res.status(400).json(response);
    return;
  }

  // ConcurrencyError -> 409 with details
  if (err instanceof ConcurrencyError) {
    const response: ErrorResponse = {
      code: 'CONCURRENCY_CONFLICT',
      message: err.message,
      details: {
        expectedVersion: err.expectedVersion,
        actualVersion: err.actualVersion,
      },
    };
    res.status(409).json(response);
    return;
  }

  // Application-level errors
  if (err instanceof UnauthorizedError) {
    const response: ErrorResponse = {
      code: 'UNAUTHORIZED',
      message: err.message,
    };
    res.status(401).json(response);
    return;
  }

  if (err instanceof NotFoundError) {
    const response: ErrorResponse = {
      code: 'NOT_FOUND',
      message: err.message,
    };
    res.status(404).json(response);
    return;
  }

  if (err instanceof ConflictError) {
    const response: ErrorResponse = {
      code: 'CONFLICT',
      message: err.message,
    };
    res.status(409).json(response);
    return;
  }

  // Fallback for unknown errors - check message patterns for backward compatibility
  // (These should eventually be replaced with proper error classes)
  if (err.message.includes('already exists')) {
    const response: ErrorResponse = {
      code: 'CONFLICT',
      message: err.message,
    };
    res.status(409).json(response);
    return;
  }

  if (err.message.includes('Invalid email or password')) {
    const response: ErrorResponse = {
      code: 'UNAUTHORIZED',
      message: err.message,
    };
    res.status(401).json(response);
    return;
  }

  if (err.message.includes('not found')) {
    const response: ErrorResponse = {
      code: 'NOT_FOUND',
      message: err.message,
    };
    res.status(404).json(response);
    return;
  }

  // Generic error fallback
  const response: ErrorResponse = {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  };
  res.status(500).json(response);
}
