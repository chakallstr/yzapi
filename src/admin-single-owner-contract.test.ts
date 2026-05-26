import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("single owner admin contract", () => {
  it("removes separate admin password login from the frontend", () => {
    const app = source("src/App.tsx");

    expect(app).toContain('ADMIN_EMAIL = "cix.crazy666@gmail.com"');
    expect(app).toContain("isAdminUser");
    expect(app).not.toContain("adminLoginPw");
    expect(app).not.toContain("adminToken");
    expect(app).not.toContain("/api/admin/login");
    expect(app).not.toContain("Admin Girişi");
  });

  it("removes separate admin password requirements from backend config and routes", () => {
    expect(source("src/server/lib/env.ts")).not.toContain("ADMIN_PASSWORD");

    const adminAuthRoute = source("src/server/routes/admin-auth.ts");
    expect(adminAuthRoute).not.toContain("signAccessToken");
    expect(adminAuthRoute).not.toContain("constantTimeCompare");
    expect(adminAuthRoute).not.toContain("Invalid password");
    expect(adminAuthRoute).toContain('router.post("/login"');
    expect(adminAuthRoute).toContain("res.status(410)");
  });
});
