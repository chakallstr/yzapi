import { describe, it, expect } from "vitest";
import { formatAdminEvent, normalizeRecipient } from "./admin-notify-service.js";

describe("admin-notify formatAdminEvent (saf)", () => {
  it("yeni üye olayını formatlar (🆕 + email)", () => {
    const text = formatAdminEvent({ kind: "yeni_uye", title: "Yeni üye kaydı", userEmail: "a@b.com" });
    expect(text).toContain("🆕 YapayZekaLab — Yeni üye kaydı");
    expect(text).toContain("Kullanıcı: a@b.com");
  });

  it("ödeme denemesi olayını formatlar (💳 + tutar + yöntem)", () => {
    const text = formatAdminEvent({
      kind: "odeme_denemesi",
      title: "Ödeme başlatıldı",
      method: "shopier",
      amountTL: 100,
      reference: "ORD-1",
    });
    expect(text).toContain("💳");
    expect(text).toContain("Yöntem: shopier");
    expect(text).toContain("Tutar: ₺100.00");
    expect(text).toContain("Referans: ORD-1");
  });

  it("ödeme sorunu olayını formatlar (🔴 + durum)", () => {
    const text = formatAdminEvent({
      kind: "odeme_sorunu",
      title: "Shopier imza hatası",
      status: "invalid_signature",
    });
    expect(text).toContain("🔴");
    expect(text).toContain("Durum: invalid_signature");
  });

  it("opsiyonel alanlar yoksa satır eklemez", () => {
    const text = formatAdminEvent({ kind: "yeni_uye", title: "T" });
    expect(text).toBe("🆕 YapayZekaLab — T");
  });

  it("detail satırını ekler", () => {
    const text = formatAdminEvent({ kind: "odeme_sorunu", title: "T", detail: "manuel kontrol" });
    expect(text).toContain("manuel kontrol");
  });

  it("geçersiz tutarı (NaN) atlar", () => {
    const text = formatAdminEvent({ kind: "odeme_denemesi", title: "T", amountTL: NaN });
    expect(text).not.toContain("Tutar");
  });

  it("ödeme yapıldı olayını formatlar (✅ + USD≈TL)", () => {
    const text = formatAdminEvent({
      kind: "odeme_yapildi",
      title: "Ödeme YAPILDI (müşteri bildirdi)",
      userEmail: "c@d.com",
      amountUsd: 10,
      amountTL: 478,
      reference: "ABC123",
    });
    expect(text).toContain("✅ YapayZekaLab — Ödeme YAPILDI (müşteri bildirdi)");
    expect(text).toContain("Tutar: $10.00 ≈ ₺478.00");
    expect(text).toContain("Referans: ABC123");
  });

  it("amountUsd yoksa eski ₺-only davranışı korunur", () => {
    const text = formatAdminEvent({ kind: "odeme_denemesi", title: "T", amountTL: 100 });
    expect(text).toContain("Tutar: ₺100.00");
    expect(text).not.toContain("$");
  });
});

describe("admin-notify normalizeRecipient (saf)", () => {
  it("rakam dışını temizler", () => {
    expect(normalizeRecipient("+90 532 111 22 33")).toBe("905321112233");
    expect(normalizeRecipient("0532-111-2233")).toBe("05321112233");
  });
  it("boş/undefined güvenli", () => {
    expect(normalizeRecipient("")).toBe("");
    expect(normalizeRecipient(undefined as unknown as string)).toBe("");
  });
});
