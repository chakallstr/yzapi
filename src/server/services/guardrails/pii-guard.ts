import type { GuardDetection, GuardEndpoint, GuardInput, GuardModule, GuardModuleResult } from "./types.js";

// PII guard (faz2). Regex tabanlı tespit + redaksiyon. OmniRoute pii-masker mantığı.
// Modlar (aggregator yorumlar): log/warn = yalnız tespit; redact = modifiedBody üretir; block = PII varsa 400.
// ⚠️ /g desenleri YALNIZ .replace()/.matchAll() ile kullanılır — .test() DÖNGÜSÜ YOK (lastIndex bug'ı yok).
// Doğrulayıcılar (Luhn/TCKN checksum) FP'yi azaltır: rastgele 16-hane/11-hane sayılar elenir.

type Sev = "low" | "medium" | "high";

function luhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function tcknValid(d: string): boolean {
  if (!/^[1-9]\d{10}$/.test(d)) return false;
  const n = d.split("").map((c) => c.charCodeAt(0) - 48);
  const odd = n[0] + n[2] + n[4] + n[6] + n[8];
  const even = n[1] + n[3] + n[5] + n[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== n[9]) return false;
  const sum10 = n.slice(0, 10).reduce((a, b) => a + b, 0);
  return sum10 % 10 === n[10];
}

interface PiiDetector {
  kind: string;
  severity: Sev;
  re: RegExp; // /g zorunlu
  validate?: (digitsOnly: string) => boolean;
}

// Sıra önemli: IBAN önce (digit bloğu kart/tckn'e benzeyebilir; redakte edilince [REDACTED] olur, yeniden eşleşmez).
const PII_DETECTORS: PiiDetector[] = [
  { kind: "iban_tr", severity: "high", re: /\bTR\d{2}(?:[ ]?\d{4}){5}[ ]?\d{2}\b/gi },
  // ⚠️ email quantifier'ları SINIRLI (bounded) — sınırsız `+` + sınıf çakışması O(n²) ReDoS yaratıyordu
  // (64KB "1-1-1-…" girdisinde ~2.5s). Bounded → 10ms, gerçek e-postalarda parite korunur.
  { kind: "email", severity: "medium", re: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,24}\b/g },
  { kind: "credit_card", severity: "high", re: /\b\d(?:[ -]?\d){12,18}\b/g, validate: luhnValid },
  { kind: "tckn", severity: "high", re: /\b[1-9]\d{10}\b/g, validate: tcknValid },
  // (?<!\d): önünde rakam varsa eşleşme (uzun bir sayının son 10 hanesini "telefon" sanmasın → FP azaltır)
  { kind: "phone_tr", severity: "medium", re: /(?<!\d)(?:\+90|0)?[ ]?5\d{2}[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}\b/g },
];

/** Bir string'i redakte eder; doğrulanan PII'yı [REDACTED:kind] ile değiştirir. Hit listesi döner. */
export function redactString(s: string): { out: string; hits: GuardDetection[] } {
  let out = s;
  const hits: GuardDetection[] = [];
  for (const d of PII_DETECTORS) {
    out = out.replace(d.re, (m) => {
      if (d.validate && !d.validate(m.replace(/\D/g, ""))) return m; // doğrulanmadı → dokunma
      hits.push({ kind: d.kind, severity: d.severity });
      return `[REDACTED:${d.kind}]`;
    });
  }
  return { out, hits };
}

/** Sadece tespit (modifikasyon yok). */
export function detectPii(text: string): GuardDetection[] {
  return redactString(text || "").hits;
}

function redactContent(content: unknown): unknown {
  if (typeof content === "string") return redactString(content).out;
  if (Array.isArray(content)) {
    return content.map((part) =>
      part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? { ...part, text: redactString((part as { text: string }).text).out }
        : part,
    );
  }
  return content;
}

/** body'nin derin kopyasını alıp message/system/input içeriklerindeki PII'yı redakte eder. */
export function redactBody(body: Record<string, unknown>, endpoint: GuardEndpoint): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  if (typeof clone.system !== "undefined") clone.system = redactContent(clone.system);
  if (Array.isArray(clone.messages)) {
    clone.messages = (clone.messages as unknown[]).map((m) =>
      m && typeof m === "object" && "content" in (m as object)
        ? { ...(m as object), content: redactContent((m as { content: unknown }).content) }
        : m,
    );
  }
  if (endpoint === "responses") {
    if (typeof clone.instructions === "string") clone.instructions = redactString(clone.instructions).out;
    if (typeof clone.input === "string") clone.input = redactString(clone.input).out;
    else if (Array.isArray(clone.input)) {
      clone.input = (clone.input as unknown[]).map((item) =>
        item && typeof item === "object" && "content" in (item as object)
          ? { ...(item as object), content: redactContent((item as { content: unknown }).content) }
          : item,
      );
    }
  }
  return clone;
}

export const piiGuard: GuardModule = {
  name: "pii",
  priority: 10,
  configModeKey: "guardPiiMode",
  async run(input: GuardInput): Promise<GuardModuleResult> {
    const detections = detectPii(input.text);
    if (detections.length === 0) return { guard: "pii", blocked: false, detections: [] };
    const modifiedBody = input.mode === "redact" ? redactBody(input.body, input.endpoint) : undefined;
    return {
      guard: "pii",
      blocked: true, // aggregator yalnız mode==='block' iken bloklar; redact/warn/log'da yok sayılır
      detections,
      modifiedBody,
      message: "İstek hassas kişisel veri (PII) içeriyor.",
    };
  },
};
