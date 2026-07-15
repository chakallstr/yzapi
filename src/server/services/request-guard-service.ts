import { BadRequestError } from "../lib/errors.js";

export const MAX_OPERATION_CONTEXT_TOKENS = 1_000_000;
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 4_096;

// char/4 context tahmini (estimateRequestContextTokens) gerçek token sayısını DEĞİL,
// JSON-stringify edilmiş gövdenin BAYT'ını ölçer → sarmalayıcı anahtarlar + escape + tool_result
// yapısı yüzünden gerçek token'ın ~3-6 KATINA şişer (aynı dosyadaki resolveBilledPromptTokens
// notu 3-4× der; canlı ölçüm 2026-06-27: gpt-5.5 Claude-Code oturumu ~186k GERÇEK input token'da
// 1M guard'ını tetikledi → ~5.4×). Hard-reject'i bu şişmiş değerle HAM limitte yaparsak müşteri
// gerçekte pencerenin ~1/5-1/6'sında "1M context limit" 400'ü alır VE istemcinin auto-compact'i
// (tüm konuşmayı yollar) AYNI şişmeyle reddedilir → çıkışsız döngü ("compact'ta da böyle /
// context dolunca sıfırlanmıyor"). Bu yüzden reject eşiğini en kötü şişme faktörüyle gevşet:
// guard yalnız istek GERÇEKTEN pencereyi aşınca devreye girsin; asıl token tavanını zaten upstream
// tokenizer'ı (1M) + express.json 10mb gövde limiti uygular. Billing'e DOKUNMAZ —
// guard.contextTokens ham tahmin olarak aynen döner (resolveBilledPromptTokens floor'u değişmez);
// yalnız hard-reject karşılaştırması etkilenir. Değer 8: gözlenen 5.4× ve belgelenen ≤6× şişmenin
// üstüne pay bırakır — "fazla gevşek" zararsızdır (gerçek tavanı upstream reddeder + K1 ile 0 tahsil),
// "fazla sıkı" ise düzeltilen müşteri kesintisidir. (1M penceresi için 10mb gövde tavanı ~2.6M
// tahminde zaten kesişir → eşik pratikte yalnız küçük-pencere modellerde/paket limitinde ısırır.)
export const CONTEXT_GUARD_ESTIMATE_INFLATION = 8;

type GuardEndpoint = "chat" | "messages" | "responses";

interface GuardModel {
  maxOutputTokens?: number | null;
  supportsStreaming?: boolean | null;
}

interface BuildRequestGuardOptions {
  endpoint: GuardEndpoint;
  model: GuardModel;
  body: Record<string, unknown>;
  contextLimitTokens?: number;
  outputReserveTokens?: number;
  maxTokensPerRequest?: number;
  allowStreaming?: boolean;
  temperatureMin?: number;
  temperatureMax?: number;
  topPMin?: number;
  topPMax?: number;
  endpointEnabled?: boolean;
  // true → temperature/top_p/top_k upstream'e GÖNDERİLMEDEN strip edilir (Opus 4.7/4.8/Fable
  // bunları reddeder). Bu durumda aralık doğrulaması da atlanır (parametre nasılsa silinecek).
  rejectsSamplingParams?: boolean;
  // >0 ise reasoning modeli için max_tokens TABANI: istemci daha düşük bir max_tokens
  // (responses'ta max_output_tokens) gönderirse buna yükseltilir. Model tavanı cap'inden
  // ÖNCE uygulanır → tavanı aşmaz. Reasoning'in düşünmesinin cevabı yarıda kesmesini önler.
  reasoningOutputFloor?: number;
}

export interface RequestGuardResult {
  guardedBody: Record<string, unknown>;
  contextTokens: number;
  reservedCompletionTokens: number;
}

const NON_CONTEXT_KEYS = new Set([
  "model",
  "stream",
  "max_tokens",
  "max_output_tokens",
  "temperature",
  "top_p",
  "n",
  "stop",
  "stop_sequences",
  "presence_penalty",
  "frequency_penalty",
  "metadata",
  "user",
  "web_search",
  "customerId",
]);

// Reseller clients may include customerId in the request body for their own
// tracking. The gateway consumes it internally but must never forward it upstream.
const STRIP_BEFORE_UPSTREAM = new Set(["customerId"]);

// Opus 4.7/4.8/Fable/Mythos bunları reddeder (upstream 400). rejectsSamplingParams=true ise silinir.
const SAMPLING_PARAMS = ["temperature", "top_p", "top_k"] as const;

export function estimateTextTokens(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateRequestContextTokens(body: Record<string, unknown>): number {
  const contextPayload = Object.fromEntries(
    Object.entries(body).filter(([key]) => !NON_CONTEXT_KEYS.has(key)),
  );
  return estimateTextTokens(contextPayload);
}

// Faturalanacak giriş token'ı eşiği. Sağlayıcının normalize edilmiş giriş token'ı bu
// eşiğin ÜSTÜNDEYSE "geçerli rapor" sayılır ve doğrudan kullanılır (char/4 sunucu
// tahminiyle ŞİŞİRİLMEZ). Eşiğin ALTINDAYSA (sağlayıcı bariz-bozuk/≈0 raporladı) floor
// devreye girer. Gerçek kaçak imzası: sağlayıcı ≤6 token + cache yok (WellFlow prompt_tokens=2/6).
// 50 eşiği bu bozuk-raporları yakalar; geçerli en küçük istek bile normalize sonrası
// bunun çok üstündedir (canlı veri simülasyonuyla doğrulandı: iki küme arasında geniş pay).
export const PROVIDER_MIN_VALID_TOKENS = 50;

// Faturalanacak giriş token sayısını belirler (billing FORMÜLÜNE dokunmaz; yalnız hangi
// token sayısının settle'a gideceğini seçer).
//   • providerNormalizedPrompt > eşik → sağlayıcıya GÜVEN (char/4 ile şişirme). Bu, Claude Code
//     gibi büyük-JSON isteklerinde char/4'ün gerçeğin ~3-4 katına şişip FAZLA faturalamasını engeller.
//   • providerNormalizedPrompt ≤ eşik → floor: max(sağlayıcı, sunucu char/4 sayımı). Bu, sağlayıcı
//     girişi eksik/bozuk raporladığında (WellFlow prompt_tokens=2) EKSİK tahsili (bizim zararımız) engeller.
// Sonuç her durumda providerNormalizedPrompt'tan küçük olamaz (eksik tahsil yok).
export function resolveBilledPromptTokens(providerNormalizedPrompt: number, serverContextTokens: number): number {
  if (providerNormalizedPrompt > PROVIDER_MIN_VALID_TOKENS) {
    return providerNormalizedPrompt;
  }
  return Math.max(providerNormalizedPrompt, serverContextTokens);
}

function numericOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return null;
}

function resolveRequestedOutputTokens(
  endpoint: GuardEndpoint,
  model: GuardModel,
  body: Record<string, unknown>,
  outputReserveTokens: number,
  maxTokensPerRequest: number | undefined,
  reasoningOutputFloor: number | undefined,
) {
  const explicit = endpoint === "responses"
    ? numericOrNull(body.max_output_tokens)
    : numericOrNull(body.max_tokens);

  const maxModelOutput = model.maxOutputTokens && model.maxOutputTokens > 0
    ? Math.floor(model.maxOutputTokens)
    : null;

  const requested = explicit ?? outputReserveTokens;
  // Reasoning modeli tabanı: istemcinin küçük max_tokens'ı düşünmeyi yarıda kesmesin
  // diye yükselt. Cap'lerden ÖNCE → model tavanını (maxModelOutput) asla aşamaz.
  const floored = reasoningOutputFloor && reasoningOutputFloor > 0
    ? Math.max(requested, reasoningOutputFloor)
    : requested;
  const cappedByModel = maxModelOutput ? Math.min(floored, maxModelOutput) : floored;
  const capped = maxTokensPerRequest && maxTokensPerRequest > 0
    ? Math.min(cappedByModel, Math.floor(maxTokensPerRequest))
    : cappedByModel;

  return {
    explicit,
    reservedCompletionTokens: capped,
  };
}

function numericInRange(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function buildRequestGuard(opts: BuildRequestGuardOptions): RequestGuardResult {
  if (opts.endpointEnabled === false) {
    throw new BadRequestError("Bu API endpointi şu an yönetim panelinden kapatıldı.");
  }

  if (opts.body.stream === true) {
    const streamAllowed = opts.allowStreaming !== false && opts.model.supportsStreaming !== false;
    if (!streamAllowed) {
      throw new BadRequestError("Streaming bu endpoint veya model için kapalı.");
    }
  }

  // Sampling parametrelerini reddeden modellerde (Opus 4.7/4.8/Fable) aralık doğrulaması
  // ATLANIR — parametreler nasılsa aşağıda strip edilecek, dolayısıyla 400 atmaya gerek yok.
  if (!opts.rejectsSamplingParams) {
    const temperature = numericInRange(opts.body.temperature);
    if (
      temperature !== null &&
      opts.temperatureMin !== undefined &&
      opts.temperatureMax !== undefined &&
      (temperature < opts.temperatureMin || temperature > opts.temperatureMax)
    ) {
      throw new BadRequestError(`temperature ${opts.temperatureMin} ile ${opts.temperatureMax} arasında olmalı.`);
    }

    const topP = numericInRange(opts.body.top_p);
    if (
      topP !== null &&
      opts.topPMin !== undefined &&
      opts.topPMax !== undefined &&
      (topP < opts.topPMin || topP > opts.topPMax)
    ) {
      throw new BadRequestError(`top_p ${opts.topPMin} ile ${opts.topPMax} arasında olmalı.`);
    }
  }

  const contextTokens = estimateRequestContextTokens(opts.body);
  const contextLimitTokens = opts.contextLimitTokens && opts.contextLimitTokens > 0
    ? Math.floor(opts.contextLimitTokens)
    : MAX_OPERATION_CONTEXT_TOKENS;
  // Şişmiş char/4 tahminini HAM limitte değil, en kötü şişme-faktörüyle gevşetilmiş eşikte kes
  // (yukarıdaki CONTEXT_GUARD_ESTIMATE_INFLATION notu). guard.contextTokens AYNEN döner (billing).
  if (contextTokens > contextLimitTokens * CONTEXT_GUARD_ESTIMATE_INFLATION) {
    throw new BadRequestError(`Bu işlem ${contextLimitTokens} maksimum context limitini aşıyor. Lütfen girdiyi kısaltın veya parçalar halinde gönderin.`);
  }

  const outputReserveTokens = opts.outputReserveTokens && opts.outputReserveTokens > 0
    ? Math.floor(opts.outputReserveTokens)
    : DEFAULT_OUTPUT_RESERVE_TOKENS;
  const { reservedCompletionTokens } = resolveRequestedOutputTokens(
    opts.endpoint,
    opts.model,
    opts.body,
    outputReserveTokens,
    opts.maxTokensPerRequest,
    opts.reasoningOutputFloor,
  );
  const guardedBody = { ...opts.body };
  for (const key of STRIP_BEFORE_UPSTREAM) delete guardedBody[key];
  if (opts.rejectsSamplingParams) {
    for (const key of SAMPLING_PARAMS) delete guardedBody[key];
  }

  // thinking.budget_tokens Anthropic API'de zorunludur (type:"enabled" olduğunda).
  // İstemci bunu göndermeden thinking açarsa upstream Pydantic hatası döner.
  // Eksikse güvenli bir varsayılan enjekte et: max_tokens-1 ile 8000'in küçüğü (≥1024).
  const thinking = guardedBody.thinking;
  if (
    thinking !== null &&
    typeof thinking === "object" &&
    (thinking as Record<string, unknown>).type === "enabled" &&
    (thinking as Record<string, unknown>).budget_tokens == null
  ) {
    const defaultBudget = Math.max(1024, Math.min(8000, reservedCompletionTokens - 1));
    guardedBody.thinking = { ...(thinking as Record<string, unknown>), budget_tokens: defaultBudget };
  }

  if (opts.endpoint === "responses") {
    guardedBody.max_output_tokens = reservedCompletionTokens;
  } else {
    guardedBody.max_tokens = reservedCompletionTokens;
  }

  return {
    guardedBody,
    contextTokens,
    reservedCompletionTokens,
  };
}
