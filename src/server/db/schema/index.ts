import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { INQUIRY_STATUSES } from "@/shared/contracts/inquiry";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const localeEnum = pgEnum("locale", ["en", "vi"]);
export const destinationEnum = pgEnum("destination", ["SGN", "HAN", "DAD", "FLEXIBLE"]);
export const dateFlexibilityEnum = pgEnum("date_flexibility", [
  "EXACT",
  "PLUS_MINUS_1",
  "PLUS_MINUS_3"
]);
export const cabinEnum = pgEnum("cabin", [
  "ECONOMY",
  "PREMIUM_ECONOMY",
  "BUSINESS",
  "NO_PREFERENCE"
]);
export const tripTypeEnum = pgEnum("trip_type", ["ROUND_TRIP", "ONE_WAY"]);
export const contactMethodEnum = pgEnum("contact_method", ["EMAIL", "PHONE"]);
export const inquiryStatusEnum = pgEnum("inquiry_status", INQUIRY_STATUSES);
export const notificationStateEnum = pgEnum("notification_state", ["PENDING", "SENT", "FAILED"]);

/**
 * One customer request for a callback. This is the whole business record: the
 * agency reads it, calls the customer back, and tickets in Sabre by hand. The
 * site never books, prices, or charges, so nothing downstream hangs off a row.
 */
export const inquiries = pgTable(
  "inquiries",
  {
    id: id(),
    reference: varchar("reference", { length: 16 }).notNull(),
    status: inquiryStatusEnum("status").notNull().default("NEW"),
    origin: varchar("origin", { length: 3 }).notNull().default("SFO"),
    destination: destinationEnum("destination").notNull(),
    tripType: tripTypeEnum("trip_type").notNull().default("ROUND_TRIP"),
    departureDate: date("departure_date").notNull(),
    /** Null on a one-way request; the check constraint ties it to trip_type. */
    returnDate: date("return_date"),
    dateFlexibility: dateFlexibilityEnum("date_flexibility").notNull(),
    cabin: cabinEnum("cabin").notNull(),
    adults: integer("adults").notNull(),
    children: integer("children").notNull().default(0),
    infants: integer("infants").notNull().default(0),
    givenName: varchar("given_name", { length: 80 }).notNull(),
    familyName: varchar("family_name", { length: 80 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    preferredContactMethod: contactMethodEnum("preferred_contact_method").notNull(),
    preferredLocale: localeEnum("preferred_locale").notNull().default("en"),
    /*
     * The flight the customer checked out with, written by us rather than typed
     * by them, so the agency reads the exact itinerary that was on screen.
     * Null on a request that did not start from a search result.
     */
    selectedOffer: text("selected_offer"),
    specialAssistance: text("special_assistance"),
    customerNotes: text("customer_notes"),
    visaInterest: boolean("visa_interest").notNull().default(false),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    /*
     * Consent is evidence, so it is stored as the instant it was given rather
     * than a boolean someone could later flip without a trace.
     */
    transactionalConsentAt: timestamp("transactional_consent_at", { withTimezone: true }).notNull(),
    partyDataAuthorityAt: timestamp("party_data_authority_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the request stopped being NEW — i.e. when somebody picked it up. */
    contactedAt: timestamp("contacted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    unique("inquiries_reference_unique").on(table.reference),
    index("inquiries_status_submitted_idx").on(table.status, table.submittedAt),
    index("inquiries_submitted_idx").on(table.submittedAt),
    /*
     * The same closed set the contract enforces, repeated here so a bad origin
     * cannot reach the table by any route that skips the Zod parse.
     */
    check("inquiries_origin_supported", sql`${table.origin} in ('SFO', 'LAX', 'PHX', 'JFK')`),
    check(
      "inquiries_party_valid",
      sql`${table.adults} >= 1 and ${table.children} >= 0 and ${table.infants} >= 0 and ${table.adults} + ${table.children} + ${table.infants} <= 9 and ${table.infants} <= ${table.adults}`
    ),
    /*
     * A round trip must carry a return date after departure, and a one-way must
     * carry none. Enforced together so neither shape can be half-written.
     */
    check(
      "inquiries_return_matches_trip_type",
      sql`(${table.tripType} = 'ONE_WAY' and ${table.returnDate} is null) or (${table.tripType} = 'ROUND_TRIP' and ${table.returnDate} > ${table.departureDate})`
    ),
    /*
     * The email address is written straight into the notification's Reply-To
     * header. A carriage return or newline in it would end the header and let a
     * submission append headers or a body of its own, so the database refuses
     * to hold one at all: the validator, the sender, and the column all check.
     * Spelled with chr() rather than a regex escape so the generated migration
     * carries no literal control characters.
     */
    check(
      "inquiries_email_single_line",
      sql`position(chr(10) in ${table.email}) = 0 and position(chr(13) in ${table.email}) = 0`
    ),
    check(
      "inquiries_phone_single_line",
      sql`position(chr(10) in ${table.phone}) = 0 and position(chr(13) in ${table.phone}) = 0`
    ),
    check(
      "inquiries_contacted_at_matches_status",
      sql`(${table.status} = 'NEW') = (${table.contactedAt} is null)`
    )
  ]
);

/**
 * Transactional outbox for the one email that tells the agency a request came
 * in. Written in the same transaction as the inquiry so a mail outage can never
 * lose a lead: the row is the durable record and the job just drains it.
 */
export const inquiryNotifications = pgTable(
  "inquiry_notifications",
  {
    id: id(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    recipient: varchar("recipient", { length: 320 }).notNull(),
    state: notificationStateEnum("state").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true })
  },
  (table) => [
    unique("inquiry_notifications_inquiry_unique").on(table.inquiryId),
    index("inquiry_notifications_pending_idx").on(table.state, table.createdAt),
    check(
      "inquiry_notifications_sent_at_set",
      sql`(${table.state} = 'SENT') = (${table.sentAt} is not null)`
    )
  ]
);

/**
 * Replay protection for the public inquiry form. A retried submission returns
 * the original reference instead of creating a second lead.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: id(),
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    scope: varchar("scope", { length: 100 }).notNull(),
    key: varchar("key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("idempotency_keys_actor_scope_key_unique").on(table.actorId, table.scope, table.key)
  ]
);

/** Short-lived cache of a whole search result, keyed by the search parameters. */
export const flightOfferCaches = pgTable(
  "flight_offer_caches",
  {
    id: id(),
    searchKey: varchar("search_key", { length: 64 }).notNull(),
    origin: varchar("origin", { length: 3 }).notNull().default("SFO"),
    destination: varchar("destination", { length: 3 }).notNull(),
    tripType: tripTypeEnum("trip_type").notNull().default("ROUND_TRIP"),
    departureDate: date("departure_date").notNull(),
    returnDate: date("return_date"),
    adults: integer("adults").notNull(),
    children: integer("children").notNull(),
    infants: integer("infants").notNull(),
    cabin: cabinEnum("cabin").notNull(),
    offers: jsonb("offers").$type<unknown[]>().notNull(),
    source: varchar("source", { length: 32 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("flight_offer_caches_search_key_uidx").on(table.searchKey),
    index("flight_offer_caches_expiry_idx").on(table.expiresAt),
    check(
      "flight_offer_caches_origin_supported",
      sql`${table.origin} in ('SFO', 'LAX', 'PHX', 'JFK')`
    ),
    check(
      "flight_offer_caches_destination_supported",
      sql`${table.destination} in ('SGN', 'HAN', 'DAD')`
    ),
    check(
      "flight_offer_caches_return_matches_trip_type",
      sql`(${table.tripType} = 'ONE_WAY' and ${table.returnDate} is null) or (${table.tripType} = 'ROUND_TRIP' and ${table.returnDate} > ${table.departureDate})`
    ),
    check(
      "flight_offer_caches_party_valid",
      sql`${table.adults} >= 1 and ${table.children} >= 0 and ${table.infants} >= 0 and ${table.adults} + ${table.children} + ${table.infants} <= 9 and ${table.infants} <= ${table.adults}`
    ),
    check("flight_offer_caches_cabin_concrete", sql`${table.cabin} <> 'NO_PREFERENCE'`),
    check("flight_offer_caches_expiry_ordered", sql`${table.expiresAt} > ${table.fetchedAt}`)
  ]
);

export const inquiriesRelations = relations(inquiries, ({ many }) => ({
  notifications: many(inquiryNotifications)
}));

export const inquiryNotificationsRelations = relations(inquiryNotifications, ({ one }) => ({
  inquiry: one(inquiries, {
    fields: [inquiryNotifications.inquiryId],
    references: [inquiries.id]
  })
}));
