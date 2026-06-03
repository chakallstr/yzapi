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
        osVariants: {
          windows: `curl.exe -X POST https://yapayzekalab.org/v1/chat/completions -H "Authorization: Bearer yzk_live_YOUR_KEY" -H "Content-Type: application/json" -d "{\\"model\\":\\"claude-opus-4-7\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"Merhaba, kisa bir test yaniti ver.\\"}],\\"max_tokens\\":120}"`,
          macos: `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4-7",
    "messages": [
      { "role": "user", "content": "Merhaba, kısa bir test yanıtı ver." }
    ],
    "max_tokens": 120
  }'`,
          linux: `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
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
      "Tüm OpenAI-uyumlu istemciler base URL + `yzk_live_` anahtarıyla çalışır (Codex CLI, Cline, Roo Code, Kilo Code, OpenCode, Cherry Studio, OpenAI SDK). Claude Code için Anthropic-uyumlu `/v1/messages` endpointi açıktır; `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` ile bağlanılır. Aktif katalog Claude modelleridir (`claude-opus-4.8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`); en sorunsuz deneyim Claude Code iledir. Tüm adresler `https://` olmalı — `http://` yazarsan istek yönlenirken kimlik doğrulama header'ı düşer ve istek 401 olur / akış asılı kalır.",
    clientCards: [
      {
        name: "Cline",
        type: "VS Code · OpenAI-compatible",
        steps: [
          "API Provider olarak `OpenAI Compatible` seç.",
          "Base URL alanına `https://yapayzekalab.org/v1` yaz.",
          "API Key alanına `yzk_live_...` anahtarını gir.",
          "Model ID olarak `claude-opus-4.8` (en güçlü), `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6` veya `claude-haiku-4-5-20251001` seç.",
        ],
      },
      {
        name: "Kilo Code",
        type: "VS Code · OpenAI-compatible",
        steps: [
          "API Provider olarak `OpenAI Compatible` seç (yeni arayüzde `Custom provider`).",
          "Base URL `https://yapayzekalab.org/v1`.",
          "API Key senin `yzk_live_...` anahtarın.",
          "Model olarak aktif katalogdan bir ID seç (örn. `claude-opus-4.8` en güçlü, `claude-opus-4-7`, `claude-sonnet-4-6`).",
        ],
      },
      {
        name: "OpenCode",
        type: "CLI · OpenAI-compatible",
        steps: [
          "Provider `@ai-sdk/openai-compatible` ile tanımlanır.",
          "Base URL `https://yapayzekalab.org/v1`.",
          "Model listene `claude-opus-4.8`, `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-opus-4-6` gibi aktif modelleri ekle.",
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
        "claude-opus-4.8": { "name": "claude-opus-4.8" },
        "claude-opus-4-7": { "name": "claude-opus-4-7" },
        "claude-sonnet-4-6": { "name": "claude-sonnet-4-6" },
        "claude-opus-4-6": { "name": "claude-opus-4-6" }
      }
    }
  }
}`,
      },
      {
        name: "Roo Code",
        type: "VS Code · OpenAI-compatible",
        steps: [
          "Settings → Providers → API Provider tipini `OpenAI Compatible` seç.",
          "Base URL TAM olarak `https://yapayzekalab.org/v1` olmalı — `https://` ile başlamalı ve sonunda `/v1` olmalı. ⚠️ `http://` YAZMA: istek https'e yönlenirken Authorization header düşer → 401, Roo Code 'API İsteği...' ekranında asılı kalır (ekrandaki donma tam budur).",
          "⚠️ KÖK adresi (`https://yapayzekalab.org`) YAZMA — o kural yalnızca Claude Code içindir. Roo Code'da kök yazarsan model listesi yüklenir ama her mesaj 404 verir; müşterilerin 'bağlanıyor ama cevap gelmiyor' şikayeti tam olarak budur. `/chat/completions` de EKLEME, Roo onu kendi ekler.",
          "API Key alanına `yzk_live_...` anahtarını gir.",
          "Model ID: `/v1/models` listesinden seç — en güçlü `claude-opus-4.8`, hızlı/ekonomik `claude-sonnet-4-6` ya da `claude-haiku-4-5-20251001` (`claude-opus-4-7` / `claude-opus-4-6` de geçerli).",
          "Cevap gelmiyorsa hızlı teşhis: 404 → Base URL yanlış (büyük ihtimalle kök yazdın, `/v1` ekle) · 402 → panelden TL bakiye yükle · 403 → erişim/doğrulama (hesap doğrulaman açıksa doğrula, değilse API key'i kontrol et).",
        ],
      },
      {
        name: "Cherry Studio",
        type: "Desktop · OpenAI-compatible",
        steps: [
          "Model sağlayıcısı olarak OpenAI-compatible profil aç.",
          "API adresine TAM yolu yaz ve `#` ile bitir → `https://yapayzekalab.org/v1/chat/completions#` (Cherry adresi aynen kullanır; en güvenli ve sürümden bağımsız yöntem budur).",
          "Alternatif: KÖK adresi yaz `https://yapayzekalab.org` — Cherry sürümün `/v1/chat/completions` yolunu otomatik ekler. Cevap gelmezse yukarıdaki `#`'li tam yola geç.",
          "API Key olarak `yzk_live_...` kullan.",
          "Model olarak `/v1/models`'tan gördüğün bir ID seç (örn. `claude-sonnet-4-6`).",
        ],
      },
      {
        name: "Codex CLI",
        type: "CLI · OpenAI-compatible",
        steps: [
          "Kurulum: `npm install -g @openai/codex`.",
          "Ortam değişkenlerini işletim sistemine göre ayarla (aşağıdaki sekmelerden kendi OS'unu seç).",
          "Veya `~/.codex/config.toml` içinde `model_provider` olarak base_url `https://yapayzekalab.org/v1` tanımla.",
          "Model olarak aktif katalogdan bir Claude ID kullan: `claude-opus-4.8` (en güçlü), `claude-opus-4-7`, `claude-sonnet-4-6` veya `claude-haiku-4-5-20251001`.",
          "Not: Codex bir OpenAI aracıdır; Claude modellerinde metadata uyarısı verebilir. Claude ile en sorunsuz deneyim için aşağıdaki Claude Code kartını tercih et.",
          "`codex` komutuyla başlat.",
        ],
        code: `# ~/.codex/config.toml
model = "claude-opus-4.8"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
env_key = "OPENAI_API_KEY"`,
        osVariants: {
          windows: `# PowerShell (bu oturum için)
# Önceki AI sağlayıcıdan kalan OPENAI_* değişkenlerini temizle:
Remove-Item Env:\\OPENAI_BASE_URL -ErrorAction SilentlyContinue; Remove-Item Env:\\OPENAI_API_KEY -ErrorAction SilentlyContinue
$env:OPENAI_BASE_URL="https://yapayzekalab.org/v1"
$env:OPENAI_API_KEY="yzk_live_YOUR_KEY"

# Kalıcı (kapat-aç sonrası geçerli):
setx OPENAI_BASE_URL "https://yapayzekalab.org/v1"
setx OPENAI_API_KEY "yzk_live_YOUR_KEY"

codex`,
          macos: `# Önceki AI sağlayıcıdan kalan OPENAI_* değişkenlerini temizle (bu kabuk):
unset OPENAI_BASE_URL OPENAI_API_KEY
export OPENAI_BASE_URL="https://yapayzekalab.org/v1"
export OPENAI_API_KEY="yzk_live_YOUR_KEY"
codex`,
          linux: `# Önceki AI sağlayıcıdan kalan OPENAI_* değişkenlerini temizle (bu kabuk):
unset OPENAI_BASE_URL OPENAI_API_KEY
export OPENAI_BASE_URL="https://yapayzekalab.org/v1"
export OPENAI_API_KEY="yzk_live_YOUR_KEY"
codex`,
        },
      },
      {
        name: "Claude Code",
        type: "CLI · Anthropic-compatible",
        steps: [
          "Kurulum: `npm install -g @anthropic-ai/claude-code`.",
          "Ortam değişkenlerini işletim sistemine göre ayarla (aşağıdaki Windows / macOS / Linux sekmelerinden kendi OS'unu seç — sözdizimi farklıdır).",
          "Base URL KÖK olmalı: `https://yapayzekalab.org` — `/v1` EKLEME, Claude Code yolu kendisi ekler.",
          "Anahtar `ANTHROPIC_AUTH_TOKEN`'a girer (Bearer olarak gider). `ANTHROPIC_API_KEY` KULLANMA — yanlış header gönderir ve auth çakışması olur.",
          "Daha önce başka bir AI sağlayıcı kullandıysan, eski `ANTHROPIC_*` ortam değişkenlerini ve `~/.claude/settings.json` içindeki eski `env` ayarlarını TEMİZLE — bunlar aşağıdaki ayarları ezip bağlantı hatasına yol açar (aşağıdaki sekmedeki temizleme satırları bunu yapar).",
          "`claude` komutuyla başlat. Not: `/v1/messages` akışsız (non-streaming) yanıt döner.",
        ],
        code: `export ANTHROPIC_BASE_URL="https://yapayzekalab.org"
export ANTHROPIC_AUTH_TOKEN="yzk_live_YOUR_KEY"
export ANTHROPIC_MODEL="claude-sonnet-4-6"
export ANTHROPIC_SMALL_FAST_MODEL="claude-sonnet-4-6"
claude`,
        osVariants: {
          windows: `# PowerShell — tum blogu yapistir, Enter tusuna bas. Hicbir sey kurulu degilse bile calisir.

# Claude Code kur / onar
irm https://claude.ai/install.ps1 | iex

# PATH'i bu oturumda yenile
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")

# claude hala yoksa npm fallback
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    winget install -e --id OpenJS.NodeJS.LTS
    Write-Host "Node kuruldu. PowerShell'i kapat-ac, bu blogu tekrar calistir."
    exit
  }
  npm install -g @anthropic-ai/claude-code@latest
  $npmPrefix = npm config get prefix
  $env:Path = "$env:Path;$npmPrefix"
}

# YapayZekaLab ayarlari
$Token = "yzk_live_YOUR_KEY"

# Onceki saglayicidan kalan anahtari temizle (oturum + kalici)
Remove-Item Env:\\ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $null, "User")

$env:ANTHROPIC_BASE_URL = "https://yapayzekalab.org"
$env:ANTHROPIC_AUTH_TOKEN = $Token
$env:ANTHROPIC_MODEL = "claude-opus-4-8"
$env:ANTHROPIC_SMALL_FAST_MODEL = "claude-sonnet-4-6"

[Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", "https://yapayzekalab.org", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN", $Token, "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_MODEL", "claude-opus-4-8", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_SMALL_FAST_MODEL", "claude-sonnet-4-6", "User")

# setx ile de kalici yaz (yeni pencerelerde de gecerli)
setx ANTHROPIC_BASE_URL "https://yapayzekalab.org" >$null
setx ANTHROPIC_AUTH_TOKEN "$Token" >$null
setx ANTHROPIC_MODEL "claude-opus-4-8" >$null
setx ANTHROPIC_SMALL_FAST_MODEL "claude-sonnet-4-6" >$null

# Onceki saglayici %USERPROFILE%\\.claude\\settings.json yazdiysa "env" blogundaki eski ANTHROPIC_* anahtarlarini sil.

where.exe claude
claude --version
claude`,
          macos: `setopt interactive_comments 2>/dev/null
# bash/zsh — tum blogu yapistir, Enter tusuna bas. Hicbir sey kurulu degilse bile calisir.

# Claude Code kur / onar
curl -fsSL https://claude.ai/install.sh | bash
export PATH="$HOME/.local/bin:$PATH"

# claude yoksa npm fallback
if ! command -v claude >/dev/null 2>&1; then
  if command -v npm >/dev/null 2>&1; then
    npm install -g @anthropic-ai/claude-code@latest
    export PATH="$(npm config get prefix)/bin:$PATH"
  else
    echo "Once Node.js kur (https://nodejs.org), sonra bu blogu tekrar calistir."
  fi
fi

# YapayZekaLab ayarlari
TOKEN="yzk_live_YOUR_KEY"

# Onceki saglayicidan kalanlari temizle (oturum + ~/.zshrc + settings.json notu)
unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN
sed -i '' -e '/^export ANTHROPIC_/d' ~/.zshrc 2>/dev/null

export ANTHROPIC_BASE_URL="https://yapayzekalab.org"
export ANTHROPIC_AUTH_TOKEN="$TOKEN"
export ANTHROPIC_MODEL="claude-opus-4-8"
export ANTHROPIC_SMALL_FAST_MODEL="claude-sonnet-4-6"

# Kalici yap (yeni terminallerde de gecerli)
{
  echo "export ANTHROPIC_BASE_URL=\\"https://yapayzekalab.org\\""
  echo "export ANTHROPIC_AUTH_TOKEN=\\"$TOKEN\\""
  echo "export ANTHROPIC_MODEL=\\"claude-opus-4-8\\""
  echo "export ANTHROPIC_SMALL_FAST_MODEL=\\"claude-sonnet-4-6\\""
} >> ~/.zshrc
# Eski saglayici ~/.claude/settings.json yazdiysa "env" blogundaki eski ANTHROPIC_* anahtarlarini sil.

which claude && claude --version
claude`,
          linux: `setopt interactive_comments 2>/dev/null
# bash/zsh — tum blogu yapistir, Enter tusuna bas. Hicbir sey kurulu degilse bile calisir.

# Claude Code kur / onar
curl -fsSL https://claude.ai/install.sh | bash
export PATH="$HOME/.local/bin:$PATH"

# claude yoksa npm fallback
if ! command -v claude >/dev/null 2>&1; then
  if command -v npm >/dev/null 2>&1; then
    npm install -g @anthropic-ai/claude-code@latest
    export PATH="$(npm config get prefix)/bin:$PATH"
  else
    echo "Once Node.js kur (https://nodejs.org), sonra bu blogu tekrar calistir."
  fi
fi

# YapayZekaLab ayarlari
TOKEN="yzk_live_YOUR_KEY"

# Onceki saglayicidan kalanlari temizle (oturum + ~/.bashrc + settings.json notu)
unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN
sed -i -e '/^export ANTHROPIC_/d' ~/.bashrc 2>/dev/null

export ANTHROPIC_BASE_URL="https://yapayzekalab.org"
export ANTHROPIC_AUTH_TOKEN="$TOKEN"
export ANTHROPIC_MODEL="claude-opus-4-8"
export ANTHROPIC_SMALL_FAST_MODEL="claude-sonnet-4-6"

# Kalici yap (yeni terminallerde de gecerli)
{
  echo "export ANTHROPIC_BASE_URL=\\"https://yapayzekalab.org\\""
  echo "export ANTHROPIC_AUTH_TOKEN=\\"$TOKEN\\""
  echo "export ANTHROPIC_MODEL=\\"claude-opus-4-8\\""
  echo "export ANTHROPIC_SMALL_FAST_MODEL=\\"claude-sonnet-4-6\\""
} >> ~/.bashrc
# Eski saglayici ~/.claude/settings.json yazdiysa "env" blogundaki eski ANTHROPIC_* anahtarlarini sil.

which claude && claude --version
claude`,
        },
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
    "model": "claude-opus-4-7",
    "messages": [
      { "role": "system", "content": "Kısa ve net yanıt ver." },
      { "role": "user", "content": "Bir satırlık selam ver." }
    ],
    "max_tokens": 120
  }'`,
        osVariants: {
          windows: `curl.exe -X POST https://yapayzekalab.org/v1/chat/completions -H "Authorization: Bearer yzk_live_YOUR_KEY" -H "Content-Type: application/json" -d "{\\"model\\":\\"claude-opus-4-7\\",\\"messages\\":[{\\"role\\":\\"system\\",\\"content\\":\\"Kisa ve net yanit ver.\\"},{\\"role\\":\\"user\\",\\"content\\":\\"Bir satirlik selam ver.\\"}],\\"max_tokens\\":120}"`,
          macos: `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4-7",
    "messages": [
      { "role": "system", "content": "Kısa ve net yanıt ver." },
      { "role": "user", "content": "Bir satırlık selam ver." }
    ],
    "max_tokens": 120
  }'`,
          linux: `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4-7",
    "messages": [
      { "role": "system", "content": "Kısa ve net yanıt ver." },
      { "role": "user", "content": "Bir satırlık selam ver." }
    ],
    "max_tokens": 120
  }'`,
        },
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
    model="claude-haiku-4-5-20251001",
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
      { key: "POST /v1/web-search", value: "Güncel web araması (arama başına sabit ücret)" },
      { key: "POST /v1/images/*", value: "Bu geçişte kapalı, 501 JSON hata döner" },
      { key: "POST /v1/videos/*", value: "Bu geçişte kapalı, 501 JSON hata döner" },
    ],
    codeBlocks: [
      {
        language: "bash",
        title: "Bakiye sorgusu",
        code: `curl https://yapayzekalab.org/v1/balance \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY"`,
        osVariants: {
          windows: `curl.exe https://yapayzekalab.org/v1/balance -H "Authorization: Bearer yzk_live_YOUR_KEY"`,
          macos: `curl https://yapayzekalab.org/v1/balance \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY"`,
          linux: `curl https://yapayzekalab.org/v1/balance \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY"`,
        },
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
    key: "web-search",
    label: "Web arama (güncel bilgi)",
    title: "Web arama ile güncel bilgi (web_search)",
    intro:
      "Modelin eğitim verisi dışındaki güncel bilgileri (kim, son durum, fiyat, sürüm, haber) cevaplaması için iki yol var: (1) `chat/completions` isteğine `web_search: true` ekleyerek otomatik zenginleştirme — güncel bir soru sezilirse arka planda arama yapılır, sonuçlar modele kaynak olarak verilir ve model atıflı ([1], [2]) cevap üretir; (2) ayrı `POST /v1/web-search` ucu — yalnız arama sonuçlarını döndürür. Her ikisinde de arama başına sabit ücret alınır (token ücretinden ayrı).",
    referenceRows: [
      { key: "web_search: true", value: "chat/completions içinde otomatik mod (güncel soruda arar)" },
      { key: 'web_search: { mode: "always" }', value: "Her istekte arama yapar" },
      { key: 'web_search: { mode: "auto", num: 5 }', value: "Sezgisel mod + sonuç sayısı (1–10)" },
      { key: "POST /v1/web-search", value: "Standalone arama: { query, num } → sonuç listesi" },
      { key: "Ücret", value: "Arama başına sabit 0.001 USD (sonuç dönmezse ücret alınmaz)" },
    ],
    bullets: [
      "`web_search: true` varsayılan olarak `auto` moddur: yalnız güncel/aktüel görünen sorularda arama tetiklenir, sıradan sorularda arama yapılmaz (gereksiz ücret oluşmaz).",
      "Otomatik modda arama maliyeti, normal token maliyetine EK olarak arama başına 0.001 USD’dir; enjekte edilen sonuçlar girişi büyüttüğü için token maliyeti de bir miktar artar.",
      "Arama sonuç döndürmezse ücret alınmaz; yanıt yine üretilir.",
      "Standalone `/v1/web-search` yalnız başlık, bağlantı ve özet döndürür; modeli çağırmaz.",
      "Streaming (`stream: true`) isteklerinde otomatik web arama uygulanmaz; standalone ucu veya akışsız çağrıyı kullanın.",
    ],
    codeBlocks: [
      {
        language: "bash",
        title: "chat/completions · otomatik web arama",
        code: `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-6",
    "web_search": true,
    "messages": [
      { "role": "user", "content": "En guncel OpenAI modeli hangisi?" }
    ]
  }'`,
      },
      {
        language: "bash",
        title: "Standalone /v1/web-search",
        code: `curl -X POST https://yapayzekalab.org/v1/web-search \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "query": "güncel dolar kuru", "num": 5 }'`,
      },
      {
        language: "json",
        title: "Standalone arama cevabı",
        code: `{
  "object": "web_search",
  "query": "güncel dolar kuru",
  "results": [
    { "title": "...", "url": "https://...", "snippet": "...", "position": 1 }
  ],
  "cost": { "tl": "0.0484", "usd": "0.00100000" }
}`,
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

export const OS_LABELS = { windows: "Windows (PowerShell)", macos: "macOS", linux: "Linux" };
const OS_ORDER = ["windows", "macos", "linux"];

// Bir kod bloğunu düz metne çevirir. osVariants varsa her OS'u kendi başlığıyla
// yazar (Windows/macOS/Linux); yoksa tek `code`'u basar.
const codeToPlainText = (entry) => {
  if (entry?.osVariants) {
    return OS_ORDER
      .filter((os) => entry.osVariants[os])
      .map((os) => `### ${OS_LABELS[os]}\n${entry.osVariants[os]}`)
      .join("\n\n");
  }
  return entry?.code ?? "";
};

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
        if (card.osVariants || card.code) parts.push("", codeToPlainText(card));
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
        parts.push("", block.title, "", codeToPlainText(block));
      });
    }

    return parts.join("\n");
  }).join("\n\n--------------------\n\n");
