import { randomInt } from "node:crypto";
import { dbSql } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { grantPackageEntitlement } from "./entitlement-service.js";

export interface RedeemResult {
  tip: "balance" | "package";
  amountTL?: number;
  newBalanceTL?: number;
  entitlementId?: string;
}

/**
 * Hediye/geçiş kodu kullan (atomik). balance → bakiye + ledger (tip 'hediye_kod');
 * package → Faz 1 entitlement. per-user-once: redeem_code_uses UNIQUE(code_id,user_id)
 * eşzamanlı/mükerreri engeller; max_uses tükenmesi guard'lı UPDATE ile. billing-service DOKUNULMAZ.
 */
export async function redeemCode(userId: string, codeInput: string): Promise<RedeemResult> {
  const code = (codeInput || "").trim().toUpperCase();
  if (!code) throw new AppError(400, "Kod gerekli");

  return await dbSql.begin(async (txSql) => {
    const rows = await txSql<any[]>`
      SELECT id, tip, amount_tl, package_id, max_uses, used_count, per_user_once, expires_at, enabled
      FROM redeem_codes WHERE code = ${code} LIMIT 1 FOR UPDATE
    `;
    if (!rows.length) throw new AppError(404, "Geçersiz kod");
    const rc = rows[0];
    if (!rc.enabled) throw new AppError(400, "Kod aktif değil");
    if (rc.expires_at && new Date(rc.expires_at).getTime() <= Date.now()) {
      throw new AppError(400, "Kodun süresi dolmuş");
    }
    if (Number(rc.used_count) >= Number(rc.max_uses)) {
      throw new AppError(400, "Kod kullanım limiti dolmuş");
    }

    // per-user kullanım kaydı (UNIQUE code_id,user_id) — mükerrer/eşzamanlı → 23505
    let useId: string;
    try {
      const useRows = await txSql<{ id: string }[]>`
        INSERT INTO redeem_code_uses (code_id, user_id) VALUES (${rc.id}::uuid, ${userId}::uuid) RETURNING id
      `;
      useId = useRows[0].id;
    } catch (e) {
      if ((e as { code?: string })?.code === "23505") throw new AppError(400, "Bu kodu zaten kullandınız");
      throw e;
    }

    // toplam kullanım sayacı (guard'lı)
    const inc = await txSql<{ id: string }[]>`
      UPDATE redeem_codes SET used_count = used_count + 1, updated_at = now()
      WHERE id = ${rc.id}::uuid AND used_count < max_uses RETURNING id
    `;
    if (!inc.length) throw new AppError(400, "Kod kullanım limiti dolmuş");

    if (rc.tip === "balance") {
      const amountTL = Number(rc.amount_tl);
      if (!(amountTL > 0)) throw new AppError(400, "Kod tutarı geçersiz");
      const upd = await txSql<{ bakiye_tl: string; email: string }[]>`
        UPDATE users SET bakiye_tl = bakiye_tl + ${amountTL}::numeric, son_aktivite = now()
        WHERE id = ${userId}::uuid RETURNING bakiye_tl, email
      `;
      if (!upd.length) throw new AppError(404, "Kullanıcı bulunamadı");
      const newBalance = Number(upd[0].bakiye_tl);
      const prevBalance = newBalance - amountTL;
      const txRows = await txSql<{ id: string }[]>`
        INSERT INTO transactions
          (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key)
        VALUES
          (${userId}::uuid, ${upd[0].email}, 'hediye_kod', ${amountTL}::numeric,
           ${prevBalance}::numeric, ${newBalance}::numeric, ${"Hediye kod: " + code}, 'hediye_kod',
           ${"redeem_" + rc.id + "_" + userId})
        RETURNING id
      `;
      await txSql`UPDATE redeem_code_uses SET transaction_id = ${txRows[0].id}::uuid WHERE id = ${useId}::uuid`;
      return { tip: "balance" as const, amountTL, newBalanceTL: newBalance };
    }

    if (rc.tip === "package") {
      if (!rc.package_id) throw new AppError(400, "Kod paketi tanımsız");
      const pkgRows = await txSql<any[]>`
        SELECT id, sure_gun, gunluk_istek_limiti, allowed_models, enabled, satista
        FROM packages WHERE id = ${rc.package_id} LIMIT 1
      `;
      if (!pkgRows.length || !pkgRows[0].enabled) throw new AppError(400, "Kod paketi geçersiz/kapalı");
      // satista=false ("en kısa sürede satışta") → kod ile de erken erişim verilmez
      if (pkgRows[0].satista === false) throw new AppError(400, "Paket henüz satışta değil — en kısa sürede satışa açılacak");
      const pkg = pkgRows[0];
      const { entitlementId } = await grantPackageEntitlement(txSql, {
        userId,
        packageId: pkg.id,
        sureGun: pkg.sure_gun,
        gunlukIstekLimiti: pkg.gunluk_istek_limiti,
        allowedModels: pkg.allowed_models ?? [],
        purchaseTransactionId: null,
      });
      await txSql`UPDATE redeem_code_uses SET entitlement_id = ${entitlementId}::uuid WHERE id = ${useId}::uuid`;
      return { tip: "package" as const, entitlementId };
    }

    throw new AppError(400, "Bilinmeyen kod tipi");
  });
}

export interface GenerateInput {
  tip: "balance" | "package";
  amountTL?: number;
  packageId?: string;
  count?: number;
  prefix?: string;
  maxUses?: number;
  perUserOnce?: boolean;
  expiresAt?: string | null;
  aciklama?: string;
}

function randomCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[randomInt(chars.length)];
  const p = (prefix || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return p ? `${p}-${s}` : s;
}

export async function generateRedeemCodes(input: GenerateInput): Promise<{ codes: string[] }> {
  if (input.tip === "balance" && !(Number(input.amountTL) > 0)) {
    throw new AppError(400, "balance kodu için amountTL > 0 gerekli");
  }
  if (input.tip === "package" && !input.packageId) {
    throw new AppError(400, "package kodu için packageId gerekli");
  }
  const count = Math.min(Math.max(Number(input.count) || 1, 1), 500);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomCode(input.prefix ?? "");
    await dbSql`
      INSERT INTO redeem_codes
        (code, tip, amount_tl, package_id, max_uses, per_user_once, expires_at, aciklama)
      VALUES
        (${code}, ${input.tip},
         ${input.tip === "balance" ? Number(input.amountTL) : null},
         ${input.tip === "package" ? input.packageId! : null},
         ${input.maxUses ?? 1}, ${input.perUserOnce ?? true},
         ${input.expiresAt ?? null}::timestamptz, ${input.aciklama ?? ""})
    `;
    codes.push(code);
  }
  return { codes };
}

export async function listRedeemCodes() {
  return await dbSql`
    SELECT id, code, tip, amount_tl, package_id, max_uses, used_count, per_user_once,
           expires_at, enabled, aciklama, created_at, copied_at
    FROM redeem_codes ORDER BY created_at DESC LIMIT 500
  `;
}

export async function setRedeemCodeEnabled(id: string, enabled: boolean): Promise<void> {
  await dbSql`UPDATE redeem_codes SET enabled = ${enabled}, updated_at = now() WHERE id = ${id}::uuid`;
}

/** Admin 'Kopyala' dedi → kodu dağıtıldı olarak işaretle (idempotent; key SİLİNMEZ, panelde kararır). */
export async function markRedeemCodeCopied(id: string): Promise<void> {
  await dbSql`UPDATE redeem_codes SET copied_at = now(), updated_at = now() WHERE id = ${id}::uuid AND copied_at IS NULL`;
}
