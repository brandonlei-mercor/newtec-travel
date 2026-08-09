import type { EmailMessage } from "@/server/integrations/email-sender";
import type { InquiryRecord } from "./queries";

const DESTINATION_NAMES: Record<InquiryRecord["destination"], string> = {
  SGN: "Ho Chi Minh City (SGN)",
  HAN: "Hanoi (HAN)",
  DAD: "Da Nang (DAD)",
  FLEXIBLE: "Flexible among SGN, HAN, DAD"
};

const CABIN_NAMES: Record<InquiryRecord["cabin"], string> = {
  ECONOMY: "Economy",
  PREMIUM_ECONOMY: "Premium economy",
  BUSINESS: "Business",
  NO_PREFERENCE: "No preference"
};

const FLEXIBILITY_NAMES: Record<InquiryRecord["dateFlexibility"], string> = {
  EXACT: "Exact dates",
  PLUS_MINUS_1: "Flexible by 1 day",
  PLUS_MINUS_3: "Flexible by 3 days"
};

/**
 * Refuses any value that would end an email header. The contract and a column
 * check already reject these, so reaching here means something upstream was
 * bypassed and the mail must not go out rather than go out malformed.
 */
export function assertHeaderSafe(value: string, field: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`HEADER_VALUE_NOT_SINGLE_LINE: ${field}`);
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function party(inquiry: InquiryRecord): string {
  const parts = [`${inquiry.adults} adult${inquiry.adults === 1 ? "" : "s"}`];
  if (inquiry.children > 0) parts.push(`${inquiry.children} child`);
  if (inquiry.infants > 0) parts.push(`${inquiry.infants} infant`);
  return parts.join(", ");
}

/**
 * The one email the agency receives per request. Reply-To is the customer's own
 * address, so hitting reply in any mail client answers the customer directly
 * rather than the shared mailbox the message was sent from.
 */
export function composeInquiryNotification(
  inquiry: InquiryRecord,
  recipient: string
): EmailMessage {
  const name = `${inquiry.givenName} ${inquiry.familyName}`;
  const preferred = inquiry.preferredContactMethod === "PHONE" ? inquiry.phone : inquiry.email;
  const rows: [string, string][] = [
    ["Reference", inquiry.reference],
    ["Name", name],
    ["Preferred contact", `${inquiry.preferredContactMethod.toLowerCase()} (${preferred})`],
    ["Phone", inquiry.phone],
    ["Email", inquiry.email],
    ["Language", inquiry.preferredLocale === "vi" ? "Vietnamese" : "English"],
    ["Route", `${inquiry.origin} to ${DESTINATION_NAMES[inquiry.destination]}`],
    ["Trip", inquiry.tripType === "ONE_WAY" ? "one way" : "round trip"],
    [
      "Dates",
      inquiry.returnDate
        ? `${inquiry.departureDate} to ${inquiry.returnDate}`
        : `${inquiry.departureDate} (one way)`
    ],
    // The itinerary the customer was looking at when they sent this, so the
    // call back starts from the same flight rather than a fresh search.
    ["Selected flight", inquiry.selectedOffer ?? "none (request taken without a search)"],
    ["Flexibility", FLEXIBILITY_NAMES[inquiry.dateFlexibility]],
    ["Cabin", CABIN_NAMES[inquiry.cabin]],
    ["Travelers", party(inquiry)],
    ["Visa help requested", inquiry.visaInterest ? "yes" : "no"],
    ["Marketing consent", inquiry.marketingConsent ? "yes" : "no"],
    ["Special assistance", inquiry.specialAssistance ?? "none"],
    ["Notes", inquiry.customerNotes ?? "none"]
  ];

  return {
    to: assertHeaderSafe(recipient, "recipient"),
    replyTo: assertHeaderSafe(inquiry.email, "replyTo"),
    subject: assertHeaderSafe(
      `New request ${inquiry.reference}: ${name}, ${inquiry.origin} to ${inquiry.destination} on ${inquiry.departureDate}`,
      "subject"
    ),
    text: rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
    html: [
      "<table>",
      ...rows.map(
        ([label, value]) =>
          `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
      ),
      "</table>"
    ].join("")
  };
}
