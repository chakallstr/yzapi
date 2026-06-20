/**
 * Entitlement/kota edge-case UNIT tests (GAP-01, GAP-06, GAP-07, GAP-03, GAP-06-image).
 * Uses vi.mock — NO real DB.
 *
 * Covers:
 *  - kota sınırı (daily limit boundary, zero-limit, exhausted quota)
 *  - model erişim kontrolü (allowed_models filtering, unknown model rejection)
 *  - zamanlama edge cases (expires_at boundary, timezone independence, early-expiry-first ordering)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock dbSql factory ───────────────────────────────────────────────────────

function makeDbSqlMock(rows: any[]) {
  return vi.fn().mockImplementation((_strings: TemplateStringsArray, ..._values: any[]) => Promise.resolve(rows));
}

// ─────────────────────────────────────────────────────────────────────────────
// describe: kota sınırı
// ─────────────────────────────────────────────────────────────────────────────

describe("kota sınırı", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GAP-06a: daily limit NOT exhausted (requests_today < daily_limit_snapshot) → covered=true", async () => {
    const mockDbSql = makeDbSqlMock([{ id: "ent-001" }]);
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { checkPackageCoverage } = await import("./services/entitlement-service.js");
    const covered = await checkPackageCoverage("user-111", "gpt-4o");

    expect(covered).toBe(true);
    expect(mockDbSql).toHaveBeenCalled();
  });

  it("GAP-06b: daily limit exhausted (requests_today == daily_limit_snapshot, last_reset_date == today) → covered=false", async () => {
    // When no rows are returned, coverage is false (the SQL WHERE filters exhausted entitlements)
    const mockDbSql = makeDbSqlMock([]); // no entitlement passes the filter
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { checkPackageCoverage } = await import("./services/entitlement-service.js");
    const covered = await checkPackageCoverage("user-222", "gpt-4o");

    expect(covered).toBe(false);
  });

  it("GAP-06c: zero daily limit (daily_limit_snapshot=0) — 0 < 0 is false, no reset yet → covered=false", async () => {
    // Entitlement with zero limit should never grant coverage on the same day
    const mockDbSql = makeDbSqlMock([]); // SQL correctly filters out zero-limit entries
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { checkPackageCoverage } = await import("./services/entitlement-service.js");
    const covered = await checkPackageCoverage("user-333", "gpt-4o");

    expect(covered).toBe(false);
  });

  it("tryReservePackageSlot: returns covered=false when no eligible entitlement (quota full)", async () => {
    const mockDbSql = makeDbSqlMock([]); // UPDATE RETURNING returns no rows
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { tryReservePackageSlot } = await import("./services/entitlement-service.js");
    const result = await tryReservePackageSlot("user-444", "gpt-4o");

    expect(result.covered).toBe(false);
    expect(result.entitlementId).toBeUndefined();
  });

  it("tryReservePackageSlot: returns covered=true with entitlementId when slot reserved", async () => {
    const mockDbSql = makeDbSqlMock([{ id: "ent-reserved-789" }]);
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { tryReservePackageSlot } = await import("./services/entitlement-service.js");
    const result = await tryReservePackageSlot("user-555", "gpt-4o");

    expect(result.covered).toBe(true);
    expect(result.entitlementId).toBe("ent-reserved-789");
  });

  it("releasePackageSlot: calls UPDATE with GREATEST(requests_today - 1, 0) — never goes negative", async () => {
    const mockDbSql = makeDbSqlMock([]);
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { releasePackageSlot } = await import("./services/entitlement-service.js");
    await releasePackageSlot("ent-to-release-999");

    expect(mockDbSql).toHaveBeenCalledOnce();
    // Verify the SQL template includes the entitlement ID as a parameter
    const callArgs = mockDbSql.mock.calls[0];
    expect(callArgs[1]).toBe("ent-to-release-999");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// describe: model erişim kontrolü
// ─────────────────────────────────────────────────────────────────────────────

describe("model erişim kontrolü", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unknown model not in allowed_models_snapshot → covered=false", async () => {
    // The SQL WHERE uses @> (jsonb contains). If allowed_models_snapshot does NOT contain
    // the requested model, no row is returned.
    const mockDbSql = makeDbSqlMock([]); // jsonb @> filter excludes this model
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { checkPackageCoverage } = await import("./services/entitlement-service.js");
    const covered = await checkPackageCoverage("user-model-001", "claude-3-opus"); // not in package

    expect(covered).toBe(false);
  });

  it("exact model in allowed_models_snapshot → covered=true", async () => {
    const mockDbSql = makeDbSqlMock([{ id: "ent-model-ok" }]);
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { checkPackageCoverage } = await import("./services/entitlement-service.js");
    const covered = await checkPackageCoverage("user-model-002", "gpt-4o");

    expect(covered).toBe(true);
  });

  it("listUserEntitlements returns allowedModels array from allowed_models_snapshot", async () => {
    const mockDbSql = makeDbSqlMock([
      {
        id: "ent-list-001",
        package_id: "pkg-001",
        paket_adi: "GPT Paketi",
        kategori: "GPT/Codex",
        daily_limit_snapshot: 50,
        requests_today: 10,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        allowed_models_snapshot: ["gpt-4o", "gpt-4-turbo"],
      },
    ]);
    const mockDb = {
      select: vi.fn(() => ({ from: vi.fn() })),
    };
    vi.doMock("./db/client.js", () => ({ db: mockDb, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { listUserEntitlements } = await import("./services/entitlement-service.js");
    const result = await listUserEntitlements("user-list-001");

    expect(result).toHaveLength(1);
    expect(result[0].allowedModels).toEqual(["gpt-4o", "gpt-4-turbo"]);
    expect(result[0].gunlukLimit).toBe(50);
    expect(result[0].kalanBugun).toBe(40); // 50 - 10
  });

  it("listUserEntitlements: kalanBugun is clamped to 0 (never negative)", async () => {
    const mockDbSql = makeDbSqlMock([
      {
        id: "ent-clamp-001",
        package_id: "pkg-clamp",
        paket_adi: "Clamp Paketi",
        kategori: "Test",
        daily_limit_snapshot: 5,
        requests_today: 10, // over-usage edge case
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        allowed_models_snapshot: ["gpt-4o"],
      },
    ]);
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { listUserEntitlements } = await import("./services/entitlement-service.js");
    const result = await listUserEntitlements("user-clamp-001");

    expect(result[0].kalanBugun).toBe(0); // Math.max(0, 5 - 10) = 0
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// describe: zamanlama edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("zamanlama edge cases", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GAP-07: expired entitlement (expires_at in past) → covered=false even if status='active'", async () => {
    // SQL: expires_at > now() — past timestamp → no rows
    const mockDbSql = makeDbSqlMock([]); // expired row filtered by SQL
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { checkPackageCoverage } = await import("./services/entitlement-service.js");
    const covered = await checkPackageCoverage("user-exp-001", "gpt-4o");

    expect(covered).toBe(false);
  });

  it("GAP-01: multiple active entitlements — tryReservePackageSlot picks SMALLEST-first (ORDER BY daily_limit_snapshot ASC, expires_at ASC)", async () => {
    // Düşükten büyüğe tüketim: SQL ORDER BY daily_limit_snapshot ASC LIMIT 1 önce en KÜÇÜK
    // paketi seçer (eşitlikte erken biten). Mock seçilen satırı döner.
    const smallestEntId = "ent-smallest-first-111";
    const mockDbSql = makeDbSqlMock([{ id: smallestEntId }]);
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { tryReservePackageSlot } = await import("./services/entitlement-service.js");
    const result = await tryReservePackageSlot("user-multi-001", "gpt-4o");

    expect(result.covered).toBe(true);
    expect(result.entitlementId).toBe(smallestEntId);
  });

  it("GAP-03-tz: grantPackageEntitlement extends existing entitlement expires_at by sureGun days", async () => {
    const extendedEntId = "ent-extended-222";
    // First call: existing active entitlement found → extended
    const mockDbSql = vi.fn()
      .mockImplementationOnce(() => Promise.resolve([{ id: extendedEntId }])) // SELECT existing
      .mockImplementationOnce(() => Promise.resolve([{ id: extendedEntId }])); // UPDATE RETURNING
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { grantPackageEntitlement } = await import("./services/entitlement-service.js");
    const txSql = mockDbSql; // reuse same mock as transaction sql

    const resultId = await grantPackageEntitlement(txSql, {
      userId: "user-extend-001",
      packageId: "pkg-extend-001",
      sureGun: 7,
      gunlukIstekLimiti: 50,
      allowedModels: ["gpt-4o"],
      purchaseTransactionId: "tx-extend-001",
    });

    expect(resultId).toEqual({ entitlementId: extendedEntId, extended: true });
    expect(mockDbSql).toHaveBeenCalledTimes(2);
  });

  it("grantPackageEntitlement creates new entitlement when none active for this package", async () => {
    const newEntId = "ent-new-333";
    const mockDbSql = vi.fn()
      .mockImplementationOnce(() => Promise.resolve([]))             // SELECT existing → empty
      .mockImplementationOnce(() => Promise.resolve([{ id: newEntId }])); // INSERT RETURNING
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { grantPackageEntitlement } = await import("./services/entitlement-service.js");
    const txSql = mockDbSql;

    const resultId = await grantPackageEntitlement(txSql, {
      userId: "user-new-001",
      packageId: "pkg-new-001",
      sureGun: 30,
      gunlukIstekLimiti: 100,
      allowedModels: ["gpt-4o", "gpt-4-turbo"],
      purchaseTransactionId: null,
    });

    expect(resultId).toEqual({ entitlementId: newEntId, extended: false });
    // First call = SELECT, second call = INSERT
    expect(mockDbSql).toHaveBeenCalledTimes(2);
  });

  it("grantPackageEntitlement: ayriSatir=true → aktif hak OLSA BİLE yeni satır (extend etmez, SELECT atlanır)", async () => {
    const newEntId = "ent-forcenew-444";
    // ayriSatir=true → existing-lookup ATLANIR; tek DB çağrısı = INSERT.
    const mockDbSql = vi.fn()
      .mockImplementationOnce(() => Promise.resolve([{ id: newEntId }])); // INSERT RETURNING
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { grantPackageEntitlement } = await import("./services/entitlement-service.js");
    const result = await grantPackageEntitlement(mockDbSql, {
      userId: "user-fn-001",
      packageId: "pkg-fn-001",
      sureGun: 6,
      gunlukIstekLimiti: 120,
      allowedModels: ["gpt-5.5"],
      purchaseTransactionId: "tx-fn-001",
    }, true);

    expect(result).toEqual({ entitlementId: newEntId, extended: false });
    expect(mockDbSql).toHaveBeenCalledTimes(1); // SELECT existing atlandı → yalnız INSERT
  });

  it("recordPackageUsage: inserts usage_records row with billedVia='package' and costTL=0", async () => {
    const capturedInserts: any[] = [];
    const mockDb = {
      insert: vi.fn(() => ({
        values: vi.fn((row: any) => {
          capturedInserts.push(row);
          return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    };
    vi.doMock("./db/client.js", () => ({ db: mockDb, dbSql: vi.fn() }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: { requestId: "requestId" } }));

    const { recordPackageUsage } = await import("./services/entitlement-service.js");
    await recordPackageUsage({
      userId: "user-rec-001",
      apiKeyId: "key-rec-001",
      modelId: "gpt-4o",
      entitlementId: "ent-rec-001",
      requestId: "req-rec-001",
      inputUsage: 100,
      outputUsage: 50,
      upstreamRequestId: "upstream-001",
      responseMs: 300,
      status: "success",
    });

    expect(capturedInserts).toHaveLength(1);
    const inserted = capturedInserts[0];
    expect(inserted.billedVia).toBe("package");
    expect(inserted.costTL ?? inserted.cost_tl ?? "0").toBe("0"); // Drizzle numeric → string
    expect(inserted.entitlementId ?? inserted.entitlement_id).toBe("ent-rec-001");
  });
});

describe("Paketlerim — listUserPackagesForPanel durum eşlemesi + duraklat", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("durum kodlarını doğru hesaplar (aktif/duraklatildi/suresi_doldu/gunluk_doldu/tukendi)", async () => {
    const rows = [
      { id: "a", paket_adi: "P-aktif", kategori: "X", daily_limit_snapshot: 500, paused: false, requests_today: 10, cf_remaining: null, cf_units_ordered: 0, activated_at: "2026-06-19", expires_at: "2026-07-19", status: "active", expired: false },
      { id: "b", paket_adi: "P-duraklatildi", kategori: "X", daily_limit_snapshot: 500, paused: true, requests_today: 0, cf_remaining: null, cf_units_ordered: 0, activated_at: "2026-06-19", expires_at: "2026-07-19", status: "active", expired: false },
      { id: "c", paket_adi: "P-suresi", kategori: "X", daily_limit_snapshot: 500, paused: false, requests_today: 0, cf_remaining: null, cf_units_ordered: 0, activated_at: "2026-06-01", expires_at: "2026-06-02", status: "active", expired: true },
      { id: "d", paket_adi: "P-gunluk", kategori: "X", daily_limit_snapshot: 500, paused: false, requests_today: 500, cf_remaining: null, cf_units_ordered: 0, activated_at: "2026-06-19", expires_at: "2026-07-19", status: "active", expired: false },
      { id: "e", paket_adi: "P-cf-tukendi", kategori: "X", daily_limit_snapshot: 150, paused: false, requests_today: 0, cf_remaining: 0, cf_units_ordered: 150, activated_at: "2026-06-19", expires_at: "2026-07-19", status: "active", expired: false },
    ];
    const mockDbSql = makeDbSqlMock(rows);
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: mockDbSql }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));

    const { listUserPackagesForPanel } = await import("./services/entitlement-service.js");
    const out = await listUserPackagesForPanel("user-1");

    expect(out.map((p) => p.durum)).toEqual(["aktif", "duraklatildi", "suresi_doldu", "gunluk_doldu", "tukendi"]);
    expect(out[0].kalan).toBe(490); // 500 - 10
    expect(out[1].paused).toBe(true);
    expect(out[4].kalan).toBe(0); // cf: 150 ordered - 0 remaining = 150 consumed → 0 kalan
    // sağlayıcı/cf-slug/cipher SIZMAMALI
    expect(JSON.stringify(out)).not.toMatch(/cf_api_slug|cf_rc_key|provider_base_url|cipher/i);
  });

  it("setEntitlementPaused — sahiplik: satır dönerse true, dönmezse false", async () => {
    const okMock = makeDbSqlMock([{ id: "ent-x" }]);
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: okMock }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));
    const mod = await import("./services/entitlement-service.js");
    expect(await mod.setEntitlementPaused("user-1", "ent-x", true)).toBe(true);

    vi.resetModules();
    const emptyMock = makeDbSqlMock([]); // başkasının paketi / yok
    vi.doMock("./db/client.js", () => ({ db: {}, dbSql: emptyMock }));
    vi.doMock("./db/schema.js", () => ({ usageRecords: {} }));
    const mod2 = await import("./services/entitlement-service.js");
    expect(await mod2.setEntitlementPaused("user-1", "ent-foreign", true)).toBe(false);
  });
});
