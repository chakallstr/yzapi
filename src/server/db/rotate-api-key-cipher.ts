/**
 * Re-encrypts stored full API key ciphers (api_keys.full_key_cipher) from the
 * previous encryption secret to the current one.
 *
 * SAFE ROTATION FLOW (Y4):
 *   1. Set the NEW secret in API_KEY_ENCRYPTION_SECRET.
 *   2. Set the PREVIOUS secret in API_KEY_ENCRYPTION_SECRET_OLD (if the old
 *      ciphers were written under JWT_SECRET, put JWT_SECRET's value here).
 *   3. Run this script: `npm run db:rotate-cipher` (dry-run by default).
 *   4. Re-run with `--confirm` to persist the re-encrypted ciphers.
 *   5. Once the run reports 0 remaining un-rotated rows, remove
 *      API_KEY_ENCRYPTION_SECRET_OLD from the environment.
 *
 * decryptApiKey() already tries both secrets, so the system keeps working
 * throughout the window. This script just makes the migration permanent and
 * lets you drop the old secret.
 */
import "dotenv/config";
import { dbSql } from "./client.js";
import {
  decryptApiKey,
  encryptApiKey,
  primaryEncryptionSecret,
  decryptionSecrets,
} from "../services/api-key-service.js";

interface Row {
  id: string;
  full_key_cipher: string | null;
}

async function main(): Promise<void> {
  const confirm = process.argv.includes("--confirm");
  const primary = primaryEncryptionSecret();
  const allSecrets = decryptionSecrets();

  const rows = await dbSql<Row[]>`
    SELECT id, full_key_cipher
    FROM api_keys
    WHERE full_key_cipher IS NOT NULL
  `;

  let alreadyCurrent = 0;
  let rotated = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.full_key_cipher) continue;

    // If it already decrypts under the primary secret alone, it's current.
    const underPrimary = decryptApiKey(row.full_key_cipher, [primary]);
    if (underPrimary !== null) {
      alreadyCurrent++;
      continue;
    }

    // Try the full secret list (includes the OLD secret) to recover plaintext.
    const plaintext = decryptApiKey(row.full_key_cipher, allSecrets);
    if (plaintext === null) {
      failed++;
      console.error(`[rotate] id=${row.id} could not be decrypted with any known secret`);
      continue;
    }

    const reEncrypted = encryptApiKey(plaintext, primary);
    if (confirm) {
      await dbSql`
        UPDATE api_keys
        SET full_key_cipher = ${reEncrypted}
        WHERE id = ${row.id}
      `;
    }
    rotated++;
  }

  console.log(
    `[rotate] total=${rows.length} alreadyCurrent=${alreadyCurrent} ` +
      `${confirm ? "rotated" : "wouldRotate"}=${rotated} failed=${failed}`,
  );
  if (!confirm && rotated > 0) {
    console.log("[rotate] dry-run only. Re-run with --confirm to persist changes.");
  }
  if (failed > 0) {
    console.error(
      "[rotate] WARNING: some rows could not be decrypted. " +
        "Verify API_KEY_ENCRYPTION_SECRET_OLD is set to the previous secret.",
    );
  }

  await dbSql.end();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
