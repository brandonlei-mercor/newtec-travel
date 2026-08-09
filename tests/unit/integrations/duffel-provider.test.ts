import { afterEach, describe, expect, it, vi } from "vitest";
import { DuffelClient } from "../../../src/server/integrations/duffel-client";
import { DuffelFlightSearchProvider } from "../../../src/server/integrations/duffel-flight-search";
import { AppError } from "../../../src/shared/errors";
import type { FlightOffersQuery } from "../../../src/shared/contracts/search";

const ACCESS_TOKEN = "duffel_test_notARealSecret000000";

const query: FlightOffersQuery = {
  origin: "SFO",
  destination: "SGN",
  tripType: "ROUND_TRIP",
  departureDate: "2026-09-10",
  returnDate: "2026-09-24",
  adults: 1,
  children: 0,
  infants: 0,
  cabin: "ECONOMY"
};

function offerPayload(totalAmount: string): unknown {
  return {
    data: {
      offers: [
        {
          id: `off_0000AZgFtSSCwGm3sEgVsW${totalAmount.replace(".", "")}`,
          total_amount: totalAmount,
          total_currency: "USD",
          slices: [
            {
              duration: "PT16H35M",
              segments: [
                {
                  origin: { iata_code: "SFO" },
                  destination: { iata_code: "SGN" },
                  departing_at: "2026-09-10T22:15:00",
                  arriving_at: "2026-09-12T05:50:00",
                  duration: "PT16H35M",
                  marketing_carrier: { iata_code: "VN" },
                  marketing_carrier_flight_number: "99",
                  operating_carrier: { iata_code: "VN" },
                  passengers: [{ cabin_class: "economy" }]
                }
              ]
            },
            {
              duration: "PT13H35M",
              segments: [
                {
                  origin: { iata_code: "SGN" },
                  destination: { iata_code: "SFO" },
                  departing_at: "2026-09-24T19:50:00",
                  arriving_at: "2026-09-24T19:25:00",
                  duration: "PT13H35M",
                  marketing_carrier: { iata_code: "VN" },
                  marketing_carrier_flight_number: "98",
                  operating_carrier: { iata_code: "VN" },
                  passengers: [{ cabin_class: "economy" }]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

type Call = { url: string; init: RequestInit };

function stubClient(
  responses: Array<() => Response>,
  calls: Call[] = []
): { client: DuffelClient; calls: Call[] } {
  let index = 0;
  const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses[Math.min(index++, responses.length - 1)];
    if (!next) throw new Error("stub ran out of responses");
    return next();
  }) as unknown as typeof fetch;

  return {
    client: new DuffelClient({
      accessToken: ACCESS_TOKEN,
      apiUrl: "https://api.duffel.test/",
      supplierTimeoutMs: 5_000,
      fetchImplementation,
      sleep: async () => {},
      paced: false
    }),
    calls
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("DuffelClient request shape", () => {
  it("posts a versioned, authenticated offer request", async () => {
    const calls: Call[] = [];
    const { client } = stubClient([() => jsonResponse(offerPayload("1284.60"))], calls);
    await new DuffelFlightSearchProvider(client).searchOffers(query);

    const call = calls[0];
    expect(call?.url).toBe(
      "https://api.duffel.test/air/offer_requests?return_offers=true&supplier_timeout=5000"
    );
    expect(call?.init.method).toBe("POST");
    const headers = call?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers["Duffel-Version"]).toBe("v2");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);

    const body: unknown = JSON.parse(String(call?.init.body));
    expect(body).toEqual({
      data: {
        slices: [
          { origin: "SFO", destination: "SGN", departure_date: "2026-09-10" },
          { origin: "SGN", destination: "SFO", departure_date: "2026-09-24" }
        ],
        passengers: [{ type: "adult" }],
        cabin_class: "economy",
        max_connections: 1
      }
    });
  });
});

describe("DuffelClient failure handling", () => {
  it("retries a rate-limited request and succeeds", async () => {
    const calls: Call[] = [];
    const { client } = stubClient(
      [
        () =>
          jsonResponse({ errors: [{ code: "rate_limit_exceeded" }] }, 429, { "retry-after": "1" }),
        () => jsonResponse(offerPayload("1284.60"))
      ],
      calls
    );
    const offers = await new DuffelFlightSearchProvider(client).searchOffers(query);
    expect(calls).toHaveLength(2);
    expect(offers).toHaveLength(1);
  });

  it("gives up after three attempts on a persistent server error", async () => {
    const calls: Call[] = [];
    const { client } = stubClient([() => jsonResponse({ errors: [] }, 503)], calls);
    await expect(new DuffelFlightSearchProvider(client).searchOffers(query)).rejects.toThrowError(
      /HTTP 503/
    );
    expect(calls).toHaveLength(3);
  });

  it("does not retry a client error", async () => {
    const calls: Call[] = [];
    const { client } = stubClient(
      [
        () =>
          jsonResponse(
            {
              errors: [{ code: "invalid_request", title: "Invalid slice" }],
              meta: { request_id: "req_123" }
            },
            422
          )
      ],
      calls
    );
    await expect(new DuffelFlightSearchProvider(client).searchOffers(query)).rejects.toThrowError(
      /HTTP 422/
    );
    expect(calls).toHaveLength(1);
  });

  it("surfaces Duffel's error code and request id without the payload", async () => {
    const { client } = stubClient([
      () =>
        jsonResponse(
          {
            errors: [{ code: "invalid_request", title: "Invalid slice", message: "detail" }],
            meta: { request_id: "req_123" }
          },
          422
        )
    ]);
    const error = await new DuffelFlightSearchProvider(client)
      .searchOffers(query)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.code).toBe("INTEGRATION_ERROR");
    expect(appError.details).toMatchObject({
      status: 422,
      duffelCode: "invalid_request",
      duffelTitle: "Invalid slice",
      requestId: "req_123"
    });
  });

  it("names the remedy for a read-only token instead of reporting a bare 403", async () => {
    const calls: Call[] = [];
    const { client } = stubClient(
      [
        () =>
          jsonResponse(
            {
              errors: [{ code: "insufficient_permissions", title: "Insufficient permissions" }],
              meta: { request_id: "req_403" }
            },
            403
          )
      ],
      calls
    );
    const error = await new DuffelFlightSearchProvider(client)
      .searchOffers(query)
      .catch((caught: unknown) => caught);

    const appError = error as AppError;
    expect(appError.message).toMatch(/read-only/);
    expect(appError.message).toMatch(/read-write token/);
    expect(appError.details).toMatchObject({ status: 403, duffelCode: "insufficient_permissions" });
    // A permission problem is configuration, so retrying it only burns quota.
    expect(calls).toHaveLength(1);
  });

  it("never leaks the access token through a thrown error", async () => {
    const { client } = stubClient([
      () => jsonResponse({ errors: [{ code: "unauthorized" }] }, 401)
    ]);
    const error = await new DuffelFlightSearchProvider(client)
      .searchOffers(query)
      .catch((caught: unknown) => caught);

    const appError = error as AppError;
    const serialized = JSON.stringify({
      message: appError.message,
      stack: appError.stack,
      details: appError.details
    });
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain("duffel_test_");
    expect(serialized).not.toContain("Bearer");
  });

  it("maps a network failure without attaching the original request", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed to https://api.duffel.test with Bearer duffel_test_x");
    }) as unknown as typeof fetch;
    const client = new DuffelClient({
      accessToken: ACCESS_TOKEN,
      apiUrl: "https://api.duffel.test",
      supplierTimeoutMs: 5_000,
      fetchImplementation: failing,
      sleep: async () => {},
      paced: false
    });
    const error = await new DuffelFlightSearchProvider(client)
      .searchOffers(query)
      .catch((caught: unknown) => caught);

    const appError = error as AppError;
    expect(appError.message).toBe("Duffel request did not complete");
    expect(JSON.stringify(appError.details)).not.toContain("duffel_test_");
  });
});

describe("DuffelClient rate limiting", () => {
  it("waits out the window Duffel names in ratelimit-reset", async () => {
    // Duffel sends an HTTP-date, not retry-after. Backing off exponentially
    // from 400ms would retry inside the same rejected minute and fail.
    const nowMs = Date.parse("2026-08-09T04:03:13Z");
    const slept: number[] = [];
    let call = 0;
    const fetchImplementation = (async () => {
      call += 1;
      return call === 1
        ? jsonResponse({ errors: [{ code: "rate_limit_exceeded" }] }, 429, {
            "ratelimit-limit": "10",
            "ratelimit-remaining": "0",
            "ratelimit-reset": "Sun, 09 Aug 2026 04:04:00 GMT"
          })
        : jsonResponse(offerPayload("1284.60"));
    }) as unknown as typeof fetch;

    const client = new DuffelClient({
      accessToken: ACCESS_TOKEN,
      apiUrl: "https://api.duffel.test",
      supplierTimeoutMs: 5_000,
      fetchImplementation,
      sleep: async (milliseconds) => {
        slept.push(milliseconds);
      },
      now: () => nowMs,
      paced: false
    });

    const offers = await new DuffelFlightSearchProvider(client).searchOffers(query);
    expect(offers).toHaveLength(1);
    // 47s to the boundary plus the 1s buffer, not a sub-second exponential step.
    expect(slept).toEqual([48_000]);
  });

  it("prefers retry-after when Duffel sends one, and caps the wait", async () => {
    const slept: number[] = [];
    let call = 0;
    const fetchImplementation = (async () => {
      call += 1;
      return call === 1
        ? jsonResponse({ errors: [] }, 429, { "retry-after": "9999" })
        : jsonResponse(offerPayload("1284.60"));
    }) as unknown as typeof fetch;

    const client = new DuffelClient({
      accessToken: ACCESS_TOKEN,
      apiUrl: "https://api.duffel.test",
      supplierTimeoutMs: 5_000,
      fetchImplementation,
      sleep: async (milliseconds) => {
        slept.push(milliseconds);
      },
      paced: false
    });

    await new DuffelFlightSearchProvider(client).searchOffers(query);
    // A hostile or buggy header must not park the sweep for hours.
    expect(slept).toEqual([70_000]);
  });

  it("paces successive searches to Duffel's allowance", async () => {
    const slept: number[] = [];
    let nowMs = 0;
    const fetchImplementation = (async () =>
      jsonResponse(offerPayload("1284.60"))) as unknown as typeof fetch;

    const client = new DuffelClient({
      accessToken: ACCESS_TOKEN,
      apiUrl: "https://api.duffel.test",
      supplierTimeoutMs: 5_000,
      fetchImplementation,
      sleep: async (milliseconds) => {
        slept.push(milliseconds);
        nowMs += milliseconds;
      },
      now: () => nowMs
    });

    const provider = new DuffelFlightSearchProvider(client);
    for (let search = 0; search < 4; search += 1) {
      await provider.searchOffers(query);
    }

    // Four searches: the first goes immediately, the rest are spaced to 8/min.
    expect(slept).toEqual([7_500, 7_500, 7_500]);
  });
});

describe("createFlightSearchProvider with Duffel configured", () => {
  it("builds a Duffel provider from the environment", async () => {
    vi.stubEnv("FLIGHT_SEARCH_PROVIDER", "duffel");
    vi.stubEnv("DUFFEL_ACCESS_TOKEN", ACCESS_TOKEN);
    vi.resetModules();

    const { createFlightSearchProvider } =
      await import("../../../src/server/integrations/flight-search");
    const duffelModule = await import("../../../src/server/integrations/duffel-flight-search");
    expect(createFlightSearchProvider()).toBeInstanceOf(duffelModule.DuffelFlightSearchProvider);

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("refuses a Duffel test token in production", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("ADMIN_PASSWORD", "a-real-administration-password");
    vi.stubEnv("FLIGHT_SEARCH_PROVIDER", "duffel");
    vi.stubEnv("DUFFEL_ACCESS_TOKEN", ACCESS_TOKEN);
    vi.resetModules();

    await expect(import("../../../src/shared/env")).rejects.toThrowError(
      /test access token is forbidden in production/
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
