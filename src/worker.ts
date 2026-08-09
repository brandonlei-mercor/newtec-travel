import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main(): Promise<void> {
  const [{ createApplicationContainer }, { startWorker }] = await Promise.all([
    import("@/server/container"),
    import("@/server/jobs")
  ]);
  const container = createApplicationContainer();
  const runner = await startWorker(container.jobHandlers);

  async function shutdown(signal: string) {
    await runner.stop(signal);
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  try {
    await runner.promise;
  } finally {
    await container.close();
  }
}

void main().catch((error: unknown) => {
  console.error("Worker terminated unexpectedly", error);
  process.exitCode = 1;
});
