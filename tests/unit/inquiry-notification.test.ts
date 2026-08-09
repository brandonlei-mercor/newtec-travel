import { describe, expect, it } from "vitest";
import { composeInquiryNotification } from "@/modules/inquiries/notification";
import type { InquiryPassengerRecord, InquiryWithPassengers } from "@/modules/inquiries/queries";

const submittedAt = new Date("2026-07-01T12:00:00Z");

const passenger = (
  position: number,
  type: InquiryPassengerRecord["type"],
  givenName: string,
  dateOfBirth: string
): InquiryPassengerRecord => ({
  id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${position}`,
  inquiryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  position,
  type,
  givenName,
  familyName: "Nguyen",
  dateOfBirth,
  createdAt: submittedAt
});

const inquiry: InquiryWithPassengers = {
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
  passengers: [
    passenger(1, "ADULT", "Ana", "1988-04-12"),
    passenger(2, "ADULT", "Minh", "1986-11-02"),
    passenger(3, "CHILD", "Linh", "2018-02-20")
  ],
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
    const message = composeInquiryNotification(inquiry, "newtectravelagency@gmail.com");
    expect(message.to).toBe("newtectravelagency@gmail.com");
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
      "newtectravelagency@gmail.com"
    );
    expect(message.subject).toContain("PHX to SGN");
    expect(message.text).toContain("PHX to Ho Chi Minh City (SGN)");
  });

  /*
   * This is the part of the email that gets retyped into Sabre to hold the
   * seats, so each traveler is a row of their own, numbered within their kind.
   */
  it("lists the passport manifest one traveler per row", () => {
    const message = composeInquiryNotification(inquiry, "newtectravelagency@gmail.com");
    expect(message.text).toContain("Adult 1: Nguyen, Ana (born 1988-04-12)");
    expect(message.text).toContain("Adult 2: Nguyen, Minh (born 1986-11-02)");
    expect(message.text).toContain("Child 1: Nguyen, Linh (born 2018-02-20)");
  });

  /*
   * The names are optional on the form. An email with the manifest silently
   * missing would read as a request that had none to give, so it says so.
   */
  it("says when the passport names are still to be collected", () => {
    const message = composeInquiryNotification(
      { ...inquiry, passengers: [] },
      "newtectravelagency@gmail.com"
    );
    expect(message.text).toContain("Passport names: not given yet — collect on the call");
  });

  it("escapes customer text in the HTML body", () => {
    const message = composeInquiryNotification(
      { ...inquiry, customerNotes: '<img src=x onerror="alert(1)">' },
      "newtectravelagency@gmail.com"
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
        "newtectravelagency@gmail.com"
      )
    ).toThrow("HEADER_VALUE_NOT_SINGLE_LINE: replyTo");
    expect(() =>
      composeInquiryNotification({ ...inquiry, givenName: "Ana\nSubject: forged" }, "a@b.test")
    ).toThrow("HEADER_VALUE_NOT_SINGLE_LINE: subject");
  });
});
