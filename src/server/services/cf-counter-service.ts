// TEK SAYAÇ (unified CF counter) — çekirdek. Plan: docs/superpowers/plans/2026-06-25-unified-cf-counter.md (§11/§12).
// İlke: cf_remaining tek kaynak (ondalık). CF servis→LEAST(mevcut,floor(CF)) ile DÜŞÜR (asla yükseltme,
// koltuk-tüketimini ezme). Koltuk servis (CF çağrılmadı)→ model-çarpanı kadar BİZ düş (yalnız non-codex CF).
// Gösterim: FLOOR(cf_remaining) = tam-sayı "kalan" (küsuratı gizler, tam-sayı adımlar). Çarpan müşteriye GÖRÜNMEZ.
// ⚠️ DB fonksiyonları cf_remaining'in NUMERIC olmasını gerektirir (Faz 0 migration); INERT — henüz çağrılmaz.
import { dbSql } from "../db/client.js";
import { cfModelUnitMultiplier } from "./cf-unit-multiplier.js";

/** Gösterim: ondalık cf_remaining → tam-sayı "kalan". Küsuratı gizler → müşteri hep tam sayı görür,
 *  sayaç tam-sayı adımlarla hareket eder (150.7→149.2 → FLOOR 150→149; 147.7 → 147 = bir adımda −2). */
export function displayRemaining(cfRemaining: number | null | undefined): number | null {
  if (cfRemaining == null || !Number.isFinite(cfRemaining)) return null;
  return Math.max(0, Math.floor(cfRemaining));
}

/** Koltuk düşümü (saf, test edilebilir): ondalıktan model-çarpanı kadar düş, 0 tabanı, 4-hane yuvarla. */
export function seatDecrement(cfRemaining: number, multiplier: number): number {
  if (!Number.isFinite(cfRemaining)) return cfRemaining;
  const m = Math.max(0, Number.isFinite(multiplier) ? multiplier : 0);
  return Math.max(0, Math.round((cfRemaining - m) * 10000) / 10000);
}

/** CF'nin verdiği kalanı, mevcuttan asla YÜKSELTMEDEN uygula (LEAST). Saf yardımcı. */
export function reconcileValue(current: number | null | undefined, cfRemaining: number): number {
  const floored = Math.floor(cfRemaining);
  if (current == null || !Number.isFinite(current)) return floored;
  return Math.min(current, floored);
}

/** Koltuk servisi (CF çağrılmadı) → sayacı BİZ düş. Müşteri-bazlı havuz, atomik tek-UPDATE (race-güvenli).
 *  ⚠️ YALNIZ non-codex CF: codex (seat-primary) paketinin sayacı requests_today'dir; cf_remaining gate değil. */
export async function applySeatDecrement(userId: string, modelId: string): Promise<void> {
  const mult = cfModelUnitMultiplier(modelId);
  if (!(mult > 0)) return;
  await dbSql`
    UPDATE user_package_entitlements
    SET cf_remaining = GREATEST(0, cf_remaining - ${mult}),
        cf_remaining_at = now(), updated_at = now()
    WHERE cf_customer_id = ${userId}
      AND status = 'active'
      AND cf_units_ordered > 0
      AND cf_api_slug IS DISTINCT FROM 'codex-api'
  `;
}

/** CF otoriter ama YÜKSELTEMEZ: cf_remaining = LEAST(mevcut, floor(CF)). Müşteri-bazlı havuz.
 *  source='error' → bbbnull kilit-fix freshness guard'ı korunur (2sn / eşit-yüksek). */
export async function reconcileToCf(
  userId: string,
  cfRemaining: number,
  source: "success" | "error" = "success",
): Promise<void> {
  if (!Number.isFinite(cfRemaining)) return;
  const floored = Math.floor(cfRemaining);
  if (source === "error") {
    await dbSql`
      UPDATE user_package_entitlements
      SET cf_remaining = LEAST(COALESCE(cf_remaining, ${floored}), ${floored}),
          cf_remaining_at = now(), updated_at = now()
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
    SET cf_remaining = LEAST(COALESCE(cf_remaining, ${floored}), ${floored}),
        cf_remaining_at = now(), updated_at = now()
    WHERE cf_customer_id = ${userId}
      AND status = 'active'
      AND cf_units_ordered > 0
  `;
}
