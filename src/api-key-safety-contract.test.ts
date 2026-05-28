import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const userRoute = readFileSync("src/server/routes/user.ts", "utf8");
const adminRoute = readFileSync("src/server/routes/admin.ts", "utf8");

describe("API key safety contract", () => {
  it("does not return decrypted full keys from list endpoints", () => {
    const userListStart = userRoute.indexOf('router.get("/api-keys"');
    const adminListStart = adminRoute.indexOf('router.get("/api-keys"');

    expect(userListStart).toBeGreaterThan(-1);
    expect(adminListStart).toBeGreaterThan(-1);

    const userList = userRoute.slice(userListStart, userRoute.indexOf("// GET /api/user/usage-records"));
    const adminList = adminRoute.slice(adminListStart, adminRoute.indexOf('router.post("/api-keys/revoke/:id"'));

    expect(userList).not.toContain("fullKey:");
    expect(adminList).not.toContain("fullKey:");
  });
});
