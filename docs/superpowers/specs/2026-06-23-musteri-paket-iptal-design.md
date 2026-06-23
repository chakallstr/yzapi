# Müşteri Self-Servis Paket İptali — Tasarım Dokümanı

- **Tarih:** 2026-06-23
- **Proje:** yzapi (`yapayzekalab`) — https://yapayzekalab.org
- **Durum:** Onaylandı (tasarım), implementasyon planı bekliyor
- **Kapsam:** Müşterinin "Paketlerim" sekmesinde kendi aktif paketini self-servis **iptal etmesi** (silmesi/bitirmesi). Para iadesi YOK.

---

## 1. Problem / Amaç

Bugün müşteri "Paketlerim" sekmesinde paketini **iptal/sonlandıramıyor**. Sadece geçici **Duraklat/Devam et** ve **Yenile** var. Kullanıcı, istemediği veya bitmiş bir paketi kalıcı olarak durdurup aktif listesinden kaldırabilmek istiyor.

İstek (kullanıcı sözleriyle): *"kullanıcılar paketlerini silebilmeli, bitirebilmeli, iptal edebilmeli; aktif paketine tıklayınca üstüne çıkıp paketi düzeltebilmeli — yani silebilecek, iptal edebilecek."*

---

## 2. Kararlar (brainstorming Q&A çıktısı)

| Karar | Seçim |
|------|-------|
| **Para tarafı** | **İade YOK.** İptal sadece paketi durdurur + aktif listeden kaldırır. Hiçbir bakiye/ledger hareketi olmaz. |
| **İptal sonrası görünüm** | Paket **geçmişe taşınır**: aktif listeden çıkar, panel listesinde **"İptal edildi"** olarak görünür (kayıt DB'de kalır). |
| **Kapsam** | İptal edilebilir = DB'de `status='active'` olan satırlar: **aktif + duraklatılmış + istek hakkı bitmiş (tukendi)** dahil. Süresi dolmuş / zaten iptal edilmiş / revoked olanlarda iptal butonu gösterilmez. |
| **Otomatik "Bitti"** | İstek hakkı (toplam) tükenen CF paketleri (`tukendi`) panelde otomatik **"Bitti"** etiketi alır. ⚠️ Günlük limiti dolan ama ertesi gün yenilenen paketler (`gunluk_doldu`) **"Bitti" değil**, "Günlük doldu" kalır. |
| **Arayüz** | Karta tıkla → **modal / pop-over** (üstte açılan pencere). Yönetim aksiyonları (Duraklat/Devam, Yenile, İptal et) modale taşınır. |

---

## 3. Seçilen Yaklaşım

**Yaklaşım A — `status='cancelled'` + yeni endpoint + modal.** Mevcut `pause/resume` desenini birebir izler.

- `user_package_entitlements.status` kolonu **zaten var** (`schema.ts`, default `'active'`). Yeni terminal değer `'cancelled'` eklenir.
- **Migration GEREKMEZ** — yalnız mevcut `status` kolonuna yeni bir string değer yazıyoruz; şema değişmiyor. Bu, CLAUDE.md'de belgelenen migration-journal tuzaklarından (drizzle'ın sessizce migration atlaması, ruflo MCP'nin spurious migration üretmesi, `_journal.json` `when` sırası) tamamen kaçınır.
- Gate (`checkPackageCoverage` / `tryReservePackageSlot`) zaten `status='active'` filtreler → iptal edilen paket **anında servis vermeyi durdurur** ve aktif listeden düşer.
- `listUserEntitlements` (aktif-only) iptal edileni hariç tutar; `listUserPackagesForPanel` (tüm statüler) onu geçmiş olarak gösterir.

### Reddedilen alternatifler
- **B — pause altyapısını "kalıcı durdurma" gibi kullanmak:** pause geri-alınabilir ve paket aktif listede kalır; "geçmişe taşı" semantiğini karşılamaz.
- **C — yeni `deleted_at`/`hidden` soft-delete kolonu:** "tamamen kaybolsun" yerine "geçmişe taşınsın" seçildi; ekstra kolon + migration gereksiz risk.

---

## 4. Detaylı Tasarım

### 4.1 Durum modeli
- `status='cancelled'` **terminal**'dir; geri-alma (un-cancel) **yok**. Geçici durdurma için zaten `paused` var.
- İptal edilebilirlik kuralı (tek kaynak): satırın DB `status`'u `'active'` **ve** henüz iptal/revoke edilmemiş. Bu küme aktif/duraklatılmış/günlük-dolu/istek-hakkı-bitmiş satırların hepsini kapsar (hepsinin DB `status`'u `'active'`).
- Süresi dolmuş satır (`status='active'` ama `expires_at < now()`): zaten kullanılamıyor; **iptal butonu gösterilmez** (geçmiş gibi davranılır).

### 4.2 Backend

**Servis — `src/server/services/entitlement-service.ts`** (mevcut `setEntitlementPaused` deseni):
```
export async function cancelEntitlement(userId, entitlementId): Promise<boolean> {
  // tek atomik UPDATE; sahiplik + idempotency WHERE içinde
  // UPDATE user_package_entitlements
  //   SET status='cancelled', updated_at=now()
  //   WHERE id = $entitlementId::uuid
  //     AND user_id = $userId::uuid
  //     AND status = 'active'
  //   RETURNING id
  // dönen satır var → true; yok → false (bulunamadı / zaten iptal / sahip değil)
}
```
- Para hareketi YOK, ledger'a INSERT YOK, CF/upstream API çağrısı YOK.
- Doğal **idempotent**: ikinci çağrı 0 satır günceller (zaten `cancelled`), endpoint yine başarı döndürür.
- EXTEND edilmiş satırlar için özel "over-revoke guard" gerekmez (iade yok, başka satıra dokunmuyoruz; kullanıcı kendi paketini iptal ediyor).

**Route — `src/server/routes/user.ts`** (mevcut pause/resume/renew bloğunun yanına):
```
POST /api/user/entitlements/:id/cancel
  → middleware: userAuth + requireWhatsappVerified (mevcut, /api/user altında)
  → const ok = await cancelEntitlement(req.user!.id, req.params.id)
  → if (!ok) 404 { error: "Paket bulunamadı" }
  → await writeAudit("package_cancel", req.params.id, "Müşteri paketi iptal etti", req.user!.id)
  → res.json({ ok: true, cancelled: true })
```

### 4.3 Frontend — `src/yapayzekalab/tab-mypackages.jsx`
- `PackageRow` **tıklanabilir** olur (cursor pointer + erişilebilirlik için role/keyboard). Tıkla → **modal** açılır.
- Modal içeriği: paket adı, kategori, kalan/limit + ilerleme barı, tarihler (activated→expires), durum rozeti.
- Aksiyonlar modale taşınır:
  - **Duraklat / Devam et** (mevcut `togglePause`) — sadece iptal edilebilir/aktif satırda.
  - **Yenile** (mevcut `renew`) — `renewable` ise.
  - **İptal et** (kırmızı) — yalnız iptal edilebilir satırda görünür.
- **İptal et** → ikinci adım onay metni: *"Bu paketi iptal etmek istiyorsun. Geri alınamaz ve para iadesi yoktur."* → Onayla → `apiJson('/api/user/entitlements/:id/cancel', {method:'POST'})` → başarı toast'ı + liste yeniden yüklenir (paket geçmişe düşer, modal kapanır).
- Hata: `cancelErr` toast'ı, modal açık kalır.
- **Otomatik "Bitti" etiketi:** panel durum hesabında `tukendi` → görsel etiket **"Bitti"**. (Bu, frontend i18n/etiket değişikliği; `gunluk_doldu` etiketi değişmez.)

### 4.4 i18n — `src/yapayzekalab/i18n/strings/mypackages.js` (tr + en parite)
- `cancel` = "İptal et" / "Cancel"
- `cancelConfirm` = "Bu paketi iptal etmek istiyor musun? Geri alınamaz ve para iadesi yoktur." / "Cancel this package? This cannot be undone and there is no refund."
- `cancelOk` = "Paket iptal edildi." / "Package cancelled."
- `cancelErr` = "İptal başarısız oldu, tekrar dene." / "Cancellation failed, please try again."
- Durum etiketleri: `cancelled` = "İptal edildi" / "Cancelled"; `bitti` = "Bitti" / "Finished" (veya mevcut `tukendi` etiketini "Bitti"ye çek).

### 4.5 Güvenlik & sahiplik
- Sahiplik garantisi: tüm mutasyon `WHERE user_id = $userId`. JWT tabanlı `userAuth` (yzk_live_ API anahtarları panel endpoint'lerinde reddediliyor); hesap `durum='aktif'` zorunlu.
- Para/ledger tablosuna **dokunulmadığı** için auto-mode para-kritik sınıflandırıcısı ve para-kritik onay/3-QA akışı bu endpoint için tetiklenmez (yine de proje genel 3-QA + çift onay deploy kuralı uygulanır).

### 4.6 Geri-alınamazlık & denetim
- İptal terminaldir; "geri al" yok. Geçici ihtiyaç için Duraklat var.
- Her iptal `audit_logs`'a `package_cancel` olarak yazılır (`writeAudit`).
- Tekrar kullanmak isteyen müşteri Paketler sekmesinden yeniden satın alır (yeni satır; mevcut akış değişmez).

---

## 5. Kapsam Dışı (Non-Goals)
- Para iadesi / pro-rata iade (bilinçle dışarıda; ileride ayrı para-kritik tasarım gerekir).
- CF tarafında deprovision / kota geri verme (ısmarlanmış cf_units batık; dokunulmuyor).
- Süresi dolmuş/eski paketleri görünümden tamamen gizleme (kullanıcı "geçmişe taşınsın" seçti).
- Admin tarafı toplu iptal (bu spec yalnız müşteri self-servis).

---

## 6. Test
- **Backend (unit + sözleşme):**
  - Sahip olmayan kullanıcı iptal denemesi → 404, satır değişmez.
  - Başarılı iptal → `status='cancelled'`, `updated_at` güncellenir.
  - İdempotency → ikinci çağrı 404/`ok` (0 satır), durum bozulmaz.
  - İptal sonrası gate → `checkPackageCoverage` artık o paketle servis vermiyor.
  - `listUserEntitlements` iptal edileni hariç tutuyor; `listUserPackagesForPanel` "iptal edildi" gösteriyor.
  - Mevcut `packages-noleak` sözleşmesi korunur (maliyet/fiyat sızıntısı yok).
- **Frontend:** JSX render harness yok → lint (`tsc --noEmit`) + tam test + `npm run build` + manuel tık testi.

---

## 7. Deploy Riski & İzolasyon (implementasyon aşamasının notu)
- ⚠️ CLAUDE.md: yerel `~/yzapi` çalışma ağacı canlının gerisinde/üstünde olabilir (drift + contamination). **`LOCAL_SRC=~/yzapi` ile deploy YASAK.**
- Ship tekniği: hedef dosyaların **canlı sürümünü `scp` ile indir** → yalnız bizim hunk'larımızı uygula → izole staging'den `rsync -rlzn --checksum --itemize-changes` ile **sadece bizim dosyalarımızın** çıktığını kanıtla → canlı yedek al → gate'i elle çalıştır: `npm run lint && npm test && npm run build && systemctl restart turkapiprojesi && curl …/health`.
- ⚠️ `npm run build` hem React panelini (`vite build` → `dist/assets/index-*.js`) hem server'ı (`esbuild` → `dist/server.js`) üretir; panel-only `.jsx` değişikliği bile tam build + yeni hash'li bundle ship'i gerektirir (müşteri tarayıcısı hard-refresh gerekebilir).
- Migration olmadığı için DB tarafı risk minimumdur.
- 3-QA (≥2 PASS) + çift onay kuralı geçerli.

---

## 8. Açık Sorular
Yok — tüm kararlar (para, görünüm, kapsam, arayüz, Bitti ayrımı) onaylandı.
