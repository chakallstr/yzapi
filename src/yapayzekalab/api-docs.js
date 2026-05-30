export const API_DOC_SECTIONS = [
  {
    key: "quickstart",
    label: "Hızlı başlangıç",
    title: "API bağlantısını 5 dakikada kur",
    intro:
      "YapayZekaLab, geniş bir model kataloğunu tek API anahtarıyla sunar. Kendi hesabından `yzk_live_` anahtarını üret, bakiyeni yükle ve doğrudan üretim endpointlerine bağlan.",
    bullets: [
      "Base URL: `https://yapayzekalab.org/v1`",
      "Yetkilendirme: `Authorization: Bearer yzk_live_YOUR_KEY`",
      "Ana metin endpointi: `/v1/chat/completions`",
      "Bakiye sorgu endpointi: `/v1/balance`",
      "Modelleri canlı çekmek için: `/v1/models`",
      "Başlamadan önce panelden kendi API anahtarını oluştur ve hesabında kullanılabilir bakiye bulundur.",
    ],
    codeBlocks: [
      {
        language: "bash",
        title: "İlk test isteği",
        code: `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4-7",
    "messages": [
      { "role": "user", "content": "Merhaba, kısa bir test yanıtı ver." }
    ],
    "max_tokens": 120
  }'`,
      },
    ],
  },
  {
    key: "auth",
    label: "Kimlik doğrulama",
    title: "API anahtarı ve bağlantı mantığı",
    intro:
      "YapayZekaLab herkese açık ortak bir anahtar kullanmaz. Her kullanıcı kendi panelinden ürettiği `yzk_live_` anahtarıyla bağlanır. Bu anahtar kullanıcı bakiyesine, kullanım kayıtlarına ve limit kontrolüne bağlıdır.",
    bullets: [
      "Anahtar biçimi `yzk_live_` ile başlar.",
      "Anahtar yalnız sana aittir; başka kullanıcı verisine erişim vermez.",
      "Bakiyen biterse istekler durur; sistem ücretsiz sınırsız kullanım açmaz.",
      "Geçersiz, iptal edilmiş veya askıya alınmış anahtar `401` alır.",
      "Admin panelinde oluşturulan anahtarlar da kullanıcı hesabına bağlı çalışır.",
    ],
    codeBlocks: [
      {
        language: "bash",
        title: "Header örneği",
        code: `Authorization: Bearer yzk_live_YOUR_KEY`,
      },
    ],
  },
  {
    key: "clients",
    label: "Desteklenen istemciler",
    title: "Desteklenen istemciler ve bağlantı parametreleri",
    intro:
      "Tüm OpenAI-uyumlu istemciler base URL + `yzk_live_` anahtarıyla çalışır (Codex CLI, Cline, Roo Code, Kilo Code, OpenCode, Cherry Studio, OpenAI SDK). Claude Code için Anthropic-uyumlu `/v1/messages` endpointi açıktır; `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` ile bağlanılır.",
    clientCards: [
      {
        name: "Cline",
        type: "VS Code · OpenAI-compatible",
        steps: [
          "API Provider olarak `OpenAI Compatible` seç.",
          "Base URL alanına `https://yapayzekalab.org/v1` yaz.",
          "API Key alanına `yzk_live_...` anahtarını gir.",
          "Model ID olarak `claude-opus-4-7`, `claude-sonnet-4-6`, `gpt-5.5` veya `gemini-3.1-pro-preview` seç.",
        ],
      },
      {
        name: "Kilo Code",
        type: "VS Code · OpenAI-compatible",
        steps: [
          "API Provider olarak `OpenAI Compatible` seç (yeni arayüzde `Custom provider`).",
          "Base URL `https://yapayzekalab.org/v1`.",
          "API Key senin `yzk_live_...` anahtarın.",
          "Model olarak aktif katalogdan bir ID seç (örn. `claude-sonnet-4-6`, `gpt-5.5`).",
        ],
      },
      {
        name: "OpenCode",
        type: "CLI · OpenAI-compatible",
        steps: [
          "Provider `@ai-sdk/openai-compatible` ile tanımlanır.",
          "Base URL `https://yapayzekalab.org/v1`.",
          "Model listene `claude-opus-4-7`, `claude-sonnet-4-6`, `gpt-5.5` gibi aktif modelleri ekle.",
        ],
        code: `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "yapayzekalab": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://yapayzekalab.org/v1",
        "apiKey": "yzk_live_YOUR_KEY"
      },
      "models": {
        "claude-opus-4-7": { "name": "claude-opus-4-7" },
        "claude-sonnet-4-6": { "name": "claude-sonnet-4-6" },
        "gpt-5.5": { "name": "gpt-5.5" }
      }
    }
  }
}`,
      },
      {
        name: "Roo Code",
        type: "VS Code · OpenAI-compatible",
        steps: [
          "Settings → Providers içine gir.",
          "API Provider tipi `OpenAI Compatible` olsun.",
          "Base URL `https://yapayzekalab.org/v1`.",
          "API Key olarak `yzk_live_...` kullan.",
          "Model olarak `/v1/models` listesinden bir ID seç (örn. `claude-sonnet-4-6`, `gpt-5.5`, `claude-opus-4-7`).",
        ],
      },
      {
        name: "Cherry Studio",
        type: "Desktop · OpenAI-compatible",
        steps: [
          "Model sağlayıcısı olarak OpenAI-compatible profil aç.",
          "API adresine KÖK adresi yaz: `https://yapayzekalab.org` — Cherry `/v1/chat/completions` yolunu kendisi ekler.",
          "Alternatif: tam yolu `#` ile bitir → `https://yapayzekalab.org/v1/chat/completions#` (Cherry adresi aynen kullanır).",
          "API Key olarak `yzk_live_...` kullan.",
          "Model olarak `/v1/models`'tan gördüğün bir ID seç (örn. `claude-sonnet-4-6`).",
        ],
      },
      {
        name: "Codex CLI",
        type: "CLI · OpenAI-compatible",
        steps: [
          "Kurulum: `npm install -g @openai/codex`.",
          "Ortam: `export OPENAI_BASE_URL=\"https://yapayzekalab.org/v1\"` ve `export OPENAI_API_KEY=\"yzk_live_...\"`.",
          "Veya `~/.codex/config.toml` içinde `model_provider` olarak base_url `https://yapayzekalab.org/v1` tanımla.",
          "Model olarak katalogdaki bir ID kullan: `gpt-5.4`, `claude-sonnet-4-6`, `gpt-5.5`.",
          "`codex` komutuyla başlat.",
        ],
        code: `# ~/.codex/config.toml
model = "gpt-5.4"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
env_key = "OPENAI_API_KEY"`,
      },
      {
        name: "Claude Code",
        type: "CLI · Anthropic-compatible",
        steps: [
          "Kurulum: `npm install -g @anthropic-ai/claude-code`.",
          "`export ANTHROPIC_BASE_URL=\"https://yapayzekalab.org\"` (kök — `/v1` EKLEME, Claude Code kendisi ekler).",
          "`export ANTHROPIC_AUTH_TOKEN=\"yzk_live_...\"` (senin API anahtarın, Bearer olarak gider).",
          "`export ANTHROPIC_MODEL=\"claude-sonnet-4-6\"` ve `ANTHROPIC_SMALL_FAST_MODEL=\"claude-sonnet-4-6\"`.",
          "`claude` komutuyla başlat. Not: `/v1/messages` akışsız (non-streaming) yanıt döner.",
        ],
        code: `export ANTHROPIC_BASE_URL="https://yapayzekalab.org"
export ANTHROPIC_AUTH_TOKEN="yzk_live_YOUR_KEY"
export ANTHROPIC_MODEL="claude-sonnet-4-6"
export ANTHROPIC_SMALL_FAST_MODEL="claude-sonnet-4-6"
claude`,
      },
    ],
  },
  {
    key: "sdk",
    label: "SDK örnekleri",
    title: "cURL, Node.js ve Python ile bağlan",
    intro:
      "En hızlı başlangıç cURL ile olur. Uygulamaya geçerken OpenAI uyumlu istemcilerde yalnızca base URL ve model adını değiştirmen yeterlidir.",
    codeBlocks: [
      {
        language: "bash",
        title: "cURL · chat/completions",
        code: `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.5",
    "messages": [
      { "role": "system", "content": "Kısa ve net yanıt ver." },
      { "role": "user", "content": "Bir satırlık selam ver." }
    ],
    "max_tokens": 120
  }'`,
      },
      {
        language: "javascript",
        title: "Node.js · OpenAI SDK",
        code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "yzk_live_YOUR_KEY",
  baseURL: "https://yapayzekalab.org/v1",
});

const response = await client.chat.completions.create({
  model: "claude-sonnet-4-6",
  messages: [
    { role: "user", content: "Kısa bir ürün açıklaması yaz." }
  ],
  max_tokens: 220,
});

console.log(response.choices[0]?.message?.content);`,
      },
      {
        language: "python",
        title: "Python · OpenAI istemcisi",
        code: `from openai import OpenAI

client = OpenAI(
    api_key="yzk_live_YOUR_KEY",
    base_url="https://yapayzekalab.org/v1",
)

response = client.chat.completions.create(
    model="gemini-3.1-pro-preview",
    messages=[
        {"role": "user", "content": "3 maddelik özet çıkar."}
    ],
    max_tokens=180,
)

print(response.choices[0].message.content)`,
      },
    ],
  },
  {
    key: "endpoints",
    label: "Endpoint yüzeyi",
    title: "Aktif endpointler ve davranışları",
    intro:
      "Dış yüzey tek v1 gateway’dir. Auth’suz istekler reddedilir. Başarılı JSON yanıtlarında maliyet ve kalan bakiye header’ları döner.",
    referenceRows: [
      { key: "GET /v1/models", value: "Aktif model kataloğu" },
      { key: "GET /v1/models/count", value: "Aktif model adedi" },
      { key: "GET /v1/providers", value: "Sağlayıcı özeti" },
      { key: "GET /v1/balance", value: "Kalan TL ve USD bakiye" },
      { key: "POST /v1/chat/completions", value: "Ana üretim endpointi" },
      { key: "POST /v1/messages", value: "Anthropic uyumlu mesaj endpointi" },
      { key: "POST /v1/responses", value: "Destek varsa çalışır, değilse güvenli JSON hata döner" },
      { key: "POST /v1/images/*", value: "Bu geçişte kapalı, 501 JSON hata döner" },
      { key: "POST /v1/videos/*", value: "Bu geçişte kapalı, 501 JSON hata döner" },
    ],
    codeBlocks: [
      {
        language: "bash",
        title: "Bakiye sorgusu",
        code: `curl https://yapayzekalab.org/v1/balance \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY"`,
      },
      {
        language: "json",
        title: "Başarılı bakiye cevabı",
        code: `{
  "object": "balance",
  "balance": {
    "tl": "473.00",
    "usd": "10.0042"
  },
  "currency": {
    "primary": "USD",
    "settlement": "TRY",
    "kur": "47.279822"
  }
}`,
      },
    ],
  },
  {
    key: "headers",
    label: "Bakiye ve billing",
    title: "Maliyet ve kalan bakiye nasıl izlenir",
    intro:
      "Başarılı çağrılarda yanıt header’ları bakiye takibi için yeterlidir. Kullanıcı bakiyesi bittiğinde sistem isteği upstream maliyet doğurmadan önce bloklar.",
    bullets: [
      "`X-YZ-Cost-TL` → çağrının TL maliyeti",
      "`X-YZ-Remaining-TL` → çağrı sonrası kalan TL bakiye",
      "`X-YZ-Remaining-USD` → çağrı sonrası kalan USD eşdeğeri",
      "`X-YZ-Request-Id` → destek ve log eşleştirme kimliği",
      "Geçersiz veya bakiyesi bitmiş anahtar `401` ya da güvenli yetersiz bakiye hatası alır.",
      "Başarılı JSON çağrılarında bu header’lar döner; hata senaryolarında güvenli JSON cevap üretilir.",
    ],
    codeBlocks: [
      {
        language: "text",
        title: "Örnek response header seti",
        code: `X-YZ-Cost-TL: 0.4182
X-YZ-Remaining-TL: 472.58
X-YZ-Remaining-USD: 9.9961
X-YZ-Request-Id: req_123456789`,
      },
    ],
  },
  {
    key: "streaming",
    label: "Streaming",
    title: "Streaming çağrılarında davranış",
    intro:
      "Streaming isteklerinde sistem önce güvenli rezervasyon yapar, sonra gerçek kullanım geldiğinde mahsuplaşır. Bu yüzden bakiye bittiğinde ücretsiz uzun akış açık kalmaz.",
    bullets: [
      "İstek başlamadan önce güvenli kullanım rezervi hesaplanır.",
      "Provider son kullanım bilgisi verirse gerçek kullanım üzerinden kayıt tutulur.",
      "Provider usage eksikse güvenli fallback hesap devreye girer.",
      "Yetersiz bakiye varsa stream başlamadan çağrı bloklanır.",
      "Görsel ve video stream akışları bu sürümde aktif değildir.",
    ],
  },
  {
    key: "models",
    label: "Model kataloğu",
    title: "Aktif modeller",
    intro:
      "Aşağıdaki liste şu an aktif sağlayıcıda kullanılabilen modelleri gösterir. Tam ve güncel liste için her zaman `/v1/models` ucunu kullan — aktif sağlayıcı değişirse liste de değişir.",
    modelGroups: [
      {
        family: "Claude (Anthropic)",
        models: [
          "claude-opus-4.8",
          "claude-opus-4-7",
          "claude-opus-4-6",
          "claude-sonnet-4-6",
          "claude-haiku-4-5-20251001",
        ],
      },
      {
        family: "GPT (OpenAI)",
        models: [
          "gpt-5.5",
          "gpt-5.4",
        ],
      },
      {
        family: "Gemini (Google)",
        models: [
          "gemini-3.1-pro-preview",
          "gemini-3.5-flash",
        ],
      },
    ],
  },
  {
    key: "errors",
    label: "Hatalar",
    title: "Sık görülen hata cevapları",
    intro:
      "İstemcini kurarken en çok yetkilendirme, bakiye ve desteklenmeyen endpoint durumlarıyla karşılaşırsın. Aşağıdaki özet beklenen güvenli davranışı gösterir.",
    referenceRows: [
      { key: "401", value: "API key yok, hatalı, askıda veya iptal edilmiş" },
      { key: "402 / güvenli bakiye hatası", value: "Kullanım için yeterli bakiye yok" },
      { key: "404", value: "Bilinmeyen / desteklenmeyen v1 route" },
      { key: "501", value: "Görsel veya video endpointi bu geçişte kapalı" },
      { key: "503", value: "Upstream proxy veya özel entegrasyon henüz yapılandırılmamış" },
    ],
  },
  {
    key: "workflow",
    label: "Kurulum akışı",
    title: "Sıfırdan çalışan kurulum sırası",
    intro:
      "Dökümanı ilk kez okuyan biri için en kısa güvenli akış aşağıdaki gibidir.",
    ordered: true,
    bullets: [
      "Google ile giriş yap.",
      "Hesap panelinden `yzk_live_` anahtarını oluştur.",
      "Bakiye yükle ve panelde onaylandığını gör.",
      "`/v1/balance` ile kalan bakiyeni doğrula.",
      "`/v1/models` ile aktif modeli seç.",
      "`/v1/chat/completions` ile ilk küçük metin çağrını yap.",
      "Gerekirse istemcini kalıcı kur: Codex CLI veya Claude Code (CLI), ya da `Cline`, `Kilo Code`, `OpenCode`, `Roo Code` (VS Code/CLI).",
    ],
  },
  {
    key: "notes",
    label: "Önemli notlar",
    title: "Kullanım notları ve sınırlar",
    intro:
      "Dokümantasyon sade tutuldu, ama davranış nettir: kritik limitler backend’de uygulanır ve frontend kopyası tek başına güvence sayılmaz.",
    bullets: [
      "API anahtarı formatı `yzk_live_` ile başlar.",
      "Yeni entegrasyonda önce `/v1/models` ve `/v1/balance` ile doğrulama yap.",
      "Streaming destekleyen istemcilerde model uyumluluğunu katalogdan seç.",
      "Gerçek canlı akışta görsel ve video çağrılarını bu sürümde açma; kapalıdır.",
      "Yasal metinler, KVKK ve satış koşulları footer bağlantılarında ayrıca bulunur.",
      "Sorun yaşarsan `X-YZ-Request-Id` değerini destek ekibine iletmek hata ayıklamayı hızlandırır.",
    ],
  },
];

export const buildApiDocsPlainText = () =>
  API_DOC_SECTIONS.map((section) => {
    const parts = [section.title, "", section.intro];

    if (section.bullets?.length) {
      parts.push("", ...section.bullets.map((bullet) => `- ${bullet}`));
    }

    if (section.referenceRows?.length) {
      section.referenceRows.forEach((row) => {
        parts.push(`- ${row.key}: ${row.value}`);
      });
    }

    if (section.clientCards?.length) {
      section.clientCards.forEach((card) => {
        parts.push("", `${card.name} — ${card.type}`);
        card.steps.forEach((step) => parts.push(`- ${step}`));
        if (card.code) parts.push("", card.code);
      });
    }

    if (section.modelGroups?.length) {
      section.modelGroups.forEach((group) => {
        parts.push("", group.family);
        group.models.forEach((model) => parts.push(`- ${model}`));
      });
    }

    if (section.codeBlocks?.length) {
      section.codeBlocks.forEach((block) => {
        parts.push("", block.title, "", block.code);
      });
    }

    return parts.join("\n");
  }).join("\n\n--------------------\n\n");
