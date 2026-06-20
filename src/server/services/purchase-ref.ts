// src/server/services/purchase-ref.ts
import { randomInt } from "node:crypto";
import { dbSql } from "../db/client.js";

/** 32 karakter, belirsizlik-yok: I/O/0/1 ve küçük harf YOK. */
export const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Verilen anı Europe/Istanbul gününe çevirip YYMMDD döndürür. */
export function istanbulYYMMDD(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}${get("month")}${get("day")}`;
}

/** Kriptografik rastgele kod (tahmin edilemez). */
export function randomCode(len = 4): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Saf formatlayıcı: YZK-YYMMDD-XXXX. */
export function formatPurchaseRef(date: Date, rand: string): string {
  return `YZK-${istanbulYYMMDD(date)}-${rand}`;
}

type SqlClient = typeof dbSql;

/**
 * DB'de henüz kullanılmamış bir purchase_ref üretir.
 * Üretimde pre-check; partial unique index nihai garantidir.
 */
export async function generateUniquePurchaseRef(
  sql: SqlClient,
  date: Date,
  maxAttempts = 5,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const ref = formatPurchaseRef(date, randomCode(4));
    const hit = await sql`SELECT 1 FROM transactions WHERE purchase_ref = ${ref} LIMIT 1`;
    if ((hit as unknown[]).length === 0) return ref;
  }
  throw new Error("purchase_ref üretilemedi (çakışma)");
}
