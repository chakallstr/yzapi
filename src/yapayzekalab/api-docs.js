// API dokümantasyon içeriği. tab-documents.jsx bu diziyi sırayla "Adım 1, 2, 3…"
// kartları olarak render eder — yani buradaki dizi sırası = sayfadaki adım sırası.
// Çocuk-dostu akış: önce "start" (5 adımlık hızlı başlangıç + Hesap görseli),
// sonra "clients" (istemci kurulumu), ardından "packages" ve "payment", en son
// teknik API referansı. Bölümler birbirine numarayla DEĞİL adla atıfta bulunur
// (sıra değişince numara kayar); örn. "«Aracını bağla» bölümü".
export const API_DOC_SECTIONS = [
  {
    key: "start",
    label: "Hızlı başlangıç",
    title: "5 adımda başla",
    intro:
      "Hiç bilmiyorsan bile: bu 5 adımı sırayla yap, birkaç dakikada ilk yapay zekâ isteğini gönderirsin. Her adımın detayı aşağıdaki bölümlerde.",
    journeySteps: [
      { icon: "💳", title: "Bakiye yükle", desc: "Hesap → Bakiye Yükle. En az $5. IBAN, kart veya kripto." },
      { icon: "🔑", title: "API anahtarı al", desc: "Hesap → API Anahtarları → Yeni Anahtar. yzk_live_ ile başlar — kopyala." },
      { icon: "🎁", title: "Paket / test key", desc: "İstersen paket al ya da elindeki TEST-… kodunu 'Kodu gir'e yaz — bedava dene." },
      { icon: "🔌", title: "Aracını bağla", desc: "Claude Code / Cline / Roo / Codex… Base URL + anahtarını gir (aşağıda)." },
      { icon: "✅", title: "İlk istek", desc: "Soru sor — çalıştı! Kullandığın kadar bakiyenden düşülür." },
    ],
  },
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
          "Model değiştirmek için Claude Code içinde `/model` yaz: 4.8 / 4.7 / 4.6 / Sonnet 4.6 listeden seçilir. Bunu açan satır bloktaki `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` — ayrıca Claude Code güncel olmalı (`claude update`, v2.1.129+). Liste boş gelirse bile doğrudan `/model claude-opus-4-7` (veya `claude-opus-4-6`) yazıp Enter'a basman yeterli; o model anında devreye girer.",
        ],
        code: `export ANTHROPIC_BASE_URL="https://yapayzekalab.org"
export ANTHROPIC_AUTH_TOKEN="yzk_live_YOUR_KEY"
export ANTHROPIC_MODEL="claude-opus-4-8"
export ANTHROPIC_SMALL_FAST_MODEL="claude-sonnet-4-6"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
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
$env:CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = "1"

[Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", "https://yapayzekalab.org", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN", $Token, "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_MODEL", "claude-opus-4-8", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_SMALL_FAST_MODEL", "claude-sonnet-4-6", "User")
[Environment]::SetEnvironmentVariable("CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY", "1", "User")

# setx ile de kalici yaz (yeni pencerelerde de gecerli)
setx ANTHROPIC_BASE_URL "https://yapayzekalab.org" >$null
setx ANTHROPIC_AUTH_TOKEN "$Token" >$null
setx ANTHROPIC_MODEL "claude-opus-4-8" >$null
setx ANTHROPIC_SMALL_FAST_MODEL "claude-sonnet-4-6" >$null
setx CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY "1" >$null

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
sed -i '' -e '/^export ANTHROPIC_/d' -e '/^export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY/d' ~/.zshrc 2>/dev/null

export ANTHROPIC_BASE_URL="https://yapayzekalab.org"
export ANTHROPIC_AUTH_TOKEN="$TOKEN"
export ANTHROPIC_MODEL="claude-opus-4-8"
export ANTHROPIC_SMALL_FAST_MODEL="claude-sonnet-4-6"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1

# Kalici yap (yeni terminallerde de gecerli)
{
  echo "export ANTHROPIC_BASE_URL=\\"https://yapayzekalab.org\\""
  echo "export ANTHROPIC_AUTH_TOKEN=\\"$TOKEN\\""
  echo "export ANTHROPIC_MODEL=\\"claude-opus-4-8\\""
  echo "export ANTHROPIC_SMALL_FAST_MODEL=\\"claude-sonnet-4-6\\""
  echo "export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1"
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
sed -i -e '/^export ANTHROPIC_/d' -e '/^export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY/d' ~/.bashrc 2>/dev/null

export ANTHROPIC_BASE_URL="https://yapayzekalab.org"
export ANTHROPIC_AUTH_TOKEN="$TOKEN"
export ANTHROPIC_MODEL="claude-opus-4-8"
export ANTHROPIC_SMALL_FAST_MODEL="claude-sonnet-4-6"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1

# Kalici yap (yeni terminallerde de gecerli)
{
  echo "export ANTHROPIC_BASE_URL=\\"https://yapayzekalab.org\\""
  echo "export ANTHROPIC_AUTH_TOKEN=\\"$TOKEN\\""
  echo "export ANTHROPIC_MODEL=\\"claude-opus-4-8\\""
  echo "export ANTHROPIC_SMALL_FAST_MODEL=\\"claude-sonnet-4-6\\""
  echo "export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1"
} >> ~/.bashrc
# Eski saglayici ~/.claude/settings.json yazdiysa "env" blogundaki eski ANTHROPIC_* anahtarlarini sil.

which claude && claude --version
claude`,
        },
        desktopPath: "~/.claude/settings.json",
        desktopSteps: [
          "npm install -g @anthropic-ai/claude-code komutunu terminalde çalıştır (kuruluysa atla).",
          "İşletim sistemini seç — aşağıdaki sekme. Bloğun TAMAMINI kopyala, terminale yapıştır, Enter'a bas.",
          "Blokta yalnızca `yzk_live_YOUR_KEY` yazan yeri kendi anahtarınla değiştir.",
          "Blok bittikten sonra yeni bir terminal aç ve `claude` yaz — Claude Code başlamalı.",
          "Başarı işareti: Ekranda `╔══` çerçevesi ve model adı görünüyorsa bağlantı kuruldu.",
        ],
        desktopCode: {
          windows: String.raw`# PowerShell — tum blogu yapistir, Enter tusuna bas.

# ① Klasoru olustur (varsa hata vermez)
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude" | Out-Null

# ② settings.json yaz — yzk_live_YOUR_KEY yerine kendi anahtarini koy
@"
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://yapayzekalab.org",
    "ANTHROPIC_AUTH_TOKEN": "yzk_live_YOUR_KEY",
    "ANTHROPIC_MODEL": "claude-opus-4-8",
    "ANTHROPIC_SMALL_FAST_MODEL": "claude-sonnet-4-6",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1"
  }
}
"@ | Set-Content -Encoding UTF8 "$env:USERPROFILE\.claude\settings.json"

Write-Host "✓ Ayarlar kaydedildi: $env:USERPROFILE\.claude\settings.json"
Write-Host "Simdi yeni bir terminal ac ve 'claude' yaz."`,
          macos: `# bash/zsh — tum blogu yapistir, Enter tusuna bas.

# ① Klasoru olustur
mkdir -p ~/.claude

# ② settings.json yaz — yzk_live_YOUR_KEY yerine kendi anahtarini koy
cat > ~/.claude/settings.json << 'EOF'
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://yapayzekalab.org",
    "ANTHROPIC_AUTH_TOKEN": "yzk_live_YOUR_KEY",
    "ANTHROPIC_MODEL": "claude-opus-4-8",
    "ANTHROPIC_SMALL_FAST_MODEL": "claude-sonnet-4-6",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1"
  }
}
EOF

echo "✓ Ayarlar kaydedildi: ~/.claude/settings.json"
echo "Simdi yeni bir terminal ac ve 'claude' yaz."`,
          linux: `# bash/zsh — tum blogu yapistir, Enter tusuna bas.

# ① Klasoru olustur
mkdir -p ~/.claude

# ② settings.json yaz — yzk_live_YOUR_KEY yerine kendi anahtarini koy
cat > ~/.claude/settings.json << 'EOF'
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://yapayzekalab.org",
    "ANTHROPIC_AUTH_TOKEN": "yzk_live_YOUR_KEY",
    "ANTHROPIC_MODEL": "claude-opus-4-8",
    "ANTHROPIC_SMALL_FAST_MODEL": "claude-sonnet-4-6",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1"
  }
}
EOF

echo "✓ Ayarlar kaydedildi: ~/.claude/settings.json"
echo "Simdi yeni bir terminal ac ve 'claude' yaz."`,
        },
        desktopNote: "settings.json yöntemi kalıcıdır — her terminalde tekrar ayarlamana gerek kalmaz. Claude Code Desktop App, VS Code uzantısı ve tüm IDE entegrasyonları bu dosyayı okur.",
      },
      {
        name: "Codex CLI",
        type: "Terminal (CLI) · OpenAI uyumlu",
        surface: "cli",
        steps: [
          "İşletim sistemini seç (Windows / macOS / Linux), bloğun tamamını kopyala, terminale yapıştır, Enter'a bas. Codex kurulu değilse blok `npm install -g @openai/codex` ile kurar.",
          "Blok senin için `~/.codex/config.toml` dosyasına YapayZekaLab sağlayıcısını yazar ve anahtarını ayarlar (varsa eski config'i `.bak` olarak yedekler).",
          "Yalnızca `yzk_live_YOUR_KEY` yazan yeri kendi anahtarınla değiştir.",
          "Blok bitince `codex` başlar. Varsayılan model `gpt-5.5` (Codex'in en güçlü kodlama modeli). YapayZekaLab artık Codex'in kullandığı Responses API'sini doğrudan destekler — başka bir ayar veya istemci gerekmez. İstersen `~/.codex/config.toml` içindeki `model` satırını başka bir modelle (ör. `gpt-5.4`) değiştirebilirsin.",
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
model = "gpt-5.5"
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
model = "gpt-5.5"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
env_key = "OPENAI_API_KEY"
TOML

# Anahtari ayarla (Codex bunu config'teki env_key ile okur)
export OPENAI_API_KEY="yzk_live_YOUR_KEY"
# Kalici yap — yeni terminallerde de gecerli olsun
grep -q 'OPENAI_API_KEY' ~/.zshrc 2>/dev/null || echo 'export OPENAI_API_KEY="yzk_live_YOUR_KEY"' >> ~/.zshrc

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
model = "gpt-5.5"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
env_key = "OPENAI_API_KEY"
TOML

# Anahtari ayarla (Codex bunu config'teki env_key ile okur)
export OPENAI_API_KEY="yzk_live_YOUR_KEY"
# Kalici yap — yeni terminallerde de gecerli olsun
grep -q 'OPENAI_API_KEY' ~/.bashrc 2>/dev/null || echo 'export OPENAI_API_KEY="yzk_live_YOUR_KEY"' >> ~/.bashrc

codex --version
codex`,
        },
        desktopPath: "~/.codex/config.toml",
        desktopSteps: [
          "Codex CLI kurulu değilse terminale `npm install -g @openai/codex` yaz, Enter'a bas.",
          "İşletim sistemini seç — aşağıdaki sekme. Bloğun TAMAMINI kopyala, terminale yapıştır, Enter'a bas.",
          "Blokta yalnızca `yzk_live_YOUR_KEY` yazan yeri kendi anahtarınla değiştir.",
          "Blok bittikten sonra yeni bir terminal aç ve `codex` yaz — Codex başlamalı.",
          "Başarı işareti: Codex arayüzü açılıyorsa config doğru okundu.",
        ],
        desktopCode: {
          windows: String.raw`# PowerShell — tum blogu yapistir, Enter tusuna bas.

# ① Klasoru olustur
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.codex" | Out-Null

# ② config.toml yaz — yzk_live_YOUR_KEY yerine kendi anahtarini koy
@'
model = "gpt-5.5"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
env_key = "OPENAI_API_KEY"
'@ | Set-Content -Encoding UTF8 "$env:USERPROFILE\.codex\config.toml"

# ③ API anahtarini kalici yaz
$env:OPENAI_API_KEY = "yzk_live_YOUR_KEY"
setx OPENAI_API_KEY "yzk_live_YOUR_KEY" | Out-Null

Write-Host "✓ config.toml yazildi: $env:USERPROFILE\.codex\config.toml"
Write-Host "✓ OPENAI_API_KEY kalici olarak ayarlandi"
Write-Host "Simdi yeni bir terminal ac ve 'codex' yaz."`,
          macos: `# bash/zsh — tum blogu yapistir, Enter tusuna bas.

# ① Klasoru olustur
mkdir -p ~/.codex

# ② config.toml yaz — yzk_live_YOUR_KEY yerine kendi anahtarini koy
cat > ~/.codex/config.toml << 'EOF'
model = "gpt-5.5"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
env_key = "OPENAI_API_KEY"
EOF

# ③ API anahtarini kalici yaz (~/.zshrc)
grep -q 'OPENAI_API_KEY' ~/.zshrc 2>/dev/null || echo 'export OPENAI_API_KEY="yzk_live_YOUR_KEY"' >> ~/.zshrc
export OPENAI_API_KEY="yzk_live_YOUR_KEY"

echo "✓ ~/.codex/config.toml yazildi"
echo "✓ OPENAI_API_KEY ~/.zshrc'ye eklendi"
echo "Simdi yeni bir terminal ac ve 'codex' yaz."`,
          linux: `# bash/zsh — tum blogu yapistir, Enter tusuna bas.

# ① Klasoru olustur
mkdir -p ~/.codex

# ② config.toml yaz — yzk_live_YOUR_KEY yerine kendi anahtarini koy
cat > ~/.codex/config.toml << 'EOF'
model = "gpt-5.5"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
env_key = "OPENAI_API_KEY"
EOF

# ③ API anahtarini kalici yaz (~/.bashrc)
grep -q 'OPENAI_API_KEY' ~/.bashrc 2>/dev/null || echo 'export OPENAI_API_KEY="yzk_live_YOUR_KEY"' >> ~/.bashrc
export OPENAI_API_KEY="yzk_live_YOUR_KEY"

echo "✓ ~/.codex/config.toml yazildi"
echo "✓ OPENAI_API_KEY ~/.bashrc'ye eklendi"
echo "Simdi yeni bir terminal ac ve 'codex' yaz."`,
        },
        desktopNote: "config.toml kalıcıdır — her terminalde tekrar ayarlamana gerek kalmaz. Codex her başlatıldığında bu dosyayı ve ortam değişkenini okur.",
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
          { label: "Model — Claude 4.7", value: "claude-opus-4-7" },
          { label: "Model — Claude 4.6", value: "claude-opus-4-6" },
          { label: "Model — hızlı/ekonomik", value: "claude-sonnet-4-6" },
          { label: "Model — GPT güçlü", value: "gpt-5.5" },
          { label: "Model — GPT dengeli", value: "gpt-5.4" },
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
          { label: "Model — Claude 4.7", value: "claude-opus-4-7" },
          { label: "Model — Claude 4.6", value: "claude-opus-4-6" },
          { label: "Model — hızlı/ekonomik", value: "claude-sonnet-4-6" },
          { label: "Model — GPT güçlü", value: "gpt-5.5" },
          { label: "Model — GPT dengeli", value: "gpt-5.4" },
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
          { label: "Model — Claude 4.7", value: "claude-opus-4-7" },
          { label: "Model — Claude 4.6", value: "claude-opus-4-6" },
          { label: "Model — hızlı/ekonomik", value: "claude-sonnet-4-6" },
          { label: "Model — GPT güçlü", value: "gpt-5.5" },
          { label: "Model — GPT dengeli", value: "gpt-5.4" },
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
    key: "packages",
    label: "Paketler & ücretsiz",
    title: "Paketler, özel paket ve ücretsiz deneme",
    intro:
      "Token-bazlı bakiyenin yanında sabit-istekli paketler var; ya da kendi paketini kurarsın. İlk kez deniyorsan ücretsiz seçenekler de var. Hepsi Paketler sayfasından.",
    featureCards: [
      { tone: "free", badge: "ÜCRETSİZ", icon: "🟢", title: "NVIDIA bedava", desc: "NVIDIA modelleri ₺0 · kişi başı 1 kez · 1000 istek/gün. Paketler sayfasından aç." },
      { tone: "builder", badge: "KENDİN YAP", icon: "⚙️", title: "Özel paket kur", desc: "Model + günlük limit (50–5000) + süre (1–90 gün) seç → anlık fiyat → bakiyenden al." },
      { tone: "key", badge: "TEST KEY", icon: "🎟️", title: "Davet / test kodu", desc: "Elindeki TEST-… kodunu Paketler → 'Kodu gir'e yaz → ücretsiz deneme isteği kazan." },
    ],
  },
  {
    key: "payment",
    label: "Ödeme & iade",
    title: "Nasıl ödeme yaparım, iade var mı?",
    intro:
      "Bakiye yüklemek için birkaç yöntem var. Önemli: ödeme alanı, iade politikasını okuyup onaylamadan açılmaz (bulanık/kilitli kalır).",
    paymentMethods: [
      { icon: "🏦", name: "IBAN / Havale", sub: "Açıklama kısmını boş bırak", tag: "Manuel onay" },
      { icon: "💳", name: "Shopier (kart)", sub: "Kredi / banka kartı", tag: "Otomatik" },
      { icon: "🪙", name: "Cryptomus (USDT)", sub: "Kripto ile yükleme", tag: "Otomatik" },
      { icon: "✈️", name: "Telegram", sub: "Telegram üzerinden", tag: "Otomatik" },
    ],
    refundPolicy: {
      title: "İade Politikası",
      body: "API hizmeti dijital ve anında teslim edilen bir hizmettir; kullanıma açıldığı andan itibaren geri alınamaz. Kara para aklama ve mali suçların önlenmesine ilişkin yükümlülükler gereği, yüklenen bakiye ve API hizmeti bedeli iade EDİLMEZ. Ödeme yaparak iade talep edilemeyeceğini kabul etmiş olursunuz. (Yalnızca tarafımızdan kaynaklanan hatalı veya mükerrer tahsilatlar bu kapsamın dışındadır.)",
    },
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
      "Modelleri canlı çekmek için: `/v1/models` (Cline/RooCode için kısa önerilen liste)",
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
      "Görsel/video ÜRETME uçlarının stream akışı bu sürümde aktif değildir (görsel okuma stream'de sorunsuz çalışır).",
    ],
  },
  {
    key: "models",
    label: "Model kataloğu",
    title: "Aktif modeller",
    intro:
      "Aşağıdaki kısa liste Cline, Roo Code ve OpenAI-compatible istemcilerde önerilen modelleri gösterir. Güncel kısa liste için `/v1/models` ucunu kullan. 4.8 için katalog `claude-opus-4.8` döndürebilir; `claude-opus-4-8` de kabul edilir.",
    modelGroups: [
      {
        family: "Claude (Anthropic)",
        models: [
          "claude-opus-4-8",
          "claude-opus-4-7",
          "claude-opus-4-6",
          "claude-sonnet-4-6",
        ],
      },
      {
        family: "GPT",
        models: [
          "gpt-5.5",
          "gpt-5.4",
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
      "Aracını kalıcı bağla: yukarıdaki «Aracını bağla» bölümü — Claude Code, Codex, OpenCode, Cline, Kilo Code, Roo Code veya Cherry Studio.",
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
      "Görsel OKUMA (vision) açıktır: `/v1/models` yanıtında `architecture.input_modalities` içinde `image` yazan modellere mesaj içeriğinde görsel gönderebilirsin (örn. `claude-sonnet-4-6`, `claude-opus-4-7`, `gpt-5.5`, `gemini-3.1-pro-preview`). Text-only modele görsel yollarsan sağlayıcı 400 döner.",
      "Görsel/video ÜRETME uçları (`/v1/images/*`, `/v1/videos/*`) bu sürümde kapalıdır ve 501 döner — okuma ile karıştırma.",
      "Yasal metinler, KVKK ve satış koşulları footer bağlantılarında ayrıca bulunur.",
      "Sorun yaşarsan `X-YZ-Request-Id` değerini destek ekibine iletmek hata ayıklamayı hızlandırır.",
    ],
  },
  {
    key: "codex-desktop",
    label: "Codex masaüstü kurulumu",
    title: "Codex masaüstü uygulaması — adım adım kurulum",
    intro:
      "OpenAI'nin **Codex masaüstü uygulamasını** YapayZekaLab ile kullanabilirsin — kendi `yzk_live_` anahtarınla. Codex, özel bir sağlayıcıya bağlanmayı resmî olarak destekler: `~/.codex/config.toml` dosyasında adresi `https://yapayzekalab.org/v1` yaparsın, anahtarını da `~/.codex/auth.json` dosyasına yazarsın — GUI'de ayrı bir giriş ekranı gerekmez. Codex isteklerini OpenAI **Responses API** biçiminde gönderir; YapayZekaLab bu ucu (`/v1/responses`) doğrudan karşılar. Aşağıdaki adımları sırayla yap.",
    annotatedSteps: [
      {
        title: "Codex masaüstü uygulamasını indir ve kur",
        body: "OpenAI'nin resmî Codex sayfasından (developers.openai.com/codex) masaüstü uygulamasını indir. macOS ve Windows sürümleri var. Kur ve bir kez aç — ama HENÜZ giriş yapma; önce ayar dosyasını yazacağız.",
        callouts: [
          "macOS: indirilen dosyayı aç → uygulamayı Applications'a sürükle",
          "Windows: kurulum sihirbazını çalıştır, bitince uygulamayı aç",
          "Bu adımda hiçbir hesaba giriş yapma",
        ],
      },
      {
        title: "Ayar dosyasını oluştur: ~/.codex/config.toml",
        body: "Codex ayarlarını `~/.codex/config.toml` dosyasından okur (Windows'ta `C:\\Users\\<kullanıcı>\\.codex\\config.toml`). Bu dosya yoksa oluştur ve aşağıdaki satırları içine yapıştır. Yaptıkları: YapayZekaLab'i özel sağlayıcı olarak tanıtmak, modeli `gpt-5.5` seçmek ve anahtarı `auth.json` dosyasından okumaya kilitlemek. Gizli bilgi içermez — anahtarı bir sonraki adımda `auth.json` dosyasına yazacaksın.",
        code: `model = "gpt-5.5"
model_provider = "yapayzekalab"

[model_providers.yapayzekalab]
name = "YapayZekaLab"
base_url = "https://yapayzekalab.org/v1"
wire_api = "responses"
requires_openai_auth = true`,
        callouts: [
          "Adres MUTLAKA `https://` ile başlar ve `/v1` ile biter",
          "model: `gpt-5.5` (en güçlü) veya `gpt-5.4` (ekonomik)",
          "`requires_openai_auth = true` → uygulama ChatGPT yerine `auth.json`'daki anahtarını kullanır (masaüstü uygulaması için ŞART)",
        ],
      },
      {
        title: "API anahtarını yaz: ~/.codex/auth.json",
        body: "Codex anahtarını `~/.codex/auth.json` dosyasından okur (Windows'ta `C:\\Users\\<kullanıcı>\\.codex\\auth.json`). Bu dosyayı oluştur ve aşağıdaki içeriği yapıştır; `yzk_live_YOUR_KEY` yerine kendi anahtarını koy. GUI'de giriş ekranı kullanmana gerek yok — `requires_openai_auth = true` sayesinde uygulama anahtarı bu dosyadan alır.",
        code: `{
  "auth_mode": "apikey",
  "OPENAI_API_KEY": "yzk_live_YOUR_KEY"
}`,
        callouts: [
          "Anahtarın yoksa: panelde Hesap → API Anahtarları → Yeni Anahtar",
          "`OPENAI_API_KEY` alanına `yzk_live_` ile başlayan anahtarını yaz",
          "ChatGPT ile GİRME — uygulama anahtarı bu dosyadan kullanır",
        ],
      },
      {
        title: "Modeli seç ve ilk isteğini gönder",
        body: "Uygulama açıldığında model `gpt-5.5` görünmeli (config'ten gelir). Bir şey yaz — örn. «merhaba, çalışıyor musun?». Yanıt geldiyse kurulum tamamdır. Kullandığın token kadar YapayZekaLab bakiyenden düşülür.",
        callouts: [
          "Modeli sonradan `~/.codex/config.toml` içindeki `model` satırından değiştirebilirsin (gpt-5.5 ↔ gpt-5.4)",
          "Ücretlendirme: kullandığın token kadar, panel bakiyenden",
        ],
      },
      {
        title: "Sık karşılaşılan hatalar",
        body: "Bir sorun çıkarsa neredeyse her zaman bunlardan biridir:",
        callouts: [
          "401 / yetki hatası → `~/.codex/auth.json` içindeki anahtar yanlış/eksik. `yzk_live_` ile başlamalı, panelde aktif olmalı ve bakiyen yeterli olmalı. ChatGPT ile giriş yapma.",
          "404 / model bulunamadı → Adres yanlış. `config.toml`'daki `base_url` tam olarak `https://yapayzekalab.org/v1` olmalı.",
          "WebSocket / bağlanamıyor → Eski `openai_base_url` ayarını KULLANMA; `model_provider = \"yapayzekalab\"` + `wire_api = \"responses\"` + `requires_openai_auth = true` olmalı.",
          "ChatGPT giriş ekranı çıkıyor → `config.toml`'a `requires_openai_auth = true` ekli olmalı; o zaman uygulama `auth.json`'daki anahtarı kullanır.",
        ],
      },
    ],
  },
  {
    key: "codex-api",
    label: "Codex API (ChatGPT)",
    title: "Codex API (ChatGPT) paketi — gpt-5.5 & gpt-5.4",
    intro:
      "**Codex API (ChatGPT) paketine sahipsen** bu adımları izle. Paket, OpenAI Responses API formatını destekler — `gpt-5.5` ve `gpt-5.4` modelleri doğrudan YapayZekaLab uç noktası üzerinden kullanılabilir. Başka bir anahtar veya endpoint kurmanı gerekmez; mevcut `yzk_live_` anahtarın bu paket kapsamındaki istekleri otomatik tanır.",
    referenceRows: [
      { key: "Base URL", value: "https://yapayzekalab.org" },
      { key: "Endpoint", value: "POST /v1/responses" },
      { key: "API Key", value: "yzk_live_YOUR_KEY" },
      { key: "Desteklenen modeller", value: "gpt-5.5 · gpt-5.4" },
      { key: "İstek formatı", value: "OpenAI Responses API (input alanı)" },
    ],
    codeBlocks: [
      {
        title: "cURL — basit istek",
        lang: "bash",
        code: `curl https://yapayzekalab.org/v1/responses \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.5",
    "input": "Merhaba, bana kısa bir tanıtım metni yaz."
  }'`,
      },
      {
        title: "cURL — streaming (-N ile anlık akış)",
        lang: "bash",
        code: `curl -N https://yapayzekalab.org/v1/responses \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.5",
    "input": "Türkiye için 5 maddelik kısa bir gezi planı yaz.",
    "stream": true
  }'`,
      },
      {
        title: "Node.js — streaming (fetch)",
        lang: "javascript",
        code: `const response = await fetch("https://yapayzekalab.org/v1/responses", {
  method: "POST",
  headers: {
    "Authorization": "Bearer yzk_live_YOUR_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-5.5",
    input: "Kısa ve net şekilde streaming nasıl çalışır anlat.",
    stream: true,
  }),
});

if (!response.ok) {
  const err = await response.json().catch(() => null);
  throw new Error(err?.error?.message || \`HTTP \${response.status}\`);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const events = buffer.split("\\n\\n");
  buffer = events.pop() || "";

  for (const event of events) {
    const dataLine = event.split("\\n").find((l) => l.startsWith("data: "));
    if (!dataLine) continue;

    const data = dataLine.slice("data: ".length);
    if (data === "[DONE]") continue;

    const payload = JSON.parse(data);
    if (payload.type === "response.output_text.delta") {
      process.stdout.write(payload.delta);
    }
    if (payload.type === "error") {
      throw new Error(payload.error?.message || "Stream error");
    }
  }
}`,
      },
      {
        title: "Python — streaming (httpx)",
        lang: "python",
        code: `import httpx, json

url = "https://yapayzekalab.org/v1/responses"
headers = {
    "Authorization": "Bearer yzk_live_YOUR_KEY",
    "Content-Type": "application/json",
}
body = {
    "model": "gpt-5.5",
    "input": "Yapay zeka nedir? Kısa açıkla.",
    "stream": True,
}

with httpx.stream("POST", url, headers=headers, json=body, timeout=60) as r:
    r.raise_for_status()
    buffer = ""
    for chunk in r.iter_text():
        buffer += chunk
        while "\\n\\n" in buffer:
            event, buffer = buffer.split("\\n\\n", 1)
            for line in event.splitlines():
                if not line.startswith("data: "):
                    continue
                data = line[len("data: "):]
                if data == "[DONE]":
                    break
                payload = json.loads(data)
                if payload.get("type") == "response.output_text.delta":
                    print(payload["delta"], end="", flush=True)`,
      },
    ],
    bullets: [
      "Paket günlük istek limitine sahiptir — limitin dolup dolmadığını `/v1/balance` ucu döner.",
      "Hata kodu `daily_token_limit_exceeded` aldıysan limit dolmuştur; gün başında sıfırlanır.",
      "Modeli `gpt-5.4` ile değiştirerek daha ekonomik kullanım sağlayabilirsin.",
      "Yanıtın `output` dizisinde `type: \"output_text\"` elemanının `text` alanında cevap metni bulunur.",
      "Her istekte `X-YZ-Request-Id` başlığı döner; destek için bu değeri not al.",
    ],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// CLIENT_GUIDES — istemci başına AYRI, baştan sona GÖRSELLİ kurulum rehberi.
// Documents sekmesi bunları bir "hub" (araç seçimi) + seçilen aracın kendi
// sayfası olarak render eder (tab-documents.jsx). Her adımda bir `visual` var.
// `visual.type`: 'app' (uygulama penceresi + satırlar) | 'browser' (adres çubuğu
// + butonlar) | 'file' (dosya editörü mockup) | 'chat' (sohbet penceresi) |
// 'errors' (hata kartları) | 'screenshot' (gerçek public/docs png).
// Mockup'lar koda gömülü ÇİZİMDİR — gerçek/sahte ekran görüntüsü değil, kişisel
// veri içermez. yzk_live_ yalnızca yer-tutucu olarak geçer (gerçek anahtar YOK).
// ───────────────────────────────────────────────────────────────────────────
export const CLIENT_GUIDES = [
  {
    id: "codex-desktop",
    name: "Codex masaüstü",
    icon: "⌨️",
    tagline: "OpenAI Codex masaüstü uygulaması",
    forWhom: "Bilgisayarına Codex uygulamasını kurup yapay zekâ ile kod yazmak isteyenler.",
    badge: "Masaüstü uygulaması",
    steps: [
      {
        title: "Önce API anahtarını al",
        showKeyBox: true,
        body: "YapayZekaLab panelinde **Hesap → API Anahtarları → Yeni Anahtar**'a bas. `yzk_live_` ile başlayan anahtar oluşur. Yanındaki **Kopyala**'ya basıp bir kenara not et — birazdan Codex'e yapıştıracağız.",
        callouts: [
          "Anahtar bir kez tam görünür; kopyalamayı unutma",
          "Hesabında en az birkaç dolar bakiye olsun (yoksa istekler reddedilir)",
        ],
        visual: {
          type: "app",
          title: "YapayZekaLab — Hesap › API Anahtarları",
          rows: [
            { kind: "button", text: "+ Yeni Anahtar", primary: true, note: "1) buna bas" },
            { kind: "input", label: "Anahtarın", value: "yzk_live_••••••••••••", highlight: true, note: "2) oluşan anahtar" },
            { kind: "button", text: "Kopyala", highlight: true, note: "3) kopyala" },
          ],
        },
      },
      {
        title: "Codex masaüstü uygulamasını indir ve kur",
        body: "Tarayıcında **developers.openai.com/codex** adresine git, işletim sistemine uygun **indir** butonuna bas. İnen dosyayı kur ve uygulamayı bir kez aç — ama **henüz giriş yapma**, önce iki ayar dosyasını (`config.toml` + `auth.json`) yazacağız.",
        callouts: [
          "macOS: inen dosyayı aç → uygulamayı Applications'a sürükle",
          "Windows: kurulum sihirbazını çalıştır",
          "Bu adımda hiçbir hesaba giriş yapma",
        ],
        visual: {
          type: "browser",
          url: "developers.openai.com/codex",
          heading: "Codex",
          sub: "OpenAI'nin kodlama asistanı — masaüstü uygulaması",
          buttons: [
            { text: "macOS için indir", primary: true, note: "Mac'tesin → bunu seç" },
            { text: "Windows için indir", note: "Windows'tasın → bunu seç" },
          ],
        },
      },
      {
        title: "Ayar dosyası 1/2: ~/.codex/config.toml (adres + sağlayıcı)",
        body: "Codex, adresi ve anahtarı `~/.codex` klasöründeki **iki dosyadan** okur — bu adımda 1. dosyayı (`config.toml`) yazıyoruz (Windows'ta `C:\\Users\\<kullanıcı>\\.codex\\config.toml`). **İşletim sistemini seç**, bloğun tamamını kopyala, terminale (Windows'ta **PowerShell**) yapıştır, Enter'a bas — blok dosyayı senin için oluşturur. Yaptığı tek şey: YapayZekaLab'i özel bir sağlayıcı olarak tanıtmak, modeli `gpt-5.5` seçmek ve anahtarı `auth.json` dosyasından okumaya kilitlemek. Gizli bilgi içermez — anahtarı 2. dosyada (sonraki adım) yazacaksın.",
        osVariants: {
          macos: {
            code: "mkdir -p ~/.codex\n# Varsa eski config'i .bak olarak yedekle (temiz başlangıç)\n[ -f ~/.codex/config.toml ] && cp ~/.codex/config.toml ~/.codex/config.toml.bak\n# YapayZekaLab sağlayıcısını yaz\ncat > ~/.codex/config.toml << 'EOF'\nmodel = \"gpt-5.5\"\nmodel_provider = \"yapayzekalab\"\n\n[model_providers.yapayzekalab]\nname = \"YapayZekaLab\"\nbase_url = \"https://yapayzekalab.org/v1\"\nwire_api = \"responses\"\nrequires_openai_auth = true\nEOF\necho \"Tamam: ~/.codex/config.toml yazildi.\"",
          },
          windows: {
            code: "$cfg = \"$env:USERPROFILE\\.codex\"\nNew-Item -ItemType Directory -Force -Path $cfg | Out-Null\nif (Test-Path \"$cfg\\config.toml\") { Copy-Item \"$cfg\\config.toml\" \"$cfg\\config.toml.bak\" -Force }\n@'\nmodel = \"gpt-5.5\"\nmodel_provider = \"yapayzekalab\"\n\n[model_providers.yapayzekalab]\nname = \"YapayZekaLab\"\nbase_url = \"https://yapayzekalab.org/v1\"\nwire_api = \"responses\"\nrequires_openai_auth = true\n'@ | Set-Content -Encoding ascii \"$cfg\\config.toml\"\nWrite-Host \"OK: config.toml yazildi.\"",
          },
        },
        callouts: [
          "macOS/Linux: Terminal · Windows: PowerShell (blok her ikisinde de dosyayı oluşturur)",
          "Eski `config.toml` varsa `.bak` olarak yedeklenir → temiz başlangıç",
          "Adres MUTLAKA `https://` ile başlar ve `/v1` ile biter",
          "`requires_openai_auth = true` → Codex anahtarı GUI giriş ekranından değil `auth.json` dosyasından okur (masaüstü uygulaması için ŞART)",
          "model: `gpt-5.5` (en güçlü) veya `gpt-5.4` (ekonomik)",
        ],
        visual: {
          type: "file",
          path: "~/.codex/config.toml",
          lines: [
            'model = "gpt-5.5"',
            'model_provider = "yapayzekalab"',
            '',
            '[model_providers.yapayzekalab]',
            'name = "YapayZekaLab"',
            'base_url = "https://yapayzekalab.org/v1"',
            'wire_api = "responses"',
            'requires_openai_auth = true',
          ],
        },
      },
      {
        title: "Ayar dosyası 2/2: ~/.codex/auth.json (API anahtarın)",
        showKeyBox: true,
        body: "Şimdi 2. dosyayı yazıyoruz: `~/.codex/auth.json` — Codex senin `yzk_live_…` anahtarını **buradan** okur, **GUI'de giriş ekranı YOK**. **İşletim sistemini seç**, aşağıdaki bloğu kopyala, terminale yapıştır, Enter'a bas. Giriş yaptıysan anahtarın blokta otomatik gömülür; değilse `yzk_live_YOUR_KEY` yazan yeri kendi anahtarınla değiştir.",
        osVariants: {
          macos: {
            code: "cat > ~/.codex/auth.json << 'EOF'\n{\n  \"auth_mode\": \"apikey\",\n  \"OPENAI_API_KEY\": \"yzk_live_YOUR_KEY\"\n}\nEOF\necho \"Tamam: ~/.codex/auth.json yazildi — anahtar kaydedildi.\"",
          },
          windows: {
            code: "@'\n{\n  \"auth_mode\": \"apikey\",\n  \"OPENAI_API_KEY\": \"yzk_live_YOUR_KEY\"\n}\n'@ | Set-Content -Encoding ascii \"$env:USERPROFILE\\.codex\\auth.json\"\nWrite-Host \"OK: auth.json yazildi.\"",
          },
        },
        callouts: [
          "Anahtar `~/.codex/auth.json` içine `OPENAI_API_KEY` olarak yazılır — Codex'in beklediği biçim budur",
          "`yzk_live_` ile başlayan anahtarını kullan (panel: Hesap → API Anahtarları)",
          "ChatGPT ile GİRME — bu dosya sayesinde uygulama doğrudan senin anahtarınla bağlanır",
        ],
        visual: {
          type: "file",
          path: "~/.codex/auth.json",
          lines: [
            '{',
            '  "auth_mode": "apikey",',
            '  "OPENAI_API_KEY": "yzk_live_••••••••"',
            '}',
          ],
        },
      },
      {
        title: "Codex'i aç — giriş ekranı YOK, doğrudan bağlanır",
        body: "Hazır! İki dosya (`config.toml` + `auth.json`) yazıldığı için Codex açılışta bunları okur ve doğrudan YapayZekaLab'e bağlanır — **ayrı bir giriş ekranı yok**. Üstte model **gpt-5.5** görünmeli. Alttaki kutuya bir şey yaz — örn. «merhaba, çalışıyor musun?» — ve gönder. Yanıt geldiyse kurulum tamam; kullandığın token kadar YapayZekaLab bakiyenden düşülür.",
        callouts: [
          "Karşına yine de ChatGPT giriş ekranı gelirse: giriş YAPMA, kapat — anahtarın zaten `auth.json`'da",
          "Modeli sonra `~/.codex/config.toml`'daki `model` satırından değiştir (gpt-5.5 ↔ gpt-5.4)",
          "Değişiklik görünmezse Codex'i tamamen kapatıp yeniden aç (dosyalar açılışta okunur)",
          "Ücret: kullandığın token kadar, panel bakiyenden",
        ],
        visual: {
          type: "chat",
          app: "Codex",
          model: "gpt-5.5",
          user: "merhaba, çalışıyor musun?",
          assistant: "Evet, hazırım! Hangi konuda yardımcı olayım?",
          note: "Bu yanıt geldiyse Codex YapayZekaLab'e bağlandı demektir.",
        },
      },
      {
        title: "Bir şey ters giderse (sık hatalar)",
        body: "Sorun çıkarsa neredeyse her zaman bunlardan biridir — kontrol et:",
        visual: {
          type: "errors",
          items: [
            { code: "401", cause: "Anahtar yanlış/eksik", fix: "~/.codex/auth.json içindeki OPENAI_API_KEY senin yzk_live_ anahtarın olmalı; panelde aktif ve bakiyen yeterli olmalı. ChatGPT ile giriş yapma." },
            { code: "404", cause: "Adres yanlış", fix: "config.toml'daki base_url tam olarak https://yapayzekalab.org/v1 olmalı." },
            { code: "WebSocket / bağlanamıyor", cause: "Eski/yanlış config", fix: "config.toml'da model_provider=\"yapayzekalab\" + wire_api=\"responses\" + requires_openai_auth=true olmalı (openai_base_url KULLANMA). Sonra Codex'i kapatıp aç." },
            { code: "ChatGPT ekranı", cause: "requires_openai_auth eksik", fix: "config.toml'a requires_openai_auth = true ekli olmalı; o zaman uygulama auth.json'daki anahtarı kullanır." },
          ],
        },
      },
    ],
  },
  {
    id: "claude-desktop",
    name: "Claude masaüstü",
    icon: "🖥️",
    tagline: "Resmî Claude Desktop uygulaması (Developer Mode)",
    forWhom: "Bilgisayarına resmî Claude uygulamasını kurup YapayZekaLab anahtarıyla kullanmak isteyenler.",
    badge: "Masaüstü uygulaması",
    steps: [
      {
        title: "Önce API anahtarını al",
        showKeyBox: true,
        body: "YapayZekaLab panelinde **Hesap → API Anahtarları → Yeni Anahtar**'a bas. `yzk_live_` ile başlayan anahtarı **Kopyala** — birazdan Claude'a yapıştıracağız.",
        callouts: [
          "Anahtar bir kez tam görünür; kopyalamayı unutma",
          "Hesabında bakiye olsun (yoksa istekler reddedilir)",
        ],
        visual: {
          type: "app",
          title: "YapayZekaLab — Hesap › API Anahtarları",
          rows: [
            { kind: "button", text: "+ Yeni Anahtar", primary: true, note: "1) buna bas" },
            { kind: "input", label: "Anahtarın", value: "yzk_live_••••••••", highlight: true, note: "2) oluşan anahtar" },
            { kind: "button", text: "Kopyala", highlight: true, note: "3) kopyala" },
          ],
        },
      },
      {
        title: "Claude Desktop'ı indir ve kur",
        body: "Tarayıcında **claude.ai/download** adresinden resmî Claude masaüstü uygulamasını indir (macOS / Windows). Kur ve bir kez aç.",
        callouts: [
          "macOS: inen dosyayı aç → Applications'a sürükle",
          "Windows: kurulum sihirbazını çalıştır",
        ],
        visual: {
          type: "browser",
          url: "claude.ai/download",
          heading: "Claude",
          sub: "Resmî masaüstü uygulaması",
          buttons: [
            { text: "Download for macOS", primary: true, note: "Mac → bunu seç" },
            { text: "Download for Windows", note: "Windows → bunu seç" },
          ],
        },
      },
      {
        title: "Developer Mode'u aç",
        body: "Claude Desktop'ın üst menüsünden **Help → Troubleshooting → Enable Developer Mode**'a tıkla. Uygulama yeniden başlar ve üstte yeni bir **Developer** menüsü çıkar.",
        callouts: [
          "Menü yolu: Help ▸ Troubleshooting ▸ Enable Developer Mode",
          "App otomatik yeniden başlar — normal",
          "Yeniden açılınca üstte 'Developer' menüsü görünür",
        ],
        visual: {
          type: "app",
          title: "Claude — Üst menü",
          rows: [
            { kind: "label", text: "Help ▸ Troubleshooting" },
            { kind: "button", text: "Enable Developer Mode", highlight: true, note: "buna tıkla" },
            { kind: "label", text: "→ app yeniden başlar, 'Developer' menüsü gelir" },
          ],
        },
      },
      {
        title: "Üçüncü-parti sağlayıcıyı ayarla (YapayZekaLab)",
        showKeyBox: true,
        body: "Üstteki **Developer → Configure Third-Party Inference → Connection** ekranını aç. Backend olarak **Anthropic-compatible** seç ve alanları aşağıdaki gibi doldur. Bittiğinde **Apply Locally**'e bas (app yeniden başlar).",
        callouts: [
          "Backend: **Anthropic-compatible**",
          "Gateway base URL: `https://yapayzekalab.org` (kök — uygulama `/v1/messages`'i kendi ekler)",
          "Gateway API key: senin `yzk_live_…` anahtarın",
          "Auth scheme: **x-api-key** (YapayZekaLab bunu da, Bearer'ı da kabul eder)",
          "Daha önce ChatGPT veya başka sağlayıcıyla giriş yaptıysan önce **çıkış yap / eski bağlantıyı temizle** (eski anahtar karışmasın)",
          "Extra headers: boş bırak → sonra **Apply Locally**",
        ],
        visual: {
          type: "app",
          title: "Claude — Developer › Configure Third-Party Inference",
          rows: [
            { kind: "input", label: "Backend", value: "Anthropic-compatible", note: "bunu seç" },
            { kind: "input", label: "Gateway base URL", value: "https://yapayzekalab.org", highlight: true, note: "kök adres" },
            { kind: "input", label: "Gateway API key", value: "yzk_live_••••••••", highlight: true, note: "anahtarını yapıştır" },
            { kind: "input", label: "Auth scheme", value: "x-api-key", highlight: true, note: "x-api-key seç" },
            { kind: "button", text: "Apply Locally", primary: true, note: "kaydet → yeniden başlar" },
          ],
        },
      },
      {
        title: "Modeli ekle",
        body: "Aynı ekranda **Add Model**'e bas ve model kimliğini yaz: `claude-opus-4-8` (en güçlü). Sonra **Apply Locally**. İstersen `claude-sonnet-4-6` (ekonomik) veya `claude-opus-4-7` de ekleyebilirsin.",
        callouts: [
          "Model ID tam yazılmalı: `claude-opus-4-8`",
          "Alternatifler: `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5-20251001`",
        ],
        visual: {
          type: "app",
          title: "Claude — Add Model",
          rows: [
            { kind: "button", text: "+ Add Model", primary: true, note: "buna bas" },
            { kind: "input", label: "Model ID", value: "claude-opus-4-8", highlight: true, note: "tam bu kimliği yaz" },
            { kind: "button", text: "Apply Locally", highlight: true, note: "kaydet" },
          ],
        },
      },
      {
        title: "İlk isteğini gönder",
        body: "Claude yeniden açıldığında üstten eklediğin modeli (`claude-opus-4-8`) seç ve bir şey yaz — örn. «merhaba, çalışıyor musun?». Yanıt geldiyse kurulum tamamdır; kullandığın token kadar YapayZekaLab bakiyenden düşülür.",
        callouts: [
          "Üst model seçiciden YapayZekaLab modelini seç",
          "Ücret: kullandığın token kadar, panel bakiyenden",
        ],
        visual: {
          type: "chat",
          app: "Claude",
          model: "claude-opus-4-8",
          user: "merhaba, çalışıyor musun?",
          assistant: "Evet, hazırım! Nasıl yardımcı olabilirim?",
          note: "Bu yanıt geldiyse Claude Desktop YapayZekaLab'e bağlandı demektir.",
        },
      },
      {
        title: "Bir şey ters giderse (sık hatalar)",
        body: "Sorun çıkarsa neredeyse her zaman bunlardan biridir — kontrol et:",
        visual: {
          type: "errors",
          items: [
            { code: "401", cause: "Anahtar / şema sorunu", fix: "Gateway API key alanına yzk_live_ anahtarını yapıştırdığından ve auth scheme'in x-api-key olduğundan emin ol." },
            { code: "404", cause: "Adres yanlış", fix: "Gateway base URL = https://yapayzekalab.org olmalı (kök). Yol /v1/v1/messages görünürse fazladan /v1 yazmışsındır." },
            { code: "Model bulunamadı", cause: "Model ID yanlış", fix: "Add Model'e tam kimliği yaz: claude-opus-4-8 (görünen ad değil)." },
            { code: "Seçenek görünmüyor", cause: "Developer Mode kapalı", fix: "Help ▸ Troubleshooting ▸ Enable Developer Mode'u aç; app'i tamamen kapatıp yeniden aç." },
          ],
        },
      },
    ],
  },
  {
    id: "windsurf-kimi",
    name: "Windsurf + Kimi K2.7",
    icon: "🌊",
    tagline: "Windsurf editörünü Kimi K2.7 Code ile kullan",
    forWhom: "Windsurf IDE kullananlar ve Kimi K2.7 Code'un güçlü kodlama + agentic yeteneklerini editörleriyle birlikte kullanmak isteyenler.",
    badge: "Editör eklentisi",
    steps: [
      {
        title: "Önce API anahtarını al",
        showKeyBox: true,
        body: "YapayZekaLab panelinde **Hesap → API Anahtarları → Yeni Anahtar**'a bas. `yzk_live_` ile başlayan anahtarı **Kopyala** — birazdan Windsurf'e yapıştıracağız. Kimi K2.7 Code paketleri de bu anahtarla çalışır.",
        callouts: [
          "Anahtar bir kez tam görünür; kopyalamayı unutma",
          "Hesabında bakiye veya aktif Kimi paketi olsun",
        ],
        visual: {
          type: "app",
          title: "YapayZekaLab — Hesap › API Anahtarları",
          rows: [
            { kind: "button", text: "+ Yeni Anahtar", primary: true, note: "1) buna bas" },
            { kind: "input", label: "Anahtarın", value: "yzk_live_••••••••", highlight: true, note: "2) oluşan anahtar" },
            { kind: "button", text: "Kopyala", highlight: true, note: "3) kopyala" },
          ],
        },
      },
      {
        title: "Windsurf'ü indir ve kur",
        body: "Tarayıcında **windsurf.com** adresine git, **Download** butonuna bas, işletim sistemine uygun paketi kur. Kurulum tamamlandıktan sonra Windsurf'ü bir kez aç — Anthropic veya başka bir hesapla giriş yapma, anahtarı kendimiz gireceğiz.",
        callouts: [
          "macOS: .dmg dosyasını aç → uygulamayı Applications'a sürükle",
          "Windows: kurulum sihirbazını çalıştır",
          "Linux: .deb veya .AppImage desteklenir",
        ],
        visual: {
          type: "browser",
          url: "windsurf.com",
          heading: "Windsurf",
          sub: "AI-native kod editörü — Codeium tarafından",
          buttons: [
            { text: "Download", primary: true, note: "→ işletim sistemine göre indir" },
          ],
        },
      },
      {
        title: "Cascade panelinde model seçiciyi aç",
        body: "Windsurf açıldığında sağ tarafta **Cascade** paneli görünür (AI sohbet + kod asistanı). Panelin üstündeki mevcut model adına tıkla — açılır menüde modeller listelenir. En altta **'Add Model'** veya **'+ Özel model'** seçeneğine bas.",
        callouts: [
          "Cascade paneli yoksa sağ kenar çubuğundaki sohbet ikonuna tıkla",
          "Model adı genellikle 'Claude 3.5 Sonnet' ya da 'GPT-4o' gibi bir şey yazar",
          "Menünün altında 'Add Model' / 'Custom' / '+' seçeneği olmalı",
        ],
        visual: {
          type: "app",
          title: "Windsurf — Cascade Paneli › Model Seçici",
          rows: [
            { kind: "label", text: "Aktif model: Claude 3.5 Sonnet ▾", note: "buraya tıkla" },
            { kind: "separator" },
            { kind: "label", text: "claude-opus-4-8" },
            { kind: "label", text: "gpt-4o" },
            { kind: "separator" },
            { kind: "button", text: "+ Add Model / Özel model ekle", primary: true, note: "bunu seç" },
          ],
        },
      },
      {
        title: "YapayZekaLab bağlantısını gir",
        showKeyBox: true,
        body: "Açılan ekrana şu bilgileri gir:\n\n- **Provider / Tür**: `OpenAI Compatible`\n- **Base URL**: `https://yapayzekalab.org/v1`\n- **API Key**: `yzk_live_` ile başlayan anahtarın\n- **Model ID**: `kimi-k2.7-code`\n\nGiriş yaptıysan anahtarın burada otomatik gömülür. **Save / Kaydet**'e bas.",
        callouts: [
          "Adres MUTLAKA `https://` ile başlamalı — `http://` yazma, anahtar düşer",
          "Model ID tam olarak `kimi-k2.7-code` olmalı (büyük harf, boşluk yok)",
          "Hızlı versiyon için: `kimi-k2.7-code-highspeed`",
        ],
        visual: {
          type: "app",
          title: "Windsurf — Özel Model Ayarları",
          rows: [
            { kind: "input", label: "Provider Type", value: "OpenAI Compatible" },
            { kind: "input", label: "Base URL", value: "https://yapayzekalab.org/v1", highlight: true },
            { kind: "input", label: "API Key", value: "yzk_live_••••••••", highlight: true, note: "kendi anahtarın" },
            { kind: "input", label: "Model ID", value: "kimi-k2.7-code", highlight: true },
            { kind: "button", text: "Kaydet / Save", primary: true },
          ],
        },
      },
      {
        title: "Test et — Cascade'de bir şey sor",
        body: "Model listesinde artık **kimi-k2.7-code** görünmeli. Seç ve Cascade kutusuna bir mesaj yaz — örn. bir kod dosyası aç, birkaç satır seç, sağ tıkla → **Explain with Cascade** ya da kutuya doğrudan yaz. Yanıt geldiyse kurulum tamamdır.",
        callouts: [
          "Kimi K2.7 Code özellikle uzun dosyalarda ve çok adımlı agentic görevlerde güçlüdür",
          "Thinking (derin düşünme) modu varsayılan açık — karmaşık sorularda daha yavaş ama çok daha doğru",
          "temperature ve top_p değerlerini değiştirme — Kimi K2.7 bunları sabit tutar, farklı değer hata verir",
          "Ücret: her istekten (Kimi paketi aldıysan paketten, yoksa bakiyenden) düşülür",
        ],
        visual: {
          type: "chat",
          app: "Windsurf — Cascade",
          model: "kimi-k2.7-code",
          user: "Bu fonksiyondaki hatayı bul ve düzelt",
          assistant: "Kodu inceliyorum... 42. satırda null kontrolü eksik. Güvenli versiyonu şu şekilde:",
          note: "Bu yanıt geldiyse Windsurf, YapayZekaLab üzerinden Kimi K2.7 Code'a bağlandı.",
        },
      },
      {
        title: "Bir şey ters giderse (sık hatalar)",
        body: "Sorun çıkarsa neredeyse her zaman bunlardan biridir — kontrol et:",
        visual: {
          type: "errors",
          items: [
            { code: "401 Unauthorized", cause: "Anahtar yanlış veya eksik", fix: "API Key alanında tam `yzk_live_…` anahtarın olmalı. Panelden yeni anahtar oluşturup yapıştır; bakiyeni de kontrol et." },
            { code: "404 Not Found", cause: "Adres veya model yanlış", fix: "Base URL tam olarak `https://yapayzekalab.org/v1` olmalı. Model ID: `kimi-k2.7-code` (boşluk, büyük harf yok)." },
            { code: "Model bulunamıyor", cause: "Yanlış model ID girilmiş", fix: "`kimi-k2.7-code` yaz. Hızlı için `kimi-k2.7-code-highspeed`. Boşluk veya büyük harf olmamalı." },
            { code: "Bağlanamıyor / timeout", cause: "`http://` kullanılmış", fix: "Base URL `https://` ile başlamalı. `http://` yazılırsa anahtar yönlendirmede düşer." },
          ],
        },
      },
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

    if (section.journeySteps?.length) {
      section.journeySteps.forEach((step, i) => {
        parts.push(`${i + 1}. ${step.title} — ${step.desc}`);
      });
    }

    if (section.featureCards?.length) {
      section.featureCards.forEach((card) => {
        parts.push("", `${card.title} (${card.badge}) — ${card.desc}`);
      });
    }

    if (section.annotatedSteps?.length) {
      section.annotatedSteps.forEach((step, i) => {
        parts.push("", `${i + 1}. ${step.title}`, step.body);
        step.callouts?.forEach((c) => parts.push(`- ${c}`));
        if (step.code) parts.push("", step.code);
      });
    }

    if (section.paymentMethods?.length) {
      section.paymentMethods.forEach((m) => {
        parts.push(`- ${m.name}: ${m.sub} (${m.tag})`);
      });
    }

    if (section.refundPolicy) {
      parts.push("", section.refundPolicy.title, "", section.refundPolicy.body);
    }

    if (section.screenshot?.caption) {
      parts.push("", `[Görsel] ${section.screenshot.caption}`);
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
