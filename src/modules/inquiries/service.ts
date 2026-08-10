import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/server/db";
import { inquiries, inquiryNotifications, inquiryPassengers } from "@/server/db/schema";
import { claimIdempotency, completeIdempotency } from "@/modules/workflows/idempotency";
import { createCaseReference } from "@/shared/ids";
import {
  INQUIRY_HORIZON_DAYS,
  inquiryInputSchema,
  type InquiryCreated,
  type InquiryInput
} from "@/shared/contracts/inquiry";

export type CreateInquiryContext = {
  idempotencyKey: string;
  /** Where the notification lands. Injected so tests never mail a real address. */
  notificationRecipient: string;
  /**
   * Whether to queue the notification email. Off, the outbox row is still
   * written and left PENDING, so switching email on later can pick up every
   * request that arrived while it was off rather than starting from empty.
   */
  sendNotificationEmail: boolean;
  now?: Date;
};

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The contract plus the checks that need to know what day it is. Kept out of
 * the shared schema so the browser and the server validate the same shape.
 */
export function validateInquiryInput(input: unknown, now = new Date()): InquiryInput {
  const parsed = inquiryInputSchema.parse(input);
  const today = toIsoDate(now);
  const latest = toIsoDate(addUtcDays(new Date(`${today}T00:00:00.000Z`), INQUIRY_HORIZON_DAYS));
  if (parsed.departureDate < today) {
    throw new z.ZodError([
      { code: "custom", path: ["departureDate"], message: "INQUIRY_DEPARTURE_IN_PAST" }
    ]);
  }
  if (parsed.departureDate > latest || (parsed.returnDate ?? "") > latest) {
    throw new z.ZodError([
      { code: "custom", path: ["returnDate"], message: "INQUIRY_DATE_MORE_THAN_330_DAYS" }
    ]);
  }
  return parsed;
}

/**
 * Records a request for a callback and, when email is switched on, queues the
 * one message that tells the agency about it. The row and the notification are
 * written together, so a mail outage degrades to "someone has to open /admin"
 * rather than losing the lead.
 */
export async function createInquiry(
  db: Database,
  rawInput: unknown,
  context: CreateInquiryContext
): Promise<InquiryCreated> {
  const now = context.now ?? new Date();
  const input = validateInquiryInput(rawInput, now);

  return db.transaction(async (tx) => {
    const claimed = await claimIdempotency(tx, {
      actorId: input.contact.email,
      scope: "create_inquiry",
      key: context.idempotencyKey,
      request: input,
      now
    });
    if (!claimed.fresh) return claimed.responseBody as InquiryCreated;

    const [inquiry] = await tx
      .insert(inquiries)
      .values({
        reference: createCaseReference(),
        origin: input.origin,
        destination: input.destination,
        tripType: input.tripType,
        departureDate: input.departureDate,
        returnDate: input.returnDate ?? null,
        dateFlexibility: input.flexibility,
        cabin: input.cabinPreference,
        adults: input.travelers.adults,
        children: input.travelers.children,
        infants: input.travelers.infants,
        givenName: input.contact.givenName,
        familyName: input.contact.familyName,
        email: input.contact.email,
        phone: input.contact.phone,
        preferredContactMethod: input.contact.preferredContactMethod,
        preferredLocale: input.contact.preferredLanguage,
        ...(input.selectedOffer ? { selectedOffer: input.selectedOffer } : {}),
        ...(input.specialAssistance ? { specialAssistance: input.specialAssistance } : {}),
        ...(input.notes ? { customerNotes: input.notes } : {}),
        visaInterest: input.visaInterest,
        marketingConsent: input.marketingConsent,
        transactionalConsentAt: now,
        partyDataAuthorityAt: now,
        submittedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .returning({ id: inquiries.id, reference: inquiries.reference });
    if (!inquiry) throw new Error("INQUIRY_INSERT_FAILED");

    /*
     * The manifest goes in with the request, not after it: a party half-written
     * across two transactions would have the agency holding seats for people
     * whose names never arrived. Often there is nothing to write at all — the
     * names are optional — and an insert of no rows is an error, not a no-op.
     */
    if (input.passengers && input.passengers.length > 0) {
      await tx.insert(inquiryPassengers).values(
        input.passengers.map((passenger, index) => ({
          inquiryId: inquiry.id,
          position: index + 1,
          type: passenger.type,
          givenName: passenger.givenName,
          familyName: passenger.familyName,
          createdAt: now
        }))
      );
    }

    const [notification] = await tx
      .insert(inquiryNotifications)
      .values({ inquiryId: inquiry.id, recipient: context.notificationRecipient, createdAt: now })
      .returning({ id: inquiryNotifications.id });
    if (!notification) throw new Error("INQUIRY_NOTIFICATION_INSERT_FAILED");

    /*
     * Enqueued inside the transaction so the job cannot become visible before
     * the row it reads. If the transaction rolls back, so does the job.
     *
     * Negative priority runs ahead of everything else, so a customer waiting
     * for a callback is never stuck behind whatever else the worker picked up.
     */
    if (context.sendNotificationEmail) {
      await tx.execute(
        sql`select graphile_worker.add_job('notify_inquiry', ${JSON.stringify({ notificationId: notification.id })}::json, max_attempts := 8, priority := -10)`
      );
    }

    const response: InquiryCreated = { inquiryId: inquiry.id, reference: inquiry.reference };
    await completeIdempotency(tx, claimed.id, 201, response, now);
    return response;
  });
}
