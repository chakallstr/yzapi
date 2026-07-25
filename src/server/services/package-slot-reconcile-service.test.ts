import { describe, it, expect } from "vitest";
import { reconcileSlotTarget } from "./package-slot-reconcile-service.js";

/**
 * `reconcileSlotTarget` = uzlaştırmanın saf karar fonksiyonu: bir entitlement satırının
 * `requests_today` sayacı hangi değere çekilmeli? `null` = DOKUNMA.
 *
 * Bu testler 2026-07-16 olayından sonra yazıldı: 5 cron job (bu servisin job'u dahil) bayat
 * bir ağaçtan alınan tam build ile canlıdan sessizce düştü ve kota sayacının self-healer'ı
 * ~14 saat ölü kaldı. Fonksiyon "test edilebilir saf fonksiyon" olarak tasarlanmış ama hiç
 * testi yoktu — QA1/QA2/QA3 üçü de bunu işaretledi.
 */
describe("reconcileSlotTarget", () => {
  const base = { status: "active", resetToday: true, requestsToday: 5, realSuccessToday: 5 };

  describe("dokunma koşulları (null döner)", () => {
    it("aktif olmayan satıra dokunmaz (geçmiş/iptal/duraklatılmış)", () => {
      for (const status of ["expired", "cancelled", "paused", "pending"]) {
        expect(reconcileSlotTarget({ ...base, status, requestsToday: 99, realSuccessToday: 1 })).toBeNull();
      }
    });

    it("gün dönmemişse dokunmaz (yarış önleme)", () => {
      // resetToday=false → sayaç bugüne ait değil; bugünün usage'ına çekmek yanlış olurdu.
      expect(reconcileSlotTarget({ ...base, resetToday: false, requestsToday: 99, realSuccessToday: 1 })).toBeNull();
    });

    it("sayaç zaten doğruysa gereksiz yazma yapmaz", () => {
      expect(reconcileSlotTarget({ ...base, requestsToday: 7, realSuccessToday: 7 })).toBeNull();
    });
  });

  describe("düzeltme (hedef döner)", () => {
    it("over-count'u gerçeğe çeker — müşteri-favori yön (sızan rezervasyon slotu)", () => {
      // Asıl var oluş sebebi: rezerve edilip ne success yazan ne release edilen istekler
      // sayacı şişirir → müşteri ödediği kotayı alamaz.
      expect(reconcileSlotTarget({ ...base, requestsToday: 12, realSuccessToday: 8 })).toBe(8);
    });

    it("under-count'u da gerçeğe çeker", () => {
      expect(reconcileSlotTarget({ ...base, requestsToday: 3, realSuccessToday: 9 })).toBe(9);
    });

    it("bugün hiç başarılı istek yoksa 0'a çeker", () => {
      expect(reconcileSlotTarget({ ...base, requestsToday: 4, realSuccessToday: 0 })).toBe(0);
    });
  });

  describe("sınır/bozuk girdi güvenliği", () => {
    it("negatif gerçek sayı 0'a kıskaçlanır (asla negatif kota yazma)", () => {
      expect(reconcileSlotTarget({ ...base, requestsToday: 5, realSuccessToday: -3 })).toBe(0);
    });

    it("kesirli gerçek sayı aşağı yuvarlanır", () => {
      expect(reconcileSlotTarget({ ...base, requestsToday: 5, realSuccessToday: 8.9 })).toBe(8);
    });

    it("NaN/undefined gerçek sayı 0 sayılır, throw etmez", () => {
      expect(reconcileSlotTarget({ ...base, requestsToday: 5, realSuccessToday: NaN })).toBe(0);
      expect(
        reconcileSlotTarget({ ...base, requestsToday: 5, realSuccessToday: undefined as unknown as number }),
      ).toBe(0);
    });
  });

  describe("K1: bu fonksiyon ASLA kota YÜKSELTEREK bedava servis açamaz", () => {
    it("hedef her zaman bugünkü otoriter usage_records sayısıdır — uydurulmuş tavan değil", () => {
      // Hedef girdideki realSuccessToday'den türer; daily_limit/ödeme/CF durumundan DEĞİL.
      // Yani fonksiyon bir müşteriye "daha fazla hakkın var" diyemez; yalnız gerçeği yansıtır.
      for (const real of [0, 1, 500, 1000]) {
        expect(reconcileSlotTarget({ ...base, requestsToday: 123456, realSuccessToday: real })).toBe(real);
      }
    });
  });
});
