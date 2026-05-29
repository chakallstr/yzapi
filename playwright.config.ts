import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for deploy-sync-hardening verification.
 * Assumes a locally running server at E2E_BASE_URL (default http://127.0.0.1:4567).
 */
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:4567";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
