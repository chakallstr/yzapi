import { describe, it, expect } from "vitest";
import { buildUsagePayload } from "./usage-payload.js";
import type { ActiveEntitlement } from "./entitlement-service.js";

const ent = (over: Partial<ActiveEntitlement>): ActiveEntitlement => ({
  id: "e1",
  packageId: "p1",
  paketAdi: "Codex Günlük",
  kategori: "codex",
  gunlukLimit: 800,
  kalanBugun: 785,
  kullanilanBugun: 15,
  activatedAt: "2026-07-01T00:00:00.000Z",
  expiresAt: "2026-08-01T00:00:00.000Z",
  allowedModels: ["gpt-5.5"],
  maxContextTokens: 250000,
  cfRemaining: null,
  ...over,
});

describe("buildUsagePayload", () => {
  it("kalan / limit / kullanılan değerlerini paketler arasında toplar", () => {
    const out = buildUsagePayload(
      [
        ent({}),
        ent({ id: "e2", gunlukLimit: 200, kalanBugun: 50, kullanilanBugun: 150 }),
      ],
      { remainingTL: 123.456, remainingUSD: 3.9999 },
    );
    expect(out.remaining_requests_today).toBe(835);
    expect(out.daily_limit_total).toBe(1000);
    expect(out.used_today).toBe(165);
    expect(out.packages).toHaveLength(2);
    expect(out.object).toBe("usage");
    expect(out.balance).toEqual({ tl: "123.46", usd: "3.9999" });
  });

  it("yalnız müşteri-görünür alanları döner (id / cfRemaining / allowedModels / sağlayıcı SIZMAZ)", () => {
    const out = buildUsagePayload([ent({})], { remainingTL: 0, remainingUSD: 0 });
    const p = out.packages[0] as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(
      ["category", "daily_limit", "expires_at", "name", "remaining_today", "used_today"].sort(),
    );
    expect(p).not.toHaveProperty("id");
    expect(p).not.toHaveProperty("packageId");
    expect(p).not.toHaveProperty("cfRemaining");
    expect(p).not.toHaveProperty("allowedModels");
    expect(p).not.toHaveProperty("maxContextTokens");
  });

  it("paket yoksa sıfırları ve boş listeyi döner (bakiye yine gösterilir)", () => {
    const out = buildUsagePayload([], { remainingTL: 10, remainingUSD: 0.3 });
    expect(out.remaining_requests_today).toBe(0);
    expect(out.daily_limit_total).toBe(0);
    expect(out.used_today).toBe(0);
    expect(out.packages).toEqual([]);
    expect(out.balance).toEqual({ tl: "10.00", usd: "0.3000" });
  });
});
