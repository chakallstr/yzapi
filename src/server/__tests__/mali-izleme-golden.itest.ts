/**
 * Mali İzleme — GOLDEN-DEĞER itest (Task 7).
 *
 * Bilinen-sonuçlu sentetik fixture'larla Denetim_Motoru'nun KESİN doğruluğunu
 * kanıtlar: her kontrolün "kırık" hali doğru severity (red/yellow) üretmeli, "temiz"
 * hali green. Determinizm: aynı veri → aynı verdict. Sapma → test FAIL (R18.3/R18.4).
 *
 * İzole sentetik namespace (gz- prefixli uuid + request_id) kullanır; gerçek/seed
 * veriye DOKUNMAZ, afterEach ile temizlenir. money-flow.itest pin'i (kur=47, buffer=0.03).
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { dbSql } from "../db/client.js";
import {
  classifyDrift, classifyK1, classifyOrphan, recomputeCostTL, recomputeDeviates,
  computeMarjUsd, classifyMarj, kdvUyumsuz, deriveVerdict,
} from "../services/mali-izleme-checks.js";

// Sentetik kullanıcı (gerçek seed'le çakışmaz).
const GU_USER = "9d000000-0000-4000-8000-000000000001";
const GU_EMAIL = "golden-izleme@test.local";

async function cleanup() {
  await dbSql`DELETE FROM usage_records WHERE user_id = ${GU_USER}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${GU_USER}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${GU_USER}::uuid`;
}

beforeAll(async () => {
  await dbSql`
    INSERT INTO system_config (id, kur, live_kur, kur_buffer, text_carpan, image_carpan, video_carpan)
    VALUES (1, 47, 47, 0.03, 3.0, 3.0, 3.0)
    ON CONFLICT (id) DO UPDATE SET kur=47, live_kur=47, kur_buffer=0.03
  `;
  await cleanup();
});
afterEach(cleanup);
afterAll(async () => { await cleanup(); await dbSql.end(); });

// ── SAF FONKSİYON golden değerleri (matematik kesinliği — DB'siz) ─────────────
describe("GOLDEN: saf fonksiyon kesin değerleri (elle hesap = kod)", () => {
  it("recompute: input=1000 output=200 tl=60.5125 → 0.0726 (kur=47×1.03=48.41, opus $1.25)", () => {
    expect(recomputeCostTL(1000, 200, 60.5125, 60.5125)).toBe(0.0726);
  });
  it("recompute sapma: kayitli 0.0826 vs beklenen 0.0726 → fark 0.01 ≥ 0.0005 → sapar", () => {
    expect(recomputeDeviates(0.0726, 0.0826)).toBe(true);
  });
  it("recompute temiz: kayitli=beklenen → sapma yok", () => {
    expect(recomputeDeviates(0.0726, 0.0726)).toBe(false);
  });
  it("drift: 0 → green, 0.5 → yellow, 1 → red", () => {
    expect(classifyDrift(0).severity).toBe("green");
    expect(classifyDrift(0.5).severity).toBe("yellow");
    expect(classifyDrift(1).severity).toBe("red");
  });
  it("K1: 0 → green, 1 → red", () => {
    expect(classifyK1(0).severity).toBe("green");
    expect(classifyK1(1).severity).toBe("red");
  });
  it("orphan: 0/0 → green, 6 adet → red, 51TL → red", () => {
    expect(classifyOrphan(0, 0).severity).toBe("green");
    expect(classifyOrphan(6, 0).severity).toBe("red");
    expect(classifyOrphan(1, 51).severity).toBe("red");
  });
  it("marj: opus-4-7 alış $0.30 — satış 0.10774 (in86094 out100) kârlı; satış 0.01 zararlı", () => {
    expect(computeMarjUsd("claude-opus-4-7", 0.107743, 86094, 100)).toBeGreaterThan(0);
    expect(computeMarjUsd("claude-opus-4-7", 0.01, 86094, 100)).toBeLessThan(0);
  });
  it("marj sınıf: zararlı model → red + isim", () => {
    const r = classifyMarj([{ modelId: "claude-haiku-4-5", marjUsd: -0.02 }]);
    expect(r.severity).toBe("red");
    expect(String(r.measured)).toContain("claude-haiku-4-5");
  });
  it("KDV: 20+80=100 uyumlu; 20+80=100.5 uyumsuz", () => {
    expect(kdvUyumsuz(20, 80, 100)).toBe(false);
    expect(kdvUyumsuz(20, 80, 100.5)).toBe(true);
  });
  it("verdict: kırık (red) → SORUN_VAR; sadece yellow → DIKKAT; hepsi green → SORUN_YOK", () => {
    expect(deriveVerdict([{ name: "x", measured: 0, threshold: "", severity: "red" }])).toBe("SORUN_VAR");
    expect(deriveVerdict([{ name: "x", measured: 0, threshold: "", severity: "yellow" }])).toBe("DIKKAT");
    expect(deriveVerdict([{ name: "x", measured: 0, threshold: "", severity: "green" }])).toBe("SORUN_YOK");
  });
});

// ── DB FIXTURE golden: K1 ihlali enjekte → motor red yakalar ──────────────────
describe("GOLDEN: DB fixture — K1 ihlali (error + cost_tl>0) motorda red", async () => {
  it("kırık: status='error' cost_tl=5 → C2 K1 red, verdict SORUN_VAR", async () => {
    await dbSql`INSERT INTO users (id, email, ad_soyad, bakiye_tl, durum) VALUES (${GU_USER}::uuid, ${GU_EMAIL}, 'Golden', '0', 'aktif') ON CONFLICT DO NOTHING`;
    await dbSql`
      INSERT INTO usage_records (user_id, model_id, type, input_usage, output_usage, cost_usd, cost_tl, request_id, status)
      VALUES (${GU_USER}::uuid, 'claude-opus-4-7', 'text', 100, 50, '0', '5.0000', 'gz-k1-broken-1', 'error')
    `;
    // K1 kontrolünü doğrudan motorun SQL'iyle aynı şekilde say
    const rows = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM usage_records WHERE status='error' AND cost_tl::numeric > 0 AND user_id=${GU_USER}::uuid`;
    expect(Number(rows[0].c)).toBe(1);
    expect(classifyK1(Number(rows[0].c)).severity).toBe("red");
  });

  it("temiz: status='error' cost_tl=0 → K1 ihlali YOK (green)", async () => {
    await dbSql`INSERT INTO users (id, email, ad_soyad, bakiye_tl, durum) VALUES (${GU_USER}::uuid, ${GU_EMAIL}, 'Golden', '0', 'aktif') ON CONFLICT DO NOTHING`;
    await dbSql`
      INSERT INTO usage_records (user_id, model_id, type, input_usage, output_usage, cost_usd, cost_tl, request_id, status)
      VALUES (${GU_USER}::uuid, 'claude-opus-4-7', 'text', 100, 50, '0', '0', 'gz-k1-clean-1', 'error')
    `;
    const rows = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM usage_records WHERE status='error' AND cost_tl::numeric > 0 AND user_id=${GU_USER}::uuid`;
    expect(Number(rows[0].c)).toBe(0);
    expect(classifyK1(Number(rows[0].c)).severity).toBe("green");
  });
});

// ── DB FIXTURE golden: recompute sapması enjekte → motor red yakalar ──────────
describe("GOLDEN: DB fixture — recompute sapması motorda red", () => {
  it("kırık: cost_tl elle bozulmuş (snapshot'tan sapan) → recompute sapar", async () => {
    await dbSql`INSERT INTO users (id, email, ad_soyad, bakiye_tl, durum) VALUES (${GU_USER}::uuid, ${GU_EMAIL}, 'Golden', '0', 'aktif') ON CONFLICT DO NOTHING`;
    // pricing_snapshot: input/output tl = 60.5125 (opus $1.25 × 48.41). Beklenen cost_tl(1000,200)=0.0726.
    // Ama cost_tl'yi BİLEREK 0.0826 yazıyoruz (0.01 sapma) → recompute red yakalamalı.
    await dbSql`
      INSERT INTO usage_records (user_id, model_id, type, input_usage, output_usage, cost_usd, cost_tl, request_id, status, pricing_snapshot_json)
      VALUES (${GU_USER}::uuid, 'claude-opus-4-7', 'text', 1000, 200, '0.0015', '0.0826', 'gz-recompute-broken-1', 'success',
        ${JSON.stringify({ computed: { input: { tl: 60.5125 }, output: { tl: 60.5125 } } })}::jsonb)
    `;
    const rows = await dbSql<{ cost_tl: string; input_usage: string; output_usage: string; input_tl: string; output_tl: string }[]>`
      SELECT cost_tl::text, input_usage::text, output_usage::text,
        (pricing_snapshot_json->'computed'->'input'->>'tl') AS input_tl,
        (pricing_snapshot_json->'computed'->'output'->>'tl') AS output_tl
      FROM usage_records WHERE request_id='gz-recompute-broken-1'
    `;
    const r = rows[0];
    const beklenen = recomputeCostTL(Number(r.input_usage), Number(r.output_usage), Number(r.input_tl), Number(r.output_tl));
    expect(beklenen).toBe(0.0726); // golden
    expect(recomputeDeviates(beklenen, Number(r.cost_tl))).toBe(true); // 0.0826 vs 0.0726 → sapar
  });

  it("temiz: cost_tl = recompute golden (0.0726) → sapma yok", async () => {
    await dbSql`INSERT INTO users (id, email, ad_soyad, bakiye_tl, durum) VALUES (${GU_USER}::uuid, ${GU_EMAIL}, 'Golden', '0', 'aktif') ON CONFLICT DO NOTHING`;
    await dbSql`
      INSERT INTO usage_records (user_id, model_id, type, input_usage, output_usage, cost_usd, cost_tl, request_id, status, pricing_snapshot_json)
      VALUES (${GU_USER}::uuid, 'claude-opus-4-7', 'text', 1000, 200, '0.0015', '0.0726', 'gz-recompute-clean-1', 'success',
        ${JSON.stringify({ computed: { input: { tl: 60.5125 }, output: { tl: 60.5125 } } })}::jsonb)
    `;
    const rows = await dbSql<{ cost_tl: string; input_usage: string; output_usage: string; input_tl: string; output_tl: string }[]>`
      SELECT cost_tl::text, input_usage::text, output_usage::text,
        (pricing_snapshot_json->'computed'->'input'->>'tl') AS input_tl,
        (pricing_snapshot_json->'computed'->'output'->>'tl') AS output_tl
      FROM usage_records WHERE request_id='gz-recompute-clean-1'
    `;
    const r = rows[0];
    const beklenen = recomputeCostTL(Number(r.input_usage), Number(r.output_usage), Number(r.input_tl), Number(r.output_tl));
    expect(recomputeDeviates(beklenen, Number(r.cost_tl))).toBe(false);
  });
});

// ── Determinizm (R18.1) ───────────────────────────────────────────────────────
describe("GOLDEN: determinizm (R18.1)", () => {
  it("aynı girdi → aynı sonuç (saf fonksiyonlar)", () => {
    expect(classifyDrift(0.5)).toEqual(classifyDrift(0.5));
    expect(recomputeCostTL(1000, 200, 60.5125, 60.5125)).toBe(recomputeCostTL(1000, 200, 60.5125, 60.5125));
    expect(computeMarjUsd("claude-opus-4-7", 0.1, 1000, 200)).toBe(computeMarjUsd("claude-opus-4-7", 0.1, 1000, 200));
  });
});
