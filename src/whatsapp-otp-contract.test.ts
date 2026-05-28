import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schemaSource = readFileSync("src/server/db/schema.ts", "utf8");
const authSource = readFileSync("src/server/routes/auth.ts", "utf8");
const indexSource = readFileSync("src/server/index.ts", "utf8");
const loggerSource = readFileSync("src/server/lib/logger.ts", "utf8");
const appSource = readFileSync("src/yapayzekalab/App.jsx", "utf8");
const authClientSource = readFileSync("src/yapayzekalab/auth-client.js", "utf8");

describe("WhatsApp OTP registration contract", () => {
  it("adds durable no-hard-delete WhatsApp OTP tables", () => {
    expect(schemaSource).toContain("whatsappOtpRequests");
    expect(schemaSource).toContain("whatsappVerifiedNumbers");
    expect(schemaSource).toContain("account_closed");
    expect(schemaSource).toContain("blocked");
    expect(schemaSource).toContain("marketing_consent");
  });

  it("routes Google callback through a pending WhatsApp token before issuing user tokens", () => {
    expect(authSource).toContain("signWhatsappPendingToken");
    expect(authSource).toContain("whatsapp-otp/start");
    expect(authSource).toContain("whatsapp-otp/verify");
    expect(authSource).toContain("whatsapp-otp/resend");
    expect(authSource).toContain("wpt");
  });

  it("gates protected user/admin/payment/API-key surfaces when OTP is enabled", () => {
    expect(indexSource).toContain("requireWhatsappVerified");
    expect(indexSource).toContain('app.use("/api/user", userAuth, requireWhatsappVerified, userRouter)');
    expect(indexSource).toContain('app.use("/api/admin", adminAuth, requireWhatsappVerified, adminRouter)');
    expect(indexSource).toContain('app.use("/v1", apiKeyAuth, requireWhatsappVerified, proxyRouter)');
  });

  it("redacts phone and OTP fields from structured logs", () => {
    expect(loggerSource).toContain('"phone"');
    expect(loggerSource).toContain('"otp"');
    expect(loggerSource).toContain('"code"');
    expect(loggerSource).toContain('"provider_message_id"');
  });

  it("keeps the frontend theme intact while adding a pending OTP state", () => {
    expect(appSource).toContain("WhatsAppOtpScreen");
    expect(authClientSource).toContain("whatsapp_pending_token");
    expect(appSource).not.toContain("OPENWA_API_KEY");
  });
});
