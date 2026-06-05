# YZ API — TR/EN i18n Design

**Status:** Approved (decisions confirmed by user 2026-06-04). LOCAL only — no push/deploy.

**Goal:** Add Turkish (default) + English language support across the customer panel, public pages, backend API error messages, and customer email templates. Zero new dependencies.

## Confirmed decisions
- **Scope:** Everything customer-facing — panel UI + public pages + backend API error messages + customer email templates. **Admin panel and docs stay Turkish** (admin is single-user/owner; docs are contract-test-locked: `documents-content-contract`, `os-install-variants-contract`).
- **Language selection:** Default **TR**; on first visit detect from `navigator.language` (`tr*` → tr, else en); top-right **TR/EN toggle**; choice persisted in `localStorage` (`yz_lang`) and, when authenticated, mirrored to the user's profile (`users.lang`) so emails follow the same language.
- **Mechanism:** Lightweight custom i18n — React Context + `useT()` hook + `tr`/`en` dictionary modules. No `react-i18next`. Must keep `npm run scan:public` clean (no provider codenames in dicts) and not bloat the public bundle.

## Non-goals
- Admin panel (`tab-admin*.jsx`), docs (`tab-documents.jsx`, `api-docs.js`), legal docs (`legal-docs.js`) — remain Turkish.
- Admin-only emails (daily report, payment-notification, kur anomaly) — remain Turkish.
- No translation-management tooling; dictionaries are hand-authored TS/JS modules.

## Architecture

### Frontend (custom i18n, 0-dep)
- `src/yapayzekalab/i18n/index.jsx` — exports:
  - `LangProvider` — React context provider. Initial language = `localStorage['yz_lang']` → else `navigator.language` detect → else `'tr'`. Exposes `{ lang, setLang, t }`.
  - `useT()` — hook returning `{ t, lang, setLang }`.
  - `t(key, vars?)` — looks up `dict[lang][key]`; falls back to `dict.tr[key]`; falls back to the key itself. Supports `{name}`-style interpolation from `vars`.
  - `setLang(next)` — updates state, writes `localStorage['yz_lang']`, sets `document.documentElement.lang`, and (if a profile setter is wired) fires a `yz:lang-change` event so the app can PATCH `/api/user/me`.
  - `detectInitialLang()` — pure helper, unit-testable.
- `src/yapayzekalab/i18n/tr.js` and `src/yapayzekalab/i18n/en.js` — flat key→string dictionaries, namespaced by surface (`nav.home`, `login.googleCta`, `packages.buyWithBalance`, `common.cancel`, …). `tr` is the source of truth for the key set; `en` mirrors every key.
- `<LangToggle/>` — small TR/EN segmented control. Rendered in `TopBar` (authenticated) and on `LoginScreen` (top-right corner) so language is switchable before login.
- **Provider wrap:** in `src/main.tsx`, wrap `<App/>` with `<LangProvider>` so both the login screen and the authenticated app are covered.

### String conversion pattern
Each customer-facing component calls `const { t } = useT();` and replaces hardcoded Turkish literals with `t('namespace.key')`. Keys are added to BOTH `tr.js` (verbatim existing Turkish) and `en.js` (English translation). Interpolated strings use `t('key', { count, name })`.

**Hard constraints during conversion:**
- Do NOT change any `section`/tab `id` values, route keys, or data-* attributes — only display strings. (Contract tests assert on section IDs like `account-balance`, `account-keys`, home topup routing.)
- Do NOT reorder `MODELS`/catalog arrays in `shared.jsx` (frontend display-order contract).
- Do NOT introduce provider codenames or upstream URLs into dictionaries (`scan:public` + noleak contracts).
- Keep `Documents` tab label as-is is fine, but the docs tab body stays Turkish.

### Backend error localization (no service edits — billing DOKUNULMAZ)
- `src/server/middleware/request-lang.ts` — middleware reading language from (1) `X-Lang` header if `tr|en`, else (2) `Accept-Language` first tag, else (3) `'tr'`. Sets `req.lang`. Registered early in `app.ts` (after `requestId`, before routes). Augment Express `Request` with `lang?: 'tr'|'en'`.
- `src/server/lib/error-messages.ts` — backend locale dictionary keyed by a stable **error code** plus a class-name map (`InsufficientBalanceError`, `RateLimitError`, `UnauthorizedError`, …). Exposes `localizeError(err, lang)` returning a localized message or `null` (→ keep original).
- `src/server/middleware/error-handler.ts` — at the serialization boundary, if `localizeError(err, req.lang)` returns a string, use it as the response `error` message; otherwise keep the original Turkish message. **No throwing site changes; billing-service untouched.** Covers the common user-facing set (402 insufficient balance, 401 unauthorized, 429 rate-limited, 403 whatsapp-verification-required, generic 500).

### User language preference + emails
- **Migration 0023** (`0023_user_lang.sql`): `ALTER TABLE users ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'tr';` + Drizzle `schema.ts` `users.lang` + `meta/_journal.json` idx 23.
- **PATCH `/api/user/me`**: accept optional `lang` ∈ `{tr,en}`; validate; persist. **GET `/api/user/me`**: include `lang` in payload.
- **Frontend persist:** when authenticated and `setLang` runs, PATCH `/api/user/me { lang }` (best-effort, non-blocking). On login, seed the toggle from `profile.lang` (profile wins over localStorage when present).
- **Emails:** localize the **3 customer templates** — welcome (`auth.ts`), low-balance (`low-balance-scan-job.ts`), payment receipt (`payment-common.ts`). Each builder takes `lang` (resolved from the recipient's `users.lang`, default `tr`) and selects localized subject + body. Admin emails unchanged.

## Phasing (each phase independently testable + committed, all LOCAL)
- **Phase A — infra + shell + new tabs:** i18n infra + `LangToggle` + `LangProvider` wrap; convert `App.jsx` shell (TopBar nav, LoginScreen, WhatsApp OTP, UserMenu, LogoutConfirm, footer, notifications, public-status modal) + the 5 newest customer tabs (`tab-packages`, `tab-ai-chat`, `tab-studio`, `tab-status`, `tab-support`). Unit test for `detectInitialLang` + `t` fallback.
- **Phase B — legacy big tabs:** `tab-home`, `tab-account`, `tab-activity`, `tab-models`, `shared.jsx` (customer strings only), `TelegramTopupApp.jsx`.
- **Phase C — backend errors:** `request-lang` middleware + `error-messages` dict + error-handler wiring + unit tests (localized vs fallback, header/Accept-Language parsing).
- **Phase D — user pref + emails:** migration 0023 + schema + PATCH/GET `/me` lang + frontend persist/seed + 3 customer email templates localized + itest for `/me` lang round-trip.

## Testing
- `npm run lint` (tsc) clean after each phase.
- `npm test` (unit) green; add: i18n `detectInitialLang`/`t`-fallback unit test (Phase A), error-localization unit test (Phase C).
- `npm run itest` green; add `/me` lang round-trip itest (Phase D).
- `npm run build` + `npm run scan:public` → 0 leaks after frontend phases.
- Existing contract tests must stay green (don't touch section IDs, model order, docs/admin strings).

## Risks
- **Large diff across big legacy files** (tab-account 1643, tab-home 1072) — mitigate with per-file subagent conversion + spec review + full test run per file.
- **Contract tests assert on customer nav/section structure** — only translate display strings, never IDs/ordering.
- **EN translation quality** — keep terse, product-appropriate; TR remains source of truth.
- **billing-service is DOKUNULMAZ** — backend localization happens only at the error-handler boundary by error code/class, never inside services.
