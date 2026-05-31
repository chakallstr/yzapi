import { useEffect, useMemo, useState } from 'react';
import {
  I, Card, Chip, Caption, PulseDot,
  PROVIDERS, MODELS_BY_ID, fmt, useCountUp,
} from './shared.jsx';
import { apiJson } from './auth-client.js';

const EMPTY_ACTIVITY = [];

const toDate = (value) => {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const currencyUsd = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatLogTime = (value) => {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const formatStatus = (status) => {
  if (!status) return 'ok';
  return String(status).toLowerCase();
};

const LatencyChart = ({ points, p50, accentColor = 'var(--accent)' }) => {
  const W = 700;
  const H = 220;
  const PAD = 30;
  const safePoints = points.length ? points : [{ label: '0', lat: 0 }];
  const maxLat = Math.max(1, ...safePoints.map((p) => p.lat || 0));
  const xs = (i) => PAD + (i / Math.max(1, safePoints.length - 1)) * (W - PAD * 2);
  const ys = (v) => H - PAD - (Math.max(0, v) / maxLat) * (H - PAD * 2);
  const path = safePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(i)},${ys(p.lat)}`).join(' ');
  const area = `${path} L${xs(safePoints.length - 1)},${H - PAD} L${xs(0)},${H - PAD} Z`;
  const tickIndexes = safePoints.length <= 7
    ? safePoints.map((_, index) => index)
    : [0, Math.floor((safePoints.length - 1) * 0.25), Math.floor((safePoints.length - 1) * 0.5), Math.floor((safePoints.length - 1) * 0.75), safePoints.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220 }}>
      <defs>
        <linearGradient id="latArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={PAD}
          x2={W - PAD}
          y1={PAD + i * (H - 2 * PAD) / 4}
          y2={PAD + i * (H - 2 * PAD) / 4}
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <text
          key={i}
          x={PAD - 6}
          y={PAD + i * (H - 2 * PAD) / 4 + 4}
          fontSize="9"
          fill="var(--ink-3)"
          fontFamily="var(--font-mono)"
          textAnchor="end"
        >
          {Math.round(maxLat * (1 - i / 4))}
        </text>
      ))}
      {tickIndexes.map((index) => (
        <text
          key={index}
          x={xs(index)}
          y={H - 10}
          fontSize="9"
          fill="var(--ink-3)"
          fontFamily="var(--font-mono)"
          textAnchor="middle"
        >
          {safePoints[index]?.label || '—'}
        </text>
      ))}
      <path d={area} fill="url(#latArea)" />
      <path d={path} fill="none" stroke={accentColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {p50 > 0 && (
        <>
          <line x1={PAD} x2={W - PAD} y1={ys(p50)} y2={ys(p50)} stroke="var(--warn)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
          <text x={W - PAD - 4} y={ys(p50) - 4} fontSize="9" fill="var(--warn)" fontFamily="var(--font-mono)" textAnchor="end">
            p50 · {Math.round(p50)}ms
          </text>
        </>
      )}
      {safePoints.map((p, i) => (
        <circle key={i} cx={xs(i)} cy={ys(p.lat)} r="2" fill="var(--surface)" stroke={accentColor} strokeWidth="1.2" />
      ))}
    </svg>
  );
};

const ProviderDonut = ({ counts, total }) => {
  const C = 2 * Math.PI * 64;
  let acc = 0;
  return (
    <svg viewBox="0 0 160 160" style={{ width: 160, height: 160 }}>
      <circle cx="80" cy="80" r="64" fill="none" stroke="var(--border)" strokeWidth="18" />
      {counts.map((c) => {
        const frac = total ? c.count / total : 0;
        const startOffset = -acc * C;
        const length = C * frac;
        acc += frac;
        const meta = PROVIDERS[c.provider] || { color: 'var(--ink-3)' };
        return (
          <circle
            key={c.provider}
            cx="80"
            cy="80"
            r="64"
            fill="none"
            stroke={meta.color}
            strokeWidth="18"
            strokeDasharray={`${length} ${C}`}
            strokeDashoffset={startOffset}
            transform="rotate(-90 80 80)"
          />
        );
      })}
      <text x="80" y="78" textAnchor="middle" fontSize="26" fontWeight="600" fill="var(--ink)" fontFamily="var(--font-sans)" className="tnum">
        {fmt.num(total)}
      </text>
      <text x="80" y="96" textAnchor="middle" fontSize="10" fill="var(--ink-3)" fontFamily="var(--font-mono)">istek</text>
    </svg>
  );
};

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
        <div style={{ height: '100%', width: `${pct}%`, background: p.color, transition: 'width 0.25s ease' }} />
      </div>
    </div>
  );
};

const EmptyState = ({ children }) => (
  <div style={{ padding: 18, borderRadius: 12, border: '1px dashed var(--border)', color: 'var(--ink-3)', fontSize: 12 }}>
    {children}
  </div>
);

const LiveLogTable = ({ records }) => (
  <Card pad={20}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Son API çağrıları</div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
          Gerçek kullanım kayıtları gösterilir
        </div>
      </div>
      <Chip tone="ok">
        <PulseDot color="#10b981" size={6} withRing={false} />
        kayıtlı
      </Chip>
    </div>

    {records.length === 0 ? (
      <EmptyState>Henüz kullanım kaydı yok. İlk API çağrısından sonra burada görünür.</EmptyState>
    ) : (
      <div style={{ overflow: 'hidden', maxHeight: 420 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '70px 1.4fr 1fr 70px 70px 80px 60px',
          gap: 12, padding: '0 0 8px', borderBottom: '1px solid var(--border)',
        }}>
          {['Zaman', 'Model', 'Sağlayıcı', 'Tip', 'Gecikme', 'Token (g+ç)', 'Durum'].map((h) => (
            <Caption key={h} style={{ fontSize: 9 }}>{h}</Caption>
          ))}
        </div>
        {records.slice(0, 10).map((record, i) => {
          const m = MODELS_BY_ID[record.modelId] || null;
          const provider = m ? PROVIDERS[m.provider] : null;
          const status = formatStatus(record.status);
          return (
            <div
              key={record.id}
              style={{
                display: 'grid', gridTemplateColumns: '70px 1.4fr 1fr 70px 70px 80px 60px',
                gap: 12, padding: '12px 0', borderBottom: i < 9 ? '1px solid var(--border)' : 'none',
                alignItems: 'center', fontSize: 12,
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 11 }}>{formatLogTime(record.timestamp)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: provider?.color || 'var(--ink-3)', flexShrink: 0 }} />
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m?.label || record.modelId}</span>
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3,
                padding: '2px 8px', borderRadius: 999, background: provider ? `${provider.color}20` : 'var(--surface-2)',
                color: provider?.color || 'var(--ink-2)', alignSelf: 'center', justifySelf: 'start',
              }}>
                {provider?.label || 'Bilinmiyor'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 11 }}>{record.type || 'text'}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }} className="tnum">{record.responseMs ? `${record.responseMs}ms` : '—'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }} className="tnum">{
                (() => {
                  const inTok = Number(record.inputUsage || 0);
                  const outTok = Number(record.outputUsage || 0);
                  const units = Number(record.unitsUsage || 0);
                  // Metin modellerinde gerçek token = giriş+çıkış; görsel/video'da units (adet/saniye).
                  if (inTok > 0 || outTok > 0) return `${fmt.num(inTok)}+${fmt.num(outTok)}`;
                  return fmt.num(units);
                })()
              }</span>
              <span>
                <span style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: status === 'ok' || status === 'success' ? 'var(--ok-bg)' : '#fff7ed',
                  display: 'grid', placeItems: 'center',
                }}>
                  {status === 'ok' || status === 'success'
                    ? <I.Check size={12} stroke="#047857" />
                    : <I.Clock size={11} stroke="#c2410c" />}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    )}
  </Card>
);

const ActKPI = ({ label, value, delta, unit = '', decimals = 0 }) => {
  const n = useCountUp(Number(value || 0), { duration: 900, decimals });
  return (
    <Card pad={18}>
      <Caption>{label}</Caption>
      <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: -1, marginTop: 8 }} className="tnum">
        {unit === '₺' && '₺'}
        {unit === '$' && '$'}
        {decimals === 0 ? fmt.num(n) : n.toFixed(decimals)}
        {unit && !['₺', '$'].includes(unit) && <span style={{ fontSize: 14, color: 'var(--ink-3)', marginLeft: 3, fontWeight: 500 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{delta}</div>
    </Card>
  );
};

const buildLatencyPoints = (records, range) => {
  const now = new Date();
  const mkPoint = (label) => ({ label, lat: 0, count: 0 });

  if (range === 'hour') {
    const points = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getTime() - (55 - i * 5) * 60000);
      return mkPoint(d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    });
    records.forEach((record) => {
      const date = toDate(record.timestamp);
      if (!date || record.responseMs == null) return;
      const diffMin = (now.getTime() - date.getTime()) / 60000;
      if (diffMin < 0 || diffMin > 60) return;
      const index = Math.min(11, Math.max(0, 11 - Math.floor(diffMin / 5)));
      points[index].lat += record.responseMs;
      points[index].count += 1;
    });
    return points.map((p) => ({ label: p.label, lat: p.count ? Math.round(p.lat / p.count) : 0 }));
  }

  if (range === 'week') {
    const points = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - (6 - i) * 86400000);
      return mkPoint(d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }));
    });
    records.forEach((record) => {
      const date = toDate(record.timestamp);
      if (!date || record.responseMs == null) return;
      const diffDay = Math.floor((now.getTime() - date.getTime()) / 86400000);
      if (diffDay < 0 || diffDay > 6) return;
      const index = 6 - diffDay;
      points[index].lat += record.responseMs;
      points[index].count += 1;
    });
    return points.map((p) => ({ label: p.label, lat: p.count ? Math.round(p.lat / p.count) : 0 }));
  }

  const points = Array.from({ length: 24 }, (_, i) => mkPoint(`${String(i).padStart(2, '0')}:00`));
  records.forEach((record) => {
    const date = toDate(record.timestamp);
    if (!date || record.responseMs == null) return;
    const diffHour = (now.getTime() - date.getTime()) / 3600000;
    if (diffHour < 0 || diffHour > 24) return;
    const index = date.getHours();
    points[index].lat += record.responseMs;
    points[index].count += 1;
  });
  return points.map((p) => ({ label: p.label, lat: p.count ? Math.round(p.lat / p.count) : 0 }));
};

const ActivityTab = ({ ctx }) => {
  const { tweaks } = ctx;
  const [range, setRange] = useState('day');
  const [records, setRecords] = useState(EMPTY_ACTIVITY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiJson('/api/user/usage-records')
      .then((rows) => {
        if (!cancelled) setRecords(Array.isArray(rows) ? rows : EMPTY_ACTIVITY);
      })
      .catch((err) => {
        if (!cancelled) {
          setRecords(EMPTY_ACTIVITY);
          setError(err?.message || 'Aktivite verisi alınamadı.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const now = new Date();
  const filtered = useMemo(() => {
    const cutoff = range === 'hour'
      ? now.getTime() - 3600000
      : range === 'week'
        ? now.getTime() - 7 * 86400000
        : now.getTime() - 24 * 3600000;
    return records.filter((record) => {
      const date = toDate(record.timestamp);
      return date ? date.getTime() >= cutoff : false;
    });
  }, [now, range, records]);

  const monthSpendUsd = useMemo(() => {
    const monthStart = startOfMonth(now).getTime();
    const totalTl = records.reduce((sum, record) => {
      const date = toDate(record.timestamp);
      if (!date || date.getTime() < monthStart) return sum;
      return sum + Number(record.costTL || 0);
    }, 0);
    return tweaks.tlRate > 0 ? totalTl / tweaks.tlRate : 0;
  }, [now, records, tweaks.tlRate]);

  const avgLatency = useMemo(() => {
    const rows = filtered.filter((record) => Number.isFinite(record.responseMs));
    if (!rows.length) return 0;
    return Math.round(rows.reduce((sum, record) => sum + Number(record.responseMs || 0), 0) / rows.length);
  }, [filtered]);

  const byProvider = useMemo(() => {
    const counts = {};
    filtered.forEach((record) => {
      const model = MODELS_BY_ID[record.modelId];
      const provider = model?.provider;
      if (!provider) return;
      counts[provider] = (counts[provider] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const providerCount = byProvider.length;
  const total = filtered.length;
  const latencyPoints = useMemo(() => buildLatencyPoints(filtered, range), [filtered, range]);
  const latValues = filtered.map((record) => Number(record.responseMs || 0)).filter((value) => value > 0).sort((a, b) => a - b);
  const p50 = latValues.length ? latValues[Math.floor((latValues.length - 1) * 0.5)] : 0;
  const rangeLabel = range === 'hour' ? 'son 1 saat' : range === 'week' ? 'son 7 gün' : 'son 24 saat';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Caption>Aktivite</Caption>
          <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8, margin: '6px 0 6px' }}>
            API çağrıları, <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>gerçek</span>
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>
            Yeni hesaplarda bu ekran sıfırdan başlar. Kullanım oldukça doğal olarak dolar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          {[['hour', 'Saat'], ['day', 'Gün'], ['week', 'Hafta']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              style={{
                padding: '5px 12px', fontSize: 11.5, fontWeight: 500, borderRadius: 7,
                background: range === key ? 'var(--ink)' : 'transparent',
                color: range === key ? 'var(--surface)' : 'var(--ink-3)',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <ActKPI label="Toplam istek" value={total} delta={loading ? 'yükleniyor…' : rangeLabel} />
        <ActKPI label="Avg gecikme" value={avgLatency} unit="ms" delta={total ? `${total} kayıt ölçüldü` : 'ölçüm yok'} />
        <ActKPI label="Bu ay harcama" value={monthSpendUsd} unit="$" delta={`≈ ₺${(monthSpendUsd * (tweaks.tlRate || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} decimals={2} />
        <ActKPI label="Sağlayıcı" value={providerCount} delta={providerCount ? 'kullanılan sağlayıcı' : 'henüz kullanım yok'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <Card pad={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Gecikme eğrisi</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>İstek başına milisaniye · {rangeLabel}</div>
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
          {total === 0 && !loading ? (
            <EmptyState>Henüz çağrı yapılmadı. İlk istekten sonra gecikme eğrisi burada oluşur.</EmptyState>
          ) : (
            <LatencyChart points={latencyPoints} p50={p50} />
          )}
        </Card>

        <Card pad={20}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Sağlayıcı dağılımı</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, marginBottom: 16 }}>
            Gerçek kullanım kayıtları
          </div>
          <div style={{ display: 'grid', placeItems: 'center', marginBottom: 16 }}>
            <ProviderDonut counts={byProvider} total={total} />
          </div>
          {total === 0 ? (
            <EmptyState>Henüz kullanım olmadığı için dağılım görünmüyor.</EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxHeight: 200, overflow: 'auto' }}>
              {byProvider.slice(0, 6).map(({ provider, count }) => (
                <DistRow key={provider} provider={provider} count={count} total={total} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <LiveLogTable records={records} />
    </div>
  );
};

export { ActivityTab };
