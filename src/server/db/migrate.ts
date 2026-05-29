import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({
  path:
    process.env.ENV_FILE_PATH ||
    (process.env.NODE_ENV === "production" ? ".env.production" : ".env"),
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  const migrationsFolder = path.join(__dirname, "migrations");
  console.log(`Running migrations from: ${migrationsFolder}`);

  await migrate(db, { migrationsFolder });
  console.log("Migrations applied successfully");

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
