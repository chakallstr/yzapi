import { useEffect, useRef, useState } from 'react';
import { Card, Caption, PulseDot } from './shared.jsx';
import { useT } from './i18n/index.jsx';

/* CSS animasyonlarını bir kez enjekte et */
const STYLE_ID = 'status-tab-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes statusGlow {
      0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
      50%      { box-shadow: 0 0 0 8px rgba(16,185,129,0.15); }
    }
    @keyframes statusGlowWarn {
      0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
      50%      { box-shadow: 0 0 0 8px rgba(245,158,11,0.15); }
    }
    @keyframes statusGlowDown {
      0%,100% { box-shadow: 0 0 0 0 rgba(244,63,94,0); }
      50%      { box-shadow: 0 0 0 8px rgba(244,63,94,0.15); }
    }
    @keyframes rowSlideIn {
      from { opacity: 0; transform: translateX(-10px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes countUp {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes dotPulseGreen {
      0%,100% { opacity: 1; transform: scale(1); }
      50%     { opacity: 0.6; transform: scale(1.4); }
    }
    @keyframes scanLine {
      0%   { transform: translateY(-100%); opacity: 0; }
      10%  { opacity: 0.4; }
      90%  { opacity: 0.4; }
      100% { transform: translateY(400%); opacity: 0; }
    }
  `;
  document.head.appendChild(s);
}

const STATUS_CFG = {
  ok:       { color: '#047857', bg: 'var(--ok-bg)',   border: '#a7f3d0', dot: 'var(--ok)',  icon: '●' },
  degraded: { color: '#92400e', bg: '#fffbeb',         border: '#fde68a', dot: 'var(--warn)', icon: '◐' },
  down:     { color: '#be123c', bg: '#fff1f2',         border: '#fecdd3', dot: '#f43f5e',  icon: '○' },
};

function cfg(v) { return STATUS_CFG[v] || { color: 'var(--ink-3)', bg: 'var(--surface-2)', border: 'var(--border)', dot: 'var(--ink-4)', icon: '?' }; }

function fmtUptime(s) {
  const sec = Number(s) || 0;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d ? d + 'g ' : ''}${h}s ${m}d`;
}

const SERVICE_ICONS = { api: '⚡', db: '🗄', aiProvider: '✦' };
const GLOW_ANIM = { ok: 'statusGlow 2.5s ease-in-out infinite', degraded: 'statusGlowWarn 2.5s ease-in-out infinite', down: 'statusGlowDown 2.5s ease-in-out infinite' };

export function StatusTab() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tick, setTick] = useState(0);
  const tickRef = useRef(0);

  const load = () => {
    fetch('/status')
      .then((r) => r.json())
      .then((d) => { setData(d); setUpdatedAt(new Date()); setError(''); tickRef.current++; setTick(tickRef.current); })
      .catch(() => setError(t('status.fetchError')));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const checks = data?.checks || {};
  const overall = cfg(data?.status);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Başlık */}
      <div>
        <Caption>{t('status.title')}</Caption>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, margin: '4px 0 0', color: 'var(--ink)' }}>
          {t('status.title')}
        </h1>
      </div>

      {/* Hata */}
      {error && (
        <div className="fade-in" style={{
          padding: '12px 16px', borderRadius: 10,
          background: '#fff1f2', border: '1px solid #fecdd3',
          fontSize: 13, color: '#be123c', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Genel durum kartı — büyük hero */}
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {/* Üst renkli şerit */}
        <div style={{
          height: 3,
          background: data?.status === 'ok'
            ? 'linear-gradient(90deg, #10b981, #3b82f6)'
            : data?.status === 'degraded'
            ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
            : 'linear-gradient(90deg, #ef4444, #be123c)',
        }} />

        <div style={{ padding: '24px 24px 20px', position: 'relative', overflow: 'hidden' }}>
          {/* Scan line efekti */}
          {data?.status === 'ok' && (
            <div style={{
              position: 'absolute', left: 0, right: 0, height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.3), transparent)',
              animation: 'scanLine 3s linear infinite',
              pointerEvents: 'none',
            }} />
          )}

          {!data ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="shimmer" style={{ width: 140, height: 36, borderRadius: 999 }} />
              <div className="shimmer" style={{ width: 240, height: 14, borderRadius: 6 }} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {/* Büyük parlayan durum badge */}
              <div
                key={tick}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '10px 20px', borderRadius: 999,
                  background: overall.bg, border: `1.5px solid ${overall.border}`,
                  animation: GLOW_ANIM[data.status] || 'none',
                }}
              >
                <span style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: overall.dot, display: 'block', flexShrink: 0,
                  animation: 'dotPulseGreen 1.8s ease-in-out infinite',
                }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: overall.color, fontFamily: 'var(--font-mono)', letterSpacing: 0.3 }}>
                  {t(`status.statusLabel_${data.status}`) || data.status}
                </span>
              </div>

              {/* Meta — sayı animasyonu */}
              <div key={`meta-${tick}`} style={{ animation: 'countUp 0.4s ease both', fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                {t('status.uptimeSummary', {
                  uptime: fmtUptime(data.uptimeSeconds),
                  modelCount: data.modelCount ?? '—',
                  version: data.version ?? '—',
                })}
              </div>

              {updatedAt && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
                  {t('status.lastChecked', { time: updatedAt.toLocaleTimeString('tr-TR') })}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Servis kontrolleri */}
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {!data ? (
          [1, 2, 3].map((i) => (
            <div key={i} style={{ padding: '18px 22px', borderBottom: i < 3 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="shimmer" style={{ width: 38, height: 38, borderRadius: 10 }} />
                <div className="shimmer" style={{ width: 100, height: 14, borderRadius: 6 }} />
              </div>
              <div className="shimmer" style={{ width: 90, height: 24, borderRadius: 999 }} />
            </div>
          ))
        ) : Object.keys(checks).length === 0 ? (
          <div style={{ padding: '20px', color: 'var(--ink-3)', fontSize: 13 }}>{t('status.noCheckData')}</div>
        ) : (
          Object.entries(checks).map(([k, v], i, arr) => {
            const c = cfg(v);
            return (
              <div
                key={k}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '16px 22px',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  animation: `rowSlideIn 0.35s ease both`,
                  animationDelay: `${i * 0.08}s`,
                  transition: 'background 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: c.bg, border: `1.5px solid ${c.border}`,
                    display: 'grid', placeItems: 'center',
                    fontSize: 16, color: c.color,
                    transition: 'all 0.3s',
                  }}>
                    {SERVICE_ICONS[k] ?? '◉'}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
                    {t(`status.checkLabel_${k}`) || k}
                  </span>
                </div>

                {/* Animasyonlu durum badge */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '5px 14px', borderRadius: 999,
                  background: c.bg, border: `1.5px solid ${c.border}`,
                  animation: v === 'ok' ? 'statusGlow 3s ease-in-out infinite' : 'none',
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: c.dot,
                    animation: v === 'ok' ? 'dotPulseGreen 2s ease-in-out infinite' : 'none',
                    animationDelay: `${i * 0.3}s`,
                  }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: c.color, letterSpacing: 0.2 }}>
                    {t(`status.statusLabel_${v}`) || String(v ?? '—')}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </Card>

      {/* Son kur güncelleme */}
      {data?.lastKurRefresh && (
        <div style={{ fontSize: 11.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
          {t('status.lastKurRefresh', { datetime: new Date(data.lastKurRefresh).toLocaleString('tr-TR') })}
        </div>
      )}
    </div>
  );
}
