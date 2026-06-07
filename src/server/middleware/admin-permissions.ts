// Rol-tabanlı admin erişim haritası (RBAC) — TEK KAYNAK.
// owner = her şey; partner = aşağıdaki PARTNER_RULES. Eşlenmemiş yol → owner (fail-closed).
// fullPath = req.baseUrl + req.path  → 3 mount noktasını kapsar:
//   /api/admin/*  ·  /api/payments/admin/*  ·  /api/telegram/admin/*

export type AdminRole = "owner" | "partner";

// tab id'leri tab-admin.jsx ADMIN_SECTIONS ile birebir aynı sırada.
export const ALL_TABS = [
  "dashboard", "traffic", "mali-izleme", "gozcu", "api", "users", "overrides",
  "packages", "codes", "teslimler", "announce", "providers", "kur", "payments",
  "telegram", "apikeys", "logs", "animations",
] as const;

export const PARTNER_TABS = [
  "dashboard", "traffic", "mali-izleme", "gozcu", "announce",
  "payments", "telegram", "apikeys", "logs", "animations", "users",
] as const;

export function allowedTabsForRole(role: AdminRole): string[] {
  return role === "owner" ? [...ALL_TABS] : [...PARTNER_TABS];
}

type Rule = { methods: string[]; re: RegExp };

// Partner'a AÇIK uçlar. Burada olmayan her şey owner-only (fail-closed).
const PARTNER_RULES: Rule[] = [
  // me (her admin rolü kendi bilgisini okuyabilir)
  { methods: ["GET"], re: /^\/api\/admin\/me$/ },
  // dashboard
  { methods: ["GET"], re: /^\/api\/admin\/dashboard$/ },
  // traffic
  { methods: ["GET"], re: /^\/api\/admin\/traffic(\/.*)?$/ },
  // mali-izleme + reconciliation
  { methods: ["GET"], re: /^\/api\/admin\/mali-izleme\/(son|canli-akis|gecmis)$/ },
  { methods: ["POST"], re: /^\/api\/admin\/mali-izleme\/tara$/ },
  { methods: ["GET"], re: /^\/api\/admin\/reconciliation(\/export)?$/ },
  // gozcu (ack/snooze/heal dahil)
  { methods: ["GET"], re: /^\/api\/admin\/gozcu\/(son|findings|gecmis)$/ },
  { methods: ["POST"], re: /^\/api\/admin\/gozcu\/tara$/ },
  { methods: ["POST"], re: /^\/api\/admin\/gozcu\/findings\/[^/]+\/(ack|snooze|heal)$/ },
  // announcements
  { methods: ["GET", "POST"], re: /^\/api\/admin\/announcements$/ },
  { methods: ["PATCH", "DELETE"], re: /^\/api\/admin\/announcements\/[^/]+$/ },
  // api keys
  { methods: ["GET"], re: /^\/api\/admin\/api-keys$/ },
  { methods: ["POST"], re: /^\/api\/admin\/api-keys\/revoke\/[^/]+$/ },
  { methods: ["POST"], re: /^\/api\/admin\/api-keys\/[^/]+\/create$/ },
  // logs
  { methods: ["GET"], re: /^\/api\/admin\/audit-logs$/ },
  { methods: ["GET"], re: /^\/api\/admin\/bakiye-hareketleri$/ },
  // users (POST /users/:id/role HARİÇ — o owner-only, aşağıda yok)
  { methods: ["GET"], re: /^\/api\/admin\/users$/ },
  { methods: ["GET"], re: /^\/api\/admin\/users\/[^/]+\/detail$/ },
  { methods: ["PATCH"], re: /^\/api\/admin\/users\/[^/]+$/ },
  { methods: ["POST"], re: /^\/api\/admin\/users\/[^/]+\/bakiye$/ },
  // paylaşımlı okuma (panel/dashboard için GET; yazım owner-only)
  { methods: ["GET"], re: /^\/api\/admin\/provider-durumu$/ },
  { methods: ["GET"], re: /^\/api\/admin\/config$/ },
  { methods: ["GET"], re: /^\/api\/admin\/kur-history$/ },
  { methods: ["GET"], re: /^\/api\/admin\/model-overrides$/ },
  // payments admin (ayrı router)
  { methods: ["GET"], re: /^\/api\/payments\/admin\/(pending-iban|all|osb-dead-letters)$/ },
  { methods: ["POST"], re: /^\/api\/payments\/admin\/pending-iban\/[^/]+\/(approve|reject)$/ },
  { methods: ["POST"], re: /^\/api\/payments\/admin\/osb-dead-letters\/[^/]+\/(resolve|ignore)$/ },
  // telegram admin (ayrı router)
  { methods: ["GET"], re: /^\/api\/telegram\/admin\/(accounts|deliveries|conflicts)$/ },
  { methods: ["POST"], re: /^\/api\/telegram\/admin\/(reconcile|relink)$/ },
];

export function requiredRoleFor(method: string, fullPath: string): AdminRole {
  const m = method.toUpperCase();
  const path = (fullPath.split("?")[0] || "").replace(/\/+$/, "") || "/";
  for (const rule of PARTNER_RULES) {
    if (rule.methods.includes(m) && rule.re.test(path)) return "partner";
  }
  return "owner";
}
