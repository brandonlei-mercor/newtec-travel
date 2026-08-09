export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = "REQUEST_FAILED") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ErrorPayload = {
  error?: { code?: string; message?: string } | string;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store"
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const errorPayload = isRecord(payload) ? (payload as ErrorPayload) : undefined;
    const nestedError = errorPayload?.error;
    const message =
      (typeof nestedError === "object" ? nestedError?.message : nestedError) ??
      errorPayload?.message ??
      `Request failed (${response.status})`;
    const code = typeof nestedError === "object" ? nestedError?.code : undefined;
    throw new ApiError(message, response.status, code);
  }

  if (isRecord(payload) && "data" in payload) return payload.data as T;
  return payload as T;
}

export function mutationHeaders(expectedVersion?: number): HeadersInit {
  const headers: Record<string, string> = { "Idempotency-Key": crypto.randomUUID() };
  if (expectedVersion !== undefined) headers["If-Match"] = String(expectedVersion);
  return headers;
}
