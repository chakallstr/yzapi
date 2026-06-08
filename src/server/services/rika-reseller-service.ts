// Rika Reseller API — key quota + usage summary for admin panel.
// Env: RIKA_RESELLER_ID (if absent → returns {configured:false}).
// Docs: GET https://ai.rika.wtf/reseller/api/key-details?resellerId=<id>

const RIKA_BASE = "https://ai.rika.wtf";

export interface RikaKeyQuota {
  mode: string;
  activeTokenLimit: number;
  activeTokenRemaining: number;
  dailyTokenLimit?: number | null;
  totalTokenLimit?: number | null;
  lifetimeDays?: number | null;
}

export interface RikaKeyUsage {
  used: number;
  remaining: number;
  today: number;
  total: number;
}

export interface RikaKey {
  id: string;
  label: string;
  status: string;
  quota: RikaKeyQuota;
  tokenUsage: RikaKeyUsage;
  expire: string | null;
  lastUsed: string | null;
  lastIp: string | null;
  activity: { activeNow: boolean; activeRequests: number };
}

export interface RikaResellerSummary {
  keyCount: number;
  activeKeyCount: number;
  liveKeyCount: number;
  totalPromptCount: number;
  totalTokenTotal: number;
}

export interface RikaResellerStatus {
  configured: boolean;
  summary?: RikaResellerSummary;
  keys?: RikaKey[];
  error?: string;
  fetchedAt?: string;
}

export async function getRikaResellerStatus(): Promise<RikaResellerStatus> {
  const resellerId = process.env.RIKA_RESELLER_ID;
  if (!resellerId) return { configured: false };

  const url = `${RIKA_BASE}/reseller/api/key-details?resellerId=${encodeURIComponent(resellerId)}`;
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { configured: true, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = await res.json() as Record<string, unknown>;
    return {
      configured: true,
      summary: data.summary as RikaResellerSummary,
      keys: data.keys as RikaKey[],
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      configured: true,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }
}
