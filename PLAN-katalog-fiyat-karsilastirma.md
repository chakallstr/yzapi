# Plan — Katalog fiyatı vs YapayZekaLab fiyatı karşılaştırması

**Amaç:** Müşterinin ilk gördüğü sayfalarda her modelin **gerçek katalog (perakende) fiyatını** bizim
fiyatımızın yanında belirgin göstermek → "Bizde çok daha uygun" algısı → alıma teşvik.

Örnek hedef görünüm:

```
claude-opus-4-7
KATALOG FİYATI      $5.00 · $25.00   (üzeri çizili, gri)
YAPAYZEKALAB        $0.90 · $0.90    %96 DAHA UYGUN  ✓
```

---

## 0. Mevcut durum (kod incelemesi sonucu)

- **Modeller sayfası:** `src/yapayzekalab/tab-models.jsx`. Zaten "KATALOG FİYATI" ve
  "YAPAYZEKALAB FİYATI (USD)" diye **iki sütun var ama ikisi de AYNI sayıyı** gösteriyor.
  Sebep: ikisi de `m.input`/`m.output`'tan besleniyor ve `shared.jsx`'teki `computeOurUsd()`
  bir **no-op** (girdiyi olduğu gibi döndürüyor). Yani "katalog" sütununun arkasında gerçek
  katalog verisi YOK. → Bu planın 1. fazı bu bug'ı da kapatıyor.
- **Anasayfa:** `src/yapayzekalab/tab-home.jsx`. Cost-calculator bölümünde zaten
  `calculatorPriceOverrides = { 'claude-opus-4-7': { directPerM: 30, ourPerM: 1 } }`
  diye **elle gömülü bir "direkt fiyat" çapası** var. Bunu tek kaynağa taşıyıp her yerde
  kullanacağız (kod tekrarı kalmaz).
- **Veri:** Anasayfa statik `MODELS` (shared.jsx) kullanır, modeller sayfası `/api/models` çağırır.
- **Tema:** Inline-style + CSS değişkenleri (`tokens.css`). Yeşil/tasarruf rengi `--ok` / `--ok-bg` / `#047857`.
  Yeni hiçbir kütüphane/renk eklenmeyecek; sadece mevcut token'lar kullanılacak.

---

## 1. Kararlar (varsayılanlar — kullanıcı yönlendirmesiyle)

| Konu | Karar |
|---|---|
| **Katalog kaynağı** | **En pahalı meşru referans** = resmi vendor direkt liste fiyatı (Anthropic/OpenAI/Google). En yüksek = en büyük indirim algısı + dürüst (müşteri direkt gitse bunu öder). |
| **Saklama** | Tek kaynak: `shared.jsx`'te `CATALOG_PRICES` haritası (kanonik model id → `{ in, out }` USD/1M). Anasayfa + modeller + cost-calc HEPSİ bunu okur. |
| **Canlı veri** | Faz 2 (opsiyonel): bir job OpenRouter/vendor fiyatını çekip günceller; statik harita DAİMA fallback. Sayfa, canlı veri yoksa/çökerse statik haritayla çalışmaya devam eder (tema/sayfa asla kırılmaz). |
| **Katalog yoksa / biz ucuz değilsek** | Karşılaştırmayı **gizle** — sadece bizim fiyatımızı göster, rozet/katalog satırı çıkmaz. Asla yanıltıcı/ters karşılaştırma görünmez. |
| **İndirim %** | Frontend'de: `pct = round((cat - ours) / cat * 100)`. in ve out için ağırlıklı/ortalama tek bir % (basitlik için in+out ortalamasından). |
| **Dürüstlük** | Katalog fiyatı GERÇEK resmi liste fiyatı olacak. Markalı/özel isimli modeller (fable-5, opus-4.8 vb.) için **altındaki gerçek modelin** resmi fiyatına eşlenir; uydurma fiyat YOK. Eşlenemeyen → karşılaştırma gizli. |

> Not: Kodda zaten olan `providerInputUsd` **bizim gizli upstream maliyetimizdir** (popusk/closerouter reseller'dan, bizim satıştan DÜŞÜK). Katalog olarak ASLA bunu kullanma — hem marj sızar hem karşılaştırma ters döner.

---

## 2. Faz 1 — Statik katalog + her iki sayfa (frontend-only, migration/billing YOK)

### 2.1 `shared.jsx` — tek kaynak + yardımcı
- `CATALOG_PRICES` haritası ekle: kanonik model id → `{ in: <USD/1M>, out: <USD/1M> }`, resmi direkt liste fiyatından.
- `computeCatalogDiff(model)` helper ekle → katalog yoksa veya `cat <= ours` ise `null`;
  aksi halde `{ catIn, catOut, ourIn, ourOut, pct }` döndürür.
- (Temizlik) `computeOurUsd` no-op'unu olduğu gibi bırak; bizim fiyatımız zaten doğru kaynak.

### 2.2 `tab-models.jsx` — "iki sütun aynı" bug'ını kapat + rozet
- "KATALOG FİYATI" sütununu `CATALOG_PRICES`'tan besle (üzeri çizili, gri/`--ink-4`).
- "YAPAYZEKALAB" sütununun yanına `%X DAHA UYGUN` rozeti (`--ok-bg`/`#047857`).
- `computeCatalogDiff(m) === null` → katalog hücresi boş/"—", rozet yok (sadece bizim fiyat).

### 2.3 `tab-home.jsx` — kısaltılmış teaser (tema bozulmadan)
- `calculatorPriceOverrides`'ı kaldırıp cost-calculator'ı `CATALOG_PRICES`'tan besle (kod tekrarı biter, $30 çapası veriye döner).
- **Küçük teaser** ekle — mevcut `Card` + token'larla, en doğal yer: ValueBanner sağ paneli veya
  3 feature-card ile "Nasıl çalışır" arası kompakt bir mini-kart. İçerik: 2-3 popüler modelin
  `katalog → bizde (%X daha uygun)` özeti + "Detaylar → Fiyatlandırma" CTA (models sekmesine).
- Anasayfa statik `MODELS` kullandığından teaser de statik `CATALOG_PRICES` ile çalışır (ekstra API yok).

### 2.4 i18n
- Yeni metinler (`KATALOG FİYATI`, `BİZDE`, `%{pct} daha uygun`, teaser başlık/CTA) i18n tablolarına eklenir (mevcut `t()` deseni).

### 2.5 QA & deploy (proje kuralları)
- Frontend-only: migration/billing YOK.
- **3-ajan QA, ≥2 PASS** zorunlu (otomatik test tek başına yetmez).
- İzole deploy (canlı commit'ten worktree, sadece ilgili dosyalar rsync, izolasyon `--checksum` ile kanıtlanır).
- **Çift onay** + deploy birikitirme (her deploy seslab değil yzapi restart'ı; düşük trafikte tek seferde).
- Risk: düşük (görsel + statik veri). Rollback: dosya geri al + rebuild.

**Faz 1 dosya listesi:** `shared.jsx`, `tab-models.jsx`, `tab-home.jsx`, i18n dosyası. (+ test)

---

## 3. Faz 2 — Canlı katalog verisi (opsiyonel, sonra)

Sadece "her zaman güncel kalsın" istenirse:
- Backend job (yzapi'de mevcut zamanlayıcı desenleri gibi): periyodik `openrouter.ai/api/v1/models`
  (ve/veya vendor fiyat sayfaları) çek → model id eşle → DB/cache'e yaz.
- `/api/models` yanıtına `catalog: { in, out, source, fetchedAt }` alanı ekle.
- Frontend önce API `catalog`'unu, yoksa statik `CATALOG_PRICES`'ı kullanır (fallback hep var).
- **Kapsama sınırı:** markalı/özel modeller (fable-5, opus-4.8, gpt-5.5) OpenRouter'da bulunmaz →
  bunlar daima statik haritadan gelir. Bu yüzden statik harita Faz 2'de de korunur, silinmez.
- Job down/boş dönerse statik fallback devrede; sayfa asla kırılmaz.

---

## 4. Önerilen sıra

1. **Faz 1'i şimdi gönder** (statik, en pahalı resmi fiyatlar) — hem bug'ı kapatır hem teşviki hemen canlıya alır.
2. Faz 2'yi (canlı çekme) ancak güncel-kalma ihtiyacı netleşince yap; statik harita zaten "pahalı yer" fiyatını taşıdığı için aceleye gerek yok.

**Açık tek karar:** Faz 1'i statikle hemen mi gönderelim, yoksa Faz 2 canlı-çekmeyi bekleyip birlikte mi? (Öneri: statikle hemen.)
