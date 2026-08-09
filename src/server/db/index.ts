import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema";

export function createDatabase(connectionString: string, overrides: PoolConfig = {}) {
  const pool = new Pool({ connectionString, max: 10, ...overrides });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Database = ReturnType<typeof createDatabase>["db"];
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

let singleton: ReturnType<typeof createDatabase> | undefined;

export function getDatabase() {
  if (!singleton) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    singleton = createDatabase(connectionString);
  }
  return singleton.db;
}

export async function closeDatabase() {
  if (singleton) {
    await singleton.pool.end();
    singleton = undefined;
  }
}

export * from "./schema";
