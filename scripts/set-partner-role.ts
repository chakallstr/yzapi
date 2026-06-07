// scripts/set-partner-role.ts
//
// Bir kullanıcıyı ortak (partner) yapar veya geri alır. Geri-alınabilir aktivasyon.
//
// Kullanım:
//   ENV_FILE_PATH=.env.production npx tsx scripts/set-partner-role.ts <email>
//   ENV_FILE_PATH=.env.production npx tsx scripts/set-partner-role.ts <email> --revoke
//
// Sahip hesabının rolü bu scriptle değiştirilemez.

import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { db } from "../src/server/db/client.js";
import { users } from "../src/server/db/schema.js";
import { eq } from "drizzle-orm";

const OWNER_EMAIL = "cix.crazy666@gmail.com";

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");

  if (!email) {
    console.error("Kullanım: set-partner-role.ts <email> [--revoke]");
    process.exit(1);
  }

  if (email === OWNER_EMAIL) {
    console.error("Sahip hesabının rolü bu scriptle değiştirilemez.");
    process.exit(1);
  }

  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!rows.length) {
    console.error(`Kullanıcı bulunamadı: ${email} (önce siteye kaydolmuş olmalı)`);
    process.exit(1);
  }

  const nextRole = revoke ? "user" : "partner";
  await db
    .update(users)
    .set({ role: nextRole, updatedAt: new Date() })
    .where(eq(users.id, rows[0].id));

  console.log(`OK: ${email} → role='${nextRole}' (önceki: '${rows[0].role}')`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
