#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config();

const REQUIRED_ARG = "--confirm";
const TABLES_TO_BACKUP = [
  "users",
  "whatsapp_otp_requests",
  "whatsapp_verified_numbers",
  "api_keys",
  "sessions",
  "usage_records",
  "payments",
  "pending_iban_payments",
  "transactions",
  "audit_logs",
  "telegram_accounts",
  "telegram_link_codes",
  "telegram_deliveries",
];

const TABLES_TO_DELETE = [
  "telegram_deliveries",
  "telegram_link_codes",
  "telegram_accounts",
  "pending_iban_payments",
  "payments",
  "usage_records",
  "sessions",
  "api_keys",
  "whatsapp_otp_requests",
  "whatsapp_verified_numbers",
  "transactions",
  "audit_logs",
  "users",
];

function requireConfirm() {
  if (!process.argv.includes(REQUIRED_ARG)) {
    throw new Error(`Refusing to run without ${REQUIRED_ARG}`);
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

async function dumpTables(sql) {
  const result = {};
  for (const table of TABLES_TO_BACKUP) {
    const rows = await sql.unsafe(`select * from ${table} order by 1`);
    result[table] = rows;
  }
  return result;
}

async function countTables(sql) {
  const counts = {};
  for (const table of TABLES_TO_BACKUP) {
    const rows = await sql.unsafe(`select count(*)::int as count from ${table}`);
    counts[table] = rows[0]?.count ?? 0;
  }
  return counts;
}

async function main() {
  requireConfirm();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const backupDir = path.join(process.cwd(), ".codex-backups", "db-user-reset");
  const stamp = timestamp();
  const backupPath = path.join(backupDir, `${stamp}.json`);

  try {
    await mkdir(backupDir, { recursive: true });

    const beforeCounts = await countTables(sql);
    const backup = await dumpTables(sql);
    await writeFile(
      backupPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          beforeCounts,
          tables: backup,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    await sql.begin(async (tx) => {
      for (const table of TABLES_TO_DELETE) {
        await tx.unsafe(`delete from ${table}`);
      }
    });

    const afterCounts = await countTables(sql);
    console.log(
      JSON.stringify(
        {
          ok: true,
          backupPath,
          beforeCounts,
          afterCounts,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
