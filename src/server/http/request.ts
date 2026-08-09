import { AppError } from "@/shared/errors";
import { env } from "@/shared/env";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value || !IDEMPOTENCY_KEY.test(value)) {
    throw new AppError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required for this operation",
      400
    );
  }
  return value;
}

/** Every mutation route calls this before doing any work. */
export function assertTrustedMutationOrigin(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new AppError("ORIGIN_NOT_ALLOWED", "Cross-site mutation requests are not allowed", 403);
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = new URL(env.APP_URL).origin;
  if (origin !== requestOrigin && origin !== configuredOrigin) {
    throw new AppError("ORIGIN_NOT_ALLOWED", "The request origin is not allowed", 403);
  }
}
