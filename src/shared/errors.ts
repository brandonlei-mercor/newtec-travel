export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "ORIGIN_NOT_ALLOWED"
  | "INTEGRATION_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested record was not found") {
    super("NOT_FOUND", message, 404);
  }
}
