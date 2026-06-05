# Test Planı — Faz 1-6 + i18n + UI (Canlı Öncesi)

> Durum: 41 commit lokalde, `fix/upstream-connect-retry` branch. Canlıda: `019cd65`.  
> Kapsam: Faz 1 (paket), Faz 2 (kodlar), Faz 3 (AI Chat), Faz 4a (Studio), Faz 5 (Status/Support), Faz 6 (GitHub OAuth + hesap-teslim + iade), i18n TR/EN, UI stil.  
> Mevcut unit: 581 PASS. Mevcut itest: packages-flow, redeem-flow, account-delivery, image-billing, money-flow + diğerleri.

---

## Bölüm 1 — Paket Satışı (Faz 1)

### 1.1 Paket listeleme
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| P01 | `GET /api/packages` — giriş gerektirmez | 200, enabled paketler | — |
| P02 | Disabled paket admin panelinden kapatılınca listeden düşer | 200, o paket yok | ⚠️ cache yok → her istek DB |
| P03 | Paket yoksa boş array döner | `[]` | — |
| P04 | `fiyatUsd` null olan paket → UI'da TL gösterir | ₺ formatı | — |
| P05 | `fiyatUsd` dolu paket → UI'da $ gösterir | `$X.XX` | — |
| P06 | packages_feature_enabled=false iken → 404 | `{error: "Paket özelliği kapalı"}` | — |

### 1.2 Paket satın alma — mutlu yol
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| P07 | Yeterli bakiyeli kullanıcı `request-limit` paketi alır | 201, entitlement oluşur, bakiye düşer, ledger kaydı var | 💰 PARA |
| P08 | Aynı idempotency key ile tekrar POST → aynı sonuç, çift çekim YOK | 201 ya da 200, bakiye 1x düşer | 💰 PARA |
| P09 | Satın alma sonrası `GET /api/user/entitlements` → paket görünür | aktif entitlement | — |
| P10 | Entitlement `expiresAt` doğru hesaplanmış (`sureGun` gün sonrası) | tarih doğru | — |

### 1.3 Paket satın alma — hata yolları
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| P11 | Yetersiz bakiye → 402 | `errorInsufficientBalance` mesajı, bakiye değişmez | 💰 PARA |
| P12 | Giriş yapmamış kullanıcı → 401 | `errorLoginToBuy` | — |
| P13 | Mevcut olmayan paket ID → 404 | hata | — |
| P14 | Disabled paket ID ile satın alma → 404 | hata | — |
| P15 | Race condition: aynı an 2 istek, bakiye sadece 1'e yeterli | sadece 1 başarılı, diğeri 402 | 💰 PARA ⚠️ |

### 1.4 Entitlement enforcement (kota kapısı)
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| P16 | Paket sahibi günlük limitini aşmadan istek atar | geçer | — |
| P17 | Günlük limit dolunca ek istek → 429 / kota hatası | bloklanır | — |
| P18 | Ertesi gün (reset sonrası) kota sıfırlanır | geçer | — |
| P19 | `expiresAt` geçmiş entitlement → 403/429 | bloklanır | — |
| P20 | Pakette `allowedModels` var, izinsiz model → reddedilir | hata | — |
| P21 | Pakette `allowedModels` var, izinli model → geçer | OK | — |

---

## Bölüm 2 — Hediye / Geçiş Kodları (Faz 2)

### 2.1 Kod kullanma — mutlu yol
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| R01 | Geçerli `balance` kodu → bakiye eklenir, ledger kaydı | 200, `{tip:"balance", amountTL}` | 💰 PARA |
| R02 | Geçerli `package` kodu → entitlement oluşur | 200, `{tip:"package"}` | — |
| R03 | Aynı kodu 2 kez kullanma → 2. seferinde hata | 409 ya da benzeri | 💰 PARA |

### 2.2 Hata yolları
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| R04 | Geçersiz/olmayan kod | 400/404, `errorRedeemFailed` | — |
| R05 | Giriş yapmamış kullanıcı | 401, `errorLoginToRedeem` | — |
| R06 | Süresi dolmuş kod | hata mesajı | — |
| R07 | Büyük/küçük harf farkı → kod çalışır mı? | davranış tutarlı olmalı | — |

---

## Bölüm 3 — AI Chat Playground (Faz 3)

### 3.1 Temel akış
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| A01 | Giriş yapmış kullanıcı `/api/user/ai-chat` POST streaming=true | SSE akışı gelir | — |
| A02 | streaming=false → tek JSON yanıt | `choices[0].message.content` dolu | — |
| A03 | Model listesi `/api/models`'dan gelir, görsel modeller filtrelenir | sadece chat modelleri | — |
| A04 | Giriş yapmamış → 401 | hata mesajı | — |
| A05 | Bakiyesi biten kullanıcı → 402 | yetersiz bakiye mesajı | 💰 PARA |
| A06 | Geçersiz model ID → 400 | hata | — |
| A07 | Çok uzun mesaj / max_tokens aşımı → model hatası düzgün iletilir | kullanıcıya anlaşılır hata | — |

---

## Bölüm 4 — Studio Görsel Üretim (Faz 4a)

### 4.1 Temel akış
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| S01 | Görsel modelle `POST /api/user/studio` → görsel URL/b64 döner | 200, data[] dolu | — |
| S02 | Bakiye çekimi doğru: `chargeImage` çalışır, ledger kaydı | fiyat × adet | 💰 PARA |
| S03 | İdempotency: aynı key ile tekrar → çift çekim yok | 1x ücret | 💰 PARA |
| S04 | n=4 (maks) → 4 görsel, 4x ücret | doğru | 💰 PARA |
| S05 | n=5 (limit aşımı) → 400 | hata | — |
| S06 | Bakiyesi yetersiz → 402, görsel üretilmez | 402 | 💰 PARA |
| S07 | Sağlayıcı 503 → `err_provider_down` | kullanıcıya mesaj | — |
| S08 | Görsel modeli olmayan model ile istek → 400 | hata | — |
| S09 | Eşzamanlı kuyruk: max-N aşılınca 429 ya da sıra bekler | bloklanmaz ama limit aşılmaz | — |

---

## Bölüm 5 — Status Board & Support (Faz 5)

### 5.1 Status
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| ST01 | `GET /status` — giriş gerektirmez | 200, `{status, checks, uptimeSeconds, modelCount, version}` | — |
| ST02 | DB erişilemez iken `checks.db = "down"` | doğru durum | — |
| ST03 | AI sağlayıcı 503 iken `checks.aiProvider = "degraded"/"down"` | doğru durum | — |
| ST04 | 30 saniyede bir otomatik yenileme (UI) | polling çalışır, bellek sızıntısı yok | — |

### 5.2 Support
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| SP01 | `GET /api/support` → env'den kanalları döndürür | channels[] | — |
| SP02 | Env değişkeni yoksa o kanal listede yok | filtrelenmiş | — |
| SP03 | Tüm env boşsa `channels: []` | boş dizi | — |

---

## Bölüm 6 — GitHub OAuth + Hesap Teslim + İade (Faz 6)

### 6.1 GitHub OAuth
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| G01 | GitHub OAuth flow başlar → `/api/auth/github` redirect | doğru GitHub URL | — |
| G02 | Callback ile verified e-posta alınır → hesap oluşur/bağlanır | kullanıcı giriş yapar | 🔐 |
| G03 | GitHub verified primary e-posta yoksa → 400 | hata, hesap oluşmaz | 🔐 |
| G04 | Mevcut Google hesabıyla aynı e-posta → aynı user'a bağlanır | merge | — |
| G05 | GitHub API'si 403/503 döndüğünde → graceful hata | kullanıcıya mesaj | — |
| G06 | Sahte/manipüle edilmiş callback state → reddedilir | 400 | 🔐 |

### 6.2 Hesap teslim paketi satın alma
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| D01 | `account_delivery` tipi paket satın alınır, iletişim bilgisi girilir | delivery_order oluşur, bakiye düşer | 💰 PARA |
| D02 | İletişim bilgisi boş gönderilirse → 400 | hata | — |
| D03 | Admin teslim eder → durum `teslim_edildi` olur | delivery payload set edilir | — |
| D04 | Admin iptal eder → bakiye iade edilir | ledger'a iade kaydı, bakiye artar | 💰 PARA |
| D05 | İade sonrası bakiye doğru: `amountTL` geri eklendi mi? | ledger tutarlı | 💰 PARA |
| D06 | Kullanıcı `GET /api/user/delivery-orders` → kendi siparişlerini görür | sadece kendi | 🔐 |
| D07 | Başka kullanıcının siparişine erişim → 403 | reddedilir | 🔐 |

---

## Bölüm 7 — i18n TR/EN

### 7.1 Dil sistemi
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| I01 | TR → tüm panelde Türkçe metinler | parity kontrolü | — |
| I02 | EN → tüm panelde İngilizce metinler | parity kontrolü | — |
| I03 | Toggle kaydedilir (localStorage `yz_lang`) ve yeniden yüklemede korunur | dil değişmez | — |
| I04 | Tarayıcı `Accept-Language: en` → varsayılan EN | detection çalışır | — |
| I05 | Backend hata mesajları `X-Lang` başlığına göre lokalize olur | TR/EN hata | — |
| I06 | `PATCH /me` ile lang tercihi kaydedilir | DB'de `users.lang` güncellenir | — |
| I07 | i18n string'i eksik olan key → fallback key gösterilir, çökmez | graceful | — |
| I08 | Parametre ikamesi: `{amount}`, `{status}` doğru yerleştirilir | metin doğru | — |

### 7.2 Parite testi
| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| I09 | TR ve EN dict'lerinde aynı key sayısı | `rejected-template-guard` zaten test ediyor | — |
| I10 | Yeni eklenen her string her iki dilde de var | parity | — |

---

## Bölüm 8 — Güvenlik & Veri Sızıntısı

| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| SEC01 | `/api/packages` → sağlayıcı codename/base_url sızmaz | `no-leak` test zaten var | 🔐 |
| SEC02 | Admin endpoint'leri normal kullanıcıya kapalı | 403 | 🔐 |
| SEC03 | Bir kullanıcının entitlement'ı başka kullanıcı göremez | 403 | 🔐 |
| SEC04 | Paket satın alma: `userId` body'den alınmaz, token'dan alınır | başka user adına alım imkansız | 🔐 💰 |
| SEC05 | Studio: `chargeImage` billing'de userId token'dan alınır | 🔐 💰 | |
| SEC06 | GitHub OAuth: state param CSRF koruması | 🔐 | |
| SEC07 | İdempotency key: başka kullanıcının key'ini tekrar kullanamaz | scope kontrolü | 🔐 💰 |
| SEC08 | Delivery order iptali: sadece admin yapabilir | normal user 403 | 🔐 |

---

## Bölüm 9 — Para Tutarlılığı (Ledger Bütünlüğü)

| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| M01 | Paket alımı sonrası: `bakiyeTL = önceki - fiyatTL` | kesin hesap | 💰 |
| M02 | Ledger'da her işlem kaydı var (type, amount, balance_after) | audit trail tam | 💰 |
| M03 | İade sonrası: `bakiyeTL = önceki + amountTL` | kesin hesap | 💰 |
| M04 | Hediye kodu (balance): `bakiyeTL = önceki + kodMiktar` | kesin hesap | 💰 |
| M05 | Çift çekim senaryosu: idempotency key aynı → tek ledger kaydı | idempotent | 💰 |
| M06 | Eş zamanlı 2 satın alma → her ikisi de ledger'a düzgün kaydedilir | atomik | 💰 |
| M07 | `balance_after` = önceki `balance_after` + `amount` (sıralı) | sıra bozulmaz | 💰 |

---

## Bölüm 10 — UI / UX Kontrolleri

| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| U01 | Paket sekmesi: yükleniyor skeleton → yüklendi → kartlar | akış doğru | — |
| U02 | Boş kategori: "Bu kategoride paket bulunamadı" gösterilir | empty state | — |
| U03 | Satın alma sırasında buton spinner, tıklanamaz | busy state | — |
| U04 | Hata mesajı banner'ı fade-in ile gelir | animasyon | — |
| U05 | AI Chat: Enter → gönder, Shift+Enter → satır | klavye kısayolları | — |
| U06 | AI Chat: Temizle → mesaj listesi sıfırlanır | state sıfırlanır | — |
| U07 | Studio: ⌘+Enter → generate tetiklenir | klavye kısayolu | — |
| U08 | Status: 30s polling — sayfa kapatılınca interval temizlenir | bellek sızıntısı yok | — |
| U09 | Support kanalları: hover'da renk + yükselme animasyonu | CSS geçiş | — |
| U10 | Mobil (375px): paket kartları tek sütun, butonlar tam genişlik | responsive | — |
| U11 | `fiyatUsd=null` paket: TL fiyat gösterilir, `$` yok | fallback doğru | — |

---

## Bölüm 11 — Regresyon (Mevcut Canlı Özellikler)

| # | Senaryo | Beklenen | Risk |
|---|---------|----------|------|
| REG01 | `/v1/chat/completions` (OpenAI uyumlu) çalışıyor | 200 + streaming | ⚠️ |
| REG02 | `/v1/messages` (Anthropic native) çalışıyor | 200 + streaming | ⚠️ |
| REG03 | Bakiye yükleme (Shopier webhook) çalışıyor | ledger + bakiye | 💰 |
| REG04 | Google OAuth giriş çalışıyor | token verilir | — |
| REG05 | API key oluşturma/silme çalışıyor | CRUD | — |
| REG06 | Admin panel: kullanıcı listesi, model yönetimi | erişilebilir | — |
| REG07 | `retry + 503` (upstream connect retry fix) çalışıyor | retry sonrası 200 | ⚠️ |
| REG08 | Büyük header (Claude Code 65KB) → 431 yok | 200 | ⚠️ |
| REG09 | Per-model routing: Claude → wellflow, GPT → closerouter | doğru sağlayıcı | — |

---

## Öncelik Sırası

```
P1 (BLOKEDEBİLİR): M01-M07, P11, P15, SEC04, SEC05, REG01-REG09
P2 (ÖNEMLİ):       P07-P10, R01-R03, D01-D07, G01-G06, SEC01-SEC08
P3 (NORMAL):        S01-S09, A01-A07, I01-I10
P4 (DÜŞÜK):         U01-U11, ST01-ST04, SP01-SP03
```

## Test Ortamı Gereksinimleri

- **Gerçek DB**: itest'ler için `itest-setup.ts` ile izole şema  
- **Mock upstream**: Studio/AI Chat için sahte sağlayıcı yanıtları  
- **İki ayrı kullanıcı**: çapraz erişim testleri için  
- **Admin kullanıcı**: SEC02, SEC08, D03-D04  
- **Düşük bakiyeli kullanıcı**: P11, A05, S06  

## Mevcut Kapsam Boşlukları

| Eksik Test | Öneri |
|-----------|-------|
| P15 race condition | `Promise.all` ile 2 eş zamanlı satın alma itest'i |
| M06 atomik çift yazma | concurrent ledger itest |
| I05 backend hata lokalizasyonu | error-handler itest (X-Lang header) |
| U10 mobil responsive | Playwright 375px viewport testi |
| G03 GitHub verified email | mock GitHub API callback itest |
| SEC07 cross-user idempotency | itest: user A key'i user B dener |
