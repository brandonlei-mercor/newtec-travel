import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { SmtpEmailSender } from "@/server/integrations/email-sender";

const emailSender = new SmtpEmailSender();

afterAll(() => {
  emailSender.close();
});

describe("real loopback infrastructure", () => {
  it("delivers a transactional email to Mailpit", async () => {
    const recipient = `integration-${randomUUID()}@example.test`;
    const subject = `Local delivery ${randomUUID()}`;
    const delivery = await emailSender.send({
      to: recipient,
      subject,
      text: "A new flight request is waiting for a callback."
    });
    expect(delivery.accepted).toContain(recipient);
    expect(delivery.rejected).toEqual([]);

    const response = await fetch("http://127.0.0.1:8025/api/v1/messages");
    expect(response.ok).toBe(true);
    const inbox = (await response.json()) as {
      messages: { Subject: string; To: { Address: string }[] }[];
    };
    expect(
      inbox.messages.some(
        (message) =>
          message.Subject === subject && message.To.some((address) => address.Address === recipient)
      )
    ).toBe(true);
  });
});
