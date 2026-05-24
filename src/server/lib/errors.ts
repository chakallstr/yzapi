export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(msg = "Not found") {
    super(404, msg);
  }
}

export class BadRequestError extends AppError {
  constructor(msg: string, d?: unknown) {
    super(400, msg, d);
  }
}

export class UnauthorizedError extends AppError {
  constructor(msg = "Unauthorized") {
    super(401, msg);
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(msg = "Insufficient balance") {
    super(402, msg);
    this.name = "InsufficientBalanceError";
  }
}

export class RateLimitError extends AppError {
  constructor(
    msg = "Rate limit exceeded",
    public retryAfter?: number
  ) {
    super(429, msg);
    this.name = "RateLimitError";
  }
}

export class ModelNotFoundError extends AppError {
  constructor(modelId: string) {
    super(404, `Model not found: ${modelId}`);
    this.name = "ModelNotFoundError";
  }
}

export class ModelDisabledError extends AppError {
  constructor(modelId: string) {
    super(403, `Model disabled: ${modelId}`);
    this.name = "ModelDisabledError";
  }
}
