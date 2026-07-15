import { describe, it, expect } from "vitest";
import { partitionIbanBulkDelete } from "./iban-bulk-delete.js";

/**
 * PARA GÜVENLİĞİ birim testi: toplu havale-bildirimi silme kararı.
 * Kural: yalnız 'bekliyor' ve 'reddedildi' (bakiye YÜKLENMEMİŞ) satırlar silinebilir.
 * 'onaylandi' (bakiye yüklenmiş) ve BİLİNMEYEN her durum ASLA silinemez — allowlist,
 * blocklist değil (gelecekte eklenecek bir 'iade' durumu da otomatik korunur).
 */
describe("partitionIbanBulkDelete", () => {
  it("bakiye yüklenmiş 'onaylandi' satırı asla silinebilir sayılmaz", () => {
    const { deletableIds, blocked } = partitionIbanBulkDelete([{ id: "a", durum: "onaylandi" }]);
    expect(deletableIds).toEqual([]);
    expect(blocked).toBe(1);
  });

  it("'bekliyor' ve 'reddedildi' silinebilir", () => {
    const { deletableIds, blocked } = partitionIbanBulkDelete([
      { id: "a", durum: "bekliyor" },
      { id: "b", durum: "reddedildi" },
    ]);
    expect(deletableIds).toEqual(["a", "b"]);
    expect(blocked).toBe(0);
  });

  it("karışık küme: onaylandi korunur, diğerleri silinir", () => {
    const { deletableIds, blocked } = partitionIbanBulkDelete([
      { id: "a", durum: "bekliyor" },
      { id: "b", durum: "onaylandi" },
      { id: "c", durum: "reddedildi" },
    ]);
    expect(deletableIds).toEqual(["a", "c"]);
    expect(blocked).toBe(1);
  });

  it("bilinmeyen/gelecekteki durum (ör. 'iade') güvenlik için silinmez", () => {
    const { deletableIds, blocked } = partitionIbanBulkDelete([{ id: "a", durum: "iade" }]);
    expect(deletableIds).toEqual([]);
    expect(blocked).toBe(1);
  });

  it("boş girişte boş sonuç", () => {
    expect(partitionIbanBulkDelete([])).toEqual({ deletableIds: [], blocked: 0 });
  });
});
