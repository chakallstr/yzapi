# YapayZekaLab canlı yüz ve first-party araştırması

Tarih: 2026-07-16 (Europe/Istanbul)

## Kapsam ve yöntem

Bu not yalnızca YapayZekaLab'ın kendi canlı alan adı, bu alan adındaki public API uçları ve canlı uygulamanın kendi dokümantasyon ekranına dayanır. İnceleme salt-okunur yapıldı; hesap açılmadı, oturum açılmadı, API anahtarı üretilmedi, bakiye/ödeme işlemi yapılmadı ve model isteği gönderilmedi. Public bir resmî GitHub deposu, canlı sitenin yüzeyinde veya alan adı odaklı GitHub aramasında doğrulanamadığı için haricî bir depoya kaynak muamelesi yapılmadı.

## Ürün nedir?

YapayZekaLab kendisini “Türkiye'nin Yapay Zekâ API Geçidi” olarak sunan, bakiye yükle-kullandıkça-öde modeliyle çalışan bir AI API geçidi olarak konumluyor. Canlı ana sayfa tek API anahtarı ve OpenAI uyumlu `base_url=https://yapayzekalab.org/v1` kullanımını gösteriyor; arayüzde abonelik/kota yerine bakiye ve token bazlı fiyatlama anlatılıyor. Kaynak: [canlı ana sayfa](https://yapayzekalab.org/).

Canlı dokümantasyon, ürünü yalnızca özel yazılmış istemcilere değil Claude Code, Codex CLI/masaüstü, OpenCode, Claude Desktop, Cherry Studio, Cline, Kilo Code, Roo Code, Windsurf ve doğrudan cURL/Python akışlarına bağlanan ortak geçit olarak tarif ediyor. Kaynak: [canlı dokümantasyon](https://yapayzekalab.org/docs).

## Canlı sistem durumu

- `GET /health`, inceleme anında HTTP 200 döndürdü; veritabanı ve AI provider kontrolü `ok`, sürüm `dev` idi. Kaynak: [health](https://yapayzekalab.org/health).
- `GET /status`, servis adını `yapayzekalab`, API/DB/AI provider kontrollerini `ok` ve deploy işaretçisini `sync-20260702T103811Z-08c0bba` / commit `08c0bba` olarak verdi. Kaynak: [status](https://yapayzekalab.org/status).
- Aynı status yanıtında `modelCount: 42` bulunurken public katalog aynı anda 63 kayıt döndürdü. Bu, canlı yüzler arasında sayım/tazelik farkı olduğunu gösterir; 42 sayısı güncel katalog toplamı kabul edilmemeli. Kaynaklar: [status](https://yapayzekalab.org/status), [public model kataloğu](https://yapayzekalab.org/api/models).

## Model ve API yüzeyi

2026-07-16 canlı katalog gözleminde 63 model kaydı; Anthropic, Google, OpenAI ve YapayZekaLab sağlayıcı etiketleri; `Metin` ve `Görsel` türleri vardı. Katalog `chat`, `messages` ve `images` endpoint ailelerini bildiriyordu. 62 kayıt en az bir streaming-capable endpoint bildirirken tek görsel kayıt `gpt-image-2` idi. Bu rakamlar dinamik katalog değerleridir. Kaynak: [public model kataloğu](https://yapayzekalab.org/api/models).

Ana sayfa ve dokümanlar OpenAI SDK uyumluluğunu öne çıkarıyor. Katalog ayrıca metin modelleri için hem OpenAI tarzı `chat` hem Anthropic tarzı `messages` yüzeylerini, model bazında desteklenen parametreleri, bağlam penceresini, modaliteleri ve fiyat bilgisini makinece okunur biçimde yayınlıyor. Kaynaklar: [ana sayfa](https://yapayzekalab.org/), [public model kataloğu](https://yapayzekalab.org/api/models).

## Kullanıcı workflow'u

Canlı ürünün açıkça gösterdiği temel workflow şöyledir:

1. Hesap aç ve bakiye yükle.
2. API anahtarı oluştur.
3. Seçilen istemcide YapayZekaLab base URL'sini ve anahtarı ayarla.
4. Katalogdaki canonical model ID'siyle isteği `chat` veya `messages` uyumlu uca gönder; desteklenen modellerde streaming kullan.
5. Kullanım ve bakiyeyi Aktivite/Hesap yüzeylerinden izle.

Bu akışın ilk üç adımı canlı dokümanda doğrudan “3 adımda ilk istek” olarak veriliyor; istemci çeşitleri de aynı sayfadaki kurulum kartlarında listeleniyor. Kaynak: [canlı dokümantasyon](https://yapayzekalab.org/docs).

Ana sayfanın public navigasyonu `Ana Sayfa`, `Modeller`, `Paketler`, `Görsel`, `Documents`, `Durum`, `Aktivite` ve `Hesap` bölümlerinden oluşuyor; giriş/kayıt olmadan ürün, katalog, fiyat ve durum okunabiliyor. Kaynak: [canlı ana sayfa](https://yapayzekalab.org/).

## Agent team / orkestrasyon modeli hakkında doğrulanabilenler

Canlı first-party yüz, “agent team”i ayrı bir sunucu ürünü veya YapayZekaLab içinde görev dağıtan bir orkestrasyon runtime'ı olarak belgelemiyor. Doğrulanabilen model daha yalın: farklı agentic istemciler (Claude Code, Codex, Cline, Roo, Windsurf vb.) aynı API geçidine bağlanıyor; agent/workflow mantığı istemcide kalıyor, YapayZekaLab ise model kataloğu, uyumlu API yüzeyi, kimlik doğrulama, bakiye/fiyatlama ve çağrı geçidi sağlıyor. Kaynak: [canlı dokümantasyon](https://yapayzekalab.org/docs).

Bu nedenle “agent team” için canlıdan çıkarılabilen güvenli mimari yorum şudur: ekip içindeki her agent aynı gateway'i farklı anahtar/model seçimiyle kullanabilir; fakat görev kuyruğu, supervisor/worker rolleri, DAG, handoff protokolü, ortak bellek veya çok-agent koordinasyonu canlı first-party dokümanda tanımlı değildir. Bunların YapayZekaLab özelliği olduğunu söylemek mevcut kanıtı aşar.

## Görsel, video ve destek yüzeyi

Ana navigasyonda ayrı bir `Görsel` alanı ve katalogda `images` endpoint'iyle `gpt-image-2` kaydı var. Buna karşılık canlı public katalogda video türü/endpoint'i görülmedi; video yeteneği var sayılmamalı. Kaynaklar: [ana sayfa](https://yapayzekalab.org/), [public model kataloğu](https://yapayzekalab.org/api/models).

Canlı footer, first-party destek kanalı olarak `support@yapayzekalab.org`, Telegram botu ve WhatsApp bağlantısı sunuyor. Kaynak: [canlı ana sayfa](https://yapayzekalab.org/).

## Kritik bulgular

- Ürünün canlı ve doğrulanabilir çekirdeği: çok sağlayıcılı, bakiye tabanlı, OpenAI/Anthropic uyumlu AI API gateway'i.
- “Workflow” ürün kullanımında hesap → bakiye → anahtar → istemci konfigürasyonu → model çağrısı → aktivite takibi şeklinde.
- “Agent team” canlıda yerleşik bir orkestratör olarak belgelenmiyor; agentic istemciler gateway tüketicisi.
- Durum sayacı (42) ile katalog toplamı (63) aynı anda uyuşmuyor; katalog ve status ölçümleri ayrıştırılmalı.
- Görsel endpoint'i canlı katalogda doğrulanıyor; video endpoint'i canlı public katalogdan doğrulanmıyor.

## First-party kaynaklar

- [YapayZekaLab ana sayfa](https://yapayzekalab.org/)
- [Canlı dokümantasyon](https://yapayzekalab.org/docs)
- [Public model kataloğu](https://yapayzekalab.org/api/models)
- [Health endpoint](https://yapayzekalab.org/health)
- [Status endpoint](https://yapayzekalab.org/status)
