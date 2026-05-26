import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("payment safety contract", () => {
  it("uses 250 TL as the default minimum top-up everywhere", () => {
    expect(source("./server/db/schema.ts")).toMatch(/minBakiyeTL:.*default\("250"\)/);
    expect(source("./server/db/seed.ts")).toContain('minBakiyeTL: "250"');
    expect(source("./server/routes/payments.ts")).toContain('minBakiyeTL: "250"');
    expect(source("./App.tsx")).toContain('useState("250")');
    expect(source("./App.tsx")).toContain('setBakiyeModalMiktar("250")');
  });

  it("does not acknowledge a paid Cryptomus webhook when balance credit fails", () => {
    const payments = source("./server/routes/payments.ts");

    expect(payments).toMatch(/const\s+credit\s*=\s*await\s+creditUserBalance/);
    expect(payments).toMatch(/!credit\.success\s*&&\s*!credit\.alreadyCredited/);
    expect(payments).toContain('res.status(500).json({ error: "Bakiye yüklenirken hata oluştu." })');
    expect(payments).not.toContain('logger.info({ body }, "Cryptomus webhook received")');
    expect(payments).not.toContain('logger.warn({ body }, "Cryptomus webhook signature invalid")');
  });

  it("describes gross usable balance consistently in payment receipt emails", () => {
    const emailService = source("./server/services/email-service.ts");

    expect(emailService).toContain("Bakiyenize <strong>₺${payment.miktarTL.toFixed(2)}</strong> eklendi.");
    expect(emailService).toContain("Kullanılabilir Bakiye");
    expect(emailService).toContain("payment.miktarTL.toFixed(2)");
  });

  it("uses backend payment method availability before enabling modal actions", () => {
    const app = source("./App.tsx");

    expect(app).toContain("paymentMethods");
    expect(app).toContain("loadPaymentMethods");
    expect(app).toContain("isPaymentMethodEnabled");
    expect(app).toContain("Ödeme yöntemi şu an kapalı");
  });
});
