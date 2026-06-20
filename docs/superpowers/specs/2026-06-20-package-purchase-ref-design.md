# Tasarım: Paket satın alımına benzersiz takip numarası (`YZK-YYMMDD-XXXX`)

Tarih: 2026-06-20
Proje: yzapi (yapayzekalab)
Durum: Tasarım — onay bekliyor

## 1. Amaç

Her paket satın alımına, müşterinin/admin'in kolayca takip edebileceği, **birbirinden farklı, asla aynı olmayan**, insan-okur bir referans numarası vermek.

Kullanıcının onayladığı dört hedef:
1. **Müşteri kendi takip etsin** — "Paketlerim" panelinde her satın aldığı paket kendi takip numarasıyla görünsün (bugün hiçbir numara görünmüyor).
2. **Destek/WhatsApp referansı** — müşteri "YZK-260620-7K3F paketim" diyebilsin; admin o numarayla anında bulsun.
3. **Admin panelde kolay arama** — uzun hex UUID yerine kısa, okunabilir numarayla ara.
4. **Aynı paketin 2. alışı ayrı kayıt** — tekrar alımlar ayrı, benzersiz birer kayıt/numara olsun.

## 2. Temel içgörü (neden transaction'a bağlıyoruz)

Bir "satın alma" aslında **ödeme olayıdır** ve bu olay zaten `transactions` defterinde 1:1 saklanır
(`tip='paket_satin_alma'`). Sabit pakette ikinci alış mevcut entitlement satırını UZATSA (EXTEND) bile,
**ikinci alış yine kendi transaction satırını yazar**. Yani:

- Referansı **transaction'a** bağlamak → her satın alma kesinlikle ayrı, asla birleşmeyen bir kayıt olur (Hedef 4).
- Kota/kapı/CF/deadlock mantığına **hiç dokunmadan** çözülür (riskli entitlement EXTEND değişikliği yapılmaz).
- Tüm ücretli alış yolları tek bir fonksiyonda (`purchasePackageWithBalance`) birleştiği için referans **tek yerde** üretilir.

Kota görünümü (panelde birleşik havuz) **aynen korunur**; sadece altına "Satın alma geçmişi" eklenir.

## 3. Karar özeti

| Konu | Karar |
|------|-------|
| Anchor | `transactions` satırı (ödeme olayı) |
| Format | `YZK-YYMMDD-XXXX` |
| Önek | `YZK` (yzk_live_ anahtarlarıyla tutarlı) |
| Tarih | `YYMMDD`, **Europe/Istanbul** TZ |
| Rastgele kısım | 4 hane, 32-karakter belirsizlik-yok alfabe `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (I/O/0/1 ve küçük harf yok) |
| Benzersizlik | Üretimde collision pre-check + retry; DB'de partial unique index hard-backstop |
| Kapsam | Ücretli alımlar (`paket_satin_alma`). Redeem/hediye kodları kapsam dışı (para yok = alım yok) |
| Geriye dönük | **Evet** — tüm geçmiş `paket_satin_alma` satırlarına tek seferlik backfill |
| Kota/kapı mantığı | **Değişmez** (entitlement EXTEND/CF/gate/deadlock dokunulmaz) |

`YZK-YYMMDD-XXXX` örnekleri:
```
YZK-260620-7K3F   20 Haz 2026
YZK-260620-9X2M   20 Haz 2026
YZK-260621-Q4B8   21 Haz 2026
```
Kapasite: 32^4 ≈ 1.05M kombinasyon / gün (collision pratikte imkânsız; index yine de garanti eder).

## 4. Veri modeli (migration — inert / geriye-uyumlu)

`transactions` tablosuna iki **nullable** kolon eklenir:

- `purchase_ref text` — insan-okur referans (ör. `YZK-260620-7K3F`).
  - **Partial unique index:** `CREATE UNIQUE INDEX ... ON transactions (purchase_ref) WHERE purchase_ref IS NOT NULL;`
- `package_id text` — satın alınan paketi güvenilir bağlamak için (bugün paket yalnız `aciklama` serbest metninde: `"Paket: <ad>"`). FK zorunlu değil (geçmiş/silinmiş paketlerde NULL kalabilsin).

Mevcut satırlar `NULL` kalır → hiçbir davranış değişmez. Migration, LIVE sıraya uygun numarayla eklenir
(bkz. CLAUDE.md: yerel branch canlının gerisinde olabilir; gerçek live migration max'ına göre numaralandır,
`meta/_journal.json` idx'i buna göre ayarla).

## 5. Referans üreteci (saf, test edilebilir)

İki katman:

1. **Saf fonksiyon** — `formatPurchaseRef(date: Date, rand: string): string`
   - `YZK-` + `YYMMDD` (Europe/Istanbul) + `-` + 4 karakter.
   - Test edilebilir; tarih ve rastgele kısım dışarıdan verilebilir (deterministik test).
2. **DB-farkında sarmalayıcı** — `generateUniquePurchaseRef(sql, date): Promise<string>`
   - 32-karakter alfabeden 4 hane üret → `SELECT 1 FROM transactions WHERE purchase_ref = $ref LIMIT 1`.
   - Çakışırsa yeniden üret (≤5 deneme). 5'te de olmazsa hata fırlat (pratikte imkânsız).
   - Partial unique index, yarış durumunda nihai garanti.

Alfabe `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Rastgelelik `crypto.randomInt`/`randomBytes` ile (tahmin edilemez).

## 6. Üretim noktası (tek yer, para-yolu)

`purchasePackageWithBalance` içindeki mevcut transaction `INSERT`'ünde
(`src/server/services/package-purchase-service.ts` ~186–213):

- `generateUniquePurchaseRef(txSql, now)` çağrılır.
- `INSERT INTO transactions (..., purchase_ref, package_id) VALUES (..., $ref, $packageId)`.
- Aynı DB transaction'ı içinde olduğu için ref + tx atomiktir.

Her ücretli yol bu fonksiyona girdiğinden — ilk alış, configurable/builder, account-delivery **ve her
yenileme/EXTEND** — otomatik olarak kendi benzersiz ref'ini alır. Entitlement/gate mantığı değişmez.

**Kapsam dışı:** Redeem/hediye kodu grant'ı transaction yazmaz (`grantPackageEntitlement(..., purchaseTransactionId=null)`),
dolayısıyla ref almaz. (Para yok = satın alma yok.)

## 7. Müşteri paneli ("Paketlerim")

Mevcut entitlement/kota görünümü **aynen kalır**. Altına **"Satın alma geçmişi"** eklenir:

```
GPT-4 Paket  (1000/gün)
 └ Satın alma geçmişi:
   YZK-260620-7K3F   20 Haz   299₺
   YZK-260625-9X2M   25 Haz   299₺
```

- Veri kaynağı: `transactions WHERE user_id=? AND tip='paket_satin_alma'`, `package_id`'ye göre gruplanır
  (geçmiş/NULL `package_id` satırlarında `aciklama` metnindeki paket adına düşülür), `timestamp DESC`.
- `listUserPackagesForPanel` ya yeni bir alan (`satinAlmaGecmisi[]`) döndürür ya da ayrı bir hafif endpoint
  (`GET /api/user/packages/history`) eklenir. Tercih: tek istekte gelmesi için panel yanıtına gömmek
  (entitlement sorgusu transactions'a dokunmadığından ek sorgu olur; performans için `(user_id, tip, timestamp)`
  uygun index'ten yararlanılır — gerekirse kısmi index eklenir).
- Frontend: `tab-mypackages.jsx` her paket kartına açılır "Satın alma geçmişi" alt-listesi ekler.

## 8. Admin

- Admin kullanıcı-detayında (`GET /api/admin/users/:id`) her satın alma kendi `purchase_ref`'iyle gösterilir.
- **Ref ile arama:** admin panelde bir arama alanı `purchase_ref` → transaction → user + paket çözer
  (`GET /api/admin/purchase/:ref` veya mevcut arama alanına ref desteği). Müşteri WhatsApp'tan ref verince
  admin tek aramada bulur.
- `purchase_ref` üzerinde partial unique index zaten arama için hızlı.

## 9. Geriye dönük backfill (tek seferlik, dikkatli)

Tüm mevcut `tip='paket_satin_alma'` satırlarına ref üret:

- Her satır için tarih = `timestamp` (Europe/Istanbul) → `formatPurchaseRef`.
- Benzersizlik: bellekte set + DB kontrolü; çakışmada yeniden üret.
- `package_id` **best-effort** doldurulur:
  1. `user_package_entitlements.purchase_transaction_id = transactions.id` join'i (EXTEND nedeniyle yalnız
     en-son alımlar bağlı olabilir).
  2. Bağlanamayanlarda `aciklama` "Paket: <ad>" → `packages.ad` eşleşmesi (belirsizse NULL bırak).
  - `package_id` NULL kalsa bile **`purchase_ref` daima üretilir**; panel grubu `aciklama` metnine düşer.
- Script idempotent: yalnız `purchase_ref IS NULL` satırları işler; tekrar çalıştırılabilir.
- Çalıştırma **ayrı, geri-alınabilir adım** (migration'dan bağımsız); önce `--dry-run` ile sayım.

## 10. Kapsam dışı (bilinçli)

- Redeem/hediye grant'larına ref (para yok).
- Satın almada yeni WhatsApp/e-posta bildirimi (bugün yok; istenirse ref'i otomatik müşteriye iten ayrı iş).
- Entitlement EXTEND birleşmesini bölmek (riskli; kullanıcı güvenli "geçmiş listesi" yolunu seçti).

## 11. Test & yayın

- **TDD:**
  - Birim: `formatPurchaseRef` (format, alfabe, TZ sınırı), `generateUniquePurchaseRef` (collision-retry).
  - Entegrasyon: bir alış `purchase_ref`+`package_id` yazar; panel geçmişi döndürür; admin ref ile bulur;
    redeem grant'ı ref yazmaz; EXTEND'de iki alış iki ayrı ref alır.
  - Backfill: dry-run sayımı, idempotentlik, `package_id` best-effort, benzersizlik.
- **Para-yolu kuralları:** Tüm iş **yerel** kalır. 3-ajan QA (≥2 PASS) zorunlu; canlı deploy yalnız çift onayla.
  Migration inert ship edilir (kolonlar NULL, davranış değişmez); backfill ayrı adımda elle tetiklenir.
- **Deploy izolasyonu:** CLAUDE.md'deki yzapi deploy-izolasyon prosedürü (live commit'ten worktree / temiz
  dosya rsync ispatı, `admin.ts`/`tab-admin.jsx` kontaminasyon tuzağına dikkat) uygulanır.

## 12. Etkilenen dosyalar (tahmini)

- `src/server/db/schema.ts` — `transactions`'a `purchase_ref` + `package_id`.
- `src/server/db/migrations/00XX_*.sql` (+ `meta/_journal.json`) — kolonlar + partial unique index (LIVE sıraya göre numara).
- `src/server/services/purchase-ref.ts` (yeni) — `formatPurchaseRef` + `generateUniquePurchaseRef`.
- `src/server/services/package-purchase-service.ts` — INSERT'e ref + package_id.
- `src/server/services/entitlement-service.ts` — panel geçmişi (veya yeni endpoint).
- `src/server/routes/...` — admin ref-arama + (gerekiyorsa) panel history endpoint.
- `src/yapayzekalab/tab-mypackages.jsx` — "Satın alma geçmişi" alt-listesi.
- `src/yapayzekalab/tab-admin.jsx` — ref gösterimi + arama.
- `scripts/backfill-purchase-refs.ts` (yeni) — tek seferlik, dry-run destekli.
- Test dosyaları (birim + entegrasyon).
