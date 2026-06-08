import { describe, expect, it } from "vitest";
import { computeAdminTrafficAnalytics } from "./admin-traffic-service.js";

describe("admin traffic analytics service", () => {
  it("aggregates usage, costs, providers, users, api keys, and errors for 24h window", () => {
    const now = new Date("2026-05-29T09:00:00.000Z");

    const analytics = computeAdminTrafficAnalytics({
      window: "24h",
      now,
      userRows: [
        {
          id: "user-1",
          email: "a@example.com",
          adSoyad: "User A",
          bakiyeTL: "120.00",
          toplamHarcamaTL: "50.00",
          toplamIstek: 10,
          durum: "aktif",
          kayitTarihi: now,
          sonAktivite: now,
          plan: "pro",
          apiKeyCount: 1,
          not: "",
          gunlukLimitTL: null,
          passwordHash: null,
          googleId: null,
          githubId: null,
          lang: "tr",
          role: "user",
          lastLowBalanceAlert: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "user-2",
          email: "b@example.com",
          adSoyad: "User B",
          bakiyeTL: "90.00",
          toplamHarcamaTL: "20.00",
          toplamIstek: 4,
          durum: "aktif",
          kayitTarihi: now,
          sonAktivite: now,
          plan: "ucretsiz",
          apiKeyCount: 1,
          not: "",
          gunlukLimitTL: null,
          passwordHash: null,
          googleId: null,
          githubId: null,
          lang: "tr",
          role: "user",
          lastLowBalanceAlert: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      apiKeyRows: [
        {
          id: "key-1",
          userId: "user-1",
          ad: "main",
          maskedKey: "yzk_live_***1",
          keyHash: null,
          fullKeyCipher: null,
          prefix: "yzk_live_",
          olusturma: now,
          sonKullanim: now,
          aktif: true,
          createdAt: now,
        },
        {
          id: "key-2",
          userId: "user-2",
          ad: "secondary",
          maskedKey: "yzk_live_***2",
          keyHash: null,
          fullKeyCipher: null,
          prefix: "yzk_live_",
          olusturma: now,
          sonKullanim: now,
          aktif: true,
          createdAt: now,
        },
      ],
      usageRows: [
        {
          id: "u1",
          userId: "user-1",
          apiKeyId: "key-1",
          modelId: "gpt-5.5",
          type: "chat",
          inputUsage: 100,
          outputUsage: 50,
          unitsUsage: "150.0",
          costUsd: "1.50",
          costTL: "70.50",
          remainingTL: "49.50",
          requestId: "req-1",
          upstreamRequestId: "up-1",
          rawUsageJson: null,
          pricingSnapshotJson: null,
          errorCode: null,
          responseMs: 900,
          status: "success",
          timestamp: new Date("2026-05-29T08:00:00.000Z"),
          billedVia: "balance",
          entitlementId: null,
          providerProfileId: null,
        },
        {
          id: "u2",
          userId: "user-1",
          apiKeyId: "key-1",
          modelId: "gpt-5.4-mini",
          type: "chat",
          inputUsage: 60,
          outputUsage: 40,
          unitsUsage: "100.0",
          costUsd: "0.50",
          costTL: "23.50",
          remainingTL: "26.00",
          requestId: "req-2",
          upstreamRequestId: "up-2",
          rawUsageJson: null,
          pricingSnapshotJson: null,
          errorCode: "provider_timeout",
          responseMs: 1200,
          status: "error",
          timestamp: new Date("2026-05-29T07:00:00.000Z"),
          billedVia: "balance",
          entitlementId: null,
          providerProfileId: null,
        },
        {
          id: "u3",
          userId: "user-2",
          apiKeyId: "key-2",
          modelId: "claude-sonnet-4-6",
          type: "messages",
          inputUsage: 80,
          outputUsage: 20,
          unitsUsage: "100.0",
          costUsd: "0.62",
          costTL: "29.26",
          remainingTL: "60.74",
          requestId: "req-3",
          upstreamRequestId: "up-3",
          rawUsageJson: null,
          pricingSnapshotJson: null,
          errorCode: null,
          responseMs: 700,
          status: "success",
          timestamp: new Date("2026-05-28T18:00:00.000Z"),
          billedVia: "balance",
          entitlementId: null,
          providerProfileId: null,
        },
      ],
      transactionRows: [
        {
          id: "t1",
          userId: "user-1",
          userEmail: "a@example.com",
          tip: "manuel",
          miktarTL: "100.00",
          oncekiBakiye: "0.00",
          sonrakiBakiye: "100.00",
          aciklama: "Yükleme",
          metod: "iban",
          timestamp: new Date("2026-05-29T06:00:00.000Z"),
          idempotencyKey: null,
        },
        {
          id: "t2",
          userId: "user-1",
          userEmail: "a@example.com",
          tip: "kullanim",
          miktarTL: "-23.50",
          oncekiBakiye: "49.50",
          sonrakiBakiye: "26.00",
          aciklama: "Kullanım",
          metod: null,
          timestamp: new Date("2026-05-29T07:00:00.000Z"),
          idempotencyKey: null,
        },
      ],
    });

    expect(analytics.overview.totalRequests).toBe(3);
    expect(analytics.overview.successfulRequests).toBe(2);
    expect(analytics.overview.failedRequests).toBe(1);
    expect(analytics.overview.totalInputTokens).toBe(240);
    expect(analytics.overview.totalOutputTokens).toBe(110);
    expect(analytics.overview.totalTokens).toBe(350);
    expect(analytics.overview.totalCostTL).toBe(123.26);
    expect(analytics.overview.activeUserCount).toBe(2);
    expect(analytics.overview.activeApiKeyCount).toBe(2);
    expect(analytics.overview.topModel).toMatchObject({ modelId: "gpt-5.5" });
    expect(analytics.overview.topProvider).toMatchObject({ provider: "openai" });
    expect(analytics.overview.creditsTL).toBe(100);
    expect(analytics.overview.debitsTL).toBe(23.5);

    expect(analytics.models[0]).toMatchObject({
      id: "gpt-5.5",
      providerSlug: "openai",
      requestCount: 1,
    });
    expect(analytics.providers.find((row) => row.id === "openai")).toMatchObject({
      requestCount: 2,
      errorCount: 1,
    });
    expect(analytics.users.find((row) => row.userId === "user-1")).toMatchObject({
      email: "a@example.com",
      requestCount: 2,
      totalTokens: 250,
      errorCount: 1,
    });
    expect(analytics.apiKeys.find((row) => row.apiKeyId === "key-1")).toMatchObject({
      maskedKey: "yzk_live_***1",
      requestCount: 2,
      errorCount: 1,
    });
    expect(analytics.errors.failureRate).toBe(33.33);
    expect(analytics.errors.errorCodes[0]).toMatchObject({ code: "provider_timeout", count: 1 });
    expect(analytics.errors.recent[0]).toMatchObject({
      requestId: "req-2",
      provider: "openai",
    });
    expect(analytics.timeseries.some((row) => row.requestCount > 0)).toBe(true);
  });

  it("returns safe empty analytics and daily buckets for wider windows", () => {
    const now = new Date("2026-05-29T09:00:00.000Z");
    const analytics = computeAdminTrafficAnalytics({
      window: "7d",
      now,
      userRows: [],
      apiKeyRows: [],
      usageRows: [],
      transactionRows: [],
    });

    expect(analytics.overview.totalRequests).toBe(0);
    expect(analytics.overview.failedRequests).toBe(0);
    expect(analytics.overview.totalCostTL).toBe(0);
    expect(analytics.errors.failureRate).toBe(0);
    expect(analytics.users).toEqual([]);
    expect(analytics.apiKeys).toEqual([]);
    expect(analytics.models).toEqual([]);
    expect(analytics.providers).toEqual([]);
    expect(analytics.timeseries.length).toBeGreaterThanOrEqual(7);
    expect(analytics.timeseries.every((row) => row.requestCount === 0)).toBe(true);
    expect(analytics.timeseries.every((row) => row.label.length > 0)).toBe(true);
  });

  it("labels added_models (e.g. claude-opus-4.8) via catalogModels instead of unknown", () => {
    const now = new Date("2026-05-29T09:00:00.000Z");
    const baseUsageRow = {
      id: "ux",
      userId: "user-1",
      apiKeyId: null,
      type: "messages",
      inputUsage: 100,
      outputUsage: 20,
      unitsUsage: "120.0",
      costUsd: "0.10",
      costTL: "4.50",
      remainingTL: "0.00",
      requestId: "req-x",
      upstreamRequestId: null,
      rawUsageJson: null,
      pricingSnapshotJson: null,
      errorCode: null,
      responseMs: 500,
      status: "success",
      timestamp: new Date("2026-05-29T08:00:00.000Z"),
    } as any;

    // Without catalogModels the added model is unknown (regression baseline).
    const withoutCatalog = computeAdminTrafficAnalytics({
      window: "24h",
      now,
      userRows: [],
      apiKeyRows: [],
      transactionRows: [],
      usageRows: [{ ...baseUsageRow, modelId: "claude-opus-4.8" }],
    });
    expect(withoutCatalog.models[0]).toMatchObject({ id: "claude-opus-4.8", providerSlug: "unknown" });

    // With catalogModels (merged catalog incl. added_models) the label resolves.
    const withCatalog = computeAdminTrafficAnalytics({
      window: "24h",
      now,
      userRows: [],
      apiKeyRows: [],
      transactionRows: [],
      usageRows: [{ ...baseUsageRow, modelId: "claude-opus-4.8" }],
      catalogModels: [
        { id: "claude-opus-4.8", name: "Claude Opus 4.8", provider: "Anthropic", providerSlug: "anthropic" },
      ],
    });
    expect(withCatalog.models[0]).toMatchObject({
      id: "claude-opus-4.8",
      name: "Claude Opus 4.8",
      provider: "Anthropic",
      providerSlug: "anthropic",
    });
    expect(withCatalog.providers.find((row) => row.id === "anthropic")).toMatchObject({ requestCount: 1 });
  });
});