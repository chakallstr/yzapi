import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminUi = readFileSync("src/yapayzekalab/tab-admin.jsx", "utf8");
const adminRoute = readFileSync("src/server/routes/admin.ts", "utf8");

describe("admin user detail contract", () => {
  it("exposes a dedicated admin user detail endpoint", () => {
    expect(adminRoute).toContain('router.get("/users/:id/detail"');
    expect(adminRoute).toContain("modelStats");
    expect(adminRoute).toContain("usageRecords");
    expect(adminRoute).toContain("transactions");
  });

  it("renders expandable user detail controls in admin users tab", () => {
    expect(adminUi).toContain("Kullanıcı detayı yükleniyor");
    expect(adminUi).toContain("Detayı kaydet");
    expect(adminUi).toContain("Model kullanımı");
    expect(adminUi).toContain("Son API kullanımı");
    expect(adminUi).toContain("Bakiye hareketleri");
    expect(adminUi).toContain("API key oluştur");
  });

  it("keeps admin users sorted newest-first by default and exposes sort controls", () => {
    expect(adminRoute).toContain("sortAdminUsers");
    expect(adminRoute).toContain('const DEFAULT_USER_SORT = "kayitTarihi_desc"');
    expect(adminRoute).toContain("compareDateDesc");

    expect(adminUi).toContain("USER_SORT_OPTIONS");
    expect(adminUi).toContain("En yeni üyeler");
    expect(adminUi).toContain("En eski üyeler");
    expect(adminUi).toContain("En yüksek bakiye");
    expect(adminUi).toContain("En çok istek");
    expect(adminUi).toContain("Sıralama");
  });
});
