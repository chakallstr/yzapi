import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { db } from "../db/client.js";
import { apiKeys, users } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

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
