import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { requiredRoleFor, allowedTabsForRole } from "./server/middleware/admin-permissions.js";
import {
  LIVE_STATE_TABLES,
  redactLiveStateRow,
} from "./server/services/admin-live-state-service.js";

describe("admin live-state owner-only contract", () => {
  it("keeps every live-state endpoint owner-only", () => {
    expect(requiredRoleFor("GET", "/api/admin/live-state/summary")).toBe("owner");
    expect(requiredRoleFor("GET", "/api/admin/live-state/tables")).toBe("owner");
    expect(requiredRoleFor("GET", "/api/admin/live-state/table/users")).toBe("owner");
    expect(allowedTabsForRole("owner")).toContain("live-state");
    expect(allowedTabsForRole("partner")).not.toContain("live-state");
  });

  it("redacts cryptographic secret material from rows and nested payloads", () => {
    const row = redactLiveStateRow("users", {
      id: "u1",
      email: "owner@example.com",
      password_hash: "hash",
      key_hash: "keyhash",
      full_key_cipher: "cipher",
      api_key_cipher: "provider-cipher",
      provider_payload: {
        safe: "ok",
        access_token: "token",
        nested: { client_secret: "secret" },
      },
    });

    expect(row.email).toBe("owner@example.com");
    expect(row.password_hash).toBe("[redacted]");
    expect(row.key_hash).toBe("[redacted]");
    expect(row.full_key_cipher).toBe("[redacted]");
    expect(row.api_key_cipher).toBe("[redacted]");
    expect(row.provider_payload.safe).toBe("ok");
    expect(row.provider_payload.access_token).toBe("[redacted]");
    expect(row.provider_payload.nested.client_secret).toBe("[redacted]");
  });

  it("does not expose arbitrary table names", () => {
    expect(LIVE_STATE_TABLES).toContain("users");
    expect(LIVE_STATE_TABLES).toContain("usage_records");
    expect(LIVE_STATE_TABLES).not.toContain("pg_authid");
  });

  it("adds the frontend tab without adding it to partner tabs", () => {
    const source = readFileSync("src/yapayzekalab/tab-admin.jsx", "utf8");
    expect(source).toContain("tab-admin-live-state.jsx");
    expect(source).toContain("id: 'live-state'");
  });
});
