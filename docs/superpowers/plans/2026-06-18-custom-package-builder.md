# Custom Package Builder — Implementation Plan

> **For agentic workers:** Execute phase-by-phase. Each phase ends with: full test run + 3-agent QA (≥2 PASS). On pass, proceed to next phase automatically (no user prompt). Steps use `- [ ]`. **NO live deploy** — all work local; deploy is held for explicit user double-approval.

**Goal:** Müşterinin Paketler sayfasında ürün + günlük limit + süre seçip anlık fiyat görerek kendi paketini oluşturup TL bakiyesinden satın alabildiği self-service builder.

**Architecture:** Mevcut `is_configurable` paket altyapısını genişlet. Fiyat = CF birim-maliyet × limit × gün × hacim-kademeli marj `m(L)`; backend hesaplar, frontend yalnız final TL görür. Satın alma = bakiye debit → CF items-flow provision (mevcut akış).

**Tech Stack:** Express+TS, Drizzle/Postgres, Vitest, React/JSX (tab-packages.jsx), CF reseller API.

**Spec:** `docs/superpowers/specs/2026-06-18-custom-package-builder-design.md`

---

## Faz sırası & DoD (definition of done)

Her faz: TDD (önce test) → implement → `npm run lint` + `npm test` (ilgili) → **3-agent QA (≥2 PASS, ssh YASAK)** → commit (lokal) → sonraki faz. Para-yolu (billing-service) DOKUNULMAZ. Provider-leak: geliş/maliyet/marj asla frontend/public'e.

- **Faz 1** — DB şema + ürün backfill (birim-maliyet/birim-tipi)
- **Faz 2** — Fiyat motoru (`volumeMarkup` + `computeCustomPrice`) + preview genişletme
- **Faz 3** — Preview + purchase-configurable route'ları (recompute + provision)
- **Faz 4** — Frontend builder UI (tab-packages.jsx) + i18n
- **Faz 5** — noleak contract + scan:public + tam test + entegrasyon QA

---

## FAZ 1 — Veri modeli + ürün backfill

**Files:**
- Create: `src/server/db/migrations/00XX_custom_package_builder.sql` (numara: canlı sıraya göre — execute'ta `ls migrations | tail` ile belirle; `meta/_journal.json` idx++)
- Modify: `src/server/db/schema.ts` (packages tablosuna kolonlar)
- Create: `scripts/seed-custom-builder-fields.ts` (ürün birim-maliyet/birim-tipi backfill)
- Test: `src/server/db/__tests__/custom-builder-migration.itest.ts`

- [ ] **1.1 Migration yaz** — kolonlar:
```sql
ALTER TABLE packages ADD COLUMN IF NOT EXISTS cf_unit_cost_tl numeric(14,6);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS birim_tipi text NOT NULL DEFAULT 'istek';
ALTER TABLE packages ADD COLUMN IF NOT EXISTS birim_satis_override_tl numeric(14,4);
```
- [ ] **1.2 schema.ts**'e aynı kolonları ekle (Drizzle): `cfUnitCostTl`, `birimTipi` (default 'istek'), `birimSatisOverrideTl`. `meta/_journal.json`'a sıralı entry.
- [ ] **1.3 itest**: taze DB'de migrate sonrası `information_schema.columns`'ta 3 kolon var; default 'istek'.
- [ ] **1.4 backfill script** — her builder ürünü için `is_configurable=true`, min/max, `cf_unit_cost_tl`, `birim_tipi`. Birim-maliyet (TL/birim/gün, CF: base_price/base_limit/30×0.9):
  codex 0.069 (istek) · gemini 0.030 · grok 0.030 · composer 0.090 · glm 0.024 · gpt-image-2 0.45 (kredi) · grok-imagine 0.15 (kredi) · open-source 0.90 (lifetime, /gün yok) · kimi-k27-code 0.90 (lifetime) · nvidia 0 + `birim_satis_override_tl` (ör. 0.025/istek/gün → admin netleştirir). `min_gunluk_istek=50`, `max_gunluk_istek` ürün-bazlı (metin 5000, görsel 500), `min_sure_gun=1`, `max_sure_gun=90` (lifetime'da NULL).
- [ ] **1.5** Lint + itest çalıştır (gerçek Postgres). QA(3). Commit.

## FAZ 2 — Fiyat motoru

**Files:**
- Create: `src/server/services/custom-package-pricing.ts`
- Modify: `src/server/services/package-purchase-service.ts` (`previewConfigurablePrice` → yeni motoru kullan)
- Test: `src/server/services/custom-package-pricing.test.ts`

- [ ] **2.1 Test yaz** — `volumeMarkup(L)`:
```ts
expect(volumeMarkup(500)).toBe(2.5);
expect(volumeMarkup(1000)).toBe(2.0);
expect(volumeMarkup(2000)).toBeCloseTo(1.7);
expect(volumeMarkup(750)).toBeCloseTo(2.25);
expect(volumeMarkup(10000)).toBe(1.5); // taban
expect(volumeMarkup(50)).toBe(2.5);
```
ve `computeCustomPrice`: istek (geliş×marj), lifetime (gün yok), nvidia (override×limit×gün), yuvarlama.
- [ ] **2.2 Implement** `volumeMarkup` (piecewise: ≤500→2.5; 500-1000 lineer 2.5→2.0; 1000-2000 lineer 2.0→1.7; >2000 max(1.7−0.2·(L−2000)/2000, 1.5)) + `computeCustomPrice({unitCostTl, limit, days, birimTipi, birimSatisOverrideTl, sellKur})` → `{fiyatTL}` (temiz yuvarlama: <200→10, <2000→25, ≥2000→50).
- [ ] **2.3** Test PASS. `previewConfigurablePrice`'ı yeni motora bağla (eski lineer formül yerine; `birim_fiyat_usd_per_50` geriye-uyum: kolon doluysa eski yol, yeni `cf_unit_cost_tl` doluysa yeni yol). 
- [ ] **2.4** Lint + `npm test` (pricing). QA(3). Commit.

## FAZ 3 — Preview + satın alma route

**Files:**
- Modify: `src/server/routes/packages.ts` (preview + purchase-configurable)
- Modify: `src/server/services/package-purchase-service.ts` (purchase: recompute + provision limit/days)
- Test: `src/server/__tests__/custom-package-purchase.itest.ts`

- [ ] **3.1 itest yaz** — preview fiyat döner (sadece TL, geliş/marj YOK); purchase: bakiye debit = recomputed fiyat, entitlement limit/gün = seçilen, yetersiz bakiye→402, Idempotency çift-çekim yok.
- [ ] **3.2 Implement** `POST /api/packages/:id/preview {limit,days}` → `{fiyatTL}` (leak yok). `POST /api/packages/:id/purchase-configurable {limit,days,Idempotency-Key}` → recompute → debit → `provisionCodefastEntitlement({catalog_id, limit_amount:limit, duration_days:days})`. Adım doğrulama (50 taban, <500 %5'in katı / mod 5, ≥500 mod 50).
- [ ] **3.3** itest PASS (gerçek Postgres, provision mock). Lint. QA(3). Commit.

## FAZ 4 — Frontend builder UI

**Files:**
- Modify: `src/yapayzekalab/tab-packages.jsx` ("Kendi Paketini Oluştur" bölümü + builder bileşeni)
- Modify: `src/yapayzekalab/i18n/strings/packages.js` (TR/EN metinler)
- Test: contract/parite (mevcut packages testleri yeşil kalmalı)

- [ ] **4.1** Builder bileşeni: ürün seçici (kapsamdaki ürünler), kademeli-adım limit slider'ı (min50, <500 step5, ≥500 step50), süre (1–90; lifetime'da gizli), debounce'lı `POST preview` → anlık TL, "Oluştur ve Satın Al" (bakiye yeterliyse purchase, değilse yükleme yönlendir).
- [ ] **4.2** i18n anahtarları (TR varsayılan + EN). `useT` deseni.
- [ ] **4.3** `npm run build` (vite) — reject-template-guard'ı geçmeli (i18n/strings taransın). Mevcut packages contract testleri PASS. QA(3). Commit.

## FAZ 5 — Sızıntı koruması + entegrasyon

**Files:**
- Create: `src/server/__tests__/custom-builder-noleak.test.ts`
- Test: tüm suite + `npm run build && npm run scan:public`

- [ ] **5.1** noleak test: `cf_unit_cost_tl`, marj katsayıları, "geliş"/maliyet built bundle'da YOK; preview response'unda yalnız `fiyatTL`.
- [ ] **5.2** `npm test` (tam) + `npm run itest` + `npm run build` + `npm run scan:public` — hepsi yeşil.
- [ ] **5.3** Final 3-agent entegrasyon QA (uçtan uca: builder akışı, leak, billing-izolasyon, adım/sınır kuralları). Commit.
- [ ] **5.4** DUR — "hazır, canlı deploy onayı + DB migration uygulaması için çift-onay bekliyor" raporu. Deploy YAPMA.

---

## Self-review notları
- Spec kapsamı: faz 1 (model/birim) · faz 2 (hacim-marj/fiyat) · faz 3 (satın alma/provision) · faz 4 (UI/slider kuralları) · faz 5 (leak/test) — tüm spec maddeleri kapsanır.
- Migration numarası execute'ta canlı sıradan belirlenecek (sabit yazılmadı — izole-deploy tuzağı).
- Para-yolu (billing-service reserve/settle) DOKUNULMAZ; custom paket ayrı debit path'i (mevcut `purchaseConfigurable` deseni).
- `birim_satis_override_tl` (NVIDIA maliyet-0) ve lifetime (gün yok) faz 2 testlerinde sınır vakaları olarak var.
