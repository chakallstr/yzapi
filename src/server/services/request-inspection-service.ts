import { extractScanText } from "./guardrails/text-extract.js";
import { recordGuardEvent } from "./guardrails/audit.js";
import { jailbreakGuard } from "./guardrails/jailbreak-guard.js";
import { piiGuard } from "./guardrails/pii-guard.js";
import { nsfwGuard } from "./guardrails/nsfw-guard.js";
import { policyGuard } from "./guardrails/policy-guard.js";
import type { GuardModule, GuardEndpoint, GuardMode } from "./guardrails/types.js";

// Faz 1-4 guard modülleri buraya register edilir. Faz 0: boş = inert.
let GUARD_MODULES: GuardModule[] = [];

/** Test-only: registry'yi değiştir. */
export function __setGuardModulesForTest(mods: GuardModule[]): void {
  GUARD_MODULES = [...mods].sort((a, b) => a.priority - b.priority);
}

/** Faz 1-4 modüllerini priority sırasıyla kaydeder (aynı ad → değiştirir). */
export function registerGuardModule(mod: GuardModule): void {
  GUARD_MODULES = [...GUARD_MODULES.filter((g) => g.name !== mod.name), mod].sort((a, b) => a.priority - b.priority);
}

/** Kayıtlı guard modül adları (debug/health). */
export function listGuardModuleNames(): string[] {
  return GUARD_MODULES.map((m) => m.name);
}

export interface RunGuardrailsResult {
  blocked: boolean;
  statusCode?: number;
  code?: string;
  message?: string;
  warnings: string[];
  modifiedBody?: Record<string, unknown>;
}

/**
 * Tüm aktif guard modüllerini (mod != 'off') priority sırasıyla koşar.
 * Fail-open: bir modül throw ederse atlanır, istek devam eder. Blok yalnız mod='block' + blocked.
 * Rezervasyon/charge ÖNCESİ çağrılır → blok token yakmaz.
 */
export async function runRequestGuardrails(args: {
  userId: string;
  requestId: string;
  model: string;
  endpoint: GuardEndpoint;
  body: Record<string, unknown>;
  config: Record<string, unknown>;
}): Promise<RunGuardrailsResult> {
  const warnings: string[] = [];
  let body = args.body;
  let text: string | null = null; // lazy: yalnız ilk aktif modülde çıkar

  for (const mod of GUARD_MODULES) {
    const mode = (args.config[mod.configModeKey as string] as GuardMode) || "off";
    if (mode === "off") continue;
    if (text === null) text = extractScanText(body, args.endpoint);

    try {
      const result = await mod.run({
        userId: args.userId,
        requestId: args.requestId,
        model: args.model,
        endpoint: args.endpoint,
        text,
        body,
        mode,
        config: args.config,
      });

      if (mode !== "log" && (result.blocked || result.detections.length > 0)) {
        void recordGuardEvent({ userId: args.userId, requestId: args.requestId, mode, result });
      }
      if (mode === "redact" && result.modifiedBody) {
        body = result.modifiedBody;
        text = null; // body değişti → sonraki modül taze metin görsün
      }
      if (result.detections.length > 0) {
        warnings.push(`${result.guard}:${result.detections.length}`);
      }
      if (mode === "block" && result.blocked) {
        return {
          blocked: true,
          statusCode: 400,
          code: "request_guard_violation",
          message: result.message || "İstek güvenlik politikasını ihlal ediyor.",
          warnings,
          modifiedBody: body !== args.body ? body : undefined,
        };
      }
    } catch {
      // fail-open: bu modülü atla, istek devam etsin
    }
  }

  return { blocked: false, warnings, modifiedBody: body !== args.body ? body : undefined };
}

// ── Built-in guard kayıtları (import-time). Modüller KAYITLI ama mod default 'off' → inert. ──
registerGuardModule(piiGuard);
registerGuardModule(jailbreakGuard);
registerGuardModule(nsfwGuard);
registerGuardModule(policyGuard);
