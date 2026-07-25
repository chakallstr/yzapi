# Devir Notu (2026-07-25) — Codex/Responses araç zinciri

Bu dosya yeni bir oturumun sıfırdan bağlam kurmasını sağlar. Tüm iddialar canlı ölçümle doğrulanmıştır.

## Sistem topolojisi (kanıtlı)

```
Müşteri (yzk_live_*) → api.yapayzekalab.org → yzapi :4568  (/opt/turkapiprojesi)
                                              └─ provider profili "gpt-web" → tünel :3181
                                                  → Mac :3180  (~/gpt-web-service) → ChatGPT koltuğu
Müşteri (gw_trial_*) → api.yapayzekalab.org → doğrudan :3181 (yzapi'ye UĞRAMAZ, faturalanmaz)
Müşteri              → yapayzekalab.org/v1  → yzlab-api :4100 (/opt/yzlab/apps/api)  ← AYRI ürün
yapayzekalab.org kökü → Next.js SSR :3100
```

- yzapi = satılan ürün (paket/bakiye/faturalama). Yerel: `/Users/ufuk/yzapi`, git repo.
- gpt-web = yzapi'nin GPT-5.6/5.5/4o ailesini beslediği koltuk havuzu. Yerel çalışan dizin `~/gpt-web-service` (**git repo DEĞİL**, launchd `com.ufuk.gpt-web`), canonical git repo `~/Desktop/gpt-web`.
- yzlab-api = ayrı kod tabanı, yerel kopya `~/Users/ufuk/yzlab-live`. Dokümanların işaret ettiği URL burasıdır.
- SSH: `ssh yzapi-vps` = `ssh vps` = hostname `seslab`, 91.228.227.88. `seslab.com.tr` de aynı IP.

## Bugün canlıya giren düzeltmeler

### yzapi (branch `fix/responses-tool-contract`, push YOK)
| Commit | İş |
|---|---|
| `179c8fa` | Araç sözleşmesi: `custom` araç eşlemesi, dönüşte doğru öğe tipi (`custom_tool_call`), `custom_tool_call(_output)` geçmişi, boş-user-mesajı guard'ı, araçlar düşerse `tool_choice` gönderilmemesi, native-degrade rethrow, teşhis logu |
| `fd3635e` | `model_catalog_override.json` postbuild ile `dist`'e geri konuyor (`npm run build` → `rm -rf dist` her deploy'da siliyordu) |
| `3bde8c2` | `jobs/index.ts` eşitleme denemesinin revert'i (GAP-10 sözleşmesi 4 CF starter'ını şart koşuyor) |
| `095b468` | Sessiz arıza dedektörü: `countResponseToolCalls()` + `suspicious success` warn |

Deploy: `sync-20260725T082016Z-3bde8c2` ve `sync-20260725T103130Z-095b468`, ikisi de `REMOTE_GATE_OK`. Servis restart 10:32:57 UTC.

### gpt-web (canonical branch `fix/proxy-log-observability`, push YOK)
| Commit | İş |
|---|---|
| `e78800b` | Upstream boş dönerse sahte HTTP 200 + metin yerine **503 `upstream_unavailable`** (kaçış valfi `UPSTREAM_EMPTY_AS_TEXT=1`) |
| `ff8ce09` | Slot sızıntısı: non-stream `.finally()` release, stream `releaseStreamSession()` + keep-alive temizliği, `inFlight` + takılı-tur watchdog (`STUCK_TURN_MS`, default 180sn), `RESPONSE_TIMEOUT_MS` kolu |
| `62cfba6` | Stream'de sahte başarı yerine `response.failed` (ve `response.completed` gönderilmiyor) |

Ayrıca (commit'ten önce, aynı gün): non-stream yolunda `parseToolCall` → `function_call` paritesi.
Canlı dizin git repo olmadığı için değişiklikler `~/gpt-web-service/backups/*.bak-<ts>` yedekleriyle korunuyor.

Test durumu: gpt-web canlı dizin 70/70, canonical 72/72 + lint 0 error; yzapi 143 dosya / 1203 test, lint temiz, `scan:public` `hits: []`.

## Çalışma kuralları (kullanıcı talebi)

1. **Tek pencere**: aynı repoda ikinci bir oturum çalışmasın. Bugün iki oturum birbirinin `jobs/index.ts` commit'ini geri aldı (10:19 → 10:21 → 11:03 → 11:11 arası 4 commit boşa gitti) ve ikisi de canlıya deploy etti.
2. `~/yzlab-live` / `/opt/yzlab` başka bir oturumun alanı — yalnız oku, yazma.
3. Bir işi "tamam" ilan etmeden önce: RED kanıtı (yamasız kodda test kırmızı) → yama → GREEN → tam paket → build → canlı doğrulama. Sonra ne/neden/nasıl doğrulandı özeti.
4. Para yoluna dokunan değişiklikte (billing, CF sayaçları, provider routing) önce kullanıcı onayı.

## Açık işler

| # | İş | Durum |
|---|---|---|
| A | **501 fırtınası** (dün isteklerin %11'i, bugün 06:46'ya kadar %49) | Atfedilemedi. yzapi'de 501 yolu yok, gpt-web `dist`'te "501" literali yok, yzlab-api yalnız `/v1/images/generations` + `/v1/web-search` + kapalı model için 501 veriyor. Kesin atıf için nginx log formatına geçici `$host` + `$upstream_status` eklenmeli → **üretim reload'u, kullanıcı onayı gerekiyor** |
| B | 3 disabled seat (kapasite 9→18) | Kullanıcı bilinçli olarak kapsam dışı bıraktı; neden kapatıldıkları bilgisi bekleniyor |
| C | Degradation/readiness token-seat moduna göre düzeltme | Expired DB hesaplarına bakıp sürekli `critical` yazıyor, servis çalışırken. Gerçek arıza sinyali gürültüde kayboluyor |
| D | Overselling ↔ fiziksel kapasite | Trial key 25 eşzamanlı hak veriyor, gerçek kapasite 9 slot (3 seat × 3 tab); fazlası `BURST_QUEUE_TIMEOUT_MS=15000` ile 15sn'de hata alıyor |
| E | Progresif streaming | Yanıt 2–8 kaba parçada geliyor, token-token akış yok |
| F | Stream tarafı için `toolCallCount` telemetrisi | yzapi'de sayaç yalnız non-stream dalında; stream için adapter/translator'dan sayı taşınması gerekiyor (spec görev 8.3) |
| G | Kozmetik | `accounts` tablosunda 3 sızmış `active_conversations` sayacı (expired/disabled satırlarda), 119 `no-explicit-any` warning, expired hesap temizliği |
| H | Push / PR | İki repoda da branch'ler yerel; `main`'e dokunulmadı, push yapılmadı |
| I | `/v1/images/generations` → `seslab.com.tr` `nano-banana-2-economy` | Kendi VPS'in (aynı IP), veri dışarı çıkmıyor. Model tercihi iş kararı — onay bekliyor |

## Hızlı doğrulama komutları

```bash
# yzapi canlı
ssh yzapi-vps 'systemctl is-active turkapiprojesi; curl -s http://127.0.0.1:4568/health'
ssh yzapi-vps 'ls -t /opt/turkapiprojesi/.deploy/releases | head -3'
# araç sözleşmesi teşhis logu (declared/mapped/dropped tool types)
ssh yzapi-vps 'journalctl -u turkapiprojesi --since today --no-pager | grep "responses tool contract" | tail -5'
ssh yzapi-vps 'journalctl -u turkapiprojesi --since today --no-pager | grep -c "suspicious success"'

# gpt-web canlı (Mac)
curl -s http://127.0.0.1:3180/health
cd ~/gpt-web-service && npm test
sqlite3 -header -column ~/gpt-web-service/data/gpt-web.db \
  "select substr(id,1,8) id,status,active_conversations ac,max_conversations mx from accounts where deleted_at is null;"

# upstream sağlık (ChatGPT tarafı bugün dalgalıydı)
cd ~/gpt-web-service && sed 's/\x1b\[[0-9;]*m//g' logs/stdout.log \
  | grep -oE "biscuit_baker[a-z_]*|chat-requirements: HTTP [0-9]+|conversation: HTTP [0-9]+" | sort | uniq -c

# 501 dağılımı
ssh yzapi-vps 'grep "POST /v1/" /var/log/nginx/access.log | awk "{print \$7, \$9}" | sort | uniq -c | sort -rn | head'
```
