// API dokümantasyon içeriği. tab-documents.jsx bu diziyi sırayla "Adım 1, 2, 3…"
// kartları olarak render eder — yani buradaki dizi sırası = sayfadaki adım sırası.
// Yeni kullanıcı önce aracını bağlamak ister; bu yüzden "clients" (istemci kurulumu)
// bilerek EN BAŞTA (Adım 1) tutulur.
export const API_DOC_SECTIONS = [
  {
    key: "clients",
    label: "Aracını bağla",
    title: "Aracını YapayZekaLab'e bağla (istemci kurulumu)",
    intro:
      "Buradan bilgisayarındaki yapay zekâ aracını YapayZekaLab'e bağlarsın. Bağlamak için iki şey gerekir: bir **Base URL** (bağlanılacak adres) ve senin **API anahtarın** (`yzk_live_` ile başlar). Henüz anahtarın yoksa: önce **Hesap** sayfasından bir anahtar oluştur ve TL bakiye yükle, sonra buraya dön. Giriş yaptıysan aşağıdaki örneklere kendi anahtarın otomatik gömülür. İki tür araç var: (1) **Terminal araçları** (Claude Code, Codex, OpenCode) — aşağıdaki kod bloğunu olduğu gibi kopyala, terminale yapıştır, Enter'a bas; hiçbir şey kurulu olmasa bile blok kendisi kurar. (2) **Editör eklentileri** (Cline, Kilo Code, Roo Code, Cherry Studio) — ayar ekranına Base URL ve anahtarı yapıştırırsın. Tek kural: adres her zaman `https://` ile başlamalı; `http://` yazma — istek yönlenirken anahtarın düşer ve bağlantı 401 verir ya da yanıt asılı kalır.",
    clientCards: [
      {
        name: "Claude Code",
        type: "Terminal (CLI) · Anthropic uyumlu · en sorunsuz deneyim",
        surface: "cli",
        steps: [
          "İşletim sistemini seç (Windows / macOS / Linux) — alttaki sekmeler. Komut sözdizimi her sistemde farklıdır.",
          "Seçtiğin sekmedeki bloğun TAMAMINI kopyala, terminale (Windows'ta PowerShell) yapıştır ve Enter'a bas. Bilgisayarında Node.js veya Claude Code kurulu olmasa bile blok önce onu kurar, sonra ayarları yapar.",
          "Blokta yalnızca `yzk_live_YOUR_KEY` yazan yeri kendi anahtarınla değiştir. (Giriş yaptıysan zaten senin anahtarın gömülüdür, dokunmana gerek yok.)",
          "Blok bitince ekranda `claude` başlar. Bundan sonra her terminalde `claude` yazıp Enter'la açarsın.",
          "Önemli: Claude Code'da adres KÖK olmalı — `https://yapayzekalab.org` (sonuna `/v1` EKLEME, Claude Code yolu kendi ekler). Anahtar `ANTHROPIC_AUTH_TOKEN`'a girer, `ANTHROPIC_API_KEY`'e DEĞİL.",
        ],
        code: `export ANTHROPIC_BASE_URL="https://yapayzekalab.org"
export ANTHROPIC_AUTH_TOKEN="yzk_live_YOUR_KEY"
export ANTHROPIC_MODEL="claude-opus-4-8"
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
      {
        name: "Codex CLI",
        type: "Terminal (CLI) · OpenAI uyumlu",
        surface: "cli",
        steps: [
          "İşletim sistemini seç (Windows / macOS / Linux), bloğun tamamını kopyala, terminale yapıştır, Enter'a bas. Codex kurulu değilse blok `npm install -g @openai/codex` ile kurar.",
          "Blok senin için `~/.codex/config.toml` dosyasına YapayZekaLab sağlayıcısını yazar ve anahtarını ayarlar (varsa eski config'i `.bak` olarak yedekler).",
          "Yalnızca `yzk_live_YOUR_KEY` yazan yeri kendi anahtarınla değiştir.",
          "Blok bitince `codex` başlar. Not: Codex bir OpenAI aracıdır; Claude modellerinde ufak uyumluluk uyarısı verebilir — en sorunsuz deneyim için yukarıdaki Claude Code kartını tercih et.",
        ],
        osVariants: {
          windows: `# PowerShell — tum blogu yapistir, Enter tusuna bas. Hicbir sey kurulu degilse bile calisir.

# Codex kur (Node gerekir)
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm install -g @openai/codex
  } else {
    winget install -e --id OpenJS.NodeJS.LTS
    Write-Host "Node kuruldu. PowerShell'i kapat-ac, bu blogu tekrar calistir."
    exit
  }
}

# YapayZekaLab saglayicisini ~/.codex/config.toml'a yaz (varsa yedekle)
$cfgDir = "$env:USERPROFILE\\.codex"
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
if (Test-Path "$cfgDir\\config.toml") { Copy-Item "$cfgDir\\config.toml" "$cfgDir\\config.toml.bak" -Force }
@'
model = "claude-opus-4-8"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
env_key = "OPENAI_API_KEY"
'@ | Set-Content -Encoding utf8 "$cfgDir\\config.toml"

# Anahtari ayarla (Codex bunu config'teki env_key ile okur)
$env:OPENAI_API_KEY = "yzk_live_YOUR_KEY"
setx OPENAI_API_KEY "yzk_live_YOUR_KEY" >$null

codex --version
codex`,
          macos: `setopt interactive_comments 2>/dev/null
# bash/zsh — tum blogu yapistir, Enter tusuna bas. Hicbir sey kurulu degilse bile calisir.

# Codex kur (Node gerekir)
if ! command -v codex >/dev/null 2>&1; then
  if command -v npm >/dev/null 2>&1; then
    npm install -g @openai/codex
  else
    echo "Once Node.js kur (https://nodejs.org), sonra bu blogu tekrar calistir."
  fi
fi

# YapayZekaLab saglayicisini ~/.codex/config.toml'a yaz (varsa yedekle)
mkdir -p ~/.codex
[ -f ~/.codex/config.toml ] && cp ~/.codex/config.toml ~/.codex/config.toml.bak
cat > ~/.codex/config.toml <<'TOML'
model = "claude-opus-4-8"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
env_key = "OPENAI_API_KEY"
TOML

# Anahtari ayarla (Codex bunu config'teki env_key ile okur)
export OPENAI_API_KEY="yzk_live_YOUR_KEY"

codex --version
codex`,
          linux: `setopt interactive_comments 2>/dev/null
# bash/zsh — tum blogu yapistir, Enter tusuna bas. Hicbir sey kurulu degilse bile calisir.

# Codex kur (Node gerekir)
if ! command -v codex >/dev/null 2>&1; then
  if command -v npm >/dev/null 2>&1; then
    npm install -g @openai/codex
  else
    echo "Once Node.js kur (https://nodejs.org), sonra bu blogu tekrar calistir."
  fi
fi

# YapayZekaLab saglayicisini ~/.codex/config.toml'a yaz (varsa yedekle)
mkdir -p ~/.codex
[ -f ~/.codex/config.toml ] && cp ~/.codex/config.toml ~/.codex/config.toml.bak
cat > ~/.codex/config.toml <<'TOML'
model = "claude-opus-4-8"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
env_key = "OPENAI_API_KEY"
TOML

# Anahtari ayarla (Codex bunu config'teki env_key ile okur)
export OPENAI_API_KEY="yzk_live_YOUR_KEY"

codex --version
codex`,
        },
      },
      {
        name: "OpenCode",
        type: "Terminal (CLI) · OpenAI uyumlu",
        surface: "cli",
        steps: [
          "İşletim sistemini seç, bloğun tamamını kopyala, terminale yapıştır, Enter'a bas. OpenCode kurulu değilse blok kurar (npm paketinin adı `opencode-ai`, `opencode` değil).",
          "Blok senin için global yapılandırmayı (`~/.config/opencode/opencode.json`) YapayZekaLab sağlayıcısıyla yazar.",
          "Yalnızca `yzk_live_YOUR_KEY` yazan yeri kendi anahtarınla değiştir.",
          "Blok bitince `opencode` başlar; model olarak `yapayzekalab/claude-opus-4-8` ya da `yapayzekalab/claude-sonnet-4-6` seçebilirsin.",
        ],
        osVariants: {
          windows: `# PowerShell — tum blogu yapistir, Enter tusuna bas. Hicbir sey kurulu degilse bile calisir.

# OpenCode kur (paket adi opencode-ai)
if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm install -g opencode-ai@latest
  } else {
    winget install -e --id OpenJS.NodeJS.LTS
    Write-Host "Node kuruldu. PowerShell'i kapat-ac, bu blogu tekrar calistir."
    exit
  }
}

# YapayZekaLab provider'ini global config'e yaz
$cfgDir = "$env:USERPROFILE\\.config\\opencode"
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
@'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "yapayzekalab": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://yapayzekalab.org/v1",
        "apiKey": "yzk_live_YOUR_KEY"
      },
      "models": {
        "claude-opus-4-8": { "name": "claude-opus-4-8" },
        "claude-sonnet-4-6": { "name": "claude-sonnet-4-6" }
      }
    }
  }
}
'@ | Set-Content -Encoding utf8 "$cfgDir\\opencode.json"

opencode`,
          macos: `setopt interactive_comments 2>/dev/null
# bash/zsh — tum blogu yapistir, Enter tusuna bas. Hicbir sey kurulu degilse bile calisir.

# OpenCode kur (paket adi opencode-ai)
if ! command -v opencode >/dev/null 2>&1; then
  curl -fsSL https://opencode.ai/install | bash
fi

# YapayZekaLab provider'ini global config'e yaz
mkdir -p ~/.config/opencode
cat > ~/.config/opencode/opencode.json <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "yapayzekalab": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://yapayzekalab.org/v1",
        "apiKey": "yzk_live_YOUR_KEY"
      },
      "models": {
        "claude-opus-4-8": { "name": "claude-opus-4-8" },
        "claude-sonnet-4-6": { "name": "claude-sonnet-4-6" }
      }
    }
  }
}
JSON

opencode`,
          linux: `setopt interactive_comments 2>/dev/null
# bash/zsh — tum blogu yapistir, Enter tusuna bas. Hicbir sey kurulu degilse bile calisir.

# OpenCode kur (paket adi opencode-ai)
if ! command -v opencode >/dev/null 2>&1; then
  curl -fsSL https://opencode.ai/install | bash
fi

# YapayZekaLab provider'ini global config'e yaz
mkdir -p ~/.config/opencode
cat > ~/.config/opencode/opencode.json <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "yapayzekalab": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://yapayzekalab.org/v1",
        "apiKey": "yzk_live_YOUR_KEY"
      },
      "models": {
        "claude-opus-4-8": { "name": "claude-opus-4-8" },
        "claude-sonnet-4-6": { "name": "claude-sonnet-4-6" }
      }
    }
  }
}
JSON

opencode`,
        },
      },
      {
        name: "Cline",
        type: "VS Code eklentisi · tıkla-ayarla",
        surface: "gui",
        steps: [
          "VS Code'u aç → Eklentiler (Extensions) panelinde `Cline` ara → Install.",
          "Cline panelini aç → ayarlar (dişli) → `API Provider` listesinden `OpenAI Compatible` seç.",
          "`Base URL` alanına aşağıdaki adresi yapıştır (kopyala düğmesini kullan).",
          "`API Key` alanına kendi `yzk_live_...` anahtarını yapıştır.",
          "`Model ID` alanına aşağıdaki modellerden birini yaz, kaydet ve sohbete başla.",
        ],
        values: [
          { label: "Base URL", value: "https://yapayzekalab.org/v1" },
          { label: "API Key", value: "yzk_live_YOUR_KEY" },
          { label: "Model — en güçlü", value: "claude-opus-4-8" },
          { label: "Model — hızlı/ekonomik", value: "claude-sonnet-4-6" },
        ],
      },
      {
        name: "Kilo Code",
        type: "VS Code eklentisi · tıkla-ayarla",
        surface: "gui",
        steps: [
          "VS Code'da `Kilo Code` eklentisini kur ve panelini aç.",
          "Ayarlarda `API Provider` olarak `OpenAI Compatible` seç (yeni arayüzde adı `Custom provider` olabilir).",
          "`Base URL` alanına aşağıdaki adresi yapıştır.",
          "`API Key` alanına kendi `yzk_live_...` anahtarını yapıştır.",
          "`Model` alanına aşağıdaki ID'lerden birini yaz ve kaydet.",
        ],
        values: [
          { label: "Base URL", value: "https://yapayzekalab.org/v1" },
          { label: "API Key", value: "yzk_live_YOUR_KEY" },
          { label: "Model — en güçlü", value: "claude-opus-4-8" },
          { label: "Model — hızlı/ekonomik", value: "claude-sonnet-4-6" },
        ],
      },
      {
        name: "Roo Code",
        type: "VS Code eklentisi · tıkla-ayarla",
        surface: "gui",
        steps: [
          "VS Code'da `Roo Code` eklentisini kur → `Settings → Providers` aç → `API Provider` tipini `OpenAI Compatible` seç.",
          "`Base URL` alanına aşağıdaki adresi TAM olarak yapıştır: `https://` ile başlar ve `/v1` ile biter. ⚠️ `http://` YAZMA — istek https'e yönlenirken anahtar düşer, Roo 'API İsteği...' ekranında asılı kalır.",
          "⚠️ KÖK adresi (`https://yapayzekalab.org`) YAZMA — o kural sadece Claude Code içindir. Roo'da kök yazarsan model listesi gelir ama her mesaj 404 verir ('bağlanıyor ama cevap gelmiyor' tam olarak budur). Sona `/chat/completions` de EKLEME, Roo onu kendi ekler.",
          "`API Key` alanına kendi `yzk_live_...` anahtarını yapıştır.",
          "`Model` alanına aşağıdaki ID'lerden birini yaz. Cevap gelmiyorsa: 404 → Base URL yanlış (büyük ihtimalle kök yazdın, `/v1` ekle) · 402 → bakiye yükle · 403 → hesap doğrulama/anahtar.",
        ],
        values: [
          { label: "Base URL", value: "https://yapayzekalab.org/v1" },
          { label: "API Key", value: "yzk_live_YOUR_KEY" },
          { label: "Model — en güçlü", value: "claude-opus-4-8" },
          { label: "Model — hızlı/ekonomik", value: "claude-sonnet-4-6" },
        ],
      },
      {
        name: "Cherry Studio",
        type: "Masaüstü uygulaması · tıkla-ayarla",
        surface: "gui",
        steps: [
          "Cherry Studio'da yeni bir OpenAI-uyumlu model sağlayıcısı ekle.",
          "`API adresi` alanına TAM yolu yaz ve sonuna `#` koy: `https://yapayzekalab.org/v1/chat/completions#`. Cherry, adresi `#` ile bittiğinde aynen kullanır — bu en güvenli ve sürümden bağımsız yöntemdir.",
          "Alternatif: sadece KÖK adresi yaz `https://yapayzekalab.org` — Cherry, `/v1/chat/completions` yolunu kendi ekler. Cevap gelmezse yukarıdaki `#`'li tam yola geç.",
          "`API Key` alanına kendi `yzk_live_...` anahtarını yapıştır.",
          "Model olarak aşağıdaki ID'lerden birini seç ve kaydet.",
        ],
        values: [
          { label: "API adresi (önerilen)", value: "https://yapayzekalab.org/v1/chat/completions#" },
          { label: "API Key", value: "yzk_live_YOUR_KEY" },
          { label: "Model — hızlı/ekonomik", value: "claude-sonnet-4-6" },
        ],
      },
    ],
  },
  {
    key: "quickstart",
    label: "Hızlı başlangıç",
    title: "API bağlantısını 5 dakikada kur",
    intro:
      "Kendi uygulamandan ya da terminalden bağlanmak istiyorsan en hızlı yol budur. Hatırlanacak üç şey var: bağlanılacak adres `https://yapayzekalab.org/v1`, yetki başlığı `Authorization: Bearer yzk_live_YOUR_KEY`, ve ana metin ucu `/v1/chat/completions`. Başlamadan önce panelden `yzk_live_` anahtarını oluştur ve hesabında bakiye bulundur.",
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
    "model": "claude-opus-4-8",
    "messages": [
      { "role": "user", "content": "Merhaba, kısa bir test yanıtı ver." }
    ],
    "max_tokens": 120
  }'`,
        osVariants: {
          windows: `curl.exe -X POST https://yapayzekalab.org/v1/chat/completions -H "Authorization: Bearer yzk_live_YOUR_KEY" -H "Content-Type: application/json" -d "{\\"model\\":\\"claude-opus-4-8\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"Merhaba, kisa bir test yaniti ver.\\"}],\\"max_tokens\\":120}"`,
          macos: `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4-8",
    "messages": [
      { "role": "user", "content": "Merhaba, kısa bir test yanıtı ver." }
    ],
    "max_tokens": 120
  }'`,
          linux: `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4-8",
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
      "YapayZekaLab herkese açık ortak bir anahtar kullanmaz. Her kullanıcı kendi panelinden ürettiği `yzk_live_` anahtarıyla bağlanır. Bu anahtar senin bakiyene, kullanım kayıtlarına ve limitlerine bağlıdır — yani anahtarın = senin hesabın.",
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
    key: "sdk",
    label: "SDK örnekleri",
    title: "cURL, Node.js ve Python ile bağlan",
    intro:
      "Kendi uygulamanı yazıyorsan örnekler aşağıda. OpenAI uyumlu istemcilerde tek yapman gereken base URL'i ve model adını değiştirmek; gerisi aynı kalır.",
    codeBlocks: [
      {
        language: "bash",
        title: "cURL · chat/completions",
        code: `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4-8",
    "messages": [
      { "role": "system", "content": "Kısa ve net yanıt ver." },
      { "role": "user", "content": "Bir satırlık selam ver." }
    ],
    "max_tokens": 120
  }'`,
        osVariants: {
          windows: `curl.exe -X POST https://yapayzekalab.org/v1/chat/completions -H "Authorization: Bearer yzk_live_YOUR_KEY" -H "Content-Type: application/json" -d "{\\"model\\":\\"claude-opus-4-8\\",\\"messages\\":[{\\"role\\":\\"system\\",\\"content\\":\\"Kisa ve net yanit ver.\\"},{\\"role\\":\\"user\\",\\"content\\":\\"Bir satirlik selam ver.\\"}],\\"max_tokens\\":120}"`,
          macos: `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4-8",
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
    "model": "claude-opus-4-8",
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
      "Dış yüzey tek bir v1 gateway'idir. Yetkisiz (anahtarsız) istekler reddedilir. Başarılı JSON yanıtlarında maliyet ve kalan bakiye bilgisi yanıt header'larında döner.",
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
      "Her başarılı çağrıda yanıt header'ları sana ne kadar harcadığını ve ne kadar bakiyen kaldığını söyler. Bakiyen bittiğinde sistem isteği, sağlayıcıya gitmeden önce bloklar — yani borç birikmez.",
    bullets: [
      "`X-YZ-Cost-TL` → çağrının TL maliyeti",
      "`X-YZ-Remaining-TL` → çağrı sonrası kalan TL bakiye",
      "`X-YZ-Remaining-USD` → çağrı sonrası kalan USD eşdeğeri",
      "`X-YZ-Request-Id` → destek ve log eşleştirme kimliği",
      "Geçersiz veya bakiyesi bitmiş anahtar `401` ya da güvenli yetersiz bakiye hatası alır.",
      "Başarılı JSON çağrılarında bu header'lar döner; hata senaryolarında güvenli JSON cevap üretilir.",
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
      "Modelin eğitildiği tarihten sonraki güncel bilgileri (son durum, fiyat, sürüm, haber) cevaplayabilmesi için iki yol var: (1) `chat/completions` isteğine `web_search: true` ekle — güncel bir soru sezilirse arka planda arama yapılır, sonuçlar modele kaynak verilir ve model atıflı ([1], [2]) yanıtlar; (2) ayrı `POST /v1/web-search` ucu — yalnız arama sonuçlarını döndürür. Her ikisinde de arama başına sabit ücret alınır (token ücretinden ayrı).",
    referenceRows: [
      { key: "web_search: true", value: "chat/completions içinde otomatik mod (güncel soruda arar)" },
      { key: 'web_search: { mode: "always" }', value: "Her istekte arama yapar" },
      { key: 'web_search: { mode: "auto", num: 5 }', value: "Sezgisel mod + sonuç sayısı (1–10)" },
      { key: "POST /v1/web-search", value: "Standalone arama: { query, num } → sonuç listesi" },
      { key: "Ücret", value: "Arama başına sabit 0.001 USD (sonuç dönmezse ücret alınmaz)" },
    ],
    bullets: [
      "`web_search: true` varsayılan olarak `auto` moddur: yalnız güncel/aktüel görünen sorularda arama tetiklenir, sıradan sorularda arama yapılmaz (gereksiz ücret oluşmaz).",
      "Otomatik modda arama maliyeti, normal token maliyetine EK olarak arama başına 0.001 USD'dir; enjekte edilen sonuçlar girişi büyüttüğü için token maliyeti de bir miktar artar.",
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
      "Yanıtı parça parça (streaming) almak istersen sistem önce güvenli bir rezervasyon yapar, sonra gerçek kullanım gelince mahsuplaşır. Bu yüzden bakiyen bittiğinde ücretsiz uzun akış açık kalmaz.",
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
      "Aşağıdaki liste şu an kullanılabilen modelleri gösterir. Tam ve güncel liste için her zaman `/v1/models` ucunu kullan — aktif sağlayıcı değişirse liste de değişir. (Model adında nokta veya tire fark etmez; ikisi de kabul edilir.)",
    modelGroups: [
      {
        family: "Claude (Anthropic)",
        models: [
          "claude-opus-4-8",
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
      "İstemcini kurarken en çok yetkilendirme, bakiye ve desteklenmeyen endpoint durumlarıyla karşılaşırsın. Aşağıdaki özet, hangi kodun ne demek olduğunu gösterir.",
    referenceRows: [
      { key: "401", value: "API key yok, hatalı, askıda veya iptal edilmiş" },
      { key: "402 / güvenli bakiye hatası", value: "Kullanım için yeterli bakiye yok" },
      { key: "404", value: "Bilinmeyen / desteklenmeyen v1 route (çoğu zaman Base URL yanlış)" },
      { key: "501", value: "Görsel veya video endpointi bu geçişte kapalı" },
      { key: "503", value: "Upstream proxy veya özel entegrasyon henüz yapılandırılmamış" },
    ],
  },
  {
    key: "workflow",
    label: "Kurulum akışı",
    title: "Sıfırdan çalışan kurulum sırası",
    intro:
      "İlk kez kuruyorsan en kısa güvenli sıra aşağıdaki gibidir.",
    ordered: true,
    bullets: [
      "Google ile giriş yap.",
      "Hesap panelinden `yzk_live_` anahtarını oluştur.",
      "Bakiye yükle ve panelde onaylandığını gör.",
      "`/v1/balance` ile kalan bakiyeni doğrula.",
      "`/v1/models` ile aktif modeli seç.",
      "`/v1/chat/completions` ile ilk küçük metin çağrını yap.",
      "Aracını kalıcı bağla: yukarıdaki Adım 1 (Aracını bağla) — Claude Code, Codex, OpenCode, Cline, Kilo Code, Roo Code veya Cherry Studio.",
    ],
  },
  {
    key: "notes",
    label: "Önemli notlar",
    title: "Kullanım notları ve sınırlar",
    intro:
      "Dokümantasyon sade tutuldu, ama davranış nettir: kritik limitler arka planda (backend'de) uygulanır; ekrandaki metin tek başına garanti değildir.",
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
        if (card.values?.length) {
          card.values.forEach((val) => parts.push(`- ${val.label}: ${val.value}`));
        }
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
