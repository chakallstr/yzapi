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
