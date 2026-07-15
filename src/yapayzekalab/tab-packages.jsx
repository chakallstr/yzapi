import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Chip, Caption, PulseDot, I } from './shared.jsx';
import { apiJson } from './auth-client.js';
import { useT } from './i18n/index.jsx';

/* ============================================
   PackagesTab — Paket satın alma & kod kullan
   ============================================ */

// === Kategori rozet tanımları ==========================================
const CAT_BADGE = {
  'GPT/Codex':        { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', icon: '⚡' },
  'Grok':             { bg: '#fdf4ff', border: '#e9d5ff', color: '#7e22ce', icon: '🌐' },
  'Gemini':           { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', icon: '✨' },
  'GLM':              { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c', icon: '🔷' },
  'Görsel Oluşturma': { bg: '#fdf2f8', border: '#f5d0fe', color: '#a21caf', icon: '🖼️' },
  'Kimi':             { bg: '#f0f9ff', border: '#bae6fd', color: '#0369a1', icon: '⭐' },
  'DeepSeek':         { bg: '#f8fafc', border: '#cbd5e1', color: '#334155', icon: '🔍' },
  'Açık Kaynak':      { bg: '#f7fee7', border: '#d9f99d', color: '#3f6212', icon: '📦' },
  'Claude':           { bg: '#fef9ec', border: '#fde68a', color: '#92400e', icon: '🤖' },
};
const DEFAULT_BADGE = { bg: '#f1f5f9', border: '#e2e8f0', color: '#475569', icon: '📦' };
const badgeFor = (k) => CAT_BADGE[k] || DEFAULT_BADGE;

// Eski ikonlara geriye-uyum (ConfigurablePackageCard)
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
const metaFor = (k) => CAT_META[k] || DEFAULT_META;

// === Yardımcı: TL formatı =============================================
const fmtTL = (v) => {
  const n = Number(v);
  if (!n) return '0';
  return n % 1 === 0 ? n.toLocaleString('tr-TR') : n.toFixed(2).replace('.', ',');
};

// === Durum badge ======================================================
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

// === Configurable paket kartı (Kendin Yap) ============================
const ConfigurablePackageCard = ({ pkg, busy, onBuy, t }) => {
  const isBusy = busy === pkg.id;
  const isComingSoon = pkg.satista === false;
  const meta = metaFor(pkg.kategori);
  const badge = badgeFor(pkg.kategori);
  const Ic = I[meta.icon] || I.Terminal;
  const isLifetime = pkg.birimTipi === 'lifetime';
  const unitLabel = pkg.birimTipi === 'kredi' ? 'kredi' : 'istek';
  const minLimit = pkg.minGunlukIstek ?? 600;
  const maxLimit = pkg.maxGunlukIstek ?? 5000;
  const minDays  = pkg.minSureGun ?? 1;
  const maxDays  = pkg.maxSureGun ?? 90;
  const snapLimit = (v) => { const s = 50; return Math.ceil(v / s) * s; };

  const [limit, setLimit] = useState(Math.min(600, maxLimit));
  const [days,  setDays]  = useState(1);
  const [limitText, setLimitText] = useState(String(Math.min(600, maxLimit)));
  const [daysText, setDaysText] = useState('1');
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

  const commitLimit = () => {
    const n = parseInt(limitText, 10);
    if (!n || isNaN(n)) { setLimitText(String(limit)); return; }
    const snapped = Math.max(minLimit, Math.min(maxLimit, snapLimit(n)));
    setLimit(snapped); setLimitText(String(snapped));
  };
  const commitDays = () => {
    const n = parseInt(daysText, 10);
    if (!n || isNaN(n)) { setDaysText(String(days)); return; }
    const clamped = Math.max(minDays, Math.min(maxDays, n));
    setDays(clamped); setDaysText(String(clamped));
  };

  const priceUsd = preview?.fiyatUsd ?? 0;
  const priceTL  = preview?.fiyatTL  ?? 0;

  const btnActive = !isBusy && !previewLoading && priceTL > 0 && !isComingSoon;

  return (
    <div style={{
      background: 'white', borderRadius: 14,
      border: `2px solid ${isComingSoon ? '#fde68a' : '#e2e8f0'}`,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      {/* Rozet şerit */}
      <div style={{
        position: 'absolute', top: 0, right: 0, zIndex: 1,
        fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4,
        padding: '4px 10px', borderRadius: '0 12px 0 8px', color: 'white',
        background: isComingSoon ? '#f59e0b' : '#4f46e5',
      }}>
        {isComingSoon ? 'YAKINDA' : 'ÖZELLEŞTİRİLEBİLİR'}
      </div>

      {/* Kart üst */}
      <div style={{ padding: '13px 15px 9px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, marginBottom: 7,
          background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color,
        }}>
          {badge.icon} {pkg.kategori}
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
          {pkg.ad}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>
          {pkg.aciklama}
        </div>
      </div>

      <div style={{ padding: '0 15px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Seçili limit özeti */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '6px 10px', borderRadius: 7,
          background: '#eef2ff', border: '1px solid #c7d2fe',
          fontSize: 11.5, color: '#4338ca', fontWeight: 600,
        }}>
          ✓ {pkg.kategori} API: {limit.toLocaleString('tr-TR')} {unitLabel}{isLifetime ? ' bakiye' : ' / günlük'}
          {!isLifetime && <span style={{ fontWeight: 400, color: '#6366f1' }}>· {days} gün</span>}
        </div>

        {/* Fiyat */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, paddingTop: 2 }}>
          {previewLoading ? (
            <span style={{ fontSize: 22, fontWeight: 700, color: '#94a3b8' }}>—</span>
          ) : (
            <>
              <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1, color: '#0f172a', lineHeight: 1 }}>
                {priceTL > 0 ? Math.round(priceTL).toLocaleString('tr-TR') : '—'}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>₺</span>
              {priceUsd > 0 && (
                <span style={{ fontSize: 11, color: '#94a3b8' }}>≈ ${priceUsd.toFixed(2)}</span>
              )}
            </>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: -4 }}>
          {isLifetime ? 'Ömür boyu' : `${days} gün`} erişim · {limit.toLocaleString('tr-TR')} {unitLabel}{isLifetime ? ' bakiye' : ' / gün'}
        </div>

        {/* Özelleştir akordeonu */}
        <div style={{ borderRadius: 9, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '9px 12px', background: '#f8fafc', border: 0, cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, color: '#374151',
            }}
          >
            <span>Paketi özelleştir</span>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>
              {open ? 'Kapat' : 'Aç'}
            </span>
          </button>
          {open && (
            <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: isLifetime ? '1fr' : '1fr 1fr', gap: 10, borderTop: '1px solid #e2e8f0' }}>
              {!isLifetime && (
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>Kullanım süresi</div>
                  <input
                    type="number" min={minDays} max={maxDays} step={1} value={daysText}
                    onChange={(e) => setDaysText(e.target.value)}
                    onBlur={commitDays}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 7,
                      border: '1px solid #e2e8f0', background: '#f8fafc',
                      color: '#0f172a', fontSize: 14, fontFamily: 'var(--font-mono)',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{minDays}–{maxDays} gün arası</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>{pkg.kategori} API limiti</div>
                <input
                  type="number" min={minLimit} max={maxLimit} step={50} value={limitText}
                  onChange={(e) => setLimitText(e.target.value)}
                  onBlur={commitLimit}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 7,
                    border: '1px solid #e2e8f0', background: '#f8fafc',
                    color: '#0f172a', fontSize: 14, fontFamily: 'var(--font-mono)',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                  {minLimit.toLocaleString('tr-TR')}–{maxLimit.toLocaleString('tr-TR')} {unitLabel} (600 minimum, 50'şer adım)
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Satın al butonu */}
      <div style={{ padding: '12px 13px 13px' }}>
        <button
          disabled={!btnActive}
          onClick={() => onBuy(pkg.id, limit, days)}
          style={{
            width: '100%', padding: '9px', borderRadius: 10, border: 0,
            background: btnActive
              ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
              : '#f1f5f9',
            color: btnActive ? 'white' : '#94a3b8',
            fontSize: 12.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            cursor: btnActive ? 'pointer' : 'default',
            transition: 'opacity 0.13s',
          }}
        >
          {isBusy ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin-slow">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : isComingSoon ? '🕒' : '⚡'}
          {isBusy ? t('packages.buying') : isComingSoon ? t('packages.comingSoonBtn') : t('packages.buyBtn')}
        </button>
      </div>
    </div>
  );
};

// === Paket kartı (yeni tasarım) ========================================
const PackageCard = ({ pkg, busy, onBuy, onActivateCode, t }) => {
  const isBusy = busy === pkg.id;
  const isDelivery = pkg.tip === 'account_delivery';
  const isComingSoon = pkg.satista === false;
  const isCodeOnly = Number(pkg.fiyatTL) <= 0;
  const badge = badgeFor(pkg.kategori);

  // Fiyat gösterimi: fiyatUsd yalnız > 0 ise göster
  const fiyatTLNum = Math.round(Number(pkg.fiyatTL));
  const fiyatUsdNum = Number(pkg.fiyatUsd || 0);
  const showUsd = fiyatUsdNum > 0;

  // Birim fiyat (₺ / istek-gün)
  const unitPrice = pkg.gunlukIstekLimiti && pkg.sureGun && fiyatTLNum > 0
    ? fiyatTLNum / (pkg.gunlukIstekLimiti * pkg.sureGun)
    : null;

  const btnActive = !isBusy && !isComingSoon;

  return (
    <div style={{
      background: 'white', borderRadius: 14,
      border: `2px solid ${isComingSoon ? '#fde68a' : '#e2e8f0'}`,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      position: 'relative', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      transition: 'border-color 0.16s, box-shadow 0.16s',
    }}
    onMouseEnter={(e) => {
      if (!isComingSoon) {
        e.currentTarget.style.borderColor = '#818cf8';
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.11)';
      }
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = isComingSoon ? '#fde68a' : '#e2e8f0';
      e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)';
    }}
    >
      {/* Şerit rozet */}
      {isComingSoon && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4,
          padding: '4px 10px', borderRadius: '0 12px 0 8px', color: 'white',
          background: '#f59e0b',
        }}>YAKINDA</div>
      )}

      {/* Kart üst */}
      <div style={{ padding: '13px 15px 9px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, marginBottom: 7,
          background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color,
        }}>
          {badge.icon} {pkg.kategori}
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
          {pkg.ad}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>
          {pkg.aciklama}
        </div>
      </div>

      {/* Spec chips */}
      {(pkg.gunlukIstekLimiti || pkg.sureGun) && (
        <div style={{ padding: '0 15px 9px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {pkg.gunlukIstekLimiti ? (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 6, padding: '3px 7px',
            }}>
              📊 {pkg.gunlukIstekLimiti.toLocaleString('tr-TR')} {t('packages.perDay')}
            </span>
          ) : null}
          {pkg.sureGun ? (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 6, padding: '3px 7px',
            }}>
              📅 {pkg.sureGun} {t('packages.days')}
            </span>
          ) : null}
        </div>
      )}

      {/* Fiyat */}
      <div style={{ padding: '9px 15px 0', marginTop: 'auto' }}>
        {isCodeOnly ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 9, fontWeight: 700, fontSize: 13,
            color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
          }}>🔑 {t('packages.keyOnly')}</span>
        ) : showUsd ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 27, fontWeight: 900, letterSpacing: -1, color: '#0f172a' }}>
                ${fiyatUsdNum.toFixed(2)}
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
              tek seferlik
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 27, fontWeight: 900, letterSpacing: -1, color: '#0f172a' }}>
                {fiyatTLNum.toLocaleString('tr-TR')}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>₺</span>
            </div>
            {unitPrice != null && (
              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                {unitPrice.toFixed(3).replace('.', ',')} ₺ / istek-gün
              </div>
            )}
          </>
        )}
      </div>

      {/* Satın Al / Kod ile etkinleştir */}
      <div style={{ padding: '11px 13px 13px' }}>
        <button
          disabled={!btnActive}
          onClick={() => (isCodeOnly ? onActivateCode?.() : onBuy(pkg.id))}
          style={{
            width: '100%', padding: '9px', borderRadius: 10, border: 0,
            background: !btnActive
              ? '#f1f5f9'
              : isCodeOnly
              ? `linear-gradient(135deg, ${badge.color}, ${badge.color}bb)`
              : isDelivery
              ? 'linear-gradient(135deg, #0f172a, #1e293b)'
              : 'linear-gradient(135deg, #0f172a, #1e293b)',
            color: btnActive ? 'white' : '#94a3b8',
            fontSize: 12.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            cursor: btnActive ? 'pointer' : 'default',
            transition: 'opacity 0.13s',
          }}
        >
          {isBusy ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin-slow">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              {t('packages.buying')}
            </>
          ) : isComingSoon ? (
            <>🕒 {t('packages.comingSoonBtn')}</>
          ) : (
            <>
              {isCodeOnly ? '🔑' : isDelivery ? '📦' : '⚡'}
              {isCodeOnly ? t('packages.keyOnlyBtn') : t('packages.buyBtn')}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// === Aktif paket kartı ================================================
const EntitlementCard = ({ ent, t }) => {
  const pct = ent.gunlukLimit > 0 ? Math.round((ent.kullanilanBugun / ent.gunlukLimit) * 100) : 0;
  const exhausted = ent.gunlukLimit > 0 && ent.kalanBugun <= 0;
  const fmtDateTime = (s) => {
    if (!s) return null;
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('tr-TR', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };
  const alimStr = fmtDateTime(ent.activatedAt);
  const bitisStr = fmtDateTime(ent.expiresAt);
  return (
    <div style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: exhausted ? 'var(--warn-bg, #fef3c7)' : 'var(--ok-bg)',
        display: 'grid', placeItems: 'center', fontSize: 18,
      }}>{exhausted ? '⚠' : '✓'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{ent.paketAdi}</div>
          <Chip style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>{ent.kategori}</Chip>
        </div>
        {ent.gunlukLimit > 0 && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2, var(--card-bg))', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Bugünkü İstek Kullanımı
              </span>
              <span style={{
                fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700,
                color: exhausted ? 'var(--warn, #d97706)' : pct >= 80 ? 'var(--warn, #d97706)' : 'var(--ok, #16a34a)',
              }}>
                {ent.kullanilanBugun?.toLocaleString('tr-TR')} / {ent.gunlukLimit?.toLocaleString('tr-TR')}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999,
                width: `${Math.min(pct, 100)}%`,
                background: exhausted ? 'var(--warn, #d97706)' : pct >= 80 ? 'var(--warn, #d97706)' : 'var(--ok, #16a34a)',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
              <span>{exhausted ? '⚠ Günlük limit doldu — gece yarısı sıfırlanır' : `${ent.kalanBugun?.toLocaleString('tr-TR')} istek kaldı`}</span>
              <span>{pct}%</span>
            </div>
          </div>
        )}
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', background: 'var(--border)', borderRadius: 4, padding: '2px 6px' }}>
            her istek = 1 sayılır
          </span>
          {alimStr && (
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', background: 'var(--border)', borderRadius: 4, padding: '2px 6px' }}>
              alım: {alimStr}
            </span>
          )}
          {bitisStr && (
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: exhausted ? 'var(--warn, #d97706)' : 'var(--ink-2)', background: 'var(--border)', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
              bitiş: {bitisStr}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// === Ana bileşen =======================================================
export function PackagesTab() {
  const { t } = useT();
  const [packages, setPackages] = useState([]);
  const [ents, setEnts] = useState([]);
  const [cat, setCat] = useState('Tümü');
  const [durFilter, setDurFilter] = useState('all');
  const [sortBy, setSortBy] = useState('price-asc');
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

  // Benzersiz kategoriler
  const modelCategories = useMemo(() => {
    const seen = new Set();
    packages.forEach((p) => seen.add(p.kategori));
    return [...seen];
  }, [packages]);

  // Benzersiz süreler
  const durations = useMemo(() => {
    const seen = new Set();
    packages.forEach((p) => { if (p.sureGun) seen.add(p.sureGun); });
    return [...seen].sort((a, b) => a - b);
  }, [packages]);

  // Filtreli + sıralı paket listesi
  const visible = useMemo(() => {
    let filtered = cat === 'Tümü' ? packages : packages.filter((p) => p.kategori === cat);
    if (durFilter !== 'all') {
      filtered = filtered.filter((p) => String(p.sureGun) === durFilter);
    }
    const arr = [...filtered];
    if (sortBy === 'price-asc') arr.sort((a, b) => Number(a.fiyatTL) - Number(b.fiyatTL));
    else if (sortBy === 'price-desc') arr.sort((a, b) => Number(b.fiyatTL) - Number(a.fiyatTL));
    else if (sortBy === 'unit-asc') arr.sort((a, b) => {
      const ua = a.gunlukIstekLimiti && a.sureGun ? Number(a.fiyatTL) / (a.gunlukIstekLimiti * a.sureGun) : 999;
      const ub = b.gunlukIstekLimiti && b.sureGun ? Number(b.fiyatTL) / (b.gunlukIstekLimiti * b.sureGun) : 999;
      return ua - ub;
    });
    return arr;
  }, [packages, cat, durFilter, sortBy]);

  // Senaryo seçimi
  const setScenario = (scenario) => {
    if (scenario === 'gunluk')    { setCat('Tümü'); setDurFilter('1'); }
    else if (scenario === 'haftalik') { setCat('Tümü'); setDurFilter('7'); }
    else if (scenario === 'aylik')    { setCat('Tümü'); setDurFilter('30'); }
    else if (scenario === 'gorsel')   { setCat('Görsel Oluşturma'); setDurFilter('all'); }
    else                              { setCat('Tümü'); setDurFilter('all'); }
  };

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

  // Chip stil yardımcıları
  const chipStyle = (active) => ({
    padding: '5px 13px', borderRadius: 99, fontSize: 12, fontWeight: 600,
    border: `1.5px solid ${active ? '#4f46e5' : '#e2e8f0'}`,
    background: active ? '#4f46e5' : '#f8fafc',
    color: active ? 'white' : '#64748b',
    cursor: 'pointer', transition: 'all 0.13s', whiteSpace: 'nowrap',
    userSelect: 'none',
  });

  const isAllScenario = cat === 'Tümü' && durFilter === 'all';
  const isGunluk    = cat === 'Tümü' && durFilter === '1';
  const isHaftalik  = cat === 'Tümü' && durFilter === '7';
  const isAylik     = cat === 'Tümü' && durFilter === '30';
  const isGorsel    = cat === 'Görsel Oluşturma';

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
              transition: 'opacity 0.15s', whiteSpace: 'nowrap',
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

      {/* ── Hızlı senaryo pilleri ─────────────────────────────────── */}
      {!loading && packages.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
          {[
            { key: 'all',      icon: '🗂️', label: 'Tüm Paketler' },
            { key: 'gunluk',   icon: '⚡', label: 'Günlük Test' },
            { key: 'haftalik', icon: '🗓️', label: 'Haftalık Proje' },
            { key: 'aylik',    icon: '📦', label: 'Aylık Plan' },
            { key: 'gorsel',   icon: '🖼️', label: 'Görsel Üretim' },
          ].map(({ key, icon, label }) => {
            const active = key === 'all' ? isAllScenario
              : key === 'gunluk' ? isGunluk
              : key === 'haftalik' ? isHaftalik
              : key === 'aylik' ? isAylik
              : isGorsel;
            return (
              <div
                key={key}
                onClick={() => setScenario(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 15px',
                  borderRadius: 11, border: `2px solid ${active ? '#4f46e5' : '#e2e8f0'}`,
                  background: active ? '#eef2ff' : 'white',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'all 0.13s',
                }}
              >
                <span style={{ fontSize: 15 }}>{icon}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#4338ca' : '#374151' }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Filtre paneli ──────────────────────────────────────────── */}
      {!loading && packages.length > 0 && (
        <div style={{
          background: 'white', borderRadius: 14, padding: '14px 18px',
          display: 'flex', flexDirection: 'column', gap: 11,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          border: '1px solid #f1f5f9',
        }}>
          {/* Model filtresi */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, width: 44, flexShrink: 0 }}>
              Model
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={chipStyle(cat === 'Tümü')} onClick={() => setCat('Tümü')}>Tümü</span>
              {modelCategories.map((c) => (
                <span key={c} style={chipStyle(cat === c)} onClick={() => setCat(c)}>
                  {badgeFor(c).icon} {c}
                </span>
              ))}
            </div>
          </div>

          {/* Ayraç */}
          <div style={{ height: 1, background: '#f1f5f9' }} />

          {/* Süre filtresi */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, width: 44, flexShrink: 0 }}>
              Süre
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={chipStyle(durFilter === 'all')} onClick={() => setDurFilter('all')}>Tümü</span>
              {durations.map((d) => (
                <span key={d} style={chipStyle(durFilter === String(d))} onClick={() => setDurFilter(String(d))}>
                  {d} Gün
                </span>
              ))}
            </div>
          </div>

          {/* Ayraç + sonuç sayısı + sıralama */}
          <div style={{ height: 1, background: '#f1f5f9' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Gösterilen: <strong style={{ color: '#0f172a' }}>{visible.length}</strong> paket
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '5px 11px', borderRadius: 8, border: '1.5px solid #e2e8f0',
                fontSize: 12, fontWeight: 600, color: '#374151', background: 'white', cursor: 'pointer',
              }}
            >
              <option value="price-asc">Fiyat: Ucuzdan Pahalıya</option>
              <option value="price-desc">Fiyat: Pahalıdan Ucuza</option>
              <option value="unit-asc">Birim Fiyat: Ucuzdan</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Paket grid ─────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ background: 'white', borderRadius: 14, border: '2px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="shimmer" style={{ height: 20, width: '60%', borderRadius: 6 }} />
              <div className="shimmer" style={{ height: 14, width: '90%', borderRadius: 6 }} />
              <div className="shimmer" style={{ height: 14, width: '75%', borderRadius: 6 }} />
              <div className="shimmer" style={{ height: 36, width: '40%', borderRadius: 6, marginTop: 8 }} />
              <div className="shimmer" style={{ height: 40, borderRadius: 9, marginTop: 4 }} />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: 'white', borderRadius: 14, border: '2px solid #e2e8f0' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📦</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>Bu filtreler için paket yok</div>
          <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 5 }}>
            Farklı model veya süre seçin
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
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
