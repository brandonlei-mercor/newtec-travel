import { AppError } from "../../shared/errors";

/**
 * Minimal Duffel Flights API client. Only the shopping surface is implemented:
 * this app never books through Duffel, so there is deliberately no Orders,
 * payments, or passenger-identity path here. See ADR 0002.
 */

const DUFFEL_VERSION = "v2";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;
const RETRY_MAX_DELAY_MS = 8_000;
/** A quota wait must be able to cross a one-minute window; a 5xx retry must not. */
const RATE_LIMIT_MAX_DELAY_MS = 70_000;
const RATE_LIMIT_BUFFER_MS = 1_000;
/** Wall-clock ceiling per attempt; must exceed the supplier timeout Duffel is given. */
const REQUEST_TIMEOUT_HEADROOM_MS = 10_000;
/*
 * Duffel's measured allowance is 10 offer requests per wall-clock minute. Pace
 * below it: the pacer is per-process, so a worker sweep and a customer's live
 * search draw on the same quota without seeing each other, and a sweep pinned
 * to exactly 10 would starve interactive searches.
 */
const OFFER_REQUESTS_PER_MINUTE = 8;
const PACING_INTERVAL_MS = Math.ceil(60_000 / OFFER_REQUESTS_PER_MINUTE);

export type DuffelPassengerType = "adult" | "child" | "infant_without_seat";
export type DuffelCabinClass = "economy" | "premium_economy" | "business" | "first";

export type DuffelOfferRequestBody = {
  data: {
    slices: Array<{ origin: string; destination: string; departure_date: string }>;
    passengers: Array<{ type: DuffelPassengerType }>;
    cabin_class: DuffelCabinClass;
    max_connections: number;
  };
};

export type DuffelClientOptions = {
  accessToken: string;
  apiUrl: string;
  supplierTimeoutMs: number;
  /** Injected in tests; defaults to the platform fetch. */
  fetchImplementation?: typeof fetch;
  /** Injected in tests so retry backoff does not actually wait. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Injected in tests; defaults to Date.now. */
  now?: () => number;
  /** Disabled in tests that assert call counts without wall-clock pacing. */
  paced?: boolean;
};

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function integrationError(message: string, details?: Record<string, unknown>): AppError {
  return new AppError("INTEGRATION_ERROR", message, 502, details);
}

/*
 * Duffel codes whose remedy is configuration, not a retry. A read-only token
 * authenticates cleanly and then fails every search, because a search creates
 * an offer request and that is a write. Reported as a bare status it reads like
 * an upstream outage, so name the fix at the point of failure.
 */
const CONFIGURATION_HINTS: Record<string, string> = {
  insufficient_permissions:
    "the Duffel access token is read-only. A search creates an offer request, which is a write, so mint a read-write token."
};

/** Duffel error envelope: `{ errors: [{ code, title }], meta: { request_id } }`. */
function describeFailure(status: number, body: string): AppError {
  let code: unknown;
  let title: unknown;
  let requestId: unknown;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const envelope = parsed as { errors?: unknown; meta?: unknown };
      const first = Array.isArray(envelope.errors) ? envelope.errors[0] : undefined;
      if (first && typeof first === "object") {
        code = (first as { code?: unknown }).code;
        title = (first as { title?: unknown }).title;
      }
      if (envelope.meta && typeof envelope.meta === "object") {
        requestId = (envelope.meta as { request_id?: unknown }).request_id;
      }
    }
  } catch {
    // A non-JSON body (gateway HTML, truncated response) carries nothing we
    // want to surface; the status alone is the diagnosis.
  }
  const hint = typeof code === "string" ? CONFIGURATION_HINTS[code] : undefined;
  // Only the status, Duffel's own error code/title, and the request id are
  // echoed. The request body and full response are never included, so an
  // access token or provider payload can never reach a log or an API response.
  return integrationError(`Duffel request failed with HTTP ${status}${hint ? `: ${hint}` : ""}`, {
    status,
    duffelCode: typeof code === "string" ? code : undefined,
    duffelTitle: typeof title === "string" ? title : undefined,
    requestId: typeof requestId === "string" ? requestId : undefined
  });
}

/*
 * Duffel allows 10 offer requests per wall-clock minute and reports the window
 * with `ratelimit-reset`, an HTTP-date, rather than `retry-after`. Backing off
 * exponentially from 400ms lands all three attempts inside the same rejected
 * minute, so a 429 needs a delay long enough to cross the boundary.
 */
function retryDelayMs(attempt: number, response: Response | null, nowMs: number): number {
  if (response) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.min(retryAfterSeconds * 1000, RATE_LIMIT_MAX_DELAY_MS);
    }
    const resetAtMs = Date.parse(response.headers.get("ratelimit-reset") ?? "");
    if (Number.isFinite(resetAtMs)) {
      const waitMs = resetAtMs - nowMs + RATE_LIMIT_BUFFER_MS;
      if (waitMs > 0) return Math.min(waitMs, RATE_LIMIT_MAX_DELAY_MS);
    }
  }
  const ceiling = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  // Full jitter: spreads a calendar sweep's retries instead of resynchronising them.
  return Math.round(ceiling * (0.5 + Math.random() * 0.5));
}

export class DuffelClient {
  private readonly accessToken: string;
  private readonly apiUrl: string;
  private readonly supplierTimeoutMs: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly paced: boolean;
  /** Serialises the pacer so concurrent callers queue instead of racing. */
  private pacingGate: Promise<void> = Promise.resolve();
  private nextSlotMs = 0;

  constructor(options: DuffelClientOptions) {
    if (!options.accessToken) throw new Error("DuffelClient requires an access token");
    this.accessToken = options.accessToken;
    this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.supplierTimeoutMs = options.supplierTimeoutMs;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.paced = options.paced ?? true;
  }

  /*
   * Spaces requests to Duffel's allowance. Retrying into a 429 still works, but
   * a sweep that never trips the limit finishes sooner than one that backs off
   * for a minute at a time, and it leaves headroom for a customer's live search.
   */
  private async awaitPacingSlot(): Promise<void> {
    if (!this.paced) return;
    const wait = this.pacingGate.then(async () => {
      const delay = this.nextSlotMs - this.now();
      if (delay > 0) await this.sleep(delay);
      this.nextSlotMs = Math.max(this.nextSlotMs, this.now()) + PACING_INTERVAL_MS;
    });
    // Swallow here only; the awaited copy still rejects to the caller.
    this.pacingGate = wait.catch(() => {});
    await wait;
  }

  /**
   * Creates an offer request and returns the raw JSON envelope. Mapping and
   * validation happen in the caller so nothing unmodelled escapes this layer.
   */
  async createOfferRequest(body: DuffelOfferRequestBody): Promise<unknown> {
    const url = `${this.apiUrl}/air/offer_requests?return_offers=true&supplier_timeout=${this.supplierTimeoutMs}`;
    let lastFailure: AppError | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await this.awaitPacingSlot();
      let response: Response;
      try {
        response = await this.fetchImplementation(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Duffel-Version": DUFFEL_VERSION,
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.supplierTimeoutMs + REQUEST_TIMEOUT_HEADROOM_MS)
        });
      } catch (cause) {
        // Network failure or timeout. The cause is deliberately not attached:
        // a fetch error can echo the full request, headers included.
        lastFailure = integrationError("Duffel request did not complete", {
          reason: cause instanceof Error ? cause.name : "unknown"
        });
        if (attempt === MAX_ATTEMPTS) break;
        await this.sleep(retryDelayMs(attempt, null, this.now()));
        continue;
      }

      if (response.ok) {
        return (await response.json()) as unknown;
      }

      const failureBody = await response.text().catch(() => "");
      lastFailure = describeFailure(response.status, failureBody);

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await this.sleep(retryDelayMs(attempt, response, this.now()));
    }

    throw lastFailure ?? integrationError("Duffel request failed");
  }
}
