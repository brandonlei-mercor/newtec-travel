import { describe, expect, it } from "vitest";
import {
  encodeOfferSummary,
  offerSummaryBlock,
  offerSummaryLines,
  parseOfferSummary
} from "@/shared/offer-summary";
import type { FlightOffer } from "@/shared/contracts/search";

const segment = (
  from: string,
  to: string,
  departureLocal: string,
  arrivalLocal: string,
  durationMinutes: number,
  flightNumber: string
) => ({
  originAirport: from,
  destinationAirport: to,
  departureLocal,
  arrivalLocal,
  durationMinutes,
  flightNumber,
  marketingCarrier: "BR",
  marketingCarrierName: "EVA Air",
  operatingCarrier: "BR",
  cabin: "ECONOMY" as const
});

const offer: FlightOffer = {
  offerRef: "off_0000B9DiK9WZ",
  source: "DUFFEL",
  estimated: true,
  // The airline's own total; the quoted $1,091.00 is this plus the service.
  priceTotalMinor: 89_100,
  currency: "USD",
  outbound: {
    segments: [
      segment("SFO", "TPE", "2026-09-09T01:00", "2026-09-10T05:30", 810, "BR27"),
      segment("TPE", "SGN", "2026-09-10T07:20", "2026-09-10T09:55", 155, "BR395")
    ],
    durationMinutes: 1_135
  },
  inbound: {
    segments: [segment("SGN", "SFO", "2026-09-23T12:50", "2026-09-23T16:10", 1_040, "BR396")],
    durationMinutes: 1_040
  }
};

describe("the stored flight", () => {
  it("describes each direction the way the checkout card does", () => {
    const stored = parseOfferSummary(encodeOfferSummary(offer, "ECONOMY"));
    expect(stored).not.toBeNull();
    expect(offerSummaryLines(stored!, "en", "Economy")).toEqual([
      "Economy",
      "Depart Sep 9, 2026 — 01:00 SFO → 09:55+1 SGN",
      "EVA Air · 18h 55m · 1 stop via TPE",
      "Return Sep 23, 2026 — 12:50 SGN → 16:10 SFO",
      "EVA Air · 17h 20m · Nonstop",
      "$1,091.00 total (including the flights, seats, visa, pre-arrival QR code, and everything else in between)"
    ]);
  });

  /*
   * The email draws each direction as a panel with the airline's mark beside
   * it, which needs the pieces apart and the carrier filed under its code.
   */
  it("hands the layout each direction in pieces, with the marks it calls for", () => {
    const stored = parseOfferSummary(encodeOfferSummary(offer, "ECONOMY"));
    const block = offerSummaryBlock(stored!, "en", "Economy");
    expect(block.cabin).toBe("Economy");
    expect(block.total).toBe("$1,091.00");
    expect(block.slices).toEqual([
      {
        label: "Depart",
        date: "Sep 9, 2026",
        times: "01:00 SFO → 09:55+1 SGN",
        detail: "EVA Air · 18h 55m · 1 stop via TPE",
        carriers: ["BR"]
      },
      {
        label: "Return",
        date: "Sep 23, 2026",
        times: "12:50 SGN → 16:10 SFO",
        detail: "EVA Air · 17h 20m · Nonstop",
        carriers: ["BR"]
      }
    ]);
  });

  /*
   * A code that is not the two or three characters IATA issues would name a
   * file, so it never becomes one.
   */
  it("keeps only carrier codes that are shaped like carrier codes", () => {
    const odd: FlightOffer = {
      ...offer,
      outbound: {
        ...offer.outbound,
        segments: [{ ...offer.outbound.segments[0]!, marketingCarrier: "../../etc/passwd" }]
      }
    };
    const stored = parseOfferSummary(encodeOfferSummary(odd, "ECONOMY"));
    expect(stored!.slices[0]!.carriers).toEqual([]);
  });

  /*
   * The customer who reads the mail in Vietnamese chose the same flight, and
   * the words around it are the only part that should change.
   */
  it("says the same thing in Vietnamese", () => {
    const stored = parseOfferSummary(encodeOfferSummary(offer, "ECONOMY"));
    const lines = offerSummaryLines(stored!, "vi", "Phổ thông");
    expect(lines[0]).toBe("Phổ thông");
    expect(lines[1]).toContain("Chiều đi");
    expect(lines[1]).toContain("01:00 SFO → 09:55+1 SGN");
    expect(lines[2]).toBe("EVA Air · 18 giờ 55 phút · 1 điểm dừng qua TPE");
    expect(lines[4]).toContain("Bay thẳng");
    expect(lines[5]).toContain("$1,091.00 trọn gói");
  });

  it("leaves out the return on a one way", () => {
    const oneWay: FlightOffer = { ...offer };
    delete oneWay.inbound;
    const stored = parseOfferSummary(encodeOfferSummary(oneWay, "BUSINESS"));
    const lines = offerSummaryLines(stored!, "en", "Business");
    expect(lines).toHaveLength(4);
    expect(lines.some((line) => line.startsWith("Return"))).toBe(false);
  });

  /*
   * The column reaches the database from the request body, so nothing in it is
   * taken on faith. What does not decode is not half-rendered.
   */
  it("refuses anything that is not a flight it wrote", () => {
    expect(parseOfferSummary("SFO-SGN round trip, flights VN99/VN98, ref off_1")).toBeNull();
    expect(parseOfferSummary("{")).toBeNull();
    expect(parseOfferSummary(JSON.stringify({ v: 2, slices: [] }))).toBeNull();
    expect(
      parseOfferSummary(
        JSON.stringify({
          v: 1,
          cabin: "ECONOMY",
          totalMinor: 1,
          currency: "USD",
          slices: [
            {
              date: "2026-09-09",
              from: "<img src=x>",
              to: "SGN",
              dep: "01:00",
              arr: "09:55",
              plus: 0,
              minutes: 60,
              via: [],
              airlines: ["EVA Air"]
            }
          ]
        })
      )
    ).toBeNull();
  });
});
