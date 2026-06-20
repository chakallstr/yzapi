# Paket Satın Alma Takip Numarası (`YZK-YYMMDD-XXXX`) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her ücretli paket satın alımına, transaction'a bağlı benzersiz `YZK-YYMMDD-XXXX` takip numarası verip müşteri panelinde "Satın alma geçmişi" olarak göstermek, admin'de ref ile aratmak ve tüm geçmiş alımlara backfill etmek.

**Architecture:** Referans `transactions` satırına (ödeme olayı) bağlanır; tüm ücretli alışların geçtiği tek fonksiyonda (`purchasePackageWithBalance`) üretilir. Entitlement/kota/CF/gate mantığına HİÇ dokunulmaz. İki inert nullable kolon (`purchase_ref` partial-unique-index'li, `package_id`) eklenir; mevcut satırlar NULL kalır.

**Tech Stack:** TypeScript (ESM), Express, Drizzle + postgres.js (raw tagged-template SQL), Vitest (`*.test.ts` birim / `*.itest.ts` gerçek-Postgres entegrasyon), React (JSX panel), tsx (one-off script runner).

---

## Dosya Yapısı

| Dosya | Sorumluluk | İşlem |
|------|-----------|-------|
| `src/server/services/purchase-ref.ts` | Saf formatlayıcı + DB-farkında benzersiz üreteç | Create |
| `src/server/services/purchase-ref.test.ts` | Üretecin birim testleri | Create |
| `src/server/db/schema.ts` | `transactions`'a `purchaseRef` + `packageId` kolonu + partial unique index | Modify |
| `src/server/db/migrations/0041_purchase_ref.sql` | Kolonlar + partial unique index SQL | Create |
| `src/server/db/migrations/meta/_journal.json` | Yeni migration journal girdisi | Modify |
| `src/server/services/package-purchase-service.ts` | INSERT'e `purchase_ref` + `package_id` | Modify |
| `src/server/services/entitlement-service.ts` | `listUserPurchaseHistory()` | Modify |
| `src/server/__tests__/purchase-ref.itest.ts` | Alış → ref yazılır; geçmiş döner; admin arama | Create |
| `src/server/routes/user.ts` | `GET /api/user/purchase-history` | Modify |
| `src/server/routes/admin.ts` | `GET /api/admin/purchase/:ref` (ref arama) | Modify |
| `src/yapayzekalab/tab-mypackages.jsx` | "Satın alma geçmişi" bölümü (paket adına göre gruplu) | Modify |
| `src/yapayzekalab/tab-admin.jsx` | Detayda ref gösterimi + "Referans ile bul" girişi | Modify |
| `scripts/backfill-purchase-refs.ts` | Tek seferlik backfill (dry-run destekli) | Create |
| i18n locale dosyaları | `mypackages.history*` çevirileri | Modify |

**⚠️ DEPLOY UYARISI (CLAUDE.md):** `admin.ts` ve `tab-admin.jsx` başka bir deploy-edilmemiş özellikle (admin-live-state) kontamine olabilir. Deploy anında bu iki dosyaya YALNIZ bu plandaki hunk'lar, canlının indirilmiş kopyası üzerine uygulanır. Migration numarası (`0041`) yereldir; deploy öncesi gerçek CANLI migration max'ı doğrulanıp gerekiyorsa yeniden numaralandırılır (Task 12).

---

## Task 1: Referans üreteci — saf fonksiyonlar (TDD)

**Files:**
- Create: `src/server/services/purchase-ref.ts`
- Test: `src/server/services/purchase-ref.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```typescript
// src/server/services/purchase-ref.test.ts
import { describe, expect, it } from "vitest";
import { istanbulYYMMDD, randomCode, formatPurchaseRef, ALPHABET } from "./purchase-ref.js";

describe("purchase-ref saf fonksiyonlar", () => {
  it("istanbulYYMMDD: UTC tarihini Europe/Istanbul gününe çevirir", () => {
    // 2026-06-20 21:00 UTC → İstanbul'da 21 Haz 00:00 (UTC+3) → 260621
    expect(istanbulYYMMDD(new Date("2026-06-20T21:30:00Z"))).toBe("260621");
    // 2026-06-20 09:00 UTC → İstanbul 20 Haz 12:00 → 260620
    expect(istanbulYYMMDD(new Date("2026-06-20T09:00:00Z"))).toBe("260620");
  });

  it("randomCode: yalnız belirsizlik-yok alfabeden, istenen uzunlukta üretir", () => {
    for (let i = 0; i < 200; i++) {
      const c = randomCode(4);
      expect(c).toHaveLength(4);
      expect([...c].every((ch) => ALPHABET.includes(ch))).toBe(true);
    }
    // I, O, 0, 1 ve küçük harf ASLA çıkmaz
    expect(ALPHABET).not.toMatch(/[IO01a-z]/);
  });

  it("formatPurchaseRef: YZK-YYMMDD-XXXX biçimi", () => {
    expect(formatPurchaseRef(new Date("2026-06-20T09:00:00Z"), "7K3F")).toBe("YZK-260620-7K3F");
    expect(formatPurchaseRef(new Date("2026-06-20T09:00:00Z"), "7K3F")).toMatch(/^YZK-\d{6}-[A-Z2-9]{4}$/);
  });
});
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

Run: `npx vitest run src/server/services/purchase-ref.test.ts`
Expected: FAIL — `Cannot find module './purchase-ref.js'`

- [ ] **Step 3: Minimal implementasyon**

```typescript
// src/server/services/purchase-ref.ts
import { randomInt } from "node:crypto";

/** 32 karakter, belirsizlik-yok: I/O/0/1 ve küçük harf YOK. */
export const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Verilen anı Europe/Istanbul gününe çevirip YYMMDD döndürür. */
export function istanbulYYMMDD(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}${get("month")}${get("day")}`;
}

/** Kriptografik rastgele kod (tahmin edilemez). */
export function randomCode(len = 4): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Saf formatlayıcı: YZK-YYMMDD-XXXX. Test edilebilir (rand dışarıdan verilir). */
export function formatPurchaseRef(date: Date, rand: string): string {
  return `YZK-${istanbulYYMMDD(date)}-${rand}`;
}
```

- [ ] **Step 4: Testi çalıştır, PASS gör**

Run: `npx vitest run src/server/services/purchase-ref.test.ts`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add src/server/services/purchase-ref.ts src/server/services/purchase-ref.test.ts
git commit -m "feat(purchase-ref): saf YZK-YYMMDD-XXXX üreteci + birim testleri"
```

---

## Task 2: Benzersiz üreteç — DB-farkında sarmalayıcı (TDD, stub sql)

**Files:**
- Modify: `src/server/services/purchase-ref.ts`
- Test: `src/server/services/purchase-ref.test.ts`

- [ ] **Step 1: Başarısız testi ekle**

```typescript
// purchase-ref.test.ts'e EKLE (dosyanın en üstündeki import satırına generateUniquePurchaseRef ekle)
import { generateUniquePurchaseRef } from "./purchase-ref.js";

describe("generateUniquePurchaseRef", () => {
  it("çakışma yoksa ilk denemede ref döner", async () => {
    const calls: string[] = [];
    const fakeSql: any = (_s: TemplateStringsArray, ref: string) => {
      calls.push(ref);
      return Promise.resolve([]); // boş = çakışma yok
    };
    const ref = await generateUniquePurchaseRef(fakeSql, new Date("2026-06-20T09:00:00Z"));
    expect(ref).toMatch(/^YZK-260620-[A-Z2-9]{4}$/);
    expect(calls).toHaveLength(1);
  });

  it("çakışmada yeniden üretir, boşalınca döner", async () => {
    let n = 0;
    const fakeSql: any = () => Promise.resolve(n++ === 0 ? [{ "?column?": 1 }] : []);
    const ref = await generateUniquePurchaseRef(fakeSql, new Date("2026-06-20T09:00:00Z"));
    expect(ref).toMatch(/^YZK-260620-[A-Z2-9]{4}$/);
    expect(n).toBe(2); // 1 çakışma + 1 başarı
  });

  it("maxAttempts boyunca hep çakışırsa hata fırlatır", async () => {
    const fakeSql: any = () => Promise.resolve([{ "?column?": 1 }]);
    await expect(generateUniquePurchaseRef(fakeSql, new Date("2026-06-20T09:00:00Z"), 3)).rejects.toThrow(/çakışma/i);
  });
});
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

Run: `npx vitest run src/server/services/purchase-ref.test.ts`
Expected: FAIL — `generateUniquePurchaseRef is not a function`

- [ ] **Step 3: Implementasyonu ekle**

```typescript
// purchase-ref.ts'e EKLE (en üste import). dbSql tipi hem dbSql hem txSql için geçerli.
import { dbSql } from "../db/client.js";

type SqlClient = typeof dbSql;

/**
 * DB'de henüz kullanılmamış bir purchase_ref üretir.
 * Üretimde pre-check; partial unique index nihai garantidir.
 * txSql.begin bloğu içinden VEYA tek başına dbSql ile çağrılabilir.
 */
export async function generateUniquePurchaseRef(
  sql: SqlClient,
  date: Date,
  maxAttempts = 5,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const ref = formatPurchaseRef(date, randomCode(4));
    const hit = await sql`SELECT 1 FROM transactions WHERE purchase_ref = ${ref} LIMIT 1`;
    if ((hit as unknown[]).length === 0) return ref;
  }
  throw new Error("purchase_ref üretilemedi (çakışma)");
}
```

- [ ] **Step 4: Testi çalıştır, PASS gör**

Run: `npx vitest run src/server/services/purchase-ref.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add src/server/services/purchase-ref.ts src/server/services/purchase-ref.test.ts
git commit -m "feat(purchase-ref): benzersiz DB-farkında üreteç (collision-retry)"
```

---

## Task 3: Şema + migration (kolonlar + partial unique index)

**Files:**
- Modify: `src/server/db/schema.ts:287-303` (transactions tablosu)
- Create: `src/server/db/migrations/0041_purchase_ref.sql`
- Modify: `src/server/db/migrations/meta/_journal.json`

- [ ] **Step 1: schema.ts — `uniqueIndex` import'unu garanti et**

`src/server/db/schema.ts` en üstündeki drizzle import satırında `uniqueIndex` olduğundan emin ol. Yoksa ekle:

```typescript
import { pgTable, uuid, text, numeric, timestamp, index, uniqueIndex, sql } from "drizzle-orm/pg-core";
```
(Mevcut import listesine yalnız `uniqueIndex`'i ekle; diğerlerini tekrarlama.)

- [ ] **Step 2: transactions tablosuna kolonları + index'i ekle**

`src/server/db/schema.ts:287-303` bloğunu şununla değiştir:

```typescript
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull(),
    tip: text("tip").notNull(),
    miktarTL: numeric("miktar_tl", { precision: 14, scale: 4 }).notNull(),
    oncekiBakiye: numeric("onceki_bakiye", { precision: 14, scale: 4 }).notNull(),
    sonrakiBakiye: numeric("sonraki_bakiye", { precision: 14, scale: 4 }).notNull(),
    aciklama: text("aciklama").notNull().default(""),
    metod: text("metod"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().default(sql`now()`),
    idempotencyKey: text("idempotency_key").unique(),
    // Paket satın alma takip no'su (YZK-YYMMDD-XXXX). Yalnız tip='paket_satin_alma' satırlarında dolu.
    purchaseRef: text("purchase_ref"),
    // Satın alınan paket (geçmiş/silinmiş pakette NULL olabilir; gruplama için).
    packageId: text("package_id"),
  },
  (t) => [
    index("transactions_user_ts_idx").on(t.userId, t.timestamp),
    uniqueIndex("transactions_purchase_ref_uidx").on(t.purchaseRef).where(sql`${t.purchaseRef} IS NOT NULL`),
  ]
);
```

- [ ] **Step 3: Migration SQL dosyasını oluştur**

```sql
-- src/server/db/migrations/0041_purchase_ref.sql
-- Paket satın alma takip no'su: her ödeme olayına (transactions) benzersiz YZK-YYMMDD-XXXX.
-- Inert: mevcut satırlar NULL kalır, davranış değişmez. package_id gruplama/arama içindir.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS purchase_ref text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS package_id text;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_purchase_ref_uidx
  ON transactions (purchase_ref) WHERE purchase_ref IS NOT NULL;
```

- [ ] **Step 4: Journal girdisini ekle**

Önce `when` için timestamp üret:

Run: `node -e "console.log(Date.now())"`

`src/server/db/migrations/meta/_journal.json` içindeki `entries` dizisinin SONUNA şu girdiyi ekle (önceki son girdinin idx'i 40 ise yeni idx 41; `when`'i bir önceki adımın çıktısıyla değiştir):

```json
    {
      "idx": 41,
      "version": "7",
      "when": 1750000000000,
      "tag": "0041_purchase_ref",
      "breakpoints": true
    }
```
(Bir önceki girdinin sonuna virgül koymayı unutma. idx, dosyadaki son idx+1 olmalı — dosyayı açıp doğrula.)

- [ ] **Step 5: Migration'ı yerel/test DB'sine uygula**

Run: `npx tsx src/server/db/migrate.ts`
Expected: hata yok; `0041_purchase_ref` uygulanır.

Doğrula:
Run: `psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='transactions' AND column_name IN ('purchase_ref','package_id') ORDER BY column_name"`
Expected: iki satır — `package_id`, `purchase_ref`.

- [ ] **Step 6: Tip kontrolü + commit**

Run: `npx vitest run src/server/services/purchase-ref.test.ts` (hâlâ yeşil)
Run: `npm run lint`

```bash
git add src/server/db/schema.ts src/server/db/migrations/0041_purchase_ref.sql src/server/db/migrations/meta/_journal.json
git commit -m "feat(db): transactions.purchase_ref + package_id + partial unique index (0041)"
```

---

## Task 4: Satın alma INSERT'üne ref + package_id (TDD entegrasyon)

**Files:**
- Modify: `src/server/services/package-purchase-service.ts` (txSql.begin bloğundaki transactions INSERT)
- Create: `src/server/__tests__/purchase-ref.itest.ts`

- [ ] **Step 1: Başarısız entegrasyon testini yaz**

```typescript
// src/server/__tests__/purchase-ref.itest.ts
/**
 * Paket alımı → transactions satırına purchase_ref (YZK-...) + package_id yazılır.
 * Gerçek Postgres. Ücretsiz değil; bakiyeden ücretli alış (ref her ücretli yolda üretilir).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbSql, db } from "../db/client.js";
import { users } from "../db/schema.js";
import { purchasePackageWithBalance } from "../services/package-purchase-service.js";

const UID = "b0000041-0000-0000-0000-0000000000a1";
const PKG = "test-ref-paid-itest";

async function cleanup() {
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({ id: UID, email: "ref-itest@test.local", adSoyad: "Ref Itest", bakiyeTL: "1000.0000", durum: "aktif" } as any);
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled, satista)
    VALUES (${PKG}, 'Ref Paid', 'NVIDIA', '', 'request_limit', 1000, 30, ${JSON.stringify(["gpt-5.5"])}::jsonb, 100, true, true)
  `;
});
afterAll(cleanup);

describe("paket alımı → purchase_ref + package_id", () => {
  it("ilk alış: transactions satırında geçerli ref ve package_id var", async () => {
    const res = await purchasePackageWithBalance(UID, PKG, "ref-1");
    expect(res.entitlementId).toBeTruthy();
    const rows = await dbSql<{ purchase_ref: string; package_id: string; tip: string }[]>`
      SELECT purchase_ref, package_id, tip FROM transactions
      WHERE user_id = ${UID}::uuid AND tip = 'paket_satin_alma' ORDER BY timestamp DESC LIMIT 1
    `;
    expect(rows[0].purchase_ref).toMatch(/^YZK-\d{6}-[A-Z2-9]{4}$/);
    expect(rows[0].package_id).toBe(PKG);
  });

  it("ikinci alış (EXTEND): yine kendi AYRI ref'ini alır", async () => {
    const before = await dbSql<{ purchase_ref: string }[]>`
      SELECT purchase_ref FROM transactions WHERE user_id = ${UID}::uuid AND tip='paket_satin_alma'
    `;
    await purchasePackageWithBalance(UID, PKG, "ref-2");
    const after = await dbSql<{ purchase_ref: string }[]>`
      SELECT purchase_ref FROM transactions WHERE user_id = ${UID}::uuid AND tip='paket_satin_alma'
    `;
    expect(after.length).toBe(before.length + 1);
    const refs = after.map((r) => r.purchase_ref);
    expect(new Set(refs).size).toBe(refs.length); // hepsi farklı
  });
});
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

Run: `npx vitest run --config vitest.itest.config.ts src/server/__tests__/purchase-ref.itest.ts`
Expected: FAIL — `purchase_ref` NULL (henüz INSERT'e eklenmedi → regex eşleşmez)

- [ ] **Step 3: INSERT'ü güncelle**

`src/server/services/package-purchase-service.ts` içindeki txSql.begin bloğunda, transactions INSERT'ünden HEMEN ÖNCE ref üret ve INSERT'e iki kolon ekle. `import` satırlarına ekle:

```typescript
import { generateUniquePurchaseRef } from "./purchase-ref.js";
```

txSql.begin bloğunda `const txRows = await txSql...` ÖNCESİNE ekle:

```typescript
    const purchaseRef = await generateUniquePurchaseRef(txSql, new Date());
```

Ve transactions INSERT'ünü şununla değiştir (kolon listesine `purchase_ref, package_id`, VALUES'a `${purchaseRef}, ${packageId}` eklendi):

```typescript
    const txRows = await txSql<{ id: string }[]>`
      INSERT INTO transactions
        (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key, purchase_ref, package_id)
      VALUES
        (${userId}::uuid, ${updated[0].email}, 'paket_satin_alma', ${-fiyatTL}::numeric,
         ${prevBalance}::numeric, ${newBalance}::numeric, ${"Paket: " + pkg.ad}, 'bakiye',
         ${txKey}, ${purchaseRef}, ${packageId})
      RETURNING id
    `;
```

(`packageId` zaten fonksiyon parametresi; ek değişken gerekmez. Üretim txSql ile aynı transaction içinde olduğundan ref + tx atomiktir.)

- [ ] **Step 4: Testi çalıştır, PASS gör**

Run: `npx vitest run --config vitest.itest.config.ts src/server/__tests__/purchase-ref.itest.ts`
Expected: PASS (2 test)

- [ ] **Step 5: Regresyon — mevcut satın alma testleri hâlâ yeşil**

Run: `npx vitest run --config vitest.itest.config.ts src/server/__tests__/per-user-once.itest.ts`
Expected: PASS (davranış değişmedi)

- [ ] **Step 6: Commit**

```bash
git add src/server/services/package-purchase-service.ts src/server/__tests__/purchase-ref.itest.ts
git commit -m "feat(purchase): her ücretli alış transaction'ına purchase_ref + package_id"
```

---

## Task 5: Satın alma geçmişi servisi (TDD)

**Files:**
- Modify: `src/server/services/entitlement-service.ts` (yeni fonksiyon + tip)
- Modify: `src/server/__tests__/purchase-ref.itest.ts` (geçmiş testi)

- [ ] **Step 1: Başarısız testi ekle**

```typescript
// purchase-ref.itest.ts'e EKLE — üstteki import'a ekle:
import { listUserPurchaseHistory } from "../services/entitlement-service.js";

describe("listUserPurchaseHistory", () => {
  it("kullanıcının paket alımlarını ref + paket adı + tutar + tarihle döndürür", async () => {
    const hist = await listUserPurchaseHistory(UID);
    expect(hist.length).toBeGreaterThanOrEqual(1);
    const h = hist[0];
    expect(h.ref).toMatch(/^YZK-\d{6}-[A-Z2-9]{4}$/);
    expect(h.paketAdi).toBe("Ref Paid"); // packages.ad (package_id çözüldü)
    expect(h.tutarTL).toBe(100);          // abs(miktar_tl)
    expect(typeof h.tarih).toBe("string");
  });
});
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

Run: `npx vitest run --config vitest.itest.config.ts src/server/__tests__/purchase-ref.itest.ts`
Expected: FAIL — `listUserPurchaseHistory is not a function`

- [ ] **Step 3: Fonksiyonu ekle**

`src/server/services/entitlement-service.ts` sonuna ekle (PanelEntitlement interface'inin yanına tip):

```typescript
export interface PurchaseHistoryItem {
  /** YZK-YYMMDD-XXXX; backfill öncesi eski alımlarda null. */
  ref: string | null;
  packageId: string | null;
  /** packages.ad çözülürse o, yoksa aciklama'daki "Paket: <ad>" metni. */
  paketAdi: string;
  tutarTL: number;
  tarih: string;
}

/**
 * Müşterinin paket satın alma geçmişi (ödeme olayları). Kota/entitlement'tan
 * BAĞIMSIZ; transactions'tan okunur. Sağlayıcı/maliyet sızmaz.
 */
export async function listUserPurchaseHistory(userId: string): Promise<PurchaseHistoryItem[]> {
  const rows = await dbSql<any[]>`
    SELECT t.purchase_ref, t.package_id, t.miktar_tl, t.timestamp, t.aciklama, p.ad AS paket_adi
    FROM transactions t
    LEFT JOIN packages p ON p.id = t.package_id
    WHERE t.user_id = ${userId}::uuid AND t.tip = 'paket_satin_alma'
    ORDER BY t.timestamp DESC
    LIMIT 200
  `;
  return rows.map((r) => ({
    ref: r.purchase_ref ?? null,
    packageId: r.package_id ?? null,
    paketAdi: r.paket_adi ?? (String(r.aciklama || "").replace(/^Paket:\s*/, "").trim() || "Paket"),
    tutarTL: Math.abs(Number(r.miktar_tl) || 0),
    tarih: r.timestamp,
  }));
}
```

- [ ] **Step 4: Testi çalıştır, PASS gör**

Run: `npx vitest run --config vitest.itest.config.ts src/server/__tests__/purchase-ref.itest.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/entitlement-service.ts src/server/__tests__/purchase-ref.itest.ts
git commit -m "feat(panel): listUserPurchaseHistory — satın alma geçmişi servisi"
```

---

## Task 6: Müşteri endpoint'i — `GET /api/user/purchase-history`

**Files:**
- Modify: `src/server/routes/user.ts:139-145` civarı (paketler route'unun yanına)

- [ ] **Step 1: Route'u ekle**

`src/server/routes/user.ts` üstündeki import'a `listUserPurchaseHistory` ekle (mevcut `listUserPackagesForPanel` import'unun yanına), sonra `/packages` route'unun hemen altına ekle:

```typescript
// "Paketlerim" → Satın alma geçmişi: her ödeme olayı (ref + paket + tutar + tarih)
router.get("/purchase-history", async (req, res, next) => {
  try {
    res.json(await listUserPurchaseHistory(req.user!.id));
  } catch (e) {
    next(e);
  }
});
```

- [ ] **Step 2: Lint + build kontrolü**

Run: `npm run lint`
Expected: hata yok

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/user.ts
git commit -m "feat(api): GET /api/user/purchase-history"
```

---

## Task 7: Admin ref-arama endpoint'i — `GET /api/admin/purchase/:ref`

**Files:**
- Modify: `src/server/routes/admin.ts` (Users bölümünün yanına)

- [ ] **Step 1: Başarısız testi yaz**

```typescript
// purchase-ref.itest.ts'e EKLE — admin ref çözümü (servis düzeyinde sorgu testi).
describe("admin ref arama (purchase_ref → user)", () => {
  it("var olan ref user_id'ye çözülür", async () => {
    const one = await dbSql<{ purchase_ref: string }[]>`
      SELECT purchase_ref FROM transactions WHERE user_id=${UID}::uuid AND tip='paket_satin_alma' LIMIT 1
    `;
    const ref = one[0].purchase_ref;
    const found = await dbSql<{ user_id: string }[]>`
      SELECT user_id FROM transactions WHERE purchase_ref = ${ref} LIMIT 1
    `;
    expect(found[0].user_id).toBe(UID);
  });
});
```

Run: `npx vitest run --config vitest.itest.config.ts src/server/__tests__/purchase-ref.itest.ts`
Expected: PASS (sorgu zaten çalışır — bu test endpoint sözleşmesini sabitler).

- [ ] **Step 2: Endpoint'i ekle**

`src/server/routes/admin.ts` içinde Users bölümünün (`router.get("/users", ...)`) yakınına ekle. `dbSql` zaten bu dosyada import/kullanımda:

```typescript
// Referans ile satın alma bul: müşteri WhatsApp'tan "YZK-260620-7K3F" deyince admin tek aramada bulur.
router.get("/purchase/:ref", async (req, res, next) => {
  try {
    const ref = String(req.params.ref || "").trim().toUpperCase();
    const rows = await dbSql<any[]>`
      SELECT t.id, t.user_id, t.user_email, t.package_id, t.miktar_tl, t.timestamp, t.aciklama, p.ad AS paket_adi
      FROM transactions t
      LEFT JOIN packages p ON p.id = t.package_id
      WHERE t.purchase_ref = ${ref}
      LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ error: "Referans bulunamadı" });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});
```

(Not: `/users/:id/detail` zaten `transactions`'ı drizzle `select()` ile döndürdüğü için, şema güncellendiğinden `purchaseRef`/`packageId` otomatik gelir — ekstra backend değişikliği gerekmez; frontend Task 9'da gösterir.)

- [ ] **Step 3: Lint + commit**

Run: `npm run lint`

```bash
git add src/server/routes/admin.ts src/server/__tests__/purchase-ref.itest.ts
git commit -m "feat(api): GET /api/admin/purchase/:ref — ref ile satın alma bul"
```

---

## Task 8: i18n — "Satın alma geçmişi" çeviri anahtarları

**Files:**
- Modify: i18n locale dosyaları (TR + EN)

- [ ] **Step 1: Locale dosyalarını bul**

Run: `grep -rn "mypackages.renew" src/ | grep -v tab-mypackages`
Expected: TR ve EN sözlük dosyalarının yolu (ör. `src/yapayzekalab/i18n/*.js`).

- [ ] **Step 2: Anahtarları ekle**

Bulunan TR sözlüğünde `mypackages` bloğuna ekle:
```
historyTitle: 'Satın alma geçmişi',
historyEmpty: 'Henüz satın alma yok',
historyRefCol: 'Takip no',
```
EN sözlüğünde:
```
historyTitle: 'Purchase history',
historyEmpty: 'No purchases yet',
historyRefCol: 'Ref',
```
(Mevcut bloğun virgül/biçimine uy.)

- [ ] **Step 3: Commit**

```bash
git add src/yapayzekalab/i18n
git commit -m "i18n(mypackages): satın alma geçmişi anahtarları (TR/EN)"
```

---

## Task 9: Müşteri paneli — "Satın alma geçmişi" bölümü

**Files:**
- Modify: `src/yapayzekalab/tab-mypackages.jsx`

- [ ] **Step 1: Geçmişi çek**

`tab-mypackages.jsx` içinde paketleri çeken mevcut `useEffect`/fetch yanına, geçmişi çeken state + fetch ekle (dosyadaki mevcut istek deseni — `apiRequest`/`fetch` — neyse onu kullan). Paketler `GET /api/user/packages`'ten geliyorsa, aynı desende:

```jsx
const [history, setHistory] = useState([]);
// mevcut paket-yükleme effect'inin içine VEYA yanına:
//   const h = await apiRequest('/api/user/purchase-history', token);  // dosyadaki çağrı deseniyle aynı
//   setHistory(Array.isArray(h) ? h : []);
```
(`history` adı dosyada zaten "bitmiş paketler" için kullanılıyorsa, bunu `purchaseHistory` olarak adlandır ve aşağıda da öyle kullan — çakışmayı önle.)

- [ ] **Step 2: Geçmiş bölümünü render et (paket adına göre gruplu)**

Paket listesinin (`active.map(...)` / `history.map(...)`) ALTINA, kartın içinde yeni bir bölüm ekle. `purchaseHistory`'yi paket adına göre grupla:

```jsx
{purchaseHistory.length > 0 && (
  <div style={{ marginTop: 16 }}>
    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t('mypackages.historyTitle')}</div>
    {Object.entries(
      purchaseHistory.reduce((acc, it) => {
        (acc[it.paketAdi] = acc[it.paketAdi] || []).push(it);
        return acc;
      }, {})
    ).map(([paket, items]) => (
      <div key={paket} style={{ marginBottom: 10 }}>
        <Caption style={{ fontWeight: 700 }}>{paket}</Caption>
        {items.map((it, i) => (
          <div key={(it.ref || 'noref') + i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontWeight: 700 }}>{it.ref || '—'}</span>
            <span style={{ color: 'var(--ink-3)' }}>{safeDate(it.tarih)}</span>
            <span>{fmt.num(it.tutarTL)} TL</span>
          </div>
        ))}
      </div>
    ))}
  </div>
)}
```
(`Caption`, `safeDate`, `fmt`, `t` bu dosyada zaten mevcut — Task'taki keşif çıktısı doğruladı.)

- [ ] **Step 3: Görsel doğrulama (build + göz)**

Run: `npm run build`
Expected: build başarılı.

(Mümkünse `/run` ile paneli açıp "Paketlerim"de geçmişin göründüğünü doğrula; değilse Task 11 QA'da kapsanır.)

- [ ] **Step 4: Commit**

```bash
git add src/yapayzekalab/tab-mypackages.jsx
git commit -m "feat(panel): Paketlerim'e Satın alma geçmişi bölümü (ref+tarih+tutar)"
```

---

## Task 10: Admin paneli — ref gösterimi + "Referans ile bul"

**Files:**
- Modify: `src/yapayzekalab/tab-admin.jsx`

- [ ] **Step 1: Kullanıcı detayında işlem listesinde ref'i göster**

`tab-admin.jsx` içinde `/users/:id/detail` sonucundaki `transactions` listesi nerede render ediliyorsa (alanlar artık `purchaseRef`/`packageId` içerir), `paket_satin_alma` satırlarında ref'i göster:

```jsx
{tx.tip === 'paket_satin_alma' && tx.purchaseRef && (
  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', marginLeft: 8 }}>
    {tx.purchaseRef}
  </span>
)}
```
(İşlem satırının mevcut JSX'ine ekle; alan adı API'de `purchaseRef` — drizzle camelCase döndürür.)

- [ ] **Step 2: "Referans ile bul" girişini ekle**

`AdminUsers` bileşenindeki arama alanı (`q` state'i) yakınına ikinci bir küçük input ekle:

```jsx
const [refQ, setRefQ] = useState('');
const findByRef = async () => {
  const ref = refQ.trim().toUpperCase();
  if (!ref) return;
  try {
    const r = await adminRequest(`/api/admin/purchase/${encodeURIComponent(ref)}`, token);
    if (r?.user_id) {
      setQ(r.user_email || '');        // listeyi o kullanıcıya daralt
      setOpenUserId(r.user_id);        // detayını aç
      await loadDetail(r.user_id, true);
    }
  } catch {
    alert('Referans bulunamadı');
  }
};
```
JSX (arama input'unun yanına):
```jsx
<input value={refQ} onChange={(e) => setRefQ(e.target.value)}
  onKeyDown={(e) => { if (e.key === 'Enter') findByRef(); }}
  placeholder="YZK-260620-7K3F" style={{ /* mevcut input stiliyle aynı */ }} />
<button onClick={findByRef}>Referans ile bul</button>
```
(`adminRequest`, `loadDetail`, `openUserId`, `setQ`, `token` bu bileşende zaten mevcut — keşif çıktısı doğruladı.)

- [ ] **Step 3: admin-fetch-guard testini geçtiğini doğrula**

Run: `npx vitest run src/admin-fetch-guard.test.ts`
Expected: PASS (yeni çağrılar `adminRequest` üzerinden; ham `fetch('/api/admin/...')` eklenmedi).

- [ ] **Step 4: Build + commit**

Run: `npm run build`

```bash
git add src/yapayzekalab/tab-admin.jsx
git commit -m "feat(admin): satın alma ref gösterimi + referans ile bul"
```

---

## Task 11: Backfill script'i (geçmiş alımlara ref)

**Files:**
- Create: `scripts/backfill-purchase-refs.ts`

- [ ] **Step 1: Script'i yaz**

```typescript
// scripts/backfill-purchase-refs.ts
/**
 * Tek seferlik: tüm geçmiş paket_satin_alma satırlarına purchase_ref üret + package_id best-effort doldur.
 * purchase_ref DAİMA üretilir; package_id çözülemezse NULL bırakılır (panel aciklama'ya düşer).
 * Idempotent: yalnız purchase_ref IS NULL satırlarını işler; tekrar çalıştırılabilir.
 *
 * Çalıştırma (SUNUCUDA — NODE_ENV ŞART):
 *   NODE_ENV=production npx tsx scripts/backfill-purchase-refs.ts --dry-run   # sadece sayım
 *   NODE_ENV=production npx tsx scripts/backfill-purchase-refs.ts             # uygula
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { dbSql } from "../src/server/db/client.js";
import { formatPurchaseRef, randomCode } from "../src/server/services/purchase-ref.js";

const DRY = process.argv.includes("--dry-run");

async function uniqueRef(date: Date, seen: Set<string>): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const ref = formatPurchaseRef(date, randomCode(4));
    if (seen.has(ref)) continue;
    const hit = await dbSql`SELECT 1 FROM transactions WHERE purchase_ref = ${ref} LIMIT 1`;
    if ((hit as unknown[]).length === 0) { seen.add(ref); return ref; }
  }
  throw new Error("backfill: benzersiz ref üretilemedi");
}

async function main() {
  const rows = await dbSql<{ id: string; ts: string; aciklama: string }[]>`
    SELECT id, timestamp AS ts, aciklama
    FROM transactions
    WHERE tip = 'paket_satin_alma' AND purchase_ref IS NULL
    ORDER BY timestamp ASC
  `;
  console.log(`${rows.length} satır işlenecek${DRY ? " (DRY-RUN — yazılmayacak)" : ""}.`);
  if (DRY || rows.length === 0) { process.exit(0); }

  const seen = new Set<string>();
  let done = 0;
  for (const r of rows) {
    const ref = await uniqueRef(new Date(r.ts), seen);
    // package_id best-effort: 1) entitlement.purchase_transaction_id → package_id, 2) aciklama "Paket: <ad>" → packages.ad
    const byEnt = await dbSql<{ package_id: string }[]>`
      SELECT package_id FROM user_package_entitlements WHERE purchase_transaction_id = ${r.id}::uuid LIMIT 1
    `;
    let pkgId: string | null = byEnt[0]?.package_id ?? null;
    if (!pkgId) {
      const ad = String(r.aciklama || "").replace(/^Paket:\s*/, "").trim();
      if (ad) {
        const byName = await dbSql<{ id: string }[]>`SELECT id FROM packages WHERE ad = ${ad} LIMIT 1`;
        pkgId = byName[0]?.id ?? null;
      }
    }
    await dbSql`UPDATE transactions SET purchase_ref = ${ref}, package_id = COALESCE(package_id, ${pkgId}) WHERE id = ${r.id}::uuid`;
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${rows.length}`);
  }
  console.log(`Bitti: ${done} satıra ref atandı.`);
  process.exit(0);
}
main().catch((e) => { console.error("backfill FAILED:", e); process.exit(1); });
```

- [ ] **Step 2: Yerel DB'de dry-run + gerçek çalıştırma ile doğrula**

Önce test verisi varken dry-run:
Run: `npx tsx scripts/backfill-purchase-refs.ts --dry-run`
Expected: "N satır işlenecek (DRY-RUN ...)" — sayı yazdırır, yazmaz.

(Yerelde mevcut NULL-ref paket alımı yoksa, Task 4 testinden kalan satırları geçici NULL'layıp test edebilirsin; ya da bu doğrulama Task gerçek backfill adımında — deploy sonrası — yapılır.)

- [ ] **Step 3: Idempotentlik kontrolü**

Run: `npx tsx scripts/backfill-purchase-refs.ts` (uygula) sonra tekrar:
Run: `npx tsx scripts/backfill-purchase-refs.ts --dry-run`
Expected: ikinci dry-run "0 satır işlenecek" (hepsi dolduruldu).

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-purchase-refs.ts
git commit -m "feat(script): backfill-purchase-refs — geçmiş alımlara ref (dry-run destekli)"
```

---

## Task 12: Tam doğrulama + 3-ajan QA + deploy hazırlığı

**Files:** (yok — doğrulama/QA/deploy)

- [ ] **Step 1: Tüm test + lint + build (yerel)**

Run: `npm run lint`
Run: `npx vitest run` (birim — hepsi yeşil)
Run: `npx vitest run --config vitest.itest.config.ts` (entegrasyon — gerçek Postgres)
Run: `npm run build`
Expected: hepsi PASS, build başarılı.

- [ ] **Step 2: 3-ajan QA (≥2 PASS zorunlu — para-yolu)**

Yerel diff'i (ssh YOK, fail2ban) üç bağımsız QA ajanına ver. Her ajan ayrı mercek:
- QA1 (doğruluk): ref biçimi/benzersizlik, INSERT atomikliği, EXTEND'de ayrı ref, redeem'in ref ALMADIĞI.
- QA2 (regresyon/para-yolu): kota/gate/CF/deadlock mantığına dokunulmadığı; mevcut satın alma/itest'lerin yeşil kaldığı; idempotency_key davranışı.
- QA3 (güvenlik/sızıntı): panel/geçmiş yanıtında sağlayıcı/maliyet/CF sızmadığı; admin endpoint'inin yetki guard'ı altında olduğu; backfill'in idempotent + geri-alınabilir olduğu.
≥2 PASS olmadan deploy YOK.

- [ ] **Step 3: Deploy izolasyon hazırlığı (CLAUDE.md prosedürü)**

- Gerçek CANLI durumu al: `ssh yzapi-vps 'cat /opt/turkapiprojesi/.deploy/current-release.json'` (manifest UNRELIABLE olabilir — ayrıca canlı migration max'ı doğrula).
- **Migration numarası reconcile:** Canlının gerçek migration max'ını öğren (canlı `src/server/db/migrations/` listele veya `schema_migrations`/journal). Yerel `0041` canlı max+1 değilse, dosyayı + journal idx'ini canlı sıraya göre yeniden numaralandır.
- **Kontaminasyon kontrolü:** `admin.ts` ve `tab-admin.jsx` için canlının kopyasını indir (`scp yzapi-vps:/opt/turkapiprojesi/<f> /tmp/live/<f>`), diff'le; YALNIZ bu plandaki hunk'ları canlı kopyaya uygula. Diğer dosyalar working-tree'den temiz gidiyorsa aynen.
- **İzolasyon ispatı:** `rsync -rlzn --checksum --itemize-changes <stage>/ yzapi-vps:/opt/turkapiprojesi/` → SADECE bu plandaki dosyalar listelenmeli.

- [ ] **Step 4: Deploy — yalnız çift onayla**

⚠️ Bu adım, kullanıcının AÇIK ÇİFT ONAYI olmadan ÇALIŞTIRILMAZ. Onay alınınca:
- Migration inert ship edilir (kolonlar NULL, davranış değişmez).
- Gate'i elle yürüt: `npm run lint && npx vitest run && npm run build && NODE_ENV=production npm run db:migrate && systemctl restart turkapiprojesi && curl .../health`.
- Smoke: bir test alımı → panelde geçmiş + ref görünüyor mu; admin ref-arama buluyor mu.

- [ ] **Step 5: Backfill — deploy sonrası AYRI, geri-alınabilir adım**

Canlıda önce dry-run, sayıyı kullanıcıyla teyit et, sonra uygula:
Run: `NODE_ENV=production npx tsx scripts/backfill-purchase-refs.ts --dry-run`
(onaydan sonra) Run: `NODE_ENV=production npx tsx scripts/backfill-purchase-refs.ts`

- [ ] **Step 6: Gerçek canlı durumu memory'e yaz**

Targeted rsync manifest'i güncellemez → gerçek live commit + uygulanan migration no'yu bir memory notuna kaydet (CLAUDE.md kuralı).

---

## Self-Review Notları

- **Spec kapsamı:** 4 hedef (müşteri görünürlüğü Task 9, WhatsApp/destek referansı Task 7+10, admin arama Task 7+10, her alış ayrı kayıt — transaction anchor Task 4) + backfill (Task 11) + format/önek YZK (Task 1) karşılandı.
- **Kapsam dışı korundu:** redeem ref almaz (transaction yazılmaz — Task 4 yorumu + QA1); yeni bildirim yok; entitlement EXTEND birleşmesi değişmez (Task 4 ikinci test bunu kanıtlar).
- **Tip tutarlılığı:** `formatPurchaseRef`/`randomCode`/`generateUniquePurchaseRef`/`listUserPurchaseHistory`/`PurchaseHistoryItem` adları tüm task'larda aynı; `ALPHABET` export edilir ve testte kullanılır.
- **Residual risk (QA2 dikkat):** Aynı anda iki farklı alış aynı ref'i pre-check'te geçip INSERT'te biri 23505 alabilir (32^4/gün uzayında astronomik). Index nihai garanti; o alış rollback olur. Mitigasyon gereksiz görüldü, not edildi.
- **Placeholder yok:** migration `when` timestamp'i `node -e "console.log(Date.now())"` ile üretilir (runtime değer, vague değil); migration no `0041` yerel, deploy'da reconcile edilir (Task 12).
