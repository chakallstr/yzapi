import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSql = vi.fn();
const mockEncrypt = vi.fn((k: string) => `enc(${k})`);
const mockDecrypt = vi.fn();

vi.mock("../db/client.js", () => ({
  db: {},
  dbSql: Object.assign((...args: unknown[]) => mockDbSql(...args), { begin: vi.fn() }),
}));

vi.mock("./api-key-service.js", () => ({
  encryptApiKey: (k: string) => mockEncrypt(k),
  decryptApiKey: (c: string) => mockDecrypt(c),
}));

describe("packageOverrideChain", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when both fields are empty (normal routing — davranış değişmez)", async () => {
    const { packageOverrideChain } = await import("./package-provider-override.js");
    expect(packageOverrideChain({ packageId: "p1" })).toBeNull();
    expect(packageOverrideChain({ packageId: "p1", providerBaseUrl: null, providerApiKeyCipher: null })).toBeNull();
    expect(packageOverrideChain({ packageId: "p1", providerBaseUrl: "  ", providerApiKeyCipher: "" })).toBeNull();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it("returns null when only one of the two fields is set", async () => {
    const { packageOverrideChain } = await import("./package-provider-override.js");
    expect(packageOverrideChain({ packageId: "p1", providerBaseUrl: "https://x.example/v1" })).toBeNull();
    expect(packageOverrideChain({ packageId: "p1", providerApiKeyCipher: "v1.a.b.c" })).toBeNull();
  });

  it("returns null when the cipher cannot be decrypted (istek kırılmaz, normal routing)", async () => {
    mockDecrypt.mockReturnValueOnce(null);
    const { packageOverrideChain } = await import("./package-provider-override.js");
    expect(packageOverrideChain({ packageId: "p1", providerBaseUrl: "https://x.example/v1", providerApiKeyCipher: "broken" })).toBeNull();
  });

  it("builds a single-provider chain (fallback=null) when both fields are set", async () => {
    mockDecrypt.mockReturnValueOnce("sk-secret");
    const { packageOverrideChain } = await import("./package-provider-override.js");
    const chain = packageOverrideChain({
      packageId: "gpt-gunluk-1000",
      providerBaseUrl: " https://upstream.example/v1 ",
      providerApiKeyCipher: "v1.iv.tag.data",
    });
    expect(chain).toEqual({
      primary: {
        profileId: "pkg:gpt-gunluk-1000",
        baseUrl: "https://upstream.example/v1",
        apiKey: "sk-secret",
        modelMap: {},
        source: { baseUrl: "db", apiKey: "db" },
      },
      fallback: null,
    });
  });
});

describe("seatPrimaryPackageChain", () => {
  it("never adds CodeFast as a fallback for a Codex seat", async () => {
    const { seatPrimaryPackageChain } = await import("./package-provider-override.js");
    const seat = {
      primary: {
        profileId: "sub-codex",
        baseUrl: "http://127.0.0.1:8318/v1",
        apiKey: "seat-key",
        modelMap: {},
        source: { baseUrl: "db" as const, apiKey: "db" as const },
      },
      fallback: null,
    };
    const cf = {
      primary: {
        profileId: "cf:e1",
        baseUrl: "https://reseller-api.codefast.app/proxy/codex-api/v1",
        apiKey: "cf-key",
        modelMap: {},
        source: { baseUrl: "db" as const, apiKey: "db" as const },
      },
      fallback: null,
    };

    expect(seatPrimaryPackageChain(seat, cf)).toEqual({
      primary: seat.primary,
      fallback: null,
    });
  });
});

describe("entitlementOverrideChain (CodeFast reseller)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when slug or key cipher is missing (CF kapalı → normal routing)", async () => {
    const { entitlementOverrideChain } = await import("./package-provider-override.js");
    const base = "https://reseller-api.codefast.app";
    expect(entitlementOverrideChain({ entitlementId: "e1" }, base)).toBeNull();
    expect(entitlementOverrideChain({ entitlementId: "e1", cfApiSlug: "codex-api" }, base)).toBeNull();
    expect(entitlementOverrideChain({ entitlementId: "e1", cfRcKeyCipher: "v1.a.b.c" }, base)).toBeNull();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it("returns null when the cipher cannot be decrypted (istek kırılmaz)", async () => {
    mockDecrypt.mockReturnValueOnce(null);
    const { entitlementOverrideChain } = await import("./package-provider-override.js");
    expect(
      entitlementOverrideChain(
        { entitlementId: "e1", cfApiSlug: "codex-api", cfRcKeyCipher: "broken" },
        "https://reseller-api.codefast.app",
      ),
    ).toBeNull();
  });

  it("appends /v1 to the proxy path → /proxy/<slug>/v1 (CF 404 'Hata Oluştu' fix)", async () => {
    mockDecrypt.mockReturnValueOnce("cf_rc_live_secret");
    const { entitlementOverrideChain } = await import("./package-provider-override.js");
    const chain = entitlementOverrideChain(
      { entitlementId: "e1", cfApiSlug: "codex-api", cfRcKeyCipher: "v1.iv.tag.data" },
      "https://reseller-api.codefast.app/",
    );
    expect(chain).toEqual({
      primary: {
        profileId: "cf:e1",
        // upstream forward /chat/completions·/responses·/messages ekler → tam: /proxy/codex-api/v1/chat/completions
        baseUrl: "https://reseller-api.codefast.app/proxy/codex-api/v1",
        apiKey: "cf_rc_live_secret",
        modelMap: {},
        source: { baseUrl: "db", apiKey: "db" },
      },
      fallback: null,
    });
  });
});

describe("requiresCfKeyReady", () => {
  it("returns false for codex-api even when no chain (koltuk fallback var → 409 atma)", async () => {
    const { requiresCfKeyReady } = await import("./package-provider-override.js");
    expect(requiresCfKeyReady("codex-api", null)).toBe(false);
    expect(requiresCfKeyReady({ cfApiSlug: "codex-api" }, null)).toBe(false);
    expect(requiresCfKeyReady({ cfApiSlug: "codex-api", entitlementId: "e1" }, null)).toBe(false);
  });

  it("returns false when a chain exists (key ready — regardless of slug)", async () => {
    const { requiresCfKeyReady } = await import("./package-provider-override.js");
    const chain = { primary: { profileId: "cf:e1", baseUrl: "x", apiKey: "k", modelMap: {}, source: { baseUrl: "db" as const, apiKey: "db" as const } }, fallback: null };
    expect(requiresCfKeyReady("codex-api", chain)).toBe(false);
    expect(requiresCfKeyReady("glm-api", chain)).toBe(false);
  });

  it("returns true for non-codex CF slug without a chain (koltuk fallback YOK → 409 korunur)", async () => {
    const { requiresCfKeyReady } = await import("./package-provider-override.js");
    expect(requiresCfKeyReady("glm-api", null)).toBe(true);
    expect(requiresCfKeyReady("composer-api", null)).toBe(true);
    expect(requiresCfKeyReady({ cfApiSlug: "glm-api" }, null)).toBe(true);
  });

  it("returns false when slug is empty/null (no CF package → gate atlanır)", async () => {
    const { requiresCfKeyReady } = await import("./package-provider-override.js");
    expect(requiresCfKeyReady("", null)).toBe(false);
    expect(requiresCfKeyReady(null, null)).toBe(false);
    expect(requiresCfKeyReady(undefined, null)).toBe(false);
    expect(requiresCfKeyReady({ cfApiSlug: undefined }, null)).toBe(false);
    expect(requiresCfKeyReady("   ", null)).toBe(false);
  });
});

describe("setPackageProviderOverride", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is a no-op when neither field is provided (no DB call)", async () => {
    const { setPackageProviderOverride } = await import("./package-provider-override.js");
    const ok = await setPackageProviderOverride("p1", {});
    expect(ok).toBe(true);
    expect(mockDbSql).not.toHaveBeenCalled();
  });

  it("encrypts the key on set and returns true when the package exists", async () => {
    mockDbSql.mockResolvedValueOnce([{ id: "p1" }]);
    const { setPackageProviderOverride } = await import("./package-provider-override.js");
    const ok = await setPackageProviderOverride("p1", {
      providerBaseUrl: "https://upstream.example/v1",
      providerApiKey: "sk-live-123",
    });
    expect(ok).toBe(true);
    expect(mockEncrypt).toHaveBeenCalledWith("sk-live-123");
  });

  it("rejects a malformed or non-http(s) endpoint URL with 400", async () => {
    const { setPackageProviderOverride } = await import("./package-provider-override.js");
    await expect(setPackageProviderOverride("p1", { providerBaseUrl: "not-a-url" })).rejects.toThrow("Geçersiz endpoint URL");
    await expect(setPackageProviderOverride("p1", { providerBaseUrl: "ftp://x.example" })).rejects.toThrow("Geçersiz endpoint URL");
    expect(mockDbSql).not.toHaveBeenCalled();
  });

  it("returns false when the package does not exist", async () => {
    mockDbSql.mockResolvedValueOnce([]);
    const { setPackageProviderOverride } = await import("./package-provider-override.js");
    expect(await setPackageProviderOverride("yok", { providerBaseUrl: "https://x" })).toBe(false);
  });

  it("clears fields when empty strings are passed (no encryption)", async () => {
    mockDbSql.mockResolvedValueOnce([{ id: "p1" }]);
    const { setPackageProviderOverride } = await import("./package-provider-override.js");
    const ok = await setPackageProviderOverride("p1", { providerBaseUrl: "", providerApiKey: "" });
    expect(ok).toBe(true);
    expect(mockEncrypt).not.toHaveBeenCalled();
  });
});
