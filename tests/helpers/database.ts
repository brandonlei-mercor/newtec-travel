import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { createDatabase, type Database } from "@/server/db";
import { migrateDatabase } from "../../scripts/migrate";

const DEFAULT_TEST_DATABASE_URL = "postgres://travel:travel@127.0.0.1:55432/travel_test";

export type IsolatedTestDatabase = {
  url: string;
  name: string;
  db: Database;
  pool: Pool;
  cleanup(): Promise<void>;
};

/**
 * Creates a real, disposable PostgreSQL database derived from DATABASE_TEST_URL.
 * Every database ends in `_test`, remains loopback-only, and is dropped after the
 * suite. Every database starts empty: there is no demo seed, so a test that
 * needs a row inserts it and says what it is testing.
 */
export async function createIsolatedTestDatabase(label: string): Promise<IsolatedTestDatabase> {
  const baseUrl = new URL(process.env.DATABASE_TEST_URL ?? DEFAULT_TEST_DATABASE_URL);
  assertSafeTestUrl(baseUrl);

  const safeLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 18);
  const suffix = randomBytes(4).toString("hex");
  const name = `travel_${safeLabel}_${process.pid}_${suffix}_test`;
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });

  try {
    await admin.query(`create database ${quoteIdentifier(name)}`);
  } finally {
    await admin.end();
  }

  const databaseUrl = new URL(baseUrl);
  databaseUrl.pathname = `/${name}`;
  const url = databaseUrl.toString();

  try {
    await migrateDatabase(url);
  } catch (error) {
    await dropDatabase(adminUrl.toString(), name);
    throw error;
  }

  const { db, pool } = createDatabase(url, { max: 8 });
  let cleaned = false;
  return {
    url,
    name,
    db,
    pool,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await pool.end();
      await dropDatabase(adminUrl.toString(), name);
    }
  };
}

function assertSafeTestUrl(url: URL): void {
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`Integration tests require a loopback database; received ${url.hostname}`);
  }
  const databaseName = url.pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error(`DATABASE_TEST_URL database must end in _test; received ${databaseName}`);
  }
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z0-9_]+$/.test(identifier)) throw new Error("Unsafe test database identifier");
  return `"${identifier}"`;
}

async function dropDatabase(adminUrl: string, name: string): Promise<void> {
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    await admin.query(`drop database if exists ${quoteIdentifier(name)} with (force)`);
  } finally {
    await admin.end();
  }
}
