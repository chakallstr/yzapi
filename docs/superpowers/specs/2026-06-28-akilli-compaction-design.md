# Akıllı Compaction — Tasarım (Smart Context Compaction)

**Tarih:** 2026-06-28
**Durum:** TÜMÜ onaylandı (Ufuk: "hepsini yap" — B dahil, kalite riski bilinerek; sahip kararı önerimi geçer). Kapsam 5 bileşene genişledi: +D Retry-After storm-söndürücü, +E oversized-request seat-spread.
**Kapsam:** yzapi (`yapayzekalab`), yalnız **codex paketleri** (gpt-5.5 / gpt-5.4, seat-served)

## 1. Problem

Ağır-bağlam Codex müşterileri (ör. `yokumbennapacan`, `onurdgnn06`) tek istekte **~260K+ input birim** (hatta 15MB'a kadar gövde) yolluyor. Paylaşımlı 2-koltuklu `sub-codex` havuzunda, session-affinity müşteriyi **tek koltuğa** pinler; dev istek + Codex Desktop'ın retry-storm'u o OpenAI hesabının **dakikalık (RPM/TPM) oranını** aşar → `upstream_429`. Koltuk **kotası** boldur (5h/7d %0–16) — sorun kapasite değil, **istek başına boyut + dakikalık burst**. CF/popusk fallback'leri ya yok (seat-only entitlement, `cf_api_slug=NULL`) ya da tükenmiş (popusk PAYG 429) → müşteri sert 429 alır.

**Kök çözüm yönü:** İsteği seat'e göndermeden önce **küçült** → dakikalık oran aşılmaz, retry-storm tetiklenmez, 2 koltuk gerçekten yeter. Bkz. `project_yzapi_codex_lazy_fallback_dead_wallet_empty`, `project_yzapi_codex_seat_429_spof_tpm_cap`.

## 2. Hedef ve Hedef-Dışı

**Hedef:** Codex isteklerini, doğru kod üretimini bozmadan, seat'e gitmeden önce güvenli biçimde küçülten 3 katmanlı bir compaction boru hattı. Inert deploy + paket bazında açılabilir + kill-switch.

**Hedef-dışı (YAGNI):**
- Codex dışı modelleri/paketleri compact etmek (Claude/Gemini akışları dokunulmaz).
- Müşterinin istemcisini (Codex Desktop) değiştirmek — yalnız sunucu tarafı + standart sinyal.
- Token Saver'ı yeniden yazmak — üstüne ekliyoruz.
- Genel "konuşma hafızası" ürünü — yalnız tek-istek boyut küçültme.

## 3. Mimari — 3 Katmanlı Boru Hattı

**Enjeksiyon noktası:** `closerouter-service.ts`, her forward fonksiyonunda (`forwardChat`, `forwardChatStream`, `forwardMessages`, `forwardChatStreamAsResponses`) `maybeCompressToolOutputs(...)` çağrısının hemen ardından, `JSON.stringify(providerBody)`'den **önce**. (Mevcut gövde-mutasyon deseni: kopyala → dönüştür → stringify.)

**Kapı (gate):** Yalnız `billedViaPackage && codex` (masterModel.id `gpt-5.`/`gpt-5-codex` ailesi **ve** entitlement codex paketi). Diğer her şey **byte-identical** geçer. Tümü `SMART_COMPACTION_ENABLED` kill-switch + katman-başı toggle arkasında. **Never-throw:** herhangi bir katman hata/timeout → o katman atlanır, istek olduğu gibi devam (asla bozulmaz).

İstek başına, gövde `messages[]` üzerinde sırayla (Codex `/responses` `input[]` zaten `messages[]`'e çevriliyor, ortak yol):

```
incoming body ──► [C: güvenli kırpma] ──► [B: özetleme (eşik aşılırsa)] ──► [A: sert tavan (hâlâ devse)] ──► seat
                       always               soft threshold                    hard ceiling → nudge
```

### Katman C — Güvenli/kayıpsıza-yakın kırpma (her zaman)
**Temel:** mevcut `token-saver.ts` (`maybeCompressToolOutputs`) — şu an **KAPALI** (`tokenSaverEnabled`), yalnız tool-output kırpıyor.
**Aksiyon:**
1. Codex paketlerinde Token Saver'ı **aç** (runtime config).
2. Genişlet: aynı içerikli **tekrarlanan dosya/araç bloklarını tekille** (Codex her turda aynı dosyaları tekrar yolluyor — en büyük "ücretsiz" kazanım), ANSI/aşırı boş satır temizliği (zaten var), baş/son koruyarak dev tool-çıktısı katlama (zaten var, eşik ayarlanır).
**Risk:** ~0 (gerçek bağlamı özetlemez; çöp/tekrar atar). Çoğu vakada tek başına yeterli olabilir.

### Katman B — Otomatik özetleme (yumuşak eşik aşılırsa) — **asıl yeni iş**
C'den sonra tahmini bağlam (char/4 ×`CONTEXT_GUARD_ESTIMATE_INFLATION`=8 şişmiş birim) **yumuşak eşiği** aşarsa eski geçmişi özetle. **Tüm B-riski burada → muhafazakâr koruma kuralları:**
- **Son K turu AYNEN bırak** (varsayılan K, config) — Codex'in aktif çalıştığı bağlam.
- **Dosya içerikleri / kod blokları / son tool sonuçları AYNEN** — asla özetlenmez (kodlama ajanı tam koda muhtaç).
- Yalnız **eski sohbet düzyazısı** (pencere dışı user/assistant prose turları) tek bir **"[Önceki konuşmanın özeti] …"** notuna indirilir, kronolojik sırada yerine konur.
- **Özetleyici = ayrı UCUZ model** (DB-config `smart_compaction_summarizer_model` + provider). **Codex seat'lerini KULLANMAZ** (yoksa darboğaza yük binip ters etki). Sıkı timeout + never-throw. ⚠️ Operasyonel: sağlıklı/ucuz bir provider'a işaret etmeli (popusk PAYG şu an tükenik — config bu yüzden esnek).
- **Prefix-hash özet önbelleği:** Codex her tur tüm geçmişi yolladığından, özetlenen önek `hash(normalize(prefix))` ile cache'lenir → aynı önek bir kez özetlenir (maliyet + **deterministik çıktı** → seat prompt-cache sıcak kalır + turlar arası tutarlılık). Cache: küçük tablo veya in-process LRU + DB persist (kararı plan'da).
**Bedel:** ilk eşik-aşımında bir özetleme round-trip'i (latency); cache sonraki turları kurtarır.

### Katman A — Sert tavan / müşteriyi compact'e yönlendir (B'den sonra hâlâ devse)
**Temel:** mevcut context-guard hard-reject (`request-guard-service.ts`, `contextTokens > limit × 8 → BadRequestError`) — zaten istemciyi compact'e zorluyor.
**Aksiyon:** Bu rejeksiyonu **B'den SONRA** konumla ve mesajını Codex'in temiz şekilde kendi `/compact`/remote-compaction'ını tetikleyeceği şekilde ayarla (loop-safe; mevcut "auto-compact loop" notu dikkate alınır — bkz `project_yzapi_context_guard_inflation_overreject`). Seat'e **göndermez** → 429-storm yerine tek temiz sinyal. "İnsanlara compact attır" tam burada, **yalnız son çare**.

### D — Retry-After storm-söndürücü (yanıt tarafı, her zaman — yeni)
Seat 429 döndüğünde **veya** A tetiklendiğinde yanıta **`Retry-After`** header'ı (+ temiz, Codex-dostu gövde) ekle → Codex Desktop aynı isteği saniyeler içinde tekrar hammerlamak yerine geri çekilir. **Asıl amplifikatörü (retry-storm = istek SAYISI) doğrudan söndürür** — compaction'ın değmediği RPM tarafını vurur. Düşük risk, yüksek kazanç. Loop-safe: backoff değeri makul (ör. 20–60s), sabit değil de upstream `Retry-After`'ı varsa onu geçir.

### E — Oversized-request seat-spread (routing — yeni, ⚠️ fizibilite araştırılacak)
İstek belli bir boyutu aşınca session-affinity'yi **seçici kır** → isteği **en az yüklü/boş koltuğa** ver. **Bağlama hiç dokunmaz → kalite riski 0**; tek heavy user'ın tek koltuğun dakikalık oranına sıkışmasını (asıl kök) hafifletir. ⚠️ Fizibilite cliproxy'nin affinity'yi nasıl key'lediğine bağlı (yzapi gönderdiği session/routing anahtarını oversized istekte değiştirebilir mi?) — **plan'da araştırılacak**. Global affinity-kapatma DAHA ÖNCE ters teptiği için (cache-cold, bkz seat-429 notu) YALNIZ oversized (zaten cache-cold) isteklerde seçici uygulanır.

## 4. Konfigürasyon

`system_api_config` (canlı-okuma, deploy gerektirmez) + `env.ts`:
- `SMART_COMPACTION_ENABLED` (env, kill-switch, default **false** → inert deploy).
- Katman toggle'ları: `compaction_layer_c/b/a_enabled` + `retry_after_dampener_enabled` (D) + `oversized_seat_spread_enabled` (E) (DB).
- Eşikler (DB, paket `max_context`'e oranlı): B yumuşak = **%60**, A sert = **%90** (varsayılan; ayarlanır).
- `smart_compaction_summarizer_model` + provider (DB).
- Katman B koruma penceresi K (son tur sayısı), özet hedef-boyutu.
- **Paket bazında açılış:** önce ağır kullanıcılarda (yokum) — paket/entitlement flag veya allowlist (kararı plan'da).
- Şeffaflık: B özet notu açık/kapalı (default **açık** — küçük not).

## 5. Veri Akışı / Streaming
Compaction **forward öncesi** (request fazı) çalışır → streaming yanıtı etkilemez; hem stream hem non-stream yolunda aynı dönüşüm. B'nin LLM çağrısı request'i bloklar (timeout'lu); cache ile amortize.

## 6. Hata Yönetimi (never-throw)
- C hata → atla, devam.
- B timeout/hata/boş özet → atla (özetlenmemiş geçmişle devam), A'ya düş.
- A tetiklenir yalnız gerçek sert-tavanda; aksi halde gövde olduğu gibi seat'e.
- Hiçbir katman müşteri isteğini düşürmez/bozmaz; en kötü durum = bugünkü davranış (compaction yokmuş gibi).

## 7. Gözlemlenebilirlik
Her istekte: hangi katman çalıştı, **önce/sonra tahmini birim**, B cache hit/miss, B latency, A-nudge sayısı → log + (mümkünse) `usage_records.raw_usage_json`/ayrı sayaç. cf-brain/kasa-brain SHADOW bu yeni alanı görmeli (gürültü yapmasın diye).

## 8. Test Stratejisi (TDD)
- C: tekrar-dosya tekilleme + tool-output katlama birim testleri (boyut düşer, kod korunur).
- B (saf fonksiyonlar): pencere koruma (son K tur + tüm kod/tool aynen), yalnız eski-prose özetlenir, prefix-hash determinizmi/cache, özetleyici-down → passthrough.
- A: B'den sonra eşik mantığı, loop-safe mesaj.
- Kapı: codex-dışı **byte-identical** (sızıntı/regresyon yok), kill-switch off → byte-identical.
- Entegrasyon: stream + non-stream, never-throw (özetleyici 500/timeout → istek yine başarılı).

## 9. Rollout (canlı, izole targeted-rsync — yzapi deploy kuralları)
1. Inert deploy (`SMART_COMPACTION_ENABLED=false`) — byte-identical davranış.
2. **Risk-free demet (önce):** C (Token Saver + dedupe) + **D (Retry-After)** + **E (seat-spread, fizibilite tamamsa)** → boyut + 429 + storm düşüşünü ölç (risk ~0/düşük).
3. Yeterli değilse **B'yi yalnız yokum** entitlement'ında aç → kalite + boyut + 429 izle (cf-brain/usage_records).
4. Sorun yoksa kademeli tüm ağır codex kullanıcılarına.
5. Geri-al: `SMART_COMPACTION_ENABLED=false` veya katman toggle (anında, deploy'suz).
**QA:** 3-ajan ≥2 PASS + çift-onay (HARD RULE). Geliştirme canlı-sadık replikada (lokal main geride). Deploy izole (`rsync --checksum -n` ile yalnız hedef dosyalar).

## 10. Riskler
- **B sessiz kalite kaybı (ana risk):** muhafazakâr koruma (kod/son turlar aynen) + paket-bazlı kademeli açılış + kolay geri-al ile sınırlanır; yine de kalan risk var → önce tek kullanıcıda kanıtla.
- **B latency:** prefix-hash cache + sıkı timeout + passthrough.
- **Özetleyici provider sağlığı:** DB-config (popusk tükenik olabilir) + never-throw passthrough.
- **Deploy drift (proxy.ts/closerouter-service.ts eşzamanlı oturum):** canlıdan indir+hunk, ship öncesi re-diff (CLAUDE.md kuralı).
- **E (seat-spread) fizibilitesi belirsiz:** cliproxy affinity-keying'ine bağlı; çıkmazsa E düşer, C+D+B kalır (bağımsız bileşenler).
- **D (Retry-After) istemci-davranışı varsayımı:** Codex Desktop `Retry-After`'a uyar varsayıyoruz; uymazsa zararı yok (yalnız storm sürer) — plan'da tek müşteride doğrula.
- **B Codex zaten remote_compaction_v2 yapmış olabilir:** marjinal kazanç düşük olabilir → B'yi C/D/E yetmezse aç (staged), kalite metriğiyle izle.

## 11. Karara bağlanan varsayılanlar (review'da değiştirilebilir)
1. B motoru: ayrı ucuz model, **DB-config** (sabit hard-code yok).
2. Eşikler: C her zaman / B %60 / A %90 (max_context oranlı).
3. Şeffaflık: B özetleyince küçük not (açık).
4. Kapsam: codex + default KAPALI + önce yokum.

## İlgili
`project_yzapi_codex_lazy_fallback_dead_wallet_empty` · `project_yzapi_codex_seat_429_spof_tpm_cap` · `project_yzapi_context_guard_inflation_overreject` · `project_codex_subscription_proxy` · Token Saver `src/server/services/token-saver.ts` · Enjeksiyon `src/server/services/closerouter-service.ts`
