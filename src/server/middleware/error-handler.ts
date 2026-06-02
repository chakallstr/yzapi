import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";
import { AppError, RateLimitError } from "../lib/errors.js";
import { recordRateLimited, recordUnhandled } from "../services/gozcu/metrics-collector.js";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as any).id ?? "unknown";
  const parseError = err as Error & { status?: number; type?: string };

  if (parseError.status === 400 && parseError.type === "entity.parse.failed") {
    logger.warn({ requestId }, "Invalid JSON body");
    res.status(400).json({
      error: "Invalid JSON body",
      code: 400,
      requestId,
    });
    return;
  }

  if (err instanceof RateLimitError) {
    recordRateLimited(); // Gözcü: rate_limit_hit_spike sinyali
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
  recordUnhandled(); // Gözcü: unhandled_error_spike sinyali
  res.status(500).json({ error: "Internal Server Error", code: 500, requestId });
}
