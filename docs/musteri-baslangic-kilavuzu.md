# YapayZekaLab — Başlangıç Kılavuzu (Sıfırdan)

> Bu kılavuz, daha önce hiç API kullanmamış birine göre yazıldı. Adım adım takip
> et; her adımda ne yapacağını ve ne göreceğini anlatıyoruz. Takıldığın yerde
> ilgili bölüme geri dön.

YapayZekaLab, OpenAI ile **aynı şekilde** çalışan bir API geçididir (gateway).
Yani OpenAI / Claude / Gemini modellerini **tek bir anahtarla**, TL bakiyeden
"kullandıkça öde" mantığıyla kullanırsın. Kod tarafında hiçbir şey değiştirmene
gerek yok: sadece **adresi (base URL)** ve **anahtarı (API key)** bizimkiyle
değiştirirsin.

- **Base URL:** `https://yapayzekalab.org/v1`
- **API anahtarı formatı:** `yzk_live_...` (panelden üretilir)
- **Yetkilendirme:** `Authorization: Bearer yzk_live_SENIN_ANAHTARIN`

---

## Bölüm 0 — Hiç bilmeyenler için 3 temel kavram

1. **Base URL (adres):** İsteklerin gideceği yer. OpenAI'de bu
   `https://api.openai.com/v1`'dir; bizde `https://yapayzekalab.org/v1`.
2. **API Key (anahtar):** Kim olduğunu ve bakiyenin hangi hesaptan düşeceğini
   söyleyen gizli şifre. Bizde `yzk_live_` ile başlar. **Kimseyle paylaşma.**
3. **Model:** Hangi yapay zekânın cevap vereceği (örn. `claude-sonnet-4-6`,
   `gpt-5.4`). Aktif model listesini panelden ya da `/v1/models`'tan görürsün.

> Fiyatlandırma: kullandığın **token** (kelime parçası) kadar TL bakiyenden düşer.
> Akışsız (non-streaming) başarılı isteklerde yanıt başlığında `X-YZ-Cost-TL`
> (bu isteğin maliyeti) ve `X-YZ-Remaining-TL` (kalan bakiye) döner. Hata alırsan
> **ücret kesilmez**. (Streaming yanıtlarda maliyet anlık başlıkla gelmez; bakiyeni
> `/v1/balance` ile görürsün.)

---

## Bölüm 1 — Hesap, anahtar ve bakiye (panel)

1. **Giriş yap:** https://yapayzekalab.org adresine git, Google ile giriş yap.
2. **API anahtarı üret:** Hesap/panel bölümünde "API anahtarı oluştur" de.
   Çıkan `yzk_live_...` anahtarını **hemen kopyala ve güvenli bir yere kaydet**
   (anahtar yalnızca bir kez tam haliyle gösterilir).
3. **Bakiye yükle:** "Bakiye yükle" bölümünden yöntem seç:
   - **Havale/EFT (IBAN):** Tutarı seç, çıkan referans kodunu havale açıklamasına
     yaz, gönder. **Ödemen admin onayından sonra bakiyene eklenir** (anlık değil).
   - **Kart / Kripto:** Aktifse otomatik eklenir.
4. **Doğrula:** Bakiyenin yüklendiğini panelde gör; sonra `/v1/balance` ile de
   kontrol edebilirsin (Bölüm 2).

> Havale yaptıysan ve bakiye hemen görünmüyorsa bu normaldir; admin onayı
> beklenir. Onaylanınca otomatik yüklenir.

---

## Bölüm 2 — İlk testin: bağlantıyı doğrula (cURL)

Terminal (komut satırı) aç ve aşağıyı çalıştır. `yzk_live_SENIN_ANAHTARIN`
yerine kendi anahtarını yaz.

**a) Bakiyeni gör:**

```bash
curl https://yapayzekalab.org/v1/balance \
  -H "Authorization: Bearer yzk_live_SENIN_ANAHTARIN"
```

**b) Aktif modelleri gör:**

```bash
curl https://yapayzekalab.org/v1/models \
  -H "Authorization: Bearer yzk_live_SENIN_ANAHTARIN"
```

**c) İlk sohbet isteğin:**

```bash
curl -X POST https://yapayzekalab.org/v1/chat/completions \
  -H "Authorization: Bearer yzk_live_SENIN_ANAHTARIN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{ "role": "user", "content": "Merhaba!" }]
  }'
```

Yanıt OpenAI formatında bir JSON olur (`choices[0].message.content` içinde cevap).
Başarılıysa hesabından küçük bir miktar TL düşer.

---

## Bölüm 3 — Codex CLI ile kurulum (adım adım)

> "Codex CLI", OpenAI'nin terminal tabanlı kod asistanıdır. OpenAI-uyumlu
> herhangi bir gateway ile çalışır; biz de OpenAI-uyumlu olduğumuz için
> base URL + key'i bizimkiyle değiştirmen yeterli.

### 3.1 Kurulum

```bash
npm install -g @openai/codex
```

(Node.js 18+ gerekir. `node -v` ile kontrol et; yoksa https://nodejs.org'dan kur.)

### 3.2 YapayZekaLab'i tanıt (iki yol)

**Yol A — Ortam değişkeni (en hızlı):**

```bash
export OPENAI_BASE_URL="https://yapayzekalab.org/v1"
export OPENAI_API_KEY="yzk_live_SENIN_ANAHTARIN"
```

(Kalıcı olması için bu iki satırı `~/.zshrc` veya `~/.bashrc` dosyana ekle.)

**Yol B — Config dosyası** (`~/.codex/config.toml`):

```toml
model = "gpt-5.5"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
env_key = "OPENAI_API_KEY"
```

Sonra anahtarı ortam değişkeni olarak ver:

```bash
export OPENAI_API_KEY="yzk_live_SENIN_ANAHTARIN"
```

### 3.3 Çalıştır

```bash
codex
```

İlk soruyu sor (örn. "bu klasördeki dosyaları özetle"). Model olarak
katalogdaki bir ID kullan (örn. `gpt-5.4`, `claude-sonnet-4-6`, `gpt-5.5`).

> Not: Model adını `/v1/models` çıktısındaki **canonical** ID ile yaz
> (örn. `claude-sonnet-4-6`). Nokta-formu (`claude-sonnet-4.6`) da kabul edilir.

---

## Bölüm 4 — Claude Code ile kurulum (adım adım)

> "Claude Code", Anthropic'in terminal asistanıdır. Anthropic formatını
> (`/v1/messages`) kullanır. Gateway'imiz bu ucu destekler; base URL + token'ı
> bizimkiyle değiştir.

### 4.1 Kurulum

```bash
npm install -g @anthropic-ai/claude-code
```

### 4.2 YapayZekaLab'i tanıt (ortam değişkenleri)

```bash
export ANTHROPIC_BASE_URL="https://yapayzekalab.org"
export ANTHROPIC_AUTH_TOKEN="yzk_live_SENIN_ANAHTARIN"
export ANTHROPIC_MODEL="claude-sonnet-4-6"
export ANTHROPIC_SMALL_FAST_MODEL="claude-sonnet-4-6"
```

> Önemli ayrıntılar:
> - `ANTHROPIC_BASE_URL` köktür (`/v1` **eklenmez**); Claude Code yolu kendisi
>   `/v1/messages` olarak ekler.
> - `ANTHROPIC_AUTH_TOKEN` senin `yzk_live_...` anahtarındır (Bearer olarak gider).
> - Model olarak katalogdaki Claude modellerini kullan: `claude-sonnet-4-6`,
>   `claude-opus-4-7`, `claude-opus-4-6`, `claude-opus-4.8`. Nokta-form
>   (`claude-sonnet-4.6`) da kabul edilir.

### 4.3 Çalıştır

```bash
claude
```

### 4.4 Doğrudan Anthropic-format test (cURL)

```bash
curl -X POST https://yapayzekalab.org/v1/messages \
  -H "Authorization: Bearer yzk_live_SENIN_ANAHTARIN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 64,
    "messages": [{ "role": "user", "content": "Merhaba!" }]
  }'
```

> Sınır: `/v1/messages` şu an **akışsız (non-streaming)** yanıt döner — yani
> cevabın tamamı tek seferde gelir, kelime kelime akmaz. Sohbet ve kod yardımı
> sorunsuz çalışır; yalnızca canlı akış (typewriter efekti) bu uçta kapalıdır.

---

## Bölüm 5 — OpenAI SDK ile kod içi kullanım

### Python

```python
from openai import OpenAI

client = OpenAI(
    api_key="yzk_live_SENIN_ANAHTARIN",
    base_url="https://yapayzekalab.org/v1",
)

resp = client.chat.completions.create(
    model="claude-sonnet-4-6",
    messages=[{"role": "user", "content": "Merhaba!"}],
)
print(resp.choices[0].message.content)
```

### Node.js / TypeScript

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "yzk_live_SENIN_ANAHTARIN",
  baseURL: "https://yapayzekalab.org/v1",
});

const resp = await client.chat.completions.create({
  model: "gpt-5.4",
  messages: [{ role: "user", content: "Merhaba!" }],
});
console.log(resp.choices[0].message.content);
```

---

## Bölüm 6 — opencode ile kurulum

`opencode` (OpenAI-uyumlu sağlayıcı tanımı), `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "yapayzekalab/claude-sonnet-4-6",
  "provider": {
    "yapayzekalab": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "YapayZekaLab",
      "options": {
        "baseURL": "https://yapayzekalab.org/v1",
        "apiKey": "yzk_live_SENIN_ANAHTARIN"
      },
      "models": {
        "claude-sonnet-4-6": { "name": "Claude Sonnet 4.6" },
        "claude-opus-4-7": { "name": "Claude Opus 4.7" },
        "gpt-5.4": { "name": "GPT-5.4" },
        "gpt-5.5": { "name": "GPT-5.5" },
        "gemini-3.1-pro-preview": { "name": "Gemini 3.1 Pro Preview" }
      }
    }
  }
}
```

> Diğer istemciler (Cline, Roo Code, Kilo Code, Cursor): hepsinde "OpenAI
> Compatible" sağlayıcı seç, Base URL `https://yapayzekalab.org/v1`, API Key
> `yzk_live_...`, model olarak katalogdaki bir ID.

---

## Bölüm 7 — Endpoint referansı

| Endpoint | Açıklama |
|---|---|
| `GET /v1/models` | Aktif model kataloğu |
| `GET /v1/models/count` | Aktif model adedi |
| `GET /v1/providers` | Sağlayıcı özeti |
| `GET /v1/balance` | Kalan TL ve USD bakiye |
| `POST /v1/chat/completions` | Ana üretim endpointi (OpenAI formatı) |
| `POST /v1/messages` | Anthropic-uyumlu mesaj endpointi (Claude Code) |
| `POST /v1/responses` | Destekleniyorsa çalışır, yoksa güvenli JSON hata |
| `POST /v1/images/*` | Bu sürümde kapalı (501 JSON) |
| `POST /v1/videos/*` | Bu sürümde kapalı (501 JSON) |

Başarılı yanıt başlıkları: `X-YZ-Request-Id`, `X-YZ-Cost-TL`, `X-YZ-Remaining-TL`,
`X-YZ-Remaining-USD`.

---

## Bölüm 8 — Sık karşılaşılan hatalar

| Belirti | Sebep | Çözüm |
|---|---|---|
| `401 Valid yzk_live_ API key required` | Anahtar eksik/yanlış | `Authorization: Bearer yzk_live_...` doğru mu kontrol et |
| `401 Invalid API key` | Anahtar geçersiz/silinmiş | Panelden yeni anahtar üret |
| `402` / bakiye hatası | Bakiye yetersiz | Bakiye yükle (Bölüm 1) |
| `404 Model not found` | Model adı yanlış veya aktif sağlayıcıda yok | `/v1/models` ile doğru ID'yi seç |
| `404` (Claude Code) | `ANTHROPIC_MODEL` katalogda yok | Katalogdaki bir Claude modelini yaz |
| `503 proxy not configured` | Geçici upstream sorunu | Birkaç dakika sonra tekrar dene |

> Hata aldığında **ücret kesilmez**; yalnızca başarılı (200) yanıtlarda bakiye düşer.

---

## Bölüm 9 — 60 saniyede özet (hızlı başlangıç)

1. https://yapayzekalab.org → Google ile giriş.
2. Panelden `yzk_live_` anahtarını üret ve kaydet.
3. Bakiye yükle (havale yaptıysan admin onayını bekle).
4. `curl .../v1/balance` ile bakiyeni doğrula.
5. `curl .../v1/models` ile bir model ID seç.
6. `curl .../v1/chat/completions` ile ilk çağrını yap.
7. Aracını (Codex / Claude Code / opencode / OpenAI SDK) base URL + key ile kalıcı kur.
