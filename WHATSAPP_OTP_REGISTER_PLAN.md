# WhatsApp OTP Register Plan

## Scope

YapayZekaLab currently has Google OAuth signup/login, not a classic password register form. WhatsApp OTP should therefore sit after Google email verification and before issuing a full user session.

Reference thread read:

- `codex://threads/019e6e64-0558-7782-9187-f90098c5ed71`
- That thread was for `/Users/ufuk/Documents/sesyapcoreyeni`, so the design below adapts only the useful OTP lessons to `/Users/ufuk/yzapi`.

## Lessons From Referenced Thread

- Phone number and OTP code must be hashed before persistence.
- OTP completion must be atomic so the same verified OTP cannot be reused in parallel.
- Do not import Node crypto into code that can enter a browser bundle.
- Do not deploy from a dirty tree or with unrelated half-finished files.
- OTP tests, build, lint, secret scan and live smoke must pass before deploy.

## Selected Approach

Use OpenWA for OTP delivery behind a provider adapter.

Reason:

- Product decision for this implementation is OpenWA.
- The code keeps provider selection behind `WHATSAPP_OTP_PROVIDER` so a later Meta Cloud API migration does not require changing the auth flow.
- Production OTP remains disabled by default until server-side OpenWA credentials and a live dry-run-safe verification are configured.

Future option:

- Meta WhatsApp Cloud API can be added behind the same adapter later if approved templates and official delivery are required.

Do not use:

- WhatsApp click-to-chat link for OTP. It cannot securely deliver server-generated OTP.
- SMS-only provider unless the product decision changes from WhatsApp to SMS.

## User Flow

1. User clicks Google login.
2. Google callback verifies email.
3. Backend upserts user with `whatsapp_status=pending` if no verified WhatsApp exists.
4. Backend does not issue normal access/refresh tokens yet.
5. Backend redirects frontend with a short-lived `whatsapp_pending_token`.
6. Frontend shows the existing-theme OTP card/modal.
7. User enters WhatsApp number.
8. Backend normalizes number to E.164 and sends a 6-digit OTP through WhatsApp.
9. User enters OTP.
10. Backend atomically verifies and consumes OTP.
11. Backend stores verified phone and separate marketing consent.
12. Backend issues normal access/refresh tokens.
13. User enters API/balance panel.

Existing verified users:

- Skip OTP and receive normal tokens.

Existing users without phone:

- Forced through OTP before `/api/user/*`, API key creation, payment init and admin UI access.

## Legal/KVKK Rule

Phone verification and marketing consent must be separate.

Required:

- Phone number can be required for account security and abuse prevention.
- User must see a clear KVKK/privacy note for storing the verified phone.
- Verified phone records are append-only in product behavior: no admin/user hard-delete action.
- If a user changes phone, keep old record as inactive history and create a new verified record.
- If an account is closed, keep the phone verification record for abuse prevention, reconciliation and legal audit unless legal counsel requires anonymization.

Optional:

- WhatsApp marketing consent must be an unchecked optional checkbox.
- Do not bundle marketing consent into mandatory OTP verification.
- Store consent timestamp, IP hash, user agent hash and consent text version.

## Backend Design

### New environment variables

- `WHATSAPP_OTP_ENABLED=true`
- `WHATSAPP_OTP_PROVIDER=meta`
- `WHATSAPP_OTP_HASH_SECRET`
- `WHATSAPP_OTP_TTL_SEC=300`
- `WHATSAPP_OTP_MAX_ATTEMPTS=5`
- `WHATSAPP_OTP_RESEND_COOLDOWN_SEC=60`
- `WHATSAPP_OTP_MAX_SENDS_PER_PHONE_HOUR=3`
- `WHATSAPP_OTP_MAX_SENDS_PER_IP_DAY=10`
- `META_WHATSAPP_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_OTP_TEMPLATE_NAME`
- `META_WHATSAPP_TEMPLATE_LANG=tr`
- Optional fallback: `OPENWA_API_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_ID`

### New tables

`whatsapp_otp_requests`

- `id uuid primary key`
- `user_id uuid references users(id)`
- `purpose text` values: `signup`, `login`, `reverify`
- `phone_e164 text`
- `phone_hash text`
- `code_hash text`
- `attempt_count int default 0`
- `send_count int default 1`
- `expires_at timestamptz`
- `consumed_at timestamptz`
- `completed_at timestamptz`
- `ip_hash text`
- `user_agent_hash text`
- `provider text`
- `provider_message_id text`
- `created_at timestamptz`

`whatsapp_verified_numbers`

- `id uuid primary key`
- `user_id uuid references users(id)`
- `phone_e164 text`
- `phone_hash text unique`
- `verified_at timestamptz`
- `status text default 'active'` values: `active`, `inactive`, `account_closed`, `blocked`
- `replaced_by_id uuid references whatsapp_verified_numbers(id)`
- `inactive_at timestamptz`
- `inactive_reason text`
- `marketing_consent boolean default false`
- `marketing_consent_at timestamptz`
- `consent_text_version text`
- `consent_ip_hash text`
- `consent_user_agent_hash text`
- `created_at timestamptz`
- `updated_at timestamptz`

Optional user columns:

- `whatsapp_verified_at timestamptz`
- `whatsapp_required boolean default true`

### New endpoints

`POST /api/auth/whatsapp-otp/start`

- Auth: pending token only.
- Input: `{ phoneE164, marketingConsent? }`.
- Output: `{ verificationId, expiresAt, resendAt, maskedPhone }`.
- Behavior: normalize phone, rate-limit, hash phone/code, send WhatsApp template.

`POST /api/auth/whatsapp-otp/verify`

- Auth: pending token only.
- Input: `{ verificationId, code, marketingConsent }`.
- Output: normal `{ accessToken, refreshToken, user }`.
- Behavior: timing-safe compare, atomic consume, unique phone bind.

`POST /api/auth/whatsapp-otp/resend`

- Auth: pending token only.
- Input: `{ verificationId }`.
- Output: `{ verificationId, expiresAt, resendAt }`.
- Behavior: cooldown and send-count guarded.

`GET /api/user/me`

- Add safe fields: `whatsappVerified`, `phoneMasked`, `marketingWhatsappConsent`.
- Never return raw phone to normal UI unless explicitly needed.

### Auth middleware gate

Add `requireWhatsappVerified` after `userAuth`.

Protected until verified:

- `/api/user/*`
- `/api/payments/*` user init routes
- `/api/admin/*` user-token based admin access

Allowed before verified:

- `/api/auth/refresh`
- `/api/auth/logout`
- `/api/auth/whatsapp-otp/*`
- public health/status/model endpoints

## Frontend Design Lock

No template redesign.

Use current restored YapayZekaLab components and styles:

- Google login remains same.
- Add OTP state after OAuth return.
- Use existing card/modal/button visual language.
- Add phone input, send OTP button, code input, resend timer, optional marketing checkbox.
- Show clear error states: invalid phone, cooldown, expired code, too many attempts.

Copy:

- Required note: `API hesabını korumak için WhatsApp numaranı doğrula.`
- Marketing checkbox: `WhatsApp üzerinden kampanya ve duyuru mesajları almak istiyorum.`
- Privacy note: `Numaran doğrulama ve hesap güvenliği için saklanır. Reklam/duyuru mesajları yalnızca izin verirsen gönderilir.`

## Security Rules

- Never log OTP code, raw phone, raw pending token or provider token.
- Store OTP code only as HMAC/hash.
- Store phone hash for uniqueness and lookup.
- Never hard-delete rows from `whatsapp_verified_numbers` or `whatsapp_otp_requests`.
- Use status changes for lifecycle: active, inactive, account closed or blocked.
- Use atomic update: `consumed_at IS NULL`, `expires_at > now()`, attempt limit still valid.
- Mark `completed_at` in the same transaction as phone bind and token issue.
- If phone bind fails because phone belongs to another user, do not issue tokens.
- Expired/failed OTP requests do not create sessions.
- Rate-limit by phone hash and IP hash.
- Redact `authorization`, `cookie`, `phone`, `otp`, `code`, `token`, `provider_message_id` in logs.

## Admin / Operations

Admin panel should show:

- User phone masked.
- WhatsApp verified yes/no.
- Marketing consent yes/no.
- Verification date.
- Failed OTP count or lock status.

Admin should be able to:

- Deactivate phone verification only with audit log; hard delete is not available.
- Opt user out of marketing consent.
- Not view OTP codes.

## Tests

Unit:

- Phone normalization.
- OTP hash/verify.
- Rate limit decisions.
- Expired OTP rejects.
- Wrong OTP increments attempts.
- Correct OTP consumes atomically.
- Duplicate phone bind rejects.
- Marketing consent stored separately.

Integration:

- Google callback for new user returns pending OTP state, not full access token.
- OTP start sends provider request with masked logs.
- OTP verify returns normal tokens.
- `/api/user/me` blocked before OTP and allowed after OTP.
- API key creation blocked before OTP and allowed after OTP.
- Admin access behavior remains correct.

Security:

- Secret scan clean.
- Public bundle has no WhatsApp provider tokens.
- Logs redact phone/code/token.
- Brute force rate limits work.

Live:

- Meta WhatsApp template approved.
- One real OTP to test number.
- Login/signup completion verified.
- No unrelated UI/theme changes.
- Rollback ready before deploy.

## 4-Agent Gate

Before implementation:

- Agent 1 QA/UAT: approve user flow and regression scope.
- Agent 2 Backend/API/Billing: approve auth gate and DB model.
- Agent 3 Security/Visual: approve KVKK/marketing separation and visual lock.
- Agent 4 Integrity Guard: approve deploy safety only after 2/3 from first three.

Before deploy:

- GitHub backup.
- Migration backup/rollback note.
- `npm test`.
- `npm run lint`.
- `npm run build`.
- `npm run scan:public`.
- `node scripts/scan-secrets.mjs`.
- Live smoke.
- Browser OTP UAT.

## Open Decision

Provider choice must be locked before coding:

- Recommended: official Meta WhatsApp Cloud API.
- Fallback: OpenWA only if official Meta template is not ready.

Without a real WhatsApp sending provider, we can build DB/API/UI in dry-run mode, but cannot mark production OTP as passed.
