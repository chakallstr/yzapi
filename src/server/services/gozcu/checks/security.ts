// Gözcü — güvenlik & suistimal domeni.

import { dbSql } from "../../../db/client.js";
import { windowSnapshot } from "../metrics-collector.js";
import type { GozcuCheckResult, Severity } from "../types.js";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// auth_failure_spike — collector 401 (5dk yerine 15dk pencere; tek IP yoğunluğu da bakılır).
function checkAuthFailureSpike(): GozcuCheckResult {
  const w = windowSnapshot();
  let severity: Severity = "green";
  if (w.auth401 > 100 || w.maxIpFail > 50) severity = "red";
  else if (w.auth401 >= 20) severity = "yellow";
  return {
    name: "auth_failure_spike",
    domain: "security",
    signalSource: "collector(401, 15dk)",
    measured: `${w.auth401} toplam · max tek-IP ${w.maxIpFail}${w.ipCapExceeded ? " · ⚠️ IP izleme doldu (dağıtık?)" : ""}`,
    threshold: "<20 🟢 · 20–100 🟡 · >100 veya tek-IP>50 🔴",
    severity,
    immediate: severity === "red",
  };
}

// rate_limit_hit_spike — collector 429.
function checkRateLimitSpike(): GozcuCheckResult {
  const w = windowSnapshot();
  let severity: Severity = "green";
  if (w.rate429 > 500) severity = "red";
  else if (w.rate429 >= 50) severity = "yellow";
  return {
    name: "rate_limit_hit_spike",
    domain: "security",
    signalSource: "collector(429, 15dk)",
    measured: `${w.rate429} adet`,
    threshold: "<50 🟢 · 50–500 🟡 · >500 🔴",
    severity,
  };
}

// shopier_dead_letter_buildup — para tahsil edildi ama kredilenemedi birikimi.
async function checkShopierDeadLetters(): Promise<GozcuCheckResult> {
  const rows = await dbSql<{ bekleyen: string; en_eski_saat: string | null }[]>`
    SELECT count(*)::text AS bekleyen,
      (EXTRACT(EPOCH FROM (now() - min(olusturma))) / 3600)::text AS en_eski_saat
    FROM shopier_osb_dead_letters WHERE durum='bekliyor'
  `;
  const bekleyen = num(rows[0]?.bekleyen);
  const enEskiSaat = num(rows[0]?.en_eski_saat);
  let severity: Severity = "green";
  if (bekleyen > 5 || enEskiSaat > 24) severity = "red";
  else if (bekleyen >= 1) severity = "yellow";
  return {
    name: "shopier_dead_letter_buildup",
    domain: "security",
    signalSource: "shopier_osb_dead_letters(durum='bekliyor')",
    measured: `${bekleyen} bekleyen${bekleyen ? ` · en eski ${enEskiSaat.toFixed(1)}sa` : ""}`,
    threshold: "0 🟢 · ≤5 & <24sa 🟡 · >5 veya >24sa 🔴",
    severity,
    suggestedHeal:
      bekleyen > 0
        ? { id: "credit_osb_dead_letter", reason: "exact-match dead-letter'lar otomatik kredilenebilir", reversible: false }
        : undefined,
  };
}

// pending_iban_buildup — onay bekleyen IBAN ödemeleri birikimi.
async function checkPendingIban(): Promise<GozcuCheckResult> {
  const rows = await dbSql<{ bekleyen: string; en_eski_saat: string | null }[]>`
    SELECT count(*)::text AS bekleyen,
      (EXTRACT(EPOCH FROM (now() - min(olusturma))) / 3600)::text AS en_eski_saat
    FROM pending_iban_payments WHERE durum='bekliyor'
  `;
  const bekleyen = num(rows[0]?.bekleyen);
  const enEskiSaat = num(rows[0]?.en_eski_saat);
  let severity: Severity = "green";
  if (bekleyen > 25 || enEskiSaat > 72) severity = "red";
  else if (bekleyen >= 10 || enEskiSaat > 48) severity = "yellow";
  return {
    name: "pending_iban_buildup",
    domain: "security",
    signalSource: "pending_iban_payments(durum='bekliyor')",
    measured: `${bekleyen} bekleyen${bekleyen ? ` · en eski ${enEskiSaat.toFixed(1)}sa` : ""}`,
    threshold: "<10 & <48sa 🟢 · orta 🟡 · >25 veya >72sa 🔴",
    severity,
  };
}

// signup_bonus_abuse — aynı ip_hash'ten 24sa içinde >1 bonus grant'ı.
async function checkSignupBonusAbuse(): Promise<GozcuCheckResult> {
  const rows = await dbSql<{ ip_hash: string; c: string }[]>`
    SELECT ip_hash, count(*)::text AS c FROM signup_bonus_grants
    WHERE ip_hash <> '' AND created_at >= now() - interval '24 hours'
    GROUP BY ip_hash HAVING count(*) > 1
    ORDER BY count(*) DESC LIMIT 50
  `;
  let severity: Severity = "green";
  const enCok = rows.length ? num(rows[0].c) : 0;
  if (rows.length > 2 || enCok >= 4) severity = "red";
  else if (rows.length >= 1) severity = "yellow";
  return {
    name: "signup_bonus_abuse",
    domain: "security",
    signalSource: "signup_bonus_grants(ip_hash, 24sa)",
    measured: rows.length ? `${rows.length} IP çoklu bonus (max ${enCok})` : "tek-hesap kuralı korunuyor",
    threshold: "0 🟢 · 1–2 IP 🟡 · >2 IP veya tek-IP≥4 🔴",
    severity,
    evidence: rows.length ? rows.map((r) => ({ ipHash: r.ip_hash, count: num(r.c) })) : undefined,
  };
}

// telegram_delivery_failure_rate — başarısız API-key teslimatları (24sa).
async function checkTelegramDeliveryFailures(): Promise<GozcuCheckResult> {
  const rows = await dbSql<{ failed: string; total: string; maxatt: string }[]>`
    SELECT count(*) FILTER (WHERE status='failed')::text AS failed, count(*)::text AS total,
      COALESCE(max(attempt_count), 0)::text AS maxatt
    FROM telegram_deliveries WHERE created_at >= now() - interval '24 hours'
  `;
  const failed = num(rows[0]?.failed);
  const total = num(rows[0]?.total);
  const maxAtt = num(rows[0]?.maxatt);
  const rate = total > 0 ? failed / total : 0;
  let severity: Severity = "green";
  if (rate > 0.2 || maxAtt > 5) severity = "red";
  else if (rate >= 0.05) severity = "yellow";
  return {
    name: "telegram_delivery_failure_rate",
    domain: "security",
    signalSource: "telegram_deliveries.status (24sa)",
    measured: `%${(rate * 100).toFixed(1)} (${failed}/${total}) · maxDeneme ${maxAtt}`,
    threshold: "<%5 🟢 · %5–20 🟡 · >%20 veya deneme>5 🔴",
    severity,
  };
}

export async function runSecurityChecks(): Promise<GozcuCheckResult[]> {
  return [
    checkAuthFailureSpike(),
    checkRateLimitSpike(),
    await checkShopierDeadLetters(),
    await checkPendingIban(),
    await checkSignupBonusAbuse(),
    await checkTelegramDeliveryFailures(),
  ];
}
