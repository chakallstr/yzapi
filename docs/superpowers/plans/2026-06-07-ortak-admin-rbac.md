# Ortak (Partner) Admin RBAC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `yapayzekalab.org` admin paneline, sabit panel setiyle sınırlı bir ikinci admin ("ortak") rolü eklemek; ortak Kullanıcılar dahil belirli sekmeleri kullanır, geri kalanına (sağlayıcı/api/paket/kod/teslim/kur-yazım) erişemez.

**Architecture:** DB `users.role` kolonu (`user`/`partner`); owner hâlâ sabit e-posta ile tanınır. Gerçek yetki kapısı tek chokepoint olan `adminAuth` middleware'i içinde, **fail-closed** bir method+yol izin haritası (`admin-permissions.ts`) ile uygulanır — bu, üç mount noktasını da kapsar (`/api/admin`, `/api/payments/admin`, `/api/telegram/admin`). Frontend sekme filtresi yalnız UX; güvenlik backend'de.

**Tech Stack:** Express + TypeScript, Drizzle ORM (PostgreSQL), Vitest (unit `*.test.ts` mock-DB + integration `*.itest.ts` gerçek Postgres), React/JSX (Vite).

**Spec:** `docs/superpowers/specs/2026-06-07-ortak-admin-rbac-design.md`

> ⚠️ **CANLI ödeme sistemi.** Tüm commit'ler **LOKAL**. Push/deploy YOK — ayrı çift-onay + 3-QA gate gerektirir (deploy-guard hook). Billing/proxy/token mantığına **dokunulmaz**. Migration **deploy-inert** (varsayılan değiştirmez).
>
> ⚠️ **Migration numarası:** lokal en yüksek `0025_models_maintenance_notice` → yeni migration **`0026`**. (CLAUDE.md "0024" der; bayat. Yine de deploy anında canlı sequence'e göre doğrula.)

---

## Dosya Yapısı

| Dosya | Sorumluluk | Create/Modify |
|-------|-----------|---------------|
| `src/server/db/migrations/0026_user_role.sql` | `users.role` kolonu | **Create** |
| `src/server/db/migrations/meta/_journal.json` | migration sırası | Modify |
| `src/server/db/schema.ts` | `users.role` Drizzle alanı | Modify (~satır 67) |
| `src/server/middleware/admin-permissions.ts` | RBAC tek-kaynak: roller, izin haritası, `requiredRoleFor`, `allowedTabsForRole` | **Create** |
| `src/server/middleware/admin-permissions.test.ts` | izin haritası birim testleri | **Create** |
| `src/server/middleware/admin-auth.ts` | rol çözümleme + fail-closed authz + `req.adminRole` | Modify |
| `src/server/middleware/admin-auth.test.ts` | owner/partner senaryoları | Modify |
| `src/server/routes/admin-auth.ts` | `/me` → role + allowedTabs | Modify |
| `src/server/routes/admin.ts` | `POST /users/:id/role` (owner-only) + owner-koruma + `serializeUser.role` | Modify |
| `src/server/__tests__/partner-rbac.itest.ts` | `/me` + erişim matrisi + iptal | **Create** |
| `src/yapayzekalab/tab-admin.jsx` | sekme filtresi + "Ortak yap" butonu + rozet | Modify |
| `scripts/set-partner-role.ts` | aktivasyon (geri-alınabilir) | **Create** |

---

## Task 1: DB — `users.role` kolonu (migration 0026 + schema + journal)

**Files:**
- Create: `src/server/db/migrations/0026_user_role.sql`
- Modify: `src/server/db/migrations/meta/_journal.json`
- Modify: `src/server/db/schema.ts:67`

- [ ] **Step 1: Migration dosyasını oluştur**

Create `src/server/db/migrations/0026_user_role.sql`:

```sql
-- 0026_user_role.sql
-- Ortak (partner) RBAC: users tablosuna rol kolonu. owner e-posta ile tanınır
-- (bu kolona yazılmaz); 'partner' = sınırlı co-admin; 'user' = normal müşteri.
-- Deploys INERT: default 'user' → deploy hiçbir şeyi değiştirmez; bir owner
-- bir kullanıcıyı 'partner' yapana kadar davranış aynı kalır.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
```

- [ ] **Step 2: Journal'a 0026 girişini ekle**

Modify `src/server/db/migrations/meta/_journal.json` — son girişin (`idx: 25`) `}` kapanışından sonra virgül ekle ve yeni giriş ekle. Dosyanın sonu şu hâle gelir:

```json
    {
      "idx": 25,
      "version": "7",
      "when": 1781472000000,
      "tag": "0025_models_maintenance_notice",
      "breakpoints": true
    },
    {
      "idx": 26,
      "version": "7",
      "when": 1781558400000,
      "tag": "0026_user_role",
      "breakpoints": true
    }
  ]
}
```

- [ ] **Step 3: Drizzle schema'ya `role` ekle**

Modify `src/server/db/schema.ts` — `users` tablosunda `lang` satırından hemen sonra ekle:

```ts
    lang: text("lang").notNull().default("tr"),
    role: text("role").notNull().default("user"),
```

- [ ] **Step 4: Migration'ı uygula ve doğrula**

```bash
npm run db:up
npm run db:migrate
```
Expected: çıktıda `0026_user_role` uygulanır, hata yok. (Kolon sonraki task'ların itest'leriyle de zorlanacak; eksikse yüksek sesle patlar.)

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS (tsc temiz — `role` artık `typeof users.$inferSelect`'te).

- [ ] **Step 6: Commit (lokal)**

```bash
git add src/server/db/migrations/0026_user_role.sql src/server/db/migrations/meta/_journal.json src/server/db/schema.ts
git commit -m "feat(rbac): users.role kolonu (migration 0026, deploy-inert)"
```

---

## Task 2: `admin-permissions.ts` — RBAC izin haritası (TDD, saf mantık)

**Files:**
- Create: `src/server/middleware/admin-permissions.test.ts`
- Create: `src/server/middleware/admin-permissions.ts`

- [ ] **Step 1: Başarısız testi yaz**

Create `src/server/middleware/admin-permissions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  requiredRoleFor,
  allowedTabsForRole,
  PARTNER_TABS,
  ALL_TABS,
} from "./admin-permissions.js";

describe("requiredRoleFor — partner'a açık uçlar", () => {
  it.each([
    ["GET", "/api/admin/dashboard"],
    ["GET", "/api/admin/traffic"],
    ["GET", "/api/admin/traffic/overview"],
    ["POST", "/api/admin/mali-izleme/tara"],
    ["GET", "/api/admin/reconciliation/export"],
    ["GET", "/api/admin/gozcu/findings"],
    ["POST", "/api/admin/gozcu/findings/abc-123/heal"],
    ["POST", "/api/admin/announcements"],
    ["PATCH", "/api/admin/announcements/xy"],
    ["POST", "/api/admin/api-keys/revoke/k1"],
    ["POST", "/api/admin/api-keys/u1/create"],
    ["GET", "/api/admin/audit-logs"],
    ["GET", "/api/admin/bakiye-hareketleri"],
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/users/u1/detail"],
    ["PATCH", "/api/admin/users/u1"],
    ["POST", "/api/admin/users/u1/bakiye"],
    ["GET", "/api/payments/admin/pending-iban"],
    ["POST", "/api/payments/admin/pending-iban/p1/approve"],
    ["POST", "/api/payments/admin/osb-dead-letters/d1/resolve"],
    ["GET", "/api/telegram/admin/accounts"],
    ["POST", "/api/telegram/admin/relink"],
  ])("partner: %s %s", (method, path) => {
    expect(requiredRoleFor(method, path)).toBe("partner");
  });
});

describe("requiredRoleFor — paylaşımlı okuma (GET partner, yazım owner)", () => {
  it.each([
    "/api/admin/provider-durumu",
    "/api/admin/config",
    "/api/admin/kur-history",
    "/api/admin/model-overrides",
  ])("GET %s partner ama POST owner", (path) => {
    expect(requiredRoleFor("GET", path)).toBe("partner");
    expect(requiredRoleFor("POST", path)).toBe("owner");
  });
});

describe("requiredRoleFor — owner-only + fail-closed", () => {
  it.each([
    ["POST", "/api/admin/config"],
    ["GET", "/api/admin/provider-profiles"],
    ["POST", "/api/admin/provider-profiles/activate"],
    ["PATCH", "/api/admin/provider-durumu/popusk"],
    ["POST", "/api/admin/model-overrides"],
    ["DELETE", "/api/admin/model-overrides/m1"],
    ["GET", "/api/admin/api-settings"],
    ["POST", "/api/admin/added-models"],
    ["POST", "/api/admin/refresh-kur"],
    ["GET", "/api/admin/packages"],
    ["POST", "/api/admin/redeem-codes"],
    ["GET", "/api/admin/delivery-orders"],
    ["POST", "/api/admin/users/u1/role"],
    ["GET", "/api/admin/gelecekteki-bilinmeyen-uc"],
  ])("owner-only: %s %s", (method, path) => {
    expect(requiredRoleFor(method, path)).toBe("owner");
  });
});

describe("sekme setleri", () => {
  it("partner sekmeleri tüm sekmelerin alt kümesi", () => {
    for (const t of PARTNER_TABS) expect(ALL_TABS).toContain(t);
  });
  it("owner-only sekmeler tam tümleyen", () => {
    const ownerOnly = ALL_TABS.filter(
      (t) => !(PARTNER_TABS as readonly string[]).includes(t),
    );
    expect([...ownerOnly].sort()).toEqual(
      ["api", "codes", "kur", "overrides", "packages", "providers", "teslimler"].sort(),
    );
  });
  it("allowedTabsForRole rolleri doğru eşler", () => {
    expect(allowedTabsForRole("owner")).toEqual([...ALL_TABS]);
    expect(allowedTabsForRole("partner")).toEqual([...PARTNER_TABS]);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run src/server/middleware/admin-permissions.test.ts`
Expected: FAIL — `Cannot find module './admin-permissions.js'`.

- [ ] **Step 3: Modülü yaz**

Create `src/server/middleware/admin-permissions.ts`:

```ts
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
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `npx vitest run src/server/middleware/admin-permissions.test.ts`
Expected: PASS (tüm `it.each` vakaları).

- [ ] **Step 5: Commit (lokal)**

```bash
git add src/server/middleware/admin-permissions.ts src/server/middleware/admin-permissions.test.ts
git commit -m "feat(rbac): admin izin haritası (fail-closed requiredRoleFor)"
```

---

## Task 3: `admin-auth.ts` — rol çözümleme + fail-closed authz

**Files:**
- Modify: `src/server/middleware/admin-auth.ts`
- Modify: `src/server/middleware/admin-auth.test.ts`

- [ ] **Step 1: Mevcut testi owner/partner için güncelle (önce test)**

Modify `src/server/middleware/admin-auth.test.ts` — `runAdminAuth` yardımcı fonksiyonunu route bilgisi alacak şekilde değiştir ve mock satırlarına `role` ekle. Tam yeni hâli:

`runAdminAuth` fonksiyonunu şununla değiştir:

```ts
async function runAdminAuth(
  token?: string,
  route?: { method?: string; baseUrl?: string; path?: string },
) {
  const { adminAuth } = await import("./admin-auth.js");
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method: route?.method ?? "GET",
    baseUrl: route?.baseUrl ?? "/api/admin",
    path: route?.path ?? "/dashboard",
    ip: "127.0.0.1",
  } as unknown as Request;
  const res = makeResponse();
  const next = vi.fn() as NextFunction;

  await adminAuth(req, res, next);
  return { req, res, next };
}
```

Mevcut "allows only the configured admin email" testindeki mock satırına `role` ekle ve `adminRole` assert et:

```ts
  it("allows only the configured admin email via a normal user token", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "user-1", role: "user" });
    mocks.limit.mockResolvedValueOnce([
      { id: "user-1", email: "cix.crazy666@gmail.com", durum: "aktif", role: "user" },
    ]);

    const { req, next } = await runAdminAuth("user-token");

    expect(next).toHaveBeenCalledOnce();
    expect(req.admin).toEqual({ sub: "user-1", role: "admin" });
    expect(req.user).toEqual({ id: "user-1", email: "cix.crazy666@gmail.com" });
    expect(req.adminRole).toBe("owner");
  });
```

"rejects normal user tokens from every other email" testindeki mock satırına `role: "user"` ekle (partner değil → hâlâ 403):

```ts
    mocks.limit.mockResolvedValueOnce([
      { id: "user-2", email: "user@example.com", durum: "aktif", role: "user" },
    ]);
```

"blocks inactive admin candidates" satırına da `role: "user"` ekle:

```ts
    mocks.limit.mockResolvedValueOnce([
      { id: "user-3", email: "cix.crazy666@gmail.com", durum: "askida", role: "user" },
    ]);
```

Dosyanın sonuna (son `it`'ten önce, describe içinde) YENİ partner testlerini ekle:

```ts
  it("partner rolü izinli uca erişebilir", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "p-1", role: "user" });
    mocks.limit.mockResolvedValueOnce([
      { id: "p-1", email: "ortak@example.com", durum: "aktif", role: "partner" },
    ]);

    const { req, next } = await runAdminAuth("partner-token", {
      method: "GET",
      baseUrl: "/api/admin",
      path: "/users",
    });

    expect(next).toHaveBeenCalledOnce();
    expect(req.adminRole).toBe("partner");
  });

  it("partner owner-only uca 403 alır", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "p-1", role: "user" });
    mocks.limit.mockResolvedValueOnce([
      { id: "p-1", email: "ortak@example.com", durum: "aktif", role: "partner" },
    ]);

    const { res, next } = await runAdminAuth("partner-token", {
      method: "POST",
      baseUrl: "/api/admin",
      path: "/provider-profiles/activate",
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("partner rol-değiştirme ucuna (privilege escalation) 403 alır", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "p-1", role: "user" });
    mocks.limit.mockResolvedValueOnce([
      { id: "p-1", email: "ortak@example.com", durum: "aktif", role: "partner" },
    ]);

    const { res, next } = await runAdminAuth("partner-token", {
      method: "POST",
      baseUrl: "/api/admin",
      path: "/users/x9/role",
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("owner owner-only uca erişebilir", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "user-1", role: "user" });
    mocks.limit.mockResolvedValueOnce([
      { id: "user-1", email: "cix.crazy666@gmail.com", durum: "aktif", role: "user" },
    ]);

    const { req, next } = await runAdminAuth("owner-token", {
      method: "POST",
      baseUrl: "/api/admin",
      path: "/provider-profiles/activate",
    });

    expect(next).toHaveBeenCalledOnce();
    expect(req.adminRole).toBe("owner");
  });
```

- [ ] **Step 2: Testin (henüz) başarısız olduğunu doğrula**

Run: `npx vitest run src/server/middleware/admin-auth.test.ts`
Expected: FAIL — yeni partner testleri `req.adminRole` undefined / partner 403 yerine "Admin email required" 403 ama owner-only erişim ve `adminRole` assertion'ları patlar (kod henüz rolü tanımıyor).

- [ ] **Step 3: `admin-auth.ts`'i güncelle**

Modify `src/server/middleware/admin-auth.ts` — tam yeni hâli:

```ts
import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../services/auth-service.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { recordAuthFailure, hashIp } from "../services/gozcu/metrics-collector.js";
import { requiredRoleFor, AdminRole } from "./admin-permissions.js";

export const ADMIN_EMAIL = "cix.crazy666@gmail.com";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

declare global {
  namespace Express {
    interface Request {
      admin?: TokenPayload;
      adminRole?: AdminRole;
      user?: { id: string; email?: string };
      apiKey?: { id: string; userId: string };
    }
  }
}

export async function adminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    recordAuthFailure(hashIp(req.ip)); // Gözcü: auth_failure_spike sinyali
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyAccessToken(auth.slice(7));
    if (payload.role !== "user") {
      res.status(401).json({ error: "User token required" });
      return;
    }

    const rows = await db
      .select({ id: users.id, email: users.email, durum: users.durum, role: users.role })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!rows.length) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const user = rows[0];
    if (user.durum !== "aktif") {
      res.status(403).json({ error: "User account is not active" });
      return;
    }

    // Rol çözümleme: owner her zaman e-posta ile (DB'ye bağlı değil); partner DB rolünden.
    let adminRole: AdminRole | null = null;
    if (normalizeEmail(user.email) === ADMIN_EMAIL) adminRole = "owner";
    else if (user.role === "partner") adminRole = "partner";

    if (!adminRole) {
      res.status(403).json({ error: "Admin email required" });
      return;
    }

    // Yetki (fail-closed): partner yalnız izinli uçlara; owner her şeye.
    if (adminRole === "partner") {
      const required = requiredRoleFor(req.method, req.baseUrl + req.path);
      if (required !== "partner") {
        recordAuthFailure(hashIp(req.ip));
        res.status(403).json({ error: "Bu işlem için yetkiniz yok" });
        return;
      }
    }

    req.user = { id: user.id, email: user.email };
    req.admin = { sub: user.id, role: "admin" };
    req.adminRole = adminRole;
    next();
  } catch {
    recordAuthFailure(hashIp(req.ip));
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `npx vitest run src/server/middleware/admin-auth.test.ts`
Expected: PASS (eski + yeni partner senaryoları).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit (lokal)**

```bash
git add src/server/middleware/admin-auth.ts src/server/middleware/admin-auth.test.ts
git commit -m "feat(rbac): adminAuth owner/partner çözümleme + fail-closed authz"
```

---

## Task 4: `/api/admin/me` — role + allowedTabs

**Files:**
- Modify: `src/server/routes/admin-auth.ts`
- Create: `src/server/__tests__/partner-rbac.itest.ts` (bu task'ta `/me` testleri; sonraki task'larda büyür)

- [ ] **Step 1: itest dosyasını `/me` testleriyle oluştur (önce test)**

Create `src/server/__tests__/partner-rbac.itest.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../services/auth-service.js";

const app = createApp();

const OWNER_ID = "c0000000-0000-0000-0000-000000000001";
const PARTNER_ID = "c0000000-0000-0000-0000-000000000002";
const NORMAL_ID = "c0000000-0000-0000-0000-000000000003";
const OWNER_EMAIL = "cix.crazy666@gmail.com"; // tek-admin allowlist (DOKUNULMAZ)

const ownerToken = () => signAccessToken({ sub: OWNER_ID, role: "user" });
const partnerToken = () => signAccessToken({ sub: PARTNER_ID, role: "user" });
const normalToken = () => signAccessToken({ sub: NORMAL_ID, role: "user" });

beforeAll(async () => {
  await dbSql`DELETE FROM users WHERE id IN (${OWNER_ID}::uuid, ${PARTNER_ID}::uuid, ${NORMAL_ID}::uuid)`;
  await db.insert(users).values([
    { id: OWNER_ID, email: OWNER_EMAIL, adSoyad: "Owner", bakiyeTL: "0", durum: "aktif", role: "user" },
    { id: PARTNER_ID, email: "ortak-rbac@test.local", adSoyad: "Ortak", bakiyeTL: "0", durum: "aktif", role: "partner" },
    { id: NORMAL_ID, email: "normal-rbac@test.local", adSoyad: "Normal", bakiyeTL: "0", durum: "aktif", role: "user" },
  ]);
});

afterAll(async () => {
  await dbSql`DELETE FROM users WHERE id IN (${OWNER_ID}::uuid, ${PARTNER_ID}::uuid, ${NORMAL_ID}::uuid)`;
});

describe("GET /api/admin/me — rol + allowedTabs", () => {
  it("owner: role=owner ve 18 sekmenin tamamı", async () => {
    const res = await request(app).get("/api/admin/me").set("Authorization", `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("owner");
    expect(res.body.allowedTabs).toContain("providers");
    expect(res.body.allowedTabs).toContain("packages");
    expect(res.body.allowedTabs.length).toBe(18);
  });

  it("partner: role=partner ve yalnız izinli sekmeler (owner-only YOK)", async () => {
    const res = await request(app).get("/api/admin/me").set("Authorization", `Bearer ${partnerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("partner");
    expect(res.body.allowedTabs).toContain("users");
    expect(res.body.allowedTabs).toContain("payments");
    expect(res.body.allowedTabs).not.toContain("providers");
    expect(res.body.allowedTabs).not.toContain("packages");
    expect(res.body.allowedTabs).not.toContain("kur");
  });

  it("normal kullanıcı: /me 403", async () => {
    const res = await request(app).get("/api/admin/me").set("Authorization", `Bearer ${normalToken()}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: DB'yi migrate et ve testin başarısız olduğunu doğrula**

Run:
```bash
npm run db:up && npm run db:migrate
npx vitest run --config vitest.itest.config.ts src/server/__tests__/partner-rbac.itest.ts
```
Expected: FAIL — `/me` bugün `{role:"admin"}` döner (owner için `role==="owner"` ve `allowedTabs` yok); partner için `me` zaten 200 döner ama `allowedTabs` undefined.

- [ ] **Step 3: `/me`'yi güncelle**

Modify `src/server/routes/admin-auth.ts` — import ekle ve `/me` handler'ını değiştir:

```ts
import { Router } from "express";
import { adminAuth } from "../middleware/admin-auth.js";
import { allowedTabsForRole } from "../middleware/admin-permissions.js";

const router = Router();

// POST /api/admin/login
router.post("/login", (_req, res) => {
  res.status(410).json({
    error: "Admin girişi ayrı şifreyle yapılmaz. Yetkili Google hesabıyla giriş yapın.",
  });
});

// POST /api/admin/logout (client discards token; server just acks)
router.post("/logout", (_req, res) => {
  res.json({ success: true });
});

// GET /api/admin/me
router.get("/me", adminAuth, (req, res) => {
  const role = req.adminRole ?? "owner";
  res.json({
    role,
    sub: req.admin?.sub,
    email: req.user?.email,
    allowedTabs: allowedTabsForRole(role),
  });
});

export default router;
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `npx vitest run --config vitest.itest.config.ts src/server/__tests__/partner-rbac.itest.ts`
Expected: PASS.

- [ ] **Step 5: Tekil-owner contract testinin hâlâ geçtiğini doğrula**

Run: `npx vitest run src/admin-single-owner-contract.test.ts`
Expected: PASS (admin-auth.ts'te `signAccessToken`/`constantTimeCompare`/`Invalid password` eklemedik; `router.post("/login"` + 410 duruyor).

- [ ] **Step 6: Commit (lokal)**

```bash
git add src/server/routes/admin-auth.ts src/server/__tests__/partner-rbac.itest.ts
git commit -m "feat(rbac): /api/admin/me role + allowedTabs döndürür"
```

---

## Task 5: `POST /users/:id/role` (owner-only) + owner-koruma + serializeUser.role

**Files:**
- Modify: `src/server/routes/admin.ts`
- Modify: `src/server/__tests__/partner-rbac.itest.ts`

- [ ] **Step 1: itest'e rol-değiştirme + owner-koruma vakaları ekle (önce test)**

Modify `src/server/__tests__/partner-rbac.itest.ts` — dosyanın sonuna yeni describe blokları ekle:

```ts
describe("POST /api/admin/users/:id/role — yalnız owner", () => {
  it("owner bir kullanıcıyı partner yapıp geri alabilir", async () => {
    const promote = await request(app)
      .post(`/api/admin/users/${NORMAL_ID}/role`)
      .set("Authorization", `Bearer ${ownerToken()}`)
      .send({ role: "partner" });
    expect(promote.status).toBe(200);
    expect(promote.body.user.role).toBe("partner");

    const demote = await request(app)
      .post(`/api/admin/users/${NORMAL_ID}/role`)
      .set("Authorization", `Bearer ${ownerToken()}`)
      .send({ role: "user" });
    expect(demote.status).toBe(200);
    expect(demote.body.user.role).toBe("user");
  });

  it("partner rol değiştiremez (privilege escalation) → 403", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${NORMAL_ID}/role`)
      .set("Authorization", `Bearer ${partnerToken()}`)
      .send({ role: "partner" });
    expect(res.status).toBe(403);
  });

  it("owner hesabının rolü değiştirilemez", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${OWNER_ID}/role`)
      .set("Authorization", `Bearer ${ownerToken()}`)
      .send({ role: "partner" });
    expect(res.status).toBe(400);
  });

  it("geçersiz rol → 400", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${NORMAL_ID}/role`)
      .set("Authorization", `Bearer ${ownerToken()}`)
      .send({ role: "superadmin" });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/admin/users/:id — partner owner'ı değiştiremez", () => {
  it("partner owner satırını PATCH edemez → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${OWNER_ID}`)
      .set("Authorization", `Bearer ${partnerToken()}`)
      .send({ not: "deneme" });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run --config vitest.itest.config.ts src/server/__tests__/partner-rbac.itest.ts`
Expected: FAIL — `/users/:id/role` ucu yok (404), owner PATCH-koruması yok.

- [ ] **Step 3: `serializeUser`'a `role` ekle**

Modify `src/server/routes/admin.ts` — `serializeUser` dönüş nesnesine `role` ekle (`gunlukLimitTL` satırından sonra):

```ts
    gunlukLimitTL: u.gunlukLimitTL !== null ? Number(u.gunlukLimitTL) : null,
    role: u.role,
```

- [ ] **Step 4: PATCH /users/:id'e partner→owner korumasını ekle**

Modify `src/server/routes/admin.ts` — `router.patch("/users/:id", ...)` içinde, `existingUser` alındıktan hemen sonra (mevcut `if (body.durum !== undefined && ... SINGLE_ADMIN_EMAIL ...)` guard'ından ÖNCE) ekle:

```ts
    if (
      req.adminRole === "partner" &&
      String(existingUser.email || "").trim().toLowerCase() === SINGLE_ADMIN_EMAIL
    ) {
      return res.status(403).json({ error: "Ortak, sahip hesabını değiştiremez." });
    }
```

- [ ] **Step 5: `POST /users/:id/role` ucunu ekle**

Modify `src/server/routes/admin.ts` — `router.post("/users/:id/bakiye", ...)` handler'ının kapanışından (`});`) hemen sonra ekle:

```ts
router.post("/users/:id/role", async (req, res, next) => {
  try {
    // Defense-in-depth: izin haritası partner'ı zaten engeller; burada ikinci kontrol.
    if (req.adminRole !== "owner") {
      return res.status(403).json({ error: "Yalnız sahip rol değiştirebilir." });
    }
    const { id } = req.params;
    const role = String((req.body as { role?: string }).role ?? "");
    if (role !== "partner" && role !== "user") {
      return res.status(400).json({ error: "Geçersiz rol. 'partner' veya 'user' olmalı." });
    }

    const userRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!userRows.length) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    const target = userRows[0];

    if (String(target.email || "").trim().toLowerCase() === SINGLE_ADMIN_EMAIL) {
      return res.status(400).json({ error: "Sahip hesabının rolü değiştirilemez." });
    }

    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
    await writeAudit("user_role_change", id, `rol → ${role}`, req.user!.id);

    const updated = await db.select().from(users).where(eq(users.id, id)).limit(1);
    res.json({ user: serializeUser(updated[0]) });
  } catch (e) { next(e); }
});
```

- [ ] **Step 6: Testlerin geçtiğini doğrula**

Run: `npx vitest run --config vitest.itest.config.ts src/server/__tests__/partner-rbac.itest.ts`
Expected: PASS (tüm rol + koruma vakaları).

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit (lokal)**

```bash
git add src/server/routes/admin.ts src/server/__tests__/partner-rbac.itest.ts
git commit -m "feat(rbac): owner-only /users/:id/role + owner-hesabı koruması + serializeUser.role"
```

---

## Task 6: Erişim matrisi itest (3 mount noktası + anında iptal)

**Files:**
- Modify: `src/server/__tests__/partner-rbac.itest.ts`

- [ ] **Step 1: Erişim matrisi + iptal testlerini ekle (önce test)**

Modify `src/server/__tests__/partner-rbac.itest.ts` — sona ekle:

```ts
describe("Erişim matrisi — partner HTTP zorlaması (3 mount noktası)", () => {
  it.each([
    ["GET", "/api/admin/dashboard"],
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/audit-logs"],
    ["GET", "/api/admin/config"],          // paylaşımlı okuma
    ["GET", "/api/admin/provider-durumu"], // paylaşımlı okuma
    ["GET", "/api/admin/model-overrides"], // paylaşımlı okuma
    ["GET", "/api/payments/admin/pending-iban"],
    ["GET", "/api/telegram/admin/accounts"],
  ])("partner izinli: %s %s → 403 DEĞİL", async (method, path) => {
    const res = await request(app)[method.toLowerCase() as "get"](path)
      .set("Authorization", `Bearer ${partnerToken()}`);
    expect(res.status).not.toBe(403);
  });

  it.each([
    ["GET", "/api/admin/provider-profiles"],
    ["GET", "/api/admin/api-settings"],
    ["GET", "/api/admin/packages"],
    ["GET", "/api/admin/redeem-codes"],
    ["GET", "/api/admin/delivery-orders"],
    ["POST", "/api/admin/refresh-kur"],
  ])("partner owner-only: %s %s → 403", async (method, path) => {
    const res = await request(app)[method.toLowerCase() as "get" | "post"](path)
      .set("Authorization", `Bearer ${partnerToken()}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("owner aynı owner-only uçlara erişebilir (403 değil)", async () => {
    const res = await request(app).get("/api/admin/provider-profiles")
      .set("Authorization", `Bearer ${ownerToken()}`);
    expect(res.status).not.toBe(403);
  });

  it("rol DB'den her istek okunur → demote anında etki eder", async () => {
    // PARTNER_ID'yi user'a çek, sonra partner-only uca dene → 403
    await db.update(users).set({ role: "user" }).where(eq(users.id, PARTNER_ID));
    const denied = await request(app).get("/api/admin/users")
      .set("Authorization", `Bearer ${partnerToken()}`);
    expect(denied.status).toBe(403); // artık admin değil

    // geri partner yap → tekrar erişir
    await db.update(users).set({ role: "partner" }).where(eq(users.id, PARTNER_ID));
    const allowed = await request(app).get("/api/admin/users")
      .set("Authorization", `Bearer ${partnerToken()}`);
    expect(allowed.status).not.toBe(403);
  });
});
```

> Not: `eq` ve `users` Task 4'te dosya başında import edildi — ek import gerekmez.

- [ ] **Step 2: Testlerin geçtiğini doğrula**

Run: `npx vitest run --config vitest.itest.config.ts src/server/__tests__/partner-rbac.itest.ts`
Expected: PASS (izinli uçlar 403 değil, owner-only 403, iptal anında).

> Owner-only uçlar 401/500 yerine **403** dönmeli (partner). İzinli uçlar 200/4xx-iş-hatası dönebilir ama **403 olmamalı** — bu yüzden `not.toBe(403)` kullanıldı (gövde/parametre eksikliğinden 400 gelebilir, sorun değil; amaç yetki kapısı).

- [ ] **Step 3: Commit (lokal)**

```bash
git add src/server/__tests__/partner-rbac.itest.ts
git commit -m "test(rbac): partner erişim matrisi + anında iptal itest"
```

---

## Task 7: Frontend — sekme filtresi + "Ortak yap" butonu + rozet

**Files:**
- Modify: `src/yapayzekalab/tab-admin.jsx`

> ⚠️ `admin-single-owner-contract.test.ts` frontend'de şu string'leri ARAR — SİLME: `cix.crazy666@gmail.com`, `isAdmin`, `URLSearchParams(window.location.search)`, `storeAuthTokens(tokens)`, `history.replaceState`.

- [ ] **Step 1: `SubNav`'ı görünür sekmelerle parametreleştir**

Modify `src/yapayzekalab/tab-admin.jsx` — `SubNav` bileşenini `ADMIN_SECTIONS` yerine prop alacak şekilde değiştir:

```jsx
const SubNav = ({ section, onSection, sections }) => (
  <div style={{
    display: 'flex', gap: 4, padding: 5,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh-1)',
    overflowX: 'auto', maxWidth: '100%',
  }}>
    {sections.map((s) => {
      const on = section === s.id;
      return (
        <button key={s.id} onClick={() => onSection(s.id)} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 14px', borderRadius: 'var(--r-sm)',
          fontSize: 12.5, fontWeight: 500,
          color: on ? '#fff' : 'var(--ink-2)',
          background: on ? 'var(--ink)' : 'transparent',
          whiteSpace: 'nowrap', flexShrink: 0,
          transition: 'all 0.15s',
        }}>
          <s.Ico size={14} stroke={on ? '#fff' : 'var(--ink-2)'} />
          <span>{s.label}</span>
        </button>
      );
    })}
  </div>
);
```

- [ ] **Step 2: `AdminTab`'da görünür sekmeleri hesapla ve section'ı sınırla**

Modify `src/yapayzekalab/tab-admin.jsx` — `AdminTab` içinde, `data` tanımından sonra ekle ve `useEffect` ile section guard koy. `const role = data.me?.role || 'owner';` ve:

```jsx
  const allowedTabs = data.me?.allowedTabs || ADMIN_SECTIONS.map((s) => s.id);
  const visibleSections = ADMIN_SECTIONS.filter((s) => allowedTabs.includes(s.id));

  useEffect(() => {
    if (visibleSections.length && !visibleSections.some((s) => s.id === section)) {
      setSection(visibleSections[0].id);
    }
  }, [data.me]); // me geldiğinde owner-only sekmedeyse ilk izinliye düş
```

`SubNav` çağrısını güncelle:

```jsx
      <SubNav section={section} onSection={setSection} sections={visibleSections} />
```

- [ ] **Step 3: Üst rozeti role göre göster (kozmetik)**

Modify `src/yapayzekalab/tab-admin.jsx` — "ADMIN" rozetini değiştir:

```jsx
          <Chip tone="accent" style={{ background: 'var(--ink)', color: 'var(--surface)', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
            <I.Shield size={11} stroke="var(--surface)" /> {data.me?.role === 'partner' ? 'ORTAK' : 'ADMIN'}
          </Chip>
```

- [ ] **Step 4: Kullanıcılar sekmesine "Ortak yap / Geri al" butonu (yalnız owner)**

Modify `src/yapayzekalab/tab-admin.jsx` — Kullanıcılar bölümünde, bir kullanıcı satırının/detayının aksiyon alanına owner-only buton ekle. Buton, mevcut `refresh`/`token` ve `adminRequest` deseni ile çalışır:

```jsx
{data.me?.role === 'owner' && u.email !== LAUNCH_ADMIN_EMAIL && (
  <button
    onClick={async () => {
      const nextRole = u.role === 'partner' ? 'user' : 'partner';
      const confirmMsg = nextRole === 'partner'
        ? `${u.email} ORTAK yapılsın mı? (sınırlı admin paneline erişir)`
        : `${u.email} ortaklıktan çıkarılsın mı?`;
      if (!window.confirm(confirmMsg)) return;
      try {
        await adminRequest(`/api/admin/users/${u.id}/role`, token, {
          method: 'POST',
          body: { role: nextRole },
        });
        await refresh();
      } catch (e) {
        window.alert(e.message || 'Rol değiştirilemedi');
      }
    }}
    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11.5 }}
  >
    {u.role === 'partner' ? 'Ortaklıktan çıkar' : 'Ortak yap'}
  </button>
)}
```

> `u` = o satırdaki kullanıcı nesnesi (Kullanıcılar tablosu `data.users.map((u) => ...)` içinde). `u.role` artık API'den geliyor (Task 5 serializeUser). Butonu mevcut satır-aksiyonları (ör. bakiye/detay butonlarının) yanına yerleştir.

- [ ] **Step 5: Lint + build**

Run:
```bash
npm run lint
npm run build
```
Expected: PASS (build "0 modules transformed" vermemeli; verirse `reject-template-guard` için Toolchain notuna bak — bu task yeni i18n string'i eklemiyor).

- [ ] **Step 6: Tekil-owner contract testini doğrula**

Run: `npx vitest run src/admin-single-owner-contract.test.ts`
Expected: PASS (korunması gereken string'ler — `cix.crazy666@gmail.com`, `isAdmin`, vb. — silinmedi).

- [ ] **Step 7: Manuel doğrulama (owner gözüyle)**

```bash
npm run dev
```
- Owner Google hesabıyla gir → 18 sekme görünür; Kullanıcılar'da satırlarda "Ortak yap" butonu var.
- (Partner doğrulaması Task 8 aktivasyonundan sonra: ortak hesapla gir → yalnız 11 izinli sekme; owner-only sekme yok; rozet "ORTAK".)

- [ ] **Step 8: Commit (lokal)**

```bash
git add src/yapayzekalab/tab-admin.jsx
git commit -m "feat(rbac): panel sekme filtresi (allowedTabs) + Ortak yap butonu + ORTAK rozeti"
```

---

## Task 8: Aktivasyon scripti `scripts/set-partner-role.ts`

**Files:**
- Create: `scripts/set-partner-role.ts`

- [ ] **Step 1: Scripti yaz**

Create `scripts/set-partner-role.ts`:

```ts
// Bir kullanıcıyı ortak (partner) yapar veya geri alır. Geri-alınabilir aktivasyon.
// Kullanım:
//   ENV_FILE_PATH=.env.production npx tsx scripts/set-partner-role.ts <email>
//   ENV_FILE_PATH=.env.production npx tsx scripts/set-partner-role.ts <email> --revoke
import { loadEnv } from "../src/server/lib/env.js";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { db } from "../src/server/db/client.js";
import { users } from "../src/server/db/schema.js";
import { eq } from "drizzle-orm";

const OWNER_EMAIL = "cix.crazy666@gmail.com";

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");
  if (!email) {
    console.error("Kullanım: set-partner-role.ts <email> [--revoke]");
    process.exit(1);
  }
  if (email === OWNER_EMAIL) {
    console.error("Sahip hesabının rolü bu scriptle değiştirilemez.");
    process.exit(1);
  }

  const rows = await db.select({ id: users.id, email: users.email, role: users.role })
    .from(users).where(eq(users.email, email)).limit(1);
  if (!rows.length) {
    console.error(`Kullanıcı bulunamadı: ${email} (önce siteye kaydolmuş olmalı)`);
    process.exit(1);
  }

  const nextRole = revoke ? "user" : "partner";
  await db.update(users).set({ role: nextRole, updatedAt: new Date() }).where(eq(users.id, rows[0].id));
  console.log(`OK: ${email} → role='${nextRole}' (önceki: '${rows[0].role}')`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

> ⚠️ `loadEnv` import yolu/desenini doğrula: `scripts/seed-provider-profiles.ts` aynı deseni kullanıyor (`loadEnv({ path: process.env.ENV_FILE_PATH || ".env" })`). Farklıysa o scripti referans al.

- [ ] **Step 2: Lokal DB'de dene (yıkıcı değil — geri-alınabilir)**

Run (lokal DB'de bir test e-postasıyla):
```bash
npm run db:up
npx tsx scripts/set-partner-role.ts ortak-rbac@test.local || true
```
Expected: "Kullanıcı bulunamadı" (lokal DB boşsa) VEYA "OK: … role='partner'". Hata fırlatmadan çıkar.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit (lokal)**

```bash
git add scripts/set-partner-role.ts
git commit -m "feat(rbac): set-partner-role aktivasyon scripti (geri-alınabilir)"
```

---

## Task 9: Final QA taraması (lokal kanıt)

**Files:** (yok — doğrulama)

- [ ] **Step 1: Tüm birim testleri**

Run: `npm test`
Expected: PASS (yeni `admin-permissions`, güncellenmiş `admin-auth`, mevcut tüm contract'lar dahil — özellikle `admin-single-owner-contract` ve `admin-api-settings-contract`).

- [ ] **Step 2: Tüm entegrasyon testleri (gerçek Postgres)**

Run:
```bash
npm run db:up && npm run db:migrate
npm run itest
```
Expected: PASS (özellikle `partner-rbac.itest.ts` + mevcut `admin-user-detail.itest.ts`, `mali-izleme-admin.itest.ts` — owner e-posta ile çözüldüğü için kırılmaz).

- [ ] **Step 3: Lint + build + public sızıntı taraması**

Run:
```bash
npm run lint
npm run build
npm run scan:public
```
Expected: hepsi PASS (admin yüzeyi public değil; scan:public değişmemeli).

- [ ] **Step 4: Diğer single-admin contract'larını gözden geçir**

Run: `rg -ln "ADMIN_EMAIL|SINGLE_ADMIN|cix.crazy666|single.admin" src --glob '*.test.ts' --glob '*.itest.ts'`
Beklenen liste: `admin-single-owner-contract.test.ts`, `admin-auth.test.ts`, `admin-api-settings-contract.test.ts`, `rejected-template-guard.test.ts`, `whatsapp-verified.test.ts`, itest'ler. Step 1-2 hepsini koşturdu; biri kırıldıysa partner-rolünü tanıyacak şekilde (owner-only invariant'ı koruyarak) güncelle.

- [ ] **Step 5: Özet + el-değişim notu (deploy DEĞİL)**

- Spec'teki her gereksinimi tik'le (RBAC kolonu, fail-closed authz, /me, role ucu, owner-koruma, frontend filtre, aktivasyon).
- ⚠️ **Deploy AYRI iş:** çift-onay + 3-QA gate + deploy-guard. Aktivasyon adımları (deploy SONRASI):
  1. `aineuralvision@gmail.com` siteye **kaydolmuş** olmalı (Google/GitHub).
  2. Migration deploy ile uygulanır (inert).
  3. `ENV_FILE_PATH=.env.production npx tsx scripts/set-partner-role.ts aineuralvision@gmail.com` (veya owner panelinden "Ortak yap").
  4. Geri alma: `--revoke` veya panelden "Ortaklıktan çıkar".

- [ ] **Step 6: Commit (varsa son rötuşlar)**

```bash
git add -A
git commit -m "chore(rbac): final QA — lint/test/itest/build geçti" || echo "değişiklik yok"
```

---

## Self-Review Notları (yazım sırasında doğrulandı)

- **Spec kapsamı:** RBAC kolonu (T1), izin haritası (T2), authz (T3), /me (T4), role ucu + owner-koruma (T5), erişim matrisi (T6), frontend (T7), aktivasyon (T8), QA (T9) — spec §4–§9 tam karşılanıyor. Gözcü `heal` partner'a açık (spec §10 kararı, izin haritasında `findings/:id/heal` partner-POST).
- **Tip tutarlılığı:** `AdminRole` (`admin-permissions.ts`) → `req.adminRole` (`admin-auth.ts`) → `/me` + handler guard'ları aynı `"owner"|"partner"`. `requiredRoleFor(method, fullPath)` imzası her çağrı yerinde aynı.
- **Placeholder yok:** her kod adımı gerçek kod içeriyor; migration/journal/schema/script tam.
- **Paylaşımlı-okuma tuzağı:** `loadAdminData` 11 ucu partner için de okunur (T2 haritası GET'leri partner yapar) → panel açılır.
