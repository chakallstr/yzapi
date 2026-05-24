# Proxy and Auth API Integration Spec

**Audience:** Node.js/TypeScript engineer implementing an OpenAI-compatible proxy and Google OAuth login for yzapi.  
**Last updated:** 2026-05-24  
**Sources:** [closerouter.dev/docs](https://closerouter.dev/docs), [Google OAuth 2.0 Web Server docs](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OpenID Connect docs](https://developers.google.com/identity/openid-connect/openid-connect), live API probes.

---

## Part 1 — CloseRouter API

### 1.1 URLs

| Item | Value |
|---|---|
| Canonical domain | `closerouter.dev` (closerouter.com redirects to it; closerouter.ai does not resolve) |
| API base URL | `https://api.closerouter.dev/v1` |
| Dashboard | `https://closerouter.dev` (login/account — exact path for settings TBD; see note below) |
| Docs | `https://closerouter.dev/docs` |

> Note: The `/signup` path returns 404 — account registration flow may be embedded in the home page SPA. **TBD: confirm registration URL with CloseRouter** (ask via their site or contact form).

---

### 1.2 Authentication

All authenticated endpoints require a Bearer token in the `Authorization` header:

```http
Authorization: Bearer closerouter_your_key
```

The key prefix is `closerouter_`. An unauthenticated request to `/v1/models` returns:

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "Authorization Bearer or x-api-key authentication is required",
    "status": 401,
    "metadata": { "request_id": "cb92cb36-..." }
  }
}
```

**Obtaining a key:**  
Keys are created via the CloseRouter dashboard or programmatically via `POST /v1/keys`. The API also supports anonymous keys with spend limits (same endpoint, pass a spend limit body). **TBD: whether email signup is required or keys can be provisioned without an account.**

```typescript
// Key management endpoints (all require auth)
// POST   /v1/keys               — create a new key (including anonymous keys with spend_limit)
// GET    /v1/keys               — list active keys (raw key values not returned)
// PATCH  /v1/keys/{key_id}/limit — set or clear spend limit
// DELETE /v1/keys/{key_id}      — revoke immediately
```

> There is no documented unauthenticated catalog endpoint. The project's `model.md` references `https://closerouter.dev/v1/public/models`, but that path returns `404 not_found` — it was removed or was never live. The current catalog endpoint `GET /v1/models` requires authentication.

---

### 1.3 Model Catalog — `GET /v1/models`

```
GET https://api.closerouter.dev/v1/models
Authorization: Bearer <key>
```

Response schema (inferred from docs + project's `master-models.ts` which was built from this endpoint):

```jsonc
{
  "data": [
    {
      "id": "openai/gpt-5.4-mini",          // format: "provider/model-name"
      "provider": "openai",                  // logical provider string
      "input_modalities": ["text"],          // or ["text", "image"], ["text", "audio"]
      "output_modalities": ["text"],         // or ["image"], ["video"]
      "endpoints": ["chat", "responses"],    // which inference endpoints accept this model
      "context_length": 400000,
      "max_output_tokens": 128000,
      "pricing": {
        "input_per_million_tokens": 0.10,    // USD, text models
        "output_per_million_tokens": 0.10,
        "image_input_per_image": 0.8,        // USD, image models
        "image_output_per_image": 1.5,
        "video_per_second": 0.030            // USD, video models
      },
      "supports_streaming": true
    }
    // ...
  ]
}
```

**Alignment with `master-models.ts`:** The 32 model IDs in `MASTER_MODELS` match the CloseRouter catalog exactly (verified via the `model.md` snapshot dated 2026-05-23). Fields `providerInputUsd`/`providerOutputUsd` map to `pricing.input_per_million_tokens` / `pricing.output_per_million_tokens`. Fields `providerImageInputUsd`/`providerImageOutputUsd` map to `pricing.image_input_per_image` / `pricing.image_output_per_image`. Field `providerPerSecond` maps to `pricing.video_per_second`.

**Per-model endpoints detail:**

```
GET https://api.closerouter.dev/v1/models/{provider}/{model}/endpoints
Authorization: Bearer <key>
```

Returns per-model parameter support and `supports_streaming: true/false`. Check this before forwarding `stream: true`.

---

### 1.4 Chat Completions — `POST /v1/chat/completions`

OpenAI-compatible. The `baseURL` to point the OpenAI SDK at is `https://api.closerouter.dev/v1`.

**Minimal request:**

```jsonc
{
  "model": "anthropic/claude-haiku-4.5",   // required; format provider/model
  "messages": [
    { "role": "system", "content": "You are helpful." },
    { "role": "user",   "content": "Hello" }
  ],
  "max_tokens": 512,         // optional
  "temperature": 0.7,        // optional
  "stream": false            // optional; default false
}
```

You may also pass `"models": ["model-a", "model-b"]` (array) instead of `"model"` for fallback routing — CloseRouter picks the first available.

The `"user"` field is accepted for internal end-user identification.

**Non-streaming response (OpenAI-compatible):**

```jsonc
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1716000000,
  "model": "anthropic/claude-haiku-4.5",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Hello! How can I help?" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 14,
    "completion_tokens": 9,
    "total_tokens": 23
  }
}
```

**Streaming response (SSE):**  
Set `"stream": true`. Only valid for models where `supports_streaming: true` (check `/models/{provider}/{model}/endpoints` first).

```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

Format: standard SSE. Each line is `data: <json>`. Terminal marker is `data: [DONE]` (no JSON). Chunks carry `choices[0].delta.content` for text deltas.

**OpenAI SDK usage (TypeScript):**

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.CLOSEROUTER_API_KEY,
  baseURL: 'https://api.closerouter.dev/v1',
});

const completion = await client.chat.completions.create({
  model: 'openai/gpt-5.4-mini',
  messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
  max_tokens: 16,
});

console.log(completion.choices[0]?.message?.content);
```

**Streaming proxy backpressure note:**  
When pass-through streaming to a browser client, pipe the upstream `response.body` (a `ReadableStream`) directly to the outgoing `Response`. Do not buffer. In Node.js/Hono/Express: `res.setHeader('Content-Type', 'text/event-stream')` then `pipeline(upstreamBody, res)`. Backpressure is handled automatically by Node.js stream piping; no special handling is needed beyond not buffering the full response before forwarding.

---

### 1.4b Responses and Messages Proxy

YapayZekaLab backend exposes CloseRouter text endpoints through the same customer API-key and TL-billing layer:

```http
POST /v1/responses
Authorization: Bearer yzk_live_...
```

```http
POST /v1/messages
Authorization: Bearer yzk_live_...
```

Both endpoints:

- require a model whose catalog `endpoints` includes `responses` or `messages`;
- reject admin-disabled models before forwarding upstream;
- require positive TL balance before forwarding upstream;
- bill from returned `usage.input_tokens/output_tokens` or `usage.prompt_tokens/completion_tokens`;
- return `X-YZ-Request-Id`, `X-YZ-Cost-TL`, and `X-YZ-Remaining-TL` on successful non-streaming calls.

### 1.5 Image Generation

#### `POST /v1/images/generations`

```jsonc
{
  "model": "openai/gpt-image-2",   // must have "images_generations" in its endpoints list
  "prompt": "A futuristic API dashboard, clean product shot",
  // optional fields (model-dependent):
  "n": 1,
  "size": "1024x1024",
  "quality": "standard"
}
```

**Response (inferred — OpenAI-compatible shape):**

```jsonc
{
  "created": 1716000000,
  "data": [
    { "url": "https://..." }        // or "b64_json" depending on response_format
  ],
  "usage": {
    // TBD: exact billing fields not documented publicly.
    // Billing is per-image, priced as image_input + image_output USD (see pricing table).
    // No token-based usage field for image models.
  }
}
```

> **TBD:** The exact `usage` object shape for image responses is not in the public docs. The project prices image models using `providerImageInputUsd` + `providerImageOutputUsd` per image — confirm whether the response includes an explicit usage field or if billing must be inferred from the request parameters (n, size, quality).

#### `POST /v1/images/edits`

Two accepted formats:
- `application/json` with `"images"` field containing JSON references to previously generated images
- `multipart/form-data` with `image[]` file uploads

The model must have `"images_edits"` in its endpoints list (e.g., `openai/gpt-image-2-edit`, `google/nano-banana-2-edit`).

```jsonc
// JSON reference form
{
  "model": "openai/gpt-image-2-edit",
  "images": ["<image_id_or_url>"],
  "prompt": "Add a dark background"
}
```

---

### 1.6 Video (Async) — Submit + Poll

Video generation is fully asynchronous. The flow is: submit task → receive task ID → poll until complete → retrieve output URL.

#### Step 1 — Submit: `POST /v1/videos/submit`

```jsonc
{
  "model": "google/veo-3.1",       // must have "videos_submit" in endpoints
  "prompt": "A clean product shot of a futuristic API dashboard",
  "duration": 5,                   // seconds
  "aspect_ratio": "16:9"
  // other model-specific params (e.g. "resolution" for Seedance) — TBD per model
}
```

**Response:**

```jsonc
{
  "task_id": "task_abc123..."
  // no output yet
}
```

#### Step 2 — Poll: `GET /v1/videos/tasks/{task_id}`

```
GET https://api.closerouter.dev/v1/videos/tasks/{task_id}
Authorization: Bearer <key>
```

**Response:**

```jsonc
{
  "task_id": "task_abc123...",
  "status": "pending",             // states: "pending" | "processing" | "completed" | "failed"
  "outputs": null,                 // null until completed
  "error": null,
  "duration_seconds": null         // wall-clock generation time, null until completed
}
```

**Completed state:**

```jsonc
{
  "task_id": "task_abc123...",
  "status": "completed",
  "outputs": {
    "video_url": "https://..."     // TBD: exact field name; confirm "video_url" vs "url"
  },
  "error": null,
  "duration_seconds": 47.2
}
```

**Recommended polling pattern (TypeScript):**

```typescript
async function pollVideoTask(taskId: string, apiKey: string): Promise<string> {
  const url = `https://api.closerouter.dev/v1/videos/tasks/${taskId}`;
  const headers = { Authorization: `Bearer ${apiKey}` };

  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await fetch(url, { headers });
    const body = await res.json();

    if (body.status === 'completed') return body.outputs.video_url;
    if (body.status === 'failed') throw new Error(body.error ?? 'Video generation failed');

    // Back-off: 5 s for first 12 polls (1 min), then 15 s
    await new Promise(r => setTimeout(r, attempt < 12 ? 5000 : 15000));
  }
  throw new Error('Video task timed out after ~12 minutes');
}
```

**Webhook support:** Not documented. CloseRouter does not appear to offer push notifications for completed video tasks. **Polling is the required pattern.** TBD: confirm with CloseRouter whether a webhook field exists in `POST /v1/videos/submit`.

---

### 1.7 Rate Limits

Not explicitly documented in the public docs. Observed: `429 rate_limited` is returned when the per-key request rate is temporarily exhausted.

**TBD:** Exact numeric limits (requests/minute, concurrent, monthly quota) are not published. Ask CloseRouter support or test empirically. Treat all `429` responses with exponential back-off starting at 1 second.

---

### 1.8 Error Model

All errors share the same envelope:

```jsonc
{
  "error": {
    "code": "<error_code>",
    "message": "Human-readable description",
    "status": 400,
    "metadata": {
      "request_id": "cb92cb36-..."    // include in support requests
    }
  }
}
```

| HTTP Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_request` | Malformed JSON, missing `model`, unsupported parameter |
| 401 | `invalid_api_key` | Missing or invalid Bearer token |
| 402 | `insufficient_balance` | CloseRouter account balance exhausted |
| 429 | `rate_limited` | Request rate temporarily exceeded |
| 503 | `no_available_provider` | No upstream route available for this model+endpoint combination right now |

**Content-moderation block:** Not listed as a distinct error code in current docs. **TBD:** May surface as `invalid_request` (400) or a provider-specific code passed through. Confirm with CloseRouter.

**Model down / invalid model ID:**  
- Invalid model ID → `400 invalid_request` ("unsupported parameter" or similar)  
- Model temporarily unavailable → `503 no_available_provider`

**Implementation note:** On 402, surface a payment-required error to the user. On 503, retry once after a short delay; if still failing, report "model unavailable" to the user. Log `request_id` from `error.metadata` for all non-200 responses.

---

### 1.9 Streaming Proxy Considerations

When yzapi transparently forwards a streaming response from CloseRouter to the end user:

1. **Do not buffer** — forward chunks as they arrive. Any buffering introduces latency visible to the user.
2. **Content-Type header** — set `Content-Type: text/event-stream` and `Cache-Control: no-cache` before streaming begins.
3. **Connection management** — set `Connection: keep-alive` (HTTP/1.1) or use HTTP/2 (multiplexed by default).
4. **Abort handling** — if the client disconnects, abort the upstream fetch request to prevent wasting CloseRouter credits. In Node.js: `req.on('close', () => controller.abort())`.
5. **Error mid-stream** — if CloseRouter sends an error JSON after headers are already sent (unusual but possible), forward the raw SSE chunk; yzapi cannot change the HTTP status code at that point.
6. **`[DONE]` marker** — forward as-is. Do not attempt to parse it as JSON.

---

## Part 2 — Google OAuth 2.0 (Web Server Flow)

The goal: redirect user to Google, receive a `code`, exchange for an `id_token`, extract profile, issue yzapi's own JWT. Google access is not stored.

---

### 2.1 Authorization URL

```
GET https://accounts.google.com/o/oauth2/v2/auth
```

**Required and recommended query parameters:**

| Parameter | Value | Notes |
|---|---|---|
| `client_id` | `<your_client_id>.apps.googleusercontent.com` | From Google Cloud Console |
| `redirect_uri` | `https://yourdomain.com/auth/google/callback` | Must exactly match a registered URI (scheme + host + path + trailing slash all matter) |
| `response_type` | `code` | Authorization code flow |
| `scope` | `openid email profile` | Space-delimited. All three are basic/non-sensitive — no verification required |
| `state` | `<random_opaque_token>` | Required for CSRF protection. Generate with `crypto.randomBytes(32).toString('hex')`, store in a short-lived server-side store (Redis TTL 10 min), verify on callback |
| `nonce` | `<random_value>` | Required by OpenID Connect spec for ID token replay protection |
| `access_type` | `online` | Use `online` — we do not need a refresh token since we issue our own JWT after first login. Set to `offline` only if you need long-lived Google API access (you don't here) |
| `prompt` | omit (or `select_account`) | Omit for silent re-auth. Set `prompt=consent` only if you need to force the consent screen (e.g., re-requesting scopes). Set `prompt=select_account` to always show account picker |

**Full example URL (TypeScript):**

```typescript
import crypto from 'crypto';

function buildGoogleAuthUrl(clientId: string, redirectUri: string): { url: string; state: string; nonce: string } {
  const state = crypto.randomBytes(32).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    access_type: 'online',
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    state,
    nonce,
  };
}
```

---

### 2.2 Token Exchange

After Google redirects back with `?code=<code>&state=<state>`:

1. Verify `state` matches what was stored server-side (CSRF check).
2. Exchange `code` for tokens.

```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded
```

**Body fields:**

| Field | Value |
|---|---|
| `code` | The authorization code from the query string |
| `client_id` | Your OAuth client ID |
| `client_secret` | Your OAuth client secret (keep server-side only) |
| `redirect_uri` | Same URI used in step 2.1 (must match exactly) |
| `grant_type` | `authorization_code` |

**Response (200):**

```jsonc
{
  "access_token": "ya29.a0...",
  "expires_in": 3599,
  "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",   // signed JWT
  "token_type": "Bearer",
  "scope": "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
  // "refresh_token" only present if access_type=offline AND this is the first authorization
}
```

**TypeScript:**

```typescript
async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ access_token: string; id_token: string; expires_in: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}
```

---

### 2.3 ID Token Verification (Recommended path)

The `id_token` is a signed RS256 JWT. You must verify it before trusting its claims.

**Verification steps (per Google spec):**

1. Fetch Google's public JWKS from `https://www.googleapis.com/oauth2/v3/certs` (cache with `max-age` from the `Cache-Control` response header — typically ~6 hours; do not fetch on every request).
2. Verify the JWT signature using the matching key (`kid` in JWT header).
3. Verify `iss` is `"https://accounts.google.com"` or `"accounts.google.com"`.
4. Verify `aud` equals your `client_id`.
5. Verify `exp` > `Date.now() / 1000`.
6. Verify `nonce` matches the nonce you stored before the auth redirect.

**Recommended library: `jose`** (JOSE standard, zero-dependency, actively maintained, works in Node.js and edge runtimes).

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  given_name?: string;
  family_name?: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
}

async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  expectedNonce: string,
): Promise<GoogleIdTokenClaims> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: 'https://accounts.google.com',
    audience: clientId,
  });

  if (payload['nonce'] !== expectedNonce) {
    throw new Error('Nonce mismatch — possible replay attack');
  }

  return payload as unknown as GoogleIdTokenClaims;
}
```

`jose` handles JWKS caching internally. The `jwtVerify` call validates signature, `iss`, `aud`, and `exp` in one step.

---

### 2.4 Profile via UserInfo (Alternative path)

Instead of decoding the `id_token`, you can call the userinfo endpoint with the `access_token`:

```
GET https://openidconnect.googleapis.com/v1/userinfo
Authorization: Bearer <access_token>
```

**Response:**

```jsonc
{
  "sub": "110169484474386276334",     // stable Google user ID — use this as your internal user key
  "email": "user@example.com",
  "email_verified": true,
  "name": "Jane Doe",
  "given_name": "Jane",
  "family_name": "Doe",
  "picture": "https://lh3.googleusercontent.com/a/..."
}
```

**Recommendation:** Prefer `id_token` verification (2.3) over the userinfo endpoint for production. The id_token is issued in the same token exchange response and does not require an additional network round-trip. Use the userinfo endpoint only if you cannot use a JOSE library (e.g., constrained edge runtime).

---

### 2.5 Google Cloud Console Setup

Steps to create OAuth credentials:

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (or select an existing one).
3. Navigate to **APIs & Services > OAuth consent screen**.
4. Set **User Type** to **External** (for public apps) or **Internal** (Google Workspace only).
5. Fill in: App name, support email, developer contact email. Click **Save and Continue**.
6. On the **Scopes** step, do not add any scopes here — the scopes `openid`, `email`, and `profile` are automatically included as non-sensitive ("basic") scopes and do not need to be manually added. Click **Save and Continue**.
7. Add test users if in testing mode. Click **Save and Continue**.
8. Navigate to **APIs & Services > Credentials** (or directly to [console.developers.google.com/auth/clients](https://console.developers.google.com/auth/clients)).
9. Click **Create Credentials > OAuth Client ID**.
10. Select **Web application**.
11. Set **Authorized JavaScript origins**: `https://yourdomain.com` (and `http://localhost:3000` for local dev).
12. Set **Authorized redirect URIs**: `https://yourdomain.com/auth/google/callback` (and `http://localhost:3000/auth/google/callback` for local dev). These must exactly match what you pass as `redirect_uri` — scheme, host, path, and trailing slash.
13. Click **Create**. Download or copy the `client_id` and `client_secret`.

> Note (2025+): Google Cloud Console was reorganized in late 2024. The "Credentials" page was merged into a single "Clients" page under APIs & Services. If you see a **Clients** page instead of separate Credentials/OAuth pages, that is the same thing.

---

### 2.6 Consent Screen Verification

`openid`, `email`, and `profile` are **non-sensitive scopes** (Google classifies them as "basic"). Apps using only these three scopes do **not** require Google's OAuth verification process. You can publish the app and it works for all users without submitting for verification.

Verification is only required for apps requesting sensitive scopes (e.g., Gmail, Calendar data) or restricted scopes (e.g., raw Google Drive access).

**What "Testing" publishing status means:** While the app is in **Testing** mode, only users explicitly added as test users can log in (up to 100 users). To allow any Google account to log in, change publishing status from **Testing** to **In production** — this is safe for basic scopes and requires no review.

---

### 2.7 Library Recommendations

| Library | Approach | Pros | Cons |
|---|---|---|---|
| `jose` (npm) | Manual flow + JWT verify | Zero deps, edge-compatible, actively maintained, fine-grained control | You wire the redirect + token exchange yourself |
| `google-auth-library` | Google's official library | Official, handles JWKS caching, `OAuth2Client.verifyIdToken()` method | Node.js-only (not edge-compatible), heavier dep tree |
| `openid-client` (now `oidc-client-ts`) | Full OIDC client | Standards-compliant, handles discovery, session management | Complex for simple use case; heavier |
| `arctic` (npm) | OAuth2 provider toolkit | Minimal, framework-agnostic, good TS types | Does not verify id_token — you still need `jose` for that step |
| Roll-your-own with `jose` | Manual | Minimal deps, full control | More code to write and maintain |

**Recommendation for yzapi's use case** (no persistent Google session, issue our own JWT after first auth):

Use **`jose`** alone. It handles JWKS fetch + caching + RS256 verification. Wire the redirect URL construction and token exchange yourself with `fetch` — both are simple HTTP calls (see 2.1 and 2.2). This keeps the dependency surface minimal and works in any Node.js runtime.

If you want to reduce boilerplate: add **`arctic`** for building the authorization URL and exchanging the code, then still use **`jose`** to verify the `id_token`. Arctic does not pull in Google's SDK.

```
npm install jose
# or
npm install jose arctic
```

---

### 2.8 CORS Considerations

The OAuth callback (`GET /auth/google/callback`) is a **server-side redirect**, not a cross-origin XHR. No CORS headers are needed on the callback endpoint itself.

However:
- The frontend must redirect the browser (full navigation) to the Google auth URL — not `fetch()` it. `fetch()` cannot follow CORS-blocked redirects to Google.
- If yzapi exposes a `/auth/google` endpoint that returns a `Location: <google-url>` redirect, the frontend should `window.location.href = <url>` or `<a href>` link, not fetch.
- The `redirect_uri` must be a server-side endpoint that processes the code, not a client-side SPA route (Google sends a GET with the code, which your server must handle).

---

### 2.9 Error Handling

**User denies consent (clicks "Cancel" on Google screen):**  
Google redirects to `redirect_uri?error=access_denied&state=<state>`. Handle by checking for `error` in query params before processing `code`. Return a 400/redirect to the frontend login page.

**Email not verified:**  
Google always returns `email_verified: true` for standard Gmail accounts. For Google Workspace accounts or older accounts, `email_verified` can be `false`. **Enforce:** if `email_verified !== true`, reject the login and return an error — do not create an account for an unverified email.

**State mismatch:**  
If the `state` param on callback does not match what was stored server-side, abort immediately — likely a CSRF or replay attack.

**Token exchange failure:**  
`code` can only be used once. If the exchange returns 400 (`invalid_grant`), the code was already used or expired (codes expire in ~10 minutes). Return a "Login expired, please try again" error to the user.

---

### 2.10 Production Checklist

- [ ] **HTTPS required** — `redirect_uri` must use `https://` in production (Google enforces this; `http://localhost` is exempt).
- [ ] **`client_secret` server-side only** — never expose in client-side JavaScript or a public bundle.
- [ ] **`state` CSRF protection** — generate per-request, store server-side (Redis or encrypted cookie), verify on callback, delete after use.
- [ ] **`nonce` in id_token** — include in auth request and verify in id_token claims (protects against replay).
- [ ] **JWKS caching** — `jose`'s `createRemoteJWKSet` caches automatically. Do not call `fetchJWKS` on every request.
- [ ] **`email_verified` check** — enforce before creating/updating user record.
- [ ] **Short code TTL** — process the callback immediately; `code` expires in ~10 minutes.
- [ ] **Consent screen published** — change from "Testing" to "In production" for non-test users.
- [ ] **Authorized redirect URIs** — add both prod and staging URIs in Google Console before deploying.
- [ ] **`SameSite=Lax` on state cookie** (if using cookie storage) — prevents CSRF on the callback GET.
- [ ] **CSP header** — if serving the auth redirect page from yzapi, allow `frame-ancestors 'none'` to prevent clickjacking.
- [ ] **People API** — `openid email profile` scopes do **not** require enabling the People API. The userinfo endpoint is part of the standard OAuth2 service which is always enabled.

---

## Open Questions (TBD)

| # | Question | Who to ask |
|---|---|---|
| 1 | What is the exact registration/signup URL at closerouter.dev? | CloseRouter support |
| 2 | Is a CloseRouter account required to generate a key, or can anonymous keys be provisioned without login? | CloseRouter support |
| 3 | What are the numeric rate limits (req/min, concurrent, monthly)? | CloseRouter support |
| 4 | Does `GET /v1/models` return a `usage` field in image responses? What are the exact field names? | Test with a real key |
| 5 | What is the exact `outputs` field name in completed video task response (`video_url`? `url`? `urls[]`?) | Test with a real key |
| 6 | Does CloseRouter support webhooks for video task completion, or is polling the only option? | CloseRouter support |
| 7 | Does CloseRouter return a distinct error code for content-moderation blocks? | CloseRouter support |
| 8 | What headers does CloseRouter set on 429 responses — `Retry-After`? `X-RateLimit-Reset`? | Test with a real key |
