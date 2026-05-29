import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminUi = readFileSync("src/yapayzekalab/tab-admin.jsx", "utf8");
const trafficUi = readFileSync("src/yapayzekalab/tab-admin-traffic.jsx", "utf8");
const adminRoute = readFileSync("src/server/routes/admin.ts", "utf8");

describe("admin traffic analytics contract", () => {
  it("exposes dedicated admin traffic endpoints", () => {
    expect(adminRoute).toContain('router.get("/traffic"');
    expect(adminRoute).toContain('router.get("/traffic/overview"');
    expect(adminRoute).toContain('router.get("/traffic/timeseries"');
    expect(adminRoute).toContain('router.get("/traffic/models"');
    expect(adminRoute).toContain('router.get("/traffic/providers"');
    expect(adminRoute).toContain('router.get("/traffic/users"');
    expect(adminRoute).toContain('router.get("/traffic/api-keys"');
    expect(adminRoute).toContain('router.get("/traffic/errors"');
  });

  it("mounts the traffic analytics section inside admin navigation", () => {
    expect(adminUi).toContain("Trafik Analitiği");
    expect(adminUi).toContain("section === 'traffic'");
    expect(adminUi).toContain("openTrafficUser");
    expect(adminUi).toContain("openTrafficApiKeys");
  });

  it("renders analytics charts and drill-down tables", () => {
    expect(trafficUi).toContain("Trafik analitiği");
    expect(trafficUi).toContain("24 saat");
    expect(trafficUi).toContain("7 gün");
    expect(trafficUi).toContain("30 gün");
    expect(trafficUi).toContain("En çok kullanan 20 kullanıcı");
    expect(trafficUi).toContain("En yoğun 20 API key");
    expect(trafficUi).toContain("Son 50 hatalı istek");
    expect(trafficUi).toContain("Detaya git");
    expect(trafficUi).toContain("API key git");
  });
});
