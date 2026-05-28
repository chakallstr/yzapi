import { useEffect, useMemo, useRef, useState } from 'react';
import {
  I, Card, Chip, Caption, PulseDot, Dot,
  PROVIDERS, MODELS, MODELS_BY_ID, MODEL_KEYS, modelMeta,
  modelsByType, modelsByProvider, ctxFor,
  computeOurUsd, usdToTL, computeTLPrice, fmt,
  mockLogs, promptPool, useCountUp, useLogStream, nowTime,
  mockUsers, mockUsageRecords, mockPayments, mockAnnouncements,
  mockAuditLogs, mockKurHistory, mockProviderStatus,
} from './shared.jsx';

/* ============================================
   ActivityTab — API çağrı logları + grafikler + canlı stream
   Sağlayıcı dağılımı + gecikme eğrisi + canlı tablo.
   ============================================ */

// === Latency curve chart ===========================================
const LatencyChart = ({ accentColor = 'var(--accent)' }) => {
  const points = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const base = 1100 + Math.sin(i * 0.6) * 280 + (i > 14 ? -150 : 0);
    return { h: i, lat: Math.round(base + Math.random() * 200) };
  }), []);
  const W = 700, H = 220, PAD = 30;
  const xs = (i) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const maxLat = Math.max(...points.map(p => p.lat));
  const ys = (v) => H - PAD - (v / maxLat) * (H - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(i)},${ys(p.lat)}`).join(' ');
  const area = `${path} L${xs(points.length-1)},${H-PAD} L${xs(0)},${H-PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220 }}>
      <defs>
        <linearGradient id="latArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1={PAD} x2={W - PAD} y1={PAD + i * (H - 2*PAD)/4} y2={PAD + i * (H - 2*PAD)/4}
              stroke="var(--border)" strokeWidth="1" />
      ))}
      {[0, 1, 2, 3, 4].map(i => (
        <text key={i} x={PAD - 6} y={PAD + i * (H - 2*PAD)/4 + 4} fontSize="9"
              fill="var(--ink-3)" fontFamily="var(--font-mono)" textAnchor="end">
          {Math.round(maxLat * (1 - i / 4))}
        </text>
      ))}
      {[0, 6, 12, 18, 23].map(h => (
        <text key={h} x={xs(h)} y={H - 10} fontSize="9" fill="var(--ink-3)"
              fontFamily="var(--font-mono)" textAnchor="middle">{String(h).padStart(2,'0')}:00</text>
      ))}
      <path d={area} fill="url(#latArea)" />
      <path d={path} fill="none" stroke={accentColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <line x1={PAD} x2={W-PAD} y1={ys(1180)} y2={ys(1180)} stroke="var(--warn)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
      <text x={W - PAD - 4} y={ys(1180) - 4} fontSize="9" fill="var(--warn)"
            fontFamily="var(--font-mono)" textAnchor="end">p50 · 1180ms</text>
      {points.map((p, i) => (
        <circle key={i} cx={xs(i)} cy={ys(p.lat)} r="2" fill="var(--surface)" stroke={accentColor} strokeWidth="1.2" />
      ))}
    </svg>
  );
};

// === Sağlayıcı dağılım donut (multi-segment) =======================
const ProviderDonut = ({ counts, total, speed = 1, animate = true }) => {
  const [t, setT] = useState(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) { setT(1); return; }
    const t0 = performance.now();
    let raf;
    const dur = 1100 / Math.max(0.1, speed);
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setT(e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, speed]);

  const C = 2 * Math.PI * 64;
  let acc = 0;
  return (
    <svg viewBox="0 0 160 160" style={{ width: 160, height: 160 }}>
      <circle cx="80" cy="80" r="64" fill="none" stroke="var(--border)" strokeWidth="18" />
      {counts.map((c) => {
        const frac = total ? c.count / total : 0;
        const startOffset = -acc * C;
        const length = C * frac * t;
        acc += frac;
        const meta = PROVIDERS[c.provider] || { color: 'var(--ink-3)' };
        return (
          <circle key={c.provider} cx="80" cy="80" r="64" fill="none"
                  stroke={meta.color} strokeWidth="18"
                  strokeDasharray={`${length} ${C}`}
                  strokeDashoffset={startOffset}
                  transform="rotate(-90 80 80)" />
        );
      })}
      <text x="80" y="78" textAnchor="middle" fontSize="26" fontWeight="600"
            fill="var(--ink)" fontFamily="var(--font-sans)" className="tnum">{fmt.num(total)}</text>
      <text x="80" y="96" textAnchor="middle" fontSize="10" fill="var(--ink-3)"
            fontFamily="var(--font-mono)">istek</text>
    </svg>
  );
};

// === Provider dist row ============================================
const DistRow = ({ provider, count, total }) => {
  const p = PROVIDERS[provider] || { label: provider, color: 'var(--ink-3)' };
  const pct = total ? Math.round(count * 100 / total) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color }} />
          {p.label}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500 }} className="tnum">
          {fmt.num(count)} · %{pct}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: p.color,
                       transition: `width calc(0.6s / var(--speed, 1)) ease` }} />
      </div>
    </div>
  );
};

// === Live log table ===============================================
const LiveLogTable = ({ logs }) => (
  <Card pad={20}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Son API çağrıları</div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Saniye başına ortalama 14.2 istek</div>
      </div>
      <Chip tone="ok">
        <PulseDot color="#10b981" size={6} withRing={false} />
        canlı
      </Chip>
    </div>

    <div style={{ overflow: 'hidden', maxHeight: 420 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '70px 1.4fr 1fr 70px 70px 80px 60px',
        gap: 12, padding: '0 0 8px', borderBottom: '1px solid var(--border)',
      }}>
        {['Zaman', 'Model', 'Sağlayıcı', 'Ctx', 'Gecikme', 'Token', 'Durum'].map(h => (
          <Caption key={h} style={{ fontSize: 9 }}>{h}</Caption>
        ))}
      </div>
      {logs.slice(0, 10).map((l, i) => {
        const m = modelMeta(l.model);
        return (
          <div key={l.id} className={i === 0 ? 'stream-in' : ''} style={{
            display: 'grid', gridTemplateColumns: '70px 1.4fr 1fr 70px 70px 80px 60px',
            gap: 12, padding: '12px 0', borderBottom: i < 9 ? '1px solid var(--border)' : 'none',
            alignItems: 'center', fontSize: 12,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 11 }}>{l.time}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: m.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3,
              padding: '2px 8px', borderRadius: 999, background: m.bg, color: m.ink,
              alignSelf: 'center', justifySelf: 'start',
            }}>{m.providerShort}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 11 }}>{l.ctx}</span>
            <span style={{ fontFamily: 'var(--font-mono)' }} className="tnum">{l.ms}ms</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }} className="tnum">{fmt.num(l.tokens)}</span>
            <span>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: l.status === 'slow' ? '#fff7ed' : 'var(--ok-bg)',
                display: 'grid', placeItems: 'center',
              }}>
                {l.status === 'slow' ? <I.Clock size={11} stroke="#c2410c" /> : <I.Check size={12} stroke="#047857" />}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  </Card>
);

// === KPI card =====================================================
const ActKPI = ({ label, value, delta, unit = '', speed, durationMs, decimals = 0 }) => {
  const isNum = typeof value === 'number';
  const n = useCountUp(isNum ? value : 0, { duration: durationMs ?? 1100, speed, decimals });
  return (
    <Card pad={18}>
      <Caption>{label}</Caption>
      <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: -1, marginTop: 8 }} className="tnum">
        {unit === '₺' && '₺'}
        {unit === '$' && '$'}
        {isNum ? (decimals === 0 ? fmt.num(n) : n.toFixed(decimals)) : value}
        {unit && !['₺','$'].includes(unit) && <span style={{ fontSize: 14, color: 'var(--ink-3)', marginLeft: 3, fontWeight: 500 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{delta}</div>
    </Card>
  );
};

// === OptimizationInsight — AI tabanlı tasarruf önerisi =============
const OptimizationInsight = () => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  // Demo öneri: Opus → Sonnet downgrade
  const opus = modelMeta('claude-opus-4-7');
  const sonnet = modelMeta('claude-sonnet-4-6');
  const currentMonthlyUsd = 84.42;
  const projectedMonthlyUsd = 48.92;
  const savingsUsd = currentMonthlyUsd - projectedMonthlyUsd;
  const savingsPct = Math.round((savingsUsd / currentMonthlyUsd) * 100);
  return (
    <Card pad={20} style={{
      background: 'linear-gradient(135deg, var(--accent-bg) 0%, var(--surface) 100%)',
      border: '1px solid var(--accent-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: 'var(--accent)', color: '#fff',
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <I.Sparkle size={18} stroke="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Caption style={{ color: 'var(--accent-ink)' }}>AI önerisi</Caption>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3, marginTop: 4 }}>
                Bu ay <span style={{ color: 'var(--accent-ink)' }}>%{savingsPct}</span> tasarruf fırsatı
              </div>
            </div>
            <button onClick={() => setDismissed(true)} style={{ color: 'var(--ink-3)', padding: 4 }}>
              <I.Close size={14} stroke="var(--ink-3)" />
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, marginTop: 8 }}>
            Bu ay isteklerinin %38'i <strong>{opus.label}</strong>'e gitti. İçeriklerinin %72'si <strong>{sonnet.label}</strong> ile aynı kalitede çözülürdü.
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.6)', border: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>MEVCUT · OPUS</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 600, marginTop: 4 }} className="tnum">${currentMonthlyUsd.toFixed(2)}</div>
            </div>
            <I.Arrow size={18} stroke="var(--ink-3)" style={{ alignSelf: 'center' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: '#047857', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>ÖNERİLEN · SONNET</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 600, marginTop: 4, color: '#047857' }} className="tnum">${projectedMonthlyUsd.toFixed(2)}</div>
            </div>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>TASARRUF</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 600, marginTop: 4, color: 'var(--accent-ink)' }} className="tnum">${savingsUsd.toFixed(2)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'var(--accent)', color: '#fff',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <I.Sparkle size={11} stroke="#fff" /> Akıllı yönlendiriciyi aç
            </button>
            <button onClick={() => setDismissed(true)} style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: 'transparent', color: 'var(--ink-2)',
              border: '1px solid var(--border)',
            }}>Sonra hatırlat</button>
          </div>
        </div>
      </div>
    </Card>
  );
};

// === ActivityTab ===================================================
const ActivityTab = ({ ctx }) => {
  const { logs, tweaks } = ctx;

  // Memoize byProvider so it only changes when total log count crosses a chunk —
  // not on every stream tick — so KPI count-ups can converge.
  const byProvider = useMemo(() => {
    const counts = {};
    for (const l of logs) {
      const m = MODELS_BY_ID[l.model];
      if (!m) continue;
      counts[m.provider] = (counts[m.provider] || 0) + 1;
    }
    return Object.entries(counts).map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count);
  }, [logs.length]);
  const total = byProvider.reduce((s, x) => s + x.count, 0);

  // Static provider count for KPI (doesn't churn as logs stream)
  const providerCount = Object.keys(PROVIDERS).length;

  const [range, setRange] = useState('day');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Caption>Aktivite</Caption>
          <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8, margin: '6px 0 6px' }}>
            API çağrıları, <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>canlı</span>
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>
            Son 24 saatte yapılan tüm istekler, sağlayıcı dağılımı ve gecikme eğrisi.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--surface)',
                      border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          {[['hour','Saat'], ['day','Gün'], ['week','Hafta']].map(([k,l]) => (
            <button key={k} onClick={() => setRange(k)} style={{
              padding: '5px 12px', fontSize: 11.5, fontWeight: 500, borderRadius: 7,
              background: range === k ? 'var(--ink)' : 'transparent',
              color: range === k ? 'var(--surface)' : 'var(--ink-3)',
              transition: 'all 0.15s',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <ActKPI label="Toplam istek"    value={14022}  delta="+18% dün"        speed={tweaks.animSpeed} durationMs={tweaks.kpiCountMs} />
        <ActKPI label="Avg gecikme"     value={1180}   unit="ms" delta="−8% iyileşme" speed={tweaks.animSpeed} durationMs={tweaks.kpiCountMs} />
        <ActKPI label="Bu ay harcama"   value={4.16}   unit="$" delta="≈ ₺143.52 bilgi" speed={tweaks.animSpeed} durationMs={tweaks.kpiCountMs} decimals={2} />
        <ActKPI label="Sağlayıcı"       value={providerCount} delta={`${MODEL_KEYS.length} model toplam`}  speed={tweaks.animSpeed} durationMs={tweaks.kpiCountMs} />
      </div>

      {/* AI Optimization insight */}
      <OptimizationInsight />

      {/* Chart + provider donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <Card pad={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Gecikme eğrisi</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>İstek başına milisaniye · son 24 saat</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-2)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent)' }} />
                Gecikme
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 2, background: 'var(--warn)' }} />
                p50
              </span>
            </div>
          </div>
          <LatencyChart />
        </Card>

        <Card pad={20}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Sağlayıcı dağılımı</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, marginBottom: 16 }}>
            Son istekler — kullanılan sağlayıcılar
          </div>
          <div style={{ display: 'grid', placeItems: 'center', marginBottom: 16 }}>
            <ProviderDonut counts={byProvider} total={total} speed={tweaks.animSpeed} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxHeight: 200, overflow: 'auto' }}>
            {byProvider.slice(0, 6).map(({ provider, count }) => (
              <DistRow key={provider} provider={provider} count={count} total={total} />
            ))}
          </div>
        </Card>
      </div>

      {/* Live log table */}
      <LiveLogTable logs={logs} />
    </div>
  );
};

export { ActivityTab };
