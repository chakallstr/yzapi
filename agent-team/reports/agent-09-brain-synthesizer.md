# Agent 09 - Brain Synthesizer

Kapsam: diger ajan bulgularindan mimari ve is plani sentezi.

## Ortak karar

YapayZekaLab bir paket sitesi degil. Cekirdek urun: kullanici bakiye yukler, API key alir, model bazli gercek kullanim kadar ucret bakiyeden duser.

## Onerilen mimari

1. Public site
   - Ana sayfa, modeller/fiyat, SSS, API dokumani, yasal sayfalar.
   - Paket dili yok; "bakiye yukle, kullandigin kadar ode" dili var.

2. Developer dashboard
   - Login/register.
   - Bakiye, kullanim, API key, invoice/payment history.
   - Model fiyat listesi ve kullanim simulatörü.

3. Admin dashboard
   - Kur/carpan, model aktif/pasif, kullanici, bakiye, payment approve, audit.

4. API gateway
   - `/v1/chat/completions`
   - `/v1/images/*`
   - `/v1/models`
   - Claude IDE hedefleniyorsa ayrica `/v1/messages` uyumlulugu.

5. Billing ledger
   - Her request icin usage kaydi.
   - Bakiye atomik dussun.
   - Streaming icin response-oncesi reserve veya sonradan tahsilat hatasina telafi mekanizmasi.

## Once duzeltilmesi gerekenler

- README guncelle.
- Deploy migration/seed mismatch duzelt.
- cPanel startup talimatini tek hale getir.
- Video endpointleri ya sakla ya uygulamaya al.
- Mobil nav ve ayrik route yapisini tamamla.
- Claude IDE icin Anthropic Messages API uyumlulugunu netlestir.

