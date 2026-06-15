# IBAN Ödeme — İki Aşamalı WhatsApp Bildirimi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IBAN bakiye-yükleme akışında Ufuk'a giden WhatsApp bildirimini iki aşamalı (hazırlanıyor → yapıldı) ve daha bilgili hale getirmek; butona basıp bildirim spam'lemesini kullanıcı başına 1/dk ile engellemek.

**Architecture:** Mevcut `/api/payments/iban/init` + `admin-notify-service` + `tab-account.jsx` üzerine ek. Aşama 1 init bildirimi metin + 60sn satır/bildirim tekilleştirme; Aşama 2 yeni `/api/payments/iban/confirm` ucu (DB-yazmaz, sahiplik + rate-limit + bildirim) + frontend "Ödedim" butonu. Billing/kredi mantığı ve DB şeması DEĞİŞMEZ.

**Tech Stack:** Express + TypeScript, Drizzle ORM, React/JSX (Vite), Vitest. Bildirim OpenWA HTTP API (mevcut never-throw servis).

**Spec:** `docs/superpowers/specs/2026-06-15-iban-odeme-bildirim-design.md`

---

## File Structure

- `src/server/services/rate-limit-service.ts` — yeni export `consumeActionRate(scope, perMinute)` (aksiyon limiti; token tüketir, restore etmez).
- `src/server/services/admin-notify-service.ts` — `AdminEventKind`'e `"odeme_yapildi"`; `AdminNotifyEvent.amountUsd?`; `formatAdminEvent` USD≈TL satırı + ✅ ikon.
- `src/server/routes/payments.ts` — `iban/init` dedup + notify-gate + metin; yeni `iban/confirm`; `buildPaymentNotification` mesaj başlığı.
- `src/yapayzekalab/i18n/strings/account.js` — TR/EN: `confirmPaid`, `topUp.cooldown`.
- `src/yapayzekalab/tab-account.jsx` — cooldown state + `paymentId` instruction alanı + `onConfirmIbanPaidNotify` + buton etiketi.
- `src/server/services/admin-notify-service.test.ts` — USD render + yeni kind (unit, deterministik).
- `src/server/services/rate-limit-service.test.ts` — `consumeActionRate` (unit, deterministik). *(yoksa oluştur)*
- `src/server/__tests__/iban-notify.itest.ts` — confirm sahiplik/429/uuid + init dedup (real PG).

---

### Task 1: rate-limit — `consumeActionRate` aksiyon limiti

**Files:**
- Modify: `src/server/services/rate-limit-service.ts`
- Test: `src/server/services/rate-limit-service.test.ts` (yeni)

- [ ] **Step 1: Failing test yaz**

`src/server/services/rate-limit-service.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { consumeActionRate } from "./rate-limit-service.js";

describe("consumeActionRate (aksiyon limiti)", () => {
  it("aynı scope'ta perMinute=1 → ilki allowed, ikincisi reddedilir + retryAfter", () => {
    const scope = `test-action-${Math.random()}`;
    const first = consumeActionRate(scope, 1);
    const second = consumeActionRate(scope, 1);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(typeof second.retryAfter).toBe("number");
  });

  it("limit<=0 → her zaman allowed (kapalı)", () => {
    expect(consumeActionRate(`x-${Math.random()}`, 0).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

Run: `npx vitest run src/server/services/rate-limit-service.test.ts`
Expected: FAIL — `consumeActionRate is not a function`.

- [ ] **Step 3: Minimal implementasyon**

`rate-limit-service.ts`'te `consumeBucket` fonksiyonundan sonra ekle (export):
```ts
// Tek atımlık aksiyon limiti (ör. ödeme bildirimi 1/dk). Token tüketir, RESTORE ETMEZ
// (checkRateLimit'in çok-guard restore mantığından farklı; burada aksiyon gerçekleşti sayılır).
export function consumeActionRate(scope: string, perMinute: number): { allowed: boolean; retryAfter?: number } {
  const r = consumeBucket(scope, perMinute);
  return { allowed: r.allowed, retryAfter: r.retryAfter };
}
```

- [ ] **Step 4: Testi çalıştır, PASS gör**

Run: `npx vitest run src/server/services/rate-limit-service.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/rate-limit-service.ts src/server/services/rate-limit-service.test.ts
git commit -m "feat(payments): consumeActionRate aksiyon limiti helper'ı"
```

---

### Task 2: admin-notify — `odeme_yapildi` kind + USD≈TL render

**Files:**
- Modify: `src/server/services/admin-notify-service.ts:23` (AdminEventKind), `:25-35` (interface), `:70-91` (formatAdminEvent)
- Test: `src/server/services/admin-notify-service.test.ts`

- [ ] **Step 1: Failing test ekle**

`admin-notify-service.test.ts` içine (mevcut `describe("admin-notify formatAdminEvent (saf)")` bloğuna) ekle:
```ts
  it("ödeme yapıldı olayını formatlar (✅ + USD≈TL)", () => {
    const text = formatAdminEvent({
      kind: "odeme_yapildi",
      title: "Ödeme YAPILDI (müşteri bildirdi)",
      userEmail: "c@d.com",
      amountUsd: 10,
      amountTL: 478,
      reference: "ABC123",
    });
    expect(text).toContain("✅ YapayZekaLab — Ödeme YAPILDI (müşteri bildirdi)");
    expect(text).toContain("Tutar: $10.00 ≈ ₺478.00");
    expect(text).toContain("Referans: ABC123");
  });

  it("amountUsd yoksa eski ₺-only davranışı korunur", () => {
    const text = formatAdminEvent({ kind: "odeme_denemesi", title: "T", amountTL: 100 });
    expect(text).toContain("Tutar: ₺100.00");
    expect(text).not.toContain("$");
  });
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

Run: `npx vitest run src/server/services/admin-notify-service.test.ts`
Expected: FAIL — `✅` üretilmiyor / `$10.00 ≈ ₺478.00` yok.

- [ ] **Step 3: Implementasyon**

`admin-notify-service.ts`:

(a) Type union'a ekle (satır 23):
```ts
export type AdminEventKind = "yeni_uye" | "odeme_denemesi" | "odeme_yapildi" | "odeme_sorunu" | "sistem_uyarisi";
```

(b) Interface'e `amountUsd?` ekle (satır 30 civarı, `amountTL?` altına):
```ts
  amountTL?: number;
  amountUsd?: number;
```

(c) `formatAdminEvent` ikon zincirine `odeme_yapildi` ekle (satır 71-80):
```ts
  const ikon =
    event.kind === "sistem_uyarisi"
      ? event.severity === "yellow"
        ? "🟡"
        : "🔴"
      : event.kind === "odeme_sorunu"
        ? "🔴"
        : event.kind === "odeme_yapildi"
          ? "✅"
          : event.kind === "odeme_denemesi"
            ? "💳"
            : "🆕";
```

(d) Tutar satırını USD-aware yap (satır 84-86 bloğunu değiştir):
```ts
  if (typeof event.amountUsd === "number" && Number.isFinite(event.amountUsd)) {
    const tl =
      typeof event.amountTL === "number" && Number.isFinite(event.amountTL)
        ? ` ≈ ₺${event.amountTL.toFixed(2)}`
        : "";
    lines.push(`Tutar: $${event.amountUsd.toFixed(2)}${tl}`);
  } else if (typeof event.amountTL === "number" && Number.isFinite(event.amountTL)) {
    lines.push(`Tutar: ₺${event.amountTL.toFixed(2)}`);
  }
```

- [ ] **Step 4: Testi çalıştır, PASS gör (mevcut 6 + yeni 2)**

Run: `npx vitest run src/server/services/admin-notify-service.test.ts`
Expected: PASS (8 test). Mevcut "Tutar: ₺100.00" testi de geçer.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/admin-notify-service.ts src/server/services/admin-notify-service.test.ts
git commit -m "feat(notify): odeme_yapildi olay tipi + USD≈TL tutar gösterimi"
```

---

### Task 3: payments — iban/init dedup + notify-gate + metin

**Files:**
- Modify: `src/server/routes/payments.ts:95-108` (buildPaymentNotification mesajı), `:773-789` (init bildirim bloğu + dedup)
- Import: `consumeActionRate` (rate-limit-service)

- [ ] **Step 1: Import ekle (dosya başı, satır 17 civarı `notifyAdmin` import'undan sonra)**

```ts
import { consumeActionRate } from "../services/rate-limit-service.js";
```

- [ ] **Step 2: `buildPaymentNotification` mesaj başlığını güncelle**

`payments.ts` satır 95-101 `whatsappMessage` dizisinin ilk elemanını değiştir:
```ts
  const whatsappMessage = [
    "Ödeme yapıldı ✅ — YapayZekaLab ödeme bildirimi",
    `Yöntem: ${opts.method}`,
    `Bakiye: $${opts.amountUsd.toFixed(2)}`,
    `Ödeme: ${opts.payableLabel}`,
    opts.userEmail ? `Hesap: ${opts.userEmail}` : null,
  ].filter(Boolean).join("\n");
```

- [ ] **Step 3: iban/init gövdesini dedup + gate ile değiştir**

`payments.ts` satır 734-789 arasını (kdv hesabından notify bloğunun sonuna kadar) şununla değiştir:
```ts
    const kdv = calcKdv(quote.payableTL);
    const userId = req.user!.id;

    // 60sn içinde aynı tutarla açılmış bekleyen IBAN ödemesi varsa onu yeniden kullan
    // (mükerrer payments/pending satırı + bildirim spam'ini önler — IBAN her durumda gösterilir).
    const recent = await db
      .select({
        id: payments.id,
        payableTL: payments.payableTL,
        idempotencyKey: payments.idempotencyKey,
        olusturma: payments.olusturma,
      })
      .from(payments)
      .where(and(eq(payments.userId, userId), eq(payments.metod, "iban"), eq(payments.durum, "bekliyor")))
      .orderBy(desc(payments.olusturma))
      .limit(1);

    const recentRow = recent[0];
    const reused = Boolean(
      recentRow &&
        recentRow.olusturma instanceof Date &&
        Date.now() - recentRow.olusturma.getTime() < 60_000 &&
        recentRow.payableTL !== null &&
        Math.abs(Number(recentRow.payableTL) - quote.payableTL) < 0.005,
    );

    // Müşteriye görünmeyen iç eşleştirme anahtarı (payments ↔ pending_iban_payments).
    let paymentId: string;
    let idempotencyKey: string;
    if (reused) {
      paymentId = recentRow!.id;
      idempotencyKey = recentRow!.idempotencyKey ?? generateIdempotencyKey();
    } else {
      idempotencyKey = generateIdempotencyKey();
      const paymentInserted = await db
        .insert(payments)
        .values({
          userId,
          metod: "iban",
          miktarTL: String(quote.payableTL),
          kdvTL: String(kdv.kdvTL),
          netTL: String(kdv.netTL),
          amountUsd: String(quote.amountUsd),
          payableTL: String(quote.payableTL),
          creditTL: String(quote.creditTL),
          kurAtPayment: String(quote.kur),
          roundingTL: String(quote.roundingTL),
          durum: "bekliyor",
          idempotencyKey,
        })
        .returning({ id: payments.id });
      paymentId = paymentInserted[0].id;

      await db.insert(pendingIbanPayments).values({
        userId,
        miktarTL: String(quote.payableTL),
        kdvTL: String(kdv.kdvTL),
        amountUsd: String(quote.amountUsd),
        payableTL: String(quote.payableTL),
        creditTL: String(quote.creditTL),
        kurAtPayment: String(quote.kur),
        roundingTL: String(quote.roundingTL),
        referansKodu: idempotencyKey,
      });
    }

    const userRows = await db
      .select({ email: users.email, adSoyad: users.adSoyad })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const settings = await getManualPaymentSettings();

    // Aşama 1 "Ödeme hazırlanıyor" bildirimi: yalnız yeni kayıtta VE kullanıcı başına 1/dk.
    if (!reused && consumeActionRate(`iban_notify_${userId}`, 1).allowed) {
      adminPaymentNotificationEmail({
        title: "Yeni IBAN ödeme bildirimi",
        userEmail: userRows[0]?.email,
        method: "iban",
        amountUsd: quote.amountUsd,
        payableTL: quote.payableTL,
        creditTL: quote.creditTL,
        status: "bekliyor",
      }).catch((e: unknown) => logger.error({ err: e }, "admin payment notification failed"));
      notifyAdmin({
        kind: "odeme_denemesi",
        title: "Ödeme hazırlanıyor (IBAN)",
        userEmail: userRows[0]?.email,
        method: "iban",
        amountUsd: quote.amountUsd,
        amountTL: quote.payableTL,
        reference: idempotencyKey,
        status: "bekliyor",
        detail: userRows[0]?.adSoyad ? `Ad: ${userRows[0].adSoyad}` : undefined,
      }).catch((e: unknown) => logger.error({ err: e }, "admin notify (iban init) failed"));
    }
```

> NOT: Bu blok eski `paymentInserted`/`paymentId`/`userRows`/`settings` tanımlarının ve eski iki notify çağrısının YERİNE geçer. `res.json({ paymentId, ... })` bloğu (satır 791-808) AYNEN kalır — `paymentId`, `settings`, `userRows`, `kdv`, `quote` hâlâ tanımlı.

- [ ] **Step 4: Tip kontrolü + ilgili testler**

Run: `npm run lint`
Expected: tsc hatasız.
Run: `npx vitest run src/payment-safety-contract.test.ts`
Expected: PASS (contract'lar — `buildPaymentNotification` korundu).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/payments.ts
git commit -m "feat(payments): iban/init Ödeme hazırlanıyor metni + 60sn dedup/notify-gate"
```

---

### Task 4: payments — `POST /api/payments/iban/confirm` (Aşama 2)

**Files:**
- Modify: `src/server/routes/payments.ts` (iban/init route'undan hemen sonra, satır 810 civarı)

- [ ] **Step 1: Confirm route'unu ekle**

`payments.ts`'te `// ── POST /api/payments/crypto/init` yorumundan ÖNCE ekle:
```ts
// ── POST /api/payments/iban/confirm — müşteri "ödedim" dedi → admin'e bildir ────
// DB'ye YAZMAZ (durum değişmez, bakiyeye dokunmaz); yalnız sahiplik doğrular + WhatsApp.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.post("/iban/confirm", userAuth, requireWhatsappVerified, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const limit = consumeActionRate(`iban_confirm_${userId}`, 1);
    if (!limit.allowed) {
      res.status(429).json({ error: "Çok sık denediniz, lütfen biraz bekleyin.", retryAfter: limit.retryAfter });
      return;
    }

    const paymentId = String((req.body as Record<string, unknown>)?.paymentId ?? "").trim();
    if (!UUID_RE.test(paymentId)) {
      res.status(404).json({ error: "Ödeme bulunamadı." });
      return;
    }

    const rows = await db
      .select({
        id: payments.id,
        payableTL: payments.payableTL,
        amountUsd: payments.amountUsd,
        idempotencyKey: payments.idempotencyKey,
      })
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.userId, userId), eq(payments.metod, "iban")))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Ödeme bulunamadı." });
      return;
    }

    const userRows = await db
      .select({ email: users.email, adSoyad: users.adSoyad })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    notifyAdmin({
      kind: "odeme_yapildi",
      title: "Ödeme YAPILDI (müşteri bildirdi)",
      userEmail: userRows[0]?.email,
      method: "iban",
      amountUsd: row.amountUsd === null ? undefined : Number(row.amountUsd),
      amountTL: row.payableTL === null ? undefined : Number(row.payableTL),
      reference: row.idempotencyKey ?? undefined,
      status: "müşteri ödedim dedi",
      detail: userRows[0]?.adSoyad ? `Ad: ${userRows[0].adSoyad}` : undefined,
    }).catch((e: unknown) => logger.error({ err: e }, "admin notify (iban confirm) failed"));

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run lint`
Expected: tsc hatasız.

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/payments.ts
git commit -m "feat(payments): iban/confirm ucu — müşteri ödedim bildirimi (DB-yazmaz, 1/dk)"
```

---

### Task 5: i18n — confirmPaid + cooldown metinleri (TR/EN)

**Files:**
- Modify: `src/yapayzekalab/i18n/strings/account.js` (TR ~satır 159, EN ~satır 387)

- [ ] **Step 1: TR bloğuna ekle** (satır 160 `whatsappMissing`'ten sonra)

```js
    'account.instruction.confirmPaid': 'Ödedim — WhatsApp ile bildir',
    'account.topUp.cooldown': 'Bilgiler gönderildi · {n}s',
```

- [ ] **Step 2: EN bloğuna ekle** (satır 388 `whatsappMissing` EN karşılığından sonra)

```js
    'account.instruction.confirmPaid': 'I paid — notify via WhatsApp',
    'account.topUp.cooldown': 'Details sent · {n}s',
```

- [ ] **Step 3: i18n parite testi (varsa) çalıştır**

Run: `npx vitest run -t "i18n" 2>/dev/null || npm test`
Expected: TR/EN anahtar paritesi PASS (yeni iki anahtar her iki dilde de var).

- [ ] **Step 4: Commit**

```bash
git add src/yapayzekalab/i18n/strings/account.js
git commit -m "feat(i18n): IBAN ödedim/cooldown metinleri (TR/EN)"
```

---

### Task 6: frontend — cooldown + paymentId + onConfirmIbanPaidNotify

**Files:**
- Modify: `src/yapayzekalab/tab-account.jsx` (state ~satır 597, onTopUp ~984-997, instruction panel ~1303-1316, pay button ~1320-1329)

- [ ] **Step 1: State + cooldown effect ekle** (satır 597 `paymentInstruction` state'inden sonra)

```jsx
  const [topUpCooldown, setTopUpCooldown] = useState(0);
```
Ve component içinde uygun bir yere (diğer useEffect'lerin yanına) cooldown sayaç effect'i:
```jsx
  useEffect(() => {
    if (topUpCooldown <= 0) return undefined;
    const id = setInterval(() => setTopUpCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [topUpCooldown]);
```

- [ ] **Step 2: onTopUp iban dalına paymentId + cooldown ekle** (satır 984-997)

`if (payMethod === 'iban') { setPaymentInstruction({...}) ... }` bloğunu güncelle:
```jsx
      if (payMethod === 'iban') {
        setPaymentInstruction({
          method: 'iban',
          title: t('account.instruction.ibanTitle'),
          paymentId: result?.paymentId,
          quote: result?.quote,
          payableLabel: `₺${Number(result?.quote?.payableTL || payableTL).toFixed(0)}`,
          balanceLabel: `$${Number(result?.quote?.amountUsd || effectiveAmount).toFixed(2)}`,
          iban: result?.iban,
          whatsapp: result?.whatsapp,
          note: result?.aciklama,
        });
        setTopUpCooldown(60);
        await loadAccount();
        return;
      }
```

- [ ] **Step 3: onConfirmIbanPaidNotify handler ekle** (onTopUp fonksiyonundan sonra, satır 1018 civarı)

```jsx
  // Müşteri "Ödedim" butonuna basınca: wa.me linki <a> ile açılır; bu handler AYRICA
  // sistemin de Ufuk'a otomatik bildirmesi için confirm ucunu fire-and-forget çağırır.
  const onConfirmIbanPaidNotify = () => {
    const paymentId = paymentInstruction?.paymentId;
    if (!paymentId) return;
    apiJson('/api/payments/iban/confirm', { method: 'POST', body: { paymentId } }).catch(() => {});
  };
```

- [ ] **Step 4: Instruction panelindeki WhatsApp linkini güncelle** (satır 1303-1316)

```jsx
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {buildWhatsAppPaymentLink(paymentInstruction) ? (
                  <a href={buildWhatsAppPaymentLink(paymentInstruction)} target="_blank" rel="noreferrer"
                     onClick={paymentInstruction.method === 'iban' ? onConfirmIbanPaidNotify : undefined}
                     style={{
                       padding: '8px 10px', borderRadius: 9, background: 'var(--ink)', color: '#fff',
                       fontSize: 11.5, fontWeight: 600, textDecoration: 'none',
                     }}>
                    {paymentInstruction.method === 'iban'
                      ? t('account.instruction.confirmPaid')
                      : t('account.instruction.whatsappNotify')}
                  </a>
                ) : (
                  <span style={{ fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                    {t('account.instruction.whatsappMissing')}
                  </span>
                )}
              </div>
```

- [ ] **Step 5: Pay butonuna cooldown ekle** (satır 1320-1329)

`disabled` ve label'a cooldown ekle:
```jsx
          <button onClick={onTopUp} disabled={belowMin || effectiveAmount < MIN_USD || !paymentMethodEnabled || topUpCooldown > 0} style={{
            width: '100%', padding: '11px 0', borderRadius: 10,
            background: belowMin || !paymentMethodEnabled || topUpCooldown > 0 ? 'var(--ink-4)' : 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: belowMin || !paymentMethodEnabled || topUpCooldown > 0 ? 0.55 : 1,
            cursor: belowMin || !paymentMethodEnabled || topUpCooldown > 0 ? 'not-allowed' : 'pointer',
          }}>
            <I.Wallet size={14} stroke="#fff" />
            <span>{topUpCooldown > 0
              ? t('account.topUp.cooldown', { n: topUpCooldown })
              : t('account.topUp.payButton', { total: paymentTotalLabel, amount: effectiveAmount.toFixed(2) })}</span>
          </button>
```

- [ ] **Step 6: Lint + contract + build**

Run: `npm run lint`
Expected: tsc hatasız.
Run: `npx vitest run src/payment-safety-contract.test.ts`
Expected: PASS (account.jsx hâlâ "Banka"/"IBAN"/"Alıcı"/"WhatsApp"/buildWhatsAppPaymentLink içerir).

- [ ] **Step 7: Commit**

```bash
git add src/yapayzekalab/tab-account.jsx
git commit -m "feat(account): IBAN Ödedim butonu (wa.me + confirm) + 60sn cooldown"
```

---

### Task 7: itest — confirm sahiplik/429/uuid + init dedup (real PG)

**Files:**
- Create: `src/server/__tests__/iban-notify.itest.ts`

Partner-rbac.itest.ts auth desenini (`signAccessToken({ sub, role: "user" })`) izler. Rate-limit kovaları in-memory global olduğundan **her senaryo ayrı userId** kullanır (scope izolasyonu).

- [ ] **Step 1: itest dosyasını yaz**

```ts
/**
 * IBAN iki-aşamalı bildirim INTEGRATION test (real PG, npm run itest).
 * confirm: sahiplik + 1/dk rate-limit + uuid guard; init: 60sn dedup.
 * notifyAdmin yapılandırılmamışsa no-op (gerçek WhatsApp gitmez) — güvenli.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users, payments } from "../db/schema.js";
import { signAccessToken } from "../services/auth-service.js";

const app = createApp();
const U1 = "d1000000-0000-0000-0000-000000000001"; // confirm happy+429
const U2 = "d1000000-0000-0000-0000-000000000002"; // ownership/404
const U3 = "d1000000-0000-0000-0000-000000000003"; // dedup (init)
const tok = (id: string) => signAccessToken({ sub: id, role: "user" });
const ibanReady = Boolean(process.env.IBAN_NUMBER && process.env.IBAN_BANK_NAME);

async function seedUser(id: string, email: string) {
  await db.insert(users).values({ id, email, adSoyad: "IT", bakiyeTL: "0", durum: "aktif", role: "user" });
}
async function seedIbanPayment(userId: string): Promise<string> {
  const rows = await db.insert(payments).values({
    userId, metod: "iban", miktarTL: "478", kdvTL: "0", netTL: "478",
    amountUsd: "10", payableTL: "478", creditTL: "10", kurAtPayment: "47.8",
    roundingTL: "0", durum: "bekliyor", idempotencyKey: `IT-${userId.slice(0, 8)}`,
  }).returning({ id: payments.id });
  return rows[0].id;
}
async function cleanup() {
  for (const id of [U1, U2, U3]) {
    await dbSql`UPDATE payments SET transaction_id = NULL WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM pending_iban_payments WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM payments WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM users WHERE id = ${id}::uuid`;
  }
}

beforeAll(async () => {
  await cleanup();
  await seedUser(U1, "iban-it1@test.local");
  await seedUser(U2, "iban-it2@test.local");
  await seedUser(U3, "iban-it3@test.local");
});
afterAll(cleanup);

describe("POST /api/payments/iban/confirm", () => {
  it("sahibinin geçerli ödemesi → 200 {ok:true}, ikinci çağrı → 429 (1/dk)", async () => {
    const pid = await seedIbanPayment(U1);
    const first = await request(app).post("/api/payments/iban/confirm")
      .set("Authorization", `Bearer ${tok(U1)}`).send({ paymentId: pid });
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    const second = await request(app).post("/api/payments/iban/confirm")
      .set("Authorization", `Bearer ${tok(U1)}`).send({ paymentId: pid });
    expect(second.status).toBe(429);
  });

  it("başka kullanıcının/olmayan ödemesi → 404, geçersiz uuid → 404", async () => {
    const otherPid = await seedIbanPayment(U1); // U1'e ait
    const notOwned = await request(app).post("/api/payments/iban/confirm")
      .set("Authorization", `Bearer ${tok(U2)}`).send({ paymentId: otherPid });
    expect(notOwned.status).toBe(404);
    const badUuid = await request(app).post("/api/payments/iban/confirm")
      .set("Authorization", `Bearer ${tok(U2)}`).send({ paymentId: "not-a-uuid" });
    expect(badUuid.status).toBe(404);
  });
});

describe("POST /api/payments/iban/init dedup", () => {
  (ibanReady ? it : it.skip)("60sn içinde aynı tutar → aynı paymentId + tek pending satır", async () => {
    const body = { amountUsd: 10 };
    const r1 = await request(app).post("/api/payments/iban/init")
      .set("Authorization", `Bearer ${tok(U3)}`).send(body);
    expect(r1.status).toBe(200);
    const r2 = await request(app).post("/api/payments/iban/init")
      .set("Authorization", `Bearer ${tok(U3)}`).send(body);
    expect(r2.status).toBe(200);
    expect(r2.body.paymentId).toBe(r1.body.paymentId);
    const cnt = await dbSql<{ c: string }[]>`SELECT COUNT(*)::text AS c FROM pending_iban_payments WHERE user_id = ${U3}::uuid`;
    expect(Number(cnt[0].c)).toBe(1);
  });
});
```

> ⚠️ `requireWhatsappVerified`: itest env'inde WHATSAPP_OTP kapalıysa middleware no-op (test geçer). Açıksa confirm 403 döner — o durumda `beforeAll`'da `whatsapp_verified_numbers`'a sentinel ekle veya OTP'yi kapalı tut. Çalıştırmadan önce `grep WHATSAPP_OTP .env` ile doğrula.

- [ ] **Step 2: itest çalıştır** (DB hazırsa)

Run: `npm run db:up && npm run db:migrate && npx vitest run --config vitest.itest.config.ts src/server/__tests__/iban-notify.itest.ts`
Expected: confirm testleri PASS; dedup testi IBAN env yoksa SKIP, varsa PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/__tests__/iban-notify.itest.ts
git commit -m "test(payments): iban confirm/init itest (sahiplik, 1/dk, dedup)"
```

---

### Task 8: Tam doğrulama (lint + test + build + scan + contracts)

- [ ] **Step 1: Tüm unit + contract suite**

Run: `npm test`
Expected: tüm testler PASS (payment-safety-contract, admin-notify, rate-limit dahil).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: tsc hatasız.

- [ ] **Step 3: Build + public bundle sızıntı taraması**

Run: `npm run build && npm run scan:public`
Expected: build başarılı; scan:public temiz (provider codename sızıntısı yok).

- [ ] **Step 4: 3-agent QA (HARD RULE — deploy öncesi ≥2 PASS)**

Diff'i (`git diff <base>..HEAD`) 3 bağımsız QA ajanına ver (ajanlar SSH YAPMAZ — fail2ban). Odak: billing dokunulmadı mı, never-throw korundu mu, dedup/rate-limit doğru mu, contract'lar geçiyor mu, frontend popup/cooldown güvenli mi.

- [ ] **Step 5: Deploy (yalnız çift onay sonrası)**

Yerelde tut. Deploy = izole worktree (canlı commit `59fafd1`'den) + cherry-pick + `LOCAL_SRC=<dir> bash scripts/sync-deploy.sh`. Çift onay + 3/3 QA olmadan YAPMA.

---

## Self-Review

- **Spec coverage:** Aşama 1 metin+dedup+gate → Task 2/3. Aşama 2 confirm → Task 4. Frontend buton+cooldown → Task 5/6. Migration yok ✓. Billing dokunulmuyor ✓. Doğrulama → Task 7/8.
- **Placeholder:** Yok — tüm adımlar tam kod.
- **Tip tutarlılığı:** `consumeActionRate` (Task 1) → kullanım Task 3/4. `amountUsd`/`odeme_yapildi` (Task 2) → Task 3/4. `paymentInstruction.paymentId` (Task 6 step 2) → `onConfirmIbanPaidNotify` (step 3). `topUpCooldown` state (step 1) → buton (step 5).
