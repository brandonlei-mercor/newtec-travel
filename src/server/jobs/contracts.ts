import { z } from "zod";

export const JOB_NAMES = ["notify_inquiry"] as const;

export type JobName = (typeof JOB_NAMES)[number];

export const jobPayloadSchemas = {
  /** Sends the agency the one email announcing a new request. */
  notify_inquiry: z.object({ notificationId: z.uuid() }).strict()
} satisfies Record<JobName, z.ZodType>;

export type JobPayloads = {
  [Name in JobName]: z.infer<(typeof jobPayloadSchemas)[Name]>;
};

export type JobHandlers = {
  [Name in JobName]: (payload: JobPayloads[Name]) => Promise<void>;
};
