// scripts/backfill-purchase-refs.ts
/**
 * Tek seferlik: tüm geçmiş paket_satin_alma satırlarına purchase_ref üret + package_id best-effort doldur.
 * purchase_ref DAİMA üretilir; package_id çözülemezse NULL bırakılır (panel aciklama'ya düşer).
 * Idempotent: yalnız purchase_ref IS NULL satırlarını işler; tekrar çalıştırılabilir.
 *
 * Çalıştırma (SUNUCUDA — NODE_ENV ŞART):
 *   NODE_ENV=production npx tsx scripts/backfill-purchase-refs.ts --dry-run   # sadece sayım
 *   NODE_ENV=production npx tsx scripts/backfill-purchase-refs.ts             # uygula
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { dbSql } from "../src/server/db/client.js";
import { formatPurchaseRef, randomCode } from "../src/server/services/purchase-ref.js";

const DRY = process.argv.includes("--dry-run");

async function uniqueRef(date: Date, seen: Set<string>): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const ref = formatPurchaseRef(date, randomCode(4));
    if (seen.has(ref)) continue;
    const hit = await dbSql`SELECT 1 FROM transactions WHERE purchase_ref = ${ref} LIMIT 1`;
    if ((hit as unknown[]).length === 0) { seen.add(ref); return ref; }
  }
  throw new Error("backfill: benzersiz ref üretilemedi");
}

async function main() {
  const rows = await dbSql<{ id: string; ts: string; aciklama: string }[]>`
    SELECT id, timestamp AS ts, aciklama
    FROM transactions
    WHERE tip = 'paket_satin_alma' AND purchase_ref IS NULL
    ORDER BY timestamp ASC
  `;
  console.log(`${rows.length} satır işlenecek${DRY ? " (DRY-RUN — yazılmayacak)" : ""}.`);
  if (DRY || rows.length === 0) { process.exit(0); }

  const seen = new Set<string>();
  let done = 0;
  for (const r of rows) {
    const ref = await uniqueRef(new Date(r.ts), seen);
    // package_id best-effort: 1) entitlement.purchase_transaction_id → package_id, 2) aciklama "Paket: <ad>" → packages.ad
    const byEnt = await dbSql<{ package_id: string }[]>`
      SELECT package_id FROM user_package_entitlements WHERE purchase_transaction_id = ${r.id}::uuid LIMIT 1
    `;
    let pkgId: string | null = byEnt[0]?.package_id ?? null;
    if (!pkgId) {
      const ad = String(r.aciklama || "").replace(/^Paket:\s*/, "").trim();
      if (ad) {
        const byName = await dbSql<{ id: string }[]>`SELECT id FROM packages WHERE ad = ${ad} LIMIT 1`;
        pkgId = byName[0]?.id ?? null;
      }
    }
    await dbSql`UPDATE transactions SET purchase_ref = ${ref}, package_id = COALESCE(package_id, ${pkgId}) WHERE id = ${r.id}::uuid`;
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${rows.length}`);
  }
  console.log(`Bitti: ${done} satıra ref atandı.`);
  process.exit(0);
}
main().catch((e) => { console.error("backfill FAILED:", e); process.exit(1); });
