import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createInquiry } from "@/modules/inquiries/service";
import { listInquiries, setInquiryStatus } from "@/modules/inquiries/queries";
import { inquiries, inquiryNotifications, inquiryPassengers } from "@/server/db/schema";
import { createJobHandlers } from "@/server/jobs/handlers";
import { FixedClock } from "@/server/integrations/clock";
import type { EmailDelivery, EmailMessage, EmailSender } from "@/server/integrations/email-sender";
import { createIsolatedTestDatabase, type IsolatedTestDatabase } from "../helpers/database";

const NOW = new Date("2026-07-18T12:00:00Z");
const AGENCY_MAILBOX = "newtec@example.test";

/** Captures what would have been mailed, and can be told to fail on demand. */
class CapturingEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failure: Error | null = null;
  rejectRecipients = false;

  async send(message: EmailMessage): Promise<EmailDelivery> {
    if (this.failure) throw this.failure;
    this.sent.push(message);
    const recipients = typeof message.to === "string" ? [message.to] : [...message.to];
    return this.rejectRecipients
      ? { providerMessageId: "rejected", accepted: [], rejected: recipients }
      : { providerMessageId: `message-${this.sent.length}`, accepted: recipients, rejected: [] };
  }
}

function inquiryInput(overrides: Record<string, unknown> = {}) {
  return {
    origin: "SFO",
    destination: "SGN",
    tripType: "ROUND_TRIP",
    departureDate: "2026-09-01",
    returnDate: "2026-09-15",
    flexibility: "PLUS_MINUS_1",
    cabinPreference: "ECONOMY",
    travelers: { adults: 2, children: 0, infants: 0 },
    passengers: [
      { type: "ADULT", givenName: "Ana", familyName: "Nguyen" },
      { type: "ADULT", givenName: "Minh", familyName: "Nguyen" }
    ],
    contact: {
      givenName: "Ana",
      familyName: "Nguyen",
      email: "ana@example.test",
      phone: "(415) 555-0142",
      preferredContactMethod: "PHONE",
      preferredLanguage: "vi"
    },
    visaInterest: false,
    transactionalConsent: true,
    partyDataAuthority: true,
    marketingConsent: false,
    ...overrides
  };
}

describe("inquiry intake", () => {
  let database: IsolatedTestDatabase;
  let emailSender: CapturingEmailSender;
  let handlers: ReturnType<typeof createJobHandlers>;

  beforeAll(async () => {
    database = await createIsolatedTestDatabase("inquiry_intake");
  });

  afterAll(async () => {
    await database?.cleanup();
  });

  beforeEach(async () => {
    await database.db.delete(inquiryNotifications);
    await database.db.delete(inquiryPassengers);
    await database.db.delete(inquiries);
    /* Jobs outlive the rows they point at, so each test starts with an empty queue. */
    await database.db.execute(sql`delete from graphile_worker._private_jobs`);
    emailSender = new CapturingEmailSender();
    handlers = createJobHandlers({
      db: database.db,
      emailSender,
      clock: new FixedClock(NOW),
      appUrl: "http://localhost:3000"
    });
  });

  async function pendingNotificationId(): Promise<string> {
    const [row] = await database.db
      .select({ id: inquiryNotifications.id })
      .from(inquiryNotifications)
      .limit(1);
    if (!row) throw new Error("no notification row was written");
    return row.id;
  }

  it("writes the request, the outbox row, and the job in one transaction", async () => {
    const created = await createInquiry(database.db, inquiryInput(), {
      idempotencyKey: "key-1",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });

    expect(created.reference).toMatch(/^TV-[A-Z0-9]+$/);

    const [stored] = await listInquiries(database.db);
    expect(stored?.phone).toBe("(415) 555-0142");
    expect(stored?.preferredContactMethod).toBe("PHONE");
    expect(stored?.notificationState).toBe("PENDING");

    // The job must be visible to the worker, not just the row it reads.
    const queued = await database.db.execute<{ task_identifier: string; priority: number }>(
      sql`select task_identifier, priority from graphile_worker.jobs`
    );
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0]?.task_identifier).toBe("notify_inquiry");
    /*
     * Below the default 0, so a lead never waits behind the rate-limited
     * calendar sweep when all four worker slots are busy.
     */
    expect(queued.rows[0]?.priority).toBeLessThan(0);
  });

  it("still records the request and the outbox row when email is switched off", async () => {
    await createInquiry(database.db, inquiryInput(), {
      idempotencyKey: "key-no-email",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: false,
      now: NOW
    });

    /*
     * The row and its pending outbox entry are written either way, so turning
     * email on later can pick up what arrived while it was off. Only the job is
     * withheld — a queued send against an unconfigured relay is just a failure
     * waiting to be explained.
     */
    const [stored] = await listInquiries(database.db);
    expect(stored?.notificationState).toBe("PENDING");
    const queued = await database.db.execute(sql`select 1 from graphile_worker.jobs`);
    expect(queued.rows).toHaveLength(0);
  });

  it("stores a one way with no return date and says so in the email", async () => {
    const { returnDate, ...roundTrip } = inquiryInput();
    expect(returnDate).toBe("2026-09-15");

    await createInquiry(
      database.db,
      { ...roundTrip, tripType: "ONE_WAY" },
      {
        idempotencyKey: "key-one-way",
        notificationRecipient: AGENCY_MAILBOX,
        sendNotificationEmail: true,
        now: NOW
      }
    );

    // The column check would have rejected a one way carrying a return date.
    const [stored] = await listInquiries(database.db);
    expect(stored?.tripType).toBe("ONE_WAY");
    expect(stored?.returnDate).toBeNull();

    await handlers.notify_inquiry({ notificationId: await pendingNotificationId() });
    // The customer must not read back a return leg they never asked for.
    expect(emailSender.sent[0]?.text).toContain("Một chiều");
    expect(emailSender.sent[0]?.text).not.toContain("15 tháng 9, 2026");
  });

  it("stores and mails the departure city the customer actually chose", async () => {
    /*
     * The column defaults to SFO, so an origin that is dropped anywhere between
     * the form and the insert would quietly turn a Los Angeles request into a
     * San Francisco one and send whoever calls back quoting the wrong flight.
     */
    await createInquiry(database.db, inquiryInput({ origin: "LAX" }), {
      idempotencyKey: "key-lax",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });

    const [stored] = await listInquiries(database.db);
    expect(stored?.origin).toBe("LAX");

    await handlers.notify_inquiry({ notificationId: await pendingNotificationId() });
    expect(emailSender.sent[0]?.text).toContain("LAX");
    expect(emailSender.sent[0]?.subject).toContain("LAX → TP. Hồ Chí Minh (SGN)");
  });

  it("carries the chosen flight through to the mailbox", async () => {
    const summary =
      "SFO-SGN round trip, flights VN99/VN98, depart 2026-09-01 23:55, " +
      "return 2026-09-15 08:10, $1,842.00 estimated total, ref off_abc123";

    await createInquiry(database.db, inquiryInput({ selectedOffer: summary }), {
      idempotencyKey: "key-selected",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });

    const [stored] = await listInquiries(database.db);
    expect(stored?.selectedOffer).toBe(summary);

    await handlers.notify_inquiry({ notificationId: await pendingNotificationId() });
    /*
     * The reply has to start from the flight that was on screen. A summary that
     * reaches the database but not the email would leave both sides of the
     * thread quoting different itineraries.
     */
    expect(emailSender.sent[0]?.text).toContain("Chuyến anh chị đã chọn");
    expect(emailSender.sent[0]?.text).toContain("off_abc123");
  });

  it("leaves the flight row out when a request came in without a search", async () => {
    await createInquiry(database.db, inquiryInput(), {
      idempotencyKey: "key-no-flight",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });

    await handlers.notify_inquiry({ notificationId: await pendingNotificationId() });
    /*
     * The customer reads this one. A row saying no flight was picked is a line
     * they have to read to learn nothing they did not already know.
     */
    expect(emailSender.sent[0]?.text).not.toContain("Chuyến anh chị đã chọn");
    expect(emailSender.sent[0]?.text).toContain("SFO → TP. Hồ Chí Minh (SGN)");
  });

  it("stores the passport manifest with the request and mails it out", async () => {
    await createInquiry(database.db, inquiryInput(), {
      idempotencyKey: "key-manifest",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });

    /*
     * The names are what the agency blocks the fare against, so they have to
     * survive the same transaction the request did and come back in order.
     */
    const [stored] = await listInquiries(database.db);
    expect(stored?.passengers.map((traveler) => traveler.givenName)).toEqual(["Ana", "Minh"]);
    expect(stored?.passengers[0]?.position).toBe(1);
    expect(stored?.passengers[1]?.position).toBe(2);

    await handlers.notify_inquiry({ notificationId: await pendingNotificationId() });
    expect(emailSender.sent[0]?.text).toContain("Người lớn 1: Nguyen, Ana");
    expect(emailSender.sent[0]?.text).toContain("Người lớn 2: Nguyen, Minh");
  });

  /*
   * The names are optional, so most of the value of this test is that a request
   * without them is still a lead: it lands and it mails, with the manifest row
   * left out rather than shown empty.
   */
  it("takes a request that carries no passport names yet", async () => {
    await createInquiry(database.db, inquiryInput({ passengers: [] }), {
      idempotencyKey: "key-no-manifest",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });

    const [stored] = await listInquiries(database.db);
    expect(stored?.passengers).toEqual([]);

    await handlers.notify_inquiry({ notificationId: await pendingNotificationId() });
    expect(emailSender.sent[0]?.text).not.toContain("Tên trên hộ chiếu");
    expect(emailSender.sent[0]?.text).toContain("Chào anh chị Ana,");
  });

  it("returns the first result when a submission is retried", async () => {
    const first = await createInquiry(database.db, inquiryInput(), {
      idempotencyKey: "key-retry",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });
    const second = await createInquiry(database.db, inquiryInput(), {
      idempotencyKey: "key-retry",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });

    expect(second).toEqual(first);
    // A double-clicked submit button must not become two leads to call.
    expect(await listInquiries(database.db)).toHaveLength(1);
  });

  it("welcomes the customer and copies the agency onto the same thread", async () => {
    await createInquiry(database.db, inquiryInput({ notes: "Prefers a morning departure" }), {
      idempotencyKey: "key-2",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });

    await handlers.notify_inquiry({ notificationId: await pendingNotificationId() });

    const [message] = emailSender.sent;
    expect(message?.to).toBe("ana@example.test");
    expect(message?.cc).toBe(AGENCY_MAILBOX);
    expect(message?.text).toContain("(415) 555-0142");
    // The form was filled in Vietnamese, so the welcome is written in it.
    expect(message?.text).toContain("Tôi là Hanh.");
    expect(message?.text).toContain("Prefers a morning departure");

    const [notification] = await database.db.select().from(inquiryNotifications);
    expect(notification?.state).toBe("SENT");
    expect(notification?.sentAt).not.toBeNull();
  });

  it("keeps the request and records why the email failed", async () => {
    await createInquiry(database.db, inquiryInput(), {
      idempotencyKey: "key-3",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });
    emailSender.failure = new Error("smtp connection refused");
    const notificationId = await pendingNotificationId();

    // Rethrowing is what buys the worker's retry; swallowing would lose the lead.
    await expect(handlers.notify_inquiry({ notificationId })).rejects.toThrow(
      "smtp connection refused"
    );

    const [notification] = await database.db
      .select()
      .from(inquiryNotifications)
      .where(eq(inquiryNotifications.id, notificationId));
    expect(notification?.state).toBe("FAILED");
    expect(notification?.attempts).toBe(1);
    expect(notification?.lastError).toContain("smtp connection refused");

    // The request itself survives, so /admin is still a complete record.
    const [visible] = await listInquiries(database.db);
    expect(visible?.email).toBe("ana@example.test");
    expect(visible?.notificationState).toBe("FAILED");
  });

  it("treats a mail server that accepts nobody as a failure", async () => {
    await createInquiry(database.db, inquiryInput(), {
      idempotencyKey: "key-4",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });
    emailSender.rejectRecipients = true;

    await expect(
      handlers.notify_inquiry({ notificationId: await pendingNotificationId() })
    ).rejects.toThrow(/accepted no recipients/);
  });

  it("does not send twice when a delivered job is retried", async () => {
    await createInquiry(database.db, inquiryInput(), {
      idempotencyKey: "key-5",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });
    const notificationId = await pendingNotificationId();

    await handlers.notify_inquiry({ notificationId });
    await handlers.notify_inquiry({ notificationId });

    expect(emailSender.sent).toHaveLength(1);
  });

  it("tracks who has already been called", async () => {
    const created = await createInquiry(database.db, inquiryInput(), {
      idempotencyKey: "key-6",
      notificationRecipient: AGENCY_MAILBOX,
      sendNotificationEmail: true,
      now: NOW
    });

    const processing = await setInquiryStatus(database.db, created.inquiryId, "PROCESSING", NOW);
    expect(processing.status).toBe("PROCESSING");
    expect(processing.contactedAt).toEqual(NOW);

    const reopened = await setInquiryStatus(database.db, created.inquiryId, "NEW", NOW);
    expect(reopened.contactedAt).toBeNull();
  });
});
