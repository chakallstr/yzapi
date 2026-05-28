import bcrypt from "bcrypt";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { db } from "../db/client.js";
import { apiKeys, users } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { env } from "../lib/env.js";

export interface GeneratedApiKey {
  fullKey: string;
  prefix: string;
  maskedKey: string;
}

export function generateApiKey(): GeneratedApiKey {
  const hex = randomBytes(12).toString("hex"); // 24 hex chars
  const fullKey = `yzk_live_${hex}`;
  const prefix = `yzk_live_${hex.slice(0, 3)}`;
  const maskedKey = `yzk_live_${"•".repeat(20)}${hex.slice(-4)}`;
  return { fullKey, prefix, maskedKey };
}

export async function hashApiKey(fullKey: string): Promise<string> {
  return bcrypt.hash(fullKey, 10);
}

function apiKeyEncryptionKey(): Buffer {
  return createHash("sha256").update(env.API_KEY_ENCRYPTION_SECRET || env.JWT_SECRET).digest();
}

export function encryptApiKey(fullKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", apiKeyEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(fullKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptApiKey(payload?: string | null): string | null {
  if (!payload) return null;
  const [version, ivEncoded, tagEncoded, encryptedEncoded] = payload.split(".");
  if (version !== "v1" || !ivEncoded || !tagEncoded || !encryptedEncoded) return null;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      apiKeyEncryptionKey(),
      Buffer.from(ivEncoded, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedEncoded, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export interface ValidatedKey {
  user: typeof users.$inferSelect;
  key: typeof apiKeys.$inferSelect;
}

export async function validateApiKey(headerValue: string): Promise<ValidatedKey | null> {
  const raw = headerValue.startsWith("Bearer ") ? headerValue.slice(7) : headerValue;

  if (!raw.startsWith("yzk_live_") || raw.length < 13) return null;

  // Derive prefix same way generateApiKey does: yzk_live_ + first 3 hex chars
  const hex = raw.slice("yzk_live_".length);
  const prefix = `yzk_live_${hex.slice(0, 3)}`;

  // Use prefix index — at most a handful of candidates
  const candidates = await db
    .select({ key: apiKeys, user: users })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.prefix, prefix), eq(apiKeys.aktif, true)))
    .limit(5);

  for (const { key, user } of candidates) {
    if (!key.keyHash) continue;
    const match = await bcrypt.compare(raw, key.keyHash);
    if (match) {
      // Update last used timestamp (fire and forget)
      db.update(apiKeys).set({ sonKullanim: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => {});
      return { user, key };
    }
  }

  return null;
}
