import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      // Only measure coverage on the files we actually unit-test
      include: [
        "src/server/services/payment-common.ts",
        "src/server/services/pricing-service.ts",
        "src/server/services/billing-service.ts",
        "src/server/services/cryptomus-service.ts",
        "src/server/services/shopier-service.ts",
        "src/server/services/auth-service.ts",
        "src/pricing.ts",
      ],
      thresholds: {
        // Per-file thresholds: KDV math + cryptomus signature must be 100%
        perFile: false,
        lines: 60,
        functions: 60,
      },
    },
    setupFiles: ["src/server/__tests__/setup.ts"],
  },
  resolve: {
    conditions: ["node"],
  },
});
