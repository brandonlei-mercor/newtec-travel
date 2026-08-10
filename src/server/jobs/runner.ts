import { run, runOnce, type Runner } from "graphile-worker";
import { env } from "../../shared/env";
import type { JobHandlers } from "./contracts";
import { createTaskList } from "./task-list";

/*
 * Nothing runs on a schedule any more. Every job is enqueued by something a
 * person did — today that is only the email announcing a new request — so the
 * worker sits idle until there is work rather than waking up to sweep caches.
 *
 * Said out loud with parsedCronItems, because left unsaid graphile-worker goes
 * looking for a crontab in the working directory and schedules whatever it
 * finds. A file this repo no longer uses was enough to stop the queue starting.
 */
export async function startWorker(handlers: JobHandlers): Promise<Runner> {
  return run({
    connectionString: env.DATABASE_URL,
    concurrency: 4,
    pollInterval: 1_000,
    noHandleSignals: true,
    parsedCronItems: [],
    taskList: createTaskList(handlers)
  });
}

export async function runOneJob(handlers: JobHandlers): Promise<void> {
  await runOnce(
    { connectionString: env.DATABASE_URL, noHandleSignals: true },
    createTaskList(handlers)
  );
}
