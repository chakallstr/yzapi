import type { ModelRuntimePolicySnapshot } from "../services/api-settings-service.js";

/**
 * Client reasoning belirtmemişse (ne nested `reasoning.effort` ne flat `reasoning_effort`),
 * model_runtime_policies.default_reasoning_effort set'liyse gövdeye enjekte eder. Client HER
 * ZAMAN kazanır — bu yalnız bir varsayılan, zorunluluk değil. Policy NULL (bugün TÜM modeller) →
 * no-op, davranış değişmez.
 */
export function applyDefaultReasoningEffort(
  body: Record<string, unknown>,
  runtimePolicy: ModelRuntimePolicySnapshot | null,
): void {
  const effort = runtimePolicy?.defaultReasoningEffort;
  if (!effort) return;
  if (typeof body.reasoning_effort === "string" && body.reasoning_effort.trim()) return;
  const existing = body.reasoning;
  if (existing && typeof existing === "object" && typeof (existing as Record<string, unknown>).effort === "string" && (existing as Record<string, unknown>).effort) {
    return;
  }
  body.reasoning = {
    ...(existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {}),
    effort,
  };
}
