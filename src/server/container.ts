import { closeDatabase, getDatabase, type Database } from "./db";
import { SmtpEmailSender, SystemClock, type Clock, type EmailSender } from "./integrations";
import { createJobHandlers, type JobHandlerDependencies } from "./jobs/handlers";
import type { JobHandlers } from "./jobs";
import { env } from "../shared/env";

export type ApplicationContainer = {
  db: Database;
  emailSender: EmailSender;
  clock: Clock;
  jobHandlers: JobHandlers;
  close(): Promise<void>;
};

/**
 * The worker's composition root. Deliberately narrow: the only background work
 * is sending the agency its notification email, so the worker process needs a
 * database and a mailbox and nothing else. Flight shopping is a request-time
 * concern and builds its own provider, which keeps the Duffel credential out of
 * the requirements for a process that never shops.
 */
export function createApplicationContainer(): ApplicationContainer {
  const dependencies: JobHandlerDependencies = {
    db: getDatabase(),
    emailSender: new SmtpEmailSender(),
    clock: new SystemClock(),
    appUrl: env.APP_URL
  };
  return {
    ...dependencies,
    jobHandlers: createJobHandlers(dependencies),
    close: async () => {
      await dependencies.emailSender.close?.();
      await closeDatabase();
    }
  };
}
