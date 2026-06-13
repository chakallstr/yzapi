import { describe, it, expect, vi } from "vitest";

// decryptApiKey: echo back the cipher minus a "cipher(" wrapper for deterministic test.
vi.mock("./api-key-service.js", () => ({
  encryptApiKey: (s: string) => `cipher(${s})`,
  decryptApiKey: (c: string) => (c.startsWith("cipher(") ? c.slice(7, -1) : null),
}));

describe("entitlementOverrideChain (CodeFast per-customer)", () => {
  const BASE = "https://reseller-api.codefast.app";

  it("builds /proxy/<slug> chain with decrypted cf_rc key", async () => {
    const { entitlementOverrideChain } = await import("./package-provider-override.js");
    const chain = entitlementOverrideChain(
      { entitlementId: "e1", cfApiSlug: "claude-api", cfRcKeyCipher: "cipher(cf_rc_live_abc)" },
      BASE,
    );
    expect(chain).not.toBeNull();
    expect(chain!.primary.baseUrl).toBe("https://reseller-api.codefast.app/proxy/claude-api");
    expect(chain!.primary.apiKey).toBe("cf_rc_live_abc");
    expect(chain!.primary.profileId).toBe("cf:e1");
    expect(chain!.primary.modelMap).toEqual({});
    expect(chain!.fallback).toBeNull();
  });

  it("returns null when slug or cipher missing", async () => {
    const { entitlementOverrideChain } = await import("./package-provider-override.js");
    expect(entitlementOverrideChain({ cfApiSlug: "", cfRcKeyCipher: "cipher(x)" }, BASE)).toBeNull();
    expect(entitlementOverrideChain({ cfApiSlug: "claude-api", cfRcKeyCipher: "" }, BASE)).toBeNull();
    expect(entitlementOverrideChain({}, BASE)).toBeNull();
  });

  it("returns null when key cannot be decrypted (pending_manual / bad cipher)", async () => {
    const { entitlementOverrideChain } = await import("./package-provider-override.js");
    expect(entitlementOverrideChain({ cfApiSlug: "claude-api", cfRcKeyCipher: "garbage" }, BASE)).toBeNull();
  });

  it("trims trailing slash on base before appending /proxy", async () => {
    const { entitlementOverrideChain } = await import("./package-provider-override.js");
    const chain = entitlementOverrideChain(
      { entitlementId: "e2", cfApiSlug: "codex-api", cfRcKeyCipher: "cipher(cf_rc_live_z)" },
      "https://reseller-api.codefast.app/",
    );
    expect(chain!.primary.baseUrl).toBe("https://reseller-api.codefast.app/proxy/codex-api");
  });
});
