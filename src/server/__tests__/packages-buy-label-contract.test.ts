import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Regresyon kilidi: builder ("Kendin Yap" / ConfigurablePackageCard) kartının
// SATIN-ALMA butonu (onClick → onBuy → bakiyeden tahsil) yanlışlıkla
// "Detayları gör →" yazıyordu. Müşteri butonu "detay göster" sanıp basıyor,
// paket anında satın alınıp bakiyesinden düşülüyordu (hepterci@gmail.com şikâyeti).
// Doğru etiket, diğer tüm kartlarla aynı: t('packages.buyBtn') = "Bakiye ile al".
describe("packages satın-alma butonu etiketi", () => {
  const card = readFileSync(
    join(process.cwd(), "src/yapayzekalab/tab-packages.jsx"),
    "utf8",
  );

  it("hiçbir satın-alma butonu 'Detayları gör' (yanıltıcı 'detay göster' etiketi) ile etiketlenmez", () => {
    expect(card).not.toMatch(/Detayları gör/);
  });

  it("builder kartının satın-alma butonu standart buyBtn etiketini kullanır (normal kartla parite)", () => {
    // Hem PackageCard hem ConfigurablePackageCard satın-alma butonu t('packages.buyBtn').
    const buyBtnUses = card.match(/t\(\s*['"]packages\.buyBtn['"]\s*\)/g) || [];
    expect(buyBtnUses.length).toBeGreaterThanOrEqual(2);
  });
});
