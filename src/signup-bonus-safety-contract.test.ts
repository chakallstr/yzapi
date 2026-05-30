import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Signup bonus güvenlik sözleşmesi: yeni üye deneme bonusu, para güvenliği
// DOKUNULMAZ kurallarını ihlal etmeden eklenmiş olmalı.
const bonusSrc = readFileSync("src/server/services/signup-bonus-service.ts", "utf8");
const billingSrc = readFileSync("src/server/services/billing-service.ts", "utf8");
const paymentCommonSrc = readFileSync("src/server/services/payment-common.ts", "utf8");
const authSrc = readFileSync("src/server/routes/auth.ts", "utf8");

describe("signup bonus safety contract", () => {
  it("billing-service.ts'e dokunmadan, kendi bağımsız servisinde verilir", () => {
    // Bonus servisi creditUserBalance'ı ÇAĞIRMAZ (ayrı atomik yol).
    expect(bonusSrc).not.toMatch(/creditUserBalance/);
    // billing-service ve payment-common bonus mantığı içermez (DOKUNULMAZ korunur).
    expect(billingSrc).not.toMatch(/signup.?bonus|grantSignupBonus/i);
    expect(paymentCommonSrc).not.toMatch(/signup.?bonus|grantSignupBonus/i);
  });

  it("DRIFT=0: bonus aynı işlemde bakiyeyi artırır VE pozitif transactions satırı yazar", () => {
    // Bakiye artışı + transactions insert aynı serviste olmalı (ledger eşliği).
    expect(bonusSrc).toMatch(/db\.transaction/);
    expect(bonusSrc).toMatch(/bakiyeTL.*\+/s);
    expect(bonusSrc).toMatch(/tip:\s*"bonus"/);
    expect(bonusSrc).toMatch(/insert\(transactions\)/);
  });

  it("TEK SEFER: hesap başına bir kez (ON CONFLICT DO NOTHING + idempotency key)", () => {
    expect(bonusSrc).toMatch(/onConflictDoNothing/);
    expect(bonusSrc).toMatch(/bonus_signup_\$\{userId\}/);
  });

  it("ABUSE: IP başına azami hesap kontrolü + admin aç/kapa bayrağı var", () => {
    expect(bonusSrc).toMatch(/signupBonusMaxPerIp|maxPerIp/);
    expect(bonusSrc).toMatch(/signupBonusEnabled|enabled/);
    expect(bonusSrc).toMatch(/ip_limit/);
  });

  it("PII korunur: IP/telefon ham değil, hash'lenerek saklanır", () => {
    expect(bonusSrc).toMatch(/createHmac/);
    expect(bonusSrc).toMatch(/hashSignal/);
  });

  it("auth akışı bonusu tetikler ama bloklamaz (catch ile yutar)", () => {
    expect(authSrc).toMatch(/grantSignupBonusIfEligible/);
    expect(authSrc).toMatch(/grantSignupBonusIfEligible\([^)]*\)\s*\.catch/s);
  });
});
