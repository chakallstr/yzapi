# WhatsApp OTP Implementation Report

## Scope

Implemented Google-afterflow WhatsApp OTP for YapayZekaLab without changing the existing site template, theme tokens, color palette or layout system.

## What Changed

- Added durable OTP tables:
  - `whatsapp_otp_requests`
  - `whatsapp_verified_numbers`
- Added OpenWA-backed OTP service adapter with:
  - Turkish E.164 normalization
  - HMAC phone hash
  - HMAC OTP hash
  - expiry, attempt count and resend limits
  - atomic consume for successful OTP verification
  - no hard-delete lifecycle; phone records use `active`, `inactive`, `account_closed`, `blocked`
- Added Google OAuth pending-token flow:
  - if WhatsApp OTP is enabled and the user has no active verified number, the Google callback redirects with a short-lived pending token instead of normal access/refresh tokens.
  - OTP verify issues the normal access/refresh tokens.
- Added protected-route gate when `WHATSAPP_OTP_ENABLED=true`:
  - `/api/user/*`
  - protected `/api/admin/*`
  - user payment init/history routes
  - `/v1` API-key gateway routes
- Added current-theme frontend OTP screen:
  - phone input
  - 6-digit code input
  - resend action
  - optional WhatsApp marketing consent
- Added log redaction for phone, OTP, code and provider message id fields.

## Provider Status

- Provider selected: OpenWA.
- Production feature flag default: `WHATSAPP_OTP_ENABLED=false`.
- Reason: live users should not be locked out before OpenWA credentials and the DB migration are applied.
- Required production env:
  - `WHATSAPP_OTP_ENABLED=true`
  - `WHATSAPP_OTP_PROVIDER=openwa`
  - `WHATSAPP_OTP_HASH_SECRET`
  - `OPENWA_API_URL`
  - `OPENWA_API_KEY`
  - `OPENWA_SESSION_ID`

## Verification

- Targeted OTP tests: passed.
- Full test suite: passed.
- Typecheck: passed.
- Production build: passed.
- Public bundle scan: passed, no OpenWA secret hits.
- Secret scan: passed, no hits.

## Remaining Deploy Requirements

- Apply migration `0008_whatsapp_otp.sql` on VPS.
- Configure server-only OpenWA env values.
- Run a live OTP send to a test number.
- Verify Google login pending-token redirect, OTP verify, `/api/user/me` allowed after OTP and blocked before OTP.
- Keep `WHATSAPP_OTP_ENABLED=false` until the live OpenWA send path is verified.
