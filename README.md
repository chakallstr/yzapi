# YapayZekaLab / yzapi

YapayZekaLab, müşterinin TL bakiye yükleyip kendi `yzk_live_*` API key'iyle model bazlı kullandığı kadar ödediği OpenAI uyumlu API gateway + panel projesidir.

## Aktif Mimari Karar

- Ana satış ve bakiye sistemi YapayZekaLab backendinde kalır.
- MVP upstream akışı: `Müşteri -> YapayZekaLab API Backend -> CloseRouter`.
- 9Router ana satış katmanı değildir; Faz-2'de `ProviderAdapter` arkasında POC/fallback olarak denenebilir.
- Public yüzeyde çarpan/formül gösterilmez; sadece müşteri fiyatı, bakiye ve kullanım maliyeti gösterilir.

## Backend

- Node.js + Express + TypeScript
- PostgreSQL + Drizzle
- API key auth, admin auth, TL bakiye, usage records, payments
- Public durum endpointi: `/status` secretsız API/DB/provider/model/deploy özeti döner.
- Admin mutabakat endpointleri: `/api/admin/reconciliation` ve `/api/admin/reconciliation/export`
- Admin panelde mutabakat sekmesi kullanıcı bakiyesi ile ledger toplamını görünür yapar.
- `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/v1/images/generations`, `/v1/images/edits`
- Video endpointleri şu an production-ready değildir.
- VPS kurulum/deploy rehberi: `docs/vps-deploy.md`

## Güncel Sertleştirme Durumu

- Usage kayıtları `request_id`, upstream id, raw usage, fiyat snapshot'ı, kalan bakiye ve hata kodu taşır.
- Başarılı usage bakiye düşümü, transaction ve usage kaydı aynı DB transaction içinde yazılır.
- Aynı `request_id` ikinci kez gelirse bakiye çift düşmez.
- Hatalı provider çağrısı cost `0` ile usage kanıtı bırakır.
- IBAN onayında müşteri 120 TL öderse kullanılabilir bakiye 120 TL artar; KDV ayrımı rapor/metadata tarafındadır.
- Müşteri API key oluşturma ve iptal aksiyonları audit log'a yazılır.
- Production Express sadece `dist/assets` servis eder; `/api/*` ve `/v1/*` bilinmeyen route'ları JSON `404` döner.
- VPS deploy manifesti `.deploy/releases/*.json` altında tutulur; rollback scripti ve smoke sonucu kayıtlanır.
- Müşteri aktivasyon yüzeyi API sekmesinde giriş, bakiye, API key, ilk istek ve usage adımlarını gösterir.

## Çalıştırma

1. Bağımlılıkları kur: `npm install`
2. `.env.example` üzerinden `.env` oluştur; gerçek secret dosyaları commitlenmez.
3. Lokal geliştirme: `npm run dev`
4. Kontrol kapıları: `npm run lint`, `npm test`, `npm run build`
5. Public sızıntı taraması: `npm run scan:public`
6. Local/live smoke: `SMOKE_BASE_URL=http://127.0.0.1:4567 npm run smoke:vps`

## Kanıt Kuralı

Bir iş tamam sayılmadan önce ilgili test/build/smoke çıktısı `agent-team/WORKLOG.md` içine yazılır.
