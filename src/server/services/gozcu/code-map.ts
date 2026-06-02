// Gözcü — check → ilgili kaynak dosya eşlemesi (Katman-2 teşhis için kod dilimi).
// El-yazımı; yalnız src/** altındaki .ts/.jsx adayları. .env/secret/migration ASLA burada
// değil (diagnose.ts ayrıca path-guard + uzantı filtresi uygular).

export const CHECK_TO_FILES: Record<string, string[]> = {
  // money
  k1: ["src/server/services/billing-service.ts", "src/server/routes/proxy.ts"],
  ledger_drift: ["src/server/services/billing-service.ts", "src/server/services/reconciliation-service.ts"],
  orphan_rezervasyon: ["src/server/jobs/orphan-reservation-reaper-job.ts", "src/server/services/billing-service.ts"],
  usage_ledger_eslesme: ["src/server/services/billing-service.ts", "src/server/routes/proxy.ts"],
  iade_butunluk: ["src/server/jobs/orphan-reservation-reaper-job.ts"],
  odemesiz_credit: ["src/server/services/payment-common.ts", "src/server/routes/payments.ts"],
  bonus_butunluk: ["src/server/services/signup-bonus-service.ts"],
  stream_missing: ["src/server/services/closerouter-service.ts", "src/server/routes/proxy.ts"],
  recompute: ["src/server/services/mali-izleme-checks.ts", "src/server/services/pricing-service.ts"],
  marj: ["src/server/services/mali-izleme-checks.ts"],
  idempotency_cakisma: ["src/server/services/billing-service.ts"],
  cift_credit: ["src/server/services/payment-common.ts"],
  kdv: ["src/server/services/payment-common.ts", "src/server/services/payment-pricing.ts"],
  kur_saglik: ["src/server/jobs/kur-refresh-job.ts", "src/server/services/kur-service.ts"],
  // uptime
  proxy_error_rate: ["src/server/routes/proxy.ts"],
  p95_latency: ["src/server/routes/proxy.ts", "src/server/services/closerouter-service.ts"],
  api_5xx_rate: ["src/server/app.ts", "src/server/middleware/error-handler.ts"],
  unhandled_error_spike: ["src/server/middleware/error-handler.ts"],
  job_liveness: ["src/server/jobs/index.ts"],
  db_pool_health: ["src/server/db/client.ts"],
  // provider
  upstream_error_rate: ["src/server/services/closerouter-service.ts", "src/server/services/provider-adapter.ts"],
  upstream_timeout_rate: ["src/server/services/closerouter-service.ts"],
  models_reachability: ["src/server/services/provider-config-service.ts"],
  provider_durum_staleness: ["src/server/services/provider-config-service.ts"],
  // security
  auth_failure_spike: ["src/server/middleware/api-key-auth.ts", "src/server/middleware/admin-auth.ts"],
  rate_limit_hit_spike: ["src/server/services/rate-limit-service.ts"],
  shopier_dead_letter_buildup: ["src/server/routes/payments.ts", "src/server/services/shopier-service.ts"],
  pending_iban_buildup: ["src/server/routes/payments.ts"],
  signup_bonus_abuse: ["src/server/services/signup-bonus-service.ts"],
  telegram_delivery_failure_rate: ["src/server/jobs/telegram-delivery-recovery-job.ts"],
  // code
  code_contracts: ["src/server/services/gozcu/contracts/index.ts"],
};
