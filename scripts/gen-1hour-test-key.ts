/**
 * 1 saat geçerli test API key üretici.
 *
 * Sunucuda çalıştır (NODE_ENV ŞART — env.ts .env.production yükler):
 *   NODE_ENV=production npx tsx scripts/gen-1hour-test-key.ts
 *   NODE_ENV=production npx tsx scripts/gen-1hour-test-key.ts --revoke <key_id>
 *
 * Yapılanlar:
 *   1. Yeni test user oluşturur (test-1saat-<ts>@yapayzekalab.local, 10 TL bakiye)
 *   2. yzk_live_* API key üretir (generateApiKey + hashApiKey + encryptApiKey)
 *   3. api_keys tablosuna yazar (raw SQL — drizzle schema'da olmayan
 *      kind/scopes/daily_limit_usd kolonları da set edilir)
 *   4. Plaintext key + user_id + expire zamanını stdout'a basar
 *
 * 1 saat geçerlilik: api_keys şemasında expires_at yok. Bu script yalnızca
 * key üretir; 1 saat sonra disable etmek için --revoke modu veya SQL:
 *   UPDATE api_keys SET aktif = false WHERE id = '<id>';
 */
import { dbSql } from "../src/server/db/client.js";
import { generateApiKey, hashApiKey, encryptApiKey } from "../src/server/services/api-key-service.js";

interface UserRow {
  id: string;
  email: string;
  bakiye_tl: string;
}
interface KeyRow {
  id: string;
}

async function main() {
  const args = process.argv.slice(2);

  // --revoke <keyId> modu: 1 saat dolmuş key'i disable et
  if (args[0] === "--revoke") {
    const keyId = args[1];
    if (!keyId) {
      console.error("Kullanım: --revoke <api_keys.id uuid>");
      process.exit(1);
    }
    const updated = await dbSql<KeyRow[]>`
      UPDATE api_keys SET aktif = false WHERE id = ${keyId}::uuid
      RETURNING id
    `;
    if (!updated.length) {
      console.error(`Key bulunamadı: ${keyId}`);
      process.exit(1);
    }
    console.log(`REVOKED: id=${updated[0].id}`);
    process.exit(0);
  }

  // Normal mod: yeni 1 saatlik test key üret
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // +1 saat
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const email = `test-1saat-${ts}@yapayzekalab.local`;
  const adSoyad = `Test 1 Saat ${ts}`;

  // 1. Test user oluştur (10 TL bakiye — sonnet 4.6 test için yeterli)
  const userRows = await dbSql<UserRow[]>`
    INSERT INTO users (email, ad_soyad, bakiye_tl, bakiye_usd, durum, plan, payg_mode, role, is_pro)
    VALUES (${email}, ${adSoyad}, 10, 0, 'aktif', 'test', false, 'user', false)
    RETURNING id, email, bakiye_tl
  `;
  const user = userRows[0];

  // 2. API key üret
  const { fullKey, prefix, maskedKey } = generateApiKey();
  const keyHash = await hashApiKey(fullKey);
  const fullKeyCipher = encryptApiKey(fullKey);

  // 3. api_keys tablosuna yaz (raw SQL — drizzle schema'da olmayan
  //    kind/scopes/daily_limit_usd kolonları da set edilir)
  const keyRows = await dbSql<KeyRow[]>`
    INSERT INTO api_keys (
      user_id, ad, masked_key, key_hash, full_key_cipher, prefix, aktif,
      kind, scopes, daily_limit_usd
    ) VALUES (
      ${user.id}::uuid, ${`test-1saat-${ts}`}, ${maskedKey}, ${keyHash},
      ${fullKeyCipher}, ${prefix}, true,
      'live', ${'["chat","messages","responses","images"]'}::jsonb, 5
    )
    RETURNING id
  `;
  const keyRow = keyRows[0];

  // 4. Bilgi bas
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  1 SAAT GEÇERLİ TEST API KEY");
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`  Oluşturulma : ${now.toISOString()}`);
  console.log(`  Geçerlilik  : ${expiresAt.toISOString()} (1 saat)`);
  console.log(`  User ID     : ${user.id}`);
  console.log(`  Email       : ${user.email}`);
  console.log(`  Bakiye      : ${user.bakiye_tl} TL`);
  console.log(`  Key ID      : ${keyRow.id}`);
  console.log(`  Prefix      : ${prefix}`);
  console.log("");
  console.log("  API KEY (plaintext — SADECE BU KEZ GÖRÜNÜR):");
  console.log(`  ${fullKey}`);
  console.log("");
  console.log("  ENDPOINT'LER:");
  console.log("    Base URL        : https://yapayzekalab.org");
  console.log("    Chat (OpenAI)   : POST /v1/chat/completions");
  console.log("    Messages (Anth) : POST /v1/messages");
  console.log("    Responses (OA)  : POST /v1/responses");
  console.log("    Models          : GET  /v1/models");
  console.log("");
  console.log("  MODEL: claude-sonnet-4-6");
  console.log("");
  console.log("  ÖRNEK İSTEK (curl):");
  console.log(`  curl https://yapayzekalab.org/v1/chat/completions \\`);
  console.log(`    -H "Authorization: Bearer ${fullKey}" \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Merhaba"}],"max_tokens":50}'`);
  console.log("");
  console.log("  1 SAAT SONRA DISABLE ET:");
  console.log(`  NODE_ENV=production npx tsx scripts/gen-1hour-test-key.ts --revoke ${keyRow.id}`);
  console.log(`  veya SQL: UPDATE api_keys SET aktif = false WHERE id = '${keyRow.id}';`);
  console.log("════════════════════════════════════════════════════════════════");

  process.exit(0);
}

main().catch((e) => {
  console.error("gen-1hour-test-key FAILED:", e);
  process.exit(1);
});
