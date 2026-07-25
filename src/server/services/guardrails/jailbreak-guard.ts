import type { GuardDetection, GuardInput, GuardModule, GuardModuleResult } from "./types.js";

// Jailbreak / prompt-injection guard (faz1). OmniRoute promptInjection.ts mantığını taklit eder.
// ⚠️ KRİTİK BAĞLAM: yzapi bir CODING + AI-ALTYAPI gateway'i. Jailbreak kelime hazinesi alan
// kelime hazinesiyle birebir çakışır (tokenizer kodu `<|im_start|>`, "DAN modülü", "unrestricted
// model server", "content moderation policy", "jailbroken iPhone tespiti", "developer mode").
// Bu yüzden BLOCK modu doğası gereği FP riskli → severity modeli iki katmanlı ve HIGH MİNİMAL:
//   HIGH   = neredeyse-hiç-legit-coding-anlamı-olmayan açık jailbreak ifadeleri → default 'high' eşikte BLOKLAR.
//            (jailbroken, "stay in character as DAN", "do anything now mode", "AIM mode", uncensored/unrestricted AI/assistant)
//   MEDIUM = dual-use / alan-çakışmalı sinyaller (ChatML/[INST] kontrol token'ları, "ignore previous
//            instructions", "disable your safety guidelines", generic bypass-safety, system-prompt-leak)
//            → tespit/log edilir ama default 'high' eşikte BLOKLAMAZ. Operatör threshold='medium' ile sıkılaştırabilir.
// Önerilen kullanım: LOG/WARN (gözlemlenebilirlik). BLOCK yalnız operatör bilinçli + dar kapsamda.
// Desenler /g KULLANMAZ (stateless) + 16KB tarama sınırı (ReDoS yok).

const MAX_SCAN_BYTES = 16 * 1024;

type Sev = "low" | "medium" | "high";
const SEV_ORDER: Record<Sev, number> = { low: 1, medium: 2, high: 3 };

export interface JailbreakPattern {
  name: string;
  re: RegExp; // ⚠️ /g KULLANMA — .test() lastIndex statefulness; bounded quantifier (ReDoS yok)
  severity: Sev;
}

export const DEFAULT_GUARD_PATTERNS: JailbreakPattern[] = [
  // ── HIGH: minimal, neredeyse-hiç-legit-coding-anlamı-olmayan açık jailbreak (default 'high' eşikte bloklar) ──
  {
    name: "jailbreak_persona",
    severity: "high",
    re: /\bjailbro?ken\b(?!\s+(?:device|iphone|ipad|ios|android|phone|tablet|console|root|detection|check|status|jailbreak))|\bstay\s+in\s+character\s+as\s+dan\b|\bdo\s+anything\s+now\s+mode\b|\bAIM\s+(?:mode|prompt)\b/i,
  },
  {
    // "uncensored/unrestricted AI/assistant" — yalnız asistanı hedefleyen formlar (model/gpt/server DEĞİL → infra FP yok)
    name: "unrestricted_assistant",
    severity: "high",
    re: /\b(?:unrestricted|uncensored|unfiltered|unbound)\s+(?:a\.?i\.?\b|assistant|chatbot)\b/i,
  },

  // ── MEDIUM: dual-use / alan-çakışmalı; tespit edilir/loglanır ama default 'high' eşikte BLOKLAMAZ ──
  {
    // Gerçek enjeksiyon sinyali AMA coding gateway'de yapıştırma/tartışma yaygın → medium
    name: "chatml_control_tokens",
    severity: "medium",
    re: /<\|(?:im_start|im_end|system|user|assistant|endoftext)\|>|\[\/?INST\]|<<\/?SYS>>/i,
  },
  {
    name: "dan_persona_naming", // "you are now DAN / act as DAN" — DAN bir isim/akronim de olabilir → medium
    severity: "medium",
    re: /\b(?:you\s+are\s+(?:now\s+)?dan\b|act\s+as\s+dan\b|from\s+now\s+on[, ]+you\s+are\s+dan\b|\bdan\s+mode\b)/i,
  },
  {
    name: "ignore_previous_instructions",
    severity: "medium",
    re: /\b(?:ignore|disregard|forget)\b[^.\n]{0,30}\b(?:all\s+)?(?:previous|prior|above|earlier)\b[^.\n]{0,20}\b(?:instructions?|prompts?)\b/i,
  },
  {
    name: "disable_your_safety", // "your" bile coding'de "projenin" anlamına gelebilir → medium
    severity: "medium",
    re: /\b(?:ignore|bypass|disable|turn\s+off|override|remove|forget)\b[^.\n]{0,20}\byour\b[^.\n]{0,25}\b(?:safety|content|ethical|moderation)\b[^.\n]{0,15}\b(?:guidelines?|guardrails?|filters?|policy|policies|protocols?|rules?|constraints?|instructions?)\b/i,
  },
  {
    name: "disable_safety_generic",
    severity: "medium",
    re: /\b(?:ignore|bypass|disable|turn\s+off|remove)\b[^.\n]{0,20}\b(?:safety|content|moderation)\s+(?:filters?|guardrails?|guidelines?|policy|policies)\b/i,
  },
  {
    name: "system_prompt_leak",
    severity: "medium",
    re: /\b(?:reveal|show|print|repeat|output|tell\s+me|what\s+are)\b[^.\n]{0,40}\b(?:your\s+(?:system\s+prompt|instructions?|initial\s+(?:prompt|instructions?)|guidelines?)|the\s+system\s+prompt|initial\s+(?:system\s+)?prompt)\b/i,
  },
];

/** İlk 16KB'ı tarar, eşleşen desenleri detection olarak döner. /g yok → stateless .test(). */
export function detectJailbreak(text: string, extra: JailbreakPattern[] = []): GuardDetection[] {
  const slice = (text || "").slice(0, MAX_SCAN_BYTES);
  if (!slice) return [];
  const out: GuardDetection[] = [];
  for (const p of [...DEFAULT_GUARD_PATTERNS, ...extra]) {
    if (p.re.test(slice)) out.push({ kind: p.name, severity: p.severity });
  }
  return out;
}

/** Eşik-üstü (>=) severity'de en az bir detection varsa true. */
export function shouldBlock(detections: GuardDetection[], threshold: Sev): boolean {
  const t = SEV_ORDER[threshold] ?? SEV_ORDER.high;
  return detections.some((d) => SEV_ORDER[d.severity] >= t);
}

export const jailbreakGuard: GuardModule = {
  name: "jailbreak",
  priority: 20,
  configModeKey: "guardJailbreakMode",
  async run(input: GuardInput): Promise<GuardModuleResult> {
    const threshold = ((input.config.guardJailbreakThreshold as Sev) || "high");
    const detections = detectJailbreak(input.text);
    const blocked = shouldBlock(detections, threshold);
    return {
      guard: "jailbreak",
      blocked,
      detections,
      message: blocked ? "İstek güvenlik politikasını ihlal ediyor (şüpheli talimat enjeksiyonu)." : undefined,
    };
  },
};
