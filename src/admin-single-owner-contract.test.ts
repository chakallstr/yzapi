import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function frontendSource(): string {
  return [
    "src/App.tsx",
    "src/yapayzekalab/App.jsx",
    "src/yapayzekalab/tab-admin.jsx",
  ].map(source).join("\n");
}

describe("single owner admin contract", () => {
  it("removes separate admin password login from the frontend", () => {
    const app = frontendSource();

    expect(app).toContain("cix.crazy666@gmail.com");
    expect(app).toContain("isAdmin");
    expect(app).toContain("URLSearchParams(window.location.search)");
    expect(app).toContain("storeAuthTokens(tokens)");
    expect(app).toContain("history.replaceState");
    expect(app).not.toContain("adminLoginPw");
    expect(app).not.toContain("adminToken");
    expect(app).not.toContain("yz_admin_token");
    expect(app).not.toContain("/api/admin/login");
    expect(app).not.toContain("Admin Girişi");
    expect(app).not.toContain("admin parola");
    expect(app).not.toContain("Admin paneline gir");
  });

  it("removes separate admin password requirements from backend config and routes", () => {
    expect(source("src/server/lib/env.ts")).not.toContain("ADMIN_PASSWORD");
    expect(source("src/server/__tests__/setup.ts")).not.toContain("ADMIN_PASSWORD");

    const adminAuthRoute = source("src/server/routes/admin-auth.ts");
    expect(adminAuthRoute).not.toContain("signAccessToken");
    expect(adminAuthRoute).not.toContain("constantTimeCompare");
    expect(adminAuthRoute).not.toContain("Invalid password");
    expect(adminAuthRoute).toContain('router.post("/login"');
    expect(adminAuthRoute).toContain("res.status(410)");
  });

  it("maps the Google OAuth return dashboard route into the authenticated account area", () => {
    const app = source("src/App.tsx");

    expect(app).toContain('path.startsWith("/dashboard")');
    expect(app).toContain('return "account"');
  });
});
