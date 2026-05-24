# YapayZekaLab Arastirmalari

Tarih: 2026-05-24
Kapsam: son 24 saat API, fiyatlama, site, deploy, Claude/Codex karar izleri.

## Dosya haritasi

- Master ozet: `agent-team/LAST24_MASTER_REPORT.md`
- Codex IDE handoff: `agent-team/CODEX_IDE_HANDOFF.md`
- Agent durum: `agent-team/TEAM_STATUS.md`
- Agent raporlari: `agent-team/reports/`
- QA raporlari: `agent-team/qa/`

## 1. Urun karari

YapayZekaLab paket veya gunluk istek satan bir urun olmayacak.

Aktif karar:

- Paket yok.
- Preset yok.
- Gunluk istek paketi yok.
- Kullanici bakiye/kredi yukler.
- Hangi modeli kullanirsa o modelin gercek kullanimina gore bakiyeden duser.
- Text, image ve video tek bakiye defterinden satilabilir.

Ana dil:

> Kota yok, gizli limit yok. Bakiye yukle, kullandigin kadar ode.

## 2. Fiyatlama karari

Aktif fiyatlama:

- Routing karari: MVP'de YapayZekaLab backendindeki `ProviderAdapter` + `CloseRouter`; `9Router` sadece Faz-2 POC/fallback adayi.
- Text satis carpani: `provider_fiyati * 3.00`
- Billing token kural: `billable_tokens = real_tokens / 0.90`
- 900,000 gercek token = 1,000,000 faturalama tokeni.
- Efektif text carpani yaklasik `3.3333x`.
- Minimum yukleme: `250 TL`
- KDV dahil fiyatlama.
- Canli kur + `%3` buffer.

Risk:

- `all-model-pricing.md` icinde eski `2.30x` notu var.
- Aktif karar `3.00x`.
- Image pricing rakip `llm.gen.tr` karsisinda tekrar kontrol edilmeli.

## 3. Teknik mimari

Aktif repo: `/Users/ufuk/yzapi`

Backend:

- Express + TypeScript.
- Entry: `src/server/index.ts`
- DB: Drizzle + Postgres.
- Proxy: CloseRouter / OpenAI-compatible `/v1`.
- Router siniri: `src/server/services/provider-adapter.ts`; aktif adapter `CloseRouterAdapter`.

Ana route'lar:

- `GET /health`
- `/api/admin`
- `/api/auth`
- `/api/user`
- `/api/payments`
- `/v1/chat/completions`
- `/v1/images/generations`
- `/v1/images/edits`

Eksik:

- Video route su an `501`.
- Claude IDE icin Anthropic Messages API uyumu kesin degil.
- Native Claude panel hedefleniyorsa `/v1/messages` uyumlulugu gerekir.

## 4. Frontend arastirmasi

Aktif UI tek SPA:

- `src/App.tsx`
- `src/main.tsx`
- `src/index.css`

Var olan yuzeyler:

- Ana sayfa.
- Model listesi.
- SSS.
- API sayfasi.
- Admin panel.
- Bakiye yukleme modal.

Eksikler:

- `src/pages/` yok.
- `src/components/` yok.
- Gercek URL router yok.
- `/login`, `/register`, `/dashboard`, `/billing`, `/docs`, `/status`, `/terms`, `/privacy`, `/contact` ayrik sayfa degil.
- Mobil nav riskli; `hidden md:flex`.

## 5. Payment arastirmasi

Planlanan odeme yuzeyleri:

- Shopier.
- IBAN/havale.
- Cryptomus.

Kararlar:

- Kullanici girdigi TL tutar gross/KDV dahil kabul ediliyor.
- IBAN her zaman acik.
- Shopier/Cryptomus env yoksa ilgili endpoint `503`.

Risk:

- Canli webhooklar productionda dogrulanmadi.
- Deploy env dosyalari secret iceriyor; rapora alinmadi.

## 6. Deploy arastirmasi

Hedef:

- Domain: `yapayzekalab.org`
- Host: `jupiter.netlen.com.tr`
- cPanel user: `ufukince1`
- App dizini: `/home/ufukince1/yapayzekalab`
- Startup dokuman karari: `dist/server.js`

Artefaktlar:

- `cpanel-deploy.md`
- `.htaccess`
- `dist/server.js`
- `dist/index.html`
- cPanel/SSH ekran goruntuleri.
- RVF deploy kayitlari.

Kritik bloklar:

- `dist/server/db/migrate.js` yok.
- `dist/server/db/seed.js` yok.
- `cpanel-deploy.md` bu dosyalari bekliyor.
- `.htaccess` yorumu startup `server.js` diyor.
- cPanel dokumani startup `dist/server.js` diyor.
- `dist/server.js` icinde `__require("stream")` riski var.

Sonuc:

Local build geciyor ama production deploy hazir degil.

## 7. Claude / Claude Code arastirmasi

Bulunanlar:

- Claude gecmisinde YapayZekaLab/YZ API rebrand ve site icerigi izleri var.
- Claude Code bundle: `2.1.149`.
- Claude Desktop configte `mcpServers` gorulmedi.
- Claude/Anthropic modeller katalogda var.

Risk:

- "Claude IDE kesin acilir" kaniti yok.
- OpenAI-compatible endpoint tek basina Claude IDE native panel icin yeterli olmayabilir.
- Anthropic Messages API uyumlulugu ayrica test edilmeli.

## 8. Supplier / rakip arastirmasi

Kaynaklar:

- CloseRouter.
- yapayzekapi.store.
- llm.gen.tr.

Bulgular:

- CloseRouter katalogu 33 model olarak dogrulanmis.
- Text ekonomisi genel olarak kullanilabilir.
- Image pricing rakibe gore zayif gorunuyor.
- Video ham maliyetleri yuksek; token mantigiyla paketlenmemeli.

## 9. QA sonucu

Gecenler:

- `npm run lint`: PASS
- `npm test`: PASS, 41/41
- `npm run build`: PASS
- Agent raporu: 10 adet.
- QA raporu: 2 adet.

Kalan bloklar:

- Deploy migration/seed mismatch.
- Stream bundle riski.
- Video endpoint `501`.
- README eski template.
- Mobil nav.
- Claude IDE endpoint belirsizligi.

## 10. Sonraki is sirasi

1. README'yi gercek YapayZekaLab durumuyla guncelle.
2. Build/deploy scriptini migration/seed icin duzelt.
3. cPanel startup path kararini tek hale getir.
4. Stream importunu ESM uyumlu test et.
5. Video endpointleri ya gizle ya uygula.
6. Mobil nav ve URL route yapisini tamamla.
7. Claude IDE gerekiyorsa `/v1/messages` uyumlu route ekle.
