import type { RequestHandler } from 'express';

/**
 * Wrap an async Express handler so it returns void (no-misused-promises)
 * and forwards errors to next().
 */
export function asyncHandler(
  fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2]) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}


