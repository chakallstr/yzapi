# CodeFast Reseller — `codex-api` Proxy Hata Raporu

**Tarih:** 2026-06-19
**Reseller ID:** `62c2a5ce-a6d2-4b9b-a454-91bb6d7c5c88`
**Etkilenen proxy:** `codex-api` → `POST https://reseller-api.codefast.app/proxy/codex-api/v1/chat/completions`
**İstek tipi:** Streaming (SSE, `Accept: text/event-stream`) — OpenAI uyumlu chat/completions

---

## Özet

Son 24 saatte `codex-api` proxy'sine yapılan müşteri istekleri yoğun şekilde
**HTTP 502 / 429 / 403 / 404** ile başarısız oluyor. Hatalar çok hızlı dönüyor
(502 için ~400 ms, 429 için ~180 ms) — yani modele ulaşmadan, gateway seviyesinde
reddediliyor. Müşteri istemcisi (agentic kod istemcisi, görev başına çok sayıda
istek atar) bu hataları otomatik tekrar deniyor ve kullanıcı deneyimi tamamen kırılıyor.

İki müşteride yoğunlaşıyor (aşağıda `external_customer_id` ile).

---

## KESİN KANIT — entegratörü atlayıp doğrudan CF proxy testi

Sorunun sizde mi bizde mi olduğunu kesinleştirmek için, **kendi sistemimizi tamamen
devre dışı bırakıp** yeni açtığımız (durum: `fulfilled`, dolu ünite) bir müşteri
key'iyle (`cf_rc_live_…`) **doğrudan sizin proxy'nize** istek attık:

```
POST https://reseller-api.codefast.app/proxy/codex-api/v1/chat/completions
Authorization: Bearer cf_rc_live_…   (yeni, kotası dolu müşteri keyi)

model gpt-5.4     → HTTP 502  {"success":false,"error":"Hata Oluştu","request_id":"a0df00b588efea2a"}  (1.07 sn)
model gpt-5.5     → HTTP 502  {"success":false,"error":"Hata Oluştu","request_id":"a0df00bc6d472d8e"}  (0.36 sn)
model gpt-5-codex → HTTP 502  {"success":false,"error":"Hata Oluştu","request_id":"a0df00bf0e6de690"}  (0.40 sn)
```

Bu istekte **bizim hiçbir kodumuz/proxy'miz yok** — doğrudan size geldi. Sonuç:
ünite dolu (403 değil), 3 model id'de de aynı (model eşleme sorunu değil), ~0.4 sn'de
502 (modele ulaşılmadan, gateway'de reddediliyor). **Yani sorun `codex-api` inference
gateway'inizde.** Sipariş/order API'leriniz çalışıyor (order `fulfilled` döndü), yalnız
proxy/inference ucu 502 veriyor.

⚠️ `codex-api` tamamen ölü değil, **çırpınıyor**: son 12 saatte ~**%53 başarısız**
(506 hata / 446 başarı). Agentic istemciler (Codex) görev başına çok sayıda ardışık
başarılı çağrıya muhtaç olduğundan bu hata oranında görevler tamamlanamıyor.

Yukarıdaki `request_id` değerleri SİZE ait — lütfen kendi gateway loglarınızda bu üç
id'yi ve aşağıdaki zaman pencerelerini inceleyin.

---

## Hata dökümü (son 24 saat, UTC)

### Müşteri A — `external_customer_id: 2052f75b-2c3b-4103-8819-5c91703781ce`
**order_id:** `d3809830-99b3-401a-9a88-b6da3e95ee77`

| HTTP | Adet | İlk (UTC) | Son (UTC) |
|------|-----:|-----------|-----------|
| 502  | 40   | 2026-06-19 01:41:51 | 2026-06-19 01:56:37 |
| 429  | 13   | 2026-06-19 01:41:53 | 2026-06-19 01:56:24 |
| 401  | 1    | 2026-06-19 01:46:31 | 2026-06-19 01:46:31 |

### Müşteri B — `external_customer_id: 5ed3dd98-490c-4737-ba11-9929cca1941c`
**order_id:** `351436ca-4dea-4b4d-b365-22c9c799a8be`

| HTTP | Adet | İlk (UTC) | Son (UTC) |
|------|-----:|-----------|-----------|
| 403  | 146  | 2026-06-18 23:33:21 | 2026-06-19 00:02:06 |
| 502  | 137  | 2026-06-18 23:15:45 | 2026-06-19 01:49:08 |
| 404  | 128  | 2026-06-18 21:53:29 | 2026-06-18 22:23:45 |
| 429  | 22   | 2026-06-18 22:00:25 | 2026-06-19 01:49:09 |
| 401  | 1    | 2026-06-19 01:38:27 | 2026-06-19 01:38:27 |

---

## Örnek tam zaman damgaları (gateway loglarınızda aratmak için)

Müşteri A (`2052f75b-...`), `codex-api` proxy, en güncel:

```
2026-06-19T01:56:37.555Z  502  (411 ms)
2026-06-19T01:56:35.845Z  502  (439 ms)
2026-06-19T01:56:34.597Z  502  (420 ms)
2026-06-19T01:56:24.994Z  429  (182 ms)
2026-06-19T01:56:23.549Z  429  (181 ms)
2026-06-19T01:56:22.603Z  429  (183 ms)
2026-06-19T01:56:14.685Z  502  (423 ms)
2026-06-19T01:56:13.544Z  502  (395 ms)
```

---

## Sorularımız / talebimiz

1. **502 Bad Gateway:** `codex-api` proxy'si neden 502 dönüyor? Gateway ile arka
   uç model sağlayıcı arasında bir sorun mu var? ~400 ms'de dönmesi modele hiç
   ulaşılmadığını gösteriyor.

2. **429 Rate limit:** Bu proxy / müşteri-key başına uyguladığınız hız limiti
   nedir? Eşik nedir, hangi pencerede? Reseller olarak limitimizi artırabilir miyiz?

3. **403:** Müşterinin ünite/kota bitince mi 403 dönüyor? 403 gövdesinde kalan
   ünite (`remaining` benzeri) alanı dönüyor mu — biz bunu okuyup senkron tutmak
   istiyoruz; alan adı nedir?

4. **EN KRİTİK — faturalama:** Bir istek **502 / 429 / 404** ile başarısız
   olduğunda müşterinin **ünite kotasından düşülüyor mu?** Başarısız (servis
   edilmemiş) isteğe ünite yazılıyorsa, istemci tekrar denedikçe müşteri haksız
   yere kotasını tüketiyor demektir. Bunu netleştirmeniz çok önemli.

5. **404 (18 Haz 21:53–22:23 UTC):** `codex-api` proxy yolu bu aralıkta neden 404
   "Hata Oluştu" döndü? Order sonrası proxy'nin aktifleşmesinde gecikme mi var?

6. Bu iki müşterinin (order id'leri yukarıda) o pencerelerdeki **kendi tarafınızdaki
   gateway loglarını** paylaşabilir misiniz? Gerçek başarısızlık nedenini eşlemek
   istiyoruz.

---

*Not: Yukarıdaki tüm zaman damgaları UTC'dir. `external_customer_id` ve `order_id`
değerleri sizin sisteminizde kayıtlıdır (order'lar `fulfilled`, müşteriler `active`
durumda görünüyor).*
