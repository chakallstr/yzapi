import { describe, it, expect } from "vitest";
import {
  requiredRoleFor,
  allowedTabsForRole,
  PARTNER_TABS,
  ALL_TABS,
} from "./admin-permissions.js";

describe("requiredRoleFor — partner'a açık uçlar", () => {
  it.each([
    ["GET", "/api/admin/dashboard"],
    ["GET", "/api/admin/traffic"],
    ["GET", "/api/admin/traffic/overview"],
    ["POST", "/api/admin/mali-izleme/tara"],
    ["GET", "/api/admin/reconciliation/export"],
    ["GET", "/api/admin/gozcu/findings"],
    ["POST", "/api/admin/gozcu/findings/abc-123/heal"],
    ["POST", "/api/admin/announcements"],
    ["PATCH", "/api/admin/announcements/xy"],
    ["POST", "/api/admin/api-keys/revoke/k1"],
    ["POST", "/api/admin/api-keys/u1/create"],
    ["GET", "/api/admin/audit-logs"],
    ["GET", "/api/admin/bakiye-hareketleri"],
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/users/u1/detail"],
    ["PATCH", "/api/admin/users/u1"],
    ["POST", "/api/admin/users/u1/bakiye"],
    ["GET", "/api/payments/admin/pending-iban"],
    ["POST", "/api/payments/admin/pending-iban/p1/approve"],
    ["POST", "/api/payments/admin/osb-dead-letters/d1/resolve"],
    ["GET", "/api/telegram/admin/accounts"],
    ["POST", "/api/telegram/admin/relink"],
  ])("partner: %s %s", (method, path) => {
    expect(requiredRoleFor(method, path)).toBe("partner");
  });
});

describe("requiredRoleFor — paylaşımlı okuma (GET partner, yazım owner)", () => {
  it.each([
    "/api/admin/provider-durumu",
    "/api/admin/config",
    "/api/admin/kur-history",
    "/api/admin/model-overrides",
  ])("GET %s partner ama POST owner", (path) => {
    expect(requiredRoleFor("GET", path)).toBe("partner");
    expect(requiredRoleFor("POST", path)).toBe("owner");
  });
});

describe("requiredRoleFor — owner-only + fail-closed", () => {
  it.each([
    ["POST", "/api/admin/config"],
    ["GET", "/api/admin/provider-profiles"],
    ["POST", "/api/admin/provider-profiles/activate"],
    ["PATCH", "/api/admin/provider-durumu/popusk"],
    ["POST", "/api/admin/model-overrides"],
    ["DELETE", "/api/admin/model-overrides/m1"],
    ["GET", "/api/admin/api-settings"],
    ["POST", "/api/admin/added-models"],
    ["POST", "/api/admin/refresh-kur"],
    ["GET", "/api/admin/packages"],
    ["POST", "/api/admin/redeem-codes"],
    ["GET", "/api/admin/delivery-orders"],
    ["POST", "/api/admin/users/u1/role"],
    ["GET", "/api/admin/gelecekteki-bilinmeyen-uc"],
  ])("owner-only: %s %s", (method, path) => {
    expect(requiredRoleFor(method, path)).toBe("owner");
  });
});

describe("sekme setleri", () => {
  it("partner sekmeleri tüm sekmelerin alt kümesi", () => {
    for (const t of PARTNER_TABS) expect(ALL_TABS).toContain(t);
  });
  it("owner-only sekmeler tam tümleyen", () => {
    const ownerOnly = ALL_TABS.filter(
      (t) => !(PARTNER_TABS as readonly string[]).includes(t),
    );
    expect([...ownerOnly].sort()).toEqual(
      ["api", "codes", "kur", "overrides", "packages", "providers", "teslimler"].sort(),
    );
  });
  it("allowedTabsForRole rolleri doğru eşler", () => {
    expect(allowedTabsForRole("owner")).toEqual([...ALL_TABS]);
    expect(allowedTabsForRole("partner")).toEqual([...PARTNER_TABS]);
  });
});

describe("requiredRoleFor — path traversal + sıkı traffic", () => {
  it.each([
    ["GET", "/api/admin/traffic/../provider-profiles"],
    ["POST", "/api/admin/users/../x/role"],
    ["GET", "/api/admin/users/../detail"],
  ])("'..' içeren yol owner'a düşer: %s %s", (m, p) => {
    expect(requiredRoleFor(m, p)).toBe("owner");
  });
  it("bilinen traffic alt-yolları partner", () => {
    for (const sub of ["", "/overview", "/timeseries", "/models", "/providers", "/users", "/api-keys", "/errors"]) {
      expect(requiredRoleFor("GET", `/api/admin/traffic${sub}`)).toBe("partner");
    }
  });
  it("bilinmeyen traffic alt-yolu owner (sıkı regex)", () => {
    expect(requiredRoleFor("GET", "/api/admin/traffic/secret-export")).toBe("owner");
  });
});
