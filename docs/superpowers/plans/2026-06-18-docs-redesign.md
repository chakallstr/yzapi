# Dokümantasyon Redesign — Implementation Plan

> **For agentic workers:** Faz faz uygula. Her faz: build (vite) + ilgili contract testleri PASS + 3-agent QA (≥2 PASS). **Standing kural: deploy YAPMA** — F1–F4 lokalde biter, görsel önizleme (`npm run dev` veya yeni preview HTML) ile Ufuk'a gösterilir; izole deploy SADECE Ufuk açık onay verince.

**Goal:** Panel "Documents" sekmesini çocuk-dostu, görselli, **seçilebilir istemci eğitimleri** olan bir rehbere çevir; eski içeriği koru, yeni sistemi (paket/builder/test-key/free-NVIDIA/ödeme-iade) entegre et + tanıt. Hepsinde müşterinin kendi `yzk_live_` anahtarı.

**Architecture:** Mevcut veri-odaklı sistem genişletilir — `api-docs.js` (veri: yeni tipler) + `tab-documents.jsx` (renderer: yeni bileşenler). Eski tipler (clientCards/referenceRows/modelGroups/codeBlocks) korunur. Görseller `public/docs/*.png` statik asset. Görsel spec = onaylı `/tmp/yzapi-docs-shots.html`.

**Tech Stack:** React/JSX (Vite), shared.jsx ikonları, CSS/SVG (resim hosting yok → panel screenshot'ları hariç), Vitest contract testleri.

**Spec:** `docs/superpowers/specs/2026-06-18-docs-redesign-design.md`

---

## Kapsam & istemci listesi
Seçilebilir istemciler: **Claude Code (terminal)** · **Cline (VS Code)** · **Roo Code (VS Code)** · **Codex CLI** · **OpenAI-uyumlu (genel)**. Claude Desktop HARİÇ → "Claude Code kullan" yönlendirme notu. Hepsi `yzk_live_` + base URL (Claude Code=kök; OpenAI-uyumlu=`/v1`).

## FAZ 1 — Görsel toplama (yzapi panel screenshot'ları)
**Files:** Create `public/docs/account.png`, `public/docs/models.png`, `public/docs/packages.png` (+ gerekirse `documents.png`).
- [ ] **1.1** Açık Chrome'dan içerik-only çek (yeni Chrome AÇMA — AppleScript, mevcut pencerede yeni sekme): `/account`, `/models`. (Şablon: `/tmp/cap-multi.applescript`; +140px offset ile tarayıcı çubuğu kırpılı.)
- [ ] **1.2** **Bakiye şeridini temizle** (public docs için): ya sıfır-durum/temiz hesapla çek ya da `sips`/crop ile app-nav'daki bakiye satırını kırp. Kişisel veri görünmemeli.
- [ ] **1.3** Paketler sayfası (deep-link yok): Chrome "Paketler"e tıklayıp çek (View→Developer→"Allow JavaScript from Apple Events" açık olmalı) **veya** Ufuk sağlar. Alınamazsa illustre kart kullan (uydurma görüntü YOK).
- [ ] **1.4** Görselleri `public/docs/`'a koy; `npm run build`'ın bunları `dist/`'e kopyaladığını doğrula (vite `public/` → kök). Cline/Roo/Codex uygulama ekranları OTOMATİK ÇEKİLEMEZ → illustre adım + kod; gerçek görüntü gelirse sonra eklenir.

## FAZ 2 — Veri (api-docs.js yeni tipler)
**Files:** Modify `src/yapayzekalab/api-docs.js`.
- [ ] **2.1** `API_DOC_SECTIONS`'a yeni alanları ekle (mevcut doc objelerine ek tipler; mevcut clientCards/referenceRows/modelGroups/codeBlocks KORUNUR):
  - `journeySteps: [{n, icon, title, desc, screenshot?}]` (5 adım; adım-1 `screenshot:"docs/account.png"`).
  - `clientTutorials: [{id, name, icon, baseUrlKind:'root'|'v1', forWhom, steps:[{title, desc, code?, osVariants?, screenshot?}], firstRequest:{code}, pitfalls:[...]}]` — Claude Code/Cline/Roo/Codex/OpenAI-uyumlu. Kod/osVariants mevcut clientCards'tan türetilir (DRY).
  - `featureCards: [{tone:'free'|'builder'|'key', icon, title, desc}]` (NVIDIA bedava / builder / test key).
  - `paymentMethods: [{icon, name, sub, tag}]` + `refundPolicy:{title, body}` (i18n `account.refund.body` ile aynı metin).
  - `claudeDesktopNote` (yönlendirme).
- [ ] **2.2** `npm run lint` (tsc/jsx parse) + mevcut `documents-content-contract` testini koş — kilitli literaller (endpoint/istemci adı/`ANTHROPIC_AUTH_TOKEN`/`yzk_live_YOUR_KEY`/OS varyant) HÂLÂ PASS olmalı. Commit.

## FAZ 3 — Renderer (tab-documents.jsx yeni bileşenler)
**Files:** Modify `src/yapayzekalab/tab-documents.jsx`.
- [ ] **3.1** `JourneyDiagram({steps})` — numaralı kartlar + SVG/CSS akış oku (mobilde dikey). Görsel spec: `/tmp/yzapi-docs-shots.html` `.journey`.
- [ ] **3.2** `Screenshot({src, caption})` — `public/docs/` görselini border+caption ile çizer (`<img src={"/" + src}>`).
- [ ] **3.3** `ClientSelector({tutorials})` — seçim state'i (`useState`); üstte istemci kartları (ikon+ad), seçili olanın **detaylı eğitimi** (steps + Screenshot + kopyalanabilir kod + OS varyantları + pitfalls + firstRequest) altta render. Mevcut `renderCard`/kopya-buton mantığı yeniden kullanılır.
- [ ] **3.4** `FeatureCards({cards})` (renkli showcase) + `PaymentList({methods})` + `RefundBox({policy})` + `claudeDesktopNote`.
- [ ] **3.5** Ana render: yeni bölümleri sırayla yerleştir (Hızlı Başlangıç → İstemcini Seç → Paketler → Ödeme/İade → API). Mevcut clientCards bölümü ClientSelector'a taşınır/sarmalanır (eski içerik korunur). `npm run build` (JSX denge + reject-template-guard). Commit.

## FAZ 4 — Wire + contract + QA + önizleme (deploy onayla)
**Files:** Modify (gerekirse) `*-content-contract.test.ts` / `os-install-variants-contract.test.ts`.
- [ ] **4.1** Contract testleri: yeni yapı mevcut kilitli literalleri koruyor mu? Koruyorsa dokunma; istemci eğitimi taşındıysa testin selektörünü güncelle (literaller AYNI kalmalı). Yeni içerik için opsiyonel kilit ekle.
- [ ] **4.2** `npm run lint` + `npm test` (tüm, contract dahil) + `npm run build && npm run scan:public` (görsel/metin leak yok; `public/docs/*.png` panel verisi içermemeli — bakiye kırpılı).
- [ ] **4.3** **Önizleme** (deploy DEĞİL): `npm run dev` ile Documents sekmesini aç (veya güncel preview HTML üret), Ufuk'a göster. **Ufuk onaylayana dek deploy YOK.**
- [ ] **4.4** 3-agent QA (yeni renderer + veri + leak + contract). Onay sonrası: izole worktree (canlı `a42f54c`) + cherry-pick + `--checksum` izolasyon + `LOCAL_SRC=… sync-deploy.sh`. **Pre-kirli dosya tuzağı:** `tab-documents.jsx`/`api-docs.js` git status'ta kirli mi en başta kontrol et; kirliyse izole worktree'de `git checkout <live> -- <dosya>` + hand-apply (bkz CLAUDE.md kontaminasyon dersi).

## Self-review (spec kapsamı)
- Çocuk-dostu journey → F2.1 journeySteps + F3.1. ✓
- Seçilebilir istemciler (Claude Code/Cline/Roo/Codex/OpenAI) → F2.1 clientTutorials + F3.3 ClientSelector. ✓
- Hepsinde yzk_live_ key → her tutorial.steps "API key al" + base URL/key. ✓
- Ekran görüntüleri (gerçek yzapi + illustre client) → F1 + F3.2 Screenshot; dürüst sınır not edildi. ✓
- Paket/builder/free-NVIDIA tanıtım → F2.1 featureCards + F3.4. ✓
- Ödeme/iade → F2.1 + F3.4. ✓
- Eski içerik korunur → mevcut tipler dokunulmaz, ClientSelector mevcut clientCards'ı sarar. ✓
- Claude Desktop hariç+yönlendirme → claudeDesktopNote. ✓
- Contract kilitleri → F4.1. ✓
- Deploy onayla → F4.3/4.4 (standing kural). ✓
