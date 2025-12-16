import { Request, Response, NextFunction } from 'express';
import {
  CurrencyImmutableError,
  CurrencyMismatchError,
  InsufficientBalanceError,
  InvalidAmountError,
  InvalidCurrencyError,
} from '../../../domain/ledger/errors.js';
import { ConcurrencyError } from '../../db/eventStoreRepo.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../../application/errors.js';

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

  // Application-level errors
  if (err instanceof UnauthorizedError) {
    const body: ErrorResponse = { code: 'UNAUTHORIZED', message: err.message };
    res.status(401).json(body);
    return;
  }

  if (err instanceof NotFoundError) {
    const body: ErrorResponse = { code: 'NOT_FOUND', message: err.message };
    res.status(404).json(body);
    return;
  }

  if (err instanceof ConflictError) {
    const body: ErrorResponse = { code: 'CONFLICT', message: err.message };
    res.status(409).json(body);
    return;
  }

  // Domain errors
  if (err instanceof InvalidAmountError) {
    const body: ErrorResponse = { code: 'INVALID_AMOUNT', message: err.message };
    res.status(400).json(body);
    return;
  }

  if (err instanceof InvalidCurrencyError) {
    const body: ErrorResponse = { code: 'INVALID_CURRENCY', message: err.message };
    res.status(400).json(body);
    return;
  }

  if (err instanceof CurrencyMismatchError) {
    const body: ErrorResponse = { code: 'CURRENCY_MISMATCH', message: err.message };
    res.status(400).json(body);
    return;
  }

  if (err instanceof CurrencyImmutableError) {
    const body: ErrorResponse = { code: 'CURRENCY_IMMUTABLE', message: err.message };
    res.status(400).json(body);
    return;
  }

  if (err instanceof InsufficientBalanceError) {
    const body: ErrorResponse = { code: 'INSUFFICIENT_BALANCE', message: err.message };
    res.status(409).json(body);
    return;
  }

  // Concurrency
  if (err instanceof ConcurrencyError) {
    const body: ErrorResponse = {
      code: 'CONCURRENCY_CONFLICT',
      message: err.message,
      details: {
        expectedVersion: err.expectedVersion,
        actualVersion: err.actualVersion,
      },
    };
    res.status(409).json(body);
    return;
  }

  // Generic error
  const body: ErrorResponse = {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? { message: err.message } : undefined,
  };
  res.status(500).json(body);
}

