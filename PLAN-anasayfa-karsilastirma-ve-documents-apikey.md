# Plan — (A) Anasayfa fiyat karşılaştırması + (B) Documents'a API key paneli

İki iş, **ikisi de frontend-only** (migration/billing YOK, backend'e dokunmuyoruz) → tek deploy'da çıkar.
Onaylı önizleme: `onizleme-anasayfa-katalog-teaser.html` (üretici fiyatı KIRMIZI bar, YapayZekaLab YEŞİL bar, sağda −%XX).

---

## A. Anasayfaya büyük karşılaştırma bölümü

### Tasarım (önizlemede onaylanan)
- Her model satırı: **`<Üretici> fiyatı`** (Anthropic / OpenAI / Google …) kırmızı bar + kırmızı tutar →
  **`YapayZekaLab fiyatı`** yeşil bar + yeşil tutar → sağda büyük yeşil `−%XX tasarruf`.
- Barlar **tek ortak ölçekte** (en pahalı modele göre) → hem satır-içi fark hem modeller arası fark dürüst görünür.
- Etiket = her modelin gerçek sağlayıcısından OTOMATİK: `claude*`→Anthropic, `gpt*`→OpenAI, `gemini*`→Google,
  `grok*`→xAI … (markalı/özel modellerde altındaki gerçek üreticinin adı). "Katalog" kelimesi kullanılmaz.
- Tema korunur (Geist + mono + `--ok`/`--accent`/kırmızı `#ef4444`).

### Veri kaynağı (Faz 1 = statik)
- `shared.jsx`'e `CATALOG_PRICES` haritası: kanonik model id → `{ in, out }` USD/1M, **en pahalı meşru
  referans = üreticinin resmi liste fiyatı**. Markalı modeller altındaki gerçek modele eşlenir.
- `shared.jsx`'e helper'lar:
  - `providerLabelFor(model)` → "Anthropic fiyatı" / "OpenAI fiyatı" … (mevcut `PROVIDERS`/provider alanından).
  - `computeCatalogDiff(model)` → katalog yoksa veya `cat <= ours` ise `null`; aksi halde
    `{ catTotal, ourTotal, catIn, catOut, ourIn, ourOut, pct }`.
- (Bonus temizlik) `tab-home.jsx`'teki **mevcut `calculatorPriceOverrides` (opus-4-7 `directPerM:30`) kaldırılır**,
  Cost Calculator artık `CATALOG_PRICES`'tan beslenir → gömülü çapa yerine tek kaynak.

### Yerleşim (anasayfa, `tab-home.jsx`)
- Mevcut sıra: Hero(989) → **ValueBanner(1055)** → FeatureCards(1058) → HowItWorks(1068) → CostCalculator(1071) → CLI → Quickstart → FAQ.
- **Yeni `<PriceComparison>` bölümü ValueBanner'dan HEMEN SONRA, FeatureCards'tan önce** (satır ~1056).
  Gerekçe: "neden biz = çok ucuz" vurgusu sayfanın üstünde, değer önermesinin hemen ardında.
- **6 model gösterir, 2 sütunlu kompakt grid** (`computeCatalogDiff !== null` olanlardan popüler/yüksek-tasarruflu 6'sı:
  opus / sonnet / haiku / gpt-5.5 / gpt-5-mini / gemini-2.5-pro gibi — kanonik seçim kodda sabit liste). Her hücre:
  model adı + `−%XX` rozeti + kırmızı üretici barı + yeşil YapayZekaLab barı. Bar ölçeği **hücre-içi oranlı**
  (üretici barı tam = %100, bizimki = our/üretici oranı) → her modelin kendi indirim farkı net görünür.
  Alt köşede "Tüm fiyatları gör →" (models sekmesine).
- Cost Calculator (1071) yerinde kalır — karşılaştırma = üstte hızlı görsel vuruş, calculator = altta interaktif derin-dalış (tamamlayıcı, çakışmaz).
- Küçük/tek-satır varyant (önizlemedeki) opsiyonel — istenirse hero altına da konabilir; varsayılan planda yalnız büyük bölüm.

### Faz 2 (opsiyonel, sonra): canlı katalog
- Backend job OpenRouter/üretici fiyatını çekip günceller; statik `CATALOG_PRICES` DAİMA fallback.
  Markalı modeller (fable-5, opus-4.8 …) OpenRouter'da yok → daima statikten. Job down → sayfa kırılmaz.

---

## B. Documents'a API key paneli (ekle / sil + ilk girişte "API key oluştur")

### Bugünkü durum
- `tab-documents.jsx` keyleri YALNIZCA gösterir (classic view'da maskeli/aç/kopyala). Oluştur/sil YOK.
- Tam CRUD `tab-account.jsx`'te (satır 1415–1509): isim input + "Yeni anahtar", liste, "iptal", oluşturunca tek-seferlik düz-metin uyarısı.
- Uçlar (HEPSİ MEVCUT, owner-scoped): `GET /api/user/api-keys` (maskeli liste) · `POST /api/user/api-keys {ad}` (düz-metni 1 kez döndürür) · `POST /api/user/api-keys/:id/revoke` (soft-delete) · `GET /api/user/api-keys/:id/reveal` (düz-metni çözer).

### Yapılacak
1. **Ortak bileşen çıkar:** `tab-account.jsx`'teki key CRUD UI'ını yeni `api-keys-panel.jsx`'e taşı
   (`<ApiKeysPanel compact?>`), aynı uçları kullanır. Hem account hem documents bunu import eder → tek kaynak, kopya kod yok.
   - account: tam sürüm (scopes/son kullanım/istek sütunları dâhil).
   - documents: `compact` sürüm (isim + maskeli key + kopyala + aç/gizle + sil + "Yeni anahtar").
2. **Documents'a yerleştir:** panel **hub view'ın EN ÜSTÜNE** (rehber kartlarının üstüne) — kullanıcı Documents'a girer girmez görür; "ayrı yer arama" çözülür.
3. **İlk girişte "API key oluştur":** `keyState`/liste çözülünce **anahtar yoksa** belirgin boş-durum kartı:
   **isim input'u + "API anahtarı oluştur" butonu** (isim boşsa varsayılan `production-key`) → `POST` →
   dönen düz-metni göster + otomatik kopyala + "şimdi kaydet" uyarısı.
   - Giriş yapılmamışsa: bunun yerine "Giriş yap / Hesap aç" CTA.
4. Kod örneklerine key gömme (mevcut `personalizeText`) aynen çalışır; yeni oluşturulan key panele ve örneklere anında yansır (liste yeniden çekilir).

### Notlar / güvenlik
- Backend değişmez; mevcut owner-scope kontrolleri (`eq(userId)`) korunur. Reveal eski cipher'sız keylerde 409 verir → UI "bu anahtar gösterilemiyor, yenisini oluştur" mesajı (mevcut davranış korunur).
- Silme = soft-delete (`aktif=false`), bugünkü gibi.

---

## Ortak: QA & deploy
- **Frontend-only**, migration/billing yok → tek deploy'da A+B birlikte (deploy'u azalt kuralı).
- Dosyalar: `shared.jsx`, `tab-home.jsx`, `tab-models.jsx` (katalog sütunu fix + rozet — ayrı plandaki A kısmıyla aynı bileşen), `tab-documents.jsx`, `tab-account.jsx`, yeni `api-keys-panel.jsx`, i18n.
- **3-ajan QA ≥2 PASS** zorunlu + izole worktree deploy (canlı commit'ten, sadece ilgili dosyalar, `rsync --checksum` ile izolasyon kanıtı) + **çift onay**.
- Risk düşük (görsel + mevcut uçları kullanan UI). Rollback: dosya geri al + rebuild.

## Kararlar (onaylandı)
1. ✅ Modeller sayfasındaki karşılaştırma da bu deploy'a dahil (aynı `CATALOG_PRICES`/bileşen, tek seferde).
2. ✅ Documents boş-durum: **isim input'u + "oluştur" butonu** (tek-tık oto-oluştur değil).
3. ✅ Anasayfa karşılaştırmada **6 model**, 2 sütunlu grid.
