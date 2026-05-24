import { db, dbSql } from "../db/client.js";
import { users, plans } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../lib/env.js";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

// In-memory buckets: apiKeyId → bucket
const buckets = new Map<string, TokenBucket>();

function getOrCreateBucket(apiKeyId: string): TokenBucket {
  if (!buckets.has(apiKeyId)) {
    buckets.set(apiKeyId, {
      tokens: env.RATE_LIMIT_PER_KEY_PER_MIN,
      lastRefill: Date.now(),
    });
  }
  return buckets.get(apiKeyId)!;
}

function refillBucket(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000; // seconds
  const refillRate = env.RATE_LIMIT_PER_KEY_PER_MIN / 60; // tokens per second
  bucket.tokens = Math.min(
    env.RATE_LIMIT_PER_KEY_PER_MIN,
    bucket.tokens + elapsed * refillRate
  );
  bucket.lastRefill = now;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export async function checkRateLimit(
  apiKeyId: string,
  userId: string
): Promise<RateLimitResult> {
  // Per-key token bucket check
  const bucket = getOrCreateBucket(apiKeyId);
  refillBucket(bucket);

  if (bucket.tokens < 1) {
    const tokensNeeded = 1 - bucket.tokens;
    const refillRate = env.RATE_LIMIT_PER_KEY_PER_MIN / 60;
    const retryAfter = Math.ceil(tokensNeeded / refillRate);
    return { allowed: false, retryAfter };
  }

  bucket.tokens -= 1;

  // Plan-level daily TL limit check
  const denied = await checkDailyLimit(userId);
  if (denied) {
    // Restore the token since we're denying
    bucket.tokens += 1;
    return { allowed: false, retryAfter: 3600 };
  }

  return { allowed: true };
}

async function checkDailyLimit(userId: string): Promise<boolean> {
  const userRows = await db
    .select({ plan: users.plan, gunlukLimitTL: users.gunlukLimitTL })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRows.length) return false;

  const user = userRows[0];

  // Check plan-level daily limit
  const planRows = await db
    .select({ gunlukLimitTL: plans.gunlukLimitTL })
    .from(plans)
    .where(eq(plans.id, user.plan))
    .limit(1);

  const planLimit = planRows[0]?.gunlukLimitTL ?? null;
  const userLimit = user.gunlukLimitTL;

  // Use user-specific limit if set, otherwise plan limit
  const effectiveLimit = userLimit !== null ? Number(userLimit) : (planLimit !== null ? Number(planLimit) : null);

  if (effectiveLimit === null) return false;

  // Sum of usage transactions in the last 24 hours
  const spendRows = await dbSql<{ daily_spend: string }[]>`
    SELECT COALESCE(SUM(ABS(miktar_tl)), 0) AS daily_spend
    FROM transactions
    WHERE user_id = ${userId}::uuid
      AND tip = 'kullanim'
      AND timestamp > NOW() - INTERVAL '1 day'
  `;

  const dailySpend = Number(spendRows[0]?.daily_spend ?? 0);

  return dailySpend >= effectiveLimit;
}
