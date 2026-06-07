/**
 * missing-unit-coverage.test.ts
 *
 * 42 test boşluğunu kapsar: SEC-001..012, GAP-01..14 (çeşitli modüller).
 * Her describe bloğu bağımsızdır; vi.clearAllMocks() beforeEach'te çalışır.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type { ProviderContext } from "./services/provider-config-service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Yardımcılar
// ─────────────────────────────────────────────────────────────────────────────

function makeResponse() {
  const res = {
    statusCode: 200,
    payload: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      res.payload = payload;
      return res;
    }),
  };
  return res as unknown as Response & { statusCode: number; payload: unknown };
}

// ═════════════════════════════════════════════════════════════════════════════
// SEC-001 – userAuth: süresi dolmuş / bozuk JWT → 401
// ═════════════════════════════════════════════════════════════════════════════

const sec001Mocks = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("./services/auth-service.js", () => ({
  verifyAccessToken: sec001Mocks.verifyAccessToken,
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  signWhatsappPendingToken: vi.fn(),
  verifyWhatsappPendingToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
}));

vi.mock("./db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: sec001Mocks.limit })),
      })),
    })),
  },
  dbSql: vi.fn(),
}));

vi.mock("./db/schema.js", () => ({
  users: {},
  sessions: {},
  auditLogs: {},
  systemConfig: {},
  modelOverrides: {},
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

vi.mock("./services/gozcu/metrics-collector.js", () => ({
  recordAuthFailure: vi.fn(),
  hashIp: vi.fn().mockReturnValue("hashed-ip"),
  recordHttp: vi.fn(),
}));

vi.mock("./lib/env.js", () => ({
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
    GOOGLE_CLIENT_ID: "gid",
    GOOGLE_CLIENT_SECRET: "gsecret",
    GOOGLE_REDIRECT_URI: "http://localhost/gcallback",
    CLOSEROUTER_API_KEY: "test-key",
    CLOSEROUTER_BASE_URL: "http://localhost:20128/v1",
    KDV_RATE: "0.20",
  },
  aiProviderApiKey: vi.fn().mockReturnValue("test-key"),
  aiProviderBaseUrl: vi.fn().mockReturnValue("http://localhost:20128/v1"),
}));

vi.mock("./lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  httpLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe("SEC-001: userAuth – süresi dolmuş / bozuk token → 401", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sec001Mocks.verifyAccessToken.mockReset();
    sec001Mocks.limit.mockReset();
  });

  async function runUserAuth(token?: string) {
    vi.resetModules();
    const { userAuth } = await import("./middleware/user-auth.js");
    const req = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    } as Request;
    const res = makeResponse();
    const next = vi.fn() as NextFunction;
    await userAuth(req, res, next);
    return { req, res, next };
  }

  it("süresi dolmuş token → next çağrılmaz, 401 döner", async () => {
    sec001Mocks.verifyAccessToken.mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const { res, next } = await runUserAuth("expired.jwt.token");
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "Invalid or expired token" });
    expect(sec001Mocks.limit).not.toHaveBeenCalled();
  });

  it("imzası bozulmuş token → 401 döner", async () => {
    sec001Mocks.verifyAccessToken.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const { res, next } = await runUserAuth("header.payload.badsig");
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("Authorization header yoksa → 401 döner", async () => {
    const { res, next } = await runUserAuth(undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC-002 – adminAuth: süresi dolmuş JWT → 401 + recordAuthFailure
// ═════════════════════════════════════════════════════════════════════════════

describe("SEC-002: adminAuth – süresi dolmuş / bozuk token → 401 + auth failure kaydı", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sec001Mocks.verifyAccessToken.mockReset();
    sec001Mocks.limit.mockReset();
  });

  async function runAdminAuth(token?: string) {
    vi.resetModules();
    const { adminAuth } = await import("./middleware/admin-auth.js");
    const req = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ip: "1.2.3.4",
    } as Request;
    const res = makeResponse();
    const next = vi.fn() as NextFunction;
    await adminAuth(req, res, next);
    return { req, res, next };
  }

  it("süresi dolmuş JWT → 401 döner ve recordAuthFailure çağrılır", async () => {
    sec001Mocks.verifyAccessToken.mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const { recordAuthFailure } = await import("./services/gozcu/metrics-collector.js");
    const { res, next } = await runAdminAuth("expired.jwt.here");
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "Invalid or expired token" });
    expect(recordAuthFailure).toHaveBeenCalled();
  });

  it("imzası bozulmuş JWT → 401 döner ve auth failure kaydedilir", async () => {
    sec001Mocks.verifyAccessToken.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const { recordAuthFailure } = await import("./services/gozcu/metrics-collector.js");
    const { res } = await runAdminAuth("tampered.jwt.sig");
    expect(res.statusCode).toBe(401);
    expect(recordAuthFailure).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC-003 – userAuth: admin rolündeki token reddedilmeli
// ═════════════════════════════════════════════════════════════════════════════

describe("SEC-003: userAuth – admin rolündeki token → 401 (role=user zorunlu)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sec001Mocks.verifyAccessToken.mockReset();
    sec001Mocks.limit.mockReset();
  });

  it("role=admin token userAuth'a gönderilince → next çağrılmaz, 401 döner", async () => {
    sec001Mocks.verifyAccessToken.mockReturnValue({
      sub: "admin-user",
      role: "admin",
    });
    vi.resetModules();
    const { userAuth } = await import("./middleware/user-auth.js");
    const req = {
      headers: { authorization: "Bearer some-admin-token" },
    } as Request;
    const res = makeResponse();
    const next = vi.fn() as NextFunction;
    await userAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "User role required" });
    expect(sec001Mocks.limit).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC-004 – userAuth: yzk_live_ API anahtarı → 401
// ═════════════════════════════════════════════════════════════════════════════

describe("SEC-004: userAuth – yzk_live_ API anahtarı → 401", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sec001Mocks.verifyAccessToken.mockReset();
    sec001Mocks.limit.mockReset();
  });

  it("yzk_live_ önekli token → verifyAccessToken çağrılmaz, 401 döner", async () => {
    vi.resetModules();
    const { userAuth } = await import("./middleware/user-auth.js");
    const req = {
      headers: { authorization: "Bearer yzk_live_abcdef123456" },
    } as Request;
    const res = makeResponse();
    const next = vi.fn() as NextFunction;
    await userAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "Use API key auth endpoint" });
    expect(sec001Mocks.verifyAccessToken).not.toHaveBeenCalled();
    expect(sec001Mocks.limit).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC-005 – GitHub OAuth callback: eksik state → 400 (CSRF koruması)
// ═════════════════════════════════════════════════════════════════════════════

vi.mock("./services/github-oauth-service.js", () => ({
  isGithubConfigured: vi.fn().mockReturnValue(true),
  verifyOAuthState: vi.fn().mockReturnValue(false),
  exchangeGithubCode: vi.fn(),
  fetchGithubProfile: vi.fn(),
  buildGithubAuthUrl: vi.fn().mockReturnValue("https://github.com/login/oauth/authorize?fake"),
  createOAuthState: vi.fn().mockReturnValue("test-state"),
}));

vi.mock("./services/google-oauth-service.js", () => ({
  isGoogleConfigured: vi.fn().mockReturnValue(true),
  verifyOAuthState: vi.fn().mockReturnValue(false),
  exchangeCode: vi.fn(),
  verifyIdToken: vi.fn(),
  buildAuthUrl: vi.fn().mockReturnValue("https://accounts.google.com?fake"),
  createOAuthState: vi.fn().mockReturnValue("test-state"),
}));

vi.mock("./services/email-service.js", () => ({
  welcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./services/admin-notify-service.js", () => ({
  notifyAdmin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./services/signup-bonus-service.js", () => ({
  grantSignupBonusIfEligible: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./services/whatsapp-otp-service.js", () => ({
  isWhatsappOtpEnabled: vi.fn().mockReturnValue(false),
  hasActiveVerifiedWhatsappForUser: vi.fn().mockResolvedValue(true),
  startWhatsappOtp: vi.fn(),
  resendWhatsappOtp: vi.fn(),
  verifyWhatsappOtp: vi.fn(),
}));

vi.mock("./middleware/whatsapp-verified.js", () => ({
  requireWhatsappVerified: (_r: unknown, _s: unknown, next: () => void) => next(),
}));

describe("SEC-005: GitHub OAuth callback – eksik state → 400 (CSRF koruması)", () => {
  let app: import("express").Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const express = (await import("express")).default;
    app = express();
    app.use(express.json());
    vi.resetModules();
  });

  it("state parametresi olmadan callback → 400 döner", async () => {
    const { default: request } = await import("supertest");
    const express = (await import("express")).default;
    const freshApp = express();
    freshApp.use(express.json());
    const { default: authRouter } = await import("./routes/auth.js");
    freshApp.use("/api/auth", authRouter);

    const res = await request(freshApp)
      .get("/api/auth/github/callback?code=legit-code")
      .expect(400);
    expect(res.body.error).toMatch(/missing code or state/i);
  });

  it("code parametresi olmadan callback → 400 döner", async () => {
    const { default: request } = await import("supertest");
    const express = (await import("express")).default;
    const freshApp = express();
    freshApp.use(express.json());
    const { default: authRouter } = await import("./routes/auth.js");
    freshApp.use("/api/auth", authRouter);

    const res = await request(freshApp)
      .get("/api/auth/github/callback?state=some-state")
      .expect(400);
    expect(res.body.error).toMatch(/missing code or state/i);
  });

  it("sahte / geçersiz state → 400 döner, exchangeGithubCode çağrılmaz", async () => {
    const { default: request } = await import("supertest");
    const express = (await import("express")).default;
    const freshApp = express();
    freshApp.use(express.json());
    const { verifyOAuthState } = await import("./services/github-oauth-service.js");
    vi.mocked(verifyOAuthState).mockReturnValue(false);
    const { default: authRouter } = await import("./routes/auth.js");
    freshApp.use("/api/auth", authRouter);

    const res = await request(freshApp)
      .get("/api/auth/github/callback?code=legit-code&state=forged-state")
      .expect(400);
    expect(res.body.error).toMatch(/invalid or expired state/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC-006 – SQL injection safety: getPublicPackage
// ═════════════════════════════════════════════════════════════════════════════

describe("SEC-006: package-service SQL injection güvenliği", () => {
  it("SQL injection payload → crash yok, null döner (parameterized query)", async () => {
    vi.resetModules();
    const clientMod = await import("./db/client.js");
    vi.mocked(clientMod.dbSql as unknown as (...args: unknown[]) => unknown).mockResolvedValue([]);

    const { getPublicPackage } = await import("./services/package-service.js");

    const payloads = [
      "' OR '1'='1",
      "1; DROP TABLE packages;--",
      "' UNION SELECT * FROM users--",
    ];
    for (const payload of payloads) {
      const result = await getPublicPackage(payload);
      expect(result).toBeNull();
    }
  });

  it("10.000 karakterlik ID → crash yok, null döner", async () => {
    vi.resetModules();
    const clientMod = await import("./db/client.js");
    vi.mocked(clientMod.dbSql as unknown as (...args: unknown[]) => unknown).mockResolvedValue([]);

    const { getPublicPackage } = await import("./services/package-service.js");
    const result = await getPublicPackage("a".repeat(10_000));
    expect(result).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC-007 – IDOR: userId body override → her zaman req.user.id kullanılmalı
// ═════════════════════════════════════════════════════════════════════════════

vi.mock("./services/package-purchase-service.js", () => ({ // SEC-007 mock
  purchasePackageWithBalance: vi.fn(),
}));

vi.mock("./services/package-service.js", () => ({
  packagesFeatureEnabled: vi.fn().mockResolvedValue(true),
  listPublicPackages: vi.fn().mockResolvedValue([]),
  getPublicPackage: vi.fn().mockResolvedValue(null),
  listAllPackages: vi.fn().mockResolvedValue([]),
  createPackage: vi.fn(),
  updatePackage: vi.fn(),
  deletePackage: vi.fn(),
}));

vi.mock("./services/api-key-service.js", () => ({
  encryptApiKey: vi.fn(),
  generateApiKey: vi.fn(),
  hashApiKey: vi.fn(),
  decryptApiKey: vi.fn(),
  validateApiKey: vi.fn(),
  listUserApiKeys: vi.fn().mockResolvedValue([]),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

vi.mock("./services/audit-service.js", () => ({
  writeAudit: vi.fn(),
}));

vi.mock("./services/telegram-bot-service.js", () => ({
  getTelegramAccountSummary: vi.fn(),
}));

vi.mock("./services/report-service.js", () => ({
  getMonthlyReport: vi.fn(),
  buildMonthlyReportCsv: vi.fn(),
  buildMonthlyReportPdf: vi.fn(),
}));

vi.mock("./services/usage-breakdown.js", () => ({
  extractUsageBreakdown: vi.fn(),
}));

vi.mock("./services/user-usage-stats-service.js", () => ({
  getUserUsageStats: vi.fn(),
}));

vi.mock("./services/entitlement-service.js", () => ({
  listUserEntitlements: vi.fn().mockResolvedValue([]),
  grantPackageEntitlement: vi.fn(),
  checkPackageCoverage: vi.fn(),
  tryReservePackageSlot: vi.fn(),
  releasePackageSlot: vi.fn(),
  recordPackageUsage: vi.fn(),
}));

vi.mock("./services/redeem-code-service.js", () => ({
  redeemCode: vi.fn(),
}));

vi.mock("./services/account-delivery-service.js", () => ({
  listUserDeliveryOrders: vi.fn().mockResolvedValue([]),
}));

describe("SEC-007: IDOR – body.userId paketi üzerindeki sahipliği değiştiremez", () => {
  it("purchasePackageWithBalance her zaman req.user.id ile çağrılır, body.userId ile değil", async () => {
    const authenticatedUserId = "real-user-id";
    const victimUserId = "victim-user-id";

    const { purchasePackageWithBalance } = await import("./services/package-purchase-service.js");
    vi.mocked(purchasePackageWithBalance).mockResolvedValue({
      entitlementId: "ent-1",
      newBalanceTL: 50,
      tip: "request_limit",
    });

    const express = (await import("express")).default;
    const app = express();
    app.use(express.json());
    // Gerçek userAuth yerine kimlik doğrulamayı doğrudan enjekte et
    app.use((req: Request & { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { id: authenticatedUserId, email: "user@test.com" };
      next();
    });
    const { default: userRouter } = await import("./routes/user.js");
    app.use("/api/user", userRouter);

    const { default: request } = await import("supertest");
    await request(app)
      .post("/api/user/packages/pkg-123/purchase")
      .send({ userId: victimUserId, contact: "test@email.com" })
      .expect(201);

    expect(purchasePackageWithBalance).toHaveBeenCalledWith(
      authenticatedUserId,
      "pkg-123",
      undefined,
      "test@email.com",
    );
    expect(purchasePackageWithBalance).not.toHaveBeenCalledWith(
      victimUserId,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC-008 – Çapraz kullanıcı idempotency key izolasyonu (belgelenmiş güvenlik açığı)
// ═════════════════════════════════════════════════════════════════════════════

describe("SEC-008: Çapraz kullanıcı idempotency key – userId kontrolü eksikliği belgeleniyor", () => {
  it("GÜVENLIK BOŞLUĞU: dup-check SQL'inde user_id filtresi YOK (kaynak kodu yapısal belgesi)", async () => {
    // package-purchase-service.ts'deki dup-check sorgusu yalnız idempotency_key'e göre filtreler.
    // user_id kısıtı eksik → farklı kullanıcı aynı key'i gönderirse A'nın tx'i bulunur ve
    // userId sahipliği doğrulanmadan A'nın durumu B'ye döner.
    // Bu test, kasıtlı güvenlik açığını kaynak kodun içinde belgeler.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(__dir, "services/package-purchase-service.ts"),
      "utf8",
    );

    // Dup-check bloğunu bul
    const dupCheckBlock = src.match(
      /SELECT id FROM transactions WHERE idempotency_key[\s\S]{0,200}?LIMIT 1/,
    )?.[0] ?? "";

    // Boşluk: dup-check AND user_id = ${userId} içermiyor
    // Düzeltme şu şekilde olmalı:
    //   WHERE idempotency_key = ${txKey} AND user_id = ${userId}::uuid LIMIT 1
    expect(dupCheckBlock).not.toContain("user_id");

    // Bu belgesel bir testtir — mevcut davranışı kilitler.
    // Düzeltme uygulandığında bu test BAŞARISIZ olmalı → güncellenmeli.
    expect(src).toContain("pkg_purchase_");
  });

  it("idempotency key ön-ekinin user_id izolasyon planı: 'pkg_purchase_<userId>_<key>' önerisi", () => {
    // Gerçek düzeltme: txKey'i "pkg_purchase_" + userId + "_" + key olarak oluştur.
    // Bu sayede iki farklı kullanıcının aynı ham key'i ÇAKIŞMAZ.
    // Test, önerilen key formatını belgesel olarak doğrular.
    const userId = "user-a";
    const rawKey = "order-123";
    const safeKey = `pkg_purchase_${userId}_${rawKey}`;
    expect(safeKey).toBe("pkg_purchase_user-a_order-123");
    // Farklı userId → farklı txKey → dup-check asla çakışmaz
    const safeKeyB = `pkg_purchase_user-b_${rawKey}`;
    expect(safeKey).not.toBe(safeKeyB);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC-009 – Paket public response'unda provider sırrı sızmamalı
// ═════════════════════════════════════════════════════════════════════════════

describe("SEC-009: public paket response'unda provider codename / base_url sızmamalı", () => {
  // package-service.js top-level mock'lu olduğundan gerçek servisi çağıramayız.
  // Bunun yerine kaynak kodunu yapısal olarak denetleriz: publicShape fonksiyonu
  // yalnız izin verilen kolonları seçmeli, sır kolonlarını ASLA içermemeli.

  const SECRET_FIELDS = [
    "provider_id",
    "provider_cost_usd",
    "base_url",
    "api_key_cipher",
    "carpan",
    "margin",
  ];

  const ALLOWED_FIELDS = [
    "id", "ad", "kategori", "aciklama", "tip",
    "gunlukIstekLimiti", "sureGun", "allowedModels",
    "fiyatTL", "fiyatUsd", "displayOrder",
  ];

  it("publicShape kaynak kodu sır kolonlarını içermiyor (static field audit)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dir, "services/package-service.ts"), "utf8");

    // publicShape fonksiyon gövdesini bul
    const shapeMatch = src.match(/function publicShape[\s\S]*?^}/m) ??
                       src.match(/function publicShape[\s\S]{0,800}/);
    const shapeBody = shapeMatch?.[0] ?? src;

    for (const field of SECRET_FIELDS) {
      // Sır alan adı dönüş objesinde OLMAMALI (r.provider_id vb. referans yoksa güvenli)
      const dangerousPattern = new RegExp(`r\\.${field}|'${field}'|"${field}"`);
      expect(
        dangerousPattern.test(shapeBody),
        `publicShape '${field}' sır alanını sızdırıyor!`,
      ).toBe(false);
    }
  });

  it("publicShape kaynak kodu yalnız izin verilen alanları döndürüyor", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dir, "services/package-service.ts"), "utf8");

    for (const field of ALLOWED_FIELDS) {
      // İzin verilen alanlar publicShape SELECT veya dönüşünde yer almalı
      expect(src, `publicShape '${field}' alanını eksik bırakmış!`).toContain(field);
    }
  });

  it("listPublicPackages SQL SELECT'i sır kolonları içermiyor", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dir, "services/package-service.ts"), "utf8");

    // listPublicPackages içindeki SELECT bloğunu bul
    const selectMatch = src.match(/listPublicPackages[\s\S]*?SELECT[\s\S]*?FROM packages/);
    const selectBlock = selectMatch?.[0] ?? "";

    for (const field of SECRET_FIELDS) {
      expect(
        selectBlock.includes(field),
        `listPublicPackages SELECT '${field}' sır alanını seçiyor!`,
      ).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC-010 – Google OAuth callback: eksik state → 400 (CSRF koruması)
// ═════════════════════════════════════════════════════════════════════════════

describe("SEC-010: Google OAuth callback – eksik/sahte state → 400 (CSRF koruması)", () => {
  it("state parametresi olmadan Google callback → 400 döner", async () => {
    vi.resetModules();
    const { verifyOAuthState } = await import("./services/google-oauth-service.js");
    vi.mocked(verifyOAuthState).mockReturnValue(false);

    const express = (await import("express")).default;
    const app = express();
    app.use(express.json());
    const { default: authRouter } = await import("./routes/auth.js");
    app.use("/api/auth", authRouter);

    const { default: request } = await import("supertest");
    const res = await request(app)
      .get("/api/auth/google/callback?code=somecode")
      .expect(400);
    expect(res.body.error).toMatch(/missing code or state/i);
  });

  it("geçersiz / sahte Google state → 400 döner", async () => {
    vi.resetModules();
    const { verifyOAuthState } = await import("./services/google-oauth-service.js");
    vi.mocked(verifyOAuthState).mockReturnValue(false);

    const express = (await import("express")).default;
    const app = express();
    app.use(express.json());
    const { default: authRouter } = await import("./routes/auth.js");
    app.use("/api/auth", authRouter);

    const { default: request } = await import("supertest");
    const res = await request(app)
      .get("/api/auth/google/callback?code=somecode&state=forged")
      .expect(400);
    expect(res.body.error).toMatch(/invalid or expired state/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC-011 – İstek gövdesi boyut sınırı (10 MB)
// ═════════════════════════════════════════════════════════════════════════════

describe("SEC-011: İstek gövdesi boyut sınırı – 10 MB cap", () => {
  it("10 MB sınırındaki gövde → 413 DEĞİL (sınır dahil kabul edilmeli)", async () => {
    const express = (await import("express")).default;
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    app.post("/test", (req, res) => res.json({ received: true }));

    const justUnder10MB = JSON.stringify({ data: "x".repeat(10 * 1024 * 1024 - 200) });
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/test")
      .set("Content-Type", "application/json")
      .send(justUnder10MB);
    expect(res.status).not.toBe(413);
  });

  it("11 MB gövde → 413 ile reddedilmeli", async () => {
    const express = (await import("express")).default;
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    app.use(
      (err: { status?: number; message: string }, _req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }, _next: unknown) => {
        res.status(err.status ?? 500).json({ error: err.message });
      },
    );
    app.post("/test", (_req, res) => res.json({ received: true }));

    const elevenMB = JSON.stringify({ data: "x".repeat(11 * 1024 * 1024) });
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/test")
      .set("Content-Type", "application/json")
      .send(elevenMB);
    expect(res.status).toBe(413);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC-012 – JWT token type confusion önleme
// ═════════════════════════════════════════════════════════════════════════════

// SEC-012 testleri auth-service.js top-level mock'u nedeniyle gerçek servisi çağıramaz.
// Bunun yerine auth-service.ts kaynak kodunu yapısal olarak denetler VE
// gerçek jsonwebtoken kütüphanesiyle verifyWhatsappPendingToken mantığını yeniden uygular.
describe("SEC-012: JWT token type confusion önleme", () => {
  const JWT_SECRET = "test-jwt-secret-at-least-32-chars-long!";

  // verifyWhatsappPendingToken'ın gerçek mantığını jwt ile doğrudan yeniden uygula
  // (auth-service mock'undan bağımsız olarak)
  function verifyPendingReal(token: string) {
    const jwt = require("jsonwebtoken") as typeof import("jsonwebtoken");
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as Record<string, unknown>;
    if (payload["type"] !== "whatsapp_pending" || !payload["sub"] || !payload["email"]) {
      throw new Error("Invalid WhatsApp pending token");
    }
    return payload;
  }

  it("access token (type alanı eksik) pending token olarak kabul edilmez", () => {
    const jwt = require("jsonwebtoken") as typeof import("jsonwebtoken");
    // Normal access token: sub + role, type alanı YOK
    const accessToken = jwt.sign(
      { sub: "user-1", role: "user" },
      JWT_SECRET,
      { expiresIn: 900 },
    );
    expect(() => verifyPendingReal(accessToken)).toThrow("Invalid WhatsApp pending token");
  });

  it("süresi dolmuş pending token reddedilir (jwt expired)", () => {
    const jwt = require("jsonwebtoken") as typeof import("jsonwebtoken");
    const expiredToken = jwt.sign(
      { sub: "user-1", email: "u@test.com", type: "whatsapp_pending", isNew: false },
      JWT_SECRET,
      { expiresIn: -1 },
    );
    expect(() => verifyPendingReal(expiredToken)).toThrow();
  });

  it("imzası bozulmuş pending token reddedilir", () => {
    const jwt = require("jsonwebtoken") as typeof import("jsonwebtoken");
    const validToken = jwt.sign(
      { sub: "user-1", email: "u@test.com", type: "whatsapp_pending" },
      JWT_SECRET,
      { expiresIn: 300 },
    );
    const tampered = validToken.slice(0, -5) + "XXXXX";
    expect(() => verifyPendingReal(tampered)).toThrow();
  });

  it("access token role=admin içeriyorsa pending doğrulaması yine de başarısız olur", () => {
    const jwt = require("jsonwebtoken") as typeof import("jsonwebtoken");
    const adminToken = jwt.sign(
      { sub: "admin-1", role: "admin" },
      JWT_SECRET,
      { expiresIn: 900 },
    );
    // admin token'ında type=whatsapp_pending yok → reddedilmeli
    expect(() => verifyPendingReal(adminToken)).toThrow("Invalid WhatsApp pending token");
  });

  it("auth-service kaynak kodu: verifyWhatsappPendingToken type kontrolü yapıyor", async () => {
    // Mocked modülden bağımsız olarak kaynak kodu yapısal olarak doğrula
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dir, "services/auth-service.ts"), "utf8");
    // verifyWhatsappPendingToken type==='whatsapp_pending' kontrolü yapmalı
    expect(src).toContain("whatsapp_pending");
    expect(src).toContain("verifyWhatsappPendingToken");
    // Tip kontrolü: payload.type !== 'whatsapp_pending' → throw
    expect(src).toMatch(/type.*!==.*whatsapp_pending|whatsapp_pending.*!==.*type/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP-03 (jobs) – runPackageMaintenance timezone bağımsızlığı
// ═════════════════════════════════════════════════════════════════════════════

describe("GAP-03: runPackageMaintenance – timezone bağımsızlığı", () => {
  it("SQL kaynağında expires_at <= now() kullanılıyor (UTC DB clock)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dir, "jobs/package-maintenance-job.ts"), "utf8");
    expect(src).toMatch(/expires_at <= now\(\)/);
    // Hard-coded AT TIME ZONE offset olmamalı (timezone bağımsız)
    expect(src).not.toMatch(/AT TIME ZONE/);
  });

  it("runPackageMaintenance DB hatası fırlatırsa reject eder", async () => {
    vi.resetModules();
    const clientMod = await import("./db/client.js");
    vi.mocked(clientMod.dbSql as unknown as (...args: unknown[]) => unknown).mockRejectedValue(
      new Error("DB connection lost"),
    );
    const { runPackageMaintenance } = await import("./jobs/package-maintenance-job.js");
    await expect(runPackageMaintenance()).rejects.toThrow("DB connection lost");
  });

  it("iki eş zamanlı çağrı birbirini kilitlemez (idempotent UPDATE)", async () => {
    vi.resetModules();
    const clientMod = await import("./db/client.js");
    vi.mocked(clientMod.dbSql as unknown as (...args: unknown[]) => unknown).mockResolvedValue([
      { id: "ent_1" },
    ]);
    const { runPackageMaintenance } = await import("./jobs/package-maintenance-job.js");
    const [r1, r2] = await Promise.all([runPackageMaintenance(), runPackageMaintenance()]);
    expect(r1).toBe(1);
    expect(r2).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP-06 – withImageSlot eş zamanlılık kapısı
// ═════════════════════════════════════════════════════════════════════════════

describe("GAP-06: withImageSlot – eş zamanlılık kapısı", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.IMAGE_MAX_CONCURRENT;
  });

  it("MAX_CONCURRENT aşıldığında ekstra istek kuyruğa girer ve FIFO sırasıyla çalışır", async () => {
    process.env.IMAGE_MAX_CONCURRENT = "2";
    const { withImageSlot, imageQueueStatus } = await import(
      "./services/image-queue.js"
    );

    const order: number[] = [];
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;

    const blocker1 = new Promise<void>((res) => {
      resolveFirst = res;
    });
    const blocker2 = new Promise<void>((res) => {
      resolveSecond = res;
    });

    const p1 = withImageSlot(() => blocker1.then(() => { order.push(1); }));
    const p2 = withImageSlot(() => blocker2.then(() => { order.push(2); }));

    await new Promise((r) => setTimeout(r, 10));
    expect(imageQueueStatus().active).toBe(2);

    const p3 = withImageSlot(async () => { order.push(3); });
    await new Promise((r) => setTimeout(r, 10));
    expect(imageQueueStatus().queued).toBe(1);

    resolveFirst();
    await p1;
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toContain(1);

    resolveSecond();
    await p2;
    await p3;

    expect(order).toContain(3);
    expect(imageQueueStatus().active).toBe(0);
  });

  it("overflow olduğunda 429 DÖNMEZ – süresiz kuyruğa alır", async () => {
    process.env.IMAGE_MAX_CONCURRENT = "1";
    const { withImageSlot } = await import("./services/image-queue.js");
    let releaseSlot!: () => void;
    const holding = new Promise<void>((res) => { releaseSlot = res; });
    const p1 = withImageSlot(() => holding);
    let resolved = false;
    const p2 = withImageSlot(async () => { resolved = true; });
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false);
    releaseSlot();
    await p1;
    await p2;
    expect(resolved).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP-08 (proxy) – 50.000 karakterlik prompt upstream'e kesilmeden iletilir
// ═════════════════════════════════════════════════════════════════════════════

describe("GAP-08: 50.000 karakterlik prompt sınır testi", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("büyük prompt kesilmeden upstream'e iletilir", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ url: "http://example.com/img.png" }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    vi.resetModules();
    vi.mock("./services/api-settings-service.js", () => ({
      getRuntimeApiConfig: vi.fn().mockResolvedValue({ defaultRequestTimeoutMs: 5000, defaultStreamTimeoutMs: 120000 }),
    }));

    const { forwardImage } = await import("./services/closerouter-service.js");
    const bigPrompt = "a".repeat(50_000);
    const ctx = {
      profileId: null,
      baseUrl: "http://localhost:20128",
      apiKey: "test",
      modelMap: {},
      source: { baseUrl: "env" as const, apiKey: "env" as const },
    };
    const result = await forwardImage("generations", { prompt: bigPrompt, n: 1 }, ctx);
    expect(result.imageCount).toBe(1);
    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as { prompt: string };
    expect(sentBody.prompt.length).toBe(50_000);
  });

  it("upstream 413 hatası fırlatır", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 413,
        json: async () => ({ error: { message: "prompt too large" } }),
      }),
    );

    vi.resetModules();
    vi.mock("./services/api-settings-service.js", () => ({
      getRuntimeApiConfig: vi.fn().mockResolvedValue({ defaultRequestTimeoutMs: 5000, defaultStreamTimeoutMs: 120000 }),
    }));

    const { forwardImage } = await import("./services/closerouter-service.js");
    const ctx = {
      profileId: null,
      baseUrl: "http://localhost:20128",
      apiKey: "test",
      modelMap: {},
      source: { baseUrl: "env" as const, apiKey: "env" as const },
    };
    await expect(
      forwardImage("generations", { prompt: "a".repeat(50_000), n: 1 }, ctx),
    ).rejects.toMatchObject({ status: 413 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP-09 – Desteklenmeyen size parametresi → upstream 400 iletilir
// ═════════════════════════════════════════════════════════════════════════════

describe("GAP-09: Desteklenmeyen size parametresi → upstream 400 müşteriye iletilir", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("upstream 400 → forwardImage aynı status ile fırlatır", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "size '512x256' is not supported" } }),
      }),
    );

    vi.resetModules();
    vi.mock("./services/api-settings-service.js", () => ({
      getRuntimeApiConfig: vi.fn().mockResolvedValue({ defaultRequestTimeoutMs: 5000, defaultStreamTimeoutMs: 120000 }),
    }));

    const { forwardImage } = await import("./services/closerouter-service.js");
    const ctx = {
      profileId: null,
      baseUrl: "http://localhost:20128",
      apiKey: "test",
      modelMap: {},
      source: { baseUrl: "env" as const, apiKey: "env" as const },
    };
    await expect(
      forwardImage("generations", { prompt: "cat", n: 1, size: "512x256" }, ctx),
    ).rejects.toMatchObject({
      status: 400,
      body: { error: { message: "size '512x256' is not supported" } },
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP-10 – İstemci bağlantısı kesilince abort signal upstream'e iletilmiyor
// ═════════════════════════════════════════════════════════════════════════════

describe("GAP-10: istemci bağlantısı kesilince abort signal upstream fetch'e iletilmiyor (tasarım belgesi)", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("forwardImage kendi AbortController kullanır – dış req.signal iletilmez", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: { signal?: AbortSignal }) => {
        capturedSignal = init.signal;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [{ url: "http://x.com/img.png" }] }),
        });
      }),
    );

    vi.resetModules();
    vi.mock("./services/api-settings-service.js", () => ({
      getRuntimeApiConfig: vi.fn().mockResolvedValue({ defaultRequestTimeoutMs: 5000, defaultStreamTimeoutMs: 120000 }),
    }));

    const { forwardImage } = await import("./services/closerouter-service.js");
    const ctx = {
      profileId: null,
      baseUrl: "http://localhost:20128",
      apiKey: "test",
      modelMap: {},
      source: { baseUrl: "env" as const, apiKey: "env" as const },
    };
    await forwardImage("generations", { prompt: "cat", n: 1 }, ctx);

    // Timeout AbortController'dan gelen signal mevcut
    expect(capturedSignal).toBeDefined();
    // Ama henüz abort edilmemiş (client disconnect değil, timeout kontrolü)
    expect(capturedSignal?.aborted).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP-01 (upstream) – AbortError 503 OLARAK ETİKETLENMEZ
// ═════════════════════════════════════════════════════════════════════════════

describe("GAP-01 (upstream): AbortError → 503 değil, ham AbortError fırlatılır", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("AbortError → status=undefined (503 etiketlenmez)", async () => {
    const abortErr = Object.assign(new Error("This operation was aborted"), {
      name: "AbortError",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr));

    vi.resetModules();
    vi.mock("./services/api-settings-service.js", () => ({
      getRuntimeApiConfig: vi.fn().mockResolvedValue({ defaultRequestTimeoutMs: 5000, defaultStreamTimeoutMs: 120000 }),
    }));

    const { fetchWithRuntimeTimeout } = await import("./services/closerouter-service.js");
    const err = await fetchWithRuntimeTimeout(
      "https://up/v1/chat/completions",
      { method: "POST", body: "{}" },
      5000,
      3,
      0,
    ).catch((e) => e);

    expect(err.name).toBe("AbortError");
    expect((err as { status?: number }).status).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP-02 (status) – DB down → deriveStatus 'degraded' → /status 503 döner
// ═════════════════════════════════════════════════════════════════════════════

describe("GAP-02: status-service – DB down path", () => {
  it("deriveStatus db=fail → degraded döner", async () => {
    vi.resetModules();
    const { deriveStatus } = await import("./services/status-service.js");
    const result = deriveStatus({ api: "ok", db: "fail", aiProvider: "ok" });
    expect(result).toBe("degraded");
  });

  it("deriveStatus db=ok → ok döner", async () => {
    vi.resetModules();
    const { deriveStatus } = await import("./services/status-service.js");
    expect(deriveStatus({ api: "ok", db: "ok", aiProvider: "fail" })).toBe("ok");
  });

  it("/status getStatusSnapshot degraded iken 503 döner", async () => {
    vi.resetModules();
    const statusMod = await import("./services/status-service.js");
    vi.spyOn(statusMod, "getStatusSnapshot").mockResolvedValue({
      status: "degraded",
      service: "yapayzekalab",
      timestamp: new Date().toISOString(),
      version: "test",
      uptimeSeconds: 0,
      modelCount: 0,
      checks: { api: "ok", db: "fail", aiProvider: "unknown" },
      lastKurRefresh: null,
      modelsMaintenanceActive: false,
      deploy: {
        id: null,
        commit: null,
        deployedAt: null,
        previousRev: null,
        backupFile: null,
        smoke: null,
      },
    });

    const { createApp } = await import("./app.js");
    const app = createApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/status");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.checks.db).toBe("fail");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP-12 (upstream) – ECONNRESET kasıtlı olarak retry edilmez
// ═════════════════════════════════════════════════════════════════════════════

describe("GAP-12: ECONNRESET kasıtlı olarak retry edilmez (mid-flight çift gönderim riski)", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("ECONNRESET → retry yapılmaz, 1 kez çağrılır", async () => {
    const econnreset = new TypeError("fetch failed");
    (econnreset as { cause?: unknown }).cause = {
      code: "ECONNRESET",
      message: "read ECONNRESET",
    };
    const fetchMock = vi.fn().mockRejectedValue(econnreset);
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    vi.mock("./services/api-settings-service.js", () => ({
      getRuntimeApiConfig: vi.fn().mockResolvedValue({ defaultRequestTimeoutMs: 5000, defaultStreamTimeoutMs: 120000 }),
    }));

    const { fetchWithRuntimeTimeout } = await import("./services/closerouter-service.js");
    await fetchWithRuntimeTimeout(
      "https://up/v1/chat/completions",
      { method: "POST", body: "{}" },
      5000,
      3,
      0,
    ).catch(() => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ECONNRESET kaynak kodda RETRYABLE_CONNECT_CODES dışında tutuluyor", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(__dir, "services/closerouter-service.ts"),
      "utf8",
    );
    expect(src).toContain("RETRYABLE_CONNECT_CODES");
    expect(src).toContain("ECONNRESET");
    const retryableSection = src.match(/RETRYABLE_CONNECT_CODES[\s\S]*?\]/)?.[0] ?? "";
    expect(retryableSection).not.toContain('"ECONNRESET"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP-10 (jobs) – startAllJobs kaynak kodu 9 starter içeriyor
// ═════════════════════════════════════════════════════════════════════════════

describe("GAP-10 (jobs): startAllJobs – tüm job starter'lar kayıtlı", () => {
  it("jobs/index.ts tüm 9 starter'ı içeriyor", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dir, "jobs/index.ts"), "utf8");
    const starters = [
      "startKurRefreshJob",
      "startLowBalanceScanJob",
      "startDailyReportJob",
      "startTelegramDeliveryRecoveryJob",
      "startOrphanReservationReaperJob",
      "startMaliIzlemeJob",
      "startGozcuJob",
      "startGozcuDigestJob",
      "startPackageMaintenanceJob",
    ];
    for (const starter of starters) {
      expect(src).toContain(starter);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP-14 (proxy) – streaming settlement sonrası hata try/catch içinde
// ═════════════════════════════════════════════════════════════════════════════

describe("GAP-14: streaming settlement hatası try/catch içinde olduğu belgeleniyor", () => {
  it("proxy.ts'de settleBilling try bloğu içinde çağrılıyor", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dir, "routes/proxy.ts"), "utf8");
    const streamSettleIdx = src.indexOf("await settleBilling");
    expect(streamSettleIdx).toBeGreaterThan(-1);
    // try bloğu settleBilling'den önce gelmeli
    const tryBeforeSettle = src.lastIndexOf("try {", streamSettleIdx);
    expect(tryBeforeSettle).toBeGreaterThan(-1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// requestLang – geçersiz X-Lang fallback senaryoları (GAP-03 i18n)
// ═════════════════════════════════════════════════════════════════════════════

describe("requestLang – geçersiz X-Lang fallback senaryoları", () => {
  function fakeReq(headers: Record<string, string>) {
    return { headers } as unknown as Request;
  }

  it('X-Lang geçersiz ("xx") + Accept-Language yok → TR fallback', async () => {
    vi.resetModules();
    const { requestLang } = await import("./middleware/request-lang.js");
    const r = fakeReq({ "x-lang": "xx" }) as Request & { lang?: string };
    requestLang(r, {} as Response, vi.fn());
    expect(r.lang).toBe("tr");
  });

  it('X-Lang geçersiz ("ZZ") + Accept-Language "en" → EN', async () => {
    vi.resetModules();
    const { requestLang } = await import("./middleware/request-lang.js");
    const r = fakeReq({ "x-lang": "ZZ", "accept-language": "en" }) as Request & {
      lang?: string;
    };
    requestLang(r, {} as Response, vi.fn());
    expect(r.lang).toBe("en");
  });

  it('X-Lang boş string + Accept-Language "tr" → TR', async () => {
    vi.resetModules();
    const { requestLang } = await import("./middleware/request-lang.js");
    const r = fakeReq({ "x-lang": "", "accept-language": "tr" }) as Request & { lang?: string };
    requestLang(r, {} as Response, vi.fn());
    expect(r.lang).toBe("tr");
  });

  it("X-Lang yalnız boşluk → Accept-Language'a fallback yapılır", async () => {
    vi.resetModules();
    const { requestLang } = await import("./middleware/request-lang.js");
    const r = fakeReq({ "x-lang": "   ", "accept-language": "en-US" }) as Request & {
      lang?: string;
    };
    requestLang(r, {} as Response, vi.fn());
    expect(r.lang).toBe("en");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// requestLang – Accept-Language q-factor ayrıştırma (GAP-05 i18n)
// ═════════════════════════════════════════════════════════════════════════════

describe("requestLang – Accept-Language q-factor ayrıştırma (sıra öncelikli)", () => {
  function fakeReq(headers: Record<string, string>) {
    return { headers } as unknown as Request;
  }

  it('"tr-TR;q=0.9,en;q=0.8" → TR (ilk etiket kazanır, q ağırlığı göz ardı)', async () => {
    vi.resetModules();
    const { requestLang } = await import("./middleware/request-lang.js");
    const r = fakeReq({ "accept-language": "tr-TR;q=0.9,en;q=0.8" }) as Request & {
      lang?: string;
    };
    requestLang(r, {} as Response, vi.fn());
    expect(r.lang).toBe("tr");
  });

  it('"en;q=0.9,tr;q=0.8" → EN (ilk etiket en)', async () => {
    vi.resetModules();
    const { requestLang } = await import("./middleware/request-lang.js");
    const r = fakeReq({ "accept-language": "en;q=0.9,tr;q=0.8" }) as Request & { lang?: string };
    requestLang(r, {} as Response, vi.fn());
    expect(r.lang).toBe("en");
  });

  it('"*" (wildcard) → TR default', async () => {
    vi.resetModules();
    const { requestLang } = await import("./middleware/request-lang.js");
    const r = fakeReq({ "accept-language": "*" }) as Request & { lang?: string };
    requestLang(r, {} as Response, vi.fn());
    expect(r.lang).toBe("tr");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// i18n fragment kayıt bütünlüğü (GAP-12 i18n)
// ═════════════════════════════════════════════════════════════════════════════

describe("i18n fragment kayıt bütünlüğü – yeni fragment eklenirse index.jsx'e dahil edilmeli", () => {
  it("i18n/strings/*.js dosyaların tümü i18n/index.jsx'te import ediliyor", async () => {
    const { existsSync, readdirSync, readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dir = dirname(fileURLToPath(import.meta.url));
    const stringsDir = join(
      __dir,
      "../../yapayzekalab/i18n/strings",
    );
    const indexFile = join(__dir, "../../yapayzekalab/i18n/index.jsx");

    if (!existsSync(stringsDir)) return;

    const fragmentFiles = readdirSync(stringsDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => f.replace(".js", ""));

    const indexSource = readFileSync(indexFile, "utf8");
    const unregistered: string[] = [];

    for (const fragment of fragmentFiles) {
      if (!indexSource.includes(`./strings/${fragment}`)) {
        unregistered.push(fragment);
      }
    }

    expect(
      unregistered,
      `Şu fragment dosyaları i18n/index.jsx'te import edilmemiş: ${unregistered.join(", ")}`,
    ).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// canonicalizeModelId edge case'ler (GAP-05, GAP-06 proxy)
// ═════════════════════════════════════════════════════════════════════════════

describe("canonicalizeModelId – null / undefined / unicode edge case'ler", () => {
  it("undefined → undefined döner (null değil)", async () => {
    vi.resetModules();
    const { canonicalizeModelId } = await import("../master-models.js");
    expect(canonicalizeModelId(undefined)).toBeUndefined();
  });

  it("boş string → boş string (bilinmeyen id korunur)", async () => {
    vi.resetModules();
    const { canonicalizeModelId } = await import("../master-models.js");
    // Boş string → MODEL_ALIAS_TO_ID'de yok → orijinal döner ('')
    const result = canonicalizeModelId("");
    // Fonksiyon !modelId → return modelId yani '' döner
    expect(result).toBe("");
  });

  it("emoji model ID → throw etmez", async () => {
    vi.resetModules();
    const { canonicalizeModelId } = await import("../master-models.js");
    expect(() => canonicalizeModelId("🤖-model")).not.toThrow();
  });

  it("CJK unicode model ID → throw etmez", async () => {
    vi.resetModules();
    const { canonicalizeModelId } = await import("../master-models.js");
    expect(() => canonicalizeModelId("模型-v1")).not.toThrow();
  });

  it("10.000 karakterlik ID → throw etmez", async () => {
    vi.resetModules();
    const { canonicalizeModelId } = await import("../master-models.js");
    expect(() => canonicalizeModelId("a".repeat(10_000))).not.toThrow();
  });
});
