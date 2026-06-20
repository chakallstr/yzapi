# yzapi Shopier — Başarı Bildirimi + Kartla-Paket-Direkt Satış — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** yzapi'nin halihazırda exactly-once çalışan Shopier otomatik kredilendirmesine (a) her başarılı ödemede admin WhatsApp bildirimi eklemek ve (b) opsiyonel olarak kartla doğrudan PAKET satın almayı (bakiye yükleyip sonra paket alma iki-adımını tek adıma) sağlamak.

**Architecture:** yzapi'de kredilendirme tek nokta (`creditUserBalance`, DB-UNIQUE ile exactly-once) — buna dokunmuyoruz. B1: Shopier callback + OSB başarı sitelerine var olan `notifyAdmin({kind:"odeme_yapildi"})`'yi ekliyoruz (tek satır × 2). B2 (opsiyonel): OSB productId→paket eşlemesinde `creditUserBalance` yerine `grantPackageEntitlement` çağırıyoruz; referans SesLab `startShopierOrder({package_id})`.

**Tech Stack:** Node v22 (VPS) / v25 (lokal), Express benzeri router, self-hosted Postgres + Drizzle, Shopier (callback/OSB HMAC), openwa direct-send (`notifyAdmin`).

> ⚠️ Para-yolu. Kurallar: **billing-service'e DOKUNMA** (her ödeme özelliği yan-helper'larla yapıldı); 3-ajan QA (≥2 PASS) + **çift onay** + **izole-worktree deploy** (live commit'ten branch, migration LIVE sıraya göre yeniden numaralandırılır, `LOCAL_SRC`+`SSH_HOST` açıkça verilir — bkz CLAUDE.md yzapi deploy-isolation tuzağı). Bu plan tamamlanınca sadece tasarım hazırdır.

---

## File Structure

| Dosya | Sorumluluk | İşlem |
|------|-----------|------|
| `src/server/routes/payments.ts` | Shopier callback (~L363-381) + OSB (~L538-548) başarı sitelerine bildirim; (B2) OSB→paket dalı | Modify |
| `src/server/services/admin-notify-service.ts` | `notifyAdmin` / `odeme_yapildi` — zaten var, dokunma (sadece teyit) | Read-only |
| `src/server/services/package-purchase-service.ts` | `grantPackageEntitlement` — B2'de OSB'den çağrılır | Read-only/Modify |
| `src/payment-safety-contract.test.ts` | Başarı-bildirimi + paket-grant idempotency sözleşmesi | Modify |

---

## Faz 0 — Salt-okunur TEŞHİS (kanıt, kod yok)

> ssh YAPMA (fail2ban). Lokal repo + (gerekirse) yzapi-vps manifest'i CLAUDE.md'deki tek-satır desenle okunabilir ama bu fazda lokal repo yeterli.

- [ ] **Adım 0.1: Başarı sitelerini doğrula**

`src/server/routes/payments.ts` içinde Shopier callback başarı dalı (`creditUserBalance(...,"shopier",...)`, ajan ~L364/379) ve OSB başarı dalı (~L538-548) gerçekten `notifyAdmin` ÇAĞIRMIYOR mu — teyit et. Hata/deneme dallarında (`odeme_sorunu`/`odeme_denemesi`) var, başarıda yok bekleniyor.

- [ ] **Adım 0.2: `notifyAdmin` kind sözlüğünü doğrula**

`admin-notify-service.ts`'te `odeme_yapildi` (✅) kind'ı zaten tanımlı mı (IBAN confirm'de kullanılıyor). Evetse B1 sadece çağrı eklemek.

- [ ] **Adım 0.3: Paket grant yolunu doğrula (B2 için)**

`grantPackageEntitlement` imzası ve idempotency'si (`Idempotency-Key` / UNIQUE) — `package-purchase-service.ts`. OSB product map yapısı (`getOsbProductMap`, `SHOPIER_OSB_PRODUCT_MAP` productId→{priceTL,creditTL}).

- [ ] **Adım 0.4: Canlı env durumu (opsiyonel, manifest)**

`SHOPIER_API_KEY/SECRET`, `SHOPIER_OSB_*` `.env.production`'da set mi (config eksiği B1/B2'yi etkilemez ama Shopier'in canlı aktif olduğunu doğrular). Sadece okuma.

---

## Faz B1 — Başarılı ödemede admin WhatsApp bildirimi (düşük risk)

### Task B1.1: Shopier callback başarı bildirimi

**Files:**
- Modify: `src/server/routes/payments.ts` (callback başarı dalı, Adım 0.1'de bulunan satır)

- [ ] **Step 1: Sözleşme testi yaz (kırmızı)**

`src/payment-safety-contract.test.ts`'e: Shopier callback başarılı kredilendirme → `notifyAdmin` `kind:"odeme_yapildi"` ile bir kez çağrıldı (mock). `alreadyCredited:true` (replay) dönen durumda bildirim **atılmaz**.

```ts
it("shopier callback success fires odeme_yapildi once, not on replay", async () => {
  const spy = vi.spyOn(adminNotify, "notifyAdmin");
  await handleShopierCallbackBody(validPaidBody);
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ kind: "odeme_yapildi" }));
  spy.mockClear();
  await handleShopierCallbackBody(validPaidBody);            // replay
  expect(spy).not.toHaveBeenCalled();                         // alreadyCredited → no notify
});
```

- [ ] **Step 2: Çalıştır → fail**

Run: `npm test -- payment-safety-contract` → Expected: FAIL (notify çağrılmıyor).

- [ ] **Step 3: Minimal implementasyon**

`creditUserBalance` sonucundan sonra, sadece `!result.alreadyCredited` ise (fire-and-forget, never-throw):

```ts
if (result.success && !result.alreadyCredited) {
  notifyAdmin({
    kind: "odeme_yapildi",
    title: "Ödeme onaylandı (Shopier kart)",
    body: `Kullanıcı ${userId} · ${miktarTL} TL · ref ${paymentId}`,
  }).catch(() => {});
}
```

- [ ] **Step 4: Çalıştır → geç**

Run: `npm test -- payment-safety-contract` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/payments.ts src/payment-safety-contract.test.ts
git commit -m "feat(payments): notify admin on successful shopier callback credit"
```

### Task B1.2: Shopier OSB başarı bildirimi

**Files:**
- Modify: `src/server/routes/payments.ts` (OSB başarı dalı ~L538-548)

- [ ] **Step 1: Test yaz (kırmızı)** — OSB auto-credit başarısı → `odeme_yapildi` bir kez; `onConflictDoNothing` (zaten kredili) → bildirim yok.

- [ ] **Step 2: Çalıştır → fail.** Run: `npm test -- payment-safety-contract`.

- [ ] **Step 3: Implementasyon** — B1.1 ile aynı desen, OSB başarı sitesine (`osb_<orderid>` idempotency key'i conflict etmediyse):

```ts
if (credited && !alreadyCredited) {
  notifyAdmin({ kind: "odeme_yapildi", title: "Ödeme onaylandı (Shopier OSB)",
               body: `Kullanıcı ${userId} · ${miktarTL} TL · OSB ${orderid}` }).catch(() => {});
}
```

- [ ] **Step 4: Çalıştır → geç.**

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/payments.ts src/payment-safety-contract.test.ts
git commit -m "feat(payments): notify admin on successful shopier OSB auto-credit"
```

> NOT: Eşleşmeyen OSB zaten `shopier_osb_dead_letters` + `odeme_sorunu` alarmı veriyor (mevcut). B1 yalnız başarı tarafındaki boşluğu kapatır.

---

## Faz B2 — Kartla doğrudan PAKET satın alma (opsiyonel, orta iş)

> Bugün Shopier yalnız **TL bakiye** yüklüyor; paket = bakiyeden debit (iki adım). Bu faz, OSB productId'sini bir PAKETE eşleyip kredilendirme yerine entitlement grant eder. SesLab `startShopierOrder({package_id})` referans desen.

### Task B2.1: OSB product map'i paket-aware yap

**Files:**
- Modify: `src/server/services/shopier-service.ts` (`getOsbProductMap` map değeri), `src/server/routes/payments.ts` (OSB handler dalı)

- [ ] **Step 1: Map şemasını genişlet (test-first)**

`SHOPIER_OSB_PRODUCT_MAP` değeri `{ priceTL, creditTL }` yanında opsiyonel `{ packageId }` taşısın. Test: `packageId` olan productId için OSB handler `grantPackageEntitlement(userId, packageId, idemKey)` çağırır, `creditUserBalance` ÇAĞIRMAZ; `packageId` yoksa eski davranış (bakiye).

- [ ] **Step 2: Çalıştır → fail.**

- [ ] **Step 3: Implementasyon**

```ts
const mapped = osbMap[productId];
if (mapped?.packageId) {
  const r = await grantPackageEntitlement(userId, mapped.packageId, `osb_${orderid}`); // idempotent
  if (r.granted && !r.already) notifyAdmin({ kind: "odeme_yapildi",
    title: "Paket satın alındı (Shopier OSB)", body: `Kullanıcı ${userId} · paket ${mapped.packageId}` }).catch(()=>{});
} else {
  /* mevcut creditUserBalance bakiye yolu */
}
```

- [ ] **Step 4: Çalıştır → geç.**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/shopier-service.ts src/server/routes/payments.ts src/payment-safety-contract.test.ts
git commit -m "feat(payments): shopier OSB productId can grant a package (not just balance)"
```

### Task B2.2: `satista` ve eşleşmeme güvenliği

**Files:**
- Modify: `src/server/routes/payments.ts` (B2 dalı)

- [ ] **Step 1: Test** — kapalı (`satista=false`) pakete OSB ödemesi gelirse: entitlement VERİLMEZ, dead-letter + `odeme_sorunu` alarmı (para alındı, paket verilmedi → insan). Bilinmeyen productId → mevcut dead-letter yolu.
- [ ] **Step 2: Çalıştır → fail.**
- [ ] **Step 3: Implementasyon** — grant öncesi paket `satista`/aktif kontrolü; değilse `recordOsbDeadLetter` + `notifyAdmin({kind:"odeme_sorunu"})`.
- [ ] **Step 4: Çalıştır → geç.**
- [ ] **Step 5: Commit**

```bash
git add src/server/routes/payments.ts src/payment-safety-contract.test.ts
git commit -m "feat(payments): guard package-grant OSB against inactive/unknown packages"
```

---

## Faz QA + Deploy (uygulama onayından SONRA)

- [ ] **3-ajan QA, ≥2 PASS** lokal diff üzerinden (ssh YOK): doğruluk/idempotency, regresyon+para-güvenliği+sızıntı, müşteri/UX.
- [ ] Tüm suite yeşil: `npm test` (özellikle `payment-safety-contract`), build, lint.
- [ ] **İzole-worktree deploy** (CLAUDE.md tuzağı): canlı commit'i manifest'ten al (`/opt/turkapiprojesi/.deploy/current-release.json` → `local_commit`), `git worktree add --detach`, fix commit'lerini cherry-pick, `rsync -rlzn --checksum --itemize-changes` ile izolasyon kanıtla (yalnız bu dosyalar), ruflo MCP artifact'ları + node_modules symlink'i sil, `LOCAL_SRC=<worktree> SSH_HOST=yzapi-vps bash scripts/sync-deploy.sh`.
- [ ] B2 migration gerekiyorsa LIVE sıraya göre numaralandır (`meta/_journal.json` idx dahil).
- [ ] **Çift onay.** Deploy sonrası küçük gerçek ödeme ile bildirim + (B2) paket-grant doğrula.

---

## Self-Review

- Başarıda bildirim yok → B1.1 (callback) + B1.2 (OSB) ✅
- Replay'de yanlış bildirim → `!alreadyCredited` guard ✅
- Kartla paket-direkt → B2.1 (map paket-aware) ✅
- Kapalı/bilinmeyen pakete ödeme → B2.2 (guard + dead-letter + alarm) ✅
- billing-service dokunulmadı; `creditUserBalance` exactly-once korunur ✅
- Deploy izolasyon tuzağı → QA fazında açık adım ✅
