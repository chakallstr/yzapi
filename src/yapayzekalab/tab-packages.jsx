import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Chip, Caption, PulseDot, I } from './shared.jsx';
import { apiJson } from './auth-client.js';
import { useT } from './i18n/index.jsx';

/* ============================================
   PackagesTab — Paket satın alma & kod kullan
   ============================================ */

// === Kategori görsel kimlikleri ====================================
// Her kategori = gradyan + line-icon (shared I). Gerçek görsel hosting
// gerektirmeden "güzel görsel" sağlar (banner + ikon + dekoratif mesh).
const CAT_META = {
  'GPT/Codex':        { c1: '#10b981', c2: '#059669', icon: 'Terminal' },
  'Claude':           { c1: '#f59e0b', c2: '#d97706', icon: 'Sparkle' },
  'Gemini':           { c1: '#3b82f6', c2: '#2563eb', icon: 'Sparkle' },
  'Grok':             { c1: '#64748b', c2: '#334155', icon: 'Bolt' },
  'GLM':              { c1: '#14b8a6', c2: '#0d9488', icon: 'Cpu' },
  'Görsel Oluşturma': { c1: '#a855f7', c2: '#7c3aed', icon: 'Beaker' },
  'Hesaplar':         { c1: '#6366f1', c2: '#4f46e5', icon: 'Shield' },
  'Deneme':           { c1: '#fbbf24', c2: '#ea580c', icon: 'Beaker' },
};
const DEFAULT_META = { c1: 'var(--accent)', c2: 'var(--t-teal)', icon: 'Layers' };
const metaFor = (kategori) => CAT_META[kategori] || DEFAULT_META;

// === Durum badge ===================================================
const StatusBadge = ({ durum }) => {
  const cfg = {
    teslim_edildi: { bg: 'var(--ok-bg)',    color: '#047857', label: '✓ Teslim' },
    bekliyor:      { bg: 'var(--accent-bg)', color: 'var(--accent-ink)', label: '⏳ Bekliyor' },
    iptal:         { bg: '#fff1f2',          color: '#be123c', label: '✕ İptal' },
  }[durum] ?? { bg: 'var(--surface-2)', color: 'var(--ink-3)', label: durum };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 9px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)',
      background: cfg.bg, color: cfg.color,
    }}>{cfg.label}</span>
  );
};

// === Configurable paket kartı (Codex API gibi) =====================
const ConfigurablePackageCard = ({ pkg, busy, onBuy, t }) => {
  const isBusy = busy === pkg.id;
  const meta = metaFor(pkg.kategori);
  const Ic = I[meta.icon] || I.Terminal;

  const STEP = 50;
  const minLimit = pkg.minGunlukIstek ?? 50;
  const maxLimit = pkg.maxGunlukIstek ?? 5000;
  const minDays  = pkg.minSureGun ?? 1;
  const maxDays  = pkg.maxSureGun ?? 30;

  const [limit, setLimit] = useState(Math.min(500, maxLimit));
  const [days,  setDays]  = useState(1);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  const fetchPreview = (l, d) => {
    setPreviewLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/packages/${encodeURIComponent(pkg.id)}/price-preview?limit=${l}&days=${d}`);
        const data = await r.json();
        setPreview(data);
      } catch { setPreview(null); }
      finally { setPreviewLoading(false); }
    }, 350);
  };

  useEffect(() => { fetchPreview(limit, days); }, [limit, days]);

  const handleLimitChange = (v) => {
    const clamped = Math.max(minLimit, Math.min(maxLimit, Math.round(v / STEP) * STEP));
    setLimit(clamped);
  };
  const handleDaysChange = (v) => {
    const clamped = Math.max(minDays, Math.min(maxDays, Math.round(v)));
    setDays(clamped);
  };

  const priceUsd = preview?.fiyatUsd ?? 0;
  const priceTL  = preview?.fiyatTL  ?? 0;

  return (
    <Card hoverable pad={0} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Banner */}
      <div style={{
        position: 'relative', height: 72,
        background: `linear-gradient(135deg, ${meta.c1}, ${meta.c2})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle at 18% 28%, #fff 0, transparent 36%), radial-gradient(circle at 86% 78%, #fff 0, transparent 30%)' }} />
        <div style={{ position: 'absolute', right: -18, bottom: -22, opacity: 0.14, pointerEvents: 'none' }}>
          <Ic size={110} stroke="#fff" strokeWidth={1.1} />
        </div>
        <div style={{ position: 'relative', width: 42, height: 42, borderRadius: 12,
          background: 'rgba(255,255,255,0.20)', border: '1px solid rgba(255,255,255,0.35)',
          display: 'grid', placeItems: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
          <Ic size={22} stroke="#fff" strokeWidth={2} />
        </div>
        <div style={{ position: 'absolute', top: 8, right: 10,
          padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.9)',
          fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: meta.c2,
          fontFamily: 'var(--font-mono)' }}>
          ÖZELLEŞTİRİLEBİLİR
        </div>
      </div>

      <div style={{ padding: '14px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Başlık */}
        <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: -0.2, color: 'var(--ink)', lineHeight: 1.3 }}>
          {pkg.ad}
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, margin: 0 }}>
          {pkg.aciklama}
        </p>

        {/* Fiyat */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, paddingTop: 2 }}>
          {previewLoading ? (
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-3)' }}>—</span>
          ) : (
            <>
              <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1, color: 'var(--ink)', lineHeight: 1 }} className="tnum">
                ₺{priceTL.toFixed(2).replace('.', ',')}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                ≈ ${priceUsd.toFixed(2)}
              </span>
            </>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: -6 }}>
          {days} gün erişim · {limit.toLocaleString('tr-TR')} istek / gün
        </div>

        {/* Seçili limit özeti */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 10px', borderRadius: 8,
          background: `color-mix(in srgb, ${meta.c1} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${meta.c1} 28%, transparent)`,
          fontSize: 12, color: meta.c2, fontWeight: 600,
        }}>
          <span>✓</span>
          {pkg.kategori} API: {limit.toLocaleString('tr-TR')} istek / günlük
        </div>

        {/* Özelleştir akordeonu */}
        <div style={{ borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '9px 12px', background: 'var(--surface-2)', border: 0, cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
            }}
          >
            <span>Paketi özelleştir</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>
              {open ? 'Kapat' : 'Aç'}
            </span>
          </button>
          {open && (
            <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 5 }}>
                  Kullanım süresi
                </div>
                <input
                  type="number"
                  min={minDays} max={maxDays} step={1} value={days}
                  onChange={(e) => handleDaysChange(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 7,
                    border: '1px solid var(--border-st)', background: 'var(--surface-2)',
                    color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-mono)',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 3 }}>
                  {minDays}–{maxDays} gün arası
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 5 }}>
                  {pkg.kategori} API limiti
                </div>
                <input
                  type="number"
                  min={minLimit} max={maxLimit} step={STEP} value={limit}
                  onChange={(e) => handleLimitChange(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 7,
                    border: '1px solid var(--border-st)', background: 'var(--surface-2)',
                    color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-mono)',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 3 }}>
                  {minLimit.toLocaleString('tr-TR')}–{maxLimit.toLocaleString('tr-TR')} istek ({STEP}'şer artış)
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Satın al butonu */}
      <div style={{ padding: '0 18px 16px' }}>
        <button
          disabled={isBusy || previewLoading || priceTL <= 0}
          onClick={() => onBuy(pkg.id, limit, days)}
          style={{
            width: '100%', padding: '10px 16px', borderRadius: 9, border: 0,
            background: (isBusy || previewLoading || priceTL <= 0)
              ? 'var(--border)'
              : `linear-gradient(135deg, ${meta.c1}, ${meta.c2})`,
            color: (isBusy || previewLoading || priceTL <= 0) ? 'var(--ink-3)' : '#fff',
            fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            cursor: (isBusy || previewLoading || priceTL <= 0) ? 'default' : 'pointer',
            opacity: (isBusy || previewLoading) ? 0.7 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {isBusy ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" className="spin-slow">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : '⚡'}
          {isBusy ? t('packages.buying') : `Detayları gör →`}
        </button>
      </div>
    </Card>
  );
};

// === Paket kartı ===================================================
const PackageCard = ({ pkg, busy, onBuy, onActivateCode, t }) => {
  const isBusy = busy === pkg.id;
  const isDelivery = pkg.tip === 'account_delivery';
  const isTrial = pkg.kategori === 'Deneme';
  // ₺0 = yalnız anahtar/kod ile verilir (doğrudan satın alınamaz, abuse engeli)
  const isCodeOnly = Number(pkg.fiyatTL) <= 0;
  const meta = metaFor(pkg.kategori);
  const Ic = I[meta.icon] || I.Layers;
  const priceLabel = pkg.fiyatUsd != null ? `$${Number(pkg.fiyatUsd).toFixed(2)}` : `₺${pkg.fiyatTL}`;

  return (
    <Card hoverable pad={0} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Görsel banner: kategori gradyanı + büyük ikon + dekoratif mesh */}
      <div style={{
        position: 'relative', height: 88,
        background: `linear-gradient(135deg, ${meta.c1}, ${meta.c2})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {/* yumuşak ışık lekeleri */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.22, pointerEvents: 'none',
          backgroundImage:
            'radial-gradient(circle at 18% 28%, #fff 0, transparent 36%), radial-gradient(circle at 86% 78%, #fff 0, transparent 30%)',
        }} />
        {/* köşede dev filigran ikon */}
        <div style={{ position: 'absolute', right: -20, bottom: -26, opacity: 0.16, pointerEvents: 'none' }}>
          <Ic size={128} stroke="#fff" strokeWidth={1.1} />
        </div>
        {/* ortadaki cam ikon rozeti */}
        <div style={{
          position: 'relative', width: 48, height: 48, borderRadius: 14,
          background: 'rgba(255,255,255,0.20)', border: '1px solid rgba(255,255,255,0.35)',
          display: 'grid', placeItems: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
        }}>
          <Ic size={25} stroke="#fff" strokeWidth={1.9} />
        </div>
        {/* deneme rozeti */}
        {isTrial && (
          <div style={{
            position: 'absolute', top: 10, left: 10,
            padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.95)',
            fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: meta.c2,
            fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4,
          }}>🔑 {t('packages.trialBadge')}</div>
        )}
      </div>

      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 11 }}>
        {/* Başlık + Kategori */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2, color: 'var(--ink)', lineHeight: 1.3 }}>
            {pkg.ad}
          </div>
          <span style={{
            flexShrink: 0, fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: 0.4,
            padding: '3px 8px', borderRadius: 999, fontWeight: 600,
            color: meta.c2, background: `color-mix(in srgb, ${meta.c1} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${meta.c1} 30%, transparent)`,
          }}>{pkg.kategori}</span>
        </div>

        {/* Açıklama */}
        <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>
          {pkg.aciklama}
        </p>

        {/* Specs */}
        {(pkg.gunlukIstekLimiti || pkg.sureGun) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pkg.gunlukIstekLimiti ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 7,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)',
              }}>
                <span style={{ fontSize: 10 }}>⚡</span>
                {pkg.gunlukIstekLimiti.toLocaleString('tr-TR')} {t('packages.perDay')}
              </div>
            ) : null}
            {pkg.sureGun ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 7,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)',
              }}>
                <span style={{ fontSize: 10 }}>📅</span>
                {`${pkg.sureGun} ${t('packages.days')}`}
              </div>
            ) : null}
          </div>
        )}

        {/* Fiyat / Anahtar ile */}
        {isCodeOnly ? (
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto', paddingTop: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 9, fontWeight: 700, fontSize: 13.5,
              color: meta.c2, background: `color-mix(in srgb, ${meta.c1} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${meta.c1} 30%, transparent)`,
            }}>🔑 {t('packages.keyOnly')}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 'auto', paddingTop: 8 }}>
            <span style={{
              fontSize: 32, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1,
              color: 'var(--ink)', fontFamily: 'var(--font-sans)',
            }} className="tnum">
              {priceLabel}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              {t('packages.oneTime')}
            </span>
          </div>
        )}
      </div>

      {/* Satın Al / Kod ile etkinleştir butonu — kategori renginde */}
      <div style={{ padding: '0 20px 18px' }}>
        <button
          disabled={isBusy}
          onClick={() => (isCodeOnly ? onActivateCode?.() : onBuy(pkg.id))}
          style={{
            width: '100%', padding: '10px 16px', borderRadius: 9,
            background: isBusy ? 'var(--border)' : `linear-gradient(135deg, ${meta.c1}, ${meta.c2})`,
            color: isBusy ? 'var(--ink-3)' : '#fff',
            fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'opacity 0.15s, filter 0.15s', opacity: isBusy ? 0.7 : 1,
            border: 0, cursor: isBusy ? 'default' : 'pointer',
          }}
        >
          {isBusy ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" className="spin-slow">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              {t('packages.buying')}
            </>
          ) : (
            <>
              {isCodeOnly ? '🔑' : isDelivery ? '📦' : '⚡'}
              {isCodeOnly ? t('packages.keyOnlyBtn') : t('packages.buyBtn')}
            </>
          )}
        </button>
      </div>
    </Card>
  );
};

// === Aktif paket kartı =============================================
const EntitlementCard = ({ ent, t }) => {
  const pct = ent.gunlukLimit > 0 ? Math.round((ent.kalanBugun / ent.gunlukLimit) * 100) : 0;
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '14px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: 'var(--ok-bg)', display: 'grid', placeItems: 'center',
        fontSize: 18,
      }}>✓</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{ent.paketAdi}</div>
          <Chip style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>{ent.kategori}</Chip>
        </div>
        {ent.gunlukLimit > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 5 }}>
              <span>{t('packages.todayRemaining')}: {ent.kalanBugun?.toLocaleString('tr-TR')} / {ent.gunlukLimit?.toLocaleString('tr-TR')}</span>
              <span>{pct}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999, width: `${pct}%`,
                background: pct > 20 ? 'var(--ok)' : 'var(--warn)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
          {t('packages.expiry')}: {new Date(ent.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>
    </div>
  );
};

// === Ana bileşen ===================================================
export function PackagesTab() {
  const { t } = useT();
  const [packages, setPackages] = useState([]);
  const [ents, setEnts] = useState([]);
  const [cat, setCat] = useState('Tümü');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const keysRef = useRef({});
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState({ text: '', ok: true });
  const [orders, setOrders] = useState([]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [pkgs, entitlements, dorders] = await Promise.all([
        fetch('/api/packages').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        apiJson('/api/user/entitlements').catch(() => []),
        apiJson('/api/user/delivery-orders').catch(() => []),
      ]);
      setPackages(Array.isArray(pkgs) ? pkgs : []);
      setEnts(Array.isArray(entitlements) ? entitlements : []);
      setOrders(Array.isArray(dorders) ? dorders : []);
    } catch (e) { setError(e.message || t('packages.errorLoadFailed')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const categories = useMemo(() => {
    const counts = { 'Tümü': packages.length };
    packages.forEach((p) => { counts[p.kategori] = (counts[p.kategori] || 0) + 1; });
    return Object.entries(counts);
  }, [packages]);

  const visible = cat === 'Tümü' ? packages : packages.filter((p) => p.kategori === cat);

  const buy = async (id, customLimit, customDays) => {
    const pkg = packages.find((p) => p.id === id);
    let contact;
    if (pkg?.tip === 'account_delivery') {
      contact = window.prompt(t('packages.deliveryContactPrompt'), '');
      if (contact === null) return;
    }
    setBusyId(id); setError('');
    const key = keysRef.current[id] || (keysRef.current[id] = (window.crypto?.randomUUID?.() || `${id}-${Date.now()}`));
    try {
      const bodyData = contact ? { contact } : {};
      if (pkg?.isConfigurable && customLimit && customDays) {
        bodyData.customLimit = customLimit;
        bodyData.customDays = customDays;
      }
      const r = await apiJson(`/api/user/packages/${encodeURIComponent(id)}/purchase`, {
        method: 'POST', headers: { 'Idempotency-Key': key }, body: bodyData,
      });
      delete keysRef.current[id];
      if (r?.tip === 'account_delivery') setRedeemMsg({ text: t('packages.orderPlaced'), ok: true });
      await load();
    } catch (e) {
      if (e.status === 402) setError(t('packages.errorInsufficientBalance'));
      else if (e.status === 401) setError(t('packages.errorLoginToBuy'));
      else setError(e.message || t('packages.errorBuyFailed'));
    } finally { setBusyId(''); }
  };

  const redeem = async () => {
    if (!code.trim()) return;
    setRedeeming(true); setRedeemMsg({ text: '', ok: true }); setError('');
    try {
      const r = await apiJson('/api/user/redeem', { method: 'POST', body: { code: code.trim() } });
      setRedeemMsg({
        text: r.tip === 'balance'
          ? t('packages.redeemBalanceSuccess', { amount: r.amountTL })
          : t('packages.redeemPackageSuccess'),
        ok: true,
      });
      setCode('');
      await load();
    } catch (e) {
      setRedeemMsg({
        text: e.status === 401 ? t('packages.errorLoginToRedeem') : (e.message || t('packages.errorRedeemFailed')),
        ok: false,
      });
    } finally { setRedeeming(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Başlık */}
      <div>
        <Caption>{t('packages.title')}</Caption>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, margin: '4px 0 0', color: 'var(--ink)' }}>
          {t('packages.subtitle')}
        </h1>
      </div>

      {/* Hata banner */}
      {error && (
        <div className="fade-in" style={{
          padding: '12px 16px', borderRadius: 10,
          background: '#fff1f2', border: '1px solid #fecdd3',
          fontSize: 13, color: '#be123c',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Hediye / Kullanım kodu */}
      <Card pad={22}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <Caption>{t('packages.giftCodeTitle')}</Caption>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>
              {t('packages.giftCodeSubtitle')}
            </div>
          </div>
          <span style={{ fontSize: 22 }}>🎁</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="yz-redeem-input"
            placeholder={t('packages.codePlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && redeem()}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 9,
              border: '1px solid var(--border-st)',
              background: 'var(--surface-2)', color: 'var(--ink)',
              fontSize: 13, fontFamily: 'var(--font-mono)',
              outline: 'none', letterSpacing: 0.5,
            }}
          />
          <button
            disabled={redeeming || !code.trim()}
            onClick={redeem}
            style={{
              padding: '10px 18px', borderRadius: 9, border: 0,
              background: 'var(--accent)', color: '#fff',
              fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: (redeeming || !code.trim()) ? 0.6 : 1,
              transition: 'opacity 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {redeeming ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" className="spin-slow">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : '✓'}
            {redeeming ? t('packages.redeeming') : t('packages.redeemBtn')}
          </button>
        </div>
        {redeemMsg.text && (
          <div className="fade-in" style={{
            marginTop: 10, padding: '10px 14px', borderRadius: 8,
            background: redeemMsg.ok ? 'var(--ok-bg)' : '#fff1f2',
            border: `1px solid ${redeemMsg.ok ? '#a7f3d0' : '#fecdd3'}`,
            fontSize: 12.5, color: redeemMsg.ok ? '#047857' : '#be123c',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {redeemMsg.ok ? '✓' : '⚠️'} {redeemMsg.text}
          </div>
        )}
      </Card>

      {/* Aktif paketlerim */}
      {ents.length > 0 && (
        <Card pad={22}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Caption>{t('packages.myActivePackages')}</Caption>
            <Chip tone="ok" style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>
              <PulseDot color="var(--ok)" size={5} withRing={false} />
              {ents.length} {t('packages.active')}
            </Chip>
          </div>
          {ents.map((e) => (
            <EntitlementCard key={e.id} ent={e} t={t} />
          ))}
        </Card>
      )}

      {/* Siparişlerim */}
      {orders.length > 0 && (
        <Card pad={22}>
          <Caption style={{ marginBottom: 14 }}>{t('packages.myOrders')}</Caption>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {orders.map((o) => (
              <div key={o.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>
                    {o.paketAdi || o.packageId}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }} className="tnum">
                      ₺{o.amountTL}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(o.olusturma).toLocaleDateString('tr-TR')}
                    </span>
                    <StatusBadge durum={o.durum} />
                  </div>
                </div>
                {o.durum === 'teslim_edildi' && o.teslimPayload && (
                  <div className="fade-in" style={{
                    marginTop: 8, padding: '10px 14px', borderRadius: 8,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {o.teslimPayload}
                  </div>
                )}
                {o.durum === 'bekliyor' && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <PulseDot color="var(--warn)" size={5} withRing={false} />
                    {t('packages.deliveryPending')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Kategori filtresi — kategori renkleriyle */}
      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {categories.map(([c, n]) => {
            const active = cat === c;
            const m = c === 'Tümü' ? null : metaFor(c);
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                style={{
                  padding: '6px 13px', borderRadius: 999,
                  background: active
                    ? (m ? `linear-gradient(135deg, ${m.c1}, ${m.c2})` : 'var(--accent)')
                    : 'var(--surface)',
                  color: active ? '#fff' : 'var(--ink-2)',
                  fontSize: 12.5, fontWeight: active ? 600 : 500,
                  border: `1px solid ${active ? 'transparent' : 'var(--border-st)'}`,
                  transition: 'all 0.15s', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {m && (
                  <span style={{
                    width: 7, height: 7, borderRadius: 999, flexShrink: 0,
                    background: active ? '#fff' : m.c1,
                  }} />
                )}
                {c === 'Tümü' ? t('common.all') : c}
                <span style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)',
                  opacity: active ? 0.85 : 0.5,
                }}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Paket grid */}
      {loading ? (
        /* Skeleton */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {[1, 2, 3].map((i) => (
            <Card key={i} pad={20} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="shimmer" style={{ height: 20, width: '60%', borderRadius: 6 }} />
              <div className="shimmer" style={{ height: 14, width: '90%', borderRadius: 6 }} />
              <div className="shimmer" style={{ height: 14, width: '75%', borderRadius: 6 }} />
              <div className="shimmer" style={{ height: 36, width: '40%', borderRadius: 6, marginTop: 8 }} />
              <div className="shimmer" style={{ height: 40, borderRadius: 9, marginTop: 4 }} />
            </Card>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card pad={40} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{t('packages.emptyState')}</div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {visible.map((p) => p.isConfigurable ? (
            <ConfigurablePackageCard
              key={p.id}
              pkg={p}
              busy={busyId}
              onBuy={buy}
              t={t}
            />
          ) : (
            <PackageCard
              key={p.id}
              pkg={p}
              busy={busyId}
              onBuy={buy}
              onActivateCode={() => {
                const el = document.getElementById('yz-redeem-input');
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el?.focus();
              }}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
