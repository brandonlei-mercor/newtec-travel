export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409 | 422,
    message = code,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DomainError";
  }
}
