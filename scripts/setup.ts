import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { COMPANY, COMPANY_SMTP_FROM } from "../src/shared/company";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(".env.local")) {
  writeFileSync(
    ".env.local",
    [
      "APP_ENV=local",
      "APP_URL=http://localhost:3000",
      "DATABASE_URL=postgres://travel:travel@127.0.0.1:55432/travel_dev",
      "DATABASE_TEST_URL=postgres://travel:travel@127.0.0.1:55432/travel_test",
      "FLIGHT_SEARCH_PROVIDER=duffel",
      // Left blank on purpose: prices are live Duffel data and there is no
      // fallback, so the app should fail loudly until a real token is pasted in.
      "DUFFEL_ACCESS_TOKEN=",
      "DUFFEL_API_URL=https://api.duffel.com",
      "DUFFEL_SUPPLIER_TIMEOUT_MS=20000",
      "SMTP_HOST=127.0.0.1",
      "SMTP_PORT=1025",
      `SMTP_FROM=${COMPANY_SMTP_FROM}`,
      `INQUIRY_NOTIFICATION_EMAIL=${COMPANY.email.address}`,
      "INQUIRY_EMAIL_ENABLED=false",
      // Generated rather than defaulted: a development box that is briefly
      // reachable should not be guarded by a password everyone can read.
      `ADMIN_PASSWORD=${randomBytes(18).toString("base64url")}`,
      ""
    ].join("\n")
  );
  console.log("Created .env.local. Add your Duffel access token before running `pnpm dev`.");
}

run("pnpm", ["infra:up"]);
run("pnpm", ["db:migrate"]);
console.log("\nLocal setup complete. Run `pnpm dev` and open http://localhost:3000/en");
