import { dbSql } from "../db/client.js";

export const LIVE_STATE_TABLES = [
  "users",
  "api_keys",
  "payments",
  "pending_iban_payments",
  "transactions",
  "usage_records",
  "audit_logs",
  "sessions",
  "kur_history",
  "model_saglik",
  "provider_profiles",
  "system_api_config",
  "model_overrides",
  "added_models",
  "announcements",
  "telegram_accounts",
  "whatsapp_verified_numbers",
  "user_webhooks",
] as const;

export type LiveStateTable = typeof LIVE_STATE_TABLES[number];

type LiveStateRow = Record<string, any>;

const TABLE_SET = new Set<string>(LIVE_STATE_TABLES);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const SECRET_KEYS = new Set([
  "password_hash",
  "key_hash",
  "full_key_cipher",
  "api_key_cipher",
]);

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function shouldRedactKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    SECRET_KEYS.has(k) ||
    k === "hash" ||
    k.endsWith("_hash") ||
    k.includes("secret") ||
    k.includes("cipher") ||
    k === "api_key" ||
    k === "apikey" ||
    k === "access_token" ||
    k === "refresh_token" ||
    k === "authorization" ||
    k.endsWith("_token")
  );
}

function redactNested(value: any): any {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redactNested);
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      shouldRedactKey(key) ? "[redacted]" : redactNested(child),
    ]),
  );
}

export function isLiveStateTable(table: string): table is LiveStateTable {
  return TABLE_SET.has(table);
}

export function redactLiveStateRow(_table: LiveStateTable | string, row: LiveStateRow): LiveStateRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      shouldRedactKey(key) ? "[redacted]" : redactNested(value),
    ]),
  );
}

async function countTable(table: LiveStateTable): Promise<number> {
  const rows = await dbSql.unsafe<{ n: number }[]>(
    `select count(*)::int as n from ${quoteIdent(table)}`,
  );
  return Number(rows[0]?.n ?? 0);
}

async function columnsFor(table: LiveStateTable): Promise<string[]> {
  const rows = await dbSql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = ${"public"} and table_name = ${table}
    order by ordinal_position
  `;
  return rows.map((row) => row.column_name);
}

function preferredOrderColumn(columns: string[]): string {
  return (
    ["created_at", "timestamp", "olusturma", "kayit_tarihi", "id"].find((column) =>
      columns.includes(column),
    ) || columns[0] || "id"
  );
}

async function safeGroup(query: string): Promise<LiveStateRow[]> {
  try {
    return await dbSql.unsafe<LiveStateRow[]>(query);
  } catch {
    return [];
  }
}

async function publicJsonCount(baseUrl: string, path: string): Promise<{ path: string; status?: number; count: number | null; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
    const body = await res.json().catch(() => null);
    const count = Array.isArray(body)
      ? body.length
      : Array.isArray(body?.data)
        ? body.data.length
        : Array.isArray(body?.models)
          ? body.models.length
          : typeof body?.modelCount === "number"
            ? body.modelCount
            : typeof body?.count === "number"
              ? body.count
              : null;
    return { path, status: res.status, count };
  } catch (error) {
    return { path, count: null, error: error instanceof Error ? error.message : "unknown" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getLiveStateSummary(): Promise<LiveStateRow> {
  const counts = Object.fromEntries(
    await Promise.all(LIVE_STATE_TABLES.map(async (table) => [table, await countTable(table)])),
  );
  const apiKeys = await safeGroup("select aktif::text as aktif, count(*)::int as n from api_keys group by aktif order by aktif");
  const pendingIban = await safeGroup("select durum, count(*)::int as n from pending_iban_payments group by durum order by durum");
  const payments = await safeGroup("select durum::text as durum, count(*)::int as n from payments group by durum order by durum");
  const providers = (await safeGroup("select id, label, enabled, fallback_provider_id from provider_profiles order by id"))
    .map((row) => redactLiveStateRow("provider_profiles", row));
  const models = await safeGroup("select provider_id, durum, count(*)::int as n from model_saglik group by provider_id, durum order by provider_id, durum");
  const usage24h = await safeGroup("select status, count(*)::int as n, coalesce(sum(cost_tl),0)::numeric(18,6)::text as cost_tl from usage_records where timestamp > now() - interval '24 hours' group by status order by status");
  const latestKur = (await safeGroup("select live_kur::text, sell_kur::text, source, created_at from kur_history order by created_at desc limit 1"))[0] ?? null;

  const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "https://yapayzekalab.org").replace(/\/+$/, "");
  const publicModels = await Promise.all([
    publicJsonCount(baseUrl, "/status"),
    publicJsonCount(baseUrl, "/api/models"),
    publicJsonCount(baseUrl, "/v1/models"),
  ]);
  const modelCounts = publicModels.map((row) => row.count).filter((value): value is number => typeof value === "number");

  return {
    snapshotUtc: new Date().toISOString(),
    counts,
    apiKeys,
    pendingIban,
    payments,
    providers,
    models,
    usage24h,
    latestKur: redactLiveStateRow("kur_history", latestKur ?? {}),
    publicModels,
    alarms: {
      modelCountMismatch: new Set(modelCounts).size > 1,
    },
  };
}

export async function getLiveStateTables(): Promise<LiveStateRow[]> {
  return Promise.all(
    LIVE_STATE_TABLES.map(async (table) => ({
      table,
      count: await countTable(table),
      columns: await columnsFor(table),
    })),
  );
}

export async function getLiveStateTableRows(
  table: string,
  query: { limit?: unknown; offset?: unknown; order?: unknown },
): Promise<LiveStateRow> {
  if (!isLiveStateTable(table)) {
    const error = new Error("Live-state table is not allowed");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const limit = clampInt(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(query.offset, 0, 0, 1_000_000);
  const direction = String(query.order ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const columns = await columnsFor(table);
  const orderColumn = preferredOrderColumn(columns);
  const rows = await dbSql.unsafe<LiveStateRow[]>(
    `select * from ${quoteIdent(table)} order by ${quoteIdent(orderColumn)} ${direction} limit ${limit} offset ${offset}`,
  );

  return {
    table,
    limit,
    offset,
    order: direction,
    orderColumn,
    rows: rows.map((row) => redactLiveStateRow(table, row)),
  };
}
