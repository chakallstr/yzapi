# Müşteri Self-Servis Paket İptali — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** yzapi "Paketlerim" sekmesinde müşteri kendi aktif paketini bir modal üzerinden kalıcı iptal edebilsin (para iadesi YOK); istek hakkı bitenler otomatik "Bitti" görünsün.

**Architecture:** Backend'de `user_package_entitlements.status='cancelled'` yazan, sahiplik-kontrollü, idempotent yeni servis fonksiyonu + tek route (mevcut `pause/resume/renew` desenini birebir izler). **Migration YOK** (status kolonu zaten var). Frontend'de paket satırları tıklanabilir → tek bir modal'da Duraklat/Yenile/İptal et aksiyonları toplanır. "Bitti" etiketi saf i18n değişikliği (mevcut `tukendi` durumu).

**Tech Stack:** Node/Express + Drizzle/postgres (`dbSql` tagged-template), React (JSX panel), vitest (mock-DB unit + source-string contract testleri), i18n key sistemi.

**Spec:** `docs/superpowers/specs/2026-06-23-musteri-paket-iptal-design.md`

**Dokunulacak dosyalar:**
- `src/server/services/entitlement-service.ts` — yeni `cancelEntitlement()` (additive; ⚠️ canlı-lokal drift'li dosya, deploy'da canlıya hunk uygulanır)
- `src/server/services/entitlement-service.test.ts` — `cancelEntitlement` unit testleri
- `src/server/routes/user.ts` — `cancelEntitlement` import + `POST /entitlements/:id/cancel`
- `src/server/__tests__/entitlement-cancel-route-contract.test.ts` — yeni route contract testi
- `src/yapayzekalab/i18n/strings/mypackages.js` — `tukendi→Bitti`, `cancelled` etiketi, iptal aksiyon metinleri (tr+en)
- `src/yapayzekalab/tab-mypackages.jsx` — tıklanabilir satır + modal + `cancel` handler + `isCancellable` + `DURUM_META.cancelled`
- `src/yapayzekalab/tab-admin.jsx` — admin durum etiketine `cancelled` case (tutarlılık)

**Güvenlik/altyapı notları (uygulama sırasında uyulacak):**
- Para/ledger tablosuna DOKUNULMAZ → auto-mode para-kritik sınıflandırıcısı tetiklenmez. Hiçbir adım ad-hoc `UPDATE/INSERT/DELETE` ile canlı DB'ye yazmaz.
- Hiçbir adım SSH/curl ile canlıya gitmez (fail2ban). Implementasyon tamamen lokal + testtir. Deploy ayrı, gated bir bölümdür (en sonda, checkbox DEĞİL).

---

### Task 1: Backend servis — `cancelEntitlement()`

**Files:**
- Modify: `src/server/services/entitlement-service.ts` (mevcut `setEntitlementPaused` fonksiyonunun hemen ardına ekle, ~satır 426 sonrası)
- Test: `src/server/services/entitlement-service.test.ts` (dosya sonuna yeni `it(...)` blokları)

Bağlam — mirror alınacak mevcut fonksiyon (`entitlement-service.ts:418-426`, DEĞİŞTİRME, referans):
```ts
export async function setEntitlementPaused(userId: string, entitlementId: string, paused: boolean): Promise<boolean> {
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements SET paused = ${paused}, updated_at = now()
    WHERE id = ${entitlementId}::uuid AND user_id = ${userId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}
```

- [ ] **Step 1: Write the failing tests**

`entitlement-service.test.ts` dosyasının SONUNA (son `it(...)`'ten sonra, kapatan `});`'ten ÖNCE) ekle:

```ts
  it("cancelEntitlement returns true and UPDATE is owner + active-only scoped", async () => {
    mockDbSql.mockResolvedValueOnce([{ id: "ent-1" }]);
    const { cancelEntitlement } = await import("./entitlement-service.js");
    const res = await cancelEntitlement("user-1", "ent-1");
    expect(res).toBe(true);
    // güvenlik invariant'ları: SET status='cancelled' + sahiplik (user_id) + terminal-guard (status='active')
    const sql = mockDbSql.mock.calls.at(-1)?.[0]?.join("?") ?? "";
    expect(sql).toMatch(/status\s*=\s*'cancelled'/);
    expect(sql).toMatch(/user_id\s*=/);
    expect(sql).toMatch(/status\s*=\s*'active'/);
  });

  it("cancelEntitlement returns false when no active row matches (wrong owner / already cancelled / missing)", async () => {
    mockDbSql.mockResolvedValueOnce([]);
    const { cancelEntitlement } = await import("./entitlement-service.js");
    expect(await cancelEntitlement("user-1", "ent-1")).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/server/services/entitlement-service.test.ts`
Expected: FAIL — `cancelEntitlement is not a function` (henüz export edilmedi).

- [ ] **Step 3: Implement `cancelEntitlement`**

`entitlement-service.ts` içinde `setEntitlementPaused` fonksiyonunun hemen altına ekle:

```ts
/**
 * Müşteri kendi paketini KALICI iptal eder (sahiplik kontrollü, terminal, idempotent).
 * Yalnız DB status='active' satır iptal edilir — bu küme aktif/duraklatılmış/günlük-dolu/
 * tükenmiş (Bitti) paketlerin HEPSİNİ kapsar (hepsi DB'de status='active'). Zaten iptal/
 * expired/revoked olan → 0 satır → false (route 404). Çift-tık → 2. çağrı 0 satır → güvenli.
 * Para hareketi YOK, CF/upstream çağrısı YOK — yalnız status'u 'cancelled' yapar.
 * Gate (checkPackageCoverage/tryReservePackageSlot) status='active' filtreler → iptal edilen
 * paket anında servis vermez; listUserPackagesForPanel onu "İptal edildi" geçmişinde gösterir.
 */
export async function cancelEntitlement(userId: string, entitlementId: string): Promise<boolean> {
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements SET status = 'cancelled', updated_at = now()
    WHERE id = ${entitlementId}::uuid AND user_id = ${userId}::uuid AND status = 'active'
    RETURNING id
  `;
  return rows.length > 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/server/services/entitlement-service.test.ts`
Expected: PASS (yeni 2 test + dosyadaki mevcut testler yeşil).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/entitlement-service.ts src/server/services/entitlement-service.test.ts
git commit -m "feat(entitlement): cancelEntitlement servis fonksiyonu (sahiplik+terminal, iade yok)"
```

---

### Task 2: Backend route — `POST /api/user/entitlements/:id/cancel`

**Files:**
- Modify: `src/server/routes/user.ts` (import satırı 16 + renew route'unun ardına, ~satır 195)
- Test: `src/server/__tests__/entitlement-cancel-route-contract.test.ts` (yeni, mevcut `packages-noleak.test.ts` contract idiomunu izler)

Bağlam — mirror alınacak renew route (`user.ts:181-194`, DEĞİŞTİRME, referans):
```ts
router.post("/entitlements/:id/renew", async (req, res, next) => {
  try {
    if (!(await packagesFeatureEnabled())) { res.status(404).json({ error: "Paket özelliği kapalı" }); return; }
    const result = await renewEntitlement(req.user!.id, req.params.id);
    await writeAudit("package_renew", req.params.id, "Müşteri paketini yeniledi (bakiyeden)", req.user!.id);
    res.json(result);
  } catch (e) { next(e); }
});
```

- [ ] **Step 1: Write the failing contract test**

Yeni dosya `src/server/__tests__/entitlement-cancel-route-contract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("entitlement cancel route contract (user.ts)", () => {
  const src = readFileSync(join(process.cwd(), "src/server/routes/user.ts"), "utf8");

  it("exposes POST /entitlements/:id/cancel", () => {
    expect(src).toMatch(/router\.post\(\s*["'`]\/entitlements\/:id\/cancel["'`]/);
  });

  it("imports cancelEntitlement from entitlement-service", () => {
    expect(src).toMatch(/cancelEntitlement[^;]*from\s+["']\.\.\/services\/entitlement-service\.js["']/);
  });

  it("delegates to cancelEntitlement(req.user!.id, req.params.id)", () => {
    expect(src).toMatch(/cancelEntitlement\(\s*req\.user!\.id\s*,\s*req\.params\.id\s*\)/);
  });

  it("writes a package_cancel audit log", () => {
    expect(src).toMatch(/writeAudit\(\s*["'`]package_cancel["'`]/);
  });

  it("returns 404 when the entitlement is not found / not cancellable", () => {
    expect(src).toMatch(/status\(404\)/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/server/__tests__/entitlement-cancel-route-contract.test.ts`
Expected: FAIL — ilk `expect(...).toMatch` başarısız (route henüz yok).

- [ ] **Step 3: Add the import**

`user.ts` satır 16'daki import'a `cancelEntitlement` ekle. ESKİ:
```ts
import { listUserEntitlements, listUserPackagesForPanel, setEntitlementPaused, listUserPurchaseHistory } from "../services/entitlement-service.js";
```
YENİ:
```ts
import { listUserEntitlements, listUserPackagesForPanel, setEntitlementPaused, cancelEntitlement, listUserPurchaseHistory } from "../services/entitlement-service.js";
```

- [ ] **Step 4: Add the cancel route**

`user.ts` içinde renew route'unun (`router.post("/entitlements/:id/renew", ...)` bloğu) hemen ardına ekle:

```ts
// Paket iptal — KALICI (terminal). Para iadesi YOK; paket anında durur + "İptal edildi" geçmişine düşer.
router.post("/entitlements/:id/cancel", async (req, res, next) => {
  try {
    const ok = await cancelEntitlement(req.user!.id, req.params.id);
    if (!ok) { res.status(404).json({ error: "Paket bulunamadı" }); return; }
    await writeAudit("package_cancel", req.params.id, "Müşteri paketi iptal etti", req.user!.id);
    res.json({ ok: true, cancelled: true });
  } catch (e) {
    next(e);
  }
});
```

- [ ] **Step 5: Run the contract test to verify it passes**

Run: `npx vitest run src/server/__tests__/entitlement-cancel-route-contract.test.ts`
Expected: PASS (5/5).

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/user.ts src/server/__tests__/entitlement-cancel-route-contract.test.ts
git commit -m "feat(user-route): POST /entitlements/:id/cancel (sahiplik+audit, iade yok)"
```

---

### Task 3: i18n — "Bitti" relabel + iptal metinleri (tr + en parity)

**Files:**
- Modify: `src/yapayzekalab/i18n/strings/mypackages.js`

Bu task'ta test yok (saf string dosyası); doğrulama Task 6'daki `lint`+`build`. Parite (tr/en) elle korunur.

- [ ] **Step 1: TR — `tukendi` etiketini "Bitti" yap**

`tr` bloğunda ESKİ:
```js
    'mypackages.status.tukendi': 'Tükendi',
```
YENİ:
```js
    'mypackages.status.tukendi': 'Bitti',
```

- [ ] **Step 2: TR — `cancelled` durum etiketi + iptal/modal metinleri ekle**

`tr` bloğunda `'mypackages.status.suresi_doldu': 'Süresi doldu',` satırının HEMEN ALTINA ekle:
```js
    'mypackages.status.cancelled': 'İptal edildi',
    'mypackages.manage': 'Paketi yönet',
    'mypackages.close': 'Kapat',
    'mypackages.cancel': 'İptal et',
    'mypackages.cancelHint': 'Bu paketi kalıcı olarak iptal eder. Para iadesi yoktur, geri alınamaz.',
    'mypackages.cancelConfirm': 'Bu paketi iptal etmek istiyor musun? Geri alınamaz ve para iadesi yoktur.',
    'mypackages.cancelOk': 'Paket iptal edildi.',
    'mypackages.cancelErr': 'İptal başarısız oldu, tekrar dene.',
```

- [ ] **Step 3: EN — `tukendi` etiketini "Finished" yap**

`en` bloğunda ESKİ:
```js
    'mypackages.status.tukendi': 'Used up',
```
YENİ:
```js
    'mypackages.status.tukendi': 'Finished',
```

- [ ] **Step 4: EN — `cancelled` + iptal/modal metinleri ekle (parite)**

`en` bloğunda `'mypackages.status.suresi_doldu': 'Expired',` satırının HEMEN ALTINA ekle:
```js
    'mypackages.status.cancelled': 'Cancelled',
    'mypackages.manage': 'Manage package',
    'mypackages.close': 'Close',
    'mypackages.cancel': 'Cancel',
    'mypackages.cancelHint': 'Permanently cancels this package. No refund, cannot be undone.',
    'mypackages.cancelConfirm': 'Cancel this package? This cannot be undone and there is no refund.',
    'mypackages.cancelOk': 'Package cancelled.',
    'mypackages.cancelErr': 'Cancellation failed, please try again.',
```

- [ ] **Step 5: Commit**

```bash
git add src/yapayzekalab/i18n/strings/mypackages.js
git commit -m "i18n(mypackages): tukendi→Bitti/Finished + iptal & modal metinleri (tr/en)"
```

---

### Task 4: Frontend — tıklanabilir satır + yönetim modalı + iptal

**Files:**
- Modify: `src/yapayzekalab/tab-mypackages.jsx` (TÜM DOSYAYI aşağıdaki içerikle değiştir)

JSX render harness yok → doğrulama `lint` + `build` + manuel. Değişiklikler: (a) `DURUM_META.cancelled`, (b) modül-seviye `isCancellable`, (c) `selected` state + `cancel` handler, (d) aksiyonlar inline satırdan **modal'a** taşınır, (e) tüm satırlar tıklanabilir (`role=button`+klavye)+chevron, (f) `PackageModal`. `togglePause`/`renew`/`cancel` başarıda modalı kapatır.

- [ ] **Step 1: Replace the entire file**

`src/yapayzekalab/tab-mypackages.jsx` içeriğini TAMAMEN şununla değiştir:

```jsx
import { useEffect, useState, useCallback } from 'react';
import { Card, Caption, PulseDot, I, fmt } from './shared.jsx';
import { apiJson } from './auth-client.js';
import { useT } from './i18n/index.jsx';

/* ============================================
   MyPackagesTab — "Paketlerim": takip + yönet (modal) + duraklat + iptal + kullandığın kadar öde
   ============================================ */

const DURUM_META = {
  aktif:        { bg: '#dcfce7', fg: '#15803d' },
  duraklatildi: { bg: '#e0e7ff', fg: '#4338ca' },
  gunluk_doldu: { bg: '#fef3c7', fg: '#b45309' },
  tukendi:      { bg: '#fee2e2', fg: '#b91c1c' },
  suresi_doldu: { bg: '#e5e7eb', fg: '#4b5563' },
  cancelled:    { bg: '#e5e7eb', fg: '#4b5563' },
};

const safeDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
};

// Aktif bölüm/geçmiş ayrımı (mevcut davranış) — tukendi geçmişte "Bitti" olarak görünür.
const isActiveDurum = (durum) => durum === 'aktif' || durum === 'duraklatildi' || durum === 'gunluk_doldu';
// Pause/Resume yalnız aktif/duraklatılmış/günlük-dolu (tükenmiş paket duraklatılmaz).
const canControlDurum = (durum) => isActiveDurum(durum);
// İptal: DB status='active' olan TÜM satırlar (aktif/duraklatılmış/günlük-dolu/tükenmiş=Bitti).
const isCancellable = (durum) => durum === 'aktif' || durum === 'duraklatildi' || durum === 'gunluk_doldu' || durum === 'tukendi';

export function MyPackagesTab() {
  const { t } = useT();
  const [packages, setPackages] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(''); // entitlement id veya 'payg'
  const [notice, setNotice] = useState(null); // { type: 'ok'|'err', msg }
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [selected, setSelected] = useState(null); // yönetim modalı için seçili paket

  const load = useCallback(async () => {
    setLoading(true);
    const [pkgs, meRes, phRes] = await Promise.all([
      apiJson('/api/user/packages').catch(() => []),
      apiJson('/api/user/me').catch(() => null),
      apiJson('/api/user/purchase-history').catch(() => []),
    ]);
    setPackages(Array.isArray(pkgs) ? pkgs : []);
    setMe(meRes);
    setPurchaseHistory(Array.isArray(phRes) ? phRes : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const paygOn = me?.paygMode === true;
  const balanceTL = Number(me?.bakiyeTL ?? 0);

  const togglePayg = async () => {
    setBusy('payg');
    try {
      await apiJson('/api/user/me', { method: 'PATCH', body: { paygMode: !paygOn } });
      await load();
    } catch { /* sessiz */ } finally { setBusy(''); }
  };

  const togglePause = async (ent) => {
    setBusy(ent.id);
    try {
      const action = ent.paused ? 'resume' : 'pause';
      await apiJson(`/api/user/entitlements/${encodeURIComponent(ent.id)}/${action}`, { method: 'POST' });
      setSelected(null);
      await load();
    } catch { /* sessiz */ } finally { setBusy(''); }
  };

  // Paketimi Yenile — bakiyeden yeniden satın al (taze kota). Çift-tık: busy + Idempotency-Key.
  const renew = async (ent) => {
    if (typeof window !== 'undefined' && !window.confirm(t('mypackages.renewConfirm'))) return;
    setBusy(ent.id);
    setNotice(null);
    try {
      const key = (typeof window !== 'undefined' && window.crypto?.randomUUID)
        ? window.crypto.randomUUID()
        : `renew_${ent.id}_${Date.now()}`;
      await apiJson(`/api/user/entitlements/${encodeURIComponent(ent.id)}/renew`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
      });
      setNotice({ type: 'ok', msg: t('mypackages.renewOk') });
      setSelected(null);
      await load();
    } catch (e) {
      const msg = e?.status === 402 ? t('mypackages.renewNoBalance') : (e?.message || t('mypackages.renewErr'));
      setNotice({ type: 'err', msg });
    } finally { setBusy(''); }
  };

  // Paket iptal — KALICI, para iadesi YOK. window.confirm ile ikinci adım onay.
  const cancel = async (ent) => {
    if (typeof window !== 'undefined' && !window.confirm(t('mypackages.cancelConfirm'))) return;
    setBusy(ent.id);
    setNotice(null);
    try {
      await apiJson(`/api/user/entitlements/${encodeURIComponent(ent.id)}/cancel`, { method: 'POST' });
      setNotice({ type: 'ok', msg: t('mypackages.cancelOk') });
      setSelected(null);
      await load();
    } catch (e) {
      setNotice({ type: 'err', msg: e?.message || t('mypackages.cancelErr') });
    } finally { setBusy(''); }
  };

  const active = packages.filter((p) => isActiveDurum(p.durum));
  const history = packages.filter((p) => !isActiveDurum(p.durum));

  const DurumBadge = ({ durum }) => {
    const m = DURUM_META[durum] || DURUM_META.suresi_doldu;
    return (
      <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: m.bg, color: m.fg }}>
        {t(`mypackages.status.${durum}`)}
      </span>
    );
  };

  const openModal = (p) => setSelected(p);
  const rowKeyOpen = (p) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(p); } };

  const PackageRow = ({ p, last }) => {
    const limit = Number(p.gunlukLimit) || 0;
    const kalan = Number(p.kalan) || 0;
    const pct = limit > 0 ? Math.max(0, Math.min(100, (kalan / limit) * 100)) : 0;
    return (
      <div
        onClick={() => openModal(p)}
        role="button"
        tabIndex={0}
        onKeyDown={rowKeyOpen(p)}
        title={t('mypackages.manage')}
        style={{ padding: '14px', borderBottom: last ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.paketAdi}</div>
            <Caption>{p.kategori}</Caption>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <DurumBadge durum={p.durum} />
            <span aria-hidden style={{ color: 'var(--ink-3)', fontSize: 16, lineHeight: 1 }}>›</span>
          </div>
        </div>

        {limit > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ color: 'var(--ink-3)' }}>
                <span className="tnum" style={{ fontWeight: 700, color: 'var(--ink)' }}>{fmt.num(kalan)}</span>
                {' / '}{fmt.num(limit)} {t('mypackages.unitReq')} {t('mypackages.remaining')}
              </span>
              <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                {safeDate(p.activatedAt)} → {safeDate(p.expiresAt)}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: p.durum === 'aktif' ? 'var(--ok, #16a34a)' : 'var(--ink-3)', transition: 'width .3s' }} />
            </div>
          </div>
        )}

        {p.paused && <Caption style={{ marginTop: 6, color: '#b45309' }}>⏸ {t('mypackages.pausedNote')}</Caption>}
      </div>
    );
  };

  const ModalActionBtn = ({ onClick, disabled, children, kind }) => {
    const styles = {
      neutral: { border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' },
      dark:    { border: '1px solid var(--ink)', background: 'var(--ink)', color: '#fff' },
      accent:  { border: '1px solid var(--accent, #2563eb)', background: 'var(--accent, #2563eb)', color: '#fff' },
      danger:  { border: '1px solid #fca5a5', background: '#fee2e2', color: '#b91c1c' },
    };
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          opacity: disabled ? 0.6 : 1, ...styles[kind],
        }}
      >
        {children}
      </button>
    );
  };

  const PackageModal = ({ p }) => {
    if (!p) return null;
    const limit = Number(p.gunlukLimit) || 0;
    const kalan = Number(p.kalan) || 0;
    const pct = limit > 0 ? Math.max(0, Math.min(100, (kalan / limit) * 100)) : 0;
    const isBusy = busy === p.id;
    return (
      <div
        onClick={() => setSelected(null)}
        role="presentation"
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('mypackages.manage')}
          style={{ width: '100%', maxWidth: 420, background: 'var(--surface, #fff)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 20, maxHeight: '90vh', overflowY: 'auto' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{p.paketAdi}</div>
              <Caption>{p.kategori}</Caption>
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label={t('mypackages.close')}
              style={{ border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, cursor: 'pointer', color: 'var(--ink-3)' }}
            >✕</button>
          </div>

          <div style={{ marginTop: 12 }}><DurumBadge durum={p.durum} /></div>

          {limit > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                <span style={{ color: 'var(--ink-3)' }}>
                  <span className="tnum" style={{ fontWeight: 700, color: 'var(--ink)' }}>{fmt.num(kalan)}</span>
                  {' / '}{fmt.num(limit)} {t('mypackages.unitReq')} {t('mypackages.remaining')}
                </span>
                <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                  {safeDate(p.activatedAt)} → {safeDate(p.expiresAt)}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: p.durum === 'aktif' ? 'var(--ok, #16a34a)' : 'var(--ink-3)' }} />
              </div>
            </div>
          )}

          {p.paused && <Caption style={{ marginTop: 8, color: '#b45309' }}>⏸ {t('mypackages.pausedNote')}</Caption>}

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {canControlDurum(p.durum) && (
              <ModalActionBtn onClick={() => togglePause(p)} disabled={isBusy} kind={p.paused ? 'dark' : 'neutral'}>
                {p.paused ? `▶ ${t('mypackages.resume')}` : `⏸ ${t('mypackages.pause')}`}
              </ModalActionBtn>
            )}
            {p.renewable && (
              <ModalActionBtn onClick={() => renew(p)} disabled={isBusy} kind="accent">
                {isBusy ? `… ${t('mypackages.renew')}` : `🔄 ${t('mypackages.renew')}`}
              </ModalActionBtn>
            )}
            {isCancellable(p.durum) && (
              <ModalActionBtn onClick={() => cancel(p)} disabled={isBusy} kind="danger">
                {isBusy ? `… ${t('mypackages.cancel')}` : `✕ ${t('mypackages.cancel')}`}
              </ModalActionBtn>
            )}
          </div>

          {isCancellable(p.durum) && (
            <Caption style={{ marginTop: 10, color: 'var(--ink-3)' }}>{t('mypackages.cancelHint')}</Caption>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t('mypackages.title')}</h2>
        <Caption>{t('mypackages.subtitle')}</Caption>
      </div>

      {notice && (
        <div
          onClick={() => setNotice(null)}
          style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            background: notice.type === 'ok' ? '#dcfce7' : '#fee2e2',
            color: notice.type === 'ok' ? '#15803d' : '#b91c1c',
            border: `1px solid ${notice.type === 'ok' ? '#86efac' : '#fca5a5'}`,
          }}
        >
          {notice.type === 'ok' ? '✓ ' : '⚠ '}{notice.msg}
        </div>
      )}

      {/* Kullandığın kadar öde modu */}
      <Card style={{ padding: 16, marginBottom: 16, border: paygOn ? '1px solid #fbbf24' : undefined, background: paygOn ? '#fffbeb' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <PulseDot color={paygOn ? '#a16207' : 'var(--ink-3)'} size={7} />
              {t('mypackages.payg.title')}
              <span style={{ fontSize: 11, fontWeight: 700, color: paygOn ? '#a16207' : 'var(--ink-3)' }}>
                · {paygOn ? t('mypackages.payg.on') : t('mypackages.payg.off')}
              </span>
            </div>
            <Caption style={{ marginTop: 4 }}>{t('mypackages.payg.desc')}</Caption>
            <Caption style={{ marginTop: 4, fontFamily: 'var(--font-mono)' }}>{t('mypackages.payg.balance', { bal: balanceTL.toFixed(2) })}</Caption>
          </div>
          <button
            onClick={togglePayg}
            disabled={busy === 'payg'}
            style={{
              padding: '8px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              border: 'none', background: paygOn ? 'var(--ink)' : '#a16207', color: '#fff',
              opacity: busy === 'payg' ? 0.6 : 1,
            }}
          >
            {paygOn ? t('mypackages.payg.disable') : t('mypackages.payg.enable')}
          </button>
        </div>
        {paygOn && <Caption style={{ marginTop: 8, color: '#92400e' }}>⚠ {t('mypackages.payg.activeWarn')}</Caption>}
        {paygOn && balanceTL <= 0 && <Caption style={{ marginTop: 4, color: '#b91c1c', fontWeight: 600 }}>⚠ {t('mypackages.payg.zeroWarn')}</Caption>}
      </Card>

      {loading ? (
        <Card style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>{t('mypackages.loading')}</Card>
      ) : packages.length === 0 ? (
        <Card style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
          <I.Wallet size={28} stroke="var(--ink-4)" /><div style={{ marginTop: 8 }}>{t('mypackages.empty')}</div>
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <Card pad={0} style={{ overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>
                {t('mypackages.active')}
              </div>
              {active.map((p, i) => <PackageRow key={p.id} p={p} last={i === active.length - 1} />)}
            </Card>
          )}
          {history.length > 0 && (
            <Card pad={0} style={{ overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--ink-3)' }}>
                {t('mypackages.history')}
              </div>
              {history.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => openModal(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={rowKeyOpen(p)}
                  title={t('mypackages.manage')}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i === history.length - 1 ? 'none' : '1px solid var(--border)', fontSize: 12, cursor: 'pointer' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.paketAdi}</div>
                    <Caption style={{ fontFamily: 'var(--font-mono)' }}>{safeDate(p.activatedAt)} → {safeDate(p.expiresAt)}</Caption>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <DurumBadge durum={p.durum} />
                    <span aria-hidden style={{ color: 'var(--ink-3)', fontSize: 16, lineHeight: 1 }}>›</span>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
      {purchaseHistory.length > 0 && (
        <Card style={{ marginTop: 16, padding: '12px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t('mypackages.historyTitle')}</div>
          {Object.entries(
            purchaseHistory.reduce((acc, it) => {
              (acc[it.paketAdi] = acc[it.paketAdi] || []).push(it);
              return acc;
            }, {})
          ).map(([paket, items]) => (
            <div key={paket} style={{ marginBottom: 10 }}>
              <Caption style={{ fontWeight: 700 }}>{paket}</Caption>
              {items.map((it, i) => (
                <div key={(it.ref || 'noref') + i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ fontWeight: 700 }}>{it.ref || '—'}</span>
                  <span style={{ color: 'var(--ink-3)' }}>{safeDate(it.tarih)}</span>
                  <span>{fmt.num(it.tutarTL)} TL</span>
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}

      {selected && <PackageModal p={selected} />}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS (tsc --noEmit, 0 hata). Eğer "unused" uyarısı vb. çıkarsa düzelt.

- [ ] **Step 3: Build (panel bundle dahil)**

Run: `npm run build`
Expected: PASS — `dist/assets/index-*.js` (yeni hash) + `dist/server.js` üretilir.

- [ ] **Step 4: Manual smoke (lokal/preview)**

Manuel doğrula (panel'i lokal çalıştırıp veya build önizlemesiyle):
- Aktif pakete tıkla → modal açılır (Duraklat/Yenile/İptal et görünür).
- İptal et → `window.confirm` → onayla → "Paket iptal edildi." notice + paket Geçmiş'te **İptal edildi** olarak görünür, aktif listeden çıkar.
- Backdrop'a/✕'e tıkla → modal kapanır.
- İstek hakkı bitmiş paket Geçmiş'te **Bitti** etiketiyle görünür, tıklanınca modalda İptal et çıkar.
- Süresi dolmuş paket → modalda İptal et YOK (yalnız renewable ise Yenile).

- [ ] **Step 5: Commit**

```bash
git add src/yapayzekalab/tab-mypackages.jsx
git commit -m "feat(panel): Paketlerim yönetim modalı + paket iptali (tıklanabilir satır, Bitti)"
```

---

### Task 5: Admin etiket tutarlılığı — `cancelled` case

**Files:**
- Modify: `src/yapayzekalab/tab-admin.jsx` (`entitlementDurumMeta`, ~satır 140-148)

Müşteri iptal edince admin kullanıcı-detayında durum ham "CANCELLED" yerine "İPTAL EDİLDİ" görünsün (mevcut `default` case ham status'u uppercase basıyor).

- [ ] **Step 1: Add the cancelled case**

`entitlementDurumMeta` switch'inde `case 'suresi_doldu': ...` satırının ardına, `default:`'tan ÖNCE ekle:
```jsx
    case 'cancelled': return { label: 'İPTAL EDİLDİ', bg: '#e5e7eb', fg: '#4b5563' };
```

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/yapayzekalab/tab-admin.jsx
git commit -m "feat(admin): entitlement durum etiketine cancelled (İptal edildi) case"
```

---

### Task 6: Tam doğrulama kapısı (gate)

**Files:** (yok — yalnız komut çalıştırma)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: PASS (0 hata).

- [ ] **Step 2: Tüm test paketi**

Run: `npm test`
Expected: PASS — yeni `cancelEntitlement` testleri + yeni route contract testi + mevcut tüm testler (örn. `packages-noleak`, `compute-display-consumed`, `entitlement-service`) yeşil. Toplam sayının düştüğü/kırıldığı bir test OLMAMALI.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS — `dist/assets/index-*.js` + `dist/server.js`.

- [ ] **Step 4: Public bundle sızıntı taraması**

Run: `npm run scan:public`
Expected: PASS — bundle'da sağlayıcı/maliyet sızıntısı yok (iptal özelliği yalnız ad/kategori/kalan/limit/durum kullanır; yeni sızıntı eklemedik).

- [ ] **Step 5: Final durum**

Tüm task commit'leri yapıldı, gate yeşil. Dal deploy'a HAZIR. Deploy AYRI ve gated (aşağıdaki bölüm) — bu plan içinde otomatik çalıştırılmaz.

---

## Deployment (MANUEL + GATED — bir ajan ASLA otomatik çalıştırmaz)

⚠️ Bu canlı bir ödeme sistemidir (`/opt/turkapiprojesi`, systemd `turkapiprojesi`, :4568). Deploy `deploy-guard.js` hook'una tabidir; **3-QA (≥2 PASS) + çift onay** kuralı geçerlidir. `LOCAL_SRC=~/yzapi bash scripts/sync-deploy.sh` **YASAK** — `entitlement-service.ts` canlı-lokal drift'lidir (R-3 `cf_overserve_cap_multiplier` + CF paylaşımlı-havuz fix canlıda var, lokal main'de yok); naïf deploy bunları GERİ ALIR.

İzole "canlıdan indir + hunk uygula" tekniği (CLAUDE.md):

1. **Touched dosyaların CANLI sürümlerini indir:**
   ```
   scp yzapi-vps:/opt/turkapiprojesi/src/server/services/entitlement-service.ts /tmp/live/
   scp yzapi-vps:/opt/turkapiprojesi/src/server/routes/user.ts /tmp/live/
   scp yzapi-vps:/opt/turkapiprojesi/src/yapayzekalab/tab-mypackages.jsx /tmp/live/
   scp yzapi-vps:/opt/turkapiprojesi/src/yapayzekalab/i18n/strings/mypackages.js /tmp/live/
   scp yzapi-vps:/opt/turkapiprojesi/src/yapayzekalab/tab-admin.jsx /tmp/live/
   ```
2. **Her dosyayı lokal değiştirilmemiş haliyle diff'le.** "Temiz" olanlar (tek fark senin hunk'ın) çalışma ağacından ship edilir. **Kirli/diverged** olanlara (özellikle `entitlement-service.ts`, muhtemelen `tab-mypackages.jsx`/`user.ts`/`tab-admin.jsx`) yalnız SENİN hunk'ını **canlı kopyaya** uygula (Edit /tmp kopyasını), çalışma ağacının versiyonunu kullanma:
   - `entitlement-service.ts`: `cancelEntitlement` fonksiyonunu canlı dosyaya **ekle** (saf additive; R-3/CF-pool koduyla çakışmaz).
   - `user.ts`: import'a `cancelEntitlement` ekle + cancel route'unu ekle.
   - `tab-mypackages.jsx`: canlı dosya lokal orijinalle AYNIYSA tam-dosya değişimi güvenli; DEĞİLSE değişiklikleri canlı sürüme yeniden uygula.
   - `tab-admin.jsx`: yalnız `cancelled` case satırını ekle.
   - `mypackages.js`: i18n satırlarını ekle/değiştir.
3. **İzolasyonu KANITLA** (yalnız bizim dosyalar çıkmalı):
   ```
   rsync -rlzn --checksum --itemize-changes <stage>/ yzapi-vps:/opt/turkapiprojesi/
   ```
4. **Canlı yedek al** (`cp --parents <f> .deploy/<backup>/`), sonra `rsync` (yedeksiz `-n`).
5. **Gate'i elle çalıştır** (build inert kalır → restart'a kadar canlı eski dist'te güvenli):
   ```
   npm run lint && npm test && npm run build && systemctl restart turkapiprojesi && curl -fsS http://127.0.0.1:4568/health
   ```
   ⚠️ `npm run build` HEM panel bundle'ı (`dist/assets/index-*.js`) HEM server'ı üretir → frontend iptal UI'ı için şart; müşteri tarayıcısı eski bundle'ı bırakmak için hard-refresh gerekebilir.
6. **Targeted rsync manifest'i GÜNCELLEMEZ** → gerçek canlı durumu memory notuna yaz.
7. Deploy sonrası canlı smoke: bir test paketini panelden iptal et → "İptal edildi" geçmişe düştü + o paketle istek artık 402/paket-yok (gate dışladı) + bakiye DEĞİŞMEDİ (iade yok doğrulaması).
