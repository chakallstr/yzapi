import { db, dbSql } from "../db/client.js";
import { usageRecords } from "../db/schema.js";
import { env } from "../lib/env.js";

export interface PackageCoverage {
  covered: boolean;
  entitlementId?: string;
  maxContextTokens?: number;
  tpmLimit?: number;
  packageId?: string;
  // Paket-bazlı upstream override (ikisi de doluysa proxy bu endpoint'i kullanır)
  providerBaseUrl?: string;
  providerApiKeyCipher?: string;
  // Override-only model_map (canonical → upstream-wire); packageOverrideChain'e iletilir.
  providerModelMap?: Record<string, string>;
  // CodeFast müşteri-başına override: entitlement'a sabitlenen proxy slug + cf_rc_live_ key.
  // Doluysa proxy reseller-api/proxy/<slug>'a forward eder; cfStatus=pending_manual ise
  // (Claude elle teslim) key henüz yok → proxy 409 döner.
  cfApiSlug?: string;
  cfRcKeyCipher?: string;
  cfStatus?: string;
  // R-3 over-serve cap girdileri (yalnız RETURNING'den okunur; gate WHERE/SET DEĞİŞMEZ).
  cfServed?: number;
  dailyLimitSnapshot?: number;
  cfRemaining?: number | null;
  cfRemainingAt?: string | Date | null;
  // Devreden (rollover) paket alanları (yalnız RETURNING'den okunur; accrual/saatlik sayaç UPDATE AYRI görev).
  dailyQuota?: number | null;
  rolloverBalance?: number;
  saatlikLimit?: number | null;
  requestsThisHour?: number;
  // Post-increment günlük istek sayacı (RETURNING'den). Override alternation (1-1 sıralı
  // premium↔bengalfox) bunun tek/çiftine göre hedef seçer; başka yerde kullanılmaz.
  requestsToday?: number;
}

// In-memory fixed-window TPM tracker keyed by "userId:packageId"
interface TpmWindow { minute: number; tokens: number }
const tpmTracker = new Map<string, TpmWindow>();

/** Returns false if the TPM limit would be exceeded; records tokens on success. */
export function consumeTpmOrDeny(userId: string, packageId: string, tokens: number, limit: number): boolean {
  const key = `${userId}:${packageId}`;
  const minute = Math.floor(Date.now() / 60_000);
  const w = tpmTracker.get(key);
  const current = w?.minute === minute ? w.tokens : 0;
  if (current + tokens > limit) return false;
  tpmTracker.set(key, { minute, tokens: current + tokens });
  return true;
}

/** Salt-okunur: günlük kota bakılmaksızın aktif (süresi dolmamış) paket var mı? */
export async function hasActivePackageForModel(userId: string, modelId: string): Promise<boolean> {
  const rows = await dbSql<{ id: string }[]>`
    SELECT e.id FROM user_package_entitlements e
    WHERE e.user_id = ${userId}::uuid
      AND e.status = 'active'
      AND e.expires_at > now()
      AND e.allowed_models_snapshot @> ${JSON.stringify([modelId])}::jsonb
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Salt-okunur: bu modeli kapsayan, süresi geçmemiş, bugün kotası dolmamış aktif hak var mı? */
export async function checkPackageCoverage(userId: string, modelId: string): Promise<boolean> {
  const rows = await dbSql<{ id: string }[]>`
    SELECT e.id FROM user_package_entitlements e
    JOIN users u ON u.id = e.user_id
    JOIN packages p ON p.id = e.package_id
    WHERE e.user_id = ${userId}::uuid
      AND u.payg_mode = false        -- "kullandığın kadar öde" modunda paket kapsamı atlanır → bakiye
      AND e.paused = false           -- duraklatılmış paket istek tüketmez
      AND e.status = 'active'
      AND e.expires_at > now()
      AND e.allowed_models_snapshot @> ${JSON.stringify([modelId])}::jsonb
      -- "Yeni Üye" lifetime paketi (p.lifetime_no_reset): düz/ömürlük sayaç, GECE RESET YOK → yalnız
      -- requests_today < daily_limit_snapshot ile kapılar (gün-dönümü serbest-geçiş YOK; 12s pencere
      -- gece yarısını aşsa bile kota yenilenmez). Diğer tüm paketler (NOT lifetime) eski OR-zincirini
      -- AYNEN kullanır (CF/codex-24s/devreden/daily DEĞİŞMEZ). CF-lazy/devreden/saatlik cümleleri
      -- lifetime'da no-op (cf_units_ordered=0, daily_quota NULL, saatlik_limit NULL).
      AND (
        (p.lifetime_no_reset AND e.requests_today < e.daily_limit_snapshot)
        OR (NOT p.lifetime_no_reset AND (
      -- CF paketinde günlük sayaç DEĞİL CF hesabı (cf_remaining) kapılar: CF paketi için daily_limit_snapshot
      -- ÖMÜRLÜK ünite sayısıdır (günlük tavan değil), bu yüzden cf_units_ordered>0 ise per-gün sayaç
      -- (requests_today<daily_limit_snapshot) BLOKLAMAZ — yoksa panel "ünite var" derken kapı 402 verir (RC1/RC2).
      -- İSTİSNA (2026-06-25, koltuk-servisli): codex-api (gpt-5.x) paketleri bizim Codex koltuğumuza (sub-codex)
      -- gider, CF yalnız fallback → bunlar DAILY model: daily_limit_snapshot GÜNLÜK değerdir (ÖMÜRLÜK değil),
      -- her gün N istek + ertesi gün SIFIRLANIR. Bu yüzden codex-api günlük cap'ten MUAF TUTULMAZ (over-serve
      -- önlenir: yokum 936/500 bug'ı). KAYAN 24s (2026-06-26): codex sayacı takvim gününe DEĞİL,
      -- aktivasyondan itibaren kayan 24 saat penceresine bağlı → gün-ortası aktive paket gece fazladan
      -- parti almaz. Pencere: activated_at + floor((now-activated)/24s)*24s. tryReservePackageSlot ile AYNI.
          ((e.cf_units_ordered > 0 AND e.cf_api_slug IS DISTINCT FROM 'codex-api')
           OR (e.cf_api_slug = 'codex-api' AND e.daily_quota IS NULL
               AND (e.day_window_start IS NULL
                    OR e.day_window_start < (e.activated_at + (floor(extract(epoch FROM (now() - e.activated_at)) / 86400)::int * interval '1 day'))
                    OR e.requests_today < e.daily_limit_snapshot))
           OR ((e.cf_api_slug IS DISTINCT FROM 'codex-api' OR e.daily_quota IS NOT NULL)
               AND (e.last_reset_date < CURRENT_DATE
                    OR e.requests_today < e.daily_limit_snapshot)))
        ))
      )
      -- CF lazy gate (CF hesabı bazlı, deadlock-güvenli): cf_units_ordered=0 → lazy değil (eski yol);
      -- cf_remaining NULL → mirror henüz kurulmadı, geçir (ilk istek kurar); >0 → CF'de ünite var, geçir;
      -- =0 & taze → CF tükendi, BLOKLA. DEADLOCK FIX (2026-06-21): cf_units_ordered < daily_limit_snapshot
      -- → paketin SİPARİŞ EDİLMEMİŞ kotası var (ödendi ama CF'den henüz alınmadı) → geçir ki top-up
      -- (settleBilling'de) tetiklenebilsin. cf_units_ordered=cap (tüm kota alınmış) → headroom yok →
      -- BLOKLA; CF kendi bakiyesini kapıladığından over-serve olmaz.
      -- NOT (2026-06-23): eski "stale-0 supabı" (cf_remaining_at < now()-10min) KALDIRILDI. Supabının tek
      -- anlamlı senaryosu headroom olan paket (=DEADLOCK FIX zaten geçirir); headroom yoksa CF'den yeni
      -- ünite gelemiyor, supabı yalnız over-serve cap 402 döngüsüne yol açıyordu.
      -- İSTİSNA (2026-06-25, koltuk-servisli): codex-api koltuğa gider → CF aynası HİÇ bloklamaz (CF fallback;
      -- gerçek kapı yukarıdaki günlük cap'tir). Non-codex CF (glm/composer/...) DEĞİŞMEZ — CF-lifetime model.
      AND (e.cf_api_slug = 'codex-api'
           OR e.cf_units_ordered = 0
           OR e.cf_remaining IS NULL
           OR e.cf_remaining > 0
           OR e.cf_units_ordered < e.daily_limit_snapshot)
      -- Devreden (rollover) günlük tavanı: daily_quota set'li paketlerde günlük taban + devreden bakiye
      -- birikimi gerçek günlük cap'tir (daily_limit_snapshot=ÖMÜRLÜK CF cap, günlük değil). daily_quota NULL
      -- (devreden olmayan paket) → no-op geçir. Gün dönmüşse (last_reset_date<bugün) sayaç sıfırlanacak → geçir.
      AND (e.daily_quota IS NULL
           OR e.day_window_start IS NULL
           OR e.day_window_start < (e.activated_at + (floor(extract(epoch FROM (now() - e.activated_at)) / 86400)::int * interval '1 day'))
           OR e.requests_today < e.daily_quota + e.rollover_balance)
      -- Devreden saatlik limit: saatlik_limit set'liyse mevcut saat penceresindeki istek limiti aşılamaz.
      -- saatlik_limit NULL → no-op. hour_window_start NULL → henüz pencere yok, geçir. Pencere önceki saatte
      -- (date_trunc('hour',now())'dan eski) → saat dönmüş, sayaç sıfırlanacak → geçir.
      AND (e.saatlik_limit IS NULL
           OR e.hour_window_start IS NULL
           OR e.hour_window_start < date_trunc('hour', now())
           OR e.requests_this_hour < e.saatlik_limit)
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Salt-okuma: bu modeli kapsayan AKTİF bir devreden (saatlik_limit set'li) hakkın, SADECE saatlik
 * hız limiti yüzünden servis veremiyor olup olmadığını döndürür. exceeded=true İSE VE ANCAK İSE:
 *  - aktif, süresi geçmemiş, modeli kapsayan, saatlik_limit IS NOT NULL bir hak var,
 *  - günlük tavanı (daily_quota + rollover_balance) DOLMAMIŞ (yani saatlik olmasaydı servis EDERDİ) —
 *    günlük tavan da doluysa bu saf bir saatlik throttle DEĞİL, kota tükenmesidir → exceeded:false döner
 *    (proxy normal QuotaExhausted / bakiye yolunu sürdürür, throttle 429'u maskelemez),
 *  - mevcut saat penceresinde (hour_window_start >= date_trunc('hour', now())) requests_this_hour >= saatlik_limit.
 * Gate'in (checkPackageCoverage/tryReservePackageSlot) günlük + saatlik cümleleri AYNEN yansıtılır,
 * yalnız saatlik koşulu TERS çevrilir (gate "altında" geçirir; burada "≥" ise saatlik engel devrede).
 * retryAfterSec = şimdiden bir sonraki tam saate kalan saniye (1..3600 tamsayı).
 */
export async function checkHourlyExceeded(
  userId: string,
  modelId: string,
): Promise<{ exceeded: boolean; retryAfterSec: number }> {
  const rows = await dbSql<{ retry_after_sec: number }[]>`
    SELECT CEIL(EXTRACT(EPOCH FROM (date_trunc('hour', now()) + interval '1 hour' - now())))::int AS retry_after_sec
    FROM user_package_entitlements e
    JOIN users u ON u.id = e.user_id
    WHERE e.user_id = ${userId}::uuid
      AND u.payg_mode = false
      AND e.paused = false
      AND e.status = 'active'
      AND e.expires_at > now()
      AND e.allowed_models_snapshot @> ${JSON.stringify([modelId])}::jsonb
      AND e.saatlik_limit IS NOT NULL
      -- Günlük tavan DOLMAMIŞ olmalı (gate daily cümlesi ile aynı): gün dönmüşse veya
      -- requests_today < daily_quota + rollover_balance → günlük müsait. Tavan da doluysa bu
      -- saf saatlik throttle değildir → satırı ELE (exceeded:false).
      AND (e.daily_quota IS NULL
           OR e.day_window_start IS NULL
           OR e.day_window_start < (e.activated_at + (floor(extract(epoch FROM (now() - e.activated_at)) / 86400)::int * interval '1 day'))
           OR e.requests_today < e.daily_quota + e.rollover_balance)
      -- Saatlik engel DEVREDE (gate saatlik cümlesinin TERSİ): pencere MEVCUT (geçmiş değil) VE
      -- requests_this_hour >= saatlik_limit. Pencere önceki saatteyse (sayaç sıfırlanacak) → engel yok.
      AND e.hour_window_start IS NOT NULL
      AND e.hour_window_start >= date_trunc('hour', now())
      AND e.requests_this_hour >= e.saatlik_limit
    LIMIT 1
  `;
  if (rows.length) {
    const sec = Number(rows[0].retry_after_sec);
    return { exceeded: true, retryAfterSec: Number.isFinite(sec) && sec > 0 ? sec : 1 };
  }
  return { exceeded: false, retryAfterSec: 0 };
}

/** Atomik: en erken biten kapsayan haktan bir günlük slot rezerve et. */
export async function tryReservePackageSlot(userId: string, modelId: string): Promise<PackageCoverage> {
  const rows = await dbSql<{ id: string; max_context_tokens: number | null; tpm_limit: number | null; package_id: string; provider_base_url: string | null; provider_api_key_cipher: string | null; provider_model_map: Record<string, string> | null; cf_api_slug: string | null; cf_rc_key_cipher: string | null; cf_status: string | null; cf_served: number; daily_limit_snapshot: number; cf_remaining: number | null; cf_remaining_at: string | Date | null; daily_quota: number | null; rollover_balance: number; saatlik_limit: number | null; requests_this_hour: number; requests_today: number }[]>`
    UPDATE user_package_entitlements AS upe
    SET requests_today = CASE
          -- "Yeni Üye" lifetime paketi (p.lifetime_no_reset): reset YOK, her istek +ağırlık (gece-yarısı/pencere
          -- sıfırlaması YOK → 12s pencere gece yarısını aşsa bile kota yenilenmez; cap'e ulaşınca gate bloklar).
          WHEN p.lifetime_no_reset THEN upe.requests_today + COALESCE(am.request_weight, 1)
          -- codex-api (devreden DEĞİL): KAYAN 24s pencere (aktivasyona hizalı). Pencere döndüyse ağırlık, aynı pencerede +ağırlık.
          -- Takvim gece-yarısı reset YOK → gün-ortası aktive 1 günlük paket gece fazladan parti almaz.
          -- DEVREDEN codex (daily_quota dolu) HARİÇ — o ürün bilinçli takvim-günlük + rollover (aşağıdaki dala düşer).
          WHEN upe.cf_api_slug = 'codex-api' OR upe.daily_quota IS NOT NULL
            THEN CASE WHEN upe.day_window_start IS NULL
                        OR upe.day_window_start < (upe.activated_at + (floor(extract(epoch FROM (now() - upe.activated_at)) / 86400)::int * interval '1 day'))
                      THEN COALESCE(am.request_weight, 1) ELSE upe.requests_today + COALESCE(am.request_weight, 1) END
          WHEN upe.last_reset_date < CURRENT_DATE THEN COALESCE(am.request_weight, 1)
          ELSE upe.requests_today + COALESCE(am.request_weight, 1) END,
        -- codex-api (devreden DEĞİL) kayan pencere başlangıcını (aktivasyona hizalı) güncelle; diğerlerinde dokunma.
        day_window_start = CASE
          WHEN (upe.cf_api_slug = 'codex-api' OR upe.daily_quota IS NOT NULL)
               AND (upe.day_window_start IS NULL
                    OR upe.day_window_start < (upe.activated_at + (floor(extract(epoch FROM (now() - upe.activated_at)) / 86400)::int * interval '1 day')))
          THEN (upe.activated_at + (floor(extract(epoch FROM (now() - upe.activated_at)) / 86400)::int * interval '1 day'))
          ELSE upe.day_window_start END,
        last_reset_date = CURRENT_DATE,
        -- Devreden birikimi (accrual): yalnız YENİ GÜNDE ve devreden pakette (daily_quota dolu).
        -- Bu günün kullanılmayan tabanı floor(.../50)*50 + tam-boş günler (gap-1)×quota. Postgres SET
        -- sağ tarafları ESKİ satırla hesaplar → upe.requests_today = dünün sayacı. GREATEST(0,…) over-serve clamp.
        rollover_balance = CASE
          WHEN upe.daily_quota IS NOT NULL
               AND (upe.day_window_start IS NULL
                    OR upe.day_window_start < (upe.activated_at + (floor(extract(epoch FROM (now() - upe.activated_at)) / 86400)::int * interval '1 day')))
          THEN upe.rollover_balance
               + GREATEST(0, (FLOOR(GREATEST(0, upe.daily_quota - upe.requests_today)::numeric / 50) * 50)::int)
               + (GREATEST(0, floor(extract(epoch FROM ((upe.activated_at + (floor(extract(epoch FROM (now() - upe.activated_at)) / 86400)::int * interval '1 day')) - COALESCE(upe.day_window_start, upe.activated_at))) / 86400)::int - 1) * COALESCE(upe.daily_quota, 0))
          ELSE upe.rollover_balance END,
        -- Saatlik sayaç: yeni saat penceresinde 1, aynı pencerede +1.
        requests_this_hour = CASE
          WHEN upe.hour_window_start IS NULL OR upe.hour_window_start < date_trunc('hour', now())
          THEN 1 ELSE upe.requests_this_hour + 1 END,
        hour_window_start = date_trunc('hour', now()),
        updated_at = now()
    FROM packages p
    LEFT JOIN added_models am ON am.model_id = ${modelId}
    WHERE p.id = upe.package_id
      AND upe.id = (
        SELECT e.id FROM user_package_entitlements e
        JOIN users u ON u.id = e.user_id
        JOIN packages pk ON pk.id = e.package_id
        WHERE e.user_id = ${userId}::uuid
          AND u.payg_mode = false        -- "kullandığın kadar öde" modu → paket atlanır, bakiyeden düşer
          AND e.paused = false           -- duraklatılmış paket istek tüketmez (süre işlemeye devam eder)
          AND e.status = 'active'
          AND e.expires_at > now()
          AND e.allowed_models_snapshot @> ${JSON.stringify([modelId])}::jsonb
          -- "Yeni Üye" lifetime paketi (pk.lifetime_no_reset): düz/ömürlük sayaç, GECE RESET YOK
          -- (checkPackageCoverage ile AYNI semantik — ikisi senkron kalmalı). Diğer paketler eski OR-zinciri.
          AND (
            (pk.lifetime_no_reset AND e.requests_today < e.daily_limit_snapshot)
            OR (NOT pk.lifetime_no_reset AND (
          -- CF paketi günlük sayaçtan muaf (checkPackageCoverage ile AYNI — ikisi senkron kalmalı): bkz oradaki açıklama.
          -- codex-api İSTİSNASI (koltuk-servisli, KAYAN 24s model) — bkz checkPackageCoverage açıklaması.
              ((e.cf_units_ordered > 0 AND e.cf_api_slug IS DISTINCT FROM 'codex-api')
               OR (e.cf_api_slug = 'codex-api' AND e.daily_quota IS NULL
                   AND (e.day_window_start IS NULL
                        OR e.day_window_start < (e.activated_at + (floor(extract(epoch FROM (now() - e.activated_at)) / 86400)::int * interval '1 day'))
                        OR e.requests_today < e.daily_limit_snapshot))
               OR ((e.cf_api_slug IS DISTINCT FROM 'codex-api' OR e.daily_quota IS NOT NULL)
                   AND (e.last_reset_date < CURRENT_DATE
                        OR e.requests_today < e.daily_limit_snapshot)))
            ))
          )
          -- CF lazy gate (checkPackageCoverage ile AYNI semantik — ikisi senkron kalmalı): bkz oradaki açıklama.
          -- Stale-0 supabı KALDIRILDI (2026-06-23) — bkz checkPackageCoverage açıklaması.
          -- codex-api İSTİSNASI: koltuğa gider → CF aynası bloklamaz (bkz checkPackageCoverage açıklaması).
          AND (e.cf_api_slug = 'codex-api'
               OR e.cf_units_ordered = 0
               OR e.cf_remaining IS NULL
               OR e.cf_remaining > 0
               OR e.cf_units_ordered < e.daily_limit_snapshot)
          -- Devreden günlük tavanı (checkPackageCoverage ile AYNI — ikisi senkron kalmalı): bkz oradaki açıklama.
          AND (e.daily_quota IS NULL
               OR e.day_window_start IS NULL
               OR e.day_window_start < (e.activated_at + (floor(extract(epoch FROM (now() - e.activated_at)) / 86400)::int * interval '1 day'))
               OR e.requests_today < e.daily_quota + e.rollover_balance)
          -- Devreden saatlik limit (checkPackageCoverage ile AYNI — ikisi senkron kalmalı): bkz oradaki açıklama.
          AND (e.saatlik_limit IS NULL
               OR e.hour_window_start IS NULL
               OR e.hour_window_start < date_trunc('hour', now())
               OR e.requests_this_hour < e.saatlik_limit)
        -- Düşükten büyüğe tüketim: önce KÜÇÜK paket bitirilir, sonra büyüğe geçilir (eşit boyutta önce erken
        -- biten). Devreden pakette gerçek günlük taban daily_quota'dır (daily_limit_snapshot=ÖMÜRLÜK CF cap)
        -- → COALESCE(daily_quota, daily_limit_snapshot) ile devreden paket büyük CF cap'i yüzünden aç kalmaz.
        ORDER BY COALESCE(e.daily_quota, e.daily_limit_snapshot) ASC, e.expires_at ASC
        LIMIT 1
        FOR UPDATE OF e SKIP LOCKED
      )
    RETURNING upe.id, upe.package_id, p.max_context_tokens, p.tpm_limit,
              p.provider_base_url, p.provider_api_key_cipher, p.provider_model_map,
              upe.cf_api_slug, upe.cf_rc_key_cipher, upe.cf_status,
              upe.cf_served, upe.daily_limit_snapshot, upe.cf_remaining, upe.cf_remaining_at,
              upe.daily_quota, upe.rollover_balance, upe.saatlik_limit, upe.requests_this_hour, upe.requests_today
  `;
  if (rows.length) {
    const r = rows[0];
    return {
      covered: true,
      entitlementId: r.id,
      packageId: r.package_id,
      maxContextTokens: r.max_context_tokens ?? undefined,
      tpmLimit: r.tpm_limit ?? undefined,
      providerBaseUrl: r.provider_base_url ?? undefined,
      providerApiKeyCipher: r.provider_api_key_cipher ?? undefined,
      providerModelMap: r.provider_model_map ?? undefined,
      cfApiSlug: r.cf_api_slug ?? undefined,
      cfRcKeyCipher: r.cf_rc_key_cipher ?? undefined,
      cfStatus: r.cf_status ?? undefined,
      cfServed: r.cf_served ?? 0,
      dailyLimitSnapshot: r.daily_limit_snapshot ?? 0,
      cfRemaining: r.cf_remaining ?? null,
      cfRemainingAt: r.cf_remaining_at ?? null,
      dailyQuota: r.daily_quota ?? null,
      rolloverBalance: r.rollover_balance ?? 0,
      saatlikLimit: r.saatlik_limit ?? null,
      requestsThisHour: r.requests_this_hour ?? 0,
      // requests_today artık NUMERIC (0058) — postgres.js NUMERIC'i JS string döndürür
      // (float hassasiyet kaybını önlemek için); Number() ile normalize et, aksi halde
      // downstream tüketiciler (panel/admin/computeDisplayConsumed) string alır.
      requestsToday: Number(r.requests_today ?? 0),
    };
  }
  return { covered: false };
}

/**
 * CF mirror: CodeFast'in `x-codefast-remaining` header'ından (success) veya 403 body'sinden (error)
 * yakalanan GERÇEK kalan üniteyi entitlement'a yaz. Panel + gate bunu okuyunca sayacımız CF ile senkron.
 *
 * MÜŞTERİ-BAZLI: CF havuzu cf_customer_id (= userId) başına PAYLAŞILIR → bir kullanıcının TÜM aktif CF
 * kardeş satırlarına aynı gerçeği yaz (yalnız reserve edilen satıra değil; aksi halde kardeş satır bayat
 * kalır, gate yanlış kapılar — "hak var ama 403"un yarısı). FLOOR ile tamsayıya indir (negatif olmayan CF
 * kalanı için Math.trunc ile AYNI; tutarlılık için). NOT: kesirli kalanın 0'a inip kilitlemesi FLOOR ile
 * DEĞİL, aşağıdaki error-path freshness guard'ı ile çözülür (asıl anti-kilit mekanizması o).
 *
 * Hakemlik (source):
 *  - success = CF'nin x-codefast-remaining header'ı = OTORİTER güncel bakiye → HER ZAMAN yaz (decrement dahil).
 *              ⚠️ KOŞULSUZ yazar: uçuştaki bayat-düşük bir success cf_remaining'i 0'a ezse bile paket KİLİTLENMEZ
 *              çünkü gate'in headroom valfi (cf_units_ordered < daily_limit_snapshot, tryReservePackageSlot)
 *              satırı açık tutar → o cümle KORUNMALI (entitlement-service.test.ts gate-headroom regresyonu kilitler).
 *  - error   = 403 body'sindeki kalan; uçuştaki bir istekten gelip BAYAT olabilir → taze (<2sn) yazılmış bir
 *              değeri AŞAĞI çekmesine izin verme (top-up bump'ını hemen ardından gelen 403'ün 0'a ezmesi =
 *              bbbnull kilidi). Eşit/yükselten yazıma ya da 2sn sonrasına izin var. cf_units_ordered>0 koşulu
 *              non-CF / PAYG satırlarına asla yazmaz. Over-serve İMKANSIZ: CF sert duvar (havuz <1.5 → 403);
 *              bu yalnız CF'nin kendi sayısına doğru yükseltir, asla CF üstüne çıkmaz.
 * remaining null/NaN → CF cevabı yoktu (CF dışı sağlayıcı), dokunma.
 */
export async function updateCfRemaining(
  userId: string,
  remaining: number | null | undefined,
  source: "success" | "error" = "success",
): Promise<void> {
  if (remaining == null || !Number.isFinite(remaining)) return;
  const floored = Math.floor(remaining);
  if (source === "error") {
    await dbSql`
      UPDATE user_package_entitlements
      SET cf_remaining = ${floored}, cf_remaining_at = now(), updated_at = now()
      WHERE cf_customer_id = ${userId}
        AND status = 'active'
        AND cf_units_ordered > 0
        AND (cf_remaining_at IS NULL
             OR cf_remaining_at < now() - interval '2 seconds'
             OR ${floored} >= COALESCE(cf_remaining, 0))
    `;
    return;
  }
  await dbSql`
    UPDATE user_package_entitlements
    SET cf_remaining = ${floored}, cf_remaining_at = now(), updated_at = now()
    WHERE cf_customer_id = ${userId}
      AND status = 'active'
      AND cf_units_ordered > 0
  `;
}

/**
 * Hata durumunda slot iadesi (K1'in kota ikizi). `modelId` verilirse tryReservePackageSlot'un
 * o çağrıda eklediği AYNI ağırlık (added_models.request_weight, default 1) geri düşülür —
 * simetrik olmazsa (örn. terra 0.75 ekleyip her zaman 1 iade edilirse) sayaç zamanla YUKARI sürüklenir.
 * modelId verilmezse (eski çağrı yeri / bilinmeyen model) eski davranış: düz 1.
 */
export async function releasePackageSlot(entitlementId: string, modelId?: string): Promise<void> {
  if (modelId === undefined) {
    await dbSql`
      UPDATE user_package_entitlements
      SET requests_today = GREATEST(requests_today - 1, 0),
          requests_this_hour = GREATEST(requests_this_hour - 1, 0),
          updated_at = now()
      WHERE id = ${entitlementId}::uuid
    `;
    return;
  }
  await dbSql`
    UPDATE user_package_entitlements
    SET requests_today = GREATEST(
          requests_today - COALESCE((SELECT request_weight FROM added_models WHERE model_id = ${modelId}), 1),
          0
        ),
        requests_this_hour = GREATEST(requests_this_hour - 1, 0),
        updated_at = now()
    WHERE id = ${entitlementId}::uuid
  `;
}

/** Paket isteği için usage_records satırı (costTL=0, billed_via='package'). */
export async function recordPackageUsage(opts: {
  userId: string;
  apiKeyId: string;
  modelId: string;
  entitlementId: string;
  inputUsage: number;
  outputUsage: number;
  responseMs: number;
  status: "success" | "error";
  requestId: string;
  upstreamRequestId?: string;
  errorCode?: string;
}): Promise<boolean> {
  // Idempotent: request_id UNIQUE; çakışmada satır eklenmez. RETURNING ile YENİ satır eklendi mi söyler
  // (TEK SAYAÇ koltuk-düşümü bu boolean'a bağlı → aynı istek 2× settle olsa bile çift düşmez).
  const inserted = await db.insert(usageRecords).values({
    userId: opts.userId,
    apiKeyId: opts.apiKeyId,
    modelId: opts.modelId,
    type: "Metin",
    inputUsage: opts.inputUsage,
    outputUsage: opts.outputUsage,
    costUsd: "0",
    costTL: "0",
    requestId: opts.requestId,
    upstreamRequestId: opts.upstreamRequestId,
    errorCode: opts.errorCode,
    responseMs: opts.responseMs,
    status: opts.status,
    billedVia: "package",
    entitlementId: opts.entitlementId,
  }).onConflictDoNothing().returning({ id: usageRecords.id });
  return inserted.length > 0;
}

/**
 * Bir kullanıcıya paket entitlement'ı VER (aktif aynı paket varsa süreyi uzat, yoksa oluştur).
 * Bir transaction içinde çağrılır (txSql). purchase (bakiye) ve redeem (kod) ORTAK kullanır.
 * Snapshot (daily_limit, allowed_models) burada dondurulur. Para taşımaz.
 */
export async function grantPackageEntitlement(
  txSql: any,
  params: {
    userId: string;
    packageId: string;
    sureGun: number;
    gunlukIstekLimiti: number;
    allowedModels: unknown;
    purchaseTransactionId?: string | null;
    /**
     * Devreden (rollover) paket mi? true → INSERT yolu devreden kolonlarını doldurur:
     *   daily_quota = gunlukIstekLimiti (günlük taban), daily_limit_snapshot = quota × sureGun (ÖMÜRLÜK cap),
     *   rollover_balance = 0, saatlik_limit = saatlikLimit, hour_window_start = now(), requests_this_hour = 0.
     * Undefined/false → non-devreden (eski davranış: daily_quota NULL, daily_limit_snapshot=günlük limit).
     */
    devreden?: boolean;
    /** Devreden pakette saatlik istek tavanı (packages.saatlik_limit, =150). devreden true değilse yok sayılır. */
    saatlikLimit?: number | null;
    /**
     * Doluysa (>0) entitlement süresi GÜN değil SAAT cinsinden: expires_at = now() + N saat
     * ("Yeni Üye" hoş geldin paketi = 12). NULL/0 → eski gün-bazlı (sureGun). Yalnız YENİ-SATIR
     * (INSERT) yolunu etkiler; EXTEND yolu (per_user_once paketlerde erişilemez) gün-bazlı kalır.
     */
    expiresInHours?: number | null;
  },
  /**
   * true → mevcut aktif aynı-paket hakkı OLSA BİLE süreyi uzatma (EXTEND), HER ZAMAN yeni satır aç.
   * - Configurable ("Kendin Yap") paketlerde her alım farklı (limit×süre) olabilir → birleştirilemez
   *   (eski EXTEND daily_limit'i EZİYORDU → 120→100 downgrade bug'ı). Ayrı satır = her alım tam ödediği.
   * - "Paketimi Yenile" (her pakette) → taze kota = yeni satır.
   * Sabit paketlerde normal alım false → eski EXTEND (aynı daily_limit, süre stack) korunur.
   * Çoklu aktif satır tryReservePackageSlot tarafından zaten destekleniyor (günlük kapasite = toplam).
   */
  ayriSatir = false,
): Promise<{ entitlementId: string; extended: boolean }> {
  const allowedJson = JSON.stringify(params.allowedModels ?? []);
  const txId = params.purchaseTransactionId ?? null;

  const existing = ayriSatir ? [] : await txSql<{ id: string }[]>`
    SELECT id FROM user_package_entitlements
    WHERE user_id = ${params.userId}::uuid AND package_id = ${params.packageId}
      AND status = 'active' AND expires_at > now()
    ORDER BY expires_at DESC LIMIT 1
  `;
  if (existing.length) {
    // EXTEND: CF mirror sayaçlarını re-base et (cf_remaining=NULL → gate "kurulmadı" sayıp geçer →
    // bunu izleyen re-provisioning cf_units_ordered'ı taze firstBatch'e set eder, ilk istek mirror'lar).
    // Aksi halde eski stale cf_remaining=0 EXTEND sonrası deadlock'u kalıcılaştırırdı. CF-dışı pakette
    // cf_remaining zaten NULL → no-op.
    const ext = await txSql<{ id: string }[]>`
      UPDATE user_package_entitlements
      SET expires_at = expires_at + (${params.sureGun}::int * interval '1 day'),
          daily_limit_snapshot = ${params.gunlukIstekLimiti}::int,
          allowed_models_snapshot = ${allowedJson}::jsonb,
          purchase_transaction_id = ${txId}::uuid,
          cf_remaining = NULL,
          cf_remaining_at = NULL,
          -- R-3: yenileme = taze servis penceresi. activated_at'i ileri al (cf_served snapshot bundan
          -- sayılır) + cf_served'i hemen 0'la (15dk refresh'e kadar false-lockout penceresi olmasın).
          activated_at = now(),
          cf_served = 0,
          updated_at = now()
      WHERE id = ${existing[0].id}::uuid
      RETURNING id
    `;
    return { entitlementId: ext[0].id, extended: true };
  }
  // Devreden (rollover) paket: günlük taban = daily_quota, ÖMÜRLÜK cap = quota × sure (CF cap),
  // rollover_balance=0 başlar, saatlik_limit pakettendir, saat penceresi şimdi başlar (sayaç 0).
  // daily_limit_snapshot=quota×sure → CF-arkalı devreden paketin ÖMÜRLÜK ünite tavanıyla aynı semantik.
  if (params.devreden) {
    const insDev = await txSql<{ id: string }[]>`
      INSERT INTO user_package_entitlements
        (user_id, package_id, daily_limit_snapshot, allowed_models_snapshot,
         activated_at, expires_at, status, requests_today, last_reset_date, purchase_transaction_id,
         daily_quota, rollover_balance, saatlik_limit, hour_window_start, requests_this_hour)
      VALUES
        (${params.userId}::uuid, ${params.packageId},
         ${params.gunlukIstekLimiti * params.sureGun}::int, ${allowedJson}::jsonb,
         now(), now() + (${params.sureGun}::int * interval '1 day'), 'active', 0, CURRENT_DATE, ${txId}::uuid,
         ${params.gunlukIstekLimiti}::int, 0, ${params.saatlikLimit ?? null}::int, now(), 0)
      RETURNING id
    `;
    return { entitlementId: insDev[0].id, extended: false };
  }
  // "Yeni Üye" hoş geldin paketi: SAAT-bazlı bitiş (expires_at = now() + N saat, welcome=12).
  // Düz/ömürlük sayaç paketi (lifetime_no_reset) burada açılır; gece-yarısı reset gate'te engellenir.
  if (params.expiresInHours && params.expiresInHours > 0) {
    const insHours = await txSql<{ id: string }[]>`
      INSERT INTO user_package_entitlements
        (user_id, package_id, daily_limit_snapshot, allowed_models_snapshot,
         activated_at, expires_at, status, requests_today, last_reset_date, purchase_transaction_id)
      VALUES
        (${params.userId}::uuid, ${params.packageId}, ${params.gunlukIstekLimiti}::int, ${allowedJson}::jsonb,
         now(), now() + (${params.expiresInHours}::int * interval '1 hour'), 'active', 0, CURRENT_DATE, ${txId}::uuid)
      RETURNING id
    `;
    return { entitlementId: insHours[0].id, extended: false };
  }
  // Koltuk-servisli codex (gpt-5.x) paketlerinde CF siparişi verilmez (CODEX_SEAT_ONLY) → provisioning
  // ATLANIR → cf_api_slug entitlement'a hiç yazılmaz, NULL kalırdı. NULL slug, gate'in KAYAN-24s codex
  // dalına (tryReservePackageSlot/checkPackageCoverage) giremeyip TAKVİM-reset dalına düşmesine →
  // aktivasyon-24s penceresi UTC 00:00'ı kapsayınca ÇİFT-SERVİS (nominal kotanın ~2 katı) açığına yol açıyordu.
  // Fix: paket ÜRÜNÜ codex-api ise slug'ı oluşturmada yaz → paket zaten test-edilmiş codex KAYAN-24s yolunu kullanır.
  // Subquery yalnız cf_api_slug='codex-api' paketlerde slug döndürür; NON-CODEX (CF glm/composer, düz paket)
  // için NULL döner = eski davranış BİREBİR korunur (CF slug'ı provisioning'de set edilmeye devam eder).
  const ins = await txSql<{ id: string }[]>`
    INSERT INTO user_package_entitlements
      (user_id, package_id, daily_limit_snapshot, allowed_models_snapshot,
       activated_at, expires_at, status, requests_today, last_reset_date, purchase_transaction_id, cf_api_slug)
    VALUES
      (${params.userId}::uuid, ${params.packageId}, ${params.gunlukIstekLimiti}::int, ${allowedJson}::jsonb,
       now(), now() + (${params.sureGun}::int * interval '1 day'), 'active', 0, CURRENT_DATE, ${txId}::uuid,
       (SELECT cf_api_slug FROM packages WHERE id = ${params.packageId} AND cf_api_slug = 'codex-api'))
    RETURNING id
  `;
  return { entitlementId: ins[0].id, extended: false };
}

export interface ActiveEntitlement {
  id: string;
  packageId: string;
  paketAdi: string;
  kategori: string;
  gunlukLimit: number;
  kalanBugun: number;
  kullanilanBugun: number;
  activatedAt: string;
  expiresAt: string;
  allowedModels: string[];
  maxContextTokens?: number;
  /** CF-arkalı pakette CF'nin gerçek kalan ünitesi (mirror); CF dışı pakette null. */
  cfRemaining?: number | null;
}

/**
 * Panel/admin "kullanılan" gösterimi (SALT-GÖSTERİM; kapı/billing/cf_remaining'e DOKUNMAZ).
 * CF paketinde tüketim normalde CF mirror'ından (cf_units_ordered − cf_remaining) okunur; ama CF
 * `x-codefast-remaining` header'ını her cevapta dönmediğinde mirror seed değerinde (=cf_units_ordered)
 * DONAR → tüketim 0 görünür ("kullanilan:0" / paket dolu sanılır) hâlbuki müşteri yüzlerce istek atmıştır.
 * Düzeltme: gerçek başarılı istek sayısıyla (usedSuccess) hizala — tüketim = max(CF-bazlı, başarılı istek),
 * limite kırpılır. Asla "kullanılmamış" göstermez. Kapı bağımsızdır (cf_remaining okur) → bu hesap onu etkilemez.
 */
export function computeDisplayConsumed(
  limit: number,
  cfUnitsOrdered: number,
  cfRemaining: number | null,
  requestsToday: number,
  usedCfUnits: number,
  devreden = false,
): number {
  // Devreden (günlük rollover) paket: tüketim GÜNLÜK sayaçtır (requests_today), ÖMÜRLÜK CF mirror'ı DEĞİL.
  // Gate günlük tavanı (daily_quota + rollover) requests_today ile kapatır → gösterim de requests_today olmalı.
  if (devreden) return requestsToday;
  if (!(cfUnitsOrdered > 0)) return requestsToday; // CF dışı paket: günlük sayaç (eski davranış)
  const cfConsumed = Math.max(0, cfUnitsOrdered - (cfRemaining == null ? cfUnitsOrdered : cfRemaining));
  // usedCfUnits = başarılı istek × model-çarpanı = CF'nin GERÇEK saydığı tüketim (istek-sayısı DEĞİL).
  // Çarpan İÇERİDE; gösterimde asla görünmez. max ile: CF-aynası gecikse/anomali olsa bile asla
  // "kullanılmamış" göstermez VE asla fazla göstermez (over-serve = para kaybı koruması).
  const used = Number.isFinite(usedCfUnits) ? usedCfUnits : 0;
  return Math.min(limit, Math.max(cfConsumed, used));
}

export async function listUserEntitlements(userId: string): Promise<ActiveEntitlement[]> {
  const rows = await dbSql<any[]>`
    SELECT e.id, e.package_id, p.ad AS paket_adi, p.kategori,
            e.daily_limit_snapshot,
            CASE WHEN p.lifetime_no_reset THEN e.requests_today
                 WHEN e.cf_api_slug = 'codex-api' OR e.daily_quota IS NOT NULL
                   THEN (CASE WHEN e.day_window_start IS NULL
                                OR e.day_window_start < win.current_window_start
                              THEN 0 ELSE e.requests_today END)
                 WHEN e.last_reset_date < CURRENT_DATE THEN 0 ELSE e.requests_today END AS requests_today,
            e.cf_remaining, e.cf_units_ordered, e.cf_api_slug, COALESCE(uc.used_success, 0) AS used_success,
            e.activated_at, e.expires_at, e.allowed_models_snapshot, p.max_context_tokens,
            (e.daily_quota IS NOT NULL) AS is_devreden,
            e.daily_quota,
            CASE
              WHEN e.daily_quota IS NOT NULL
                   AND (e.day_window_start IS NULL OR e.day_window_start < win.current_window_start)
              THEN e.rollover_balance
                   + GREATEST(0, (FLOOR(GREATEST(0, e.daily_quota - e.requests_today)::numeric / 50) * 50)::int)
                   + (GREATEST(0, floor(extract(epoch FROM (win.current_window_start - COALESCE(e.day_window_start, e.activated_at))) / 86400)::int - 1) * COALESCE(e.daily_quota, 0))
              ELSE e.rollover_balance
            END AS rollover_balance
     FROM user_package_entitlements e
     JOIN packages p ON p.id = e.package_id
     CROSS JOIN LATERAL (
       SELECT (e.activated_at + (floor(extract(epoch FROM (now() - e.activated_at)) / 86400)::int * interval '1 day')) AS current_window_start
     ) win
     LEFT JOIN (
       SELECT entitlement_id, count(*) AS used_success
       FROM usage_records
      WHERE user_id = ${userId}::uuid AND status = 'success' AND entitlement_id IS NOT NULL
      GROUP BY entitlement_id
    ) uc ON uc.entitlement_id = e.id
    WHERE e.user_id = ${userId}::uuid AND e.status = 'active' AND e.expires_at > now()
    ORDER BY e.expires_at ASC
  `;
  return rows.map((r) => {
    // CF lazy: "kalan" = limit − tüketim. Tüketim = ham başarılı istek sayısı (1 istek = 1);
    // müşteri panelde gördüğü "kalan" ile Aktivite'deki istek sayısı BİREBİR tutsun (çarpan YOK).
    const cfLazy = Number(r.cf_units_ordered) > 0;
    const cfRem = r.cf_remaining == null ? null : Number(r.cf_remaining);
    const isDevreden = r.is_devreden === true;
    const limit = isDevreden
      ? Number(r.daily_quota) + Math.max(0, Number(r.rollover_balance) || 0)
      : Number(r.daily_limit_snapshot);
    let kalan: number;
    let used: number;
    if (isDevreden) {
      used = Math.max(0, Number(r.requests_today) || 0);
      kalan = Math.max(0, limit - used);
    } else if (env.CF_UNIFIED_COUNTER_ENABLED && cfLazy && r.cf_api_slug === "codex-api") {
      // TEK SAYAÇ codex: günlük sayaç (gate ile birebir)
      const reserved = Math.max(0, Number(r.requests_today) || 0);
      const observed = Math.max(0, Number(r.used_success) || 0);
      const cfConsumedMirror = cfRem == null ? 0 : Math.max(0, Number(r.cf_units_ordered) - Math.max(0, cfRem));
      const consumed = Math.min(limit, Math.max(reserved, observed, cfConsumedMirror));
      kalan = reserved >= limit ? Math.max(0, limit - consumed) : Math.max(1, limit - consumed);
      used = Math.max(0, limit - kalan);
    } else if (env.CF_UNIFIED_COUNTER_ENABLED && cfLazy) {
      // TEK SAYAÇ non-codex CF: CF mirror otoriterdir; mirror yoksa/bayatsa başarılı usage fallback'i
      // panelin "kullanılmadı" yalanı üretmesini engeller.
      const cfConsumedMirror = cfRem == null ? 0 : Math.max(0, Number(r.cf_units_ordered) - Math.max(0, cfRem));
      const consumed = Math.min(limit, Math.max(cfConsumedMirror, Number(r.used_success) || 0));
      const cfExhausted = cfRem != null && cfRem <= 0;
      kalan = cfExhausted ? 0 : Math.max(1, limit - consumed);
      used = Math.max(0, limit - kalan);
    } else {
      const consumed = computeDisplayConsumed(
        limit, Number(r.cf_units_ordered), cfRem, Number(r.requests_today), Number(r.used_success),
      );
      kalan = Math.max(0, limit - consumed);
      used = consumed;
    }
    return {
      id: r.id,
      packageId: r.package_id,
      paketAdi: r.paket_adi,
      kategori: r.kategori,
      gunlukLimit: limit,
      kullanilanBugun: used,
      kalanBugun: kalan,
      activatedAt: r.activated_at,
      expiresAt: r.expires_at,
      allowedModels: r.allowed_models_snapshot ?? [],
      maxContextTokens: r.max_context_tokens ?? undefined,
      cfRemaining: cfLazy ? kalan : null,
    };
  });
}

// ── "Paketlerim" müşteri paneli: tüm paketler (aktif + duraklatılmış + geçmiş) ─────────────
export interface PanelEntitlement {
  id: string;
  paketAdi: string;
  kategori: string;
  gunlukLimit: number;
  kalan: number;
  kullanilan: number;
  paused: boolean;
  /** aktif | duraklatildi | gunluk_doldu | tukendi | suresi_doldu | <ham status> */
  durum: string;
  activatedAt: string;
  expiresAt: string;
  /** "Paketimi Yenile" gösterilsin mi: istek-limitli + tek-seferlik olmayan paketler. */
  renewable: boolean;
  /** Kota günlük sıfırlanıyor mu? CF paketleri günlük SIFIRLANMAZ (toplam kota, bitişe kadar geçerli);
   *  yalnız CF-dışı istek-limitli paketlerde günlük reset (00:00 UTC = 03:00 TSİ) gerçek anlam taşır. */
  dailyReset: boolean;
  // ── Devreden (günlük rollover) paketlere özel, gate-tutarlı alanlar (SALT-GÖSTERİM) ──
  /** Bu satır devreden (günlük rollover) paket mi? (entitlement'ta daily_quota IS NOT NULL). */
  devreden?: boolean;
  /** Bugün kullanılabilir = daily_quota + rollover_balance (devreden günlük tavan). */
  bugunKullanilabilir?: number;
  /** Bugün kullanılan = requests_today (gün dönmüşse 0). */
  bugunKullanilan?: number;
  /** Devir bakiyesi = rollover_balance (önceki günlerden taşınan). */
  devirBakiyesi?: number;
  /** Saatlik istek limiti (set'li değilse null). */
  saatlikLimit?: number | null;
  /** Mevcut saat penceresindeki kullanım (pencere geçmişse 0). */
  saatlikKullanilan?: number;
}

/**
 * Müşterinin TÜM paketleri (aktif + bitmiş/süresi dolmuş geçmiş) — Paketlerim sekmesi.
 * Sağlayıcı/CF slug/cipher/maliyet SIZMAZ (sadece ad/kategori/kalan/limit/durum/tarih/paused).
 */
export async function listUserPackagesForPanel(userId: string): Promise<PanelEntitlement[]> {
  const rows = await dbSql<any[]>`
    SELECT e.id, p.ad AS paket_adi, p.kategori, e.daily_limit_snapshot, e.paused,
           CASE WHEN p.lifetime_no_reset THEN e.requests_today
                WHEN e.cf_api_slug = 'codex-api' OR e.daily_quota IS NOT NULL
                  THEN (CASE WHEN e.day_window_start IS NULL
                               OR e.day_window_start < (e.activated_at + (floor(extract(epoch FROM (now() - e.activated_at)) / 86400)::int * interval '1 day'))
                             THEN 0 ELSE e.requests_today END)
                WHEN e.last_reset_date < CURRENT_DATE THEN 0 ELSE e.requests_today END AS requests_today,
            e.cf_remaining, e.cf_units_ordered, e.cf_api_slug, COALESCE(uc.used_success, 0) AS used_success,
            e.activated_at, e.expires_at, e.status,
            (e.expires_at <= now()) AS expired, p.tip, p.per_user_once, p.lifetime_no_reset,
            -- Devreden (günlük rollover) alanları — devreden = (daily_quota IS NOT NULL), gate ile aynı sinyal.
            (e.daily_quota IS NOT NULL) AS is_devreden,
            e.daily_quota,
            CASE
              WHEN e.daily_quota IS NOT NULL
                   AND (e.day_window_start IS NULL OR e.day_window_start < win.current_window_start)
              THEN e.rollover_balance
                   + GREATEST(0, (FLOOR(GREATEST(0, e.daily_quota - e.requests_today)::numeric / 50) * 50)::int)
                   + (GREATEST(0, floor(extract(epoch FROM (win.current_window_start - COALESCE(e.day_window_start, e.activated_at))) / 86400)::int - 1) * COALESCE(e.daily_quota, 0))
              ELSE e.rollover_balance
            END AS rollover_balance,
            e.saatlik_limit,
           -- Saatlik sayaç gösterimi: gate ile aynı pencere semantiği (date_trunc('hour', now())).
           -- Pencere önceki saatteyse (veya hiç yoksa) sayaç gösterimde 0 (yeni saatte sıfırlanacak).
           CASE WHEN e.hour_window_start IS NULL OR e.hour_window_start < date_trunc('hour', now())
                THEN 0 ELSE e.requests_this_hour END AS requests_this_hour
    FROM user_package_entitlements e
    JOIN packages p ON p.id = e.package_id
    CROSS JOIN LATERAL (
      SELECT (e.activated_at + (floor(extract(epoch FROM (now() - e.activated_at)) / 86400)::int * interval '1 day')) AS current_window_start
    ) win
    LEFT JOIN (
      SELECT entitlement_id, count(*) AS used_success
      FROM usage_records
      WHERE user_id = ${userId}::uuid AND status = 'success' AND entitlement_id IS NOT NULL
      GROUP BY entitlement_id
    ) uc ON uc.entitlement_id = e.id
    WHERE e.user_id = ${userId}::uuid
    ORDER BY (e.status = 'active' AND e.expires_at > now()) DESC, e.activated_at DESC
    LIMIT 100
  `;
  return rows.map((r) => {
    const limit = Number(r.daily_limit_snapshot);
    const cfOrdered = Number(r.cf_units_ordered);
    const cfLazy = cfOrdered > 0;
    const cfRem = r.cf_remaining == null ? null : Number(r.cf_remaining);
    const expired = r.expired === true;
    const paused = r.paused === true;
    const isDevreden = r.is_devreden === true;
    const isLifetime = r.lifetime_no_reset === true; // "Yeni Üye" düz/ömürlük paket (gece reset YOK).
    // TEK SAYAÇ: codex-api (seat-primary) paketinin sayacı requests_today'dir (günlük), cf_remaining DEĞİL.
    const isCodexUnified = env.CF_UNIFIED_COUNTER_ENABLED && r.cf_api_slug === "codex-api" && !isDevreden;

    // ── Devreden (günlük rollover) paket: gate-tutarlı GÜNLÜK gösterim ───────────────
    // CF-arkalı olsa da (cf_units_ordered>0), gerçek günlük tavan daily_quota + rollover_balance'dır
    // (daily_limit_snapshot = ÖMÜRLÜK CF cap, günlük DEĞİL). Tüketim = requests_today (gün-reset
    // gösterimde SELECT'te uygulandı). Saatlik sayaç ayrı pencere semantiğiyle (SELECT'te). CF
    // mirror/over-report SIZMAZ — yalnız daily_quota/rollover/saatlik kullanılır.
    if (isDevreden) {
      const dailyQuota = Number(r.daily_quota);
      const rollover = Math.max(0, Number(r.rollover_balance) || 0);
      const bugunKullanilabilir = dailyQuota + rollover;
      const bugunKullanilan = Math.max(0, Number(r.requests_today) || 0);
      const saatlikLimit = r.saatlik_limit == null ? null : Number(r.saatlik_limit);
      const saatlikKullanilan = Math.max(0, Number(r.requests_this_hour) || 0);
      const kalanDev = Math.max(0, bugunKullanilabilir - bugunKullanilan);

      let durum: string;
      if (r.status !== "active") durum = r.status;
      else if (expired) durum = "suresi_doldu";
      else if (paused) durum = "duraklatildi";
      else if (kalanDev <= 0) durum = "gunluk_doldu";
      else durum = "aktif";
      return {
        id: r.id,
        paketAdi: r.paket_adi,
        kategori: r.kategori,
        gunlukLimit: bugunKullanilabilir, // devreden: günlük tavan = quota + devir
        kalan: kalanDev,
        kullanilan: bugunKullanilan,
        paused,
        durum,
        activatedAt: r.activated_at,
        expiresAt: r.expires_at,
        renewable: r.tip === "request_limit" && r.per_user_once !== true,
        dailyReset: true, // devreden paket GÜNLÜK resetlenir (rollover ile birikir)
        // ── Devredene özel alanlar (gate-tutarlı) ──
        devreden: true,
        bugunKullanilabilir,
        bugunKullanilan,
        devirBakiyesi: rollover,
        saatlikLimit,
        saatlikKullanilan,
      };
    }

    // ── "kalan" + tükeniş ──────────────────────────────────────────────
    // CF paketi: gate cf_remaining'e göre servis verir; YENİ ünite sipariş etme headroom'u
    // (cf_units_ordered < daily_limit_snapshot=cap) varsa da servis sürer. Bu yüzden müşteri-yönü
    // "kalan" = sipariş-edilmemiş headroom + mevcut CF havuzu (cap'e kırpılı). Görünüm-cap'li `consumed`
    // (used_success tabanı) CF over-report'ta paketi YANLIŞLIKLA "Bitti" gösteriyordu hâlbuki CF'de
    // ünite vardı + gate izin veriyordu. Tükeniş = gate ile birebir: cf_remaining<=0 VE cap'e ulaşılmış.
    let kalan: number;
    let cfExhausted = false;
    if (cfLazy && isCodexUnified) {
      // TEK SAYAÇ codex (seat-primary, DAILY): kalan = limit − requests_today (gate ile BİREBİR). cf_remaining
      // codex'te yalnız CF_FIRST drain göstergesi; gate/gösterim DEĞİL → seat bedava servisi yanlış durdurulmaz.
      const reserved = Math.max(0, Number(r.requests_today) || 0);
      const observed = Math.max(0, Number(r.used_success) || 0);
      const cfConsumedMirror = cfRem == null ? 0 : Math.max(0, cfOrdered - Math.max(0, cfRem));
      const consumed = Math.min(limit, Math.max(reserved, observed, cfConsumedMirror));
      cfExhausted = reserved >= limit;
      kalan = cfExhausted ? Math.max(0, limit - consumed) : Math.max(1, limit - consumed);
    } else if (cfLazy && env.CF_UNIFIED_COUNTER_ENABLED) {
      // TEK SAYAÇ non-codex CF: CF mirror otoriterdir; mirror yoksa/bayatsa başarılı usage fallback'i
      // panelin "kullanılmadı" yalanı üretmesini engeller.
      const cfConsumedMirror = cfRem == null ? 0 : Math.max(0, cfOrdered - Math.max(0, cfRem));
      const consumed = Math.min(limit, Math.max(cfConsumedMirror, Number(r.used_success) || 0));
      cfExhausted = cfRem != null && cfRem <= 0;
      kalan = cfExhausted ? 0 : Math.max(1, limit - consumed);
    } else if (cfLazy) {
      // FLAG KAPALI (mevcut davranış): max(CF-aynası, ham başarılı istek), 1=1.
      const cfUnite = Number(r.used_success);
      const cfConsumedMirror = cfRem == null ? 0 : Math.max(0, cfOrdered - Math.max(0, cfRem));
      const consumed = Math.min(limit, Math.max(cfConsumedMirror, cfUnite));
      cfExhausted = cfRem != null && cfRem <= 0 && cfOrdered >= limit;
      kalan = cfExhausted ? 0 : Math.max(1, limit - consumed); // gate servis ediyorsa ≥1 (boş bar + "aktif" çelişkisi olmasın)
    } else {
      const consumed = computeDisplayConsumed(
        limit, cfOrdered, cfRem, Number(r.requests_today), Number(r.used_success),
      );
      kalan = Math.max(0, limit - consumed);
    }

    let durum: string;
    if (r.status !== "active") durum = r.status;
    else if (expired) durum = "suresi_doldu";
    else if (paused) durum = "duraklatildi";
    // codex-api KAYAN 24s: pencere dolunca "günlük doldu" (aktif kalır, sonraki 24s penceresinde yenilenir) —
    // "tukendi" DEĞİL (o paketi geçmişe/"Bitti"ye atardı). Non-codex CF tükenişi "tukendi" kalır.
    // "Yeni Üye" lifetime paketi tükenince KALICI "tukendi" (gece yenilenmez); diğer mantık değişmez.
    else if (cfLazy ? cfExhausted : kalan <= 0) durum = ((cfLazy && !isCodexUnified) || isLifetime) ? "tukendi" : "gunluk_doldu";
    else durum = "aktif";
    return {
      id: r.id,
      paketAdi: r.paket_adi,
      kategori: r.kategori,
      gunlukLimit: limit,
      kalan,
      kullanilan: Math.max(0, limit - kalan),
      paused,
      durum,
      activatedAt: r.activated_at,
      expiresAt: r.expires_at,
      renewable: r.tip === "request_limit" && r.per_user_once !== true,
      // CF paketi günlük yenilenmez (toplam kota, bitişe kadar); CF-dışı istek-limitli paket günlük resetlenir.
      // codex-api: KAYAN 24s ile her gün yenilenir → dailyReset=true. "Yeni Üye" lifetime: ASLA resetlenmez.
      dailyReset: isLifetime ? false : (isCodexUnified ? true : (!cfLazy && r.tip === "request_limit")),
    };
  });
}

/** Müşteri paketini duraklat/devam ettir (sahiplik kontrollü). Var olmayan/başkasının → false. */
export async function setEntitlementPaused(userId: string, entitlementId: string, paused: boolean): Promise<boolean> {
  // RESUME (paused → false): accrual tabanını sıfırla ki paused günler devir biriktirmesin.
  // rollover_balance KORUNUR; yalnız günlük/saatlik sayaç ve pencere başlangıçları sıfırlanır.
  // ⚠️ "Yeni Üye" lifetime paketi (p.lifetime_no_reset) İSTİSNA: resume'da requests_today SIFIRLANMAZ —
  // yoksa pause→resume ile 30 kota yeniden dolardı (suistimal). Sayaç + pencereler olduğu gibi korunur.
  const reset = !paused; // yalnız resume'da (lifetime DEĞİLSE) sayaçları sıfırla
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements AS e
    SET paused = ${paused},
        last_reset_date    = CASE WHEN ${reset} AND NOT p.lifetime_no_reset THEN CURRENT_DATE ELSE e.last_reset_date END,
        requests_today     = CASE WHEN ${reset} AND NOT p.lifetime_no_reset THEN 0 ELSE e.requests_today END,
        hour_window_start  = CASE WHEN ${reset} AND NOT p.lifetime_no_reset THEN now() ELSE e.hour_window_start END,
        requests_this_hour = CASE WHEN ${reset} AND NOT p.lifetime_no_reset THEN 0 ELSE e.requests_this_hour END,
        updated_at = now()
    FROM packages p
    WHERE p.id = e.package_id AND e.id = ${entitlementId}::uuid AND e.user_id = ${userId}::uuid
    RETURNING e.id
  `;
  return rows.length > 0;
}

/**
 * Müşteri kendi paketini KALICI iptal eder (sahiplik kontrollü, terminal, idempotent).
 * Yalnız DB status='active' satır iptal edilir — bu küme aktif/duraklatılmış/günlük-dolu/
 * tükenmiş (Bitti) paketlerin HEPSİNİ kapsar (hepsi DB'de status='active'). Zaten iptal/
 * expired/revoked olan → 0 satır → false (route 404). Çift-tık → 2. çağrı 0 satır → güvenli.
 * Para hareketi YOK, CF/upstream çağrısı YOK — yalnız status'u 'cancelled' yapar.
 * Gate (checkPackageCoverage/tryReservePackageSlot) status='active' filtreler → iptal edilen
 * paket anında servis vermez; listUserPackagesForPanel onu "İptal edildi" geçmişinde gösterir.
 */
export async function cancelEntitlement(userId: string, entitlementId: string): Promise<boolean> {
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements SET status = 'cancelled', updated_at = now()
    WHERE id = ${entitlementId}::uuid AND user_id = ${userId}::uuid AND status = 'active'
    RETURNING id
  `;
  return rows.length > 0;
}

/** "Kullandığın kadar öde" modunu aç/kapat (per-kullanıcı). */
export async function setUserPaygMode(userId: string, on: boolean): Promise<void> {
  await dbSql`UPDATE users SET payg_mode = ${on}, updated_at = now() WHERE id = ${userId}::uuid`;
}

export interface PurchaseHistoryItem {
  /** YZK-YYMMDD-XXXX; backfill öncesi eski alımlarda null. */
  ref: string | null;
  packageId: string | null;
  /** packages.ad çözülürse o, yoksa aciklama'daki "Paket: <ad>" metni. */
  paketAdi: string;
  tutarTL: number;
  tarih: string;
}

/**
 * Müşterinin paket satın alma geçmişi (ödeme olayları). Kota/entitlement'tan
 * BAĞIMSIZ; transactions'tan okunur. Sağlayıcı/maliyet sızmaz.
 */
export async function listUserPurchaseHistory(userId: string): Promise<PurchaseHistoryItem[]> {
  const rows = await dbSql<any[]>`
    SELECT t.purchase_ref, t.package_id, t.miktar_tl, t.timestamp, t.aciklama, p.ad AS paket_adi
    FROM transactions t
    LEFT JOIN packages p ON p.id = t.package_id
    WHERE t.user_id = ${userId}::uuid AND t.tip = 'paket_satin_alma'
    ORDER BY t.timestamp DESC
    LIMIT 200
  `;
  return rows.map((r) => ({
    ref: r.purchase_ref ?? null,
    packageId: r.package_id ?? null,
    paketAdi: r.paket_adi ?? (String(r.aciklama || "").replace(/^Paket:\s*/, "").trim() || "Paket"),
    tutarTL: Math.abs(Number(r.miktar_tl) || 0),
    tarih: r.timestamp,
  }));
}
