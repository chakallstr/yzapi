// scripts/seat-only-unstick-codex.ts
//
// GÜVENLİ codex açma — CF ORDER YOK (katı kural: codex ASLA CF'den paket almaz).
// Takılı bir codex entitlement'ı (cf_status NULL/failed + anahtarsız → proxy gate 409
// "Paket teslim ediliyor") KOLTUK-SERVİSLİ son-duruma çevirir: cf_status='provisioned',
// cf_api_slug=NULL, cf_rc_key_cipher=NULL, cf_units_ordered=0. Bu, canlı provisioning'in
// seat-only dalının yazdığı durumun BİREBİR aynısı — ama cfCreateOrder'ı HİÇ çağırmaz,
// yani CF cüzdanından PARA ÇEKMEZ. Gate 585 `cfApiSlug && !cfChain` slug=NULL ile atlanır →
// istek sub-codex koltuğuna gider; günlük cap requests_today<daily_limit ile kapılar.
//
// ⚠️ Yalnız packages.cf_api_slug='codex-api' satırlarda çalışır. NON-codex CF paketi (glm/
// composer/görsel) koltuk fallback'i YOK → onlara DOKUNMAZ (CF gerçekten gerekir).
//
// Usage:
//   ENV_FILE_PATH=.env.production npx tsx scripts/seat-only-unstick-codex.ts <entitlementId> --apply
//
// Varsayılan DRY-RUN (yalnız gösterir, YAZMAZ). Yazmak için AÇIKÇA --apply gerekir.
// Para hareketi olmasa da bu bir ödeme-tablosu yazımı → tek tek, Ufuk onayıyla çalıştır.

import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

const [, , entId, ...flags] = process.argv;
const apply = flags.includes("--apply");
if (!entId) {
  console.error("usage: seat-only-unstick-codex.ts <entitlementId> --apply   (varsayılan dry-run)");
  process.exit(1);
}

const { dbSql } = await import("../src/server/db/client.js");

async function snapshot() {
  const rows = await dbSql<any[]>`
    SELECT e.id, u.email, e.status, e.cf_status, e.cf_api_slug AS ent_slug,
           (e.cf_rc_key_cipher IS NOT NULL) AS has_key, e.cf_units_ordered,
           e.expires_at, (e.expires_at IS NOT NULL AND e.expires_at < now()) AS expired,
           e.requests_today, e.daily_limit_snapshot AS cap, e.daily_quota,
           p.cf_api_slug AS pkg_slug, p.ad
    FROM user_package_entitlements e
    JOIN users u ON u.id = e.user_id
    JOIN packages p ON p.id = e.package_id
    WHERE e.id = ${entId}::uuid LIMIT 1`;
  return rows[0];
}

const before = await snapshot();
if (!before) { console.error("entitlement not found:", entId); process.exit(2); }
console.log("BEFORE:", JSON.stringify(before, null, 2));

const reasons: string[] = [];
if (before.pkg_slug !== "codex-api") reasons.push(`paket codex-api değil (pkg_slug=${before.pkg_slug}) — CF gerçekten gerekir, DOKUNMA`);
if (before.status !== "active") reasons.push(`status=${before.status} (aktif değil)`);
if (before.expired) reasons.push("entitlement süresi geçmiş");
if (before.has_key) reasons.push("zaten CF anahtarı var (CF-bağlı; CF_FIRST üniteyi tüketip koltuğa düşecek — dokunma)");
if (before.cf_status === "provisioned" && !before.ent_slug) reasons.push("zaten seat-only provisioned (slug=NULL) — açık");
if (reasons.length) {
  console.log("\nSKIP — seat-only flip koşulları sağlanmıyor:\n  - " + reasons.join("\n  - "));
  process.exit(0);
}

console.log(
  `\nWOULD seat-only flip (CF ORDER YOK, para hareketi YOK):\n` +
    `  cf_status ${before.cf_status ?? "NULL"} → 'provisioned'\n` +
    `  cf_api_slug ${before.ent_slug ?? "NULL"} → NULL\n` +
    `  cf_rc_key → NULL, cf_units_ordered → 0\n` +
    `  → gate 585 atlanır (slug=NULL) → sub-codex koltuğu servis eder; cap: requests_today(${before.requests_today}) < ${before.cap}`,
);

if (!apply) { console.log("\n[DRY-RUN] hiçbir yazma yapılmadı. Yazmak için --apply ekle (Ufuk onayıyla)."); process.exit(0); }

const upd = await dbSql`
  UPDATE user_package_entitlements
  SET cf_status = 'provisioned', cf_api_slug = NULL, cf_rc_key_cipher = NULL,
      cf_units_ordered = 0, updated_at = now()
  WHERE id = ${entId}::uuid
    AND status = 'active'
    AND cf_rc_key_cipher IS NULL
    AND (cf_status IS NULL OR cf_status IN ('failed','provisioning'))
    AND (SELECT cf_api_slug FROM packages p WHERE p.id = user_package_entitlements.package_id) = 'codex-api'
  RETURNING id`;
const after = await snapshot();
console.log("AFTER:", JSON.stringify(after, null, 2));
const ok = upd.length === 1 && after.cf_status === "provisioned" && !after.ent_slug && !after.has_key;
console.log(ok ? "\n✅ SEAT-ONLY OK — koltuktan servis; CF harcaması YOK; gate açık." : "\n⚠️ Değişim yok (guard tuttu ya da başka istek aldı).");
process.exit(ok ? 0 : 3);
