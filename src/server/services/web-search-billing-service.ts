// Web Search ücretlendirme — İZOLE sabit-ücret tahsil servisi.
//
// DOKUNULMAZ KORUMA: billing-service.ts reserve/settle/charge mantığı (K1/Y2) bu
// dosyada İMPORT EDİLMEZ ve DEĞİŞTİRİLMEZ. Web-search ücreti token bazlı DEĞİL;
// arama başına SABİT USD ücrettir → tamamen ayrı, basit, idempotent bir tahsil yolu.
//
// LEDGER GÜVENLİĞİ (drift=0):
//   • Tek transaction içinde: users.bakiye_tl -= ücret  +  transactions satırı (tip='kullanim')
//     +  usage_records satırı (type='web_search'). SUM(bakiye_tl)==SUM(miktar_tl) korunur.
//   • idempotency_key = 'usage_' || webSearchRequestId  → mali-izleme checkParaCikisi
//     (her success+cost için usage_<rid> tx şartı) sağlanır; çift tahsil DB unique ile engellenir.
//   • request_id = webSearchRequestId (UNIQUE) → aynı arama iki kez faturalanmaz.
//
// FİYAT: WEB_SEARCH_PRICE_USD (sabit, $0.001 — kullanıcı kararı). TL = USD × sellKur
//   (system_config.liveKur × (1+kurBuffer)) — chat ile AYNI kur. Upstream maliyeti $0;
//   bu ücret saf satış/marj. Müşteriye yalnız NİHAİ TL/USD ücret gösterilir.

import { db, dbSql } from "../db/client.js";
import { users, usageRecords, systemConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { InsufficientBalanceError } from "../lib/errors.js";

// Arama başına sabit satış ücreti (USD). Kullanıcı kararı 2026-06-01: $0.001.
export const WEB_SEARCH_PRICE_USD = 0.001;
export const WEB_SEARCH_MODEL_ID = "web-search";

export interface WebSearchChargeResult {
  costUsd: number;
  costTL: number;
  remainingTL: number;
  alreadyCharged: boolean;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
function round8(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}

// Aktif satış kuru: liveKur × (1 + kurBuffer) (pricing.ts toTL ile AYNI formül).
async function resolveSellKur(): Promise<number> {
  const rows = await db
    .select({ liveKur: systemConfig.liveKur, kurBuffer: systemConfig.kurBuffer })
    .from(systemConfig)
    .where(eq(systemConfig.id, 1))
    .limit(1);
  if (!rows.length) return 0;
  return Number(rows[0].liveKur) * (1 + Number(rows[0].kurBuffer));
}

// Daha önce bu arama faturalandı mı? (idempotency — request_id UNIQUE).
async function findExistingWebSearchCharge(webSearchRequestId: string): Promise<WebSearchChargeResult | null> {
  const rows = await db
    .select({ costUsd: usageRecords.costUsd, costTL: usageRecords.costTL, remainingTL: usageRecords.remainingTL })
    .from(usageRecords)
    .where(eq(usageRecords.requestId, webSearchRequestId))
    .limit(1);
  if (!rows.length) return null;
  return {
    costUsd: Number(rows[0].costUsd ?? 0),
    costTL: Number(rows[0].costTL ?? 0),
    remainingTL: Number(rows[0].remainingTL ?? 0),
    alreadyCharged: true,
  };
}

// Tek aramanın sabit ücretini atomik tahsil eder. status:
//   • "success"  → ücret kesilir (bakiye yetersizse InsufficientBalanceError).
//   • "no_charge" → ücretsiz kayıt (cost=0): arama sonuç döndürmedi / augment'te arama
//                   yapılmadı ama iz bırakılmak istenirse. (Auto-augment başarısız aramada
//                   ücret kesmez — müşteri bedava aramadan zaten etkilenmez.)
export async function chargeWebSearch(opts: {
  userId: string;
  apiKeyId: string;
  webSearchRequestId: string; // ör. "ws_<chat-rid>" veya standalone rid
  resultCount: number;
  responseMs: number;
  status: "success" | "no_charge";
  source: "standalone" | "auto_augment";
  query?: string;
}): Promise<WebSearchChargeResult> {
  const existing = await findExistingWebSearchCharge(opts.webSearchRequestId);
  if (existing) return existing;

  const sellKur = await resolveSellKur();
  const costUsd = opts.status === "success" ? round8(WEB_SEARCH_PRICE_USD) : 0;
  const costTL = opts.status === "success" ? round4(WEB_SEARCH_PRICE_USD * sellKur) : 0;
  const costUsdStr = costUsd.toFixed(8);
  const costTLStr = costTL.toFixed(4);

  // raw_usage_json: denetim izi (sorgu metni DEĞİL — gizlilik; yalnız sayaç/işaret).
  const rawUsage = { source: opts.source, resultCount: opts.resultCount, priceUsd: WEB_SEARCH_PRICE_USD };

  // Ücretsiz kayıt (cost=0): bakiye/tx YAZMA, yalnız usage_record (status'a göre).
  if (costTL <= 0) {
    const balRows = await db.select({ bakiye: users.bakiyeTL }).from(users).where(eq(users.id, opts.userId)).limit(1);
    const remainingTL = Number(balRows[0]?.bakiye ?? 0);
    await db.insert(usageRecords).values({
      userId: opts.userId,
      apiKeyId: opts.apiKeyId,
      modelId: WEB_SEARCH_MODEL_ID,
      type: "web_search",
      inputUsage: 0,
      outputUsage: opts.resultCount,
      costUsd: "0",
      costTL: "0",
      remainingTL: remainingTL.toFixed(4),
      requestId: opts.webSearchRequestId,
      rawUsageJson: rawUsage as any,
      responseMs: opts.responseMs,
      status: "success",
    }).catch((e) => logger.error({ err: e }, "[web-search-billing] no_charge usage insert failed"));
    return { costUsd: 0, costTL: 0, remainingTL, alreadyCharged: false };
  }

  let remainingTL = 0;
  const rows = await dbSql.begin(async (txSql) => {
    // Hizmet teslim edildi (arama yapıldı) → ücret bakiye guard'ıyla bloklanmaz?
    // Web-search'te hizmet ucuz ve standalone uçta önce balance>0 guard'ı var.
    // Yine de eksi bakiyeye düşürmemek için reserve mantığı gibi guard uygula:
    // standalone akış zaten balance>0 kontrol etti; burada atomik düş + tx.
    const updated = await txSql<{ bakiye_tl: string; email: string }[]>`
      UPDATE users
      SET bakiye_tl = bakiye_tl - ${costTLStr}::numeric,
          toplam_harcama_tl = toplam_harcama_tl + ${costTLStr}::numeric,
          toplam_istek = toplam_istek + 1,
          son_aktivite = now()
      WHERE id = ${opts.userId}::uuid
        AND bakiye_tl >= ${costTLStr}::numeric
      RETURNING bakiye_tl, email
    `;
    if (!updated.length) return updated;

    remainingTL = Number(updated[0].bakiye_tl);
    const previousBalance = remainingTL + costTL;

    await txSql`
      INSERT INTO transactions (
        user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, idempotency_key
      ) VALUES (
        ${opts.userId}::uuid,
        ${updated[0].email},
        'kullanim',
        ${`-${costTLStr}`}::numeric,
        ${previousBalance.toFixed(4)}::numeric,
        ${remainingTL.toFixed(4)}::numeric,
        ${"web-search kullanımı"},
        ${`usage_${opts.webSearchRequestId}`}
      )
    `;

    await txSql`
      INSERT INTO usage_records (
        user_id, api_key_id, model_id, type, input_usage, output_usage, units_usage,
        cost_usd, cost_tl, remaining_tl, request_id, raw_usage_json, response_ms, status
      ) VALUES (
        ${opts.userId}::uuid,
        ${opts.apiKeyId}::uuid,
        ${WEB_SEARCH_MODEL_ID},
        ${"web_search"},
        ${0},
        ${opts.resultCount},
        ${"1"}::numeric,
        ${costUsdStr}::numeric,
        ${costTLStr}::numeric,
        ${remainingTL.toFixed(4)}::numeric,
        ${opts.webSearchRequestId},
        ${JSON.stringify(rawUsage)}::jsonb,
        ${opts.responseMs},
        ${"success"}
      )
    `;
    return updated;
  });

  if (!rows.length) {
    throw new InsufficientBalanceError("Insufficient balance for web search");
  }

  logger.info({ userId: opts.userId, costTL, remainingTL, source: opts.source }, "web-search charged");
  return { costUsd, costTL, remainingTL, alreadyCharged: false };
}
