// Expand the Kiro package to cover ALL Kiro-servable models (except Fable), all
// routed to the Kiro bridge via the package's provider override. The customer
// uses NORMAL model ids; the model_map rewrites each to the exact Kiro id.
import { dbSql } from "../src/server/db/client.js";

// yzapi catalog id -> exact Kiro wire id (verified the bridge serves each).
const MODEL_MAP: Record<string, string> = {
  "claude-opus-4.8": "claude-opus-4.8",
  "claude-opus-4-7": "claude-opus-4.7",
  "claude-opus-4-6": "claude-opus-4.6",
  "claude-sonnet-5": "claude-sonnet-5",
  "claude-sonnet-4-6": "claude-sonnet-4.6",
  "claude-haiku-4-5-20251001": "claude-haiku-4.5",
  "gpt-5.6-sol": "gpt-5.6-sol",
};
const ALLOWED = Object.keys(MODEL_MAP);
const allowedJson = JSON.stringify(ALLOWED);
const mapJson = JSON.stringify(MODEL_MAP);

await dbSql`
  UPDATE packages SET
    allowed_models = ${allowedJson}::jsonb,
    provider_model_map = ${mapJson}::jsonb,
    aciklama = 'Tüm Claude modelleri + GPT-5.6 (Fable hariç) — 500 istek / 24 saat',
    updated_at = now()
  WHERE id = 'beta-opus-500-24h'`;
console.log("package covers", ALLOWED.length, "models, all -> Kiro");

const upd = await dbSql`
  UPDATE user_package_entitlements
  SET allowed_models_snapshot = ${allowedJson}::jsonb
  WHERE package_id = 'beta-opus-500-24h' AND status = 'active'
  RETURNING id`;
console.log("entitlements updated:", upd.length);
process.exit(0);
