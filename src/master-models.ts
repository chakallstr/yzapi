export type ModelModality = "audio" | "image" | "text" | "video";

export interface MasterModelEndpoint {
  type: string;
  supportsStreaming: boolean;
  supportedParameters: string[];
}

export interface MasterModel {
  id: string;
  name: string;
  provider: string;
  providerSlug?: string;
  type: "Metin" | "Görsel" | "Video";
  context: string;
  contextTokens?: number | null;
  maxOutputTokens?: number | null;
  description?: string | null;
  aliases?: string[];
  inputModalities?: ModelModality[];
  outputModalities?: ModelModality[];
  endpoints: string[];
  endpointDetails?: MasterModelEndpoint[];
  supportedParameters?: string[];
  pricingUnit?: "usd_per_million_tokens" | "usd_per_second";
  customerInputUsd?: number;
  customerOutputUsd?: number;
  providerInputUsd?: number;
  providerOutputUsd?: number;
  providerImageInputUsd?: number;
  providerImageOutputUsd?: number;
  providerPerSecond?: {
    default?: number;
    "480p"?: number;
    "720p"?: number;
    "1080p"?: number;
  };
}

const CHAT_PARAMS = ["model", "messages", "max_tokens", "temperature", "top_p", "stream", "stop", "tools", "tool_choice"];
const MESSAGE_PARAMS = ["model", "messages", "max_tokens", "system", "temperature", "top_p", "stream", "stop_sequences", "tools", "tool_choice"];
const TEXT_ENDPOINT_DETAILS: MasterModelEndpoint[] = [
  { type: "chat", supportsStreaming: true, supportedParameters: CHAT_PARAMS },
  { type: "messages", supportsStreaming: true, supportedParameters: MESSAGE_PARAMS },
];
const TEXT_ENDPOINTS = TEXT_ENDPOINT_DETAILS.map((endpoint) => endpoint.type);
const TEXT_SUPPORTED_PARAMETERS = Array.from(new Set(TEXT_ENDPOINT_DETAILS.flatMap((endpoint) => endpoint.supportedParameters)));

const CUSTOMER_PRICE_OVERRIDES = new Map<string, number>([
  ["gpt-5.5", 0.96],
  ["gpt-5.5-2026-04-23", 0.96],
  ["gpt-5.4", 0.83],
  ["gpt-5.4-2026-03-05", 0.83],
  ["gpt-5.4-mini", 0.75],
  ["gpt-5.4-mini-2026-03-17", 0.75],
  ["gpt-5.4-nano", 0.71],
  ["gpt-5.4-nano-2026-03-17", 0.71],
  ["gpt-5.3-chat-latest", 0.67],
  ["gpt-5.2", 0.63],
  ["gpt-5.2-2025-12-11", 0.63],
  ["gpt-5.2-chat-latest", 0.63],
  ["o3", 0.63],
  ["o3-2025-04-16", 0.63],
  ["gpt-5.1", 0.6],
  ["gpt-5.1-2025-11-13", 0.6],
  ["gpt-5.1-chat-latest", 0.6],
  ["o4-mini", 0.6],
  ["o4-mini-2025-04-16", 0.6],
  ["gpt-5", 0.58],
  ["gpt-5-2025-08-07", 0.58],
  ["o3-mini", 0.57],
  ["o3-mini-2025-01-31", 0.57],
  ["gpt-5-search-api", 0.55],
  ["gpt-5-search-api-2025-10-14", 0.55],
  ["gpt-5-chat-latest", 0.54],
  ["gpt-5-mini", 0.53],
  ["gpt-5-mini-2025-08-07", 0.53],
  ["gpt-5-nano", 0.52],
  ["gpt-5-nano-2025-08-07", 0.52],
  ["gemini-3.1-pro-preview", 0.71],
  ["gemini-3.1-pro-preview-customtools", 0.71],
  ["gemini-3-pro-preview", 0.58],
  ["gemini-3-flash-preview", 0.58],
]);

function familyPrice(id: string): number {
  if (id === "claude-opus-4-7") return 1.25;
  if (id === "claude-opus-4-6") return 1.05;
  if (id === "claude-sonnet-4-6") return 0.78;
  if (id === "claude-haiku-4-5-20251001") return 0.70;
  return CUSTOMER_PRICE_OVERRIDES.get(id) ?? 0.52;
}

const MODEL_DISPLAY_ORDER = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-1-20250805",
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-5-20251101",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-pro-preview-customtools",
  "o3-mini-2025-01-31",
  "o3-mini",
  "o3-2025-04-16",
  "o3",
  "o4-mini-2025-04-16",
  "o4-mini",
  "gpt-5-2025-08-07",
  "gpt-5",
  "gpt-5-mini-2025-08-07",
  "gpt-5-mini",
  "gpt-5-nano-2025-08-07",
  "gpt-5-nano",
  "gpt-5-search-api-2025-10-14",
  "gpt-5-search-api",
  "gpt-5-chat-latest",
  "gpt-5.1-2025-11-13",
  "gpt-5.1",
  "gpt-5.1-chat-latest",
  "gpt-5.2-2025-12-11",
  "gpt-5.2",
  "gpt-5.2-chat-latest",
  "gpt-5.3-chat-latest",
  "gpt-5.4-2026-03-05",
  "gpt-5.4",
  "gpt-5.4-mini-2026-03-17",
  "gpt-5.4-mini",
  "gpt-5.4-nano-2026-03-17",
  "gpt-5.4-nano",
  "claude-opus-4-7",
  "gpt-5.5",
  "gpt-5.5-2026-04-23",
];

const MODEL_DISPLAY_INDEX = new Map(MODEL_DISPLAY_ORDER.map((id, index) => [id, index]));

function textModel(opts: {
  id: string;
  name: string;
  provider: string;
  providerSlug: string;
  context: string;
  contextTokens?: number;
  maxOutputTokens?: number;
  aliases?: string[];
  inputModalities?: ModelModality[];
  price?: number;
}): MasterModel {
  const price = opts.price ?? familyPrice(opts.id);
  return {
    id: opts.id,
    name: opts.name,
    provider: opts.provider,
    providerSlug: opts.providerSlug,
    type: "Metin",
    context: opts.context,
    contextTokens: opts.contextTokens ?? null,
    maxOutputTokens: opts.maxOutputTokens ?? 128000,
    description: null,
    aliases: opts.aliases,
    inputModalities: opts.inputModalities ?? ["text"],
    outputModalities: ["text"],
    endpoints: TEXT_ENDPOINTS,
    endpointDetails: TEXT_ENDPOINT_DETAILS,
    supportedParameters: TEXT_SUPPORTED_PARAMETERS,
    pricingUnit: "usd_per_million_tokens",
    customerInputUsd: price,
    customerOutputUsd: price,
  };
}

export const MASTER_MODELS: MasterModel[] = [
  textModel({ id: "claude-opus-4-7", name: "Claude Opus 4.7", provider: "Anthropic", providerSlug: "anthropic", context: "1M", contextTokens: 1000000, aliases: ["anthropic/claude-opus-4.7", "anthropic/claude-opus-4-7", "claude-opus-4.7"] }),
  textModel({ id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "Anthropic", providerSlug: "anthropic", context: "1M", contextTokens: 1000000, aliases: ["anthropic/claude-opus-4.6", "anthropic/claude-opus-4-6", "claude-opus-4.6"] }),
  textModel({ id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5", provider: "Anthropic", providerSlug: "anthropic", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "claude-opus-4-1-20250805", name: "Claude Opus 4.1", provider: "Anthropic", providerSlug: "anthropic", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic", providerSlug: "anthropic", context: "1M", contextTokens: 1000000, aliases: ["anthropic/claude-sonnet-4.6", "anthropic/claude-sonnet-4-6", "claude-sonnet-4.6"], inputModalities: ["text", "image"] }),
  textModel({ id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", provider: "Anthropic", providerSlug: "anthropic", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "Anthropic", providerSlug: "anthropic", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "Anthropic", providerSlug: "anthropic", context: "200K", contextTokens: 200000, aliases: ["anthropic/claude-haiku-4.5", "anthropic/claude-haiku-4-5", "anthropic/claude-haiku-4-5-20251001"] }),
  // codex-auto-review: Codex CLI, onay/auto-review modunda riskli komuttan önce
  // bu id ile küçük bir "komut güvenli mi?" çağrısı atar. Upstream'lerde böyle bir
  // model yok → 404. gpt-5.5'e ALIAS olarak bağlanır: koltuk-servisli gpt-5.5'e
  // çözülür, müşterinin gpt-5.5 paketi/key'i coverage'ı kapsar (402 olmaz). Alias
  // 42-kilidi BOZMAZ (entry sayısı/id değişmez) ve /v1/models'te GÖRÜNMEZ.
  textModel({ id: "gpt-5.5", name: "GPT-5.5", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000, aliases: ["codex-auto-review"] }),
  textModel({ id: "gpt-5.5-2026-04-23", name: "GPT-5.5 2026-04-23", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5.4", name: "GPT-5.4", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000, aliases: ["openai/gpt-5.4"] }),
  textModel({ id: "gpt-5.4-2026-03-05", name: "GPT-5.4 2026-03-05", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5.4-mini", name: "GPT-5.4 mini", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000, aliases: ["openai/gpt-5.4-mini"] }),
  textModel({ id: "gpt-5.4-mini-2026-03-17", name: "GPT-5.4 mini 2026-03-17", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5.4-nano", name: "GPT-5.4 nano", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5.4-nano-2026-03-17", name: "GPT-5.4 nano 2026-03-17", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5.3-chat-latest", name: "GPT-5.3 Chat Latest", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5.2", name: "GPT-5.2", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5.2-2025-12-11", name: "GPT-5.2 2025-12-11", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5.2-chat-latest", name: "GPT-5.2 Chat Latest", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5.1", name: "GPT-5.1", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5.1-2025-11-13", name: "GPT-5.1 2025-11-13", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5.1-chat-latest", name: "GPT-5.1 Chat Latest", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5", name: "GPT-5", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5-2025-08-07", name: "GPT-5 2025-08-07", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5-chat-latest", name: "GPT-5 Chat Latest", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5-mini", name: "GPT-5 mini", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5-mini-2025-08-07", name: "GPT-5 mini 2025-08-07", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5-nano", name: "GPT-5 nano", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5-nano-2025-08-07", name: "GPT-5 nano 2025-08-07", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5-search-api", name: "GPT-5 Search API", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gpt-5-search-api-2025-10-14", name: "GPT-5 Search API 2025-10-14", provider: "OpenAI", providerSlug: "openai", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "o4-mini", name: "o4-mini", provider: "OpenAI", providerSlug: "openai", context: "200K", contextTokens: 200000 }),
  textModel({ id: "o4-mini-2025-04-16", name: "o4-mini 2025-04-16", provider: "OpenAI", providerSlug: "openai", context: "200K", contextTokens: 200000 }),
  textModel({ id: "o3", name: "o3", provider: "OpenAI", providerSlug: "openai", context: "200K", contextTokens: 200000, aliases: ["openai/o3"] }),
  textModel({ id: "o3-2025-04-16", name: "o3 2025-04-16", provider: "OpenAI", providerSlug: "openai", context: "200K", contextTokens: 200000 }),
  textModel({ id: "o3-mini", name: "o3-mini", provider: "OpenAI", providerSlug: "openai", context: "200K", contextTokens: 200000 }),
  textModel({ id: "o3-mini-2025-01-31", name: "o3-mini 2025-01-31", provider: "OpenAI", providerSlug: "openai", context: "200K", contextTokens: 200000 }),
  textModel({ id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", provider: "Google", providerSlug: "google", context: "1M", contextTokens: 1000000, aliases: ["google/gemini-3.1-pro-preview"] }),
  textModel({ id: "gemini-3.1-pro-preview-customtools", name: "Gemini 3.1 Pro Preview Custom Tools", provider: "Google", providerSlug: "google", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", provider: "Google", providerSlug: "google", context: "1M", contextTokens: 1000000 }),
  textModel({ id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", provider: "Google", providerSlug: "google", context: "1M", contextTokens: 1000000 }),
].sort((a, b) => (MODEL_DISPLAY_INDEX.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (MODEL_DISPLAY_INDEX.get(b.id) ?? Number.MAX_SAFE_INTEGER));

const MODEL_ALIAS_TO_ID = new Map<string, string>();
for (const model of MASTER_MODELS) {
  MODEL_ALIAS_TO_ID.set(model.id, model.id);
  for (const alias of model.aliases ?? []) MODEL_ALIAS_TO_ID.set(alias, model.id);
}

// added_models katmanındaki modeller alias taşımaz (yalnız tek bir kanonik id).
// Bazı modeller katalogda NOKTA formuyla kayıtlı (örn. "claude-opus-4.8") ama
// istemci (Claude Code) TİRE formu gönderiyor ("claude-opus-4-8"). MASTER_MODELS
// alias tablosu bunları kapsamadığından, added-model tire→nokta köprüsünü burada
// statik tutuyoruz. 42-kilit korunur (MASTER_MODELS'e EKLENMEZ). Yalnız wire-name
// normalizasyonu — upstream nokta formunu kabul eder; fatura/fiyat değişmez.
const ADDED_MODEL_DASH_TO_DOT: Record<string, string> = {
  "claude-opus-4-8": "claude-opus-4.8",
};

// Bazı istemciler (örn. Claude Code) model adının sonuna context/beta etiketi
// ekler: "claude-sonnet-4-6[1m]". Bizim katalog kanonik ID'leri böyle bir ek
// taşımaz. Strateji: önce TAM eşleşme dene (geçerli/bilinen id'yi ASLA değiştirme),
// olmazsa "[..]" ekini ayıkla ve tekrar dene. Strip edilen biçim de bilinmiyorsa
// orijinali AYNEN döndür — böylece sonu "[..]" ile biten meşru added-model id'leri
// bozulmaz (P7 round-trip). Yalnız wire-name normalizasyonu; fatura/fiyat değişmez.
export function canonicalizeModelId(modelId: string | undefined): string | undefined {
  if (!modelId) return modelId;
  // 1) Tam eşleşme: alias tablosu veya added-model tire→nokta köprüsü.
  const exact = MODEL_ALIAS_TO_ID.get(modelId) ?? ADDED_MODEL_DASH_TO_DOT[modelId];
  if (exact) return exact;
  // 2) Sondaki "[..]" context/beta etiketini ayıkla, sadece BİLİNEN bir id'ye
  //    çözülüyorsa kullan.
  const stripped = modelId.replace(/\[[^\]]*\]\s*$/, "").trim();
  if (stripped !== modelId) {
    const viaStrip = MODEL_ALIAS_TO_ID.get(stripped) ?? ADDED_MODEL_DASH_TO_DOT[stripped];
    if (viaStrip) return viaStrip;
  }
  // 3) Bilinmeyen id → orijinali aynen koru (geriye-uyumlu; bracket'li id'ler sağ kalır).
  return modelId;
}

// Opus 4.7'den itibaren (4.7, 4.8) + Fable/Mythos ailesi sampling parametrelerini
// (temperature/top_p/top_k) KABUL ETMEZ: upstream 400 "temperature is deprecated for
// this model" döndürür. Cline/Roo/Codex gibi istemciler bu parametreleri VARSAYILAN
// gönderdiği için gateway, bu modellere forward etmeden ÖNCE striplemeli. Eski Claude
// modelleri (opus 4.6/4.5, sonnet 4.x, haiku) bunları hâlâ kabul eder — onlara dokunma.
const SAMPLING_PARAM_REJECTING_MODELS = new Set<string>([
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-fable-5",
  "claude-mythos-5",
]);

export function modelRejectsSamplingParams(modelId: string | undefined): boolean {
  if (!modelId) return false;
  const canonical = canonicalizeModelId(modelId) ?? modelId;
  // Kanonik id'ler karışık biçimde (opus-4.8 NOKTA, opus-4-7 TİRE) — tireye normalize et.
  const dash = canonical.replace(/\./g, "-");
  return SAMPLING_PARAM_REJECTING_MODELS.has(dash);
}

// Reasoning ("düşünme") modelleri: gizli reasoning token'ları ÇIKTI bütçesini yer.
// Codex/Cline/Roo gibi istemciler çok düşük bir max_tokens (veya max_completion/
// max_output_tokens) gönderirse düşünme o küçük bütçeyi tüketir ve cevap YARIDA
// KESİLİR ("düşünmeler yarıda kesiliyor"). Bu yüzden gateway bu modeller için
// max_tokens'a bir TABAN (floor) uygular (request-guard'da Math.max ile, model
// tavanı cap'inden ÖNCE → tavanı asla aşmaz). modelRejectsSamplingParams ile
// AYNI normalize deseni. Set DAR: yalnız reasoning modelleri; -mini/-nano/
// -chat-latest gibi varyantlara dokunma. Yeni reasoning modeli gelince ekle.
const REASONING_OUTPUT_FLOOR_TOKENS = 12000;
const REASONING_OUTPUT_FLOOR_MODELS = new Set<string>([
  "gpt-5-5",
  "gpt-5-5-2026-04-23",
  "gpt-5-4",
  "gpt-5-4-2026-03-05",
  "o3",
  "o3-2025-04-16",
  "o3-mini",
  "o3-mini-2025-01-31",
  "o4-mini",
  "o4-mini-2025-04-16",
]);

// Reasoning modelinde uygulanacak çıktı tabanı (token); reasoning değilse 0.
export function modelReasoningOutputFloor(modelId: string | undefined): number {
  if (!modelId) return 0;
  const canonical = canonicalizeModelId(modelId) ?? modelId;
  const dash = canonical.replace(/\./g, "-");
  return REASONING_OUTPUT_FLOOR_MODELS.has(dash) ? REASONING_OUTPUT_FLOOR_TOKENS : 0;
}
