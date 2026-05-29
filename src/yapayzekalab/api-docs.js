export const API_DOC_SECTIONS = [
  {
    key: "quickstart",
    label: "Hızlı başlangıç",
    title: "API bağlantısını 5 dakikada kur",
    intro:
      "YapayZekaLab, Claude Popusk model kataloğunu tek API anahtarıyla sunar. Kendi hesabından `yzk_live_` anahtarını üret, bakiyeni yükle ve doğrudan üretim endpointlerine bağlan.",
    bullets: [
      "Base URL: `https://yapayzekalab.org/v1`",
      "Yetkilendirme: `Authorization: Bearer yzk_live_YOUR_KEY`",
      "Ana metin endpointi: `/v1/chat/completions`",
      "Bakiye sorgu endpointi: `/v1/balance`",
      "Modelleri canlı çekmek için: `/v1/models`",
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
    key: "clients",
    label: "Desteklenen istemciler",
    title: "Desteklenen istemciler ve bağlantı parametreleri",
    intro:
      "Claude Popusk dökümanındaki istemci akışını YapayZekaLab için uyarladık. Kararlı yol OpenAI-uyumlu istemcilerdir; Anthropic uyumlu kullanım için `/v1/messages` endpointi ayrıca açıktır.",
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
          "Authentication yöntemi `API Key` olmalı.",
          "Base URL `https://yapayzekalab.org/v1`.",
          "API Key senin `yzk_live_...` anahtarın.",
          "Model alanına aktif katalogdaki metin modellerinden birini yaz.",
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
          "Provider tipi `OpenAI Compatible` olsun.",
          "Base URL `https://yapayzekalab.org/v1`.",
          "API Key olarak `yzk_live_...` kullan.",
        ],
      },
      {
        name: "Claude Code",
        type: "CLI · not",
        steps: [
          "Claude Code için Anthropic-native oturum akışı gerekir.",
          "Bu yayındaki kararlı dokümantasyon OpenAI-uyumlu istemcilere odaklanır.",
          "Anthropic uyumlu iş akışlarında `/v1/messages` endpointini destekleyen istemciler kullanılabilir.",
        ],
      },
    ],
  },
  {
    key: "endpoints",
    label: "Endpoint yüzeyi",
    title: "Aktif endpointler ve davranışları",
    intro:
      "Dış yüzey tek v1 gateway’dir. Auth’suz istekler reddedilir. Başarılı JSON yanıtlarında maliyet ve kalan bakiye header’ları döner.",
    bullets: [
      "`GET /v1/models` → aktif model kataloğu",
      "`GET /v1/models/count` → aktif model adedi",
      "`GET /v1/providers` → sağlayıcı özeti",
      "`GET /v1/balance` → kalan TL ve USD bakiye",
      "`POST /v1/chat/completions` → ana üretim endpointi",
      "`POST /v1/messages` → Anthropic uyumlu mesaj endpointi",
      "`POST /v1/responses` → destek varsa çalışır, aksi durumda güvenli JSON hata döner",
      "`/v1/images/*` ve `/v1/videos/*` → bu geçişte kapalı, 501 JSON hata döner ve ücret yazmaz",
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
    ],
  },
  {
    key: "models",
    label: "Model kataloğu",
    title: "Öne çıkan aktif modeller",
    intro:
      "Tam canlı katalog için `/v1/models` kullanılmalı. Aşağıdaki liste, YapayZekaLab içinde öne çıkarılan Claude Popusk uyumlu metin modellerini gösterir.",
    modelGroups: [
      {
        family: "Claude",
        models: [
          "claude-opus-4-7",
          "claude-opus-4-6",
          "claude-sonnet-4-6",
          "claude-haiku-4-5-20251001",
        ],
      },
      {
        family: "GPT",
        models: [
          "gpt-5.5",
          "gpt-5.5-2026-04-23",
          "gpt-5.4",
          "gpt-5.4-mini",
          "gpt-5.4-nano",
          "gpt-5.3-chat-latest",
        ],
      },
      {
        family: "o-series",
        models: [
          "o4-mini",
          "o3",
          "o3-mini",
        ],
      },
      {
        family: "Gemini",
        models: [
          "gemini-3.1-pro-preview",
          "gemini-3.1-pro-preview-customtools",
          "gemini-3-pro-preview",
          "gemini-3-flash-preview",
        ],
      },
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
    ],
  },
];

export const buildApiDocsPlainText = () =>
  API_DOC_SECTIONS.map((section) => {
    const parts = [section.title, "", section.intro];

    if (section.bullets?.length) {
      parts.push("", ...section.bullets.map((bullet) => `- ${bullet}`));
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
