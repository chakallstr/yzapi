// Lane-based rate-limit scheduler for Bedrock inference profiles.
//
// Her lane = bir provider_profiles satırı (model + region). Scheduler priority
// sırasıyla lane seçer: sonnet-geo → sonnet-global → opus-geo → opus-global → haiku.
// Per-lane RPM cooldown (sliding window) + 429/503 backoff + queue.
//
// İstemci claude-sonnet-4-6 ister → scheduler uygun ilk lane'e dispatch eder.
// Opus/Haiku lane'ine düşerse bile identity relabel "Claude Sonnet 4.6" kalır
// (proxy.ts applyIdentityRelabel masterModel.id ile çalışır, lane model'i ile değil).

import { readAllEnabledProfiles, type ParsedProfile, type ProviderContext } from "./provider-config-service.js";
import { providerSupportsModelId } from "./provider-config-service.js";

// ── In-memory state (process-scoped, 5s TTL cache ile senkron) ───────────────

// Sliding window: her lane için son 60 saniyedeki dispatch timestamp'leri
const laneDispatchTimes: Map<string, number[]> = new Map();

// Backoff: lane → backoff bitiş timestamp'i (epoch ms)
const laneBackoffUntil: Map<string, number> = new Map();

// Queue: tüm lane'ler doluyken bekleyen istekler.
//
// `modelId` ZORUNLU: kuyruk tek ve global olduğu için, model kimliği olmadan
// drainQueue çağıran HANGİ model olursa olsun sıradaki bekleyeni kendi lane'iyle
// çözüyordu — Sonnet bekleyen bir istek başka bir modelin upstream'ine gidebilirdi.
// Bugün yalnız Sonnet lane grubu olduğu için gizliydi; ikinci grup eklendiği an
// yanlış sağlayıcıya yönlenme demekti.
interface QueuedRequest {
  modelId: string;
  resolve: (ctx: ProviderContext) => void;
  reject: (err: Error) => void;
  enqueuedAt: number;
  timer: NodeJS.Timeout;
}
const requestQueue: QueuedRequest[] = [];

const WINDOW_MS = 60_000; // 60 saniye sliding window (RPM = requests per minute)
const DEFAULT_BACKOFF_MS = 5_000; // 429/503 sonrası 5sn backoff (Retry-After yoksa)
const MAX_BACKOFF_MS = 120_000; // Retry-After ne derse desen üst sınır — lane sonsuza kilitlenmesin
const QUEUE_POLL_INTERVAL_MS = 500; // queue boşalınca 500ms'de bir lane kontrol

// ── Lane resolution ──────────────────────────────────────────────────────────

export interface LaneInfo {
  profile: ParsedProfile;
  priority: number;
  rpmLimit: number;
}

// Kanonik model ID için tüm lane'leri priority sırasıyla döndürür.
// Lane = lanePriority null olmayan, apiKey olan, model'i destekleyen profil.
export async function resolveLanesForModel(canonicalModelId: string): Promise<LaneInfo[]> {
  const profiles = await readAllEnabledProfiles();
  const lanes: LaneInfo[] = [];
  for (const p of profiles) {
    // Lane profili: lanePriority set + apiKey var + model destekleniyor
    if (p.lanePriority === null || !p.apiKey) continue;
    if (!providerSupportsModelId(p.supportedModelIds, canonicalModelId)) continue;
    lanes.push({
      profile: p,
      priority: p.lanePriority,
      rpmLimit: p.rpmLimit ?? Infinity, // NULL rpm = sınırsız
    });
  }
  // Priority sırasına göre (1 = en yüksek)
  lanes.sort((a, b) => a.priority - b.priority);
  return lanes;
}

// Bir lane şu an dispatch edilebilir mi? RPM cooldown + backoff kontrolü.
export function isLaneAvailable(lane: LaneInfo, now: number = Date.now()): boolean {
  // Backoff kontrolü
  const backoffUntil = laneBackoffUntil.get(lane.profile.id);
  if (backoffUntil !== undefined && now < backoffUntil) return false;

  // RPM sliding window: son 60 saniyedeki dispatch sayısı
  const times = laneDispatchTimes.get(lane.profile.id) ?? [];
  const windowStart = now - WINDOW_MS;
  const recentCount = times.filter((t) => t > windowStart).length;
  return recentCount < lane.rpmLimit;
}

// Priority sırasıyla ilk uygun lane'i bul ve acquire et.
// Uygun lane yoksa null döner (çağıran queue'ya alır).
export function acquireLane(lanes: LaneInfo[], now: number = Date.now()): LaneInfo | null {
  for (const lane of lanes) {
    if (isLaneAvailable(lane, now)) {
      // Dispatch kaydı: sliding window'a timestamp ekle
      const times = laneDispatchTimes.get(lane.profile.id) ?? [];
      times.push(now);
      // Eski timestamp'leri temizle (60sn'den eski)
      const windowStart = now - WINDOW_MS;
      laneDispatchTimes.set(
        lane.profile.id,
        times.filter((t) => t > windowStart),
      );
      return lane;
    }
  }
  return null;
}

// Lane'i ProviderContext'e çevir (forward fonksiyonları için).
export function laneToContext(lane: LaneInfo): ProviderContext {
  const p = lane.profile;
  return {
    profileId: p.id,
    baseUrl: p.baseUrl,
    apiKey: p.apiKey,
    modelMap: p.modelMap,
    source: { baseUrl: "model_profile", apiKey: "model_profile" },
  };
}

// ── Backoff ──────────────────────────────────────────────────────────────────

// 429/503 alındığında o lane'i backoff'a al. Süre dolunca otomatik kullanılabilir.
export function recordLaneBackoff(profileId: string, durationMs: number = DEFAULT_BACKOFF_MS): void {
  laneBackoffUntil.set(profileId, Date.now() + durationMs);
}

// Upstream'in Retry-After başlığını saygı gösteren backoff. Başlık yok/geçersizse
// sabit DEFAULT_BACKOFF_MS. Saniye (delta-seconds) ve HTTP-date biçimleri desteklenir.
export function backoffMsFromRetryAfter(
  retryAfter: string | null | undefined,
  now: number = Date.now(),
): number {
  if (!retryAfter) return DEFAULT_BACKOFF_MS;
  const trimmed = retryAfter.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  }
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    const delta = asDate - now;
    if (delta > 0) return Math.min(delta, MAX_BACKOFF_MS);
    return DEFAULT_BACKOFF_MS;
  }
  return DEFAULT_BACKOFF_MS;
}

// Acquire edilmiş ama KULLANILMAYAN lane'in RPM kotasını geri verir.
//
// resolveLaneAwareChain lane'i zincir kurulurken acquire ediyor; ardından CF/paket
// override zinciri tamamen değiştirebiliyor. O durumda lane'e hiç istek gitmediği
// hâlde sayaç yanmış kalıyordu (hayalet tüketim) — canlıda 36 aktif CF-override
// hakkı olduğu için her Claude isteği bir Sonnet kotası yakıyordu.
export function releaseLane(profileId: string): void {
  const times = laneDispatchTimes.get(profileId);
  if (!times || times.length === 0) return;
  times.pop(); // en son eklenen dispatch kaydını geri al
  if (times.length === 0) laneDispatchTimes.delete(profileId);
  else laneDispatchTimes.set(profileId, times);
}

// Başarılı dispatch sonrası backoff'u temizle (lane sağlıklı).
export function clearLaneBackoff(profileId: string): void {
  laneBackoffUntil.delete(profileId);
}

// ── Queue ─────────────────────────────────────────────────────────────────────

// Tüm lane'ler doluyken isteği queue'ya al. Bir lane boşalınca dispatch eder.
// timeoutMs süresinde lane bulunamazsa reject eder.
export function enqueueRequest(
  modelId: string,
  lanes: LaneInfo[],
  timeoutMs: number = 30_000,
): Promise<ProviderContext> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = requestQueue.findIndex((r) => r.resolve === resolve);
      if (idx >= 0) requestQueue.splice(idx, 1);
      reject(new Error("All lanes busy — queue timeout"));
    }, timeoutMs);

    requestQueue.push({
      modelId,
      resolve,
      reject,
      enqueuedAt: Date.now(),
      timer,
    });

    // Hemen bir lane denemesi yap (belki bu sırada biri boşalmıştır)
    void drainQueue(modelId, lanes);
  });
}

// Queue'daki istekleri uygun lane'lere dispatch et.
// Her dispatch sonrası veya backoff süresi dolduğunda çağrılır.
export async function drainQueue(modelId: string, lanes: LaneInfo[]): Promise<void> {
  if (requestQueue.length === 0) return;
  const now = Date.now();

  // FIFO: en ESKİ bekleyenden başla. Önceki sürüm diziyi sondan tarıyordu (LIFO),
  // yani yoğunlukta ilk gelen istek süresiz açlığa düşebiliyordu.
  // Yalnız AYNI modeli bekleyenler bu lane grubuyla çözülür.
  for (let i = 0; i < requestQueue.length;) {
    const req = requestQueue[i];
    if (req.modelId !== modelId) { i++; continue; }
    const lane = acquireLane(lanes, now);
    if (!lane) break; // ilk uygun lane yok → gerisi de dolu, dur
    requestQueue.splice(i, 1);
    clearTimeout(req.timer);
    req.resolve(laneToContext(lane));
  }

  // Hâlâ bu modeli bekleyen varsa ve bir lane backoff'ta → süre dolunca tekrar dene
  if (requestQueue.some((r) => r.modelId === modelId)) {
    scheduleNextDrain(modelId, lanes);
  }
}

// En yakın backoff bitişine kadar bekle, sonra drainQueue tekrar çağır.
function scheduleNextDrain(modelId: string, lanes: LaneInfo[]): void {
  const now = Date.now();
  let earliestBackoff = Infinity;
  for (const lane of lanes) {
    const until = laneBackoffUntil.get(lane.profile.id);
    if (until !== undefined && until > now) {
      earliestBackoff = Math.min(earliestBackoff, until);
    }
  }
  if (earliestBackoff === Infinity) {
    // Backoff yok, RPM cooldown bekleniyor — en yakın dispatch timestamp'i + 60s
    let earliestRpmReset = Infinity;
    for (const lane of lanes) {
      const times = laneDispatchTimes.get(lane.profile.id) ?? [];
      if (times.length > 0) {
        const oldest = Math.min(...times);
        earliestRpmReset = Math.min(earliestRpmReset, oldest + WINDOW_MS);
      }
    }
    const waitMs = earliestRpmReset === Infinity ? QUEUE_POLL_INTERVAL_MS : Math.min(QUEUE_POLL_INTERVAL_MS, earliestRpmReset - now + 10);
    setTimeout(() => void drainQueue(modelId, lanes), Math.max(10, waitMs)).unref?.();
  } else {
    const waitMs = earliestBackoff - now + 10;
    setTimeout(() => void drainQueue(modelId, lanes), Math.max(10, waitMs)).unref?.();
  }
}

// ── Test helpers ─────────────────────────────────────────────────────────────

// Testler için in-memory state'i sıfırla.
export function resetLaneSchedulerState(): void {
  laneDispatchTimes.clear();
  laneBackoffUntil.clear();
  requestQueue.length = 0;
}

// Testler için lane dispatch sayısını oku.
export function getLaneDispatchCount(profileId: string): number {
  return (laneDispatchTimes.get(profileId) ?? []).length;
}

// Testler için lane backoff durumunu oku.
export function getLaneBackoffUntil(profileId: string): number | undefined {
  return laneBackoffUntil.get(profileId);
}

// Testler için queue uzunluğunu oku.
export function getQueueLength(): number {
  return requestQueue.length;
}
