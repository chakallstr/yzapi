# Tasarım: Dokümantasyon Sayfası — Çocuk-Dostu, Seçilebilir İstemci Eğitimleri (Ekran Görüntülü)

Tarih: 2026-06-18
Proje: yzapi (yapayzekalab.org) · panel "Documents" sekmesi
Durum: brainstorming onaylandı → writing-plans bekliyor
Yedek örnekler: `/tmp/yzapi-docs-preview.html` (illustre) · `/tmp/yzapi-docs-shots.html` (ekran görüntülü)

## 1. Amaç
Hiç bilmeyen biri bile (çocuk-dostu) adım adım, görsellerle başlayabilsin. Müşteri **kullandığı aracı seçer**; her araç için **detaylı, ekran-görüntülü, kendi `yzk_live_` API anahtarını kullanan** kurulum eğitimi görür. Eski içerik korunur, yeni sistem (paket/builder/test-key/free-NVIDIA/ödeme-iade) entegre + tanıtılır.

## 2. Sayfa yapısı (yukarıdan aşağı, tek sayfa + TOC)
1. **🚀 Hızlı Başlangıç** — 5 numaralı adım kartı + SVG akış okları: Bakiye yükle → API key al → Paket/test key → İstemcini seç&bağla → İlk istek. Gerçek yzapi panel ekran görüntüsüyle (Hesap sayfası).
2. **🔌 İstemcini Seç** (YENİ — seçilebilir) — istemci kartları; birine tıklayınca o istemcinin **detaylı eğitimi** açılır (aşağıda).
3. **🎁 Paketler & Builder** — paket nedir, custom builder, test key, **free NVIDIA** (tanıtım kartları) + builder mini-akış.
4. **💳 Ödeme & İade** — yükleme yöntemleri + zorunlu iade-onay politikası (AML).
5. **📚 API Referansı & Modeller** — uçlar + canlı model katalogu görüntüsü.

## 3. Seçilebilir istemci eğitimleri (çekirdek)
Kapsam (kullanıcı kararı): **Claude Code (terminal)** · **Cline (VS Code)** · **Roo Code (VS Code)** · **Codex CLI** · **OpenAI-uyumlu (genel)**. Resmî **Claude Desktop** HARİÇ → "masaüstünde Claude için Claude Code kullan" yönlendirme notu (resmî uygulama özel gateway desteklemez).

Her istemci eğitimi (seçilince açılır), şu sırayla **detaylı**:
- Kısa "bu nedir / kime uygun" (1 cümle, çocuk-dostu).
- **Adım 1 — API key al** (ortak): gerçek yzapi Hesap-sayfası ekran görüntüsü + "Yeni Anahtar → `yzk_live_…` kopyala".
- **Adım 2..N — istemciye gir**: o istemcinin ayar yolu, **base URL** (Claude Code = kök `https://yapayzekalab.org`; OpenAI-uyumlu = `/v1`) + **key alanı** (`yzk_live_…`), kopyalanabilir kod/komut, OS varyantları (mevcut yapı: win/mac/linux + kalıcı kurulum).
- **Doğrulama**: "ilk istek" örneği + beklenen sonuç.
- **Sık hata**: `http://` yerine `https://` (bkz mevcut not), kök vs `/v1`, key formatı.

Hepsinde vurgu: **sistemdeki kendi `yzk_live_` anahtarı** kullanılır (claude.ai/openai hesabı DEĞİL).

## 4. Ekran görüntüleri — kaynak & dürüst sınır
- **yzapi panel görüntüleri (GERÇEK, otomatik):** Hesap (bakiye+API key+iade-kapısı), Modeller (katalog), Dokümanlar. Kullanıcının açık Chrome'undan içerik-only (tarayıcı çubuğu + kişisel sekme/yer imi KIRPILI) çekilir; AppleScript ile (yeni Chrome açma yok). ⚠️ Public docs için app-nav'daki **bakiye şeridi de kırpılmalı** veya temiz/sıfır-durum hesabı kullanılmalı.
- **İstemci uygulama görüntüleri (Cline/Roo/Codex ayar ekranları):** harici uygulamalar → otomatik çekilemez. Bunlar için **illustre adım kartı + kopyalanabilir kod** kullanılır; gerçek görüntüyü sonra Ufuk sağlarsa eklenir. (Plan bunu açıkça not eder; uydurma görüntü YOK.)
- **Görsel hosting (deploy):** screenshot'lar build'e girmeli. Seçenek: (a) `public/docs/*.png` statik asset (önerilen — bundle şişmez, bakım kolay), (b) base64-inline (bundle şişer). Karar: **(a) public/ statik**.

## 5. Mimari (mevcut sistemi genişlet)
- **Veri:** `api-docs.js` `API_DOC_SECTIONS` — yeni doküman tipleri eklenir: `journeySteps[]` (numaralı adım), `clientTutorials[]` (seçilebilir istemci eğitimi: id, ad, ikon, base-url tipi, steps[], screenshots[], code/osVariants — mevcut `clientCards` alanları yeniden kullanılır), `featureCards[]` (paket/free-NVIDIA tanıtım), `paymentMethods[]`, `refundPolicy`. Mevcut tipler (clientCards/referenceRows/modelGroups/codeBlocks) KORUNUR — yeni tutorial verisi mevcut clientCards'tan türetilir/genişletilir.
- **Renderer:** `tab-documents.jsx` — yeni render fn'leri: `JourneyDiagram` (kartlar+SVG ok), `ClientSelector` (seçim state + seçili istemci tutorial'ı), `FeatureCards`, `Screenshot` (public/ asset + caption), `PaymentList`, `RefundBox`. Mevcut renderer korunur, seçilebilirlik eklenir.
- **Görsel sistem:** numaralı kartlar, SVG/CSS ok&kutu, `shared.jsx` ikonları, renkli rozet/showcase, kopyalanabilir kod, gerçek screenshot kartları (border+caption). Resim = `public/docs/`.

## 6. i18n & sözleşme
- Mevcut docs deseni (TR ağırlıklı, bazı string'ler) izlenir; yeni metinler aynı desen. i18n parite varsa korunur.
- `documents-content-contract` + `os-install-variants-contract`: mevcut kilitli literaller (endpoint'ler, istemci adları, `ANTHROPIC_AUTH_TOKEN`, "Kod kopyala"/"Kopyalandı", OS varyant `$env:`/`setx`/`yzk_live_YOUR_KEY` placeholder) KORUNUR (istemci eğitimleri sürdüğü için). Yeni içerik için contract'a opsiyonel kilit eklenebilir; mevcutları KIRMA.

## 7. Fazlar (her biri TDD/contract + 3-QA + izole deploy, canlı `a42f54c`)
- **F1 — Görsel toplama:** yzapi panel screenshot'larını çek (içerik-only + bakiye-şeridi kırp/temizle), `public/docs/`'a koy. Paketler sayfası deep-link yok → Chrome'da "Paketler"e tıklayıp çek (JS-from-AppleEvents açık olmalı) veya Ufuk sağlar.
- **F2 — Veri:** `api-docs.js`'e journey + clientTutorials + featureCards + payment/refund + screenshot referansları.
- **F3 — Renderer:** `tab-documents.jsx`'e JourneyDiagram + ClientSelector + FeatureCards + Screenshot + PaymentList/RefundBox; mevcut render korunur.
- **F4 — Wire + contract + build + scan:public + QA + izole deploy.**

## 8. Kapsam dışı (YAGNI)
- Cursor (kullanıcı seçmedi). Resmî Claude Desktop tutorial'ı (desteklenmez → yönlendirme notu). İstemci uygulamalarının otomatik screenshot'ı (harici; manuel sağlanır). Çoklu-dil EN docs (mevcut desen neyse o).
