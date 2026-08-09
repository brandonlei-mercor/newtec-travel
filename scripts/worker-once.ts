import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main(): Promise<void> {
  const [{ createApplicationContainer }, { runOneJob }] = await Promise.all([
    import("../src/server/container"),
    import("../src/server/jobs")
  ]);

  const container = createApplicationContainer();
  try {
    await runOneJob(container.jobHandlers);
  } finally {
    await container.close();
  }
}

void main().catch((error: unknown) => {
  console.error("One-shot worker failed", error);
  process.exitCode = 1;
});
