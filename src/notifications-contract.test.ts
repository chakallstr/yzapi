import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/yapayzekalab/App.jsx", "utf8");
// i18n: user-facing strings moved to the app-shell dictionary fragment.
const shell = readFileSync("src/yapayzekalab/i18n/strings/app-shell.js", "utf8");

describe("real notifications contract", () => {
  it("removes hardcoded notification mock data", () => {
    expect(source).not.toContain("seedNotifs");
    expect(source).not.toContain("Yeni API anahtarı oluşturuldu");
    expect(source).not.toContain("Claude Opus 4.7 fiyatı güncellendi");
  });

  it("reads active announcements from backend", () => {
    expect(source).toContain("/api/announcements/active");
    // wiring intact (i18n keys referenced) + strings still shipped (in the TR dict)
    expect(source).toContain("appShell.notif.empty");
    expect(source).toContain("appShell.notif.footer");
    expect(shell).toContain("Aktif admin duyurusu yok.");
    expect(shell).toContain("Admin duyuruları anlık yayınlanır");
  });
});
