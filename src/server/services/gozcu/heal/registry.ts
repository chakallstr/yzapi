// Gözcü — Katman-6 oto-müdahale beyaz listesi.
//
// SADECE idempotent + kanıtlanmış aksiyonlar. Para hareketi olan tek heal mevcut
// (orphan-reaper) idempotent fonksiyona DELEGE eder; ASLA yeni bakiye yazımı yapmaz.
// Her heal guard()/dryRun()/apply() ayırır; orchestrator (run.ts) kill-switch + rate-limit
// + dryRun-first + audit + cap uygular.

import { dbSql } from "../../../db/client.js";
import { reapOrphanReservations } from "../../../jobs/orphan-reservation-reaper-job.js";
import { invalidateProviderConfigCache } from "../../provider-config-service.js";
import { env } from "../../../lib/env.js";

export interface HealResult {
  applied: number;
  detail: string;
  fixedChecks: string[]; // GERÇEKTEN iyileştirilen check adları (yalnız bunlar işaretlenir)
}

export interface HealAction {
  id: string;
  description: string;
  triggerChecks: string[]; // bu checkler red ise heal değerlendirilir
  moneyMoving: boolean;
  maxPerHour: number;
  guard: () => Promise<{ canRun: boolean; reason: string }>;
  dryRun: () => Promise<{ affected: number; preview: string }>;
  apply: () => Promise<HealResult>;
}

// Orphan rezervasyon sayısı (mali-izleme checkOrphan ile AYNI WHERE — tek doğruluk).
async function orphanCount(): Promise<number> {
  const rows = await dbSql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM transactions r
    WHERE r.idempotency_key LIKE 'usage_reserve_%'
      AND r.timestamp < now() - interval '90 minutes'
      AND NOT EXISTS (SELECT 1 FROM transactions f WHERE f.idempotency_key = 'usage_final_' || substring(r.idempotency_key from '^usage_reserve_(.*)$'))
      AND NOT EXISTS (SELECT 1 FROM transactions x WHERE x.idempotency_key = 'usage_release_' || substring(r.idempotency_key from '^usage_reserve_(.*)$'))
      AND NOT EXISTS (SELECT 1 FROM usage_records u WHERE u.request_id = substring(r.idempotency_key from '^usage_reserve_(.*)$'))
  `;
  return Number(rows[0]?.c ?? 0);
}

async function staleIbanCount(days: number): Promise<number> {
  const rows = await dbSql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM pending_iban_payments
    WHERE durum='bekliyor' AND olusturma < now() - (${days} || ' days')::interval
  `;
  return Number(rows[0]?.c ?? 0);
}

// Bir sağlayıcının /models ucu ayakta mı (auth'suz hızlı bağlanırlık: 200/401/403=ayakta, 5xx/timeout=down).
async function providerReachable(base: string): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 4000);
    const r = await fetch(`${base.replace(/\/+$/, "")}/models`, { signal: c.signal });
    clearTimeout(t);
    return r.status < 500;
  } catch {
    return false;
  }
}

// Aktif OLMAYAN, enabled + erişilebilir ilk alternatif sağlayıcıyı bul.
async function findHealthyAlternate(): Promise<{ from: string; to: string } | null> {
  const cfg = await dbSql<{ active: string | null }[]>`SELECT active_provider_id AS active FROM system_api_config LIMIT 1`;
  const active = cfg[0]?.active ?? "";
  const profs = await dbSql<{ id: string; base_url: string }[]>`
    SELECT id, base_url FROM provider_profiles
    WHERE enabled = true AND id <> ${active} AND base_url IS NOT NULL ORDER BY id
  `;
  for (const p of profs) {
    if (await providerReachable(p.base_url)) return { from: active || "(yok)", to: p.id };
  }
  return null;
}

export const HEAL_REGISTRY: HealAction[] = [
  {
    id: "refund_orphan_reservations",
    description: "Karşılıksız (orphan) usage rezervasyonlarını idempotent iade et — orphan-reaper'a delege.",
    triggerChecks: ["orphan_rezervasyon"],
    moneyMoving: true, // ama mevcut idempotent reaper'a delege; yeni bakiye yazımı YOK
    maxPerHour: 4,
    guard: async () => {
      const c = await orphanCount();
      return { canRun: c > 0, reason: `${c} orphan rezervasyon` };
    },
    dryRun: async () => {
      const c = await orphanCount();
      return { affected: c, preview: `${c} orphan rezervasyon iade edilecek (idempotent usage_release_<id>)` };
    },
    apply: async () => {
      const n = await reapOrphanReservations(); // idempotent, SKIP LOCKED, ON CONFLICT DO NOTHING
      return { applied: n, detail: `${n} orphan rezervasyon iade edildi (reaper)`, fixedChecks: ["orphan_rezervasyon"] };
    },
  },
  {
    id: "expire_stale_pending_iban",
    description: "Çok eski (varsayılan 14g) onay bekleyen IBAN ödemelerini reddet. PARA HAREKETİ YOK (bakiye yüklenmemişti).",
    triggerChecks: ["pending_iban_buildup"],
    moneyMoving: false,
    maxPerHour: 2,
    guard: async () => {
      const c = await staleIbanCount(env.GOZCU_IBAN_STALE_DAYS);
      return { canRun: c > 0, reason: `${c} bayat IBAN bekleyen` };
    },
    dryRun: async () => {
      const c = await staleIbanCount(env.GOZCU_IBAN_STALE_DAYS);
      return { affected: c, preview: `${c} bayat IBAN ödemesi 'reddedildi' yapılacak (bakiye DOKUNULMAZ)` };
    },
    apply: async () => {
      const days = env.GOZCU_IBAN_STALE_DAYS;
      const rows = await dbSql<{ c: string }[]>`
        WITH upd AS (
          UPDATE pending_iban_payments
          SET durum='reddedildi', onay=now(), onaylayan='gozcu-auto',
              "not"=COALESCE("not", '') || ' [gozcu: bayat-otomatik-red]'
          WHERE durum='bekliyor' AND olusturma < now() - (${days} || ' days')::interval
          RETURNING 1
        ) SELECT count(*)::text AS c FROM upd
      `;
      const n = Number(rows[0]?.c ?? 0);
      return { applied: n, detail: `${n} bayat IBAN ödemesi reddedildi`, fixedChecks: ["pending_iban_buildup"] };
    },
  },
  {
    id: "failover_provider",
    description: "Aktif sağlayıcı sürekli erişilemezse enabled + erişilebilir bir alternatife otomatik geç (sistem ayakta kalsın). Para hareketi YOK.",
    triggerChecks: ["models_reachability"],
    moneyMoving: false, // operasyonel; bakiye dokunulmaz — ama tüm trafiği yönlendirir (tiered'da oto)
    maxPerHour: 2, // oscillation koruması: iki sağlayıcı da bozuksa sürekli geçiş yapmaz
    guard: async () => {
      const alt = await findHealthyAlternate();
      return alt ? { canRun: true, reason: `${alt.from} → ${alt.to}` } : { canRun: false, reason: "erişilebilir alternatif yok" };
    },
    dryRun: async () => {
      const alt = await findHealthyAlternate();
      return alt
        ? { affected: 1, preview: `Aktif sağlayıcıyı ${alt.from} → ${alt.to} olarak değiştir (alternatif erişilebilir)` }
        : { affected: 0, preview: "erişilebilir alternatif yok — değişiklik yapılmaz" };
    },
    apply: async () => {
      const alt = await findHealthyAlternate();
      if (!alt) return { applied: 0, detail: "alternatif yok — failover yapılmadı", fixedChecks: [] };
      await dbSql`UPDATE system_api_config SET active_provider_id = ${alt.to}`;
      invalidateProviderConfigCache();
      return { applied: 1, detail: `Aktif sağlayıcı ${alt.from} → ${alt.to} (otomatik failover)`, fixedChecks: ["models_reachability"] };
    },
  },
];
