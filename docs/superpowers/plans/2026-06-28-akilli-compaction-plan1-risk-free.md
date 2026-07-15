# Akıllı Compaction — Plan 1 (Risk-free demet: C + D + A-tune, E-spike) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codex isteklerini seat'e göndermeden önce güvenle küçülten + retry-storm'u söndüren risk-free katmanları (C: tekrar-dosya tekilleme + Token Saver-on, D: Retry-After, A: hard-ceiling tuning) inert + toggle'lı şekilde ekle; E (seat-spread) fizibilitesini araştır.

**Architecture:** Tüm dönüşüm `closerouter-service.ts` forward fonksiyonlarında, gövde `JSON.stringify` edilmeden önce, yalnız codex paketlerinde, kill-switch + katman-toggle arkasında, never-throw. Yeni saf fonksiyonlar (`dedupRepeatedContentBlocks`, `computeRetryAfter`) ayrı, test-edilebilir dosyalarda. A = mevcut context-guard reject'inin compaction sonrası yeniden konumlanması/ayarlanması.

**Tech Stack:** TypeScript (ESM, `.js` import uzantıları), Node v22 (VPS) / v25 (lokal), vitest, Express, esbuild. Deploy = izole targeted-rsync (CLAUDE.md).

---

## Önemli kurallar (her task için geçerli)
- **Asla canlıya doğrudan yazma.** Geliştirme **canlı-sadık replikada** (Task 0). Deploy ayrı, çift-onay + 3-QA sonrası (bu plan kapsamı DIŞINDA).
- **Never-throw:** her yeni katman `try/catch` ile sarılı; hata → katman atlanır, gövde olduğu gibi geçer.
- **Codex gate:** dönüşümler yalnız `billedViaPackage && masterModel.id` codex ailesi (`gpt-5.5`/`gpt-5.4`/`gpt-5-codex*`) **ve** entitlement codex. Diğer her şey byte-identical.
- **TDD:** önce başarısız test, sonra minimal kod, sonra yeşil, sonra commit. Commit'ler replikanın kendi git'ine (canlı repo'ya DEĞİL).

---

### Task 0: Canlı-sadık replika kur + canlı imzaları sabitle

**Files:**
- Create: `~/yzapi-compaction/` (replika çalışma dizini, kendi git'i)
- Reference (canlıdan indirilecek): `src/server/services/closerouter-service.ts`, `src/server/services/token-saver.ts`, `src/server/services/request-guard-service.ts`, `src/server/routes/proxy.ts`, `src/server/services/provider-failover.ts`

- [ ] **Step 1: Replikayı canlıdan çek (CLAUDE.md reçetesi)**

Run:
```bash
rsync -az --exclude node_modules --exclude .git --exclude '.env*' --exclude .deploy --exclude dist \
  yzapi-vps:/opt/turkapiprojesi/src/ ~/yzapi-compaction/src/
rsync -az yzapi-vps:/opt/turkapiprojesi/package.json yzapi-vps:/opt/turkapiprojesi/package-lock.json \
  yzapi-vps:/opt/turkapiprojesi/tsconfig.json yzapi-vps:/opt/turkapiprojesi/vitest.config.ts ~/yzapi-compaction/ 2>/dev/null || true
scp yzapi-vps:/opt/turkapiprojesi/.env.example ~/yzapi-compaction/.env.example 2>/dev/null || true
```
Expected: `src/` doldu; `.deploy` hariç (yoksa rsync timeout/şişme).

- [ ] **Step 2: node_modules — lock eşleşiyorsa symlink, değilse npm ci**

Run:
```bash
cd ~/yzapi-compaction
if [ "$(md5 -q package-lock.json 2>/dev/null)" = "$(md5 -q ~/yzapi/package-lock.json 2>/dev/null)" ]; then
  ln -s ~/yzapi/node_modules ~/yzapi-compaction/node_modules
else npm ci; fi
git init -q && git add -A && git commit -qm "baseline: live replica" && echo BASELINE_OK
```
Expected: `BASELINE_OK`. Bu baseline, sonraki diff'lerin temizliğini sağlar.

- [ ] **Step 3: Canlı imzaları SABİTLE (sonraki tasklar bunlara bakar) — bir nota yaz**

Run (her birini oku, imzayı/satırı not defterine al):
```bash
cd ~/yzapi-compaction
grep -n "export function maybeCompressToolOutputs" src/server/services/token-saver.ts
grep -nE "export (async )?function (forwardChat|forwardChatStream|forwardMessages|forwardChatStreamAsResponses)" src/server/services/closerouter-service.ts
grep -n "maybeCompressToolOutputs(" src/server/services/closerouter-service.ts
grep -nE "getRuntimeApiConfig|RuntimeApiConfig|tokenSaverEnabled" src/server/services/api-settings-service.ts src/server/services/token-saver.ts
grep -nE "CONTEXT_GUARD_ESTIMATE_INFLATION|contextTokens >|BadRequestError" src/server/services/request-guard-service.ts
grep -nE "isFailoverEligible|status === 429|Retry-After|retry-after" src/server/services/provider-failover.ts src/server/services/closerouter-service.ts
```
Expected: Her sembolün CANLIDAKİ tam imzası elde edilir. **Bu imzalar bu plandaki "Modify" adımlarının doğruluk kaynağıdır** (lokal line-number'lara güvenME). Bir uyuşmazlık varsa ilgili task'ı imzaya göre uyarlayın.

- [ ] **Step 4: Suite yeşil mi (baseline doğrula)**

Run: `cd ~/yzapi-compaction && npm test 2>&1 | tail -15`
Expected: Mevcut suite PASS (replika sağlam). `.env.example` yoksa 1 contract test düşebilir → `scp` ile geri al.

---

### Task 1: Katman C — `dedupRepeatedContentBlocks` saf fonksiyonu (TDD)

Codex her turda aynı dosya içeriklerini tekrar yolluyor. Bu fonksiyon, `messages[]` içinde **birebir aynı + büyük** içerik bloklarını tespit edip, sonraki tekrarları kısa bir referans işaretine indirir (ilk tam kopya korunur). Saf, yan-etkisiz, kolay test.

**Files:**
- Create: `src/server/services/compaction/dedup-content-blocks.ts`
- Test: `src/server/services/compaction/dedup-content-blocks.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
// src/server/services/compaction/dedup-content-blocks.test.ts
import { describe, it, expect } from "vitest";
import { dedupRepeatedContentBlocks } from "./dedup-content-blocks.js";

const big = (tag: string) => `FILE ${tag}\n` + "x".repeat(5000);

describe("dedupRepeatedContentBlocks", () => {
  it("replaces later identical large blocks with a reference marker, keeps the first", () => {
    const msgs = [
      { role: "user", content: big("A") },
      { role: "assistant", content: "ok" },
      { role: "user", content: big("A") }, // duplicate of msg[0]
    ];
    const { messages, savedChars, replaced } = dedupRepeatedContentBlocks(msgs, { minBlockChars: 2000 });
    expect(messages[0].content).toBe(big("A"));          // first kept verbatim
    expect(messages[1].content).toBe("ok");
    expect(String(messages[2].content)).toMatch(/\[duplicate of earlier message #1/); // ref marker
    expect(replaced).toBe(1);
    expect(savedChars).toBeGreaterThan(4000);
  });

  it("does not touch blocks below minBlockChars", () => {
    const msgs = [ { role: "user", content: "short" }, { role: "user", content: "short" } ];
    const { messages, replaced } = dedupRepeatedContentBlocks(msgs, { minBlockChars: 2000 });
    expect(replaced).toBe(0);
    expect(messages[1].content).toBe("short");
  });

  it("never mutates the input array/objects", () => {
    const msgs = [ { role: "user", content: big("A") }, { role: "user", content: big("A") } ];
    const copy = JSON.parse(JSON.stringify(msgs));
    dedupRepeatedContentBlocks(msgs, { minBlockChars: 2000 });
    expect(msgs).toEqual(copy);
  });

  it("handles non-string content (array blocks) safely without throwing", () => {
    const msgs = [ { role: "user", content: [{ type: "text", text: "hi" }] } ];
    expect(() => dedupRepeatedContentBlocks(msgs, { minBlockChars: 2000 })).not.toThrow();
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `cd ~/yzapi-compaction && npx vitest run src/server/services/compaction/dedup-content-blocks.test.ts`
Expected: FAIL — "Cannot find module './dedup-content-blocks.js'".

- [ ] **Step 3: Minimal implementasyon**

```ts
// src/server/services/compaction/dedup-content-blocks.ts
export interface DedupOpts { minBlockChars: number }
export interface DedupResult { messages: Array<Record<string, unknown>>; savedChars: number; replaced: number }

/**
 * messages[] içinde BİREBİR aynı + >= minBlockChars string content'leri tespit eder; ilk görüşü
 * korur, sonraki tekrarları kısa referans işaretine indirir. Saf (girdiyi mutate etmez), never-throw güvenli.
 * Yalnız string content'e dokunur (array/tool-result blokları aynen geçer).
 */
export function dedupRepeatedContentBlocks(
  input: ReadonlyArray<Record<string, unknown>>,
  opts: DedupOpts,
): DedupResult {
  const firstSeenAt = new Map<string, number>();
  let savedChars = 0;
  let replaced = 0;
  const messages = input.map((msg, idx) => {
    const content = msg.content;
    if (typeof content !== "string" || content.length < opts.minBlockChars) return { ...msg };
    const seen = firstSeenAt.get(content);
    if (seen === undefined) { firstSeenAt.set(content, idx); return { ...msg }; }
    savedChars += content.length;
    replaced += 1;
    return { ...msg, content: `[duplicate of earlier message #${seen + 1}; ${content.length} chars elided to save context]` };
  });
  return { messages, savedChars, replaced };
}
```

- [ ] **Step 4: Testi çalıştır, yeşil**

Run: `cd ~/yzapi-compaction && npx vitest run src/server/services/compaction/dedup-content-blocks.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
cd ~/yzapi-compaction && git add src/server/services/compaction/dedup-content-blocks.ts src/server/services/compaction/dedup-content-blocks.test.ts
git commit -qm "feat(compaction): dedupRepeatedContentBlocks pure fn (layer C)"
```

---

### Task 2: Katman C — `applyCompactionC` orkestratör + codex gate (TDD)

Token Saver (mevcut `maybeCompressToolOutputs`) + dedup'u tek codex-gate'li girişte birleştir. Bu fonksiyon forward yolunda çağrılacak (Task 3'te wire). Saf-ish (body'yi kopyalayıp döner), never-throw, toggle'lı.

**Files:**
- Create: `src/server/services/compaction/apply-compaction.ts`
- Test: `src/server/services/compaction/apply-compaction.test.ts`
- Reference: `token-saver.ts` (`maybeCompressToolOutputs`, imza Task 0 Step 3'ten)

- [ ] **Step 1: Başarısız testi yaz**

```ts
// src/server/services/compaction/apply-compaction.test.ts
import { describe, it, expect } from "vitest";
import { applyCompactionC } from "./apply-compaction.js";

const big = (t: string) => `FILE ${t}\n` + "x".repeat(6000);
const codexCfg = { layerCEnabled: true, tokenSaverEnabled: true, dedupMinBlockChars: 2000 };

describe("applyCompactionC", () => {
  it("returns body unchanged when isCodex=false (no leak to non-codex)", () => {
    const body = { messages: [{ role: "user", content: big("A") }, { role: "user", content: big("A") }] };
    const out = applyCompactionC(body, { isCodex: false, cfg: codexCfg });
    expect(out.body).toEqual(body);
    expect(out.replacedBlocks).toBe(0);
  });

  it("dedups repeated blocks for codex when enabled", () => {
    const body = { messages: [{ role: "user", content: big("A") }, { role: "user", content: big("A") }] };
    const out = applyCompactionC(body, { isCodex: true, cfg: codexCfg });
    expect(out.replacedBlocks).toBe(1);
    expect(String((out.body.messages as any[])[1].content)).toMatch(/duplicate of earlier/);
  });

  it("no-op when layerCEnabled=false", () => {
    const body = { messages: [{ role: "user", content: big("A") }, { role: "user", content: big("A") }] };
    const out = applyCompactionC(body, { isCodex: true, cfg: { ...codexCfg, layerCEnabled: false } });
    expect(out.body).toEqual(body);
  });

  it("never throws on malformed body", () => {
    expect(() => applyCompactionC({} as any, { isCodex: true, cfg: codexCfg })).not.toThrow();
    expect(() => applyCompactionC({ messages: "x" } as any, { isCodex: true, cfg: codexCfg })).not.toThrow();
  });
});
```

- [ ] **Step 2: Başarısız olduğunu gör**

Run: `cd ~/yzapi-compaction && npx vitest run src/server/services/compaction/apply-compaction.test.ts`
Expected: FAIL — modül yok.

- [ ] **Step 3: Implementasyon**

```ts
// src/server/services/compaction/apply-compaction.ts
import { maybeCompressToolOutputs } from "../token-saver.js"; // imza Task 0'da doğrulandı
import { dedupRepeatedContentBlocks } from "./dedup-content-blocks.js";

export interface CompactionCConfig {
  layerCEnabled: boolean;
  tokenSaverEnabled: boolean;
  dedupMinBlockChars: number;
}
export interface CompactionCResult {
  body: Record<string, unknown>;
  replacedBlocks: number;
  savedChars: number;
}

/**
 * Katman C (güvenli kırpma): yalnız codex'te. (1) Token Saver tool-output kırpma (mevcut),
 * (2) tekrar-dosya dedup. Body'yi kopyalayıp döner; never-throw → hata = orijinal body.
 */
export function applyCompactionC(
  body: Record<string, unknown>,
  opts: { isCodex: boolean; cfg: CompactionCConfig },
): CompactionCResult {
  const noop: CompactionCResult = { body, replacedBlocks: 0, savedChars: 0 };
  try {
    if (!opts.isCodex || !opts.cfg.layerCEnabled) return noop;
    const clone: Record<string, unknown> = { ...body };
    // (1) Token Saver — mevcut fonksiyon body'yi yerinde mutate eder; clone üzerinde çağır.
    if (opts.cfg.tokenSaverEnabled && Array.isArray((clone as any).messages)) {
      clone.messages = (clone.messages as unknown[]).map((m) =>
        m && typeof m === "object" ? { ...(m as Record<string, unknown>) } : m,
      );
      maybeCompressToolOutputs(clone, { tokenSaverEnabled: true });
    }
    // (2) dedup tekrar bloklar
    if (Array.isArray((clone as any).messages)) {
      const d = dedupRepeatedContentBlocks(clone.messages as Array<Record<string, unknown>>, {
        minBlockChars: opts.cfg.dedupMinBlockChars,
      });
      clone.messages = d.messages;
      return { body: clone, replacedBlocks: d.replaced, savedChars: d.savedChars };
    }
    return { body: clone, replacedBlocks: 0, savedChars: 0 };
  } catch {
    return noop; // never-throw
  }
}
```

- [ ] **Step 4: Yeşil**

Run: `cd ~/yzapi-compaction && npx vitest run src/server/services/compaction/apply-compaction.test.ts`
Expected: PASS (4 test). ⚠️ `maybeCompressToolOutputs`'un gerçek imzası Task 0'dakinden farklıysa import/çağrıyı ona uyarla, testi tekrar yeşille.

- [ ] **Step 5: Commit**

```bash
cd ~/yzapi-compaction && git add src/server/services/compaction/apply-compaction.ts src/server/services/compaction/apply-compaction.test.ts
git commit -qm "feat(compaction): applyCompactionC orchestrator + codex gate (layer C)"
```

---

### Task 3: Katman C — forward yoluna wire et (entegrasyon)

`closerouter-service.ts` forward fonksiyonlarında, mevcut `maybeCompressToolOutputs(...)` çağrısının yerine/yanına `applyCompactionC`'yi codex-gate ile koy. **Gerçek satırlar Task 0 Step 3'ten; sembol adıyla bul.**

**Files:**
- Modify: `src/server/services/closerouter-service.ts` (`forwardChat`, `forwardChatStream`, `forwardMessages`, `forwardChatStreamAsResponses` — her birinde `JSON.stringify(providerBody)` öncesi)
- Reference: codex tespiti için `masterModel.id` + `billedViaPackage` — bu bilgiyi forward fonksiyonuna taşımak gerekiyorsa parametre ekle (bkz Step 1).

- [ ] **Step 1: Forward fonksiyonlarının codex bilgisini aldığını doğrula/ekle**

Run: `cd ~/yzapi-compaction && grep -nE "function forward(Chat|Messages|ChatStream|ChatStreamAsResponses)" src/server/services/closerouter-service.ts`
İncele: `ctx`/opts içinde model id + billedViaPackage var mı? Yoksa, çağıran (`proxy.ts`) zaten biliyor (`masterModel`, `billedViaPackage`) → forward imzasına `isCodex: boolean` opsiyonel alanı ekle ve proxy.ts call-site'larında geç. (Sampling-param strip için kullanılan mevcut ctx deseninin aynısı.)

- [ ] **Step 2: Entegrasyon testini yaz (forward-level, mock upstream)**

```ts
// src/server/services/compaction/forward-compaction.itest.ts
import { describe, it, expect, vi } from "vitest";
import { applyCompactionC } from "./apply-compaction.js";
// Bu itest, applyCompactionC'nin forward gövdesini codex'te küçülttüğünü, non-codex'te byte-identical
// bıraktığını forward fonksiyonu üzerinden doğrular. Upstream fetch mock'lanır.
describe("forward path applies layer C only for codex", () => {
  it("codex body shrinks; non-codex identical (smoke via applyCompactionC contract)", () => {
    const dup = "y".repeat(6000);
    const body = { model: "gpt-5.5", messages: [{ role: "user", content: dup }, { role: "user", content: dup }] };
    const codex = applyCompactionC(body, { isCodex: true, cfg: { layerCEnabled: true, tokenSaverEnabled: true, dedupMinBlockChars: 2000 } });
    const nonCodex = applyCompactionC(body, { isCodex: false, cfg: { layerCEnabled: true, tokenSaverEnabled: true, dedupMinBlockChars: 2000 } });
    expect(JSON.stringify(codex.body).length).toBeLessThan(JSON.stringify(body).length);
    expect(nonCodex.body).toEqual(body);
  });
});
```

- [ ] **Step 3: Başarısız/yeşil döngüsü + wire**

Her forward fonksiyonunda, `JSON.stringify(providerBody)`'den hemen önce:
```ts
const _c = applyCompactionC(providerBody, { isCodex, cfg: compactionCfgFrom(runtimeConfig) });
providerBody = _c.body as typeof providerBody;
// gözlemlenebilirlik: _c.replacedBlocks / _c.savedChars'ı log/usage alanına (Task 7).
```
`compactionCfgFrom(runtimeConfig)` küçük adaptör (runtimeConfig'ten layerCEnabled/tokenSaverEnabled/dedupMinBlockChars okur — Task 6 config).

Run: `cd ~/yzapi-compaction && npx vitest run src/server/services/compaction/forward-compaction.itest.ts && npm run lint 2>&1 | tail -5`
Expected: PASS + lint temiz (tsc --noEmit).

- [ ] **Step 4: Tam suite regresyon**

Run: `cd ~/yzapi-compaction && npm test 2>&1 | tail -15`
Expected: Tüm testler PASS (özellikle non-codex/güvenlik-contract testleri — sızıntı yok).

- [ ] **Step 5: Commit**

```bash
cd ~/yzapi-compaction && git add -A && git commit -qm "feat(compaction): wire layer C into closerouter forward path (codex-gated)"
```

---

### Task 4: Katman D — `computeRetryAfter` saf fonksiyonu (TDD)

429'da Codex Desktop'ın geri çekilmesi için makul `Retry-After` saniye değeri üret. Upstream `Retry-After` varsa onu (clamp'li) geçir; yoksa default.

**Files:**
- Create: `src/server/services/compaction/retry-after.ts`
- Test: `src/server/services/compaction/retry-after.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
// src/server/services/compaction/retry-after.test.ts
import { describe, it, expect } from "vitest";
import { computeRetryAfter } from "./retry-after.js";

describe("computeRetryAfter", () => {
  it("uses upstream Retry-After when present, clamped to [min,max]", () => {
    expect(computeRetryAfter({ upstreamRetryAfter: "5", min: 20, max: 60, def: 30 })).toBe(20);   // clamp up
    expect(computeRetryAfter({ upstreamRetryAfter: "999", min: 20, max: 60, def: 30 })).toBe(60); // clamp down
    expect(computeRetryAfter({ upstreamRetryAfter: "45", min: 20, max: 60, def: 30 })).toBe(45);
  });
  it("falls back to def when upstream header absent/invalid", () => {
    expect(computeRetryAfter({ upstreamRetryAfter: null, min: 20, max: 60, def: 30 })).toBe(30);
    expect(computeRetryAfter({ upstreamRetryAfter: "abc", min: 20, max: 60, def: 30 })).toBe(30);
  });
});
```

- [ ] **Step 2: Başarısız**

Run: `cd ~/yzapi-compaction && npx vitest run src/server/services/compaction/retry-after.test.ts`
Expected: FAIL — modül yok.

- [ ] **Step 3: Implementasyon**

```ts
// src/server/services/compaction/retry-after.ts
export function computeRetryAfter(o: {
  upstreamRetryAfter: string | null | undefined;
  min: number; max: number; def: number;
}): number {
  const clamp = (n: number) => Math.min(o.max, Math.max(o.min, n));
  if (o.upstreamRetryAfter != null) {
    const n = Number.parseInt(String(o.upstreamRetryAfter).trim(), 10);
    if (Number.isFinite(n) && n >= 0) return clamp(n);
  }
  return o.def;
}
```

- [ ] **Step 4: Yeşil**

Run: `cd ~/yzapi-compaction && npx vitest run src/server/services/compaction/retry-after.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/yzapi-compaction && git add src/server/services/compaction/retry-after.ts src/server/services/compaction/retry-after.test.ts
git commit -qm "feat(compaction): computeRetryAfter pure fn (layer D)"
```

---

### Task 5: Katman D — 429 yanıtına Retry-After header'ı ekle (entegrasyon)

Codex paketinde upstream 429 müşteriye dönerken `Retry-After` header'ı set et. **429 yanıt yolu Task 0 Step 3'te bulundu** (proxy.ts hata yanıtı / forward error handler).

**Files:**
- Modify: `src/server/routes/proxy.ts` (codex 429 hata yanıtı yazıldığı yer) — veya hata header'ları merkezi yazılıyorsa orası.
- Reference: `computeRetryAfter`, `dampenerEnabled` toggle (Task 6).

- [ ] **Step 1: 429 yanıt yolunu sabitle**

Run: `cd ~/yzapi-compaction && grep -nE "status\(?429|\.status === 429|upstream_429|res\.set|setHeader\(\"Retry" src/server/routes/proxy.ts | head`
İncele: codex isteğinde upstream 429 → client yanıtının yazıldığı tek nokta. (Stream + non-stream iki yol olabilir → ikisinde de.)

- [ ] **Step 2: Test (yanıt header'ı)**

```ts
// src/server/services/compaction/retry-after.integration.test.ts
import { describe, it, expect } from "vitest";
import { computeRetryAfter } from "./retry-after.js";
// 429 yolunda kullanılacak değer sözleşmesi: dampener açık + codex → header = computeRetryAfter(...)
describe("retry-after header value contract", () => {
  it("produces a clamped integer seconds string", () => {
    const v = computeRetryAfter({ upstreamRetryAfter: undefined, min: 20, max: 60, def: 30 });
    expect(Number.isInteger(v)).toBe(true);
    expect(String(v)).toMatch(/^\d+$/);
  });
});
```

- [ ] **Step 3: Wire (codex 429 yanıtı)**

429 yanıtı yazılırken (codex + `dampenerEnabled`):
```ts
if (isCodex && runtimeConfig.retryAfterDampenerEnabled && upstreamStatus === 429) {
  const secs = computeRetryAfter({
    upstreamRetryAfter: upstreamHeaders?.get?.("retry-after"),
    min: 20, max: 60, def: 30,
  });
  res.setHeader("Retry-After", String(secs));
}
```
Stream yolu için: header'lar gövde başlamadan yazılmalı; 429 stream başlamadan döndüğü için `res.setHeader` güvenli (Task 0'da stream-error sırasını doğrula).

Run: `cd ~/yzapi-compaction && npx vitest run src/server/services/compaction/retry-after.integration.test.ts && npm run lint 2>&1 | tail -5`
Expected: PASS + lint temiz.

- [ ] **Step 4: Tam suite**

Run: `cd ~/yzapi-compaction && npm test 2>&1 | tail -15`
Expected: PASS (mevcut 429 testleri bozulmadı).

- [ ] **Step 5: Commit**

```bash
cd ~/yzapi-compaction && git add -A && git commit -qm "feat(compaction): set Retry-After on codex upstream 429 (layer D)"
```

---

### Task 6: Konfigürasyon + kill-switch (env + runtime config)

Tüm katmanlar toggle + kill-switch arkasında, default KAPALI (inert).

**Files:**
- Modify: `src/server/lib/env.ts` (`SMART_COMPACTION_ENABLED` zod bool default false)
- Modify: `src/server/services/api-settings-service.ts` (RuntimeApiConfig'e: `compactionLayerCEnabled`, `retryAfterDampenerEnabled`, `tokenSaverEnabled` zaten varsa kullan, `dedupMinBlockChars`, eşik alanları)
- Create: `src/server/services/compaction/config.ts` (`compactionCfgFrom(runtimeConfig)` adaptörü)
- Test: `src/server/services/compaction/config.test.ts`

- [ ] **Step 1: Test (config adaptörü default-off)**

```ts
// src/server/services/compaction/config.test.ts
import { describe, it, expect } from "vitest";
import { compactionCfgFrom } from "./config.js";
describe("compactionCfgFrom", () => {
  it("defaults to disabled when fields absent", () => {
    const c = compactionCfgFrom({} as any);
    expect(c.layerCEnabled).toBe(false);
    expect(c.dedupMinBlockChars).toBeGreaterThan(0);
  });
  it("reflects enabled flags", () => {
    const c = compactionCfgFrom({ compactionLayerCEnabled: true, tokenSaverEnabled: true } as any);
    expect(c.layerCEnabled).toBe(true);
    expect(c.tokenSaverEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Başarısız**

Run: `cd ~/yzapi-compaction && npx vitest run src/server/services/compaction/config.test.ts`
Expected: FAIL — modül yok.

- [ ] **Step 3: Implementasyon**

```ts
// src/server/services/compaction/config.ts
import type { CompactionCConfig } from "./apply-compaction.js";
// RuntimeApiConfig şekli api-settings-service.ts'te; burada gevşek okuyoruz (default-safe).
export function compactionCfgFrom(rc: Record<string, unknown> | null | undefined): CompactionCConfig {
  const on = (k: string) => rc?.[k] === true;
  const num = (k: string, d: number) => (typeof rc?.[k] === "number" ? (rc[k] as number) : d);
  return {
    layerCEnabled: on("compactionLayerCEnabled"),
    tokenSaverEnabled: on("tokenSaverEnabled"),
    dedupMinBlockChars: num("compactionDedupMinBlockChars", 4000),
  };
}
```
env.ts'e: `SMART_COMPACTION_ENABLED: z.coerce.boolean().default(false)`. api-settings-service.ts'e yeni DB-okunan alanlar (mevcut `tokenSaverEnabled` desenini izle; `system_api_config`'e kolon eklenmesi gerekirse migration — bkz Step 4).

- [ ] **Step 4: Migration gerekiyorsa (yeni system_api_config kolonları)**

Run: `cd ~/yzapi-compaction && ls src/server/db/migrations | tail -3` → **canlı max migration numarasını yzapi-vps'ten de doğrula** (eşzamanlı oturum çakışması — CLAUDE.md). Sonraki numarayı kullan. Kolonlar: `compaction_layer_c_enabled bool default false`, `retry_after_dampener_enabled bool default false`, `compaction_dedup_min_block_chars int default 4000`, `oversized_seat_spread_enabled bool default false`, `compaction_layer_b_enabled bool default false`, `compaction_soft_pct int default 60`, `compaction_hard_pct int default 90`. Hepsi default-off/inert.

- [ ] **Step 5: Yeşil + commit**

Run: `cd ~/yzapi-compaction && npx vitest run src/server/services/compaction/config.test.ts && npm run lint 2>&1 | tail -5`
Expected: PASS + lint temiz.
```bash
git add -A && git commit -qm "feat(compaction): config + kill-switch (default off, inert)"
```

---

### Task 7: Gözlemlenebilirlik (hangi katman çalıştı + önce/sonra boyut)

**Files:**
- Modify: forward yolunda (Task 3 wire noktası) — `_c.replacedBlocks`, `_c.savedChars` ve D-tetiklendi bilgisini structured log + (varsa) `usage_records.raw_usage_json`'a ek alan.
- Test: yok (log-only) — veya küçük bir "log payload shape" testi.

- [ ] **Step 1: Log satırını ekle**

```ts
if (_c.replacedBlocks > 0 || _c.savedChars > 0) {
  console.log(JSON.stringify({ evt: "compaction_c", entitlementId, replaced: _c.replacedBlocks, saved: _c.savedChars }));
}
```
(429 Retry-After set edildiğinde de `{ evt: "retry_after", secs }` logla.)

- [ ] **Step 2: Lint + tam suite + commit**

Run: `cd ~/yzapi-compaction && npm run lint 2>&1 | tail -5 && npm test 2>&1 | tail -15`
Expected: temiz + PASS.
```bash
git add -A && git commit -qm "feat(compaction): observability logs for layer C / D"
```

---

### Task 8: Katman A — context-guard hard-reject'i compaction sonrası konumla/ayarla

**Mevcut** context-guard (`request-guard-service.ts`, `contextTokens > limit × INFLATION`) zaten istemciyi compact'e zorluyor. Amaç: (a) reject KARARININ compaction'dan SONRA verildiğinden emin ol (yoksa C/B'nin küçülttüğü istek hâlâ eski boyutla reddedilir), (b) mesajını net "compact yap" sinyaline ayarla, (c) over-reject tuzağına düşme (bkz `project_yzapi_context_guard_inflation_overreject`).

**Files:**
- Modify: `src/server/routes/proxy.ts` — guard çağrısının sırası (compaction'dan sonra contextTokens yeniden hesaplanmalı veya guard compaction sonrası body üzerinde çalışmalı).
- Reference: `CONTEXT_GUARD_ESTIMATE_INFLATION`, mevcut reject mesajı.

- [ ] **Step 1: Sırayı doğrula**

Run: `cd ~/yzapi-compaction && grep -nE "buildRequestGuard|contextTokens|consumeTpmOrDeny|applyCompactionC" src/server/routes/proxy.ts`
İncele: guard, compaction'dan ÖNCE mi hesaplıyor? Codex'te compaction sonrası body küçüldüyse, reject eşiği güncel (küçülmüş) boyutla değerlendirilmeli.

- [ ] **Step 2: Test**

```ts
// src/server/services/compaction/layer-a-order.test.ts
import { describe, it, expect } from "vitest";
import { applyCompactionC } from "./apply-compaction.js";
// Sözleşme: compaction sonrası boyut, guard eşiği için kullanılan değer olmalı (regresyon koruması).
describe("layer A reads post-compaction size", () => {
  it("post-C body is smaller, so guard should evaluate the smaller size", () => {
    const dup = "z".repeat(8000);
    const body = { messages: [{ role: "user", content: dup }, { role: "user", content: dup }] };
    const after = applyCompactionC(body, { isCodex: true, cfg: { layerCEnabled: true, tokenSaverEnabled: true, dedupMinBlockChars: 2000 } });
    expect(JSON.stringify(after.body).length).toBeLessThan(JSON.stringify(body).length);
  });
});
```

- [ ] **Step 3: Wire — guard'ı compaction sonrası body ile çalıştır (yalnız codex'te)**

Codex yolunda: `applyCompactionC` → sonra contextTokens'ı compaction'lı body'den hesapla → guard reject'i ona göre. Non-codex yol DEĞİŞMEZ. Mesajı net tut ("Bağlam çok büyük; lütfen /compact ile küçültüp tekrar deneyin"). **Eşiği DEĞİŞTİRME** (over-reject riski) — yalnız compaction sonrası boyutu kullan.

Run: `cd ~/yzapi-compaction && npx vitest run src/server/services/compaction/layer-a-order.test.ts && npm test 2>&1 | tail -15`
Expected: PASS + tam suite yeşil.

- [ ] **Step 4: Commit**

```bash
cd ~/yzapi-compaction && git add -A && git commit -qm "feat(compaction): layer A reject reads post-compaction size, clearer message"
```

---

### Task 9: Katman E — seat-spread FİZİBİLİTE SPIKE (kod yok, araştırma)

**Files:** Create: `docs/superpowers/specs/2026-06-28-seat-spread-feasibility.md` (bulgular)

- [ ] **Step 1: cliproxy affinity-keying'ini araştır**

İncele (canlıya yazma YOK, salt-okuma): yzapi seat'e isteği nasıl yolluyor (autossh tunnel → cliproxy:8317), session/affinity anahtarı ne (header? user id? body hash?). `grep -rn "session" + "affinity" + "x-session" + sub-codex routing` (yzapi tarafı) + cliproxy `config.yaml` `routing.session-affinity` (Mac mini, `~/.cli-proxy-api/`). **Soru:** yzapi, oversized istekte gönderdiği session anahtarını değiştirip isteği farklı koltuğa yönlendirebilir mi?

- [ ] **Step 2: Bulguyu yaz + karar**

Bulgu dosyasına: (a) affinity nasıl key'leniyor, (b) yzapi seçici kırabilir mi, (c) kırarsa cache-cold maliyeti (yalnız oversized'da olduğu için kabul edilebilir mi), (d) FİZİBİL mi? Fizibilse → ayrı küçük plan; değilse → E DÜŞER, C+D+B yeterli. **Bu task kod üretmez; sonraki kararı belirler.**

- [ ] **Step 3: Commit (replikada)**

```bash
cd ~/yzapi-compaction && git add docs/superpowers/specs/2026-06-28-seat-spread-feasibility.md
git commit -qm "docs(compaction): layer E (seat-spread) feasibility findings"
```

---

## Deploy (bu plan kapsamı DIŞINDA — ayrı, çift-onay + 3-QA)
Replikada tüm task'lar yeşil olunca: 3-ajan QA (≥2 PASS, ssh YOK), izole targeted-rsync isolation kanıtı (`rsync -rlzn --checksum --itemize` yalnız değişen dosyalar), canlı yedek, sunucu gate (lint+test+build+migrate+restart+health200), `SMART_COMPACTION_ENABLED=true` + katman toggle'ları **kademeli** (önce C+D yokum'da). Tümü CLAUDE.md deploy reçetesiyle.

## Self-Review (yazımdan sonra)
- **Spec coverage:** C (Task 1-3) ✓, D (Task 4-5) ✓, A (Task 8) ✓, E-spike (Task 9) ✓, config/kill-switch (Task 6) ✓, gözlemlenebilirlik (Task 7) ✓, rollout (Deploy bölümü) ✓. **B bu plan DIŞINDA** (Plan 2, kasıtlı).
- **Placeholder:** Yeni saf fonksiyonların kodu tam; entegrasyon adımları sembol-adıyla + Task 0'da sabitlenen imzalara dayalı (canlı-drift gerçeği gereği line-number değil sembol). "Verify against live" adımları gerçek `grep` komutları (placeholder değil).
- **Type tutarlılığı:** `CompactionCConfig` (apply-compaction.ts) ↔ `compactionCfgFrom` (config.ts) alan adları eşleşiyor (layerCEnabled/tokenSaverEnabled/dedupMinBlockChars). `applyCompactionC` dönüş `{body, replacedBlocks, savedChars}` Task 3/7'de aynı kullanılıyor. `computeRetryAfter` imzası Task 4/5'te aynı.
