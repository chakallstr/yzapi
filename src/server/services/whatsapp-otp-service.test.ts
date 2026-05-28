import { describe, expect, it } from "vitest";

import {
  createOtpCodeHash,
  createStableHash,
  maskPhoneForDisplay,
  normalizeWhatsAppPhone,
  verifyOtpCodeHash,
} from "./whatsapp-otp-service.js";

describe("whatsapp OTP service helpers", () => {
  it("normalizes Turkish phone numbers into E.164 format", () => {
    expect(normalizeWhatsAppPhone("0531 931 07 81")).toBe("+905319310781");
    expect(normalizeWhatsAppPhone("5319310781")).toBe("+905319310781");
    expect(normalizeWhatsAppPhone("+90 531 931 07 81")).toBe("+905319310781");
  });

  it("rejects unsupported or invalid phone numbers", () => {
    expect(() => normalizeWhatsAppPhone("12345")).toThrow(/telefon/i);
    expect(() => normalizeWhatsAppPhone("+1 415 555 0101")).toThrow(/telefon/i);
  });

  it("hashes phone numbers and OTP codes without exposing raw values", () => {
    const secret = "otp-test-secret-32-characters-long";
    const phoneHash = createStableHash("+905319310781", secret);
    const codeHash = createOtpCodeHash("123456", phoneHash, secret);

    expect(phoneHash).not.toContain("+905319310781");
    expect(codeHash).not.toContain("123456");
    expect(verifyOtpCodeHash("123456", phoneHash, codeHash, secret)).toBe(true);
    expect(verifyOtpCodeHash("654321", phoneHash, codeHash, secret)).toBe(false);
  });

  it("masks phone numbers for UI/admin display", () => {
    expect(maskPhoneForDisplay("+905319310781")).toBe("+90 *** *** 0781");
  });
});
