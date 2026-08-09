import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { runMigrations as runGraphileMigrations } from "graphile-worker";
import { basename } from "node:path";
import { createDatabase } from "../src/server/db";

config({ path: [".env.local", ".env"], quiet: true });

export async function migrateDatabase(connectionString = process.env.DATABASE_URL): Promise<void> {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  await runGraphileMigrations({ connectionString, noHandleSignals: true });
  const { db, pool } = createDatabase(connectionString, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && basename(process.argv[1]) === "migrate.ts") {
  void migrateDatabase()
    .then(() => console.info("Database migrations complete"))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
