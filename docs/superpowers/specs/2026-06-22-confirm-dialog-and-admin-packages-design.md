# Spec: Satın Alma Onay Modalı ve Admin Müşteri Paket Yönetimi

Tarih: 2026-06-22  
Durum: Taslak (Onay Bekliyor)  
Yazarlar: Claude Code & Ufuk

---

## 1. Giriş ve Sorun Tanımı
Müşteri panelinde (`tab-packages.jsx`), "Kendin Yap" (builder) paketlerinde buton etiketinin hatalı olması nedeniyle accidental (kazara) satın almalar yaşanmış ve iade işlemleri yapılmıştır. Güvenlik önlemi olarak hem tüm kartlara satın alma onayı getirilmesi hem de admin panelinde müşterilerin paketlerini yönetmek için (ekleme, iptal/silme, iade etme, istek limiti ekleme) detaylı bir kontrol mekanizması kurulması gerekmektedir. 

Mevcut durumda admin panelinde sadece kullanıcı detayları ve paketler listelenmekte, ancak admin tarafında bu paketlere müdahale (yetkili bazda ekleme/düzenleme) ad-hoc SQL'ler haricinde yapılamamaktadır.

---

## 2. Kapsam ve Temel Kararlar

### A. Müşteri Tarafı Satın Alma Onayı (Confirm Dialog)
- `tab-packages.jsx` altındaki bakiye tüketen tüm kartlar (Standart & Builder) için satın alma butonuna tıklandığında anında satın alma YAPILMAYACAK.
- Araya bir tarayıcı onay modalı (HTML/CSS tabanlı inline modal, standard `window.confirm` değil) girecek.
- Bu modalda:
  - Satın alınmak istenen paketin adı.
  - Tutar (₺ ve $ olarak).
  - Limit ve süre detayları.
  - "İptal Et" ve "Bakiye ile Satın Al" butonları yer alacak.
- "Bakiye ile Satın Al" tıklandığında asıl satın alma akışı (`onBuy`) ve spinner state tetiklenecek. Model iptal edildiğinde veya dışarı tıklandığında modal kapanacak, para çekilmeyecek.

### B. Admin Panelinde Paket Yönetimi (Backend)
Express backend'e (`src/server/routes/admin.ts`) 4 yeni **owner-only** endpoint eklenecek:
1. **Paket Ekle (`POST /api/admin/users/:id/packages/grant`)**:
   - Müşteriye eldeki paket tanımlarından birini ekler.
   - Seçenek: **Hediye** (Bakiye düşmez, transaction kaydı 0 TL yazılır) veya **Bakiyeden** (Müşterinin bakiyesinden paketin güncel bedeli düşülür, bakiye yetersizse 402 döner).
2. **Paket İptal (`POST /api/admin/users/:id/packages/:entId/revoke`)**:
   - Paketi iptal eder (`status = 'revoked'`).
   - CF paketi ise CodeFast reseller order'ı iptal/revoke edilir (best-effort). Para iadesi yapılmaz.
3. **Paket İade (`POST /api/admin/users/:id/packages/:entId/refund`)**:
   - Paketi iptal eder (`status = 'revoked'`).
   - Admin tarafından girilen tutarı (varsayılan olarak paketin orijinal satın alma işleminin tutarı getirilir, admin bunu dilerse değiştirebilir) müşterinin bakiyesine iade eder (`transactions` tablosuna `iade` kaydı atılır, `users.bakiye_tl` güncellenir).
4. **İstek Ekle (`POST /api/admin/users/:id/packages/:entId/add-requests`)**:
   - Admin pakete ekstra API isteği eklemek istediğinde:
     - CF paketi ise: CodeFast reseller API üzerinden gerçek CF paketi order edilir (maliyet yansır), entitlement'ın `daily_limit_snapshot` ve `cf_units_ordered` kolonları artırılır.
     - Standart paket ise: Sadece entitlement limit tablosundaki `daily_limit_snapshot` artırılır (bedava).

### C. Admin Panelinde Paket Yönetimi (Frontend & Yetki)
`tab-admin.jsx` altındaki kullanıcı detay görünümünde (Users -> UserDetail panelindeki "Paketler" sekmesinde):
- Mevcut paket listesinin her bir aktif paketi için satır içi eylem butonları eklenecek: **[İade Et]**, **[İptal Et]**, **[İstek Ekle]**.
- Listenin altına **[+] Paket Tanımla** alanı eklenecek:
  - Paket seçmek için dropdown (yalnız `enabled=true & satista=true & kategori <> 'Deneme'`).
  - Configurable paket seçilirse: Limit ve gün inputları görünür, dynamically fiyat hesaplar.
  - Kaynak seçeneği: `Hediye` veya `Bakiyeden Kes`.
- **Hassas Yetkilendirme**: Bu işlemler sadece `adminRole === 'owner'` (cix.crazy666@gmail.com) ise görünür ve tetiklenebilir olacak. Ortak (partner) adminler sadece salt-okunur görebilecek.

---

## 3. Veri Yapısı ve Güvenlik (Idempotency)

- **Audit Log**: Yapılan her admin işlemi `writeAudit` ile loglanır: `"admin_grant_package"`, `"admin_revoke_package"`, `"admin_refund_package"`, `"admin_add_requests"`.
- **Idempotency (Mükerrerlik Koruması)**:
  - Admin grant işleminde: Arayüzden benzersiz bir key alınır veya üretilir, `grant_<userId>_<idempKey>` ile db'de korunur.
  - İade ve İptal işlemlerinde: Sunucu tarafında `refund_<entId>_<floor(now/30s)>` veya `revoke_<entId>_<floor(now/30s)>` formatında 90 saniyelik buffer ile idempotency key üretilecek. Çift tıklama veya bağlantı kopmasında müşteriye 2 kere para verilmesi veya paketinin 2 kere iade yazılması engellenecek.
- **İade Tutar Koruması**: İade edilecek miktar negatif olamaz ve iade işlemi sadece paketin güncel durumu `active` ise yapılabilir.

---

## 4. Test Stratejisi
1. **Bakiye ve Paket Ekleme Testleri**: `money-flow.itest.ts` ve `billing-edge-cases.itest.ts` dosyalarına entegre edilecek yeni admin integration testleri.
2. **Onay Modalı Kontratı**: Satın alma onay modalının frontend tarafında JSX seviyesinde render ve state kontrolünü doğrulamak üzere statik kontrat testinin kurulması.
