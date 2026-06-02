// Gözcü — secret/PII redaksiyonu (ortak). Hem LLM prompt'unda (diagnose) hem de
// evidence DB'ye yazılmadan ÖNCE (engine persist) kullanılır → gozcu_findings.evidence_json
// ve admin API yanıtı asla maskelenmemiş e-posta/secret içermez.

const SECRET_RE =
  /(sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}|eyJ[A-Za-z0-9._-]{20,}|closerouter_[A-Za-z0-9]+|(api[_-]?key|secret|password|token)["'\s:=]+[A-Za-z0-9._-]{12,})/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function scrub(text: string): string {
  return text.replace(SECRET_RE, "[REDACTED]").replace(EMAIL_RE, "[email]");
}

// Bir evidence nesnesini JSON üzerinden temizleyip nesne olarak döndürür (engine için).
export function scrubObject(value: unknown): unknown {
  if (value == null) return value;
  try {
    return JSON.parse(scrub(JSON.stringify(value)));
  } catch {
    return value;
  }
}
