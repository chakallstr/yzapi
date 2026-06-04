import { describe, it, expect, vi } from "vitest";
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  InsufficientBalanceError,
  RateLimitError,
  ModelNotFoundError,
  ModelDisabledError,
} from "./errors.js";
import { localizeError, pickMessage } from "./error-messages.js";
import { requestLang, asLang } from "../middleware/request-lang.js";

function fakeReq(headers: Record<string, string>) {
  return { headers } as any;
}

describe("requestLang middleware", () => {
  it("prefers an explicit X-Lang header", () => {
    const req = fakeReq({ "x-lang": "EN", "accept-language": "tr-TR" });
    const next = vi.fn();
    requestLang(req, {} as any, next);
    expect(req.lang).toBe("en");
    expect(next).toHaveBeenCalledOnce();
  });

  it("falls back to Accept-Language first tag", () => {
    expect((() => { const r = fakeReq({ "accept-language": "en-US,en;q=0.9" }); requestLang(r, {} as any, vi.fn()); return r.lang; })()).toBe("en");
    expect((() => { const r = fakeReq({ "accept-language": "tr-TR,tr;q=0.9" }); requestLang(r, {} as any, vi.fn()); return r.lang; })()).toBe("tr");
  });

  it("defaults to tr for unknown/missing language", () => {
    const r1 = fakeReq({});
    requestLang(r1, {} as any, vi.fn());
    expect(r1.lang).toBe("tr");
    const r2 = fakeReq({ "accept-language": "de-DE" });
    requestLang(r2, {} as any, vi.fn());
    expect(r2.lang).toBe("tr");
  });

  it("ignores an invalid X-Lang and uses Accept-Language", () => {
    const r = fakeReq({ "x-lang": "fr", "accept-language": "en" });
    requestLang(r, {} as any, vi.fn());
    expect(r.lang).toBe("en");
  });
});

describe("asLang", () => {
  it("narrows to en only for 'en', else tr", () => {
    expect(asLang("en")).toBe("en");
    expect(asLang("tr")).toBe("tr");
    expect(asLang(undefined)).toBe("tr");
    expect(asLang("xx")).toBe("tr");
  });
});

describe("localizeError", () => {
  it("always localizes insufficient balance (402)", () => {
    expect(localizeError(new InsufficientBalanceError(), "tr")).toContain("Yetersiz bakiye");
    expect(localizeError(new InsufficientBalanceError("anything"), "en")).toContain("Insufficient balance");
  });

  it("always localizes rate limit (429)", () => {
    expect(localizeError(new RateLimitError("x", 5), "tr")).toContain("Çok fazla istek");
    expect(localizeError(new RateLimitError(), "en")).toContain("Too many requests");
  });

  it("localizes model errors and preserves the model id", () => {
    expect(localizeError(new ModelNotFoundError("gpt-5.5"), "tr")).toBe("Model bulunamadı: gpt-5.5");
    expect(localizeError(new ModelNotFoundError("gpt-5.5"), "en")).toBe("Model not found: gpt-5.5");
    expect(localizeError(new ModelDisabledError("claude-opus-4.8"), "en")).toBe("Model is currently disabled: claude-opus-4.8");
  });

  it("re-localizes only the known English defaults for generic classes", () => {
    expect(localizeError(new UnauthorizedError(), "tr")).toContain("Yetkisiz");
    expect(localizeError(new ConflictError(), "en")).toContain("Conflict");
  });

  it("preserves custom (non-default) messages — returns null", () => {
    expect(localizeError(new UnauthorizedError("Özel yetki mesajı"), "en")).toBeNull();
    expect(localizeError(new BadRequestError("Ad soyad en az 2 karakter olmalı."), "en")).toBeNull();
    expect(localizeError(new AppError(418, "Custom teapot"), "tr")).toBeNull();
  });

  it("pickMessage returns the requested language with tr fallback", () => {
    expect(pickMessage("internal", "tr")).toContain("Sunucu hatası");
    expect(pickMessage("internal", "en")).toContain("Internal server error");
    expect(pickMessage("invalidJson", "en")).toBe("Invalid JSON body.");
  });
});
