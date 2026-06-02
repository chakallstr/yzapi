// Gözcü — uygulama-içi metrik toplayıcı (in-memory ring buffer).
//
// `/v1` latency/hata zaten usage_records'tan SQL ile türetilir. Bu collector SADECE
// non-/v1 boşluğunu doldurur: /api/* 5xx, auth-fail (401), rate-limit (429), unhandled
// (500). 15×1dk bucket'ta tutar. HOT-PATH'TE DB YAZIMI YOK — veri sadece tarama anında
// (dakikada bir) aggregate olarak gozcu_signals'a girer. Ham IP saklanmaz (yalnız hash).

import { createHash } from "node:crypto";

// Ham IP'yi ASLA saklamadan kararlı bir anahtara çevirir (collector ipFail haritası için).
export function hashIp(ip: string | undefined): string {
  return createHash("sha256").update(String(ip ?? "")).digest("hex").slice(0, 16);
}

export interface Bucket {
  startMinute: number;
  total: number;
  s2xx: number;
  s4xx: number;
  s5xx: number;
  auth401: number;
  rate429: number;
  unhandled500: number;
  ipCapExceeded: boolean; // bu bucket'ta IP_CAP aşıldı mı (gözlemlenebilirlik)
  ipFail: Map<string, number>; // hash(ip) → 401 sayısı
}

const WINDOW_MINUTES = 15;
const IP_CAP = 200; // bucket başına izlenen farklı IP-hash üst sınırı (bellek koruması)

const buckets: Bucket[] = [];
let nowFn: () => number = () => Date.now();

// Yalnız test: deterministik saat enjekte et.
export function __setClock(fn: () => number): void {
  nowFn = fn;
}
export function __reset(): void {
  buckets.length = 0;
}

function newBucket(minute: number): Bucket {
  return {
    startMinute: minute,
    total: 0,
    s2xx: 0,
    s4xx: 0,
    s5xx: 0,
    auth401: 0,
    rate429: 0,
    unhandled500: 0,
    ipCapExceeded: false,
    ipFail: new Map(),
  };
}

function currentBucket(): Bucket {
  const minute = Math.floor(nowFn() / 60_000);
  let b = buckets[buckets.length - 1];
  if (!b || b.startMinute !== minute) {
    b = newBucket(minute);
    buckets.push(b);
    // Pencere dışı eski bucket'ları at.
    while (buckets.length > 0 && minute - buckets[0].startMinute >= WINDOW_MINUTES) buckets.shift();
    // Güvenlik tavanı.
    while (buckets.length > WINDOW_MINUTES + 1) buckets.shift();
  }
  return b;
}

export function recordHttp(status: number): void {
  const b = currentBucket();
  b.total += 1;
  if (status >= 500) b.s5xx += 1;
  else if (status >= 400) b.s4xx += 1;
  else if (status >= 200 && status < 300) b.s2xx += 1;
}

export function recordAuthFailure(ipHash: string): void {
  const b = currentBucket();
  b.auth401 += 1;
  if (b.ipFail.has(ipHash) || b.ipFail.size < IP_CAP) {
    b.ipFail.set(ipHash, (b.ipFail.get(ipHash) ?? 0) + 1);
  } else {
    b.ipCapExceeded = true; // yeni IP izlenemedi (bellek tavanı) — dağıtık saldırı görünürlüğü
  }
}

export function recordRateLimited(): void {
  currentBucket().rate429 += 1;
}

export function recordUnhandled(): void {
  currentBucket().unhandled500 += 1;
}

export interface MetricsWindow {
  windowMinutes: number;
  total: number;
  s2xx: number;
  s4xx: number;
  s5xx: number;
  auth401: number;
  rate429: number;
  unhandled500: number;
  maxIpFail: number; // tek bir IP-hash'in pencere içindeki en yüksek 401 sayısı
  ipCapExceeded: boolean; // pencerede herhangi bir bucket IP_CAP'i aştı mı
  fivexxRate: number; // s5xx / total (0 if total=0)
}

export function windowSnapshot(): MetricsWindow {
  const minute = Math.floor(nowFn() / 60_000);
  const live = buckets.filter((b) => minute - b.startMinute < WINDOW_MINUTES);
  const agg = { total: 0, s2xx: 0, s4xx: 0, s5xx: 0, auth401: 0, rate429: 0, unhandled500: 0 };
  const ipTotals = new Map<string, number>();
  for (const b of live) {
    agg.total += b.total;
    agg.s2xx += b.s2xx;
    agg.s4xx += b.s4xx;
    agg.s5xx += b.s5xx;
    agg.auth401 += b.auth401;
    agg.rate429 += b.rate429;
    agg.unhandled500 += b.unhandled500;
    for (const [ip, n] of b.ipFail) ipTotals.set(ip, (ipTotals.get(ip) ?? 0) + n);
  }
  let maxIpFail = 0;
  for (const n of ipTotals.values()) if (n > maxIpFail) maxIpFail = n;
  return {
    windowMinutes: WINDOW_MINUTES,
    ...agg,
    maxIpFail,
    ipCapExceeded: live.some((b) => b.ipCapExceeded),
    fivexxRate: agg.total > 0 ? agg.s5xx / agg.total : 0,
  };
}
