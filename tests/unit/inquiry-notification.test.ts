import { describe, expect, it } from "vitest";
import { composeInquiryWelcome } from "@/modules/inquiries/notification";
import type { InquiryPassengerRecord, InquiryWithPassengers } from "@/modules/inquiries/queries";

const submittedAt = new Date("2026-07-01T12:00:00Z");

const passenger = (
  position: number,
  type: InquiryPassengerRecord["type"],
  givenName: string
): InquiryPassengerRecord => ({
  id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${position}`,
  inquiryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  position,
  type,
  givenName,
  familyName: "Nguyen",
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
    passenger(1, "ADULT", "Ana"),
    passenger(2, "ADULT", "Minh"),
    passenger(3, "CHILD", "Linh")
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

describe("customer welcome email", () => {
  const AGENCY = "newtectravelagency@gmail.com";

  it("goes to the customer and copies the agency onto the same thread", () => {
    const message = composeInquiryWelcome(inquiry, AGENCY);
    expect(message.to).toBe("ana@example.test");
    expect(message.cc).toBe(AGENCY);
    // Replying from either side has to land in the agency's own mailbox, not
    // whatever domain the relay is configured to send as.
    expect(message.replyTo).toBe(AGENCY);
    expect(message.subject).toContain("TV-8K3QZP");
  });

  it("opens with the customer's name and Hanh introducing herself", () => {
    const message = composeInquiryWelcome({ ...inquiry, preferredLocale: "en" }, AGENCY);
    expect(message.text).toContain("Hi Ana,");
    expect(message.text).toContain("This is Hanh.");
    expect(message.text).toContain("Hanh Newtec");
    expect(message.text).toContain("Travel Specialist, NEWTEC TRAVEL AND TOURS");
  });

  it("carries every detail the request was made with", () => {
    const message = composeInquiryWelcome({ ...inquiry, preferredLocale: "en" }, AGENCY);
    expect(message.text).toContain("TV-8K3QZP");
    expect(message.text).toContain("SFO → Ho Chi Minh City (SGN)");
    expect(message.text).toContain("Round trip");
    expect(message.text).toContain("August 1, 2026 – August 20, 2026");
    expect(message.text).toContain("flexible by 1 day");
    expect(message.text).toContain("Economy");
    expect(message.text).toContain("2 adults, 1 child");
    expect(message.text).toContain("flights VN99/VN98");
    expect(message.text).toContain("Prefers a morning departure");
    expect(message.text).toContain("(415) 555-0142");
  });

  /*
   * This is the manifest the agency retypes into Sabre to hold the seats, and a
   * name that wrapped mid-line is where a booking gets misspelled.
   */
  it("lists the passport manifest one traveler per line", () => {
    const message = composeInquiryWelcome({ ...inquiry, preferredLocale: "en" }, AGENCY);
    expect(message.text).toContain("Adult 1: Nguyen, Ana");
    expect(message.text).toContain("Adult 2: Nguyen, Minh");
    expect(message.text).toContain("Child 1: Nguyen, Linh");
  });

  /*
   * The names are optional on the form, and so are the two free-text fields. An
   * empty row is a line the customer reads to learn nothing, so it is left out.
   */
  it("leaves out the rows the customer did not fill in", () => {
    const message = composeInquiryWelcome(
      {
        ...inquiry,
        preferredLocale: "en",
        passengers: [],
        specialAssistance: null,
        customerNotes: null
      },
      AGENCY
    );
    expect(message.text).not.toContain("Passport names");
    expect(message.text).not.toContain("Special assistance");
    expect(message.text).not.toContain("Your notes");
    // What they did fill in still has to be there.
    expect(message.text).toContain("2 adults, 1 child");
  });

  it("writes to a Vietnamese customer in Vietnamese", () => {
    const message = composeInquiryWelcome(inquiry, AGENCY);
    expect(inquiry.preferredLocale).toBe("vi");
    expect(message.text).toContain("Chào anh chị Ana,");
    expect(message.text).toContain("Tôi là Hanh.");
    expect(message.text).toContain("TP. Hồ Chí Minh (SGN)");
    expect(message.text).toContain("Khứ hồi");
    expect(message.subject).toContain("Yêu cầu TV-8K3QZP");
  });

  /*
   * Mail clients do not render SVG, so the signature carries a PNG of the same
   * traced lockup, attached rather than hotlinked: remote images are blocked by
   * default until the reader trusts the sender.
   */
  it("signs off with the lockup attached inline, not fetched from a URL", () => {
    const message = composeInquiryWelcome(inquiry, AGENCY);
    const [logo] = message.attachments ?? [];
    expect(logo?.contentType).toBe("image/png");
    expect(logo?.content.length).toBeGreaterThan(0);
    expect(message.html).toContain(`cid:${logo?.cid}`);
    expect(message.html).not.toContain("http://");
  });

  it("escapes customer text in the HTML body", () => {
    const message = composeInquiryWelcome(
      { ...inquiry, customerNotes: '<img src=x onerror="alert(1)">' },
      AGENCY
    );
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).toContain("&lt;img");
  });

  it("refuses to send when a value would forge a header", () => {
    // The contract and a column check reject these first; if one is ever
    // bypassed the mail must not go out rather than go out malformed.
    expect(() =>
      composeInquiryWelcome(
        { ...inquiry, email: "ana@example.test\r\nBcc: attacker@example.test" },
        AGENCY
      )
    ).toThrow("HEADER_VALUE_NOT_SINGLE_LINE: to");
    expect(() =>
      composeInquiryWelcome(inquiry, "agency@example.test\nBcc: attacker@example.test")
    ).toThrow("HEADER_VALUE_NOT_SINGLE_LINE: cc");
  });
});
