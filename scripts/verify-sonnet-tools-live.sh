#!/usr/bin/env bash
# Sonnet 4.6 arac sozlesmesi CANLI dogrulama (sunucuda calisir).
#
# 1 saatlik test key uretir, claude-sonnet-4-6'ya arac tasiyan istek atar,
# yanitin arac cagrisi icerdigini dogrular, sonra key'i IPTAL eder.
# Anahtar hicbir zaman stdout'a basilmaz.
#
# Kullanim (sunucuda): bash /tmp/verify-sonnet-tools-live.sh
set -uo pipefail

cd /opt/turkapiprojesi || exit 1
BASE="http://127.0.0.1:4568"
TOOLS='[{"type":"function","function":{"name":"write_file","description":"Dosyaya yaz","parameters":{"type":"object","properties":{"path":{"type":"string"},"contents":{"type":"string"}},"required":["path","contents"]}}}]'
PROMPT='merhaba.txt adli dosyaya selam yazisini yaz. Bunu yapmak icin write_file aracini kullan.'

KEYFILE=$(mktemp); RESP=$(mktemp)
trap 'rm -f "$KEYFILE" "$RESP"' EXIT

echo "==> test key uretiliyor"
NODE_ENV=production npx tsx scripts/gen-1hour-test-key.ts >"$KEYFILE" 2>&1 || {
  echo "FAIL: key uretilemedi"; tail -5 "$KEYFILE"; exit 1;
}
KEY=$(grep -oE 'yzk_live_[a-f0-9]{24}' "$KEYFILE" | head -1)
KEYID=$(grep -E '^  Key ID' "$KEYFILE" | sed 's/.*: //' | tr -d ' \r')
[[ -n "$KEY" && -n "$KEYID" ]] || { echo "FAIL: key ayristirilamadi"; exit 1; }
echo "    key uretildi (${#KEY} karakter), id=$KEYID"
[[ "${#KEY}" -eq 33 ]] || { echo "FAIL: key uzunlugu beklenmedik (${#KEY}) — prefix mi yakalandi?"; exit 1; }

revoke() {
  echo "==> test key iptal ediliyor"
  NODE_ENV=production npx tsx scripts/gen-1hour-test-key.ts --revoke "$KEYID" 2>&1 | tail -1
}
trap 'revoke; rm -f "$KEYFILE" "$RESP"' EXIT

fails=0
check() { # check <ad> <kosul-sonucu>
  if [[ "$2" == "1" ]]; then echo "    GECTI  $1"; else echo "    KALDI  $1"; fails=$((fails+1)); fi
}

# ── 1. /v1/chat/completions (non-stream) ─────────────────────────────────────
echo "==> 1/4  POST /v1/chat/completions (araclı, non-stream)"
code=$(curl -s -o "$RESP" -w '%{http_code}' "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d "{\"model\":\"claude-sonnet-4-6\",\"max_tokens\":200,\"tools\":$TOOLS,\"tool_choice\":\"required\",\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}]}")
echo "    HTTP $code"
body=$(cat "$RESP")
check "HTTP 200" "$([[ "$code" == "200" ]] && echo 1 || echo 0)"
check "tool_calls var" "$(grep -qc '"tool_calls"' <<<"$body" || true; grep -q '"tool_calls"' <<<"$body" && echo 1 || echo 0)"
check "arac adi write_file" "$(grep -q '"write_file"' <<<"$body" && echo 1 || echo 0)"
check "finish_reason tool_calls" "$(grep -q '"finish_reason":"tool_calls"' <<<"$body" && echo 1 || echo 0)"
check "provider adi sizmiyor" "$(grep -q 'global.anthropic\|us.anthropic' <<<"$body" && echo 0 || echo 1)"
check "model=claude-sonnet-4-6" "$(grep -q '"model":"claude-sonnet-4-6"' <<<"$body" && echo 1 || echo 0)"
echo "    yanit (kirpilmis): $(head -c 320 <<<"$body")"

# ── 2. /v1/chat/completions (stream) ─────────────────────────────────────────
echo "==> 2/4  POST /v1/chat/completions (araclı, stream)"
curl -s -N "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d "{\"model\":\"claude-sonnet-4-6\",\"stream\":true,\"max_tokens\":200,\"tools\":$TOOLS,\"tool_choice\":\"required\",\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}]}" >"$RESP"
body=$(cat "$RESP")
check "SSE tool_calls delta" "$(grep -q '"tool_calls"' <<<"$body" && echo 1 || echo 0)"
check "SSE arac adi" "$(grep -q '"write_file"' <<<"$body" && echo 1 || echo 0)"
check "SSE finish tool_calls" "$(grep -q '"finish_reason":"tool_calls"' <<<"$body" && echo 1 || echo 0)"
check "SSE [DONE]" "$(grep -q 'data: \[DONE\]' <<<"$body" && echo 1 || echo 0)"
check "SSE provider adi sizmiyor" "$(grep -q 'global.anthropic\|us.anthropic' <<<"$body" && echo 0 || echo 1)"

# ── 3. /v1/messages (Anthropic-native araç semasi) ───────────────────────────
echo "==> 3/4  POST /v1/messages (Anthropic araç semasi)"
ATOOLS='[{"name":"write_file","description":"Dosyaya yaz","input_schema":{"type":"object","properties":{"path":{"type":"string"},"contents":{"type":"string"}},"required":["path","contents"]}}]'
code=$(curl -s -o "$RESP" -w '%{http_code}' "$BASE/v1/messages" \
  -H "x-api-key: $KEY" -H 'Content-Type: application/json' -H 'anthropic-version: 2023-06-01' \
  -d "{\"model\":\"claude-sonnet-4-6\",\"max_tokens\":200,\"tools\":$ATOOLS,\"tool_choice\":{\"type\":\"any\"},\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}]}")
echo "    HTTP $code"
body=$(cat "$RESP")
check "HTTP 200" "$([[ "$code" == "200" ]] && echo 1 || echo 0)"
check "tool_use blogu var" "$(grep -q '"type":"tool_use"' <<<"$body" && echo 1 || echo 0)"
check "stop_reason tool_use" "$(grep -q '"stop_reason":"tool_use"' <<<"$body" && echo 1 || echo 0)"
check "model maskeli" "$(grep -q '"model":"claude-sonnet-4-6"' <<<"$body" && echo 1 || echo 0)"
check "provider adi sizmiyor" "$(grep -q 'global.anthropic\|us.anthropic' <<<"$body" && echo 0 || echo 1)"
echo "    yanit (kirpilmis): $(head -c 320 <<<"$body")"

# ── 4. Cok turlu arac dongusu: arac cikti geri gonder ────────────────────────
echo "==> 4/4  cok turlu: tool_result geri gonderilebiliyor mu"
TOOLID=$(grep -oE '"id":"toolu[^"]*"' <<<"$body" | head -1 | sed 's/.*:"//;s/"//')
if [[ -z "$TOOLID" ]]; then
  echo "    ATLANDI (onceki adimda tool_use id bulunamadi)"
else
  code=$(curl -s -o "$RESP" -w '%{http_code}' "$BASE/v1/messages" \
    -H "x-api-key: $KEY" -H 'Content-Type: application/json' -H 'anthropic-version: 2023-06-01' \
    -d "{\"model\":\"claude-sonnet-4-6\",\"max_tokens\":200,\"tools\":$ATOOLS,\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"},{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"$TOOLID\",\"name\":\"write_file\",\"input\":{\"path\":\"merhaba.txt\",\"contents\":\"selam\"}}]},{\"role\":\"user\",\"content\":[{\"type\":\"tool_result\",\"tool_use_id\":\"$TOOLID\",\"content\":\"dosya yazildi\"}]}]}")
  echo "    HTTP $code"
  body=$(cat "$RESP")
  check "HTTP 200 (arac ciktisi kabul edildi)" "$([[ "$code" == "200" ]] && echo 1 || echo 0)"
  check "model yaniti uretti" "$(grep -q '"type":"text"' <<<"$body" && echo 1 || echo 0)"
  echo "    yanit (kirpilmis): $(head -c 240 <<<"$body")"
fi

echo
echo "==> hangi lane servis etti (usage_records)"
DB=$(grep -m1 '^DATABASE_URL=' .env.production | cut -d= -f2- | tr -d '\r')
psql "$DB" -A -F'|' -c "select provider_profile_id, status, error_code, count(*) from usage_records where model_id='claude-sonnet-4-6' and timestamp > now() - interval '10 minutes' group by 1,2,3;" 2>/dev/null | grep -v libpq

echo
if [[ "$fails" -eq 0 ]]; then echo "SONUC: TUM KONTROLLER GECTI"; else echo "SONUC: $fails KONTROL KALDI"; fi
exit "$fails"
