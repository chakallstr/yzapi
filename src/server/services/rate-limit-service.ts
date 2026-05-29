import { db, dbSql } from "../db/client.js";
import { users, plans } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getApiKeyPolicy, getRuntimeApiConfig } from "./api-settings-service.js";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();

function getOrCreateBucket(scope: string, limit: number): TokenBucket {
  if (!buckets.has(scope)) {
    buckets.set(scope, {
      tokens: limit,
      lastRefill: Date.now(),
    });
  }
  return buckets.get(scope)!;
}

function refillBucket(bucket: TokenBucket, limit: number): void {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  const refillRate = limit / 60;
  bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;
}

function consumeBucket(scope: string, limit: number): { allowed: boolean; retryAfter?: number; restore?: () => void } {
  if (!Number.isFinite(limit) || limit <= 0) {
    return { allowed: true };
  }

  const bucket = getOrCreateBucket(scope, limit);
  refillBucket(bucket, limit);

  if (bucket.tokens < 1) {
    const tokensNeeded = 1 - bucket.tokens;
    const refillRate = limit / 60;
    const retryAfter = refillRate > 0 ? Math.ceil(tokensNeeded / refillRate) : 60;
    return { allowed: false, retryAfter };
  }

  bucket.tokens -= 1;
  return {
    allowed: true,
    restore: () => {
      bucket.tokens = Math.min(limit, bucket.tokens + 1);
    },
  };
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export async function checkRateLimit(
  apiKeyId: string,
  userId: string,
  ipAddress = "",
): Promise<RateLimitResult> {
  const [runtimeConfig, apiKeyPolicy] = await Promise.all([
    getRuntimeApiConfig(),
    getApiKeyPolicy(apiKeyId),
  ]);

  const restorers: Array<() => void> = [];
  const guards = [
    consumeBucket(`key:${apiKeyId}`, apiKeyPolicy?.perKeyPerMinute ?? runtimeConfig.defaultPerKeyPerMinute),
    consumeBucket(`user:${userId}`, runtimeConfig.defaultPerUserPerMinute),
    ipAddress ? consumeBucket(`ip:${ipAddress}`, runtimeConfig.defaultPerIpPerMinute) : { allowed: true as const },
  ];

  for (const guard of guards) {
    if (!guard.allowed) {
      restorers.forEach((restore) => restore());
      return { allowed: false, retryAfter: guard.retryAfter };
    }
    if (guard.restore) restorers.push(guard.restore);
  }

  const deniedByPlan = await checkDailyLimit(userId);
  if (deniedByPlan) {
    restorers.forEach((restore) => restore());
    return { allowed: false, retryAfter: 3600 };
  }

  if (apiKeyPolicy?.dailySpendLimitTL !== null || apiKeyPolicy?.monthlySpendLimitTL !== null) {
    const deniedBySpendCap = await checkApiKeySpendCaps(apiKeyId, apiKeyPolicy?.dailySpendLimitTL, apiKeyPolicy?.monthlySpendLimitTL);
    if (deniedBySpendCap) {
      restorers.forEach((restore) => restore());
      return { allowed: false, retryAfter: 3600 };
    }
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

  const planRows = await db
    .select({ gunlukLimitTL: plans.gunlukLimitTL })
    .from(plans)
    .where(eq(plans.id, user.plan))
    .limit(1);

  const planLimit = planRows[0]?.gunlukLimitTL ?? null;
  const userLimit = user.gunlukLimitTL;
  const effectiveLimit = userLimit !== null ? Number(userLimit) : (planLimit !== null ? Number(planLimit) : null);

  if (effectiveLimit === null) return false;

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

async function checkApiKeySpendCaps(
  apiKeyId: string,
  dailyLimitTL: number | null | undefined,
  monthlyLimitTL: number | null | undefined,
): Promise<boolean> {
  if (!dailyLimitTL && !monthlyLimitTL) return false;

  const [dailyRows, monthlyRows] = await Promise.all([
    dailyLimitTL
      ? dbSql<{ total_cost_tl: string }[]>`
          SELECT COALESCE(SUM(cost_tl), 0) AS total_cost_tl
          FROM usage_records
          WHERE api_key_id = ${apiKeyId}::uuid
            AND timestamp > NOW() - INTERVAL '1 day'
        `
      : Promise.resolve([{ total_cost_tl: "0" }]),
    monthlyLimitTL
      ? dbSql<{ total_cost_tl: string }[]>`
          SELECT COALESCE(SUM(cost_tl), 0) AS total_cost_tl
          FROM usage_records
          WHERE api_key_id = ${apiKeyId}::uuid
            AND timestamp > NOW() - INTERVAL '30 day'
        `
      : Promise.resolve([{ total_cost_tl: "0" }]),
  ]);

  const dailySpend = Number(dailyRows[0]?.total_cost_tl ?? 0);
  const monthlySpend = Number(monthlyRows[0]?.total_cost_tl ?? 0);

  if (dailyLimitTL && dailySpend >= dailyLimitTL) return true;
  if (monthlyLimitTL && monthlySpend >= monthlyLimitTL) return true;
  return false;
}
