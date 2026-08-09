import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

// Keep the credential-free PR suite on Chromium while exercising the same
// scenarios against the other browser engines in the scheduled workflow.
export default defineConfig({
  ...baseConfig,
  projects: [
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } }
  ]
});
