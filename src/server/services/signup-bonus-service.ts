// src/server/services/signup-bonus-service.ts
//
// Yeni üye deneme bonusu (varsayılan 10 TL), abuse korumalı.
//
// TASARIM (DOKUNULMAZ koruması):
// - billing-service.ts / payment-common ödeme kredileme yolu DEĞİŞTİRİLMEZ. Bonus,
//   ödeme akışından bağımsız, kendi atomik DB transaction'ında verilir.
// - DRIFT=0 GARANTİSİ: bonus, users.bakiye_tl'yi artırırken AYNI transaction'da
//   pozitif miktar_tl'li bir `transactions` satırı (tip='bonus') yazar. Böylece
//   SUM(users.bakiye_tl) == SUM(transactions.miktar_tl) korunur (reconciliation).
// - TEK SEFER (hesap başına): signup_bonus_grants.user_id PRIMARY KEY +
//   ON CONFLICT DO NOTHING → eşzamanlı çağrılarda bile yalnızca bir satır eklenir
//   (race-safe). transactions.idempotency_key = `bonus_signup_<userId>` unique de
//   ikinci bir güvenlik kemeridir.
//
// ABUSE KATMANLARI:
//   1. Hesap başına tam 1 kez (user_id PK).
//   2. Email unique (users tablosu) → aynı email ikinci hesap açamaz.
//   3. IP başına azami bonuslu hesap (system_config.signup_bonus_max_per_ip).
//   4. WhatsApp OTP açıkken telefon doğrulama gate'i çağıran tarafça uygulanır
//      (1 telefon = 1 bonus; phone_hash burada kayıt altına alınır).
//   5. Admin aç/kapa + tutar (system_config.signup_bonus_enabled / _tl).

import { createHmac } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { systemConfig, users, transactions, signupBonusGrants } from "../db/schema.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { writeAudit } from "./audit-service.js";

export type SignupBonusOutcome =
  | "granted"
  | "disabled"        // admin kapalı (signup_bonus_enabled=false) veya tutar <= 0
  | "already_granted" // bu kullanıcıya daha önce verilmiş
  | "ip_limit"        // aynı IP'den azami bonuslu hesap aşıldı
  | "error";

export interface SignupBonusResult {
  outcome: SignupBonusOutcome;
  amountTL?: number;
  transactionId?: string;
}

// IP/telefon gibi PII değerlerini ham saklamamak için stabil HMAC. Boş girdi
// boş hash üretir (anonim sinyal). JWT_SECRET tabanlı (mevcut desenle uyumlu).
export function hashSignal(value: string | undefined | null): string {
  if (!value) return "";
  const secret = env.WHATSAPP_OTP_HASH_SECRET || env.JWT_SECRET;
  return createHmac("sha256", secret).update(value).digest("hex");
}

interface BonusConfig {
  enabled: boolean;
  amountTL: number;
  maxPerIp: number;
}

async function readBonusConfig(): Promise<BonusConfig> {
  const rows = await db
    .select({
      enabled: systemConfig.signupBonusEnabled,
      amountTL: systemConfig.signupBonusTL,
      maxPerIp: systemConfig.signupBonusMaxPerIp,
    })
    .from(systemConfig)
    .where(eq(systemConfig.id, 1))
    .limit(1);
  const row = rows[0];
  return {
    enabled: row?.enabled === true,
    amountTL: Number(row?.amountTL ?? 0),
    maxPerIp: Number(row?.maxPerIp ?? 0),
  };
}

/**
 * Yeni üyeye deneme bonusunu uygun ise verir. Idempotent ve race-safe.
 * Çağıran taraf (auth callback / whatsapp verify) yalnızca GERÇEKTEN yeni veya
 * henüz bonus almamış kullanıcı için çağırmalıdır; yine de tüm guard'lar burada
 * tekrar uygulanır (savunmacı). Hata fırlatmaz — auth akışını bloklamaz.
 */
export async function grantSignupBonusIfEligible(
  userId: string,
  signals?: { ip?: string; phone?: string },
): Promise<SignupBonusResult> {
  try {
    const cfg = await readBonusConfig();
    if (!cfg.enabled || cfg.amountTL <= 0) {
      return { outcome: "disabled" };
    }

    const ipHash = hashSignal(signals?.ip);
    const phoneHash = hashSignal(signals?.phone);

    const amountTL = cfg.amountTL;
    let transactionId: string | undefined;

    // Özel sentinel: IP limiti transaction İÇİNDE atomik tespit edilince fırlatılır
    // (TOCTOU yok — sayım grant insert'ten SONRA, aynı transaction'da yapılır).
    const IP_LIMIT = Symbol("ip_limit");

    let outcome: SignupBonusOutcome;
    try {
      outcome = await db.transaction(async (tx): Promise<SignupBonusOutcome> => {
        // 1) TEK SEFER: grant satırını ON CONFLICT DO NOTHING ile dene.
        //    Satır eklenmediyse (zaten var) bonus daha önce verilmiş → çık.
        const claimed = await tx
          .insert(signupBonusGrants)
          .values({ userId, amountTL: String(amountTL), ipHash, phoneHash })
          .onConflictDoNothing()
          .returning({ userId: signupBonusGrants.userId });

        if (!claimed.length) {
          return "already_granted";
        }

        // 2) IP LİMİTİ (ATOMİK): grant yazıldıktan SONRA, AYNI transaction'da bu
        //    ip_hash ile toplam grant sayısını say. Eşik aşıldıysa throw → rollback
        //    (bu grant da geri alınır). Eşzamanlı çağrılar transaction izolasyonuyla
        //    serileşir; TOCTOU yarışı yok. Boş ip_hash bu kontrolü atlar.
        if (ipHash && cfg.maxPerIp > 0) {
          const ipRows = await tx
            .select({ c: sql<number>`count(*)::int` })
            .from(signupBonusGrants)
            .where(eq(signupBonusGrants.ipHash, ipHash));
          const ipCount = Number(ipRows[0]?.c ?? 0);
          if (ipCount > cfg.maxPerIp) {
            throw IP_LIMIT;
          }
        }

        // 3) DRIFT=0: bakiyeyi artır + transactions satırı (tip='bonus', pozitif).
        const updated = await tx
          .update(users)
          .set({ bakiyeTL: sql`${users.bakiyeTL} + ${amountTL}`, updatedAt: new Date() })
          .where(eq(users.id, userId))
          .returning({ email: users.email, bakiyeTL: users.bakiyeTL });

        if (!updated.length) {
          // Kullanıcı yoksa transaction'ı geri al (grant da yazılmaz).
          throw new Error(`signup bonus: user ${userId} not found`);
        }

        const sonraki = Number(updated[0].bakiyeTL);
        const onceki = sonraki - amountTL;

        const txRow = await tx
          .insert(transactions)
          .values({
            userId,
            userEmail: updated[0].email,
            tip: "bonus",
            miktarTL: String(amountTL),
            oncekiBakiye: String(onceki),
            sonrakiBakiye: String(sonraki),
            aciklama: "Yeni üye deneme bonusu",
            metod: "bonus",
            idempotencyKey: `bonus_signup_${userId}`,
          })
          .returning({ id: transactions.id });

        transactionId = txRow[0].id;

        // 4) grant satırına transaction izini bağla (ledger eşleştirme).
        await tx
          .update(signupBonusGrants)
          .set({ transactionId })
          .where(eq(signupBonusGrants.userId, userId));

        return "granted";
      });
    } catch (txErr) {
      if (txErr === IP_LIMIT) {
        logger.warn({ userId, maxPerIp: cfg.maxPerIp }, "signup bonus blocked: ip limit");
        await writeAudit("signup_bonus_blocked", userId, `IP limiti (> ${cfg.maxPerIp})`, userId);
        return { outcome: "ip_limit" };
      }
      throw txErr;
    }

    if (outcome === "granted") {
      await writeAudit("signup_bonus_granted", userId, `Yeni üye bonusu +₺${amountTL.toFixed(2)}`, userId);
      logger.info({ userId, amountTL, transactionId }, "signup bonus granted");
    }

    return { outcome, amountTL: outcome === "granted" ? amountTL : undefined, transactionId };
  } catch (e) {
    logger.error({ err: e, userId }, "grantSignupBonusIfEligible failed");
    return { outcome: "error" };
  }
}
