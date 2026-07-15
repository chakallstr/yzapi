# Tek Sayaç (Unified CF Counter) — Uygulama Planı

> **Agentic worker'lar için:** GEREKLİ ALT-BECERİ: bu planı görev-görev uygulamak için `superpowers:subagent-driven-development` (önerilen) veya `superpowers:executing-plans`. Adımlar `- [ ]` checkbox.
>
> ⚠️ **PARA-KRİTİK CANLI SİSTEM.** Her faz izole targeted-rsync + sunucu gate (lint→test→build→migrate→restart→health) + 3-QA + Ufuk onayı. Lokal `main` canlıdan GERİDE → her dosya canlıdan indirilip hunk uygulanır (LOCAL_SRC=~/yzapi YASAK). Geliştirme replikası: `/Users/ufuk/yzapi-audit-live` (canlı birebir).

**Goal:** CF kota için sitedeki TÜM sayaçları (gösterim + kapı + over-serve freni) tek bir kaynağa bağlamak: müşteriye-görünen "kalan istek" = `cf_remaining` (CF'nin verdiği gerçek kalan), her istekte hareket eden (koltuk dahil), CF temasında CF'ye hizalanan, tam-sayı adımlı tek sayaç. Müşteriye çarpan (1.5x/ünite/×) hiçbir yerde görünmez.

**Architecture:** `cf_remaining` (müşteri/havuz-bazlı, `cf_customer_id`) TEK KAYNAK olur. (1) CF servis ettiğinde CF header'ı/`cf_usage_ledger.remaining` ile **hizalanır** (CF otoriter). (2) Koltuk (Codex seat) servis ettiğinde CF çağrılmadığından sayaç **bizim tarafımızdan** model-çarpanıyla düşülür; küsurat `cf_unit_fraction` biriktiricisinde tutulur, tam sayıya ulaşınca `cf_remaining`'den düşülür. (3) Gösterim/kapı/fren ÜÇÜ DE aynı `cf_remaining`'i okur → fren ayrı `cf_served` snapshot'ına gerek kalmaz (sayaç artık donmaz: `cf_remaining ≤ 0` = hem kapı hem fren).

**Tech Stack:** Express + TypeScript, PostgreSQL (Drizzle + raw `dbSql`), Vitest (unit + itest), React/JSX SPA. Tüm para mantığı atomik tek-UPDATE + idempotency key.

---

## 0. MEVCUT DURUM — neden üç sayaç var (kanıtlı, canlı koddan)

| Sayaç | Kaynak | Hareket | Sorun |
|---|---|---|---|
| `cf_remaining` (CF ayna) | `x-codefast-remaining` header + `cf_usage_ledger.remaining` (otoriter). Yazımlar: `entitlement-service.ts:276-303 updateCfRemaining` (success şartsız / error 2sn-guard, `Math.floor`), `cf-ledger-service.ts:100-116 syncCfRemainingMirror` (`Math.trunc`), `cf-mirror-sync-job.ts` (30sn). | Yalnız CF servis edince. **Koltukta DONAR.** | Donunca over-serve freni tetiklenemez = zarar |
| `requests_today` (günlük) | `tryReservePackageSlot` (`entitlement-service.ts:162-252`) her istekte +1, gece reset. | HER istekte (koltuk dahil). | Günlük; CF-ünite değil 1/istek; `cf_remaining`'le çelişir |
| `cf_served` (snapshot) | `cf-served-refresh-job.ts` 15dk, `usage_records` success+package, `activated_at`'ten. Fren girdisi (`cf-overserve-cap.ts:18-43 shouldCapOverServe`: `cf_served > daily_limit × capMult`, capMult=0 INERT). | HER istekte (15dk gecikmeli). | Ayrı snapshot; cf_remaining'den bağımsız |
| Gösterim tüketimi | `computeDisplayConsumed` (`entitlement-service.ts:469-487`) = `max(cfConsumedMirror, used_success)`; `listUserPackagesForPanel` (`:572-696`) cfLazy dalı `:661-666`. | — | cf_remaining'den FARKLI hesap → ekranlar farklı sayı |

**Bugün (2026-06-25) canlıya çıkan codex-DAILY gate** (`checkPackageCoverage`/`tryReservePackageSlot` SQL'inde `cf_api_slug='codex-api'`): codex paketleri `requests_today < daily_limit` ile günlük kapılanıyor, `cf_remaining` clause'undan MUAF. Bu, seat over-serve "936/500"u kapattı ama `cf_remaining`'i codex için gate-dışı bıraktı → **tek-sayaç hedefiyle çelişen ikinci model.** Bkz §8 KARAR.

**Çarpan kaynağı:** `cf-unit-multiplier.ts:15-18` `CF_MODEL_UNIT_MULTIPLIERS={gpt-5.5:1.5, gpt-5.4:1.0}`, default 1.0. Gerçek kaynak `cf_usage_ledger.cost_units` (`migrations/0042`, codex-api'nin %91.8'i 1.5). **Müşteriye görünmez; yalnız admin `admin.ts:807 requestsToCfUnits`.** Frontend sızıntı taraması TEMİZ (tab-mypackages/activity/packages + i18n'de 0 çarpan-metni).

---

## 1. HEDEF MİMARİ — tek sayaç akışı

```
Her CF-paket isteği (proxy.ts settleBilling, billedViaPackage=true)
  │
  ├─ CF servis etti mi? (usage.cfRemaining != null  VEYA  cfRemainingFromError != null)
  │     EVET → HİZALA: cf_remaining = CF'nin verdiği değer (otoriter, müşteri-bazlı tüm kardeşler)
  │            cf_unit_fraction = 0 (CF zaten kesirli gerçeği tuttu → biriktirici sıfırlanır)
  │
  │     HAYIR (koltuk servisi) → BİZ DÜŞ:
  │            mult = cfModelUnitMultiplier(model.id)   // gpt-5.5=1.5, gpt-5.4=1.0
  │            frac = cf_unit_fraction + mult
  │            whole = floor(frac)
  │            cf_remaining = GREATEST(0, cf_remaining - whole)
  │            cf_unit_fraction = frac - whole          // küsuratı taşı
  │
  ▼
GÖSTERİM (her ekran)  = cf_remaining            (tek sayı, tam, her yerde aynı)
KAPI (gate)           = cf_remaining > 0        (checkPackageCoverage / tryReservePackageSlot)
FREN (over-serve)     = cf_remaining > 0        (ayrı cf_served/capMult'a gerek YOK — sayaç donmadığı için)
```

**İlkeler:**
- **CF otoriter:** CF her konuştuğunda sayaç onun gerçeğine çekilir (bizim koltuk-tahminimiz drift ederse düzelir).
- **Sayaç asla donmaz:** koltukta biz düşeriz → fren her zaman çalışır.
- **Tam-sayı:** küsurat `cf_unit_fraction`'da birikir; müşteri hep tam sayı görür (2 gpt-5.5 → −3).
- **Çarpan gizli:** müşteri sadece düşen tam sayıyı görür; "1.5/ünite/×/çarpan" hiçbir müşteri yüzeyinde yok.

---

## 2. DOSYA YAPISI — neyi nerede değiştiriyoruz

| Dosya | Sorumluluk | Değişim |
|---|---|---|
| `db/migrations/00XX_cf_unit_fraction.sql` + `db/schema.ts` | Veri modeli | YENİ `cf_unit_fraction numeric(6,4) DEFAULT 0` kolonu (küsurat biriktirici). INERT. |
| `services/cf-counter-service.ts` **(YENİ)** | Tek-sayaç çekirdeği | `applySeatDecrement(userId, model)` + `reconcileToCf(userId, cfRemaining)` saf+atomik fonksiyonlar; whole-number kuralı tek yerde. |
| `services/cf-unit-multiplier.ts` | Çarpan | DEĞİŞMEZ (`cfModelUnitMultiplier` yeniden kullanılır). |
| `routes/proxy.ts` | Yaz-yolu | `settleBilling` (`:263-326`): CF servis etti→`reconcileToCf`, koltuk→`applySeatDecrement`. `updateCfRemaining` çağrısı bu mantığa sarılır. |
| `services/entitlement-service.ts` | Gate + gösterim | `updateCfRemaining`→hizalama (fraction sıfırla); `computeDisplayConsumed`/`listUserPackagesForPanel`/`listUserEntitlements`→`kalan = cf_remaining`; gate clause'ları tek-kaynağa sadeleşir (§7 KARAR'a bağlı). |
| `services/cf-overserve-cap.ts` | Fren | `shouldCapOverServe`→`cf_remaining ≤ 0` tabanlı (cf_served/capMult emekliye ayrılır ya da yedek kalır). |
| `routes/user.ts`, `routes/admin.ts` | API şekli | Dönen `kalan/kullanilan` tek-kaynaktan; admin çarpan-gösterimi (ops) KORUNUR. |
| `yapayzekalab/tab-mypackages.jsx`, `tab-activity.jsx` | Gösterim | `kalan` zaten render ediliyor; tek-kaynak garantisi + (varsa) çelişen ikinci sayı kaldırılır. |
| `scripts/scan-public-bundle.mjs` + yeni `*-noleak` testi | Sızıntı kapısı | Built bundle'da `1.5`/`×`/`çarpan`/`ünite`/`cf` müşteri-metni = 0 kilitlenir. |

---

## 3. FAZ 0 — Veri modeli + çekirdek servis (INERT, davranış değişmez)

**Files:**
- Create: `src/server/db/migrations/00XX_cf_unit_fraction.sql` (numara canlı max+1, `meta/_journal.json` `when` > mevcut max — ⚠️ atlanma tuzağı, deploy sonrası `information_schema.columns` ile DOĞRULA)
- Modify: `src/server/db/schema.ts` (userPackageEntitlements'a `cfUnitFraction`)
- Create: `src/server/services/cf-counter-service.ts`
- Test: `src/server/services/cf-counter-service.test.ts`

- [ ] **Adım 1: Migration (idempotent, INERT)**
```sql
-- 00XX_cf_unit_fraction.sql
ALTER TABLE user_package_entitlements
  ADD COLUMN IF NOT EXISTS cf_unit_fraction numeric(6,4) NOT NULL DEFAULT 0;
-- INERT: hiçbir kod okumadan önce sadece 0; mevcut paketlere etkisiz.
```

- [ ] **Adım 2: schema.ts kolonu**
```typescript
// userPackageEntitlements tablosuna (mevcut cf_* kolonlarının yanına):
cfUnitFraction: numeric("cf_unit_fraction", { precision: 6, scale: 4 }).notNull().default("0"),
```

- [ ] **Adım 3: FAILING test — whole-number accumulation saf fonksiyon**
```typescript
// cf-counter-service.test.ts
import { describe, expect, it } from "vitest";
import { computeSeatDecrement } from "./cf-counter-service.js";

describe("computeSeatDecrement (küsurat biriktir, tam-sayı düş)", () => {
  it("gpt-5.5 ilk istek: 1.5 birikir, 0 düşer", () => {
    expect(computeSeatDecrement(0, 1.5)).toEqual({ whole: 0, newFraction: 1.5 });
  });
  it("gpt-5.5 ikinci istek: 3.0 → 3 düşer, küsurat 0", () => {
    expect(computeSeatDecrement(1.5, 1.5)).toEqual({ whole: 3, newFraction: 0 });
  });
  it("gpt-5.4 (1.0): tam → her istek 1 düşer", () => {
    expect(computeSeatDecrement(0, 1.0)).toEqual({ whole: 1, newFraction: 0 });
  });
  it("karışık: 0.5 birikmiş + 1.5 = 2.0 → 2 düş", () => {
    expect(computeSeatDecrement(0.5, 1.5)).toEqual({ whole: 2, newFraction: 0 });
  });
  it("kayan-nokta güvenli: 0.1+0.2 toleransı", () => {
    const r = computeSeatDecrement(0.9, 1.5); // 2.4 → whole 2, frac 0.4
    expect(r.whole).toBe(2); expect(r.newFraction).toBeCloseTo(0.4, 4);
  });
});
```

- [ ] **Adım 4: Run → FAIL** (`npx vitest run src/server/services/cf-counter-service.test.ts` → "computeSeatDecrement is not defined")

- [ ] **Adım 5: Minimal implementation**
```typescript
// cf-counter-service.ts
/** Küsurat biriktir, yalnız TAM sayıyı düş. Saf, never-throw. Kayan-nokta için 4-hane yuvarla. */
export function computeSeatDecrement(prevFraction: number, multiplier: number): { whole: number; newFraction: number } {
  const frac = Math.round((Math.max(0, prevFraction) + Math.max(0, multiplier)) * 10000) / 10000;
  const whole = Math.floor(frac);
  const newFraction = Math.round((frac - whole) * 10000) / 10000;
  return { whole, newFraction };
}
```

- [ ] **Adım 6: Run → PASS.** **Adım 7: Commit** `feat(cf): cf_unit_fraction kolonu + computeSeatDecrement (INERT)`

- [ ] **Adım 8: Atomik DB fonksiyonları (FAILING itest, gerçek Postgres)** — `applySeatDecrement(userId, modelId)` ve `reconcileToCf(userId, cfRemaining)`:
```typescript
// cf-counter-service.ts (devamı)
import { dbSql } from "../db/client.js";
import { cfModelUnitMultiplier } from "./cf-unit-multiplier.js";

/** Koltuk servisi: CF çağrılmadı → sayacı BİZ düş (müşteri-bazlı havuz, tam-sayı kuralı, atomik). */
export async function applySeatDecrement(userId: string, modelId: string): Promise<void> {
  const mult = cfModelUnitMultiplier(modelId);
  if (!(mult > 0)) return;
  // Tek UPDATE: fraction += mult; whole = floor(fraction); cf_remaining -= whole; fraction -= whole.
  await dbSql`
    UPDATE user_package_entitlements
    SET cf_remaining = GREATEST(0, COALESCE(cf_remaining, 0) - FLOOR(cf_unit_fraction + ${mult})::int),
        cf_unit_fraction = (cf_unit_fraction + ${mult}) - FLOOR(cf_unit_fraction + ${mult}),
        cf_remaining_at = now(), updated_at = now()
    WHERE cf_customer_id = ${userId} AND status = 'active' AND cf_units_ordered > 0
  `;
}

/** CF otoriter: CF konuştuğunda sayacı CF'nin gerçeğine HİZALA, küsurat biriktiricisini sıfırla. */
export async function reconcileToCf(userId: string, cfRemaining: number): Promise<void> {
  if (!Number.isFinite(cfRemaining)) return;
  await dbSql`
    UPDATE user_package_entitlements
    SET cf_remaining = ${Math.floor(cfRemaining)}, cf_unit_fraction = 0,
        cf_remaining_at = now(), updated_at = now()
    WHERE cf_customer_id = ${userId} AND status = 'active' AND cf_units_ordered > 0
  `;
}
```
Test (itest): taze entitlement seed → applySeatDecrement(gpt-5.5)×2 → cf_remaining −3, fraction 0; reconcileToCf(100) → cf_remaining 100, fraction 0. **PASS → Commit.**

> Faz 0 sonu: kolon + servis var ama **hiçbir call-site çağırmıyor** → canlı davranış AYNI. Güvenli deploy (inert).

---

## 4. FAZ 1 — Yaz-yolu: settleBilling tek-sayaca bağlanır

**Files:** Modify `src/server/routes/proxy.ts` (`settleBilling` `:263-326`; CF-servis tespiti); Modify `src/server/services/entitlement-service.ts` (`updateCfRemaining`→`reconcileToCf` sarımı). Test: `proxy` itest + `entitlement-service` itest.

**Mevcut (proxy.ts:286-296):**
```typescript
if (opts.entitlementId && opts.usage.cfRemaining != null) {
  await updateCfRemaining(opts.userId, opts.usage.cfRemaining, opts.status === "success" ? "success" : "error");
}
if (opts.entitlementId) void topUpCfIfNeeded(opts.entitlementId).catch(() => {});
```

**Hedef:**
```typescript
if (opts.entitlementId) {
  if (opts.usage.cfRemaining != null) {
    // CF servis etti → CF otoriter, hizala (küsurat sıfırla)
    await reconcileToCf(opts.userId, opts.usage.cfRemaining);
  } else if (opts.status === "success") {
    // Koltuk servisi (CF header yok) → sayacı biz düş (tam-sayı kuralı)
    await applySeatDecrement(opts.userId, opts.model.id);
  }
  void topUpCfIfNeeded(opts.entitlementId).catch(() => {});
}
```

- [ ] **Adım 1 (FAILING itest):** koltuk-servisli başarılı gpt-5.5 isteği (usage.cfRemaining=null) → settleBilling → cf_remaining −0 (ilk), ikinci istek −3 (toplam −3, fraction 0). CF-servisli istek (cfRemaining=150) → cf_remaining=150, fraction=0.
- [ ] **Adım 2:** Run → FAIL (mevcut kod koltukta hiç düşmüyor).
- [ ] **Adım 3:** Yukarıdaki hedef kodu uygula; `reconcileToCf`/`applySeatDecrement` import. `updateCfRemaining`'i `reconcileToCf` cinsinden yeniden yaz (geriye-uyum: success path = reconcile; error path = 2sn-guard'lı reconcile, fraction'a dokunma).
- [ ] **Adım 4:** Run → PASS. **Adım 5:** Tüm `usage.cfRemaining` set noktalarının (proxy.ts:597,897,1260 success; 620,976,1304 error) doğru `null` vs değer taşıdığını doğrula (koltuk = null, CF = sayı). **Adım 6:** Commit.

⚠️ **Kritik doğrulama:** koltuk servisinde `usage.cfRemaining` GERÇEKTEN null mı? `forwardWithFailover` koltuğa düşünce upstream header dönmez → null beklenir. itest + canlı kontrollü tek istekle teyit (provider_profile_id NULL işareti). Yanlışsa: koltuk tespiti `chain.primary.profileId === 'rika'`/seat profili üzerinden açıkça yapılır.

---

## 5. FAZ 2 — Oku-yolu: gösterim her yerde cf_remaining

**Files:** Modify `entitlement-service.ts` (`computeDisplayConsumed`, `listUserPackagesForPanel:572-696`, `listUserEntitlements:489-533`). Test: `compute-display-consumed.test.ts` + panel itest.

**Hedef:** CF paketinde (cfLazy) gösterilen **`kalan = cf_remaining`** (tek kaynak), `kullanilan = daily_limit_snapshot − cf_remaining`. `max(cfConsumedMirror, used_success)` mantığı KALDIRILIR (artık cf_remaining koltukta donmadığı için doğru).

- [ ] **Adım 1 (test güncelle):** `compute-display-consumed.test.ts` — CF dalı artık `cf_remaining` döndürmeli: `kalan(limit=500, cfRemaining=321) === 321`. Devreden + non-CF dalları DEĞİŞMEZ (requests_today).
- [ ] **Adım 2:** Run → FAIL.
- [ ] **Adım 3:** `listUserPackagesForPanel` cfLazy dalı (`:687-703`):
```typescript
if (cfLazy) {
  const rem = cfRem == null ? limit : Math.max(0, Math.min(limit, cfRem));
  kalan = rem;
  cfExhausted = cfRem != null && cfRem <= 0;
  if (cfExhausted) kalan = 0; else kalan = Math.max(1, rem); // aktifken boş-bar çelişkisi yok
}
// kullanilan = limit - kalan (aynen)
```
`listUserEntitlements` ve admin `admin.ts:813` aynı tek-kaynağa hizalanır.
- [ ] **Adım 4:** Run → PASS. **Adım 5:** Frontend `tab-mypackages.jsx` `p.kalan`/`p.gunlukLimit`'i zaten render ediyor (`:217,295`) → değişiklik gerekmez; **çelişen ikinci sayı yoksa** doğrula. **Adım 6:** Commit.

> ⚠️ Bu faz, **bugün öğleden sonra yaptığım `used_success` 1=1 panel değişikliğini SÜPERSEDE eder** — panel artık CF-gerçeği `cf_remaining`'i (tam-sayı, koltukta da hareket eden) gösterir, ham istek sayısını değil. Ufuk'un son tasarımı bu (her yerde tek = CF kalan).

---

## 6. FAZ 3 — Kapı + Fren tek-kaynağa sadeleşir

**Files:** Modify `cf-overserve-cap.ts` (`shouldCapOverServe`), `proxy.ts` (4 cap call-site), `entitlement-service.ts` (gate clause sadeleştirme — §8 KARAR'a bağlı).

- [ ] **Adım 1 (test):** `shouldCapOverServe` artık `cf_remaining ≤ 0` ise true (capMult/cf_served'a gerek yok). Mevcut `cf-overserve-cap.test.ts` güncellenir.
- [ ] **Adım 2:** Run → FAIL.
- [ ] **Adım 3:**
```typescript
export function shouldCapOverServe(p: { cfRemaining: number | null | undefined; cfUnitsOrdered: number }): boolean {
  if (!(p.cfUnitsOrdered > 0)) return false;          // CF-dışı paket
  return p.cfRemaining != null && p.cfRemaining <= 0; // tek sayaç bitti → kap
}
```
proxy.ts 4 call-site (`:764,451,1151`) yeni imzaya geçer; `cf_served`/`capMult` argümanları kaldırılır. `cf-served-refresh-job` + `cf_served` kolonu **emekli** (silinmez, INERT bırakılır → ayrı temizlik fazı).
- [ ] **Adım 4:** Run → PASS. **Adım 5:** Gate clause sadeleştirmesi **§8 KARAR sonrası**. **Adım 6:** Commit.

---

## 7. FAZ 4 — Müşteriye çarpan-metni sıfır (kural 6 enforcement)

**Files:** `scripts/scan-public-bundle.mjs` (genişlet), yeni `src/cf-multiplier-noleak-contract.test.ts`, admin-only metinler dokunulmaz.

- [ ] **Adım 1 (FAILING contract test):** built bundle (`dist/assets/index-*.js`) + müşteri jsx/i18n'de şu kalıplar = 0: `1.5×`, `×1.5`, `çarpan`, `multiplier`, `ünite`, ` cf `, `CodeFast` (admin-only dosyalar hariç). (Tarama bugün TEMİZ çıktı — test bunu KİLİTLER, regresyon önler.)
- [ ] **Adım 2:** Run → mevcut temizse PASS; kirliyse temizle. **Adım 3:** `npm run scan:public` listesine bu kalıpları ekle. **Adım 4:** Commit.

> Admin `admin.ts:807 requestsToCfUnits` "X istek = Y CF ünite" eşlemesi **KORUNUR** (ops aracı, müşteriye gitmez — API'de `cfLazy`/`cfRemaining` yalnız admin uçunda).

---

## 8. ⚠️ AÇIK MİMARİ KARAR — Ufuk onayı şart (planı kilitlemeden önce)

**Bugün canlıya çıkan `codex-api DAILY gate`** ile tek-sayaç çelişiyor:
- **Bugünkü model:** codex paketleri `requests_today < daily_limit` (günlük, 1/istek, gece reset), `cf_remaining`'den MUAF. Seat over-serve'i bu çözdü.
- **Tek-sayaç modeli:** codex de `cf_remaining` (CF-ünite, çarpanlı, koltukta biz-düş, reconcile) ile kapılanır; `requests_today` yalnız bilgi.

**Seçenekler:**
- **(A) Tam birleşme (önerilen):** codex dahil HER CF paketi tek `cf_remaining` sayacına geçer. `requests_today` codex gate'inden çıkar; `daily_limit_snapshot` = CF-ünite cap. Günlük reset isteniyorsa "günlük cap" ayrı bir devreden/rollover katmanıyla (zaten var) ifade edilir. **En temiz "tek sayı her yerde" — ama bugünkü gate'i geri sarar, dikkatli regresyon testi.**
- **(B) Hibrit:** codex = günlük `requests_today` (1/istek, çarpansız) kalır; diğer CF paketleri = `cf_remaining`. İki model sürer ama her biri kendi içinde tek-kaynak. **"Her yerde aynı sayı" codex için requests_today, diğerleri için cf_remaining = hâlâ iki dil.**
- **(C) codex'i CF-ünite cap + günlük reset:** `cf_remaining` günlük cap'e reset edilir (devreden mantığıyla). Karmaşık ama hem günlük hem tek-sayaç.

→ **Karar verilmeden Faz 2/3'ün gate kısmı kilitlenemez.** Öneri: **(A)** — Ufuk'un "tek sayaç, her yerde aynı, CF kaynak" emrine en sadık.

---

## 9. RİSKLER & ROLLBACK

- **Para riski:** Yaz-yolu (Faz 1) yanlışsa over/under-serve. Mitigasyon: her faz INERT-deploy edilebilir (kolon→servis→tek call-site behind flag `CF_UNIFIED_COUNTER_ENABLED`). Flag default false → davranış aynı; aç → tek-sayaç.
- **PAYG DOKUNULMAZ:** `billing-service.ts reserve/settle/charge` (token-bazlı) bu plana GİRMEZ — yalnız CF-paket yolu. Sınır net (agent F doğruladı).
- **Koltuk-tespit yanlışlığı:** `usage.cfRemaining==null` koltuk demek değilse sayaç yanlış düşer. Faz 1 itest + canlı tek-istek teyidi zorunlu.
- **Migration atlanma:** `meta/_journal.json when` > max; deploy sonrası `information_schema.columns` ile kolon DOĞRULA.
- **Rollback:** her faz ayrı commit + canlı yedek (`.deploy/`); flag false'a çek + eski dosyayı geri-rsync.
- **cf_served emekliliği:** kolon/job silinmez (ayrı temizlik), sadece okunmaz → geri alınabilir.

## 10. DEPLOY (her faz)
İzole targeted-rsync: canlıdan dosyayı indir (`scp yzapi-vps:/opt/turkapiprojesi/<f> /tmp/`), hunk uygula, `rsync -n --checksum --itemize` = yalnız hedef dosyalar; yedek (`.deploy/`); rsync; sunucu gate `lint && test && build && NODE_ENV=production db:migrate && systemctl restart turkapiprojesi && curl health`; 3-QA ≥2 PASS. **LOCAL_SRC=~/yzapi YASAK** (R-3/codex-daily canlı-lokal ayrışması). Manifest targeted-rsync'te güncellenmez → memory'e gerçek live state yaz.

---

## Self-Review (skill gereği)
- **Spec coverage:** TEK SAYAÇ(§1) ✓ · CF kaynak(§4) ✓ · tam-sayı düş(§3 Faz0) ✓ · her yerde aynı(§5) ✓ · koltuk istisnası(§4 Faz1) ✓ · fren tek-kaynak(§6) ✓ · çarpan görünmez(§7) ✓. **Açık:** codex-DAILY uzlaşması(§8) — Ufuk kararına bağlı.
- **Placeholder:** çekirdek mekanizmalar (computeSeatDecrement, applySeatDecrement, reconcileToCf, shouldCapOverServe) gerçek kodla; gate-clause exact kodu §8 kararından SONRA yazılacak (bilinçli — yanlış mimaride exact kod israf).
- **Tip tutarlılığı:** `cfModelUnitMultiplier`(mevcut) · `reconcileToCf(userId,number)`/`applySeatDecrement(userId,modelId)` tüm fazlarda tutarlı.

---

## 11. DOĞRULAMA DÜZELTMELERİ (Opus, 2026-06-25) — §3/§4/§6 KODU BUNLARLA GÜNCELLENİR

Plan canlı koda karşı adversarial doğrulandı. §3-4'ün ilk taslak kodu aşağıdaki **gerçek tasarım kusurlarını** taşıyordu; çekirdek mekanizma BÖYLE yazılacak:

### 11.1 ⛔ KÖK KUSUR: "CF'ye hizala (reconcileToCf = CF değerini yaz)" YANLIŞ — CF, koltuk tüketimini GÖRMEZ
CF `/usage` yalnız **CF'nin servis ettiğini** bilir. Koltuk (Codex seat) isteklerini CF hiç görmez → CF'nin `remaining`'i koltuk-paketleri için **bayat-YÜKSEK**. Naif `cf_remaining = floor(CF)` yazımı **bizim koltuk-düşümlerimizi geri alır** (sayaç yukarı sıçrar = over-serve). Bunu hem `reconcileToCf` hem 30sn `cf-mirror-sync-job`/`syncCfRemainingMirror` yapıyordu (race, HIGH bulgu).
**DÜZELTME — CF asla YÜKSELTEMEZ, yalnız DÜŞÜREBİLİR:** her CF-kaynaklı yazım `LEAST(mevcut, floor(CF))`:
```typescript
export async function reconcileToCf(userId: string, cfRemaining: number): Promise<void> {
  if (!Number.isFinite(cfRemaining)) return;
  await dbSql`
    UPDATE user_package_entitlements
    SET cf_remaining = LEAST(COALESCE(cf_remaining, ${Math.floor(cfRemaining)}), ${Math.floor(cfRemaining)}),
        cf_remaining_at = now(), updated_at = now()
    WHERE cf_customer_id = ${userId} AND status = 'active' AND cf_units_ordered > 0`;
}
```
Aynı `LEAST` kuralı `cf-ledger-service.ts:100-116 syncCfRemainingMirror` ve `cf-mirror-sync-job`'a uygulanır (CF düşüşü yakalar, koltuk-düşümünü EZMEZ). **İstisna — top-up:** `topUpCfIfNeeded` cf_remaining'i bilerek YÜKSELTİR (yeni ünite) → o ayrı path zaten `LEAST(...+batch, cap)` ile kendi raise'ini yapar; CF-sync raise yapmaz. Top-up sonrası ilk CF-sync `LEAST` ile yeni yüksek değeri düşürmez çünkü top-up zaten cf_remaining'i artırmıştır ve CF /usage de artmış remaining döner → `LEAST(yüksek, yüksek)` korunur.

### 11.2 ⛔ KÜSURAT MODELİ SADELEŞTİ: ayrı `cf_unit_fraction` kolonu YERİNE `cf_remaining`'i ONDALIK tut
İlk taslak `cf_remaining int + cf_unit_fraction numeric` idi → reconcile'de küsurat sıfırlanınca **0.5/0.7 kayboluyordu** (HIGH bulgu) + iki-kolon atomikliği zor.
**DÜZELTME:** `cf_remaining`'i `numeric(14,4)` yap (CF'nin gerçeği zaten ondalık: `cf_usage_ledger.remaining numeric(14,4)`). Ayrı biriktirici kolon GEREKMEZ — küsurat `cf_remaining`'in ondalık kısmıdır.
- **Koltuk düşümü:** `cf_remaining = GREATEST(0, cf_remaining - ${mult})` (1.5 doğrudan ondalıktan).
- **Gösterim (tam-sayı kuralı):** `kalan = FLOOR(cf_remaining)` → müşteri hep tam sayı görür, hareket tam-sayı adımlı (150.7→149.2 → floor 150→149; sonra 147.7 → 147 = −2). **Kullanıcının "2 gpt-5.5 = 3 düş" kuralı otomatik sağlanır.**
- **Migration:** `ALTER COLUMN cf_remaining TYPE numeric(14,4)` (int→numeric güvenli, veri korunur). `cf_unit_fraction` kolonu **iptal** (§3 Adım 1-2 buna göre güncellenir). `computeSeatDecrement` saf fonksiyonu yine yararlı (test edilebilir ondalık çıkarma) ama tek-kolon.

### 11.3 ⛔ IDEMPOTENCY (CRITICAL): `applySeatDecrement` çift-düşebilir
settleBilling aynı `request_id` için iki kez koşarsa (stream retry / hata-sonra-başarı) sayaç **iki kez** düşer = haksız tüketim.
**DÜZELTME:** düşümü `usage_records` idempotent insert'ine BAĞLA. `recordPackageUsage` (`onConflictDoNothing`, `request_id` UNIQUE) **yeni satır eklediyse** (RETURNING ile satır döndü) düş; çakışma (zaten var) ise düşme. Tek transaction:
```typescript
// proxy.ts settleBilling, koltuk başarılı dalı:
const inserted = await recordPackageUsageReturning({...});   // RETURNING id; çakışmada boş
if (inserted && opts.usage.cfRemaining == null) {            // yeni kayıt + koltuk servisi
  await applySeatDecrement(opts.userId, opts.model.id);      // yalnız ilk kez
}
```
`recordPackageUsage` `onConflictDoNothing().returning({id})` döndürecek şekilde güncellenir.

### 11.4 ATOMİKLİK & RACE
- `applySeatDecrement` tek-UPDATE'tir (read-modify-write yok) → `GREATEST(0, cf_remaining - ${mult})` Postgres satır-kilidiyle eşzamanlı isteklerde atomik. Ek lock gerekmez.
- `reconcileToCf` vs `applySeatDecrement` sırası: ikisi de tek-UPDATE + `LEAST`/`GREATEST` → komütatif değil ama **monoton düşüş** garantisi (CF raise edemez, seat düşürür) → nihai değer sıra-bağımsız güvenli (en düşük doğru kalan). Deadlock yok (tek satır-grubu, transaction yok).
- **Under-serve guard:** `cf_remaining` 0'a inip CF'de hâlâ pozitifse (seat hızlı tüketti, CF henüz görmedi) müşteri bloke olur — bu **doğru** (ödenen CF+seat bütçesi bitti). Ama codex (seat-primary) pakette CF bütçesi bittiğinde seat BEDAVA devam etmeli → §11.5.

### 11.5 ⛔ codex-DAILY GERÇEĞİ: canlı zaten de-facto (B) HİBRİT — §8 kararı netleşti
Doğrulama: bugünkü canlı codex gate (`cf_api_slug='codex-api'` → `requests_today < daily_limit`, cf_remaining'den MUAF) = **fiilen (B) Hibrit.** Codex paketleri seat-primary; CF yalnız prepaid drain (CF_FIRST). **Tek-sayaç codex'e UYGULANIRSA:** codex'in "kalan"ı CF-ünite değil **günlük istek** (requests_today, 1/istek, çarpansız) olmalı — çünkü seat bedava ve CF bütçesi bitince durmamalı. Yani:
- **codex-api paketleri:** tek sayaç = `daily_limit_snapshot − requests_today` (günlük, çarpansız, seat-aware zaten). cf_remaining bu pakette gate DEĞİL (drain göstergesi). Gösterim de bunu gösterir.
- **diğer CF paketleri (gerçek CF-servis):** tek sayaç = `FLOOR(cf_remaining)` (CF-ünite, çarpanlı, §11.1-11.2).
→ "Her yerde aynı sayı" KURALI korunur ama **paket tipine göre tek-kaynak** (codex=requests_today, diğer=cf_remaining); ÖNEMLİSİ: her paketin TEK sayacı var ve gösterim+gate+fren O TEK sayacı okur. **§8 KARARI = (B) Hibrit, NET.** (A tam-birleşme codex'i kırar: seat bedava servisi CF-ünite tükenince yanlışça durdurur.)

### 11.6 EXTEND & admin tutarlılığı
- `grantPackageEntitlement` EXTEND'de `cf_remaining=NULL` reset zaten var; ondalık modelde de NULL→ilk CF temasında seed. `cf_served=0` reset korunur (fren artık cf_remaining okusa da cf_served emekliye INERT).
- `adminUpdateEntitlement` CF "remaining" elle-düzenleme 400 reddi KORUNUR (ayna bütünlüğü).

### 11.7 DOĞRULAMA KARARI
**KARAR: DÜZELTME GEREKLİ → §11 ile GÜNCELLENDİ → artık HAZIR (uygulama onayına).** Kritik 3 kusur (CF-raise/seat-ezme, küsurat-kaybı, idempotency) ve mimari karar (codex=B hibrit) çözüldü. Kalan: implementasyon sırasında §11.3 idempotent insert + §11.1 LEAST'in top-up ile etkileşimini itest ile kanıtla.

> ⚠️ Yanlış-alarm notu: ilk doğrulama filosu (zayıf model) "cf-counter-service.ts yok / migration yok / flag yok" diye 6 "kritik" üretti — bunlar **beklenen** (bu bir PLAN, henüz yazılmadı), gerçek kusur değil. Gerçek kusurlar §11.1-11.5'tir.

---

## 12. OPUS DOĞRULAMA v2 (§11 sonrası) — SON DÜZELTMELER (codex-hibrit'i HER katmana tutarlı geç)

Opus filosu §11'li GÜNCEL planı yeniden sınadı: 2 kritik + 11 yüksek, hepsi GERÇEK. **Tek kök tema:** §11.5 codex=(B)hibrit kararı `cf_api_slug='codex-api'` ayrımını **gösterim + düşüm + fren** katmanlarına tutarlı geçirmeyi gerektirir; §11 bunu yalnız gate'te bıraktı. Codex paketi de `cf_units_ordered>0` olduğu için tüm CF-dalları onu yanlışça kapsıyor.

**TEK İLKE (her CF-dalına uygulanır — gate'in mevcut `cf_api_slug='codex-api'` carve-out'uyla BİREBİR):**
> **codex-api paketi** (seat-primary, DAILY): tek sayaç = `daily_limit_snapshot − requests_today` (günlük, çarpansız). `cf_remaining` codex'te yalnızca CF_FIRST drain göstergesi, gate/gösterim/fren DEĞİL.
> **diğer CF paketi** (gerçek CF-servis, lifetime): tek sayaç = `FLOOR(cf_remaining)` (ondalık, §11.2).

### 12.1 GÖSTERİM (§5'i SOMUTLAŞTIR — ⛔ 2 KRİTİK)
`listUserPackagesForPanel` + `listUserEntitlements` + `admin.ts` SELECT'lerine **`cf_api_slug` ekle** ve CF-dalını ÜÇE böl:
```typescript
if (isDevreden) { ... }                                   // mevcut devreden dalı (değişmez)
else if (cfApiSlug === 'codex-api') {                     // YENİ: codex = günlük (gate ile birebir)
  const used = (lastReset < today) ? 0 : requestsToday;
  kullanilan = used; kalan = Math.max(0, limit - used);
  durum = kalan <= 0 ? 'gunluk_doldu' : 'aktif';
} else if (cfLazy) {                                       // gerçek CF = ondalık (§11.2)
  kalan = cfRem == null ? limit : Math.max(0, Math.floor(cfRem));
  cfExhausted = cfRem != null && cfRem <= 0;
}
```
Aksi halde codex müşterisi panelde gate'le tutmayan "kalan" görür (CF_FIRST drain bitip cf_remaining=0 olunca panel "Bitti" der ama koltuk hâlâ servis ediyordur).

### 12.2 DÜŞÜM (§4 — ⛔ HIGH): applySeatDecrement codex'te ÇAĞRILMAZ
Codex seat isteğinde cf_remaining'i düşürmek (a) gate'i etkilemez, (b) CF_FIRST drain'de prepaid CF ünitesini çift-tüketir. §4 hedef kodu guard'lanır:
```typescript
// settleBilling, koltuk başarılı dalı (idempotent insert sonrası):
if (insertedNewRow && opts.usage.cfRemaining == null && pkgSlot.cfApiSlug !== 'codex-api') {
  await applySeatDecrement(opts.userId, opts.model.id);   // YALNIZ non-codex CF seat
}
// codex seat: sayaç zaten tryReservePackageSlot'ta requests_today++; ek iş YOK.
```

### 12.3 FREN (§6 — ⛔ HIGH): paket tipine göre dallan
`shouldCapOverServe` gate gibi dallanır: codex → `requests_today >= daily_limit_snapshot` (zaten gate yapıyor, ayrı frene gerek yok); non-codex CF → `cf_remaining <= 0`. §6'nın tek-formül `cf_remaining<=0` iddiası codex'i yanlışça durdururdu.

### 12.4 LEAST'i TÜM CF-yazıcılara uygula (§11.1 genişlet — HIGH×3)
§11.1 yalnız reconcileToCf'i düzeltti; ama cf_remaining'i yazan DİĞER yollar hâlâ koşulsuz EZER:
- **`updateCfRemaining` SUCCESS path** (`entitlement-service.ts:282`): `cf_remaining = LEAST(COALESCE(cf_remaining,${floored}), ${floored})`. ⚠️ ERROR path'in bbbnull kilit-fix guard'larını (2sn freshness + `floored>=COALESCE`) KORU → `reconcileToCf(userId, val, source)` imzasına `source:'success'|'error'` ekle, error'da eski guard + LEAST.
- **`syncCfRemainingMirror`** (`cf-ledger-service.ts:105-112`): koşulsuz `trunc` → `LEAST(COALESCE(cf_remaining,${trunc}), ${trunc})`. ⚠️ Ama `remaining<=0 → return` erken-çıkışı, mirror'ı 0'a indirmeyi engelliyor → §6 freni (cf_remaining≤0) bu yoldan ulaşılamaz. Düzelt: `remaining<=0` ise `cf_remaining = LEAST(cf_remaining, 0)` yaz (erken-return yerine).
- **`cf-mirror-sync-job`** aynı `syncCfRemainingMirror`'ı çağırır → otomatik kapsanır.
- **top-up istisnası:** `topUpCfIfNeeded` bilerek yükseltir (kendi LEAST(...+batch,cap)'iyle) → CF-sync raise yapmadığı için top-up sonrası değer korunur.

### 12.5 IDEMPOTENCY: insert+düşüm TEK transaction (§11.3 sertleştir — HIGH×2)
`recordPackageUsage` + `applySeatDecrement` İKİ ayrı statement → arada crash/retry çift-düşürebilir; error-sonra-retry-success da kapsanmıyor.
```typescript
await dbSql.begin(async (tx) => {
  const ins = await tx`INSERT INTO usage_records (...) VALUES (...) ON CONFLICT (request_id) DO NOTHING RETURNING id`;
  if (ins.length > 0 && cfRemainingNull && cfApiSlug !== 'codex-api') {
    await tx`UPDATE user_package_entitlements SET cf_remaining = GREATEST(0, cf_remaining - ${mult}) ... WHERE cf_customer_id = ${userId} ...`;
  }
});
```
Tek tx + `request_id` UNIQUE → aynı istek (success/error/retry hangisi önce gelirse) yalnız BİR kez düşer.

### 12.6 FLAG-GATING (§9 somutlaştır — HIGH×2)
Her YENİ call-site açıkça `if (env.CF_UNIFIED_COUNTER_ENABLED) { yeni } else { eski updateCfRemaining }` ile sarılır: settleBilling seat-decrement, reconcileToCf success-LEAST, §6 fren, §12.1 gösterim dalları. **Etkinleştirme TEK deploy'da:** ondalık-migration (INERT, ayrı önce) → sonra `numeric + seat-decrement + LEAST-writers + fren-cf_remaining + gösterim-split` HEPSİ tek flag arkasında AYNI deploy (yarım-faz over-serve penceresini kapatır). Eski `updateCfRemaining Math.floor` ondalık kolona yazsa da `floor` numeric'e güvenli (sadece küsurat kaybı, kilitlenmez) → migration-önce/kod-sonra penceresi güvenli.

### 12.7 OPUS KARARI
**KARAR: SON-DÜZELTMELER GEREKLİ → §12 ile uygulandı → artık HAZIR (uygulama onayına).** Kök tema (codex-hibrit'i her katmana geçir) + LEAST-tüm-yazıcılar + tek-tx idempotency + flag-gating çözüldü. Uygulama sırasında itest ile KANITLANACAK 3 nokta: (1) codex seat isteği → cf_remaining DEĞİŞMEZ + requests_today++ + panel `daily_limit−requests_today` gösterir; (2) non-codex CF seat → cf_remaining tam-sayı düşer, mirror-sync EZMEZ (LEAST); (3) aynı request_id 2× settle → tek düşüm.
