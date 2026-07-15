# CF Canlı-Eşitleyici — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CF kalan-ünite aynasını CF gerçeğiyle ~30sn'de (3dk yerine) eşitlemek ve top-up'ı over-report'ta körleşmekten kurtarmak; böylece "hak var ama 403" mağduriyetini bitirmek.

**Architecture:** Mevcut `syncCfRemainingMirror` + `cfUsage` + `topUpCfIfNeeded` yeniden kullanılır. YENİ hafif `cf-mirror-sync-job` (~30sn, yalnız mirror + proaktif top-up, ledger upsert YOK; mevcut 3dk `cf-ledger-job` durable ledger için kalır). `topUpCfIfNeeded`'a opsiyonel `poolRemainingOverride` eklenir (CF-gerçeğiyle çağırıldığında ayna-körlüğü atlanır). Hepsi flag'li, default INERT.

**Tech Stack:** Node v22 ESM, TypeScript, node-cron, postgres (`dbSql` tagged-template), vitest. Canlı: `/opt/turkapiprojesi` (Node 22), deploy = izole targeted rsync + elle gate.

**Önemli kısıt:** Lokal `~/yzapi` CANLININ GERİSİNDE. Her görevde ÖNCE hedef dosyanın CANLI kopyasını indir (`scp yzapi-vps:/opt/turkapiprojesi/src/server/<f> /tmp/live/`), düzenlemeyi onun üstüne yap. Para-yolu; 3-QA ≥2 PASS + çift onay olmadan deploy YOK.

---

## Task 1: Env flags (config)

**Files:**
- Modify: `src/server/lib/env.ts` (env şeması — CANLI kopyadan oku, mevcut `CF_LEDGER_POLL_CRON` desenini izle)
- Test: `src/server/lib/env.test.ts` (varsa; yoksa Task 2 testleri kapsar)

- [ ] **Step 1: Canlı env.ts'i indir ve CF_LEDGER_POLL_CRON tanımını bul**

Run: `scp yzapi-vps:/opt/turkapiprojesi/src/server/lib/env.ts /tmp/live/env.ts && grep -n "CF_LEDGER_POLL_CRON\|CODEFAST_RESELLER_API_KEY" /tmp/live/env.ts`
Expected: env nesnesinde bu anahtarların okunduğu satırlar.

- [ ] **Step 2: Yeni flag'leri aynı desenle ekle**

`CF_LEDGER_POLL_CRON` ile aynı stilde (env okuma + default):
```ts
CF_MIRROR_SYNC_ENABLED: (process.env.CF_MIRROR_SYNC_ENABLED ?? "false") === "true",
CF_MIRROR_SYNC_CRON: process.env.CF_MIRROR_SYNC_CRON ?? "*/30 * * * * *", // 6-alan: her 30sn
CF_MIRROR_SYNC_DRY_RUN: (process.env.CF_MIRROR_SYNC_DRY_RUN ?? "false") === "true",
CF_PROACTIVE_TOPUP_ENABLED: (process.env.CF_PROACTIVE_TOPUP_ENABLED ?? "false") === "true",
```
(Tipler env.ts'in mevcut yapısına göre; bool'lar string-"true" kontrolüyle. Şema zod ise zod alanı ekle.)

- [ ] **Step 3: tsc temiz**

Run: `npm run lint` (tsc --noEmit)
Expected: 0 hata.

- [ ] **Step 4: Commit**

```bash
git add src/server/lib/env.ts
git commit -m "feat(cf): cf-mirror-sync env flags (default inert)"
```

---

## Task 2: `topUpCfIfNeeded`'a `poolRemainingOverride` ekle (top-up'ı kör-noktadan çıkar)

**Files:**
- Modify: `src/server/services/codefast-provisioning-service.ts:150` (`topUpCfIfNeeded` imza + poolBuffer)
- Test: `src/server/services/codefast-provisioning-service.test.ts`

- [ ] **Step 1: Failing test yaz — override ile kör-nokta atlanır**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
// mock cfCreateOrder + dbSql sibs: tek aktif sibling, cf_remaining=500 (over-report), cap=1000, ordered=200
it("override verilince ayna 500 olsa bile CF-gerçeği 5 → sipariş eder", async () => {
  // sibs mirror MAX=500 (>=THRESHOLD) → eski davranış: sipariş YOK
  // poolRemainingOverride=5 → poolBuffer=5 (<THRESHOLD) → +batch sipariş EDER
  await topUpCfIfNeeded("ent-1", 5);
  expect(cfCreateOrderMock).toHaveBeenCalledOnce();
});
it("override YOKsa eski davranış (ayna MAX=500 ≥ THRESHOLD → sipariş yok)", async () => {
  await topUpCfIfNeeded("ent-1");
  expect(cfCreateOrderMock).not.toHaveBeenCalled();
});
```
(Mevcut test dosyasındaki mock kurulumunu yeniden kullan; canlı kopyadan oku.)

- [ ] **Step 2: Run — fail**

Run: `npx vitest run src/server/services/codefast-provisioning-service.test.ts -t "override"`
Expected: FAIL (`topUpCfIfNeeded` 2. argümanı henüz yok / poolBuffer override'a bakmıyor).

- [ ] **Step 3: İmza + poolBuffer değişikliği**

```ts
export async function topUpCfIfNeeded(entitlementId: string, poolRemainingOverride?: number): Promise<void> {
  // ... sibs sorgusu AYNEN ...
  if (!sibs.length) return;
  const poolBuffer = poolRemainingOverride != null && Number.isFinite(poolRemainingOverride)
    ? poolRemainingOverride
    : Math.max(...sibs.map((r) => (r.cf_remaining == null ? 0 : Number(r.cf_remaining))));
  if (poolBuffer >= CF_TOPUP_THRESHOLD_UNITS) return;
  // ... gerisi AYNEN (aday seçimi, batch, cfCreateOrder, guarded UPDATE) ...
}
```
DEĞİŞMEZ: aday seçimi, batch hesabı, idempotency, `daily_limit_snapshot` tavanı, guarded UPDATE — DOKUNULMAZ.

- [ ] **Step 4: Run — pass + tam suite**

Run: `npx vitest run src/server/services/codefast-provisioning-service.test.ts` ardından `npm test`
Expected: yeni testler PASS, mevcut top-up testleri PASS (geri uyumlu).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/codefast-provisioning-service.ts src/server/services/codefast-provisioning-service.test.ts
git commit -m "feat(cf): topUpCfIfNeeded poolRemainingOverride (un-blind from mirror)"
```

---

## Task 3: `cf-mirror-sync-job` (hızlı ayna eşitleme + proaktif top-up)

**Files:**
- Create: `src/server/jobs/cf-mirror-sync-job.ts`
- Create: `src/server/jobs/cf-mirror-sync-job.test.ts`
- Reuse (DEĞİŞTİRME): `cf-ledger-service.ts` → `listCfCustomerIds`, `cfUsage`, `mapCfEventsToLedgerRows`, `latestRemainingFromRows`, `syncCfRemainingMirror`; `codefast-provisioning-service.ts` → `topUpCfIfNeeded`

- [ ] **Step 1: Failing test — runCfMirrorSyncTick mirror'ı eşitler + düşükse top-up çağırır**

```ts
import { describe, it, expect, vi } from "vitest";
// mock: listCfCustomerIds -> ["c1"]; cfUsage -> events latest remaining=5;
//       syncCfRemainingMirror spy; getActiveCfEntitlementId -> "ent-1"; topUpCfIfNeeded spy
it("aktif müşteri için mirror eşitler ve düşük havuzda override ile top-up çağırır", async () => {
  await runCfMirrorSyncTick({ dryRun: false, proactiveTopup: true });
  expect(syncSpy).toHaveBeenCalledWith("c1", 5);
  expect(topupSpy).toHaveBeenCalledWith("ent-1", 5);
});
it("dryRun: yazma yok", async () => {
  await runCfMirrorSyncTick({ dryRun: true, proactiveTopup: true });
  expect(syncSpy).not.toHaveBeenCalled();
  expect(topupSpy).not.toHaveBeenCalled();
});
it("bir müşteri patlarsa diğerleri devam (never-throw)", async () => {
  // cfUsage ilk müşteride throw → tick reject ETMEZ
  await expect(runCfMirrorSyncTick({ dryRun: false, proactiveTopup: false })).resolves.toBeDefined();
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run src/server/jobs/cf-mirror-sync-job.test.ts`
Expected: FAIL (modül yok).

- [ ] **Step 3: Job'ı yaz (cf-ledger-job.ts desenini izle)**

```ts
import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";
import {
  listCfCustomerIds, cfUsage, mapCfEventsToLedgerRows, latestRemainingFromRows, syncCfRemainingMirror,
} from "../services/cf-ledger-service.js";
import { topUpCfIfNeeded } from "../services/codefast-provisioning-service.js";
import { dbSql } from "../db/client.js"; // canlı kopyadaki gerçek import yolunu kullan

/** Bir müşterinin aktif provisioned CF entitlement id'si (top-up tetiklemek için). */
async function getActiveCfEntitlementId(customerId: string): Promise<string | null> {
  const rows = await dbSql<{ id: string }[]>`
    SELECT id FROM user_package_entitlements
    WHERE cf_customer_id = ${customerId} AND status = 'active' AND cf_status = 'provisioned' AND cf_units_ordered > 0
    ORDER BY (daily_limit_snapshot - cf_units_ordered) DESC, expires_at ASC LIMIT 1`;
  return rows[0]?.id ?? null;
}

export async function runCfMirrorSyncTick(opts: { dryRun: boolean; proactiveTopup: boolean }): Promise<{ customers: number }> {
  const ids = await listCfCustomerIds();
  for (const id of ids) {
    try {
      const usage = await cfUsage(id);
      const remaining = latestRemainingFromRows(mapCfEventsToLedgerRows(id, usage));
      if (!opts.dryRun) await syncCfRemainingMirror(id, remaining); // <=0'da kendisi atlar (clobber-race korumalı)
      if (opts.proactiveTopup && remaining != null && Number.isFinite(remaining)) {
        const entId = await getActiveCfEntitlementId(id);
        if (entId && !opts.dryRun) await topUpCfIfNeeded(entId, remaining); // CF-gerçeği override → kör değil
      }
    } catch (e) {
      logger.warn({ err: e, customerId: id }, "[cf-mirror-sync] customer tick failed");
    }
  }
  return { customers: ids.length };
}

export function startCfMirrorSyncJob(): void {
  if (env.NODE_ENV === "test") return;
  if (!env.CF_MIRROR_SYNC_ENABLED) { logger.info("[cf-mirror-sync] disabled (flag off)"); return; }
  if (!env.CODEFAST_RESELLER_API_KEY) { logger.info("[cf-mirror-sync] skipped (no CF key)"); return; }
  cron.schedule(env.CF_MIRROR_SYNC_CRON, async () => {
    try {
      await runCfMirrorSyncTick({ dryRun: env.CF_MIRROR_SYNC_DRY_RUN, proactiveTopup: env.CF_PROACTIVE_TOPUP_ENABLED });
    } catch (e) { logger.error({ err: e }, "[cf-mirror-sync] run failed"); }
  });
  logger.info({ cron: env.CF_MIRROR_SYNC_CRON, dryRun: env.CF_MIRROR_SYNC_DRY_RUN, topup: env.CF_PROACTIVE_TOPUP_ENABLED }, "[cf-mirror-sync] scheduled");
}
```
(NOT: `cfUsage`, `listCfCustomerIds` mevcut export'lar; `dbSql`/`logger` import yollarını canlı kopyadan doğrula.)

- [ ] **Step 4: Run — pass + suite**

Run: `npx vitest run src/server/jobs/cf-mirror-sync-job.test.ts && npm test`
Expected: PASS; tam suite yeşil.

- [ ] **Step 5: Commit**

```bash
git add src/server/jobs/cf-mirror-sync-job.ts src/server/jobs/cf-mirror-sync-job.test.ts
git commit -m "feat(cf): fast cf-mirror-sync job (~30s) + proactive un-blinded top-up"
```

---

## Task 4: `jobs/index.ts` kaydı

**Files:**
- Modify: `src/server/jobs/index.ts` (canlı kopyadan oku; `startCfLedgerJob` desenini izle)

- [ ] **Step 1: Import + çağrı ekle**

```ts
import { startCfMirrorSyncJob } from "./cf-mirror-sync-job.js";
// ... startAllJobs() içinde, startCfLedgerJob() yanına:
startCfMirrorSyncJob();
```

- [ ] **Step 2: lint + build**

Run: `npm run lint && npm run build`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add src/server/jobs/index.ts
git commit -m "feat(cf): register cf-mirror-sync job"
```

---

## Task 5: Parça 1 SPIKE — CF SSE remaining feasibility (kod yazmadan önce)

**Files:** (yok — araştırma)

- [ ] **Step 1: Canlı CF SSE cevabını yakala**

Bir codex/stream isteğini upstream'e (CF reseller) atıp HAM SSE'yi + response header'larını + olası trailer'ı kaydet (geçici debug log veya tek-seferlik probe script `scp → npx tsx → rm`). `x-codefast-remaining` stream-AÇILIŞ header'ında mı, son SSE event'inde mi, trailer'da mı, hiç mi yok bak.
Expected çıktı: "remaining son event'te VAR" / "trailer'da VAR" / "SSE'de HİÇ YOK".

- [ ] **Step 2: Karar**

- VARSA → `closerouter-service.ts:652/832` finalize bloğunda stream tükenince remaining'i parse edip `usage.cfRemaining`'e koy (`CF_STREAM_CLOSE_HEADER` flag'i arkasında); TDD ile uygula.
- YOKSA → Parça 1'i İPTAL et; `cf-mirror-sync-job` (Task 3, ~30s) zaten asıl çözüm. Spec'e "SSE remaining yok, fast-poll yeterli" notu düş.

---

## Task 6: İzole deploy + kademeli aktivasyon (flag'ler default OFF)

- [ ] **Step 1: İzolasyon kanıtı** — staging dizininde yalnız değişen dosyalar; `rsync -rlzn --checksum --itemize-changes <stage>/ yzapi-vps:/opt/turkapiprojesi/` → SADECE bu dosyalar listelenmeli.
- [ ] **Step 2: 3-QA** (adversaryal, ≥2 PASS) — agentler ssh YAPMASIN (fail2ban); lokal diff verilir.
- [ ] **Step 3: Çift onay** (Ufuk) — money-system kuralı.
- [ ] **Step 4: Canlı yedek** — `ssh yzapi-vps 'cd /opt/turkapiprojesi && cp --parents <her dosya> .deploy/cf-mirror-sync-backup-$(date +%Y%m%dT%H%M%SZ)/'`
- [ ] **Step 5: rsync (–n YOK) + elle gate** — `npm ci → lint → test → build → restart turkapiprojesi → curl health 200`. (Flag'ler OFF → davranış bugünküyle birebir; job kayıtlı ama çalışmıyor.)
- [ ] **Step 6: Kademeli aktivasyon** (env, restart gerekir):
  1. `CF_MIRROR_SYNC_ENABLED=true` + `CF_MIRROR_SYNC_DRY_RUN=true` → 1 tur log doğrula (yazma yok).
  2. `DRY_RUN=false`, `CRON=*/2 * * * *` (2dk) → ayna eşitlemeyi canlı doğrula (mirror==CF truth).
  3. `CRON=*/30 * * * * *` (30s) → anlık eşitleme.
  4. `CF_PROACTIVE_TOPUP_ENABLED=true` → yokumbennapacan tipi aralıklı-403 izle (azalmalı).
- [ ] **Step 7: Geri-al** — herhangi bir flag'i `false` (anında) veya `.deploy/cf-mirror-sync-backup`'tan geri rsync + build + restart.
- [ ] **Step 8: Memory** — targeted rsync manifest'i güncellemez; gerçek canlı durumu + flag durumlarını memory notuna yaz.

---

## Self-Review (yapıldı)
- **Spec kapsama:** Parça 1=Task 5 (spike); Parça 2 (hız)=Task 3; Parça 3 (proaktif top-up)=Task 2+3. Flag/inert/deploy=Task 1+6. ✓
- **Placeholder:** import yolları "canlı kopyadan doğrula" notlu (lokal-geride kısıtı) — bilinçli, spekülatif kod değil. ✓
- **Tip tutarlılığı:** `topUpCfIfNeeded(entitlementId, poolRemainingOverride?)` Task 2'de tanımlı, Task 3'te aynı imzayla çağrılıyor. `runCfMirrorSyncTick({dryRun, proactiveTopup})` Task 3 içinde tutarlı. ✓
