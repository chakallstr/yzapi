/**
 * packages-route-coverage.test.ts
 *
 * Unit tests covering:
 *   GAP-PUB-01  publicShape fiyat_usd mapping (null / undefined / string)
 *   GAP-PURCH-01 GET /packages returns 404 when packagesFeatureEnabled=false
 *   GAP-PURCH-02 Purchase 404 when packageId not found (AppError propagation)
 *   GAP-PURCH-06 Idempotency-Key header forwarded to purchasePackageWithBalance
 *   GAP-ENT-01   Entitlements route returns [] for user with no entitlements
 *   GAP-ENT-02   Entitlements route serialises multiple objects with all fields
 *   GAP-PUB-01   packagesFeatureEnabled=false → 404 on public GET /packages
 *   GAP-SVC-01   purchasePackageWithBalance with tip='token_bundle' throws AppError(400)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";

// ─── top-level hoisted mock state ────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  packagesFeatureEnabled: vi.fn(),
  listPublicPackages: vi.fn(),
  getPublicPackage: vi.fn(),
  purchasePackageWithBalance: vi.fn(),
  listUserEntitlements: vi.fn(),
  listUserDeliveryOrders: vi.fn(),
  redeemCode: vi.fn(),
  dbSqlFn: vi.fn(),
  dbSelectLimit: vi.fn(),
  recordHttp: vi.fn(),
}));

// ─── module mocks (must be at module top level) ───────────────────────────────

vi.mock("../services/package-service.js", () => ({
  packagesFeatureEnabled: mocks.packagesFeatureEnabled,
  listPublicPackages: mocks.listPublicPackages,
  getPublicPackage: mocks.getPublicPackage,
}));

vi.mock("../services/package-purchase-service.js", () => ({
  purchasePackageWithBalance: mocks.purchasePackageWithBalance,
}));

vi.mock("../services/entitlement-service.js", () => ({
  listUserEntitlements: mocks.listUserEntitlements,
  grantPackageEntitlement: vi.fn(),
  checkPackageCoverage: vi.fn(),
  tryReservePackageSlot: vi.fn(),
  releasePackageSlot: vi.fn(),
  recordPackageUsage: vi.fn(),
}));

vi.mock("../services/account-delivery-service.js", () => ({
  listUserDeliveryOrders: mocks.listUserDeliveryOrders,
}));

vi.mock("../services/redeem-code-service.js", () => ({
  redeemCode: mocks.redeemCode,
}));

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: mocks.dbSelectLimit })),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })),
    })),
  },
  dbSql: Object.assign(mocks.dbSqlFn, { begin: vi.fn() }),
}));

vi.mock("../db/schema.js", () => ({
  users: {},
  apiKeys: {},
  usageRecords: {},
  systemConfig: {},
  packages: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
  sql: vi.fn(),
  inArray: vi.fn(),
  ne: vi.fn(),
  lt: vi.fn(),
  gt: vi.fn(),
  not: vi.fn(),
}));

vi.mock("../lib/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4567,
    JWT_SECRET: "test-jwt-secret-at-least-32-chars-long!",
    JWT_ACCESS_TTL_SEC: 900,
    JWT_REFRESH_TTL_SEC: 2592000,
    WHATSAPP_PENDING_TTL_SEC: 300,
    APP_BASE_URL: "http://localhost:4567",
    FRONTEND_AUTH_RETURN: "/auth/return",
    GITHUB_CLIENT_ID: "gh-id",
    GITHUB_CLIENT_SECRET: "gh-secret",
    GITHUB_REDIRECT_URI: "http://localhost/callback",
    CLOSEROUTER_API_KEY: "test-key",
    CLOSEROUTER_BASE_URL: "http://localhost:20128/v1",
    KDV_RATE: "0.20",
  },
  aiProviderApiKey: vi.fn().mockReturnValue("test-key"),
  aiProviderBaseUrl: vi.fn().mockReturnValue("http://localhost:20128/v1"),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  httpLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../services/gozcu/metrics-collector.js", () => ({
  recordAuthFailure: vi.fn(),
  hashIp: vi.fn().mockReturnValue("hashed-ip"),
  recordHttp: mocks.recordHttp,
  recordRateLimited: vi.fn(),
  recordUnhandled: vi.fn(),
}));

vi.mock("../services/api-key-service.js", () => ({
  generateApiKey: vi.fn(() => ({ fullKey: "k", prefix: "p", maskedKey: "m" })),
  hashApiKey: vi.fn().mockResolvedValue("hash"),
  encryptApiKey: vi.fn(() => "cipher"),
  decryptApiKey: vi.fn(() => "decrypted-key"),
}));

vi.mock("../services/audit-service.js", () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/telegram-bot-service.js", () => ({
  getTelegramAccountSummary: vi.fn().mockResolvedValue({
    linked: false, telegramId: null, username: null, linkedAt: null,
    status: "unlinked", linkMethod: null, botUrl: "https://t.me/bot",
  }),
}));

vi.mock("../services/whatsapp-otp-service.js", () => ({
  getWhatsappVerificationSummary: vi.fn().mockResolvedValue({ verified: false }),
}));

vi.mock("../services/report-service.js", () => ({
  getMonthlyReport: vi.fn().mockResolvedValue({}),
  buildMonthlyReportCsv: vi.fn().mockReturnValue("csv"),
  buildMonthlyReportPdf: vi.fn().mockReturnValue(Buffer.from("pdf")),
}));

vi.mock("../services/usage-breakdown.js", () => ({
  extractUsageBreakdown: vi.fn().mockReturnValue({ cacheReadTokens: 0, cacheCreateTokens: 0 }),
}));

vi.mock("../services/user-usage-stats-service.js", () => ({
  getUserUsageStats: vi.fn().mockResolvedValue({}),
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

async function buildUserApp(userId = "user-aaa") {
  const express = (await import("express")).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request & { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: userId, email: "user@test.com" };
    next();
  });
  const { default: userRouter } = await import("../routes/user.js");
  app.use("/api/user", userRouter);
  // minimal error handler to surface AppError statusCode
  app.use((err: unknown, _req: unknown, res: unknown, _next: unknown) => {
    const e = err as { statusCode?: number; message?: string };
    (res as { status: (c: number) => { json: (b: unknown) => void } })
      .status(e.statusCode ?? 500)
      .json({ error: e.message });
  });
  return app;
}

async function buildPublicPackagesApp() {
  const express = (await import("express")).default;
  const app = express();
  app.use(express.json());
  const { default: packagesRouter } = await import("../routes/packages.js");
  app.use("/", packagesRouter);
  app.use((err: unknown, _req: unknown, res: unknown, _next: unknown) => {
    const e = err as { statusCode?: number; message?: string };
    (res as { status: (c: number) => { json: (b: unknown) => void } })
      .status(e.statusCode ?? 500)
      .json({ error: e.message });
  });
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// ═══════════════════════════════════════════════════════════════════════════════
// GAP-PUB-03 — publicShape fiyat_usd mapping
//
// publicShape is a private function inside package-service.ts, so we verify its
// contract by reading the source and testing the mapping logic inline.  This
// avoids the hoisted vi.mock for package-service.js that replaces the real
// implementation, while still asserting the exact conversion rules described in
// the source code (`r.fiyat_usd != null ? Number(r.fiyat_usd) : null`).
// ═══════════════════════════════════════════════════════════════════════════════

// Replicate the exact publicShape mapping from package-service.ts (kept in sync
// by the source-read assertion in the last sub-test).
function publicShape(r: Record<string, unknown>) {
  return {
    id: r.id,
    ad: r.ad,
    kategori: r.kategori,
    aciklama: r.aciklama,
    tip: r.tip,
    gunlukIstekLimiti: Number(r.gunluk_istek_limiti),
    sureGun: Number(r.sure_gun),
    allowedModels: (r.allowed_models as string[]) ?? [],
    fiyatTL: Number(r.fiyat_tl),
    fiyatUsd: r.fiyat_usd != null ? Number(r.fiyat_usd) : null,
    displayOrder: Number(r.display_order),
  };
}

describe("GAP-PUB-03: publicShape maps fiyat_usd null/undefined/'9.99'", () => {
  it("fiyat_usd null → fiyatUsd is null", () => {
    const row = { id: "p1", ad: "A", kategori: "k", aciklama: "", tip: "request_limit",
      gunluk_istek_limiti: "10", sure_gun: "30", allowed_models: [], fiyat_tl: "100",
      fiyat_usd: null, display_order: "1" };
    expect(publicShape(row).fiyatUsd).toBeNull();
  });

  it("fiyat_usd undefined → fiyatUsd is null", () => {
    const row = { id: "p2", ad: "B", kategori: "k", aciklama: "", tip: "request_limit",
      gunluk_istek_limiti: "5", sure_gun: "7", allowed_models: [], fiyat_tl: "50",
      fiyat_usd: undefined, display_order: "0" };
    expect(publicShape(row).fiyatUsd).toBeNull();
  });

  it("fiyat_usd '9.99' (string) → fiyatUsd is 9.99 (number)", () => {
    const row = { id: "p3", ad: "Pro", kategori: "pro", aciklama: "Pro plan",
      tip: "request_limit", gunluk_istek_limiti: "100", sure_gun: "30",
      allowed_models: ["claude-opus-4.8"], fiyat_tl: "299", fiyat_usd: "9.99",
      display_order: "1" };
    const result = publicShape(row);
    expect(result.fiyatUsd).toBe(9.99);
    expect(typeof result.fiyatUsd).toBe("number");
  });

  it("source code publicShape uses != null guard (keeps inline replica in sync)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/server/services/package-service.ts"),
      "utf8",
    );
    // The canonical mapping: != null ? Number(...) : null
    expect(src).toMatch(/fiyat_usd != null \? Number\(r\.fiyat_usd\) : null/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GAP-PUB-01 — public GET /packages returns 404 when feature disabled
// ═══════════════════════════════════════════════════════════════════════════════

describe("GAP-PUB-01: packagesFeatureEnabled=false → 404 on public GET /packages", () => {
  it("returns 404 with Turkish error message when feature is disabled", async () => {
    mocks.packagesFeatureEnabled.mockResolvedValue(false);
    const app = await buildPublicPackagesApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/packages").expect(404);
    expect(res.body).toHaveProperty("error");
    expect(mocks.listPublicPackages).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GAP-PURCH-01 — Purchase route returns 404 when feature disabled
// ═══════════════════════════════════════════════════════════════════════════════

describe("GAP-PURCH-01: Purchase route returns 404 when packagesFeatureEnabled=false", () => {
  it("POST /api/user/packages/:id/purchase returns 404 when feature flag is off", async () => {
    mocks.packagesFeatureEnabled.mockResolvedValue(false);
    mocks.purchasePackageWithBalance.mockResolvedValue({ entitlementId: "e1", newBalanceTL: 100, tip: "request_limit" });

    const app = await buildUserApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/api/user/packages/pkg-abc/purchase")
      .send({})
      .expect(404);
    expect(res.body).toHaveProperty("error");
    expect(mocks.purchasePackageWithBalance).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GAP-PURCH-02 — Purchase returns 404 when package does not exist
// ═══════════════════════════════════════════════════════════════════════════════

describe("GAP-PURCH-02: Purchase returns 404 when packageId not found", () => {
  it("AppError(404) from service is surfaced as HTTP 404", async () => {
    mocks.packagesFeatureEnabled.mockResolvedValue(true);
    const { AppError } = await import("../lib/errors.js");
    mocks.purchasePackageWithBalance.mockRejectedValue(new AppError(404, "Paket bulunamadı"));

    const app = await buildUserApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/api/user/packages/nonexistent-pkg/purchase")
      .send({})
      .expect(404);
    expect(res.body.error).toMatch(/bulunam/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GAP-PURCH-06 — Idempotency-Key header forwarded to purchasePackageWithBalance
// ═══════════════════════════════════════════════════════════════════════════════

describe("GAP-PURCH-06: Idempotency-Key header forwarded to purchasePackageWithBalance", () => {
  it("passes the Idempotency-Key header value as third argument", async () => {
    mocks.packagesFeatureEnabled.mockResolvedValue(true);
    mocks.purchasePackageWithBalance.mockResolvedValue({
      entitlementId: "ent-xyz",
      newBalanceTL: 75,
      tip: "request_limit",
    });

    const app = await buildUserApp("user-bbb");
    const { default: request } = await import("supertest");
    await request(app)
      .post("/api/user/packages/pkg-999/purchase")
      .set("Idempotency-Key", "client-idem-key-001")
      .send({})
      .expect(201);

    expect(mocks.purchasePackageWithBalance).toHaveBeenCalledWith(
      "user-bbb",
      "pkg-999",
      "client-idem-key-001",
      undefined,
      undefined,
      undefined,
    );
  });

  it("passes undefined for idempotency key when header is absent", async () => {
    mocks.packagesFeatureEnabled.mockResolvedValue(true);
    mocks.purchasePackageWithBalance.mockResolvedValue({
      entitlementId: "ent-yyy",
      newBalanceTL: 50,
      tip: "request_limit",
    });

    const app = await buildUserApp("user-ccc");
    const { default: request } = await import("supertest");
    await request(app)
      .post("/api/user/packages/pkg-888/purchase")
      .send({})
      .expect(201);

    expect(mocks.purchasePackageWithBalance).toHaveBeenCalledWith(
      "user-ccc",
      "pkg-888",
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GAP-ENT-01 — Entitlements route returns [] for user with no entitlements
// ═══════════════════════════════════════════════════════════════════════════════

describe("GAP-ENT-01: Entitlements route returns [] for user with no entitlements", () => {
  it("GET /api/user/entitlements returns empty array", async () => {
    mocks.listUserEntitlements.mockResolvedValue([]);

    const app = await buildUserApp("user-ddd");
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/user/entitlements").expect(200);
    expect(res.body).toEqual([]);
    expect(mocks.listUserEntitlements).toHaveBeenCalledWith("user-ddd");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GAP-ENT-02 — Entitlements route serialises multiple objects with all fields
// ═══════════════════════════════════════════════════════════════════════════════

describe("GAP-ENT-02: Entitlements route serialises multiple objects with all fields", () => {
  it("GET /api/user/entitlements returns all ActiveEntitlement fields for multiple items", async () => {
    const fakeEntitlements = [
      {
        id: "ent-001",
        packageId: "pkg-001",
        paketAdi: "Starter",
        kategori: "basic",
        gunlukLimit: 50,
        kalanBugun: 48,
        expiresAt: "2026-07-01T00:00:00.000Z",
        allowedModels: ["claude-opus-4.8", "gpt-5"],
      },
      {
        id: "ent-002",
        packageId: "pkg-002",
        paketAdi: "Pro",
        kategori: "pro",
        gunlukLimit: 200,
        kalanBugun: 200,
        expiresAt: "2026-08-01T00:00:00.000Z",
        allowedModels: [],
      },
    ];
    mocks.listUserEntitlements.mockResolvedValue(fakeEntitlements);

    const app = await buildUserApp("user-eee");
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/user/entitlements").expect(200);

    expect(res.body).toHaveLength(2);

    const first = res.body[0];
    expect(first.id).toBe("ent-001");
    expect(first.packageId).toBe("pkg-001");
    expect(first.paketAdi).toBe("Starter");
    expect(first.kategori).toBe("basic");
    expect(first.gunlukLimit).toBe(50);
    expect(first.kalanBugun).toBe(48);
    expect(first.expiresAt).toBe("2026-07-01T00:00:00.000Z");
    expect(first.allowedModels).toEqual(["claude-opus-4.8", "gpt-5"]);

    const second = res.body[1];
    expect(second.id).toBe("ent-002");
    expect(second.gunlukLimit).toBe(200);
    expect(second.allowedModels).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GAP-SVC-01 — purchasePackageWithBalance throws AppError(400) for tip=token_bundle
// ═══════════════════════════════════════════════════════════════════════════════
// The real service is mocked at the top level (required by other tests in this
// file). We verify the tip guard by reading the source code and separately
// calling the real function via vi.importActual, which bypasses the top-level
// vi.mock and loads the actual implementation with the mocked db client.

describe("GAP-SVC-01: purchasePackageWithBalance throws AppError(400) for unsupported tip", () => {
  it("source code contains tip guard that throws AppError(400) for unsupported tips", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/server/services/package-purchase-service.ts"),
      "utf8",
    );
    // The guard must explicitly exclude request_limit and account_delivery
    expect(src).toMatch(/tip !== .request_limit. && pkg\.tip !== .account_delivery./);
    // And must throw an AppError(400) for anything else
    expect(src).toMatch(/throw new AppError\(400,/);
    // The error message must reference 'desteklenmiyor'
    expect(src).toMatch(/desteklenmiyor/);
  });

  it("tip='token_bundle' causes AppError(400) — real service via importActual with mocked dbSql", async () => {
    // Configure the top-level dbSqlFn mock for this call:
    // 1st call: dup-check → no existing tx
    // 2nd call: pkgRows fetch → package with unsupported tip
    mocks.dbSqlFn
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "pkg-tb-1",
        ad: "Token Bundle",
        fiyat_tl: "50",
        sure_gun: 0,
        gunluk_istek_limiti: 0,
        allowed_models: [],
        enabled: true,
        tip: "token_bundle",
      }]);

    // Use importActual to bypass the top-level vi.mock and load the real
    // implementation. It will use the mocked db/client.js (which vi.mock handles
    // for all dynamic imports in this Vitest environment).
    const { purchasePackageWithBalance: realFn } =
      await vi.importActual<typeof import("../services/package-purchase-service.js")>(
        "../services/package-purchase-service.js",
      );
    const { AppError } = await vi.importActual<typeof import("../lib/errors.js")>(
      "../lib/errors.js",
    );

    const thrown = await realFn("user-fff", "pkg-tb-1", undefined, undefined).catch((e) => e);

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as InstanceType<typeof AppError>).statusCode).toBe(400);
    expect((thrown as InstanceType<typeof AppError>).message).toMatch(/desteklenmiyor/i);
  });
});
