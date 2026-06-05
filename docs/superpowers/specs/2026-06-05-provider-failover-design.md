# Provider Failover (per-profile, circuit-breaker) — Design Spec

- **Date:** 2026-06-05
- **Status:** Approved (design); **3/3 QA PASS** (2026-06-05, adversarial vs live code); findings incorporated below. Implementation pending. **No deploy in design session.**
- **Scope:** yzapi (`/opt/turkapiprojesi`, pkg `yapayzekalab`) — money-path hot path.
- **Goal (user intent):** Tüm Claude trafiği **wellflow** (primary) üzerinden gitsin; wellflow altyapı arızasında istek **popusk** (`closerouter` profili) üzerinden **otomatik** servis edilsin. Self-healing, kalıcı geçiş YOK.

---

## 1. Problem & current state

Per-model routing (`provider-config-service.ts → resolveProviderForModel`) bir modeli `supportedModelIds`'inde içeren ilk **enabled** profili seçer (sıralı, `id.localeCompare`), o profilin `ProviderContext`'iyle (baseUrl/apiKey/modelMap) forward eder. Hiçbir profile pinlenmemiş model → `active_provider_id` fallback.

**Boşluk:** `proxy.ts` her uçta `resolveProviderForModel`'i **bir kez** çağırır; `catch` blokları yalnız billing iade/error içindir. **İstek-bazlı çapraz-sağlayıcı failover YOKTUR.** Tek "failover" kaldıracı `failover_provider` auto-heal'ı yalnız `active_provider_id`'yi çevirir ve **pinli modeli kurtarmaz** (CLAUDE.md "bilinen kısıt"). Pinli model katalogdan (`supportedModelIds` UNION) türediği için "unpin edip active'e bırak" yaklaşımı modeli katalogdan düşürür.

→ Otomatik failover **kod değişikliği** gerektirir.

### Live capability (probe ile teyitli, 2026-06-05)

`GET {base}/models` (uygulamanın kendi decrypt yoluyla, salt-okunur):

| Provider | Profil | Claude ailesi |
|---|---|---|
| **wellflow** (`api.wellflow.dev/v1`) | `wellflow` | opus-4.6, opus-4.7, **opus-4.8**, sonnet-4.6, haiku-4.5 — **hepsi DOT form** |
| **popusk** (`api.claude-popusk.shop/v1`) | `closerouter` | aynı aile + dash form (opus-4-8 dahil) + GPT/o/Gemini |

**Sonuç:** Her iki sağlayıcı da tüm Claude ailesini veriyor. wellflow tek primary, popusk tam fallback olabilir.

### Current pinning (canlı DB)

- `wellflow.supportedModelIds` = `claude-opus-4-7, claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001`
- `closerouter.supportedModelIds` = GPT-5*/o3/o4/Gemini + `claude-opus-4.8`
- `system_api_config.active_provider_id` = `wellflow`; `enforce_model_allowlist=false`; `strict_canonical_model_ids=true`

---

## 2. Decisions (locked)

| Konu | Karar |
|---|---|
| Tetik koşulu | **Sadece altyapı**: connect/timeout/socket/DNS + HTTP **502/503/504**. 4xx ve {502,503,504} dışı 5xx → failover YOK. |
| Streaming | **Yalnız ilk-byte öncesi**. İstemciye byte yazıldıktan sonra (mid-stream) failover YOK; istemci kısmi cevabı alır, gerçek kullanım kadar ücretlenir. |
| Kapsam | **Genel per-profil** mekanizma. Şimdilik yalnız `wellflow.fallback=closerouter`. Tek yön. |
| Primary bütçesi | **~7s** "header'a kadar" süre (ilk-token'a değil → thinking modelleri tetiklemez). Aşılırsa failover. |
| Yapışkanlık | **Circuit-breaker** (yarı-yapışkan, self-healing). Kalıcı active-flip YOK. |
| Veri modeli | **A**: `provider_profiles.fallback_provider_id` (per-profil). (B sıralı-zincir / C global-secondary reddedildi.) |

---

## 3. Architecture (units)

Küçük, izole, bağımsız test edilebilir birimler:

### 3.1 Data model — `provider_profiles.fallback_provider_id`
- Migration **`0024_provider_fallback.sql`** (journal idx **24**): `ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS fallback_provider_id text;` (nullable, **soft ref — sert FK yok**). ⚠️ **QA1:** canlı en yüksek migration `0023_user_lang` (idx 23); `0019` zaten `0019_packages.sql`'e ait — yeni dosya **0024** olmalı yoksa `_journal.json` idx çakışır, `db:migrate` bozulur. Commit öncesi `meta/_journal.json`'dan gerçek son idx'i teyit et.
- `schema.ts`: `fallbackProviderId: text("fallback_provider_id")`. `meta/_journal.json` sıralı güncelleme (idx 24).
- Set-anında doğrulama (bkz 3.6): hedef var-olan **enabled** profil olmalı, **self değil**.

### 3.2 Resolution — `resolveProviderChainForModel(modelId)`
- `provider-config-service.ts`. Döner: `{ primary: ProviderContext, fallback: ProviderContext | null }`.
- `primary` = mevcut `resolveProviderForModel` mantığı (aynen).
- `fallback`: primary **pinli profilden** geldiyse (profileId≠null) ve o profilin `fallbackProviderId`'si set ise → o profili enabled profiller arasında çöz; fallback ctx = onun `baseUrl/apiKey/modelMap`'i.
  - **QA1:** fallback profili enabled OLMASININ yanı sıra `decryptApiKey` ile **çözülebilen anahtarı** olmalı — primary'deki `if (match && match.apiKey)` (`provider-config-service.ts:381`) kontrolünün birebir aynısı. Çözülemeyen cipher → `fallback=null` (boş `Bearer ` ile popusk'a gidip 401 almak failover-eligible DEĞİL; boşa istek/gecikme olur).
- **Kritik kurallar:**
  - Fallback, modelin fallback profilinin `supportedModelIds`'inde olmasını **ŞART KOŞMAZ** (pin baypas). Aksi halde popusk'a eski Claude'ları eklemek gerekir ve sıralama gereği (`closerouter` < `wellflow`) popusk primary'yi gasp eder.
  - **Tek-hop**: fallback'in kendi fallback'ine bakılmaz (döngü guard).
  - Unpinned (active/env) yol → `fallback=null`.
- `ParsedProfile`'a `fallbackProviderId` taşınır.
- `resolveProviderForModel` korunur → `resolveProviderChainForModel().primary` döndürür (eski çağıran/test kırılmaz).

### 3.3 Error taxonomy — `isFailoverEligible(errOrStatus)`
- ✅ Eligible: fetch network throw (TypeError), Abort/Timeout (bizim ~7s bütçe), undici `UND_ERR_CONNECT_TIMEOUT`, `ECONNREFUSED`, `ENOTFOUND`/DNS, socket hang up; HTTP **502/503/504** (pre-commit).
- ❌ Not eligible: tüm 4xx; {502,503,504} dışı 5xx; **ilk istemci byte'ından sonraki her hata**.
- Mevcut `categorizeError` (timeout/connection/http_error) yeniden kullanılır/genişletilir.

### 3.4 Circuit breaker — `services/provider-circuit-breaker.ts`
Saf, in-memory, I/O-suz durum makinesi. Anahtar = **primary profil id** (`'wellflow'`). API: `shouldTryPrimary(key)`, `recordReachable(key)`, `recordFailure(key)`, `getState(key)`.

Breaker **yalnız primary erişilebilirliğini** yansıtır — fallback denemelerinin sonucu breaker'ı ETKİLEMEZ (sayaçları yalnız closed/half-open'da primary'ye yapılan denemeler günceller).

| Durum | Davranış | Geçiş |
|---|---|---|
| **closed** | İstek önce primary (~7s bütçe) | art arda `THRESHOLD=3` eligible hata → **open** |
| **open** | Primary atlanır → doğrudan fallback (7s vergisi yok) | `openedAt + COOLDOWN=60s` → **half-open** |
| **half-open** | Tek "deneme" primary'ye (`halfOpenInFlight` guard); gerisi fallback'e | deneme erişilebilir → **closed** (reset); deneme eligible-hata → **open** (yeni cooldown) |

- Geçişler **erişilebilirlik** odaklı: `recordReachable` = primary **herhangi bir cevap** döndürdü (2xx **veya** eligible-olmayan 4xx/5xx — yani upstream ayakta) → sayaç sıfırlanır / breaker kapanır. `recordFailure` = **eligible altyapı hatası** (connect/timeout/502/503/504) → sayaç artar / açar.
- Bu sayede half-open'da bir 4xx (primary ayakta ama app hatası) breaker'ı **kapatır** (takılı kalmaz); yalnız gerçek altyapı hatası yeniden açar.
- **QA3 (stuck-state guard):** `halfOpenInFlight`, `shouldTryPrimary` kararıyla **aynı senkron tick'te** (ilk `await`'ten ÖNCE) set edilmeli ve deneme bitince **`finally`'de bırakılmalı**. Aksi halde fırlatan bir probe flag'i strand eder → breaker kalıcı half-open'a kilitlenir (gerçek stuck-state). Probe başarısızlığı `openedAt`'i sıfırlar (cooldown temiz başlar).
- **QA3 (kararlı durum):** sürekli bozuk primary (hep 502/503/504, hiç eligible-olmayan cevap yok) → breaker "open, cooldown başına 1 probe" durumuna oturur; **sonsuz stall YOK** (open doğrudan fallback'e gider, 7s vergisi yok).
- Zaman testte clock-seam/fake-timer ile enjekte edilir.

### 3.5 Execution wrapper — `services/provider-failover.ts → forwardWithFailover`
- İmza: `forwardWithFailover(chain, modelId, runForward) → { result, servedBy, failedOver }`, `runForward(ctx, signal) → result`.
- Akış:
  1. `chain.fallback` yoksa → `runForward(primary, normalSignal)` (**bugünkü davranış, sıfır değişiklik**).
  2. `shouldTryPrimary(primaryId)` false (breaker open) → doğrudan `runForward(fallback, normalSignal)`.
  3. Aksi halde `runForward(primary, budgetSignal(7s))`. `runForward` **commit noktasını** (ilk istemci byte) bildirir:
     - commit ÖNCESİ **eligible** hata → `recordFailure`; `runForward(fallback, normalSignal)`, `servedBy=fallback`.
     - başarı **veya** commit-öncesi eligible-olmayan cevap (ör. 4xx — primary ayakta) → `recordReachable`; sonucu aynen propagate, `servedBy=primary` (failover yok).
     - commit SONRASI hata → propagate (breaker'a dokunma; stream zaten başladı).
  4. Fallback de patlarsa → son hatayı döndür (ikisini de logla).
- **Streaming commit point:** yalnız **iki** gerçek stream fn'i var — `forwardChatStream` (chat) ve `forwardChatStreamAsResponses` (/responses). **QA1: `/messages` bugün her zaman non-streaming** (`forwardTextEndpoint`, `stream:false`) → kolay (non-streaming) failover vakası; "streaming /messages refactor" diye bir iş YOK. İki stream fn'inde: (a) upstream `fetch` budget-signal ile, (b) istemciye **yazmadan önce** `res.status` incele, (c) status ∈ {502,503,504} → pre-commit `UpstreamUnavailableError` fırlat, (d) yalnız status uygunsa pipe başlat (= commit).
  - **QA2 (en kırılgan invariant):** status kontrolü **ilk `res.write`/`flushHeaders`/SSE-preamble'dan ÖNCE** olmalı. İyi haber: mevcut kod zaten böyle — `closerouter-service.ts` `if (!upstream.ok)` throw'u ilk yazımdan önce; `forwardChatStreamAsResponses`'te `writeEvents(translator.start())` status throw'undan SONRA. Refactor bu sırayı **bozmamalı**; bir test "status kontrolünden önce 0 `res.write`" assert etmeli.
- Non-streaming (chat/text/responses JSON): tam upstream cevabı alınır; eligible status/throw → failover; aksi → return. (En basit vaka.)
- **QA3 (signal threading):** `fetchWithRuntimeTimeout` + 4 forward fn şu an dış signal almıyor (kendi AbortController'ı). Opsiyonel `signal`/`budgetMs` parametresi eklenir; **no-fallback yolunda `undefined` geçilir → bugünkü davranış birebir.** Bu parity-koruyan ama bir hot-path imza değişikliği (§3.5 step 1 "sıfır değişiklik" yalnız davranış için geçerli, imza için değil).
- **QA3 (bütçe ↔ connect-retry):** `fetchWithRuntimeTimeout` 3 denemeye kadar backoff'lu retry yapıp tükenince sentetik **503** atar (~22s sürebilir). Primary denemesi **tek-atış / wall-clock ~7s deadline** olmalı (iç multi-retry KAPALI) ki bütçe + breaker muhasebesi temiz olsun; 3-retry yalnız no-fallback/fallback bacaklarında kalır. Bütçe AbortController'ı **header gelir gelmez detach** edilir (180s post-commit idle-watchdog'dan ayrı; mid-stream'de sağlıklı stream'i öldürmemeli).

### 3.6 proxy.ts wiring
4 uç (chat / messages / responses / streaming):
```
const chain = await resolveProviderChainForModel(masterModel.id);
const { result, servedBy } = await forwardWithFailover(chain, masterModel.id,
    (ctx, signal) => <mevcut forward, ctx + signal ile>);
```
- `reserveUsageBudget` / `settleReservedUsage` sarmalayıcının **dışında** (bugünkü gibi, değişmez).
- `applyProfileModelMap(body, ctx.modelMap)` **her denemede yeniden** uygulanır (primary→fallback) → model fallback wire id'sine doğru çevrilir (opus-4.8: wellflow identity, popusk dot→dash).
- Görsel uçlar (501) kapsam dışı.

### 3.7 Admin / seed
- `upsertProviderProfile` → opsiyonel `fallbackProviderId`. Doğrulama: var-olan **enabled** profil; **self değil**.
- Panel "providers" bölümünde opsiyonel alan (ertelenebilir). Minimal: `scripts/set-provider-fallback.ts` veya onay-akışıyla UPDATE.

### 3.8 Config (sabit; sonra config-override edilebilir — YAGNI)
```
FAILOVER_PRIMARY_BUDGET_MS  = 7000
BREAKER_FAILURE_THRESHOLD   = 3
BREAKER_COOLDOWN_MS         = 60000
BREAKER_HALFOPEN_MAX_PROBES = 1
```
- Primary denemesi **tek-atış**, ~7s wall-clock deadline; iç connect-retry (`fetchWithRuntimeTimeout` 3-retry+503) yalnız no-fallback/fallback bacaklarında (bkz §3.5 QA3).

---

## 4. Billing safety (money-path, kritik)

- `reserveUsageBudget()` sarmalayıcıdan ÖNCE, bir kez (reqId başına). Değişmez.
- Pre-commit primary hatası **sıfır billable token** üretir → fallback denemesi → `settleReservedUsage()` fallback'in **gerçek** kullanımıyla. **Tek reserve, tek settle, tek reqId** → çift tahsil yok.
- Idempotency anahtarları (`usage_reserve_/release_/final_<reqId>`) değişmez.
- Her iki sağlayıcı da patlarsa: K1 yolu — **0 tahsil + tam iade**, `usage_records` status='error'.
- `resolveBilledPromptTokens` / `normalizeProviderUsage` token-sayısı mantığı **DOKUNULMAZ**.
- **QA2:** proxy refactor'ı `resolveBilledPromptTokens` çağrı sayısını **≥4** korumalı — `code_contracts` `proxy/billed-tokens-floor` verify'ı `<4 occurrence`'da **red** verir (billing-floor regresyon guard'ı).

---

## 5. Observability & non-leak

- Yapısal **server log**: failover olayları (primary→fallback, sebep kategorisi) + breaker geçişleri (primary profileId). **Yalnız internal.**
- Opsiyonel metrics-collector sayacı → Gözcü provider domain "breaker open"ı sinyal/page yapabilir (faz-2 dostu; çekirdek sadece log+sayaç).
- **Non-leak korunur:** hiçbir client cevabı/header/public API'de provider codename/base_url/failover detayı YOK. `X-YZ-Provider` header'ı **eklenmez**. `npm run scan:public` + `*-noleak` contract'ları yeşil kalmalı.

---

## 6. Testing (TDD + bağlayıcı 3-QA, ≥2 PASS)

- **Unit:** `isFailoverEligible` taksonomisi; breaker state machine (clock-seam: eşik açar, cooldown→half-open, half-open deneme-erişilebilir kapatır, half-open eligible-hata açar, half-open 4xx kapatır, 4xx breaker'ı tetiklemez, erişilebilir resetler, tek-probe eşzamanlılık); `resolveProviderChainForModel` (doğru fallback ctx, `supportedModelIds` pin baypas, tek-hop, fallback-yoksa-null); model_map re-map (opus-4.8 identity/dash).
- **Integration (gerçek PG + nock upstream):** 503→fallback servis (200); 400→failover yok; connect-timeout(bütçe)→failover; streaming pre-byte 503→failover **+ status kontrolünden önce 0 `res.write` (assert)**, mid-stream drop→failover YOK; **billing: tek reserve+tek settle, çift tahsil yok**, ikisi de patlarsa 0 tahsil+tam iade + sahipsiz hold YOK (reaper teyit); breaker 3 hata→primary atlanır (upstream primary'ye gitmez), cooldown→half-open→recover; iki eşzamanlı half-open isteği → tam 1 probe primary'ye.
- **Contract:** provider non-leak + 42-lock yeşil.
- **Smoke (canlı, deploy sonrası):** normal Claude çağrısı wellflow'dan 200.

---

## 7. Rollout (kod gönderildikten SONRA; her adım çift-onay + deploy-guard + 3-QA)

1. **Kod deploy** — migration nullable kolon ekler; `fallback_provider_id` set edilene kadar **davranış değişmez** (inert, güvenli).
2. `wellflow.fallback_provider_id='closerouter'` → wellflow-Claude'ları failover kazanır.
3. opus-4.8 → wellflow primary: `wellflow.supportedModelIds`'e ekle, `closerouter.supportedModelIds`'ten çıkar (wellflow servis ettiği teyitli) → **TÜM Claude → wellflow primary + popusk fallback**.
   - ⚠️ **QA1:** `closerouter.model_map`'teki `claude-opus-4.8 → claude-opus-4-8` entry'si **KALMALI** (silme!). Failover'da popusk'a dash-wire için gerekli; popusk dot formu (`claude-opus-4.8`) servis etmiyor → entry silinirse opus-4.8 failover yolu sessizce kırılır (contract testi bunu korumuyor).

Her adım geri-alınabilir (kolonu temizle / id'yi geri taşı). **Bu oturumda deploy YOK — yalnız planlama.**

---

## 8. Out of scope / future

- Çift yönlü failover (popusk→wellflow), sıralı çok-hop zincir.
- closerouter (GPT/o/Gemini) için fallback hedefi (şu an uygun hedef yok).
- Görsel/video uçları (501).
- Breaker knob'larının DB/config'e taşınması; Gözcü page entegrasyonunun tam kapsamı.
