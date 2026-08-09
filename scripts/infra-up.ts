import { spawnSync } from "node:child_process";

function compose(args: string[]): void {
  const result = spawnSync("docker", ["compose", ...args], {
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

compose(["up", "-d", "--wait", "--wait-timeout", "120", "postgres", "mailpit"]);
