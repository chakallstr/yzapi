// Gözcü — Katman-6 oto-müdahale beyaz listesi.
//
// SADECE idempotent + kanıtlanmış aksiyonlar. Para hareketi olan tek heal mevcut
// (orphan-reaper) idempotent fonksiyona DELEGE eder; ASLA yeni bakiye yazımı yapmaz.
// Her heal guard()/dryRun()/apply() ayırır; orchestrator (run.ts) kill-switch + rate-limit
// + dryRun-first + audit + cap uygular.

import { dbSql } from "../../../db/client.js";
import { reapOrphanReservations } from "../../../jobs/orphan-reservation-reaper-job.js";
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
];
