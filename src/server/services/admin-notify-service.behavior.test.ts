import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// env modülünü mutable mock'la. vi.hoisted ile mockEnv mock'tan önce hazır olur.
const mockEnv = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("../lib/env.js", () => ({
  get env() {
    return mockEnv.store;
  },
}));

// logger de env'i import eder; mock store boşken patlamaması için logger'ı da mock'la.
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function setEnv(over: Record<string, unknown>) {
  for (const k of Object.keys(mockEnv.store)) delete mockEnv.store[k];
  Object.assign(mockEnv.store, over);
}

async function freshModule() {
  vi.resetModules();
  return import("./admin-notify-service.js");
}

const FULL_ENV = {
  ADMIN_NOTIFY_WHATSAPP_ENABLED: true,
  ADMIN_WHATSAPP_NUMBER: "905321112233",
  OPENWA_API_URL: "https://openwa.example",
  OPENWA_API_KEY: "key",
  OPENWA_SESSION_ID: "sess",
};

describe("isNotifyConfigured matrisi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tüm env set → true", async () => {
    setEnv({ ...FULL_ENV });
    const { isNotifyConfigured } = await freshModule();
    expect(isNotifyConfigured()).toBe(true);
  });

  it("ENABLED false → false", async () => {
    setEnv({ ...FULL_ENV, ADMIN_NOTIFY_WHATSAPP_ENABLED: false });
    const { isNotifyConfigured } = await freshModule();
    expect(isNotifyConfigured()).toBe(false);
  });

  it("numara yok → false", async () => {
    setEnv({ ...FULL_ENV, ADMIN_WHATSAPP_NUMBER: undefined });
    const { isNotifyConfigured } = await freshModule();
    expect(isNotifyConfigured()).toBe(false);
  });

  it("OpenWA url yok → false", async () => {
    setEnv({ ...FULL_ENV, OPENWA_API_URL: undefined });
    const { isNotifyConfigured } = await freshModule();
    expect(isNotifyConfigured()).toBe(false);
  });
});

describe("notifyAdmin davranış", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("config eksikse fetch ÇAĞRILMAZ (no-op)", async () => {
    setEnv({ ADMIN_NOTIFY_WHATSAPP_ENABLED: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { notifyAdmin } = await freshModule();
    await notifyAdmin({ kind: "yeni_uye", title: "T" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("config tam → fetch çağrılır (OpenWA send-text)", async () => {
    setEnv({ ...FULL_ENV });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    const { notifyAdmin } = await freshModule();
    await notifyAdmin({ kind: "yeni_uye", title: "Yeni üye", userEmail: "x@y.com" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://openwa.example/api/sessions/sess/messages/send-text");
    expect((opts as { headers: Record<string, string> }).headers["x-api-key"]).toBe("key");
  });

  it("fetch reject olsa bile THROW ETMEZ (hata yutulur)", async () => {
    setEnv({ ...FULL_ENV });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const { notifyAdmin } = await freshModule();
    await expect(notifyAdmin({ kind: "odeme_sorunu", title: "T" })).resolves.toBeUndefined();
  });

  it("response !ok olsa bile THROW ETMEZ", async () => {
    setEnv({ ...FULL_ENV });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { notifyAdmin } = await freshModule();
    await expect(notifyAdmin({ kind: "odeme_sorunu", title: "T" })).resolves.toBeUndefined();
  });
});
