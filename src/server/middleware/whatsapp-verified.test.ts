import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const enabledMock = vi.fn();
const verifiedMock = vi.fn();

vi.mock("../services/whatsapp-otp-service.js", () => ({
  hasActiveVerifiedWhatsappForUser: verifiedMock,
  isWhatsappOtpEnabled: enabledMock,
}));

const { requireWhatsappVerified } = await import("./whatsapp-verified.js");

function mockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  return res;
}

describe("requireWhatsappVerified", () => {
  beforeEach(() => {
    enabledMock.mockReset();
    verifiedMock.mockReset();
  });

  it("does nothing when WhatsApp OTP is disabled", async () => {
    enabledMock.mockReturnValue(false);
    const next = vi.fn() as NextFunction;

    await requireWhatsappVerified({ user: { id: "user-1" } } as Request, mockResponse(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(verifiedMock).not.toHaveBeenCalled();
  });

  it("blocks protected routes until the user verifies WhatsApp", async () => {
    enabledMock.mockReturnValue(true);
    verifiedMock.mockResolvedValue(false);
    const next = vi.fn() as NextFunction;
    const res = mockResponse();

    await requireWhatsappVerified({ user: { id: "user-1" } } as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "whatsapp_verification_required" })
    );
  });

  it("allows protected routes after WhatsApp verification", async () => {
    enabledMock.mockReturnValue(true);
    verifiedMock.mockResolvedValue(true);
    const next = vi.fn() as NextFunction;

    await requireWhatsappVerified({ user: { id: "user-1" } } as Request, mockResponse(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("always allows the single admin owner email", async () => {
    enabledMock.mockReturnValue(true);
    const next = vi.fn() as NextFunction;

    await requireWhatsappVerified(
      { user: { id: "user-1", email: "cix.crazy666@gmail.com" } } as Request,
      mockResponse(),
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(verifiedMock).not.toHaveBeenCalled();
  });

  it("allows authenticated profile read and save routes before whatsapp verification", async () => {
    enabledMock.mockReturnValue(true);
    const next = vi.fn() as NextFunction;

    await requireWhatsappVerified(
      {
        user: { id: "user-2", email: "user@example.com" },
        path: "/me",
        method: "GET",
      } as Request,
      mockResponse(),
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(verifiedMock).not.toHaveBeenCalled();
  });
});
