// Gözcü — job liveness heartbeat (in-memory).
//
// Her cron job çevriminin başında recordHeartbeat(jobAdı) çağrılır. Gözcü'nün
// job_liveness check'i `now - lastRun > 2×expected` ise alarm verir. Uygulama-içi
// olduğu için "süreç yaşıyor ama bir cron sessizce durdu" durumunu yakalar; sürecin
// tümden ölümünü DIŞ heartbeat (scripts/gozcu-heartbeat.mjs) yakalar.

const HEARTBEATS = new Map<string, number>();
let nowFn: () => number = () => Date.now();
let jobsStartedMs: number | null = null;

// Yalnız test.
export function __setClock(fn: () => number): void {
  nowFn = fn;
}
export function __reset(): void {
  HEARTBEATS.clear();
  jobsStartedMs = null;
}

// startAllJobs() tarafından çağrılır: "hiç çalışmamış" job'u yalnız job'lar başlatıldıktan
// sonra stale sayabilmek için boot anını işaretler (test/dev'de false-positive olmasın).
export function markJobsStarted(): void {
  jobsStartedMs = nowFn();
}

export function recordHeartbeat(job: string): void {
  HEARTBEATS.set(job, nowFn());
}

// Yalnız recordHeartbeat() çağıran job'lar izlenir (aksi halde "hiç çalışmadı" yanlış-
// pozitifi olur). Faz 1: mali-izleme + gozcu. Diğer job'lara recordHeartbeat eklendikçe
// buraya eklenir.
export const EXPECTED_INTERVAL_SEC: Record<string, number> = {
  "mali-izleme-job": 60,
  "gozcu-job": 60,
};

export interface HeartbeatStatus {
  job: string;
  lastRunMs: number | null;
  ageSec: number | null;
  expectedSec: number;
  stale: boolean;
}

export function snapshotHeartbeats(): HeartbeatStatus[] {
  const now = nowFn();
  return Object.entries(EXPECTED_INTERVAL_SEC).map(([job, expectedSec]) => {
    const last = HEARTBEATS.get(job) ?? null;
    const ageSec = last === null ? null : Math.floor((now - last) / 1000);
    // Bir kez çalışıp durduysa: yaş > 2×beklenen → stale.
    const ranThenStopped = last !== null && ageSec !== null && ageSec > expectedSec * 2;
    // Hiç çalışmadıysa: yalnız job'lar başlatıldıysa ve makul süre geçtiyse stale.
    const neverRanStale =
      last === null && jobsStartedMs !== null && (now - jobsStartedMs) / 1000 > expectedSec * 2;
    return { job, lastRunMs: last, ageSec, expectedSec, stale: ranThenStopped || neverRanStale };
  });
}
