# Faz 2 — Ödeme Genişletme + Hediye/Geçiş Kodları (Design Spec)

> Tarih: 2026-06-04 · CodeFast → yzapi tam-klon, Faz 2 (roadmap: `docs/research/codefast-clone-roadmap.md`)
> 🔒 **RELEASE:** kullanıcı çift onayı + 3-QA olmadan ASLA push/deploy yok; her şey lokal. ([[feedback_deploy_double_approval]], [[feedback_qa_gate_deploy]])
> Faz 1 referansı: `docs/superpowers/specs/2026-06-04-faz1-paket-satis-design.md` (paket/entitlement sistemi).

## 1. Amaç & Kapsam
- **Hediye/Geçiş kodları** (admin üretir → kullanıcı kullanır), **iki tip**: `balance` (TL bakiye ekler) veya `package` (Faz 1 paket entitlement'ı verir).
- **DodoPayments** kart entegrasyonu **iskeleti** (init + webhook), Shopier'in **yanına** ek seçenek; anahtar yoksa **kapalı (503)** — canlı bağlama anahtar gelince.
- **Min-ödeme kuralı** (kart/crypto top-up için ₺45 / 1 USD; altı sadece bakiye) — mevcut payment-guards'a ekle/teyit.
- **Sipariş + bakiye hareketleri** kullanıcı görünürlüğü (parite; çoğu mevcut `transactions`/`payments`).

### Kapsam DIŞI
- Dodo canlı webhook testi (anahtar gelince). AI Chat / Studio / status / i18n (Faz 3-6).

## 2. Mimari (DOKUNULMAZ korunur)
- `billing-service.ts`/`pricing-service.ts` değişmez.
- Kod **balance** grant → mevcut `creditUserBalance` (payment-common) deseni (atomik + idempotent ledger).
- Kod **package** grant → Faz 1 entitlement oluşturma. **DRY:** `grantPackageEntitlement(userId, packageId, opts)` helper'ı `package-purchase-service` ve `redeem-code-service` ortak kullanır (purchase'tan refactor).
- Dodo → mevcut cryptomus/shopier webhook desenini izler (`verify → creditUserBalance(idempotent)`).

## 3. Veri Modeli (migration `0020_redeem_codes.sql` + schema.ts)
### `redeem_codes`
| kolon | tip | not |
|------|-----|-----|
| id | uuid PK | |
| code | text UNIQUE | kullanılabilir string (büyük harf) |
| tip | text | `balance` \| `package` |
| amount_tl | numeric(14,4) null | balance tipinde dolu |
| package_id | text null FK packages | package tipinde dolu |
| max_uses | integer default 1 | toplam kullanım hakkı |
| used_count | integer default 0 | |
| per_user_once | boolean default true | aynı kullanıcı 1 kez |
| expires_at | timestamptz null | |
| enabled | boolean default true | aç/kapat |
| aciklama | text default '' | |
| created_at / updated_at | timestamptz | |

### `redeem_code_uses`
| kolon | tip | not |
|------|-----|-----|
| id | uuid PK | |
| code_id | uuid FK redeem_codes | |
| user_id | uuid FK users | |
| redeemed_at | timestamptz default now | |
| transaction_id | uuid null FK transactions | balance grant |
| entitlement_id | uuid null FK user_package_entitlements | package grant |
| **UNIQUE(code_id, user_id)** | | per-user-once + concurrent guard |

`payments.metod` artık `'dodo'` da kabul eder (yorum; enum text olduğu için şema değişmez, sadece doküman).

## 4. Servisler
### `grantPackageEntitlement()` (refactor — paylaşılan)
`package-purchase-service`'teki entitlement oluştur/uzat mantığını `entitlement-service`'e (veya yeni `package-grant.ts`) taşı; `purchasePackageWithBalance` ve redeem ortak çağırır. Snapshot (daily_limit, allowed_models), re-buy/extend davranışı korunur.

### `redeem-code-service.ts`
- `redeemCode(userId, code): {tip, amountTL?, entitlementId?}` — **atomik tek tx**:
  1. kod lookup (enabled, expires_at>now veya null, used_count<max_uses).
  2. `INSERT redeem_code_uses (code_id,user_id,...)` — UNIQUE(code_id,user_id) → mükerrer/eşzamanlı 23505 → "zaten kullandınız".
  3. `UPDATE redeem_codes SET used_count=used_count+1 WHERE id=? AND used_count<max_uses RETURNING` — boşsa "kod tükendi".
  4. tip=balance → `creditUserBalance`-deseni (tip `hediye_kod`); tip=package → `grantPackageEntitlement`.
  5. use satırına tx/entitlement id yaz.
- `generateRedeemCodes(input)` (admin) — N adet benzersiz kod üret (prefix + rastgele), DB'ye yaz.
- `listRedeemCodes()` / `setRedeemCodeEnabled(id,enabled)`.

### `dodopayments-service.ts` (iskelet, anahtar yoksa kapalı)
- `dodoConfigured(): boolean` (env DODO_API_KEY var mı).
- `initDodoPayment(userId, amountTL/usd)` → Dodo checkout/session oluştur (anahtar yoksa AppError 503).
- `verifyDodoWebhook(rawBody, signature)` + `handleDodoWebhook` → doğrula → `creditUserBalance(metod='dodo', idempotencyKey=dodo_<event_id>)`. Dodo gerçek endpoint/imza şeması build'de Dodo docs'tan teyit edilir.

## 5. API uçları
- `POST /api/user/redeem` (auth) → `{ code }` → redeemCode.
- Admin: `GET/POST /api/admin/redeem-codes`, `POST /api/admin/redeem-codes/:id/toggle`.
- `POST /api/payments/dodo/init` (auth), `POST /api/payments/dodo/webhook` (public, imza). `/v1` değil → app.ts whitelist gerekmez.

## 6. Frontend
- Admin "Kodlar" section (tab-admin): toplu üret + liste + aç/kapat.
- Kullanıcı: kod kutusu (`tab-packages` veya billing alanı) → `POST /api/user/redeem`; başarıda bakiye/paket güncellenir.
- (Dodo init butonu top-up akışına eklenebilir; anahtar gelince aktif.)

## 7. Min-ödeme kuralı
`payment-guards`/`payment-pricing`: kart/crypto top-up min ₺45 (1 USD karşılığı, kur ile). Mevcut min varsa teyit/ayarla; yoksa ekle. Paket alımı zaten bakiye (Faz 1).

## 8. Test
- **Unit:** redeem atomiklik (balance+package), per-user-once (UNIQUE), max_uses tükenme, expiry, disabled; generate benzersizlik; dodo webhook verify (imza geçerli/geçersiz); dodoConfigured kapalıyken init 503.
- **Contract/no-leak:** redeem/dodo public şekiller sızdırmaz.
- **Integration (gerçek PG):** redeem balance bakiyeyi atomik artırır + ledger; redeem package entitlement oluşturur; aynı kullanıcı 2. kez → red; max_uses=1 ikinci kullanıcı kullanınca tükenir.

## 9. DOKUNULMAZ / dikkat
- `billing-service`/`pricing` değişmez. Redeem balance → `creditUserBalance` (mevcut idempotent ledger). Package grant → Faz 1 entitlement (cost 0).
- Tüm kod kullanımları atomik + UNIQUE(code_id,user_id) ile çift-grant'a kapalı.
- Dodo anahtar yoksa tamamen kapalı (503), yanlışlıkla canlı para hareketi yok.
- No-leak: provider codename/secret sızmaz.

## 10. Kabul kriterleri
1. Admin balance-kodu ve package-kodu üretir; kullanıcı kullanır; balance→bakiye artar (ledger satırı), package→aktif entitlement.
2. Aynı kullanıcı aynı kodu 2. kez kullanamaz; max_uses dolunca kod tükenir; expired/disabled kod reddedilir.
3. Eşzamanlı aynı-kod-aynı-kullanıcı → tek grant (UNIQUE guard).
4. Dodo anahtarsız: init 503, webhook imza doğrulaması güvenli; anahtarla canlı bağlanmaya hazır.
5. Min-ödeme: kart/crypto top-up < ₺45 reddedilir; bakiye ile sınır yok.
6. `billing-service` + Faz 1 testleri yeşil kalır; no-leak yeşil.
