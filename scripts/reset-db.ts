import { config } from "dotenv";
import { Pool } from "pg";
import { basename } from "node:path";
import { migrateDatabase } from "./migrate";

config({ path: [".env.local", ".env"], quiet: true });

function assertSafeReset(connectionString: string): void {
  if (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("Database reset is forbidden in production");
  }
  const url = new URL(connectionString);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`Database reset requires a loopback host; received ${url.hostname}`);
  }
  const databaseName = url.pathname.slice(1);
  if (!databaseName) throw new Error("Database name is required");
  if (
    (process.env.APP_ENV === "test" || process.env.NODE_ENV === "test") &&
    !databaseName.endsWith("_test")
  ) {
    throw new Error("Test database names must end in _test");
  }
}

export async function resetDatabase(connectionString = process.env.DATABASE_URL): Promise<void> {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  assertSafeReset(connectionString);
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("drop schema if exists graphile_worker cascade");
    await pool.query("drop schema if exists public cascade");
    await pool.query("create schema public");
  } finally {
    await pool.end();
  }
  await migrateDatabase(connectionString);
}

if (process.argv[1] && basename(process.argv[1]) === "reset-db.ts") {
  void resetDatabase()
    .then(() => console.info("Database reset and migrated"))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
