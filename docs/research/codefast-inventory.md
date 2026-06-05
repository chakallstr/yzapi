# CodeFast.app — Özellik / Paket / Sistem Envanteri (referans analiz)

> Kaynak: https://www.codefast.app (giriş yapılmış oturumdan, AppleScript ile çekildi, 2026-06-04).
> Ham çıktılar: `/tmp/codefast-scan/*.json` (geçici). Bu doküman kalıcı özet.
> **Amaç:** yzapi'ye uyarlanacak satış/paket/sistem yapısının referansı. Birebir kod/içerik kopyası DEĞİL — yapı/akış analizi.

## Özet
CodeFast = **yzapi'nin yakın muadili**: TL-bakiye bazlı, çok-sağlayıcılı AI API satış paneli (Claude/GPT/Gemini/Grok/GLM/Qwen/Open Source + görsel/video).
**Temel fark:** yzapi token-başına öder (PAYG); CodeFast **önceden ödemeli PAKET** satar (günlük istek limiti, token paketi, hesap teslimi).

## Sayfalar / Sistemler (sol menü)
| Sayfa | URL | Ne yapar |
|-------|-----|----------|
| Özet | /dashboard | Bakiye, aktif paket sayısı, aktif API key, API erişimi, aktif limitler, hızlı işlemler |
| Profil | /profile | Kullanıcı adı + foto; **bağlı hesaplar** (Email/şifre, Google, GitHub OAuth bağla/kaldır); şifre belirle |
| Paketler | /packages | 10 paket + kategori filtreleri (toggleable) — satışın kalbi |
| Bakiye | /billing | Bakiye, **kart/crypto yükleme**, **hediye/geçiş kodu**, aktif API erişimleri, siparişler, bakiye hareketleri |
| API Anahtarları | /api-keys | Tek key görüntüle/kopyala/**değiştir (rotate)**; durum Aktif; `cf_live_...` |
| AI Chat | /ai-chat | Dahili **chat playground**: provider+model seçimi, temperature, max tokens, streaming toggle, dışa aktar |
| Studio | /studio | **Görsel/video üretim playground**: Nano Banana/GPT Image 2/Veo/Omni Flash/Grok Imagine; en-boy oranı, kalite, **kuyruk sistemi 0/3** |
| Destek | /support | **Ticket sistemi** (Tümü/Açık/Yanıt Bekleniyor/Yanıtlandı/Kapatıldı) — fiili akış WhatsApp'a yönlendiriyor |
| Dokümantasyon | /docs | API docs: paket-başı **Base URL**, model listeleri, kategori sekmeleri, ⌘K arama, "Kopyala" |
| Blog | /blog | Blog |
| Sistem Durumu | /status | **Uptime monitor**: 7 hedef API, 15 dk'da bir test, 24s uptime %, gecikme ms, kısmi/çalışmıyor |
| Topluluk | — | Discord, WhatsApp, Telegram linkleri |

## Paketler (10) — `/packages`
Kategori filtreleri (sekme/toggle): **Tümü(10), Önerilen(2), GPT/Codex(2), Claude(2), Gemini(2), Grok(2), GLM(1), Görsel Oluşturma(3), Video Oluşturma(1), Hesaplar(3)**.

### Paket tipleri
1. **API limit paketi** (günlük istek limiti) — "Limit seçimi" + "Paketi özelleştir":
   - Codex API ₺38,33 · 500 istek/gün · 1 gün · (gpt-5.5/5.4/5.3-codex/5.2, Responses API)
   - Gemini API ₺16,67 · 500/gün · 1 gün
   - Grok API ₺16,67 · 500/gün · 1 gün
   - GLM API ₺20 · 750/gün · 1 gün (glm-5.1/5-turbo/4.7/4.5-air)
2. **Token paketi** (seçilebilir token miktarı, canlı fiyat) — "Token seçimi" + slider:
   - Claude Max API ₺225 · **25M token (slider 5M–500M)** · 1M token $0,20 · Opus 4.8/4.7/4.6, Sonnet 4.6/4.5, Haiku 4.5; **1M context**
3. **Görsel/Studio paketi** (günlük kredi/istek):
   - GPT Image 2 Studio ₺40 · 80 istek/gün
   - Grok Imagine Studio ₺16,67 · 100 kredi/gün (text→image 1 kredi, image→image 2 kredi…)
4. **Hesap teslim paketi** (API değil, hesap/kod teslimi; manuel WhatsApp fulfillment):
   - Claude Max 6.25x Team Seat ₺2.068 · 30 gün · resmi Team daveti (Gmail alanı + WhatsApp teslim)
   - Google AI Ultra (Antigravity) ₺700 · 7 gün · hesap
   - Cursor Pro ₺450 (~~₺911~~) · 30 gün · aktivasyon kodu + Win/Mac kurulum desteği

### Her paket kartında
- Fiyat ₺ + erişim süresi (1/7/30 gün) + teslimat notu + "+N ek kullanım detayı"
- **3 ödeme butonu: Kart ile al / Crypto ile al / Bakiye ile al**
- "Detayları gör" → `/packages/<slug>` detay sayfası
- "Paketi özelleştir / Aç" → limit/token seçici (slider), canlı fiyat
- Kart/crypto **minimum ₺45 (1 USD)**; altı sadece bakiye ile

## "Her özelliği açıp kapatılabilen" — toggle yüzeyleri
- Paket kategori filtre sekmeleri (10)
- Paket-başı özelleştirme: "Paketi özelleştir" expander, limit/token miktar seçici (slider)
- Studio: model select, en-boy oranı (12 seçenek), kalite (Low/Med/High)
- AI Chat: provider select, model select, temperature, max tokens, **streaming toggle**
- Ödeme yöntemi: Kart / Crypto / Bakiye
- Dil: Türkçe (i18n)
- OAuth: Google / GitHub / Email-şifre bağla-kaldır

## Sağlayıcı / model kataloğu (docs + paketler)
- Claude Max (Claude Code): opus-4.8/4.7/4.6, sonnet-4.6/4.5, haiku-4.5 (+1M context)
- Codex API (Responses API): gpt-5.5/5.4/5.3-codex/5.2
- Gemini: gemini-3-flash-preview, 3.1-flash-lite-preview, 3.1-pro-preview
- Grok: grok-4.3, grok-4.20… (+5)
- GLM: glm-5.1, 5-turbo, 4.7, 4.5-air
- Qwen: qwen3.6-plus (+103)
- Open Source: deepseek-v4-pro (+18)
- Görsel/Video: Nano Banana 2/Pro, GPT Image 2, Veo 3.1 Fast/Omni Flash, Grok Imagine
- Her API'nin ayrı **Base URL**'i: örn. `https://api.codefast.app/claude-api`

## yzapi'de ZATEN olan vs. CodeFast'te olup yzapi'de OLMAYAN
**yzapi'de var:** TL bakiye, tek API key, çok-sağlayıcı per-model routing, OpenAI+Anthropic uçları, admin panel, Gözcü/mali-izleme, kur/fiyatlandırma, Telegram top-up.
**CodeFast'te var, yzapi'de yok (aday işler):**
- Önceden ödemeli **paket kataloğu** + paket özelleştirme (limit/token slider)
- **Paket-bazlı entitlement/limit** (günlük istek limiti, token kotası, süre)
- **Crypto ödeme** + **hediye/geçiş kodu** sistemi
- **AI Chat playground** (panel içi)
- **Studio** (görsel/video üretim + kuyruk)
- **Public uptime/status** sayfası (yzapi'de iç /status + Gözcü var ama public uptime board yok)
- **Destek ticket** sistemi
- **Hesap-teslim paketleri** (manuel fulfillment)
- **OAuth** (Google/GitHub) hesap bağlama
- Docs sayfası (paket-başı Base URL rehberi)

## Notlar / gözlemler
- Ödeme sağlayıcısı: **dodopayments** (siparişlerde "dodopayments • Ödeme bekleniyor" görüldü; kullanıcının açık sekmelerinden biri de app.dodopayments.com idi).
- Destek fiilen WhatsApp üzerinden.
- Status: 7 API izleniyor, 15 dk periyot (Qwen kısmi sorun, Codex %69 uptime vb.).
