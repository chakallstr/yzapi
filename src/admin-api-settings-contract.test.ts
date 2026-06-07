import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminRouteSource = readFileSync("src/server/routes/admin.ts", "utf8");
const proxySource = readFileSync("src/server/routes/proxy.ts", "utf8");
const adminUiSource = readFileSync("src/yapayzekalab/tab-admin.jsx", "utf8");

describe("admin api settings contract", () => {
  it("exposes dedicated admin endpoints for system, model, provider and api key policies", () => {
    expect(adminRouteSource).toContain('router.get("/api-settings"');
    expect(adminRouteSource).toContain('router.post("/api-settings"');
    expect(adminRouteSource).toContain('router.get("/api-settings/providers"');
    expect(adminRouteSource).toContain('router.get("/api-settings/models"');
    expect(adminRouteSource).toContain('router.post("/api-settings/models/:id"');
    expect(adminRouteSource).toContain('router.get("/api-settings/api-keys/:id/policy"');
    expect(adminRouteSource).toContain('router.post("/api-settings/api-keys/:id/policy"');
  });

  it("renders a single admin api management section with grouped controls", () => {
    expect(adminUiSource).toContain("API Yönetimi");
    expect(adminUiSource).toContain("Genel API");
    expect(adminUiSource).toContain("Limitler");
    expect(adminUiSource).toContain("Model Politikaları");
    expect(adminUiSource).toContain("API Key Politikaları");
    expect(adminUiSource).toContain("Provider Yönlendirme");
    expect(adminUiSource).toContain("Davranış ve Güvenlik");
  });

  it("wires runtime proxy behavior to dynamic api settings", () => {
    expect(proxySource).toContain("maintenanceModeForApi");
    expect(proxySource).toContain("endpointEnabledFor");
    expect(proxySource).toContain("getActiveProviderAdapter");
    expect(proxySource).toContain("upstream402PassThroughEnabled");
  });
});
