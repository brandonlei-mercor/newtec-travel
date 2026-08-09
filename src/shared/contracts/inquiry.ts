import { z } from "zod";
import { searchOriginSchema, searchTripTypeSchema } from "./search";

export const CONTACT_METHODS = ["EMAIL", "PHONE"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

/*
 * The three columns of the board, in the order they appear on it. A request is
 * NEW until somebody picks it up, PROCESSING while the agency is working it,
 * and DONE once it is ticketed or dropped. Ordered here so the board cannot
 * disagree with the database about what comes after what.
 */
export const INQUIRY_STATUSES = ["NEW", "PROCESSING", "DONE"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

/**
 * Every value here reaches an email header: the address becomes Reply-To and
 * the names become part of the subject. A carriage return or newline would end
 * that header and let a submission append its own, so single-line values are
 * enforced at the contract, again by the sender, and again by a column check.
 */
const singleLine = <T extends z.ZodType<string>>(schema: T) =>
  schema.refine((value) => !/[\r\n]/.test(value), { message: "CONTACT_FIELD_SINGLE_LINE" });

export const inquiryInputSchema = z
  .object({
    origin: searchOriginSchema,
    destination: z.enum(["SGN", "HAN", "DAD", "FLEXIBLE"]),
    tripType: searchTripTypeSchema,
    departureDate: z.iso.date(),
    /** Omitted on a one-way request; the superRefine below ties the two together. */
    returnDate: z.iso.date().optional(),
    flexibility: z.enum(["EXACT", "PLUS_MINUS_1", "PLUS_MINUS_3"]),
    cabinPreference: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "NO_PREFERENCE"]),
    travelers: z.object({
      adults: z.number().int().min(1).max(9),
      children: z.number().int().min(0).max(8),
      infants: z.number().int().min(0).max(8)
    }),
    contact: z.object({
      givenName: singleLine(z.string().trim().min(1).max(80)),
      familyName: singleLine(z.string().trim().min(1).max(80)),
      /*
       * Both channels are always collected. The agency calls back by hand, and
       * a single wrong address or a disconnected number would otherwise strand
       * the lead with no second way to reach the customer.
       */
      /*
       * Normalize before validating: a pasted address routinely arrives with a
       * trailing space or in caps, and rejecting the lead over that would cost
       * the agency a customer for no safety benefit.
       */
      email: singleLine(
        z
          .string()
          .max(320)
          .transform((value) => value.trim().toLowerCase())
          .pipe(z.email())
      ),
      phone: singleLine(z.string().trim().min(7).max(32)),
      preferredContactMethod: z.enum(CONTACT_METHODS),
      preferredLanguage: z.enum(["en", "vi"])
    }),
    /*
     * The flight the customer checked out with, as one line the agency reads in
     * the notification email. Control characters are stripped rather than
     * rejected: this is machine-written text, and a stray one must not lose a
     * lead. Optional so a request taken by hand is still a valid inquiry.
     */
    selectedOffer: z
      .string()
      .max(400)
      .transform((value) =>
        value
          .replace(/[\u0000-\u001F\u007F]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .refine((value) => value.length > 0, { message: "INQUIRY_SELECTED_OFFER_EMPTY" })
      .optional(),
    specialAssistance: z.string().trim().max(2_000).optional(),
    notes: z.string().trim().max(4_000).optional(),
    visaInterest: z.boolean(),
    transactionalConsent: z.literal(true),
    partyDataAuthority: z.literal(true),
    marketingConsent: z.boolean()
  })
  .strict()
  .superRefine((value, context) => {
    const total = value.travelers.adults + value.travelers.children + value.travelers.infants;
    if (total > 9) {
      context.addIssue({
        code: "custom",
        path: ["travelers"],
        message: "INQUIRY_MAX_NINE_TRAVELERS"
      });
    }
    if (value.travelers.infants > value.travelers.adults) {
      context.addIssue({
        code: "custom",
        path: ["travelers", "infants"],
        message: "INQUIRY_INFANTS_REQUIRE_ADULTS"
      });
    }
    /*
     * A one-way request must carry no return date, and a round trip must carry
     * one after departure. Checked together so a half-written shape, which the
     * column check would reject anyway, never reaches the database.
     */
    if (value.tripType === "ONE_WAY") {
      if (value.returnDate !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["returnDate"],
          message: "INQUIRY_ONE_WAY_HAS_NO_RETURN"
        });
      }
    } else if (value.returnDate === undefined) {
      context.addIssue({
        code: "custom",
        path: ["returnDate"],
        message: "INQUIRY_RETURN_REQUIRED"
      });
    } else if (value.returnDate <= value.departureDate) {
      context.addIssue({
        code: "custom",
        path: ["returnDate"],
        message: "INQUIRY_RETURN_AFTER_DEPARTURE"
      });
    }
  });

export type InquiryInput = z.infer<typeof inquiryInputSchema>;

/** What a successful request returns. Written by us from our own insert. */
export type InquiryCreated = { inquiryId: string; reference: string };

/** How far ahead the agency will take a request, matching the search horizon. */
export const INQUIRY_HORIZON_DAYS = 330;
