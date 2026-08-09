import { describe, expect, it } from "vitest";
import { composeInquiryNotification } from "@/modules/inquiries/notification";
import type { InquiryRecord } from "@/modules/inquiries/queries";

const submittedAt = new Date("2026-07-01T12:00:00Z");

const inquiry: InquiryRecord = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  reference: "TV-8K3QZP",
  status: "NEW",
  origin: "SFO",
  destination: "SGN",
  tripType: "ROUND_TRIP",
  departureDate: "2026-08-01",
  returnDate: "2026-08-20",
  dateFlexibility: "PLUS_MINUS_1",
  cabin: "ECONOMY",
  adults: 2,
  children: 1,
  infants: 0,
  givenName: "Ana",
  familyName: "Nguyen",
  email: "ana@example.test",
  phone: "(415) 555-0142",
  preferredContactMethod: "PHONE",
  preferredLocale: "vi",
  selectedOffer: "SFO-SGN round trip, flights VN99/VN98, depart 2026-08-01 23:55, ref off_1",
  specialAssistance: null,
  customerNotes: "Prefers a morning departure",
  visaInterest: true,
  marketingConsent: false,
  transactionalConsentAt: submittedAt,
  partyDataAuthorityAt: submittedAt,
  submittedAt,
  contactedAt: null,
  createdAt: submittedAt,
  updatedAt: submittedAt
};

describe("agency notification email", () => {
  it("carries everything needed to call the customer back", () => {
    const message = composeInquiryNotification(inquiry, "newtec@sbcglobal.net");
    expect(message.to).toBe("newtec@sbcglobal.net");
    // Replying in any mail client must answer the customer, not the shared inbox.
    expect(message.replyTo).toBe("ana@example.test");
    expect(message.subject).toContain("TV-8K3QZP");
    expect(message.text).toContain("(415) 555-0142");
    expect(message.text).toContain("ana@example.test");
    expect(message.text).toContain("phone ((415) 555-0142)");
    expect(message.text).toContain("Vietnamese");
    expect(message.text).toContain("Prefers a morning departure");
  });

  /*
   * Whoever calls back reads the route off the subject line, so a request out of
   * Phoenix must not arrive looking like one out of the home airport.
   */
  it("names the departure city the request was made from", () => {
    const message = composeInquiryNotification(
      { ...inquiry, origin: "PHX" },
      "newtec@sbcglobal.net"
    );
    expect(message.subject).toContain("PHX to SGN");
    expect(message.text).toContain("PHX to Ho Chi Minh City (SGN)");
  });

  it("escapes customer text in the HTML body", () => {
    const message = composeInquiryNotification(
      { ...inquiry, customerNotes: '<img src=x onerror="alert(1)">' },
      "newtec@sbcglobal.net"
    );
    expect(message.html).not.toContain("<img");
    expect(message.html).toContain("&lt;img");
  });

  it("refuses to send when a value would forge a header", () => {
    // The contract and a column check reject these first; if one is ever
    // bypassed the mail must not go out rather than go out malformed.
    expect(() =>
      composeInquiryNotification(
        { ...inquiry, email: "ana@example.test\r\nBcc: attacker@example.test" },
        "newtec@sbcglobal.net"
      )
    ).toThrow("HEADER_VALUE_NOT_SINGLE_LINE: replyTo");
    expect(() =>
      composeInquiryNotification({ ...inquiry, givenName: "Ana\nSubject: forged" }, "a@b.test")
    ).toThrow("HEADER_VALUE_NOT_SINGLE_LINE: subject");
  });
});
