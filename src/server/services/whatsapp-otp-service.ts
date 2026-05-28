import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, dbSql } from "../db/client.js";
import { users, whatsappVerifiedNumbers } from "../db/schema.js";
import { AppError, BadRequestError, RateLimitError } from "../lib/errors.js";
import { env } from "../lib/env.js";

const TURKEY_COUNTRY_CODE = "90";
const CONSENT_TEXT_VERSION = "whatsapp-marketing-v1";

export function isWhatsappOtpEnabled(): boolean {
  return env.WHATSAPP_OTP_ENABLED;
}

function otpHashSecret(): string {
  return env.WHATSAPP_OTP_HASH_SECRET || env.JWT_SECRET;
}

export function normalizeWhatsAppPhone(raw: string): string {
  const input = String(raw || "").trim();
  const digits = input.replace(/[^\d]/g, "");

  let national = "";
  if (digits.length === 10 && digits.startsWith("5")) {
    national = digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    national = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith(TURKEY_COUNTRY_CODE)) {
    national = digits.slice(2);
  }

  if (!/^5\d{9}$/.test(national)) {
    throw new BadRequestError("Geçerli bir Türkiye WhatsApp telefon numarası girin.");
  }

  return `+${TURKEY_COUNTRY_CODE}${national}`;
}

export function maskPhoneForDisplay(phoneE164: string): string {
  const normalized = normalizeWhatsAppPhone(phoneE164);
  return `${normalized.slice(0, 3)} *** *** ${normalized.slice(-4)}`;
}

export function createStableHash(value: string, secret = otpHashSecret()): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createOtpCodeHash(code: string, phoneHash: string, secret = otpHashSecret()): string {
  return createStableHash(`${phoneHash}:${code}`, secret);
}

export function verifyOtpCodeHash(code: string, phoneHash: string, expectedHash: string, secret = otpHashSecret()): boolean {
  const actual = Buffer.from(createOtpCodeHash(code, phoneHash, secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function normalizeOpenWaRecipient(phoneE164: string): string {
  return phoneE164.replace(/[^\d]/g, "");
}

function appendPath(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function sendOtpMessage(phoneE164: string, code: string): Promise<{ provider: string; providerMessageId: string | null }> {
  const provider = env.WHATSAPP_OTP_PROVIDER;
  const message = `YapayZekaLab doğrulama kodunuz: ${code}. Bu kod 5 dakika geçerlidir.`;

  if (env.WHATSAPP_OTP_DRY_RUN || provider === "dry_run") {
    return { provider: "dry_run", providerMessageId: "dry_run" };
  }

  if (provider !== "openwa") {
    throw new AppError(503, "WhatsApp OTP sağlayıcısı yapılandırılmadı.");
  }

  if (!env.OPENWA_API_URL || !env.OPENWA_API_KEY || !env.OPENWA_SESSION_ID) {
    throw new AppError(503, "OpenWA OTP sağlayıcısı yapılandırılmadı.");
  }

  const response = await fetch(appendPath(env.OPENWA_API_URL, "/sendText"), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENWA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: env.OPENWA_SESSION_ID,
      to: normalizeOpenWaRecipient(phoneE164),
      text: message,
    }),
  });

  const body = await response.json().catch(() => null) as { id?: string; messageId?: string } | null;
  if (!response.ok) {
    throw new AppError(502, "WhatsApp OTP gönderilemedi.");
  }

  return {
    provider: "openwa",
    providerMessageId: body?.messageId || body?.id || null,
  };
}

async function assertSendRateLimit(phoneHash: string, ipHash: string): Promise<void> {
  const phoneRows = await dbSql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM whatsapp_otp_requests
    WHERE phone_hash = ${phoneHash}
      AND created_at > now() - interval '1 hour'
  `;
  if ((phoneRows[0]?.count ?? 0) >= env.WHATSAPP_OTP_MAX_SENDS_PER_PHONE_HOUR) {
    throw new RateLimitError("Bu numara için çok fazla doğrulama kodu istendi.", env.WHATSAPP_OTP_RESEND_COOLDOWN_SEC);
  }

  if (!ipHash) return;
  const ipRows = await dbSql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM whatsapp_otp_requests
    WHERE ip_hash = ${ipHash}
      AND created_at > now() - interval '1 hour'
  `;
  if ((ipRows[0]?.count ?? 0) >= env.WHATSAPP_OTP_MAX_SENDS_PER_IP_HOUR) {
    throw new RateLimitError("Çok fazla doğrulama isteği alındı.", env.WHATSAPP_OTP_RESEND_COOLDOWN_SEC);
  }
}

export async function hasActiveVerifiedWhatsappForUser(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: whatsappVerifiedNumbers.id })
    .from(whatsappVerifiedNumbers)
    .where(and(eq(whatsappVerifiedNumbers.userId, userId), eq(whatsappVerifiedNumbers.status, "active")))
    .limit(1);
  return rows.length > 0;
}

export async function getWhatsappVerificationSummary(userId: string): Promise<{
  whatsappVerified: boolean;
  phoneMasked: string | null;
  marketingWhatsappConsent: boolean;
  whatsappVerifiedAt: string | null;
}> {
  const rows = await db
    .select({
      phoneE164: whatsappVerifiedNumbers.phoneE164,
      marketingConsent: whatsappVerifiedNumbers.marketingConsent,
      verifiedAt: whatsappVerifiedNumbers.verifiedAt,
    })
    .from(whatsappVerifiedNumbers)
    .where(and(eq(whatsappVerifiedNumbers.userId, userId), eq(whatsappVerifiedNumbers.status, "active")))
    .limit(1);

  const row = rows[0];
  return {
    whatsappVerified: Boolean(row),
    phoneMasked: row ? maskPhoneForDisplay(row.phoneE164) : null,
    marketingWhatsappConsent: Boolean(row?.marketingConsent),
    whatsappVerifiedAt: row?.verifiedAt ? row.verifiedAt.toISOString() : null,
  };
}

export async function startWhatsappOtp(input: {
  userId: string;
  phone: string;
  ip?: string;
  userAgent?: string;
  purpose?: string;
}): Promise<{
  verificationId: string;
  phoneMasked: string;
  expiresAt: string;
  resendAfterSec: number;
  provider: string;
}> {
  const userRows = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!userRows.length) throw new BadRequestError("Kullanıcı bulunamadı.");

  const phoneE164 = normalizeWhatsAppPhone(input.phone);
  const phoneHash = createStableHash(phoneE164);
  const ipHash = input.ip ? createStableHash(input.ip) : "";
  const userAgentHash = input.userAgent ? createStableHash(input.userAgent) : "";
  await assertSendRateLimit(phoneHash, ipHash);

  const code = generateOtpCode();
  const codeHash = createOtpCodeHash(code, phoneHash);
  const expiresAt = new Date(Date.now() + env.WHATSAPP_OTP_TTL_SEC * 1000);

  const sent = await sendOtpMessage(phoneE164, code);
  const inserted = await dbSql<{ id: string }[]>`
    INSERT INTO whatsapp_otp_requests (
      user_id, purpose, phone_e164, phone_hash, code_hash,
      expires_at, ip_hash, user_agent_hash, provider, provider_message_id
    )
    VALUES (
      ${input.userId}, ${input.purpose || "signup"}, ${phoneE164}, ${phoneHash}, ${codeHash},
      ${expiresAt}, ${ipHash}, ${userAgentHash}, ${sent.provider}, ${sent.providerMessageId}
    )
    RETURNING id
  `;

  return {
    verificationId: inserted[0].id,
    phoneMasked: maskPhoneForDisplay(phoneE164),
    expiresAt: expiresAt.toISOString(),
    resendAfterSec: env.WHATSAPP_OTP_RESEND_COOLDOWN_SEC,
    provider: sent.provider,
  };
}

export async function resendWhatsappOtp(input: {
  userId: string;
  verificationId: string;
  ip?: string;
  userAgent?: string;
}): Promise<Awaited<ReturnType<typeof startWhatsappOtp>>> {
  const rows = await dbSql<{ phone_e164: string; created_at: Date }[]>`
    SELECT phone_e164, created_at
    FROM whatsapp_otp_requests
    WHERE id = ${input.verificationId}
      AND user_id = ${input.userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new BadRequestError("Doğrulama isteği bulunamadı.");

  const ageMs = Date.now() - new Date(row.created_at).getTime();
  const cooldownMs = env.WHATSAPP_OTP_RESEND_COOLDOWN_SEC * 1000;
  if (ageMs < cooldownMs) {
    throw new RateLimitError("Tekrar kod göndermek için biraz bekleyin.", Math.ceil((cooldownMs - ageMs) / 1000));
  }

  return startWhatsappOtp({
    userId: input.userId,
    phone: row.phone_e164,
    ip: input.ip,
    userAgent: input.userAgent,
    purpose: "signup_resend",
  });
}

export async function verifyWhatsappOtp(input: {
  userId: string;
  verificationId: string;
  code: string;
  marketingConsent?: boolean;
  ip?: string;
  userAgent?: string;
}): Promise<{ phoneMasked: string; verifiedAt: string }> {
  if (!/^\d{6}$/.test(String(input.code || ""))) {
    throw new BadRequestError("Geçerli doğrulama kodunu girin.");
  }

  const rows = await dbSql<{
    id: string;
    phone_e164: string;
    phone_hash: string;
    code_hash: string;
    attempt_count: number;
    expires_at: Date;
    consumed_at: Date | null;
    completed_at: Date | null;
  }[]>`
    SELECT id, phone_e164, phone_hash, code_hash, attempt_count, expires_at, consumed_at, completed_at
    FROM whatsapp_otp_requests
    WHERE id = ${input.verificationId}
      AND user_id = ${input.userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new BadRequestError("Doğrulama isteği bulunamadı.");
  if (row.consumed_at || row.completed_at) throw new BadRequestError("Bu doğrulama kodu zaten kullanıldı.");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new BadRequestError("Doğrulama kodunun süresi doldu.");
  if (row.attempt_count >= env.WHATSAPP_OTP_MAX_ATTEMPTS) {
    throw new RateLimitError("Çok fazla hatalı kod denemesi yapıldı.", env.WHATSAPP_OTP_RESEND_COOLDOWN_SEC);
  }

  if (!verifyOtpCodeHash(input.code, row.phone_hash, row.code_hash)) {
    await dbSql`
      UPDATE whatsapp_otp_requests
      SET attempt_count = attempt_count + 1
      WHERE id = ${row.id}
    `;
    throw new BadRequestError("Doğrulama kodu hatalı.");
  }

  const consent = Boolean(input.marketingConsent);
  const consentIpHash = input.ip ? createStableHash(input.ip) : "";
  const consentUserAgentHash = input.userAgent ? createStableHash(input.userAgent) : "";

  const verifiedAt = await dbSql.begin(async (tx) => {
    const updated = await tx<{ phone_e164: string; phone_hash: string }[]>`
      UPDATE whatsapp_otp_requests
      SET consumed_at = now(), completed_at = now()
      WHERE id = ${row.id}
        AND user_id = ${input.userId}
        AND consumed_at IS NULL
        AND completed_at IS NULL
        AND expires_at > now()
      RETURNING phone_e164, phone_hash
    `;
    if (!updated.length) throw new BadRequestError("Doğrulama kodu artık geçerli değil.");

    const existing = await tx<{ id: string; user_id: string | null; status: string }[]>`
      SELECT id, user_id, status
      FROM whatsapp_verified_numbers
      WHERE phone_hash = ${row.phone_hash}
      LIMIT 1
    `;
    const already = existing[0];
    if (already && already.user_id && already.user_id !== input.userId) {
      throw new BadRequestError("Bu WhatsApp numarası başka bir hesapta kayıtlı.");
    }
    if (already?.status === "blocked") {
      throw new BadRequestError("Bu WhatsApp numarası kullanılamaz.");
    }

    await tx`
      UPDATE whatsapp_verified_numbers
      SET status = 'inactive',
          inactive_at = now(),
          inactive_reason = 'replaced',
          updated_at = now()
      WHERE user_id = ${input.userId}
        AND status = 'active'
        AND phone_hash <> ${row.phone_hash}
    `;

    if (already) {
      const rows = await tx<{ verified_at: Date }[]>`
        UPDATE whatsapp_verified_numbers
        SET user_id = ${input.userId},
            phone_e164 = ${row.phone_e164},
            status = 'active',
            verified_at = now(),
            inactive_at = NULL,
            inactive_reason = NULL,
            marketing_consent = ${consent},
            marketing_consent_at = ${consent ? new Date() : null},
            consent_text_version = ${consent ? CONSENT_TEXT_VERSION : ""},
            consent_ip_hash = ${consentIpHash},
            consent_user_agent_hash = ${consentUserAgentHash},
            updated_at = now()
        WHERE id = ${already.id}
        RETURNING verified_at
      `;
      return rows[0].verified_at;
    }

    const inserted = await tx<{ verified_at: Date }[]>`
      INSERT INTO whatsapp_verified_numbers (
        user_id, phone_e164, phone_hash, status, marketing_consent,
        marketing_consent_at, consent_text_version, consent_ip_hash, consent_user_agent_hash
      )
      VALUES (
        ${input.userId}, ${row.phone_e164}, ${row.phone_hash}, 'active', ${consent},
        ${consent ? new Date() : null}, ${consent ? CONSENT_TEXT_VERSION : ""},
        ${consentIpHash}, ${consentUserAgentHash}
      )
      RETURNING verified_at
    `;
    return inserted[0].verified_at;
  });

  return {
    phoneMasked: maskPhoneForDisplay(row.phone_e164),
    verifiedAt: verifiedAt.toISOString(),
  };
}
