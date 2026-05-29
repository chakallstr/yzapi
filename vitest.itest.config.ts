import { defineConfig } from "vitest/config";

/**
 * Integration test config — requires a live Postgres (npm run db:up + migrate).
 * Separate from the default unit config so `npm test` never needs a DB.
 * No mock-DB setup file: these tests use the real ./db/client connection.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.itest.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["src/server/__tests__/itest-setup.ts"],
  },
  resolve: {
    conditions: ["node"],
  },
});
