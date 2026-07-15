// Reconfigure the opus package so the customer uses the NORMAL model id
// (claude-opus-4.8) and the package's own provider override routes it to the Kiro
// bridge — no weird custom model id. Also fixes the ALREADY-PURCHASED entitlement
// (its allowed_models_snapshot was frozen at ["opus-4.8"]).
import { encryptApiKey } from "../src/server/services/api-key-service.js";
import { dbSql } from "../src/server/db/client.js";

const BRIDGE_KEY = "yzk_kiro_92e20ccf9b594c5ad8659b0b0fea787295d88855";
const cipher = encryptApiKey(BRIDGE_KEY);
console.log("bridge key cipher:", cipher.slice(0, 3), "len", cipher.length);

// 1) package: normal model id + its OWN Kiro provider override (base_url + key + map)
await dbSql`
  UPDATE packages SET
    allowed_models = '["claude-opus-4.8"]'::jsonb,
    provider_base_url = 'http://127.0.0.1:8321/v1',
    provider_api_key_cipher = ${cipher},
    provider_model_map = '{"claude-opus-4.8":"claude-opus-4.8"}'::jsonb,
    updated_at = now()
  WHERE id = 'beta-opus-500-24h'`;
console.log("package reconfigured -> claude-opus-4.8 via Kiro override");

// 2) fix the already-purchased entitlement snapshot (frozen at ["opus-4.8"])
const upd = await dbSql`
  UPDATE user_package_entitlements
  SET allowed_models_snapshot = '["claude-opus-4.8"]'::jsonb
  WHERE package_id = 'beta-opus-500-24h' AND status = 'active'
  RETURNING id, user_id`;
console.log("entitlements repointed:", upd.length, JSON.stringify(upd));

process.exit(0);
