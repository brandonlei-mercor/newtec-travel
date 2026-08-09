import { describe, expect, it } from "vitest";
import { buildSmtpTransportOptions } from "../../../src/server/integrations/email-sender";

const mailpit = { host: "127.0.0.1", port: 1025, secure: false };
const relay = { host: "smtp.mail.att.net", port: 465, secure: true };

describe("SMTP transport options", () => {
  it("connects anonymously to the local mail catcher", () => {
    const options = buildSmtpTransportOptions(mailpit);
    expect(options.auth).toBeUndefined();
    // Mailpit speaks plain SMTP; demanding STARTTLS would break local dev.
    expect(options.requireTLS).toBeUndefined();
    expect(options).toMatchObject({ ...mailpit, pool: true });
  });

  it("authenticates when a credential is configured", () => {
    const options = buildSmtpTransportOptions({
      ...relay,
      user: "newtec@sbcglobal.net",
      password: "secure-mail-key"
    });
    expect(options.auth).toEqual({ user: "newtec@sbcglobal.net", pass: "secure-mail-key" });
    // The socket is encrypted from the first byte on 465, so there is nothing
    // to upgrade and requireTLS would be redundant.
    expect(options.requireTLS).toBeUndefined();
  });

  /*
   * The one rule worth a test of its own: on a submission port the password
   * must never be allowed onto a link that stayed in the clear, whether because
   * the relay never advertised STARTTLS or because something stripped it.
   */
  it("demands the TLS upgrade when authenticating on a plaintext port", () => {
    const options = buildSmtpTransportOptions({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: "newtec@gmail.com",
      password: "app-password"
    });
    expect(options.requireTLS).toBe(true);
    expect(options.auth).toEqual({ user: "newtec@gmail.com", pass: "app-password" });
  });

  it("never sends half a credential", () => {
    const halves = [
      { ...relay, user: "newtec@sbcglobal.net" },
      { ...relay, password: "secure-mail-key" }
    ];
    for (const config of halves) {
      const options = buildSmtpTransportOptions(config);
      expect(options.auth).toBeUndefined();
    }
  });
});
