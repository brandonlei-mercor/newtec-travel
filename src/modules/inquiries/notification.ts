import { readFileSync } from "node:fs";
import path from "node:path";
import type { EmailAttachment, EmailMessage } from "@/server/integrations/email-sender";
import { COMPANY } from "@/shared/company";
import type { InquiryPassengerRecord, InquiryWithPassengers } from "./queries";

type InquiryRecord = InquiryWithPassengers;
type Locale = "en" | "vi";

/*
 * One email leaves per request: it goes to the customer and copies the agency,
 * so the reply thread the customer answers in is the same thread Hanh works
 * out of. A separate internal alert would fork the conversation in two and
 * leave the agency reading its own summary instead of the customer's replies.
 *
 * The copy lives here rather than in messages/*.json because that catalogue is
 * loaded through next-intl inside a request; this is composed by the worker, a
 * plain Node process with no request and no React tree around it.
 */

const DESTINATION_NAMES: Record<Locale, Record<InquiryRecord["destination"], string>> = {
  en: {
    SGN: "Ho Chi Minh City (SGN)",
    HAN: "Hanoi (HAN)",
    DAD: "Da Nang (DAD)",
    FLEXIBLE: "Flexible among SGN, HAN, DAD"
  },
  vi: {
    SGN: "TP. Hồ Chí Minh (SGN)",
    HAN: "Hà Nội (HAN)",
    DAD: "Đà Nẵng (DAD)",
    FLEXIBLE: "Linh động giữa SGN, HAN, DAD"
  }
};

const CABIN_NAMES: Record<Locale, Record<InquiryRecord["cabin"], string>> = {
  en: {
    ECONOMY: "Economy",
    PREMIUM_ECONOMY: "Premium economy",
    BUSINESS: "Business",
    NO_PREFERENCE: "No preference"
  },
  vi: {
    ECONOMY: "Phổ thông",
    PREMIUM_ECONOMY: "Phổ thông đặc biệt",
    BUSINESS: "Thương gia",
    NO_PREFERENCE: "Không yêu cầu"
  }
};

const FLEXIBILITY_NAMES: Record<Locale, Record<InquiryRecord["dateFlexibility"], string>> = {
  en: {
    EXACT: "exact dates",
    PLUS_MINUS_1: "flexible by 1 day",
    PLUS_MINUS_2: "flexible by 1–2 days",
    PLUS_MINUS_3: "flexible by 3 days"
  },
  vi: {
    EXACT: "đúng ngày",
    PLUS_MINUS_1: "linh động 1 ngày",
    PLUS_MINUS_2: "linh động 1–2 ngày",
    PLUS_MINUS_3: "linh động 3 ngày"
  }
};

const PASSENGER_LABELS: Record<Locale, Record<InquiryPassengerRecord["type"], string>> = {
  en: { ADULT: "Adult", CHILD: "Child", INFANT: "Lap infant" },
  vi: { ADULT: "Người lớn", CHILD: "Trẻ em", INFANT: "Em bé ngồi chung" }
};

const COPY = {
  en: {
    subject: (reference: string, route: string) => `Your request ${reference} — ${route}`,
    greeting: (name: string) => `Hi ${name},`,
    intro:
      "This is Hanh. I have your request in front of me and I am checking the fare and the seats now. I will come back to you myself with what I find.",
    detailsTitle: "Your request",
    closing:
      "Everything above is what you sent me. If something is wrong, or you want to move a date, just reply to this email — it comes straight to me, and we can keep the whole trip in this one thread.",
    signoff: "Talk soon,",
    ownerTitle: `Travel Specialist, ${COMPANY.name}`,
    disclaimer:
      "This request does not hold a seat. I confirm the fare and every detail with you before your ticket is issued.",
    labels: {
      reference: "Reference",
      route: "Route",
      trip: "Trip",
      dates: "Dates",
      cabin: "Cabin",
      travelers: "Travelers",
      passengers: "Passport names",
      selectedOffer: "The flight you picked",
      visa: "Vietnam visa",
      assistance: "Special assistance",
      notes: "Your notes",
      contact: "How I will reach you"
    },
    oneWay: "One way",
    roundTrip: "Round trip",
    oneWayDate: (date: string) => `${date} (one way)`,
    party: (adults: number, children: number, infants: number) =>
      [
        `${adults} adult${adults === 1 ? "" : "s"}`,
        children > 0 ? `${children} child${children === 1 ? "" : "ren"}` : null,
        infants > 0 ? `${infants} lap infant${infants === 1 ? "" : "s"}` : null
      ]
        .filter((part): part is string => part !== null)
        .join(", "),
    visaYes: "Yes — I will take care of the paperwork",
    visaNo: "Not requested",
    preferredPhone: (phone: string, email: string) => `${phone} (you preferred a call), ${email}`,
    preferredEmail: (phone: string, email: string) => `${email}, or ${phone} if I cannot reach you`
  },
  vi: {
    subject: (reference: string, route: string) => `Yêu cầu ${reference} của anh chị — ${route}`,
    greeting: (name: string) => `Chào anh chị ${name},`,
    intro:
      "Tôi là Hanh. Tôi đã nhận được yêu cầu của anh chị và đang kiểm tra giá vé cùng chỗ ngồi. Tôi sẽ đích thân trả lời anh chị khi có kết quả.",
    detailsTitle: "Yêu cầu của anh chị",
    closing:
      "Bên trên là những gì anh chị đã gửi cho tôi. Nếu có chỗ nào chưa đúng hoặc anh chị muốn dời ngày, cứ trả lời ngay email này — thư đến thẳng chỗ tôi, và mình giữ trọn chuyến đi trong cùng một dòng thư.",
    signoff: "Hẹn sớm trả lời anh chị,",
    ownerTitle: `Chuyên viên du lịch, ${COMPANY.name}`,
    disclaimer:
      "Yêu cầu này chưa giữ chỗ. Tôi sẽ xác nhận giá vé và từng chi tiết với anh chị trước khi xuất vé.",
    labels: {
      reference: "Mã yêu cầu",
      route: "Hành trình",
      trip: "Loại vé",
      dates: "Ngày bay",
      cabin: "Hạng ghế",
      travelers: "Số khách",
      passengers: "Tên trên hộ chiếu",
      selectedOffer: "Chuyến anh chị đã chọn",
      visa: "Visa Việt Nam",
      assistance: "Hỗ trợ đặc biệt",
      notes: "Ghi chú của anh chị",
      contact: "Cách tôi liên lạc"
    },
    oneWay: "Một chiều",
    roundTrip: "Khứ hồi",
    oneWayDate: (date: string) => `${date} (một chiều)`,
    party: (adults: number, children: number, infants: number) =>
      [
        `${adults} người lớn`,
        children > 0 ? `${children} trẻ em` : null,
        infants > 0 ? `${infants} em bé` : null
      ]
        .filter((part): part is string => part !== null)
        .join(", "),
    visaYes: "Có — tôi sẽ lo hồ sơ",
    visaNo: "Không yêu cầu",
    preferredPhone: (phone: string, email: string) => `${phone} (anh chị muốn tôi gọi), ${email}`,
    preferredEmail: (phone: string, email: string) =>
      `${email}, hoặc ${phone} nếu không liên lạc được`
  }
} as const;

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

/*
 * A travel date is a calendar day, not an instant, so it is pinned to UTC and
 * formatted there: read in Vietnam, "2026-08-01" must still say 1 August.
 */
function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${iso}T00:00:00Z`));
}

/*
 * The manifest, one traveler per line and numbered within their kind, which is
 * how an airline lists a booking. The names are optional on the form, so this
 * is often empty and the row is left out rather than shown as a blank.
 */
function passengerLines(passengers: InquiryPassengerRecord[], locale: Locale): string[] {
  const seen: Record<InquiryPassengerRecord["type"], number> = { ADULT: 0, CHILD: 0, INFANT: 0 };
  return passengers.map((passenger) => {
    seen[passenger.type] += 1;
    const label = `${PASSENGER_LABELS[locale][passenger.type]} ${seen[passenger.type]}`;
    return `${label}: ${passenger.familyName}, ${passenger.givenName}`;
  });
}

const LOCKUP_CID = "newtec-lockup";
const LOCKUP_PATH = path.join(process.cwd(), "public", "brand", "lockup.png");

let lockupCache: EmailAttachment | null | undefined;

/**
 * The signature artwork, read once per process and kept.
 *
 * A missing file must not cost the agency a lead, so it degrades to an email
 * with no logo instead of a delivery that fails and retries forever. The path
 * is fixed at build time and holds nothing a customer supplied.
 */
function lockupAttachment(): EmailAttachment | null {
  if (lockupCache !== undefined) return lockupCache;
  try {
    lockupCache = {
      filename: "newtec-travel-and-tours.png",
      content: readFileSync(LOCKUP_PATH),
      contentType: "image/png",
      cid: LOCKUP_CID
    };
  } catch {
    lockupCache = null;
  }
  return lockupCache;
}

type Row = { label: string; value: string; lines?: string[] };

function requestRows(inquiry: InquiryRecord, locale: Locale): Row[] {
  const copy = COPY[locale];
  const { labels } = copy;
  const dates = inquiry.returnDate
    ? `${formatDate(inquiry.departureDate, locale)} – ${formatDate(inquiry.returnDate, locale)}`
    : copy.oneWayDate(formatDate(inquiry.departureDate, locale));
  const names = passengerLines(inquiry.passengers, locale);
  const contact =
    inquiry.preferredContactMethod === "PHONE"
      ? copy.preferredPhone(inquiry.phone, inquiry.email)
      : copy.preferredEmail(inquiry.phone, inquiry.email);

  const rows: Row[] = [
    { label: labels.reference, value: inquiry.reference },
    {
      label: labels.route,
      value: `${inquiry.origin} → ${DESTINATION_NAMES[locale][inquiry.destination]}`
    },
    { label: labels.trip, value: inquiry.tripType === "ONE_WAY" ? copy.oneWay : copy.roundTrip },
    {
      label: labels.dates,
      value: `${dates} · ${FLEXIBILITY_NAMES[locale][inquiry.dateFlexibility]}`
    },
    { label: labels.cabin, value: CABIN_NAMES[locale][inquiry.cabin] },
    {
      label: labels.travelers,
      value: copy.party(inquiry.adults, inquiry.children, inquiry.infants)
    }
  ];
  if (names.length > 0)
    rows.push({ label: labels.passengers, value: names.join("; "), lines: names });
  // The itinerary the customer was looking at when they sent this, so the reply
  // starts from the same flight rather than a fresh search.
  if (inquiry.selectedOffer)
    rows.push({ label: labels.selectedOffer, value: inquiry.selectedOffer });
  rows.push({ label: labels.visa, value: inquiry.visaInterest ? copy.visaYes : copy.visaNo });
  // Left out when empty: a row saying "none" is a line the customer has to read
  // to learn nothing.
  if (inquiry.specialAssistance) {
    rows.push({ label: labels.assistance, value: inquiry.specialAssistance });
  }
  if (inquiry.customerNotes) rows.push({ label: labels.notes, value: inquiry.customerNotes });
  rows.push({ label: labels.contact, value: contact });
  return rows;
}

const INK = "#10233f";
const INK_SOFT = "#5a6b83";
const BRAND = "#1f3a93";
const LINE = "#e4e9f1";
const PAPER = "#ffffff";
const IVORY = "#f6f8fb";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/*
 * Tables and inline styles rather than the site's stylesheet: Gmail strips
 * <style> blocks it does not like, Outlook lays out with Word, and neither
 * supports flexbox. Everything below is the 1998 subset that renders the same
 * in all of them, which is also why the layout is one column of full-width rows.
 */
function renderHtml(inquiry: InquiryRecord, locale: Locale, hasLockup: boolean): string {
  const copy = COPY[locale];
  const rows = requestRows(inquiry, locale)
    .map((row) => {
      const value = row.lines
        ? row.lines.map((line) => escapeHtml(line)).join("<br />")
        : escapeHtml(row.value);
      return `<tr>
        <td style="padding:10px 16px 10px 0;vertical-align:top;color:${INK_SOFT};font-size:13px;white-space:nowrap;border-bottom:1px solid ${LINE};">${escapeHtml(row.label)}</td>
        <td style="padding:10px 0;vertical-align:top;color:${INK};font-size:14px;font-weight:600;border-bottom:1px solid ${LINE};">${value}</td>
      </tr>`;
    })
    .join("");

  const signatureMark = hasLockup
    ? `<tr><td style="padding-top:16px;"><img alt="${escapeHtml(COMPANY.name)}" src="cid:${LOCKUP_CID}" width="229" height="48" style="display:block;border:0;width:229px;height:48px;" /></td></tr>`
    : "";

  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>${escapeHtml(inquiry.reference)}</title></head>
<body style="margin:0;padding:0;background:${IVORY};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${IVORY};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${PAPER};border:1px solid ${LINE};">
      <tr><td style="padding:40px 40px 0;font-family:${FONT};color:${INK};font-size:15px;line-height:24px;">
        <p style="margin:0 0 16px;font-size:17px;font-weight:700;">${escapeHtml(copy.greeting(inquiry.givenName))}</p>
        <p style="margin:0;">${escapeHtml(copy.intro)}</p>
      </td></tr>
      <tr><td style="padding:32px 40px 0;font-family:${FONT};">
        <p style="margin:0 0 4px;color:${BRAND};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(copy.detailsTitle)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;font-family:${FONT};">${rows}</table>
      </td></tr>
      <tr><td style="padding:24px 40px 0;font-family:${FONT};color:${INK};font-size:15px;line-height:24px;">
        <p style="margin:0;">${escapeHtml(copy.closing)}</p>
      </td></tr>
      <tr><td style="padding:32px 40px 40px;font-family:${FONT};color:${INK};font-size:15px;line-height:24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-family:${FONT};color:${INK};font-size:15px;line-height:24px;">
            <p style="margin:0;">${escapeHtml(copy.signoff)}</p>
            <p style="margin:8px 0 0;font-size:16px;font-weight:700;">${escapeHtml(COMPANY.owner.name)}</p>
            <p style="margin:2px 0 0;color:${INK_SOFT};font-size:13px;">${escapeHtml(copy.ownerTitle)}</p>
            <p style="margin:2px 0 0;font-size:13px;"><a href="${COMPANY.email.href}" style="color:${BRAND};text-decoration:none;">${escapeHtml(COMPANY.email.address)}</a> · ${escapeHtml(COMPANY.locality)}</p>
          </td></tr>
          ${signatureMark}
        </table>
      </td></tr>
      <tr><td style="padding:0 40px 32px;font-family:${FONT};">
        <p style="margin:0;padding-top:20px;border-top:1px solid ${LINE};color:${INK_SOFT};font-size:12px;line-height:18px;">${escapeHtml(copy.disclaimer)}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function renderText(inquiry: InquiryRecord, locale: Locale): string {
  const copy = COPY[locale];
  const rows = requestRows(inquiry, locale).map((row) =>
    row.lines ? `${row.label}:\n  ${row.lines.join("\n  ")}` : `${row.label}: ${row.value}`
  );
  return [
    copy.greeting(inquiry.givenName),
    "",
    copy.intro,
    "",
    `${copy.detailsTitle.toUpperCase()}`,
    ...rows,
    "",
    copy.closing,
    "",
    copy.signoff,
    COMPANY.owner.name,
    copy.ownerTitle,
    `${COMPANY.email.address} · ${COMPANY.locality}`,
    "",
    copy.disclaimer
  ].join("\n");
}

/**
 * The one email a request produces. It is addressed to the customer and copies
 * the agency's mailbox, so replying to it — from either side — continues the
 * same thread. Reply-To is the agency address rather than whatever mailbox the
 * relay is configured to send as, since that sender may be a domain the agency
 * does not read.
 */
export function composeInquiryWelcome(inquiry: InquiryRecord, agencyCopy: string): EmailMessage {
  const locale: Locale = inquiry.preferredLocale === "vi" ? "vi" : "en";
  const route = `${inquiry.origin} → ${DESTINATION_NAMES[locale][inquiry.destination]}`;
  const lockup = lockupAttachment();

  return {
    to: assertHeaderSafe(inquiry.email, "to"),
    cc: assertHeaderSafe(agencyCopy, "cc"),
    replyTo: assertHeaderSafe(COMPANY.email.address, "replyTo"),
    // The customer's own name is not in the subject: it is their inbox, and the
    // agency finds the copy by reference, which is what the board is keyed on.
    subject: assertHeaderSafe(COPY[locale].subject(inquiry.reference, route), "subject"),
    text: renderText(inquiry, locale),
    html: renderHtml(inquiry, locale, lockup !== null),
    ...(lockup === null ? {} : { attachments: [lockup] })
  };
}
