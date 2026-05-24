import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";
import { AppError, RateLimitError } from "../lib/errors.js";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as any).id ?? "unknown";

  if (err instanceof RateLimitError) {
    if (err.retryAfter !== undefined) {
      res.setHeader("Retry-After", String(err.retryAfter));
    }
    logger.warn({ requestId, retryAfter: err.retryAfter }, err.message);
    res.status(429).json({
      error: err.message,
      code: 429,
      requestId,
      retryAfter: err.retryAfter,
    });
    return;
  }

  if (err instanceof AppError) {
    logger.error({ err, requestId, statusCode: err.statusCode }, err.message);
    res.status(err.statusCode).json({
      error: err.message,
      code: err.statusCode,
      requestId,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  logger.error({ err, requestId }, "Unhandled error");
  res.status(500).json({ error: "Internal Server Error", code: 500, requestId });
}
