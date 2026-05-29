import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export function requestId(req: Request, res: Response, next: NextFunction): void {
  // Billing idempotency depends on req.id, so it MUST be server-generated.
  // A client-supplied X-Request-Id must never become the idempotency key,
  // otherwise a client could replay the same id for unlimited free usage
  // or read another tenant's charge record. Keep the client value as a
  // trace hint only.
  const clientTrace = req.headers["x-request-id"];
  (req as any).clientTraceId = typeof clientTrace === "string" ? clientTrace.slice(0, 200) : undefined;

  const id = uuidv4();
  (req as any).id = id;
  res.setHeader("X-Request-Id", id);
  next();
}
