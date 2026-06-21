# Satın Alma Onayı ve Admin Müşteri Paket Yönetimi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Müşteri tarafına satın alma öncesinde onay modalı getirmek; admin tarafına ise tek tek kullanıcı bazında paket tanımlama, silme/iptal, ücret iadesi yapma ve istek limiti (quota) ekleme (CodeFast entegrasyonlu) yetkileri kazandırmak.

**Architecture:** Müşteri tarafında JSX dialog state'i ile standard modal üzerinden onay alınacak. Backend'de `/api/admin/users/*` altında owner-only, idempotent transaction-backed router servisleri ayağa kaldırılacak. Admin panelinde `tab-admin.jsx`'teki kullanıcı detayları sayfasına interaktif interfaceler eklenecek.

**Tech Stack:** React 19, TypeScript, Vitest, Express.js, Drizzle ORM, Postgres-js.

---

## Dosya Haritası

- `src/yapayzekalab/tab-packages.jsx`: Müşteri tarafında satın al tuşunun onay modalını açacak şekilde güncellenmesi.
- `src/server/routes/admin.ts`: `grant`, `revoke`, `refund`, `add-requests` işlemleri için owner-only admin API'lerinin eklenmesi.
- `src/server/__tests__/packages-admin-endpoints.itest.ts`: Yeni endpointlerin yetkilendirme, bakiye düşümü, iade ve CF paket siparişi durumlarını test eden integration test dosyası.
- `src/yapayzekalab/tab-admin.jsx`: Admin kullanıcı tablosunda detay alanına interaktif paket ekle/iade/iptal/istek-ekle kontrollerinin yerleştirilmesi.

---

### Task 1: Müşteri Satın Alma Onay Modalı

**Files:**
- Modify: `src/yapayzekalab/tab-packages.jsx`

- [ ] **Step 1: Onay Modal State ve Yardımcı Elementlerin tab-packages.jsx İçinde Bildirilmesi**

`tab-packages.jsx` içine modal bileşeni ve kart tıklamalarında modalı tetikleyecek state'lerin eklenmesi.
```jsx
// src/yapayzekalab/tab-packages.jsx içindeki PackageCard ve ConfigurablePackageCard
// onBuy aksiyonunu doğrudan tetiklemek yerine onay modalını açacak bir taban state kurulur:
const [confirmTarget, setConfirmTarget] = useState(null); // { pkg, limit, days, type: 'buy'|'code'|'delivery' }
```

- [ ] **Step 2: HTML/CSS Tabanlı Inline Onay Modalının Eklenmesi**

Görsel olarak minimal, sayfa stiline uygun modal bileşeni. tab-packages.jsx sonuna eklenir (JSX body içinde render edilir):
```jsx
{confirmTarget && (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(3px)'
  }} onClick={() => setConfirmTarget(null)}>
    <div style={{
      background: 'var(--surface)', padding: 24, borderRadius: 12,
      width: '100%', maxWidth: 400, border: '1px solid var(--border)',
      boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
    }} onClick={e => e.stopPropagation()}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
        {confirmTarget.pkg.ad} Alım Onayı
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 20 }}>
        Müşteri bakiyenizden <strong>₺{confirmTarget.priceTL}</strong> tahsil edilerek 
        <strong> {confirmTarget.days} gün</strong> süreyle paketi tanımlamak üzeresiniz. Onaylıyor musunuz?
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn-st" onClick={() => setConfirmTarget(null)}>Vazgeç</button>
        <button className="btn-primary" onClick={() => {
          onBuy(confirmTarget.pkg.id, confirmTarget.limit, confirmTarget.days);
          setConfirmTarget(null);
        }}>⚡ Bakiye ile Satın Al</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Testler ile Butonun Tıklama Davranışını Doğrula (Manuel ve Statik Kontrat Testi)**

`src/server/__tests__/packages-buy-label-contract.test.ts` içine modal state ve markup varlığının test edilmesi eklenir.

---

### Task 2: Backend Admin Paket Yönetimi Endpointleri ve Testleri

**Files:**
- Create: `src/server/__tests__/packages-admin-endpoints.itest.ts`
- Modify: `src/server/routes/admin.ts`

- [ ] **Step 1: Integration Testinin Yazılması (RED)**

`src/server/__tests__/packages-admin-endpoints.itest.ts` oluşturulur. Admin role yetkileri, bakiyeden kesinti, hediye ekleme ve iade durumlarını içerecek şekilde Vitest Integration Test standardında yazılır:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import supertest from "supertest";
import { createApp } from "../app.js";
import { db } from "../db/client.js";

const app = createApp();

describe("Admin Paket Yönetimi API", () => {
  it("partnere veya login olmayan kullanıcıya 403 / 401 döndürür", async () => {
    // Partner roldeki kullanıcının request'i post edilerek 403 doğrulanacaktır.
  });

  // Hediye, bakiye kesintili alım ve iade edilme senaryoları mock-user ve mock-entitlement ile sınanır.
});
```

- [ ] **Step 2: Endpointlerin src/server/routes/admin.ts İçinde Implement Edilmesi (GREEN)**

Express admin router'ına `/api/admin/users/:id/packages/grant`, `/api/admin/users/:id/packages/:entId/revoke`, `/api/admin/users/:id/packages/:entId/refund`, `/api/admin/users/:id/packages/:entId/add-requests` rotalarının eklenmesi.

**Grant Endpoint Mantığı:**
```typescript
router.post("/users/:id/packages/grant", async (req, res, next) => {
  try {
    if (req.adminRole !== "owner") return res.status(403).json({ error: "Owner yetkisi gerekli" });
    const { id } = req.params;
    const { packageId, limit, days, source } = req.body as { packageId: string; limit?: number; days?: number; source: 'gift' | 'balance' };
    
    // Müşterinin varlığı ve p.satista / enabled durumları sorgulanır.
    // source === 'balance' ise miktarTL users.bakiyeTL'den düşülür.
    // dbSql transaction bloğunda: bakiye düşümü, transactions logu, grantPackageEntitlement çalışması.
  } catch (e) { next(e); }
});
```

**Refund Endpoint Mantığı:**
```typescript
router.post("/users/:id/packages/:entId/refund", async (req, res, next) => {
  try {
    if (req.adminRole !== "owner") return res.status(403).json({ error: "Owner yetkisi gerekli" });
    const { id, entId } = req.params;
    const { refundedTL } = req.body as { refundedTL: number };

    // Idempotency: "refund_" + entId formatında kontrol yapılır.
    // active durumundaki paket "revoked" yapılır. Müşteri users.bakiye_tl miktarı miktarTL (refundedTL) kadar artırılır.
    // transactions tablosuna 'iade' kaydı atılır.
  } catch (e) { next(e); }
});
```

**AddRequests Endpoint Mantığı:**
```typescript
router.post("/users/:id/packages/:entId/add-requests", async (req, res, next) => {
  try {
    if (req.adminRole !== "owner") return res.status(403).json({ error: "Owner yetkisi gerekli" });
    // CF kontrolü: paket CodeFast tabanlıysa upstream siparişi geçilir.
    // entitlement tablosunda daily_limit_snapshot ve cf_units_ordered kolonları güncellenir.
  } catch (e) { next(e); }
});
```

- [ ] **Step 3: Testleri Çalıştır ve Yeşil Olduğunu Gör**
Run `npm run itest` ve integration testlerin hepsinin başarıyla geçtiğini doğrula.

---

### Task 3: Admin Arayüzünün tab-admin.jsx İçerisinde Eklenmesi

**Files:**
- Modify: `src/yapayzekalab/tab-admin.jsx`

- [ ] **Step 1: tab-admin.jsx'teki Paketler Gridinde revoking/refund/add-requests Arayüz Elementlerinin Eklenmesi**

Kullanıcının detay ekranında yer alan her bir entitlement satırına interaktif butonları yerleştir:
```jsx
// tab-admin.jsx içinde entitlement detail liste map kısmı:
<div style={{ display: 'flex', gap: 6 }}>
  {ent.status === 'active' && (
    <>
      <button className="btn-xs" onClick={() => triggerRefund(ent)}>İade Et</button>
      <button className="btn-xs btn-danger" onClick={() => triggerRevoke(ent)}>İptal</button>
      <button className="btn-xs" onClick={() => triggerAddRequests(ent)}>İstek Ekle</button>
    </>
  )}
</div>
```

- [ ] **Step 2: Paket Ekleme Arayüz Panelinin Eklenmesi ([+] Paket Tanımla)**

Detay ekranının alt kısmına adminlerin yeni paket seçebileceği formu kurmak. Dropdown üzerinde sadece `satista=true & enabled=true` olan paketlerin listelenmesi ve Hediye / Bakiye seçimi ile grant API'sinin tetiklenmesi:
```jsx
// [+] Paket Tanımla JSX Formu
// packageList içinden filtreli dropdown, limit/süre seçimi, Hediye/Bakiye radyoları.
```

- [ ] **Step 3: Modal UI (İade/İptal Onay Pencereleri)**

Farklı iyleştirilmiş diyaloglar ile iade tutarının (varsayılan orijinal tx miktarını okuyarak) güncellenebilmesini sağlayan form modalının arayüze eklenmesi.

- [ ] **Step 4: Sunucu Buildini ve Local Testleri Koştur**
Lokalde `npm run build && npm run lint && npm test` ile her şeyin sorunsuz çalıştığını, public bundle sızıntısı olmadığını (`scan:public`) doğrula.
