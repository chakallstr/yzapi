// Request guardrails — ortak tipler (faz0)
export type GuardEndpoint = "chat" | "messages" | "responses";
export type GuardMode = "off" | "log" | "warn" | "block" | "redact";

export interface GuardInput {
  userId: string;
  requestId: string;
  model: string;
  endpoint: GuardEndpoint;
  text: string; // text-extract çıktısı
  body: Record<string, unknown>; // redaksiyon için (modül yeniden yazabilir)
  mode: GuardMode; // bu modül için çözülmüş mod
  config: Record<string, unknown>; // RuntimeApiConfig (eşik, denylist vb.)
}

export interface GuardDetection {
  kind: string; // örn "system_override_inline", "email", "sexual"
  severity: "low" | "medium" | "high";
  snippet?: string; // PII'de audit'e KAYDEDİLMEZ; sadece in-process debug
}

export interface GuardModuleResult {
  guard: string; // "jailbreak" | "pii" | "nsfw" | "policy"
  blocked: boolean;
  detections: GuardDetection[];
  modifiedBody?: Record<string, unknown>; // pii redact
  message?: string;
}

// api-settings RuntimeApiConfig'e eklenen guard mod alanlarının alt-kümesi (T0.3 ile uyumlu)
export interface RuntimeApiConfigGuardModes {
  guardJailbreakMode: GuardMode;
  guardPiiMode: GuardMode;
  guardNsfwMode: GuardMode;
  guardPolicyMode: GuardMode;
}

export interface GuardModule {
  name: string; // registry anahtarı
  priority: number; // küçük önce çalışır
  configModeKey: keyof RuntimeApiConfigGuardModes; // hangi config alanı modu verir
  run(input: GuardInput): Promise<GuardModuleResult>;
}
