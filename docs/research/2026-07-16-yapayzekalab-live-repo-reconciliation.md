# YapayZekaLab canlı / repo / Markdown mutabakatı

Tarih: 2026-07-16 (Europe/Istanbul)  
Kapsam: `git ls-files '*.md'` ile izlenen 143 Markdown, Temmuz git geçmişi, mevcut kod, YapayZekaLab'ın resmî canlı yüzleri ve Claude Code'un `~/.claude/projects/-Users-ufuk-yzapi*` altındaki 243 JSONL kaydı (50.949.145 bayt; 48,6 MiB / ondalık 50,9 MB).  
Yöntem: salt okunur. Oturum açılmadı, anahtar kullanılmadı, ücretli/model çağrısı ve mutasyon yapılmadı. Yerel dirty dosyalar değiştirilmedi ve kanonik kabul edilmedi.

## Yönetici özeti

YapayZekaLab bugün bakiye ve istek-paketi mekanizmalarını birlikte taşıyan, OpenAI ve Anthropic uyumlu bir API gateway + React paneldir. Eski belgelerdeki “paket yok”, CloseRouter-tek-upstream, cPanel-ana-deploy ve 33/38/42 model gibi ifadeler tarihsel kanıttır; çalışma zamanı gerçeği değildir.

En önemli ayrım şudur:

- Yerel repo HEAD: `b6f6197` (2026-07-15), Temmuz değişimleri arasında `/v1/usage`, Kiro seat routing ve CF Claude header düzeltmesi var.
- Canlı `/status`: deploy `sync-20260702T103811Z-08c0bba`, commit `08c0bba`, `version=dev`. Canlı, yerel HEAD'den eski bir deploy bildiriyor.
- Yerel worktree dirty. Özellikle `src/server/routes/proxy.ts` ve package/provider override alanındaki izlenmeyen/değişmiş dosyalar henüz HEAD gerçeği değildir.
- Claude Code kayıtları 2026-06-23–2026-07-03 aralığında yoğunlaşır; 15 Temmuz WIP'ini tamamlanmış gösteren bir Claude oturumu yoktur. Güncel dirty tree `npm run lint` kapısından geçmiyor.
- Canlı katalog yüzleri farklı amaçlarla farklı sayılar döndürüyor: `/status=42`, `/api/models=63` kayıt (`61` enabled), `/v1/models=11`. UI bu semantiği yeterince açıklamıyor.

## Kanıt önceliği

Çelişkide şu sıra kullanılmalı:

1. İlgili canlı endpoint'in aynı anda alınmış yanıtı.
2. Canlı `/status` deploy işaretçisi ve canlı davranış.
3. Temiz, commit'li HEAD kodu ve testleri.
4. `CLAUDE.md` içindeki açık tarihli güncel yönlendirme; yine de canlıyla doğrulanır.
5. Tasarım/plan belgeleri yalnız niyet kanıtıdır.
6. QA, handoff, worklog, agent-team ve fiyat taraması belgeleri yalnız yazıldıkları tarihin kanıtıdır.

## Temmuz git ve kod gerçeği

Temmuz commitleri:

- `206e237` (2026-07-10): API-key ile müşteri görünür `GET /v1/usage`.
- `399c4fd` (2026-07-14): public Claude modellerini Kiro seat pool'a route etme.
- `6d67f91` (2026-07-15): CF reseller `claude-api` için gerekli Claude CLI header'ları.
- `b6f6197` (2026-07-15): deploy öncesi WIP snapshot; mevcut HEAD.

Committed kodun doğruladığı ana yapı:

- Express + TypeScript backend, React/Vite SPA, PostgreSQL/Drizzle.
- Public: `/health`, `/status`, `/api/models`, `/api/packages`, `/api/public-config`, `/v1/models`, `/v1/models/count`, `/v1/providers`.
- API-key korumalı: `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/v1/balance`, `/v1/usage`, image uçları. Anahtarsız `/v1/balance` ve `/v1/usage` canlıda `401` ve `Valid yzk_live_ API key required` döndürdü.
- Panel kullanıcı uçları JWT/user auth + WhatsApp doğrulama arkasında; admin yüzleri ayrı auth/permission katmanında.
- Model sistemi statik 42-kilit `MASTER_MODELS` + DB `added_models` + `model_overrides` katmanıdır. Bu yüzden status'un 42 sayısı tam public katalog sayısı değildir.
- Paket sistemi gerçektir: public katalog, satın alma, entitlement, pause/resume/renew, redeem, admin paket yönetimi ve provider override kodda bulunur. Eski “paket yok” kararları geçersizdir.
- Güncel deploy yolu `scripts/sync-deploy.sh` ile `yzapi-vps:/opt/turkapiprojesi`, systemd `turkapiprojesi`, local port 4568'dir. cPanel ve git-checkout varsayan VPS scriptleri legacy/alternatif yüzlerdir.

Kaynak kod: [`CLAUDE.md`](../../CLAUDE.md), [`src/server/app.ts`](../../src/server/app.ts), [`src/server/routes/proxy.ts`](../../src/server/routes/proxy.ts), [`src/server/routes/packages.ts`](../../src/server/routes/packages.ts), [`src/server/routes/v1-catalog.ts`](../../src/server/routes/v1-catalog.ts), [`src/server/services/status-service.ts`](../../src/server/services/status-service.ts), [`src/master-models.ts`](../../src/master-models.ts).

## Claude Code geçmişi — yapılan iş / kanıt / kalan ayrımı

Tarama ana oturum JSONL'lerini, 52 `subagents/agent-*.jsonl` kaydını ve 8 workflow journal'ını kapsadı. Secret değerleri ve müşteri kimlikleri bu mutabakata alınmadı. Oturumdaki “deploy edildi” cümlesi tek başına bugünkü canlı kanıt sayılmadı; aşağıda açıkça oturum kanıtı olarak etiketlendi.

### 24–25 Haziran: Devreden Codex

- Karar: sabit paketler 500/1000/2000 istek-gün; builder 100–10.000; devreden süreleri; saatlik limit 150. Kilitli fiyat çapaları `500/1 gün = 169 TL`, `1000/30 gün = 8.750 TL`.
- Uygulama oturumunda canlı-faithful replika, migration, fiyat modülü, entitlement/gate, atomik devir, saatlik sayaç, panel backend/frontend ve seed işleri fazlar halinde yürütüldü. Oturum 1035/1035, sonra deploy kapısında 1056/1056 test; lint/build/migrate/health başarılı olduğunu kaydeder.
- Deploy kanıtı **Claude Code oturum kaydıdır**: 17 dosyalık checksum manifestiyle izole rsync, migration'ın `0045`e rebase edilmesi, 13 paketin satışa açılması ve HTTP 200 smoke raporlanmıştır. Bugünkü public `/api/packages` paket sisteminin hâlâ var olduğunu doğrular; ancak eski 13 sayısı bugünkü 45 satış kaydıyla karıştırılmamalıdır.

### 25 Haziran: CF gate, over-serve ve drain olayı

- Önce paket gate/over-serve ve monitoring kör noktaları incelendi; Codex günlük kota semantiği netleştirildi.
- Bir ara değişiklik proaktif CF top-up'ı yanlış tetikledi. Oturum sayacı üç müşteri için toplam `+1350` ünite yazdığını, sonra top-up'ın kapatıldığını kaydeder. Aynı oturum CF'nin gerçek kalanını yaklaşık 219 ünite diye ayrıca ölçmüştür; bu iki sayı farklı semantiktedir ve “675 TL kesin kayıp” sonucu çıkarılamaz.
- Sonraki düzeltme **oturumda canlı deploy edilmiş olarak raporlandı**: Codex paket isteği önce eldeki CF prepaid ünitesini tüketir, CF bittiğinde seat'e düşer, yeni CF siparişi açmaz. Dört CF + dört seat kontrollü istekte sıfır hata/sıfır yeni harcama raporlandı. Bu tarihsel incident/deploy kanıtıdır; bugünkü routing için canlı authenticated probe gerekir.

### Temmuz: commitli olan ile WIP olan

- `206e237` (`/v1/usage`), `399c4fd` (Kiro seat routing) ve `6d67f91` (CF Claude CLI header'ları) commitlidir. `b6f6197` ise adıyla da “pre-deploy snapshot” olan 78 dosyalık geniş WIP snapshot'tır; tek özellik/temiz release commit'i değildir.
- **15 Temmuz CF unified counter tamamlanmadı:** plan belgesi “uygulama onayına hazır” durumunda ve checklist maddeleri açıktır. Dirty `proxy.ts`, olmayan `cf-counter-service`, olmayan env alanları ve güncel olmayan interface/export'lara referans verir.
- **15 Temmuz Claude per-customer override tamamlanmadı:** `claude-cf-override-service.ts` izlenmeyen dosyadır; `proxy.ts` ve `package-provider-override.ts` dirty'dir. Çağırdığı `topUpClaudeTokenOverride` mevcut committed servisten export edilmez. Test veya deploy kaydı yoktur.
- 2026-07-16'da mevcut dirty tree üzerinde `npm run lint` çalıştırıldı ve exit 2 aldı: eksik modüller/export'lar/env alanları dahil çok sayıda TypeScript hatası. Sonuç: bu iki dirty iş **yerel, bütünleşmemiş, deploy edilmemiş WIP** sayılmalıdır. `proxy.ts.server-version` yalnız karşılaştırma artefaktıdır; kaynak dosya değildir.

### Kalan gerçek iş

1. `proxy.ts`yi hangi canlı/commit tabanından devam ettireceğini belirle; 750 satırlık dirty farkı körlemesine merge etme.
2. Unified counter ile Claude override'ı ayrı feature/commit/test matrislerine böl; eksik bağımlılıkları ilgili canlı-faithful tabandan getir veya WIP'i geri ayır.
3. Her iş için önce targeted unit/itest, sonra `npm run lint`, tam test, build; ancak temiz geçerse deploy manifesti üret.
4. Deploy sonrası `/health` + `/status` yanında authenticated kontrollü routing/counter probe ile provider, sayaç ve top-up davranışını kanıtla.

## Canlı public yüzler — 2026-07-16 gözlemi

| Yüz | Sonuç | Yorum |
|---|---:|---|
| `/health` | 200, DB/provider ok, `version=dev` | Sağlık yeşil; sürüm etiketi üretim için zayıf. |
| `/status` | 200, `modelCount=42`, deploy `08c0bba` | Statik master sayısı/deploy işaretçisi. |
| `/api/models` | 63 kayıt, 61 enabled | Tam public katalog: 62 metin + 1 görsel; enabled: 60 metin + 1 görsel. |
| `/v1/models` | 11 kayıt | İstemci için küratörlü kısa liste; tam katalog değil. |
| `/v1/models/count` | 11 | `/v1/models` ile uyumlu. |
| `/v1/providers` | Anthropic 5, OpenAI 4, YapayZekaLab 2 | Küratörlü listenin provider özeti. |
| `/api/packages` | 45 satış kaydı | Public JSON ile paket sistemi açık; UI taramasında 36 kart görünür raporlandı. Filtre semantiği belgelenmeli. |
| `/api/public-config` | USD/TL 48.463251 | UI'daki ₺48.46 gösterimiyle uyumlu. |
| `/api/user/me` | 401 | Public olmayan kullanıcı yüzü doğru kapanıyor. |
| `/v1/balance`, `/v1/usage` | 401 | `yzk_live_` anahtar kapısı doğru. |

Resmî kaynaklar: [ana sayfa](https://yapayzekalab.org/), [models](https://yapayzekalab.org/models), [packages](https://yapayzekalab.org/packages), [documents](https://yapayzekalab.org/documents), [health](https://yapayzekalab.org/health), [status](https://yapayzekalab.org/status), [public katalog](https://yapayzekalab.org/api/models), [OpenAI-uyumlu katalog](https://yapayzekalab.org/v1/models), [model sayısı](https://yapayzekalab.org/v1/models/count), [providers](https://yapayzekalab.org/v1/providers), [paket API](https://yapayzekalab.org/api/packages), [public config](https://yapayzekalab.org/api/public-config).

## Canlı çelişkiler ve riskler

1. **42 / 61 / 11 model sayısı.** Üçü farklı katmanları sayıyor; UI bunu “master”, “aktif tam katalog” ve “önerilen istemci listesi” diye ayırmalı.
2. **“61 metin modeli” yanlış etiketi.** `/api/models` içinde enabled toplam 61, fakat dağılım 60 metin + 1 görsel. Etiket aktif toplamı metin sayısı gibi sunuyor.
3. **Documents kaynak tanımı.** Canlı Documents “Aktif liste + güncel fiyatlar her zaman Modeller sayfası ve GET /v1/models'tir” diyor. Modeller sayfası tam aktif katalogu, `/v1/models` ise yalnız 11 küratürlü modeli sunuyor. Yerel `api-docs.js` bunu “Cline/RooCode için kısa önerilen liste” diye daha doğru tarif ediyor.
4. **Ana sayfa fiyat stale.** Hesaplayıcı `Claude Opus 4.7 — $30/M` gösterirken katalog müşteri fiyatı `$0.90/$0.90` düzeyinde. `$30` üretici input fiyatına benziyor; seçicide kapsam belirtilmiyor. Ayrıca ana sayfadaki Opus 4.6/Sonnet 4.6/Haiku fiyatları canlı `/api/models` değerleriyle uyuşmuyor.
5. **Canlı ve yerel `/v1/models` seti farklı.** Canlı 11 listede `claude-fable-5`, `gpt-5.6-sol`, `gpt-5.6-terra`, `glm-5.2`, `kimi-k2-7` var. Yerel committed `V1_CLIENT_MODEL_IDS` daha dar. Canlı deploy işaretçisi de yerel HEAD'den eski; DB/runtime veri katmanı ayrıca devrede olabilir.
6. **Paket sayısı görünümü.** Public API 45 satış kaydı verirken UI 36 kart gösteriyor. Bilinçli filtre olabilir; filtre/aktiflik kuralı public sözleşmede açıklanmalı.
7. **`version=dev`.** Sağlık ve status production hostunda `dev` yayımlıyor; release teşhisini zorlaştırıyor.

## Agent-team ve workflow gerçeği

`agent-team/` bir production orkestratör değildir. Mayıs 2026 araştırma/koordinasyon artefaktıdır. `TEAM_STATUS.md` açıkça Ruflo agent kayıtlarının executor/provider eksikliği nedeniyle çoğu işi çalıştırmadığını, koordinatörün iş hatlarını yürüttüğünü söyler. Dolayısıyla eski “10 agent healthy” satırı bugün çalışan 10 worker anlamına gelmez.

Bugünkü ürün workflow'u:

`istemci/agent → yapayzekalab.org/v1 → auth/WhatsApp/paket+bakiye guard → model/provider routing → upstream → usage/ledger`.

Agent ekipleri (Claude Code, Codex, Cline, Roo, Windsurf vb.) gateway tüketicisidir. YapayZekaLab'ın public ürününde supervisor/worker, DAG, handoff, ortak bellek veya görev kuyruğu sunan yerleşik agent-team runtime belgelenmiyor.

## 143 Markdown mutabakatı

İzlenen tam küme `git ls-files '*.md'` ile 143'tür. Her belge aşağıdaki sınıflardan birine alındı; toplam `7 + 1 + 46 + 65 + 2 + 22 = 143`.

### A — Operatif, güncel tutulmalı (7)

`CLAUDE.md`, `README.md`, `docs/OPERATIONS.md`, `docs/live-state-runbook.md`, `docs/payment-apis.md`, `docs/proxy-and-auth-apis.md`, `docs/vps-deploy.md`.

Bunlar çalışma rehberidir; yine de canlı deploy ve endpoint ile doğrulanmadan mutlak gerçek sayılmaz. `README.md` içindeki CloseRouter-MVP ve yalnız TL bakiye dili güncel çok-provider/paket sisteminin gerisindedir.

### B — Tarihli snapshot (1)

`docs/live-state-current.md`.

2026-06-11'e aittir; 38 public model ve DB sayımları bugünkü canlı gerçeği değildir. Dosya yararlı tarihsel snapshot, kanonik “current” değildir.

### C — Plan/spec; runtime değil (46)

Kök: `API_COST_PLAN.md`, `FIX_PLAN.md`, `PLAN-anasayfa-karsilastirma-ve-documents-apikey.md`, `PLAN-katalog-fiyat-karsilastirma.md`, `PROVIDER_OAUTH_ADMIN_UAT_PLAN.md`, `REPAIR_PHASE_PLAN.md`, `TEST_PLAN.md`, `WHATSAPP_OTP_REGISTER_PLAN.md`.

`docs/superpowers/plans/` altındaki 20 dosyanın tamamı ve `docs/superpowers/specs/` altındaki 18 dosyanın tamamı bu sınıftadır. Yalnız Temmuz tarihli USD wallet plan/spec bile uygulandığı commit/test/canlı kanıtı olmadan gerçek kabul edilmez.

### D — Tarihsel kanıt/rapor (65)

Kök dizindeki test, QA, audit, security, repair, UAT, incident, readiness, worklog ve status başlıklı 38 rapor; `agent-team/` altındaki izlenen 26 Markdown'ın tamamı; `docs/AI_HANDOFF.md`; `pricing/closerouter-scan/REPORT-2026-05-24.md` bu sınıftadır.

Bu belgeler kararın veya testin o tarihte var olduğunu kanıtlar. Güncel provider, fiyat, deploy, model sayısı, paket politikası ya da çalışan agent sayısı kanıtlamaz. Özellikle `agent-team/CODEX_IDE_HANDOFF.md` içindeki “paket yok”, CloseRouter ve `*3` fiyat kararları stale'dir.

### E — Fiyat/reference; her kullanımda yeniden doğrula (2)

`CLAUDE_POPUSK_PRICE_TABLE.md`, `pricing/fiyat-master.md`.

Fiyatlar runtime DB override ve kur ile değişebilir. Müşteriye gösterilecek gerçek için aynı anda `/api/models` ve ilgili paket fiyat-preview kullanılmalı.

### F — Kapsamlı referans/runbook (22)

`ARCHITECTURE_MAP.md`, `CF-DESTEK-RAPORU.md`, `DEPLOY_AGENT_GATE.md`, `DESIGN_PRESERVATION_FINAL_CHECK.md`, `DESIGN_REGRESSION_ACCOUNTABILITY.md`, `POST-DEPLOY.md`, `REPAIR_EVIDENCE_INDEX.md`, `REPAIR_INPUT_FILES.md`, `cpanel-deploy.md`, `docs/SORUNLAR-CLAUDE-2026-06-01.md`, `docs/backup-cron.md`, `docs/incident-503-runbook.md`, `docs/musteri-baslangic-kilavuzu.md`, `docs/release-vps-beta-checklist.md`, `docs/research/clone-website-skill-draft.md`, `docs/research/clone-website-skill-revised.md`, `docs/research/codefast-clone-roadmap.md`, `docs/research/codefast-inventory.md`, `docs/rika-integration-brief.md`, `docs/router-poc.md`, `docs/test-plan-faz1-6.md`, `docs/wellflow-docs.md`.

Bu dosyalar kendi dar konularında faydalıdır. Legacy cPanel, Rika, Wellflow, CloseRouter ve eski release prosedürleri güncel varsayılmamalı.

## Kanonik sonraki-oturum kuralları

1. Başlangıçta `git status --short`, HEAD ve son Temmuz commitlerini al; dirty dosyaları kullanıcı işi say ve ezme.
2. Önce bu mutabakatı, sonra `CLAUDE.md` ve ilgili operatif runbook'u oku. Eski handoff/worklog kararlarını doğrudan uygulama.
3. Canlı görevde önce `/health`, `/status`, `/api/models`, `/v1/models/count`, `/api/public-config` snapshot'ı al; sayımların semantiğini ayrı tut.
4. Live deploy commit'i ile yerel HEAD'i eşleştirmeden “canlıda var” veya “deploy edildi” deme.
5. Paket gerçeği için `/api/packages` + `packagesFeatureEnabled` + entitlement/provider override kodunu birlikte değerlendir.
6. Model gerçeği için 42-kilit master, DB added/override, 63 public katalog ve 11 curated client listesini birbirine karıştırma.
7. Fiyatı Markdown veya ana sayfa kopyasından alma; aynı anın public model/paket API'sinden al. Girdi/çıktı ve üretici/müşteri fiyatını açık etiketle.
8. `agent-team/` artefaktlarını canlı worker durumu sayma. Gerçek delegation ancak o oturumun agent/tool çıktısıyla kanıtlanır.
9. Deploy yalnız temiz, commit'li tree üzerinden güncel `sync-deploy.sh` yolu ve smoke kapılarıyla yapılır; bu araştırma deploy yetkisi vermez.
10. Değişiklik sonrası ilgili test + lint + build + gerekiyorsa canlı smoke kanıtı olmadan tamamlandı deme.

## Sonuç

Repo güçlü fakat belge katmanı birden çok dönemin kararlarını aynı ağırlıkta taşıyor. Güvenli çalışma için “canlı davranış → deploy pointer → committed Temmuz kodu → operatif docs → tarihsel belgeler” sırası zorunlu. En acil ürün düzeltmeleri model sayısı semantiği, Documents `/v1/models` ifadesi, ana sayfa fiyat kaynağı ve paket filtre sayısının açıklanmasıdır.
