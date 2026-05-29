# YZAPI Dirty Tree Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kirli `yzapi` çalışma ağacını feature bazında ayırmak, riskli karışık deploy ihtimalini bitirmek ve her değişiklik grubunu doğrulanabilir küçük commit setlerine bölmek.

**Architecture:** Temizlik tek büyük commit ile yapılmayacak. Önce dosyalar feature kümelerine ayrılacak, sonra her küme kendi test ve diff kanıtıyla ayrı commitlenecek veya park edilecek. Telegram identity linking hattı, fiyat/doküman düzeltmeleri ve yardımcı artıklar birbirinden bağımsız ele alınacak.

**Tech Stack:** React, Vite, Express, Drizzle, Vitest, TypeScript, local git workflow

---

## File Structure

### Küme A — Telegram Identity Linking

**Amaç:** Site ve Telegram hesabını tek `user_id` altında birleştiren feature setini tek başına temizlemek.

**Dosyalar**
- Modify: `src/server/routes/telegram.ts`
- Modify: `src/server/routes/user.ts`
- Modify: `src/server/services/telegram-bot-service.ts`
- Modify: `src/server/services/telegram-bot-service.test.ts`
- Modify: `src/server/routes/telegram-webapp-contract.test.ts`
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/lib/env.ts`
- Modify: `src/yapayzekalab/App.jsx`
- Modify: `src/yapayzekalab/auth-client.js`
- Modify: `src/yapayzekalab/tab-account.jsx`
- Modify: `src/yapayzekalab/tab-admin.jsx`
- Create: `src/server/db/migrations/0010_telegram_link_identity.sql`
- Create: `src/server/services/telegram-login-auth-service.ts`
- Create: `src/telegram-link-contract.test.ts`

### Küme B — Model Pricing / Override / Models UI

**Amaç:** Gemini fiyat değişiklikleri, admin override düzeltmesi ve model listesinin canlı katalogdan okunması.

**Dosyalar**
- Modify: `src/master-models.ts`
- Modify: `src/yapayzekalab/shared.jsx`
- Modify: `src/yapayzekalab/tab-models.jsx`
- Modify: `src/yapayzekalab/tab-admin.jsx`
- Modify: `src/claude-popusk-contract.test.ts`
- Modify: `src/server/services/model-catalog.test.ts`
- Modify: `src/admin-override-ui-contract.test.ts`
- Create: `src/models-live-pricing-contract.test.ts`

### Küme C — Documents / İçindekiler / Scroll

**Amaç:** Documents sekmesindeki içindekiler alanını gerçek hedef bloklara kaydırır hale getirmek.

**Dosyalar**
- Modify: `src/yapayzekalab/tab-documents.jsx`
- Modify: `src/documents-content-contract.test.ts`

### Küme D — İncelenmesi Gereken Artıklar

**Amaç:** Bu turda bağımsız feature değeri üretmeyen, ama repoda kirli duran küçük artıkların kararı.

**Dosyalar**
- Modify: `src/server/lib/logger.ts`
- Modify: `src/server/lib/logger-redaction.test.ts`
- Modify: `src/server/db/migrations/meta/_journal.json`
- Untracked: `.codex-backups/`

---

### Task 1: Dirty Tree Snapshot ve Sınıflandırma

**Files:**
- Modify: `docs/superpowers/plans/2026-05-29-yzapi-dirty-tree-cleanup.md`
- Inspect: `git diff --name-only`
- Inspect: `git diff --stat`

- [ ] **Step 1: Kirli dosya envanterini doğrula**

Run:

```bash
git status --short
git diff --name-only
git diff --stat
```

Expected:
- Telegram, pricing/models, documents ve küçük artık kümeleri net görünmeli

- [ ] **Step 2: Dosyaları dört kümeye elle eşleştir**

Kontrol kriteri:
- Telegram işine ait dosya başka kümeye girmeyecek
- Pricing/models işi Telegram commitine karışmayacak
- Documents scroll değişikliği tek başına ayrılabilecek
- Logger/meta/backups ayrı “karar bekleyen artık” olarak kalacak

- [ ] **Step 3: Bu planın üst kısmındaki file structure bölümünü güncel gerçek ağaçla tekrar eşleştir**

Expected:
- Dosya listesi gerçek `git diff --name-only` ile uyumlu olmalı

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-05-29-yzapi-dirty-tree-cleanup.md
git commit -m "docs: add dirty tree cleanup plan"
```

---

### Task 2: Telegram Linking Kümesini İzole Et

**Files:**
- Modify: `src/server/routes/telegram.ts`
- Modify: `src/server/routes/user.ts`
- Modify: `src/server/services/telegram-bot-service.ts`
- Modify: `src/server/services/telegram-bot-service.test.ts`
- Modify: `src/server/routes/telegram-webapp-contract.test.ts`
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/lib/env.ts`
- Modify: `src/yapayzekalab/App.jsx`
- Modify: `src/yapayzekalab/auth-client.js`
- Modify: `src/yapayzekalab/tab-account.jsx`
- Modify: `src/yapayzekalab/tab-admin.jsx`
- Create: `src/server/db/migrations/0010_telegram_link_identity.sql`
- Create: `src/server/services/telegram-login-auth-service.ts`
- Create: `src/telegram-link-contract.test.ts`

- [ ] **Step 1: Telegram feature diffini tek başına çıkar**

Run:

```bash
git diff -- src/server/routes/telegram.ts \
  src/server/routes/user.ts \
  src/server/services/telegram-bot-service.ts \
  src/server/services/telegram-bot-service.test.ts \
  src/server/routes/telegram-webapp-contract.test.ts \
  src/server/db/schema.ts \
  src/server/lib/env.ts \
  src/yapayzekalab/App.jsx \
  src/yapayzekalab/auth-client.js \
  src/yapayzekalab/tab-account.jsx \
  src/yapayzekalab/tab-admin.jsx \
  src/server/db/migrations/0010_telegram_link_identity.sql \
  src/server/services/telegram-login-auth-service.ts \
  src/telegram-link-contract.test.ts
```

Expected:
- Diff tamamen Telegram link/identity akışını anlatmalı

- [ ] **Step 2: Telegram contract testlerini çalıştır**

Run:

```bash
npm test -- src/telegram-link-contract.test.ts src/server/routes/telegram-webapp-contract.test.ts src/server/services/telegram-bot-service.test.ts
```

Expected:
- PASS

- [ ] **Step 3: Telegram kümesinin başka feature taşıyıp taşımadığını denetle**

Kontrol listesi:
- Gemini fiyat değişikliği yok
- Documents TOC scroll kodu yok
- unrelated logger semantics yok

- [ ] **Step 4: Telegram kümesini stage et**

```bash
git add src/server/routes/telegram.ts \
  src/server/routes/user.ts \
  src/server/services/telegram-bot-service.ts \
  src/server/services/telegram-bot-service.test.ts \
  src/server/routes/telegram-webapp-contract.test.ts \
  src/server/db/schema.ts \
  src/server/lib/env.ts \
  src/yapayzekalab/App.jsx \
  src/yapayzekalab/auth-client.js \
  src/yapayzekalab/tab-account.jsx \
  src/yapayzekalab/tab-admin.jsx \
  src/server/db/migrations/0010_telegram_link_identity.sql \
  src/server/services/telegram-login-auth-service.ts \
  src/telegram-link-contract.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add telegram site identity linking"
```

---

### Task 3: Pricing / Override / Models Kümesini İzole Et

**Files:**
- Modify: `src/master-models.ts`
- Modify: `src/yapayzekalab/shared.jsx`
- Modify: `src/yapayzekalab/tab-models.jsx`
- Modify: `src/yapayzekalab/tab-admin.jsx`
- Modify: `src/claude-popusk-contract.test.ts`
- Modify: `src/server/services/model-catalog.test.ts`
- Modify: `src/admin-override-ui-contract.test.ts`
- Create: `src/models-live-pricing-contract.test.ts`

- [ ] **Step 1: Pricing diffini tek başına doğrula**

Run:

```bash
git diff -- src/master-models.ts \
  src/yapayzekalab/shared.jsx \
  src/yapayzekalab/tab-models.jsx \
  src/yapayzekalab/tab-admin.jsx \
  src/claude-popusk-contract.test.ts \
  src/server/services/model-catalog.test.ts \
  src/admin-override-ui-contract.test.ts \
  src/models-live-pricing-contract.test.ts
```

Expected:
- Gemini 3.1 = `0.85`
- Gemini 3.0 = `0.69`
- admin override input normalize
- model arama + yüksekten düşüğe sıralama
- live `/api/models` kullanımı

- [ ] **Step 2: Failing risk alanlarını hedefli doğrula**

Run:

```bash
npm test -- src/admin-override-ui-contract.test.ts src/models-live-pricing-contract.test.ts src/claude-popusk-contract.test.ts src/server/services/model-catalog.test.ts
```

Expected:
- PASS

- [ ] **Step 3: Pricing kümesini stage et**

```bash
git add src/master-models.ts \
  src/yapayzekalab/shared.jsx \
  src/yapayzekalab/tab-models.jsx \
  src/yapayzekalab/tab-admin.jsx \
  src/claude-popusk-contract.test.ts \
  src/server/services/model-catalog.test.ts \
  src/admin-override-ui-contract.test.ts \
  src/models-live-pricing-contract.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -m "fix: align gemini pricing and model override display"
```

---

### Task 4: Documents Kümesini İzole Et

**Files:**
- Modify: `src/yapayzekalab/tab-documents.jsx`
- Modify: `src/documents-content-contract.test.ts`

- [ ] **Step 1: Documents diffini tek başına doğrula**

Run:

```bash
git diff -- src/yapayzekalab/tab-documents.jsx src/documents-content-contract.test.ts
```

Expected:
- yalnızca içindekiler tıklama davranışı
- `scrollIntoView`
- `window.history.replaceState`

- [ ] **Step 2: Hedefli test çalıştır**

Run:

```bash
npm test -- src/documents-content-contract.test.ts
```

Expected:
- PASS

- [ ] **Step 3: Documents kümesini stage et**

```bash
git add src/yapayzekalab/tab-documents.jsx src/documents-content-contract.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -m "fix: add documents table of contents scrolling"
```

---

### Task 5: Artıkları Karara Bağla

**Files:**
- Modify: `src/server/lib/logger.ts`
- Modify: `src/server/lib/logger-redaction.test.ts`
- Modify: `src/server/db/migrations/meta/_journal.json`
- Untracked: `.codex-backups/`

- [ ] **Step 1: Logger diffini içerik bazında incele**

Run:

```bash
git diff -- src/server/lib/logger.ts src/server/lib/logger-redaction.test.ts
```

Expected:
- ya açıkça ayrı güvenlik/logging işi olduğu kanıtlanır
- ya da yanlışlıkla kalmış küçük artık olduğu görülür

- [ ] **Step 2: Migration journal kararını ver**

Run:

```bash
git diff -- src/server/db/migrations/meta/_journal.json
```

Decision:
- Eğer `0010_telegram_link_identity.sql` ile uyumlu zorunlu meta güncellemesi ise Telegram commitine dahil et
- Değilse stage etme

- [ ] **Step 3: Backup klasörünü repo dışı artık say**

Run:

```bash
find .codex-backups -maxdepth 2 -type f | sed -n '1,40p'
```

Decision:
- `.codex-backups/` commitlenmeyecek
- gerekirse `.gitignore` kararı ayrı taska bırakılacak

- [ ] **Step 4: Kalan kir için son tabloyu yaz**

Tablo sütunları:
- dosya
- feature kümesi
- commitlenecek / bekleyecek / dışarıda kalacak
- gerekçe

---

### Task 6: Tam Regresyon ve Deploy-Ready Temizlik Kontrolü

**Files:**
- Modify: none required
- Verify: repo root

- [ ] **Step 1: Full test**

Run:

```bash
npm test
```

Expected:
- PASS

- [ ] **Step 2: Type/lint**

Run:

```bash
npm run lint
```

Expected:
- PASS

- [ ] **Step 3: Build**

Run:

```bash
npm run build
```

Expected:
- PASS

- [ ] **Step 4: Public tarama**

Run:

```bash
npm run scan:public
node scripts/scan-secrets.mjs
```

Expected:
- temiz

- [ ] **Step 5: Son git durumu**

Run:

```bash
git status --short
```

Expected:
- yalnızca bilinçli olarak dışarıda bırakılan dosyalar kalmalı
- karışık feature artığı kalmamalı

---

## Self-Review

### Spec coverage
- Thread notundaki Telegram linking işi ayrı küme olarak ele alındı.
- Mevcut dirty tree feature bazında ayrıldı.
- Commit sırası tanımlandı.
- “karışık deploy yapma” kuralı plana işlendi.

### Placeholder scan
- `TODO`, `TBD`, `later` yok.
- Her taskta dosya ve komut var.

### Type consistency
- Telegram kümesi, pricing kümesi ve documents kümesi aynı dosya adlarıyla tekrar kullanıldı.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-29-yzapi-dirty-tree-cleanup.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
