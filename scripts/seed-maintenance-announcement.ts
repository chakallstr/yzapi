// scripts/seed-maintenance-announcement.ts
//
// One-shot operator script: publishes (or clears) the "only Claude is working,
// other models are under maintenance" announcement that the panel's bell icon
// (GET /api/announcements/active) surfaces. This is DATA, not code — it does NOT
// ship with a deploy; run it explicitly on the server.
//
// Companion to the frontend MAINTENANCE_ACTIVE flag (src/yapayzekalab/shared.jsx):
// when maintenance ends, flip that flag to false AND run this with OFF=1.
//
// Idempotent: re-running refreshes the same row's window instead of duplicating.
// Provider code-names never appear in the message (public-safe, like the UI).
//
// Run on the server (reads .env.production for DATABASE_URL):
//   ENV_FILE_PATH=.env.production NODE_ENV=production npx tsx scripts/seed-maintenance-announcement.ts
// Extend / change window (days from now, default 30):
//   MAINTENANCE_DAYS=14 ENV_FILE_PATH=.env.production NODE_ENV=production npx tsx scripts/seed-maintenance-announcement.ts
// Turn the announcement OFF (deactivate, when maintenance ends):
//   OFF=1 ENV_FILE_PATH=.env.production NODE_ENV=production npx tsx scripts/seed-maintenance-announcement.ts

import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { and, eq } from "drizzle-orm";
import { db, dbSql } from "../src/server/db/client.js";
import { announcements } from "../src/server/db/schema.js";

// Bilingual, single-field message (the bell renders one `mesaj` string).
const MESSAGE =
  "Şu anda yalnızca Claude modelleri çalışıyor. Diğer modeller (GPT, Gemini, o-serisi) geçici olarak bakımdadır. " +
  "| Currently only Claude models are working. Other models (GPT, Gemini, o-series) are temporarily under maintenance.";
const TIP = "uyari"; // warning → orange dot in the bell

async function main() {
  const off = process.env.OFF === "1" || process.env.OFF === "true";

  if (off) {
    const cleared = await db
      .update(announcements)
      .set({ aktif: false })
      .where(and(eq(announcements.mesaj, MESSAGE), eq(announcements.aktif, true)))
      .returning({ id: announcements.id });
    console.log(`[maintenance-announcement] deactivated ${cleared.length} row(s).`);
    return;
  }

  const days = Number(process.env.MAINTENANCE_DAYS || 30);
  const baslangic = new Date();
  const bitis = new Date(baslangic.getTime() + days * 24 * 60 * 60 * 1000);

  // Idempotent: refresh an existing identical row instead of inserting a duplicate.
  const existing = await db
    .select({ id: announcements.id })
    .from(announcements)
    .where(eq(announcements.mesaj, MESSAGE))
    .limit(1);

  if (existing.length) {
    await db
      .update(announcements)
      .set({ tip: TIP, aktif: true, baslangic, bitis })
      .where(eq(announcements.id, existing[0].id));
    console.log(`[maintenance-announcement] refreshed existing row ${existing[0].id} → active until ${bitis.toISOString()}.`);
  } else {
    const [row] = await db
      .insert(announcements)
      .values({ mesaj: MESSAGE, tip: TIP, aktif: true, baslangic, bitis })
      .returning({ id: announcements.id });
    console.log(`[maintenance-announcement] inserted ${row.id} → active until ${bitis.toISOString()}.`);
  }
}

main()
  .catch((err) => {
    console.error("[maintenance-announcement] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbSql.end();
  });
