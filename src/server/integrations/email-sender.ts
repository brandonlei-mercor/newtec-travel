import nodemailer from "nodemailer";
import { env } from "../../shared/env";

/**
 * An image carried with the message and referenced from the HTML as `cid:<cid>`
 * rather than fetched from a URL. Remote images are blocked by default in every
 * major client until the reader trusts the sender, and a signature that appears
 * as a broken box the first time is worse than none.
 */
export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
};

export type EmailMessage = {
  to: string | readonly string[];
  cc?: string | readonly string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Readonly<Record<string, string>>;
  attachments?: readonly EmailAttachment[];
};

export type EmailDelivery = {
  providerMessageId: string;
  accepted: readonly string[];
  rejected: readonly string[];
};

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailDelivery>;
  close?(): void | Promise<void>;
}

export type SmtpConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
};

export type SmtpTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  pool: true;
  maxConnections: number;
  requireTLS?: true;
  auth?: { user: string; pass: string };
};

/**
 * Turns the configured mailbox into nodemailer options. Split out from the
 * transport itself so the TLS rule below can be asserted in a unit test without
 * opening a socket.
 */
export function buildSmtpTransportOptions(config: SmtpConfiguration): SmtpTransportOptions {
  const options: SmtpTransportOptions = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    pool: true,
    maxConnections: 3
  };
  // Half a credential is a configuration error, not a reason to connect
  // anonymously; env.ts rejects it at boot and this agrees with that.
  if (config.user === undefined || config.password === undefined) return options;
  /*
   * On 465 the socket is already encrypted. On 587 nodemailer would otherwise
   * upgrade only if the server advertises STARTTLS, so a relay that omits it,
   * or a machine-in-the-middle that strips it, would get the password in the
   * clear. Demanding the upgrade fails the send instead.
   */
  return {
    ...options,
    ...(config.secure ? {} : { requireTLS: true }),
    auth: { user: config.user, pass: config.password }
  };
}

function joinAddresses(addresses: string | readonly string[]): string {
  return typeof addresses === "string" ? addresses : [...addresses].join(", ");
}

function createSmtpTransport() {
  return nodemailer.createTransport(
    buildSmtpTransportOptions({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD
    })
  );
}

export class SmtpEmailSender implements EmailSender {
  private readonly transporter: ReturnType<typeof createSmtpTransport>;

  constructor(transporter = createSmtpTransport()) {
    this.transporter = transporter;
  }

  async send(message: EmailMessage): Promise<EmailDelivery> {
    const result = await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to: joinAddresses(message.to),
      ...(message.cc === undefined ? {} : { cc: joinAddresses(message.cc) }),
      subject: message.subject,
      text: message.text,
      ...(message.html === undefined ? {} : { html: message.html }),
      ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
      ...(message.headers === undefined ? {} : { headers: { ...message.headers } }),
      ...(message.attachments === undefined
        ? {}
        : { attachments: message.attachments.map((file) => ({ ...file })) })
    });
    return {
      providerMessageId: String(result.messageId),
      accepted: result.accepted.map(String),
      rejected: result.rejected.map(String)
    };
  }

  close(): void {
    this.transporter.close();
  }
}
