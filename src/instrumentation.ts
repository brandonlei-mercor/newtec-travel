import type { Runner } from "graphile-worker";

/*
 * The outbox drains inside the web server rather than in a service of its own.
 * A background worker costs a full instance a month to sit idle: every job is
 * enqueued by a person submitting a request, and sending one welcome email is
 * about a second of work. The process that writes the job now runs it.
 *
 * src/worker.ts still exists and still works. If sending ever needs its own
 * instance again, that is a new service pointed at `pnpm worker`, not a rewrite.
 */

let runner: Runner | null = null;

export async function register(): Promise<void> {
  /*
   * Next runs this hook once per runtime, and the middleware's runtime is the
   * edge one, where there is no Postgres driver and no process that outlives
   * the request. Production builds never call register() at all, so nothing
   * here reaches for a database while the image is being built.
   */
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (runner !== null) {
    return;
  }

  const [{ createApplicationContainer }, { startWorker }] = await Promise.all([
    import("@/server/container"),
    import("@/server/jobs")
  ]);

  const container = createApplicationContainer();

  try {
    runner = await startWorker(container.jobHandlers);
  } catch (error) {
    /*
     * Fail soft, and loudly. A request writes its outbox row inside the same
     * transaction as the inquiry, so a queue that will not start costs a late
     * email; a site that will not boot costs the lead itself. Sending resumes
     * on the next deploy, with nothing lost in between.
     */
    console.error("The inquiry queue did not start, so no email is being sent", error);
    await container.close();
    return;
  }

  /*
   * Next installs its own SIGTERM handler that ends in process.exit, so this
   * releases the connection pool and any held job lock on a best-effort basis
   * rather than a guaranteed one. A job whose worker disappears mid-send is
   * picked up again once its lock expires, which is why losing this race
   * delays an email instead of dropping it.
   */
  const stop = async (signal: string): Promise<void> => {
    const stopping = runner;
    runner = null;
    await stopping?.stop(signal);
    await container.close();
  };

  process.once("SIGTERM", () => void stop("SIGTERM"));
  process.once("SIGINT", () => void stop("SIGINT"));
}
