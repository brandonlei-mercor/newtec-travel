import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") }
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
      exclude: [
        "src/app/**",
        "src/server/db/schema/**",
        "src/modules/**/*service.ts",
        "src/modules/workflows/errors.ts",
        "src/modules/workflows/idempotency.ts",
        "src/components/shared/**",
        "src/components/customer/api.ts",
        "src/components/customer/format.ts",
        "src/shared/env.ts",
        "scripts/**"
      ]
    },
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 30000
        }
      },
      { extends: true, test: { name: "security", include: ["tests/security/**/*.test.ts"] } }
    ]
  }
});
