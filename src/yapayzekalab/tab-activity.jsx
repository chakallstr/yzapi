import { useEffect, useMemo, useState } from 'react';
import {
  I, Card, Chip, Caption, PulseDot,
  PROVIDERS, MODELS_BY_ID, modelMeta, fmt, useCountUp,
} from './shared.jsx';
import { apiJson } from './auth-client.js';
import { useT } from './i18n/index.jsx';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';

const EMPTY_ACTIVITY = [];

// — Admin trafik panelini aynalayan müşteri-cephesi grafik yardımcıları —
const statCell = { padding: '10px 12px', fontSize: 11.5, borderBottom: '1px solid var(--border)' };

const StatSection = ({ title, sub, children }) => (
  <Card pad={0} style={{ overflow: 'hidden' }}>
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      {sub ? <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{sub}</div> : null}
    </div>
    <div style={{ padding: 14 }}>{children}</div>
  </Card>
);

// Saat/gün yoğunluk ısı haritası — usage-stats zaman serisi kovalarından.
const StatHeatGrid = ({ rows }) => {
  const { t } = useT();
  const max = Math.max(...rows.map((r) => r.requestCount || 0), 1);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(74px, 1fr))', gap: 8 }}>
      {rows.map((row) => {
        const intensity = Math.max(0.1, (row.requestCount || 0) / max);
        const tooltipKey = row.errorCount ? 'activity.heatgrid.tooltip.errors' : 'activity.heatgrid.tooltip';
        return (
          <div
            key={row.bucketStart}
            title={t(tooltipKey, { label: row.label, requestCount: fmt.num(row.requestCount || 0), errorCount: fmt.num(row.errorCount) })}
            style={{
              borderRadius: 12, padding: '10px 9px', border: '1px solid var(--border)',
              background: `rgba(37,99,235,${Math.min(0.82, intensity)})`,
              color: intensity > 0.5 ? '#fff' : 'var(--ink)',
            }}
          >
            <div style={{ fontSize: 10, opacity: intensity > 0.5 ? 0.92 : 0.7 }}>{row.label}</div>
            <div className="tnum" style={{ fontSize: 16, fontWeight: 700, marginTop: 5 }}>{fmt.num(row.requestCount || 0)}</div>
            {row.errorCount > 0 ? <div style={{ fontSize: 10, marginTop: 3 }}>{t('activity.heatgrid.cell.errors', { errorCount: fmt.num(row.errorCount) })}</div> : null}
          </div>
        );
      })}
    </div>
  );
};

const toDate = (value) => {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const formatLogTime = (value) => {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

// Tam tarih + saat:dakika:saniye (admin paneliyle aynı çözünürlük).
const formatLogDateTime = (value) => {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const formatStatus = (status) => {
  if (!status) return 'ok';
  return String(status).toLowerCase();
};

const isOkStatus = (status) => {
  const s = formatStatus(status);
  return s === 'ok' || s === 'success';
};

// Bir kaydın gerçek token kalemlerini güvenle çıkarır (backend cache kırılımını veriyor).
const recordTokens = (record) => {
  const inputUsage = Number(record.inputUsage || 0);
  const outputUsage = Number(record.outputUsage || 0);
  const rawCacheRead = Number(record.cacheReadTokens || 0);
  const rawCacheCreate = Number(record.cacheCreateTokens || 0);
  // Gösterim DEĞİŞMEZİ: cache kalemleri faturalanan girişin ALT KÜMESİDİR; üç
  // kırılım satırı (base + cacheRead + cacheCreate) her zaman 'Toplam giriş'e
  // toplanmalı. Bozuk upstream verisinde (cache > inputUsage) bu kırılmasın diye
  // cache'i girişe clamp'leyip base'i clamp'li değerlerden türetiriz. Sağlıklı
  // veride (cache <= giriş) clamp no-op'tur; ortak yol değişmez. Faturalama bu
  // helper'ı KULLANMAZ (yalnız gösterim) — money-flow etkilenmez.
  const cacheRead = Math.max(0, Math.min(rawCacheRead, inputUsage));
  const cacheCreate = Math.max(0, Math.min(rawCacheCreate, inputUsage - cacheRead));
  const base = Math.max(0, inputUsage - cacheRead - cacheCreate);
  const units = Number(record.unitsUsage || 0);
  return {
    base,
    cacheRead,
    cacheCreate,
    inputUsage,
    outputUsage,
    units,
    total: inputUsage + outputUsage,
  };
};

const usdFor = (record, tlRate) => {
  const usd = Number(record.costUsd || 0);
  if (usd > 0) return usd;
  const tl = Number(record.costTL || 0);
  return tlRate > 0 ? tl / tlRate : 0;
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
  const { t } = useT();
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
      <text x="80" y="96" textAnchor="middle" fontSize="10" fill="var(--ink-3)" fontFamily="var(--font-mono)">{t('activity.donut.requests')}</text>
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

const StatusBadge = ({ status }) => {
  const { t } = useT();
  const ok = isOkStatus(status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600,
      padding: '3px 8px', borderRadius: 999,
      background: ok ? 'var(--ok-bg)' : '#fff7ed',
      color: ok ? '#047857' : '#c2410c',
    }}>
      {ok ? <I.Check size={11} stroke="#047857" /> : <I.Clock size={10} stroke="#c2410c" />}
      {ok ? t('activity.status.ok') : t('activity.status.error')}
    </span>
  );
};

// Genişletilebilir detay satırı — bir isteğin tüm token/maliyet kırılımı.
const DetailRow = ({ label, value, mono = true, accent = false }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{label}</span>
    <span
      className={mono ? 'tnum' : undefined}
      style={{ fontSize: 11.5, fontWeight: accent ? 600 : 500, fontFamily: mono ? 'var(--font-mono)' : 'inherit', color: accent ? 'var(--ink)' : 'var(--ink-2)', textAlign: 'right', wordBreak: 'break-all' }}
    >
      {value}
    </span>
  </div>
);

const ExpandedDetail = ({ record, tlRate }) => {
  const { t } = useT();
  const tok = recordTokens(record);
  const usd = usdFor(record, tlRate);
  const tl = Number(record.costTL || 0);
  const keyLabel = record.apiKeyName || record.apiKeyMasked || '—';
  return (
    <div style={{
      gridColumn: '1 / -1', padding: '14px 16px', background: 'var(--surface-2)',
      borderBottom: '1px solid var(--border)',
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '4px 28px',
    }}>
      <div>
        <Caption style={{ fontSize: 9 }}>{t('activity.detail.section.tokens')}</Caption>
        <DetailRow label={t('activity.detail.base')} value={fmt.num(tok.base)} />
        <DetailRow label={t('activity.detail.cacheRead')} value={fmt.num(tok.cacheRead)} />
        <DetailRow label={t('activity.detail.cacheWrite')} value={fmt.num(tok.cacheCreate)} />
        <DetailRow label={t('activity.detail.totalInput')} value={fmt.num(tok.inputUsage)} accent />
        <DetailRow label={t('activity.detail.output')} value={fmt.num(tok.outputUsage)} accent />
        <DetailRow label={t('activity.detail.totalTokens')} value={fmt.num(tok.total)} accent />
      </div>
      <div>
        <Caption style={{ fontSize: 9 }}>{t('activity.detail.section.cost')}</Caption>
        <DetailRow label={t('activity.detail.costTL')} value={`₺${tl.toFixed(4)}`} accent />
        <DetailRow label={t('activity.detail.costUSD')} value={`$${usd.toFixed(6)}`} accent />
        <DetailRow label={t('activity.detail.remaining')} value={record.remainingTL === null || record.remainingTL === undefined ? '—' : `₺${Number(record.remainingTL).toFixed(2)}`} />
        <DetailRow label={t('activity.detail.latency')} value={record.responseMs ? `${fmt.num(record.responseMs)} ms` : '—'} />
        <DetailRow label={t('activity.detail.apiKey')} value={keyLabel} mono={false} />
        <DetailRow label={t('activity.detail.type')} value={record.type || 'text'} />
        {record.errorCode ? <DetailRow label={t('activity.detail.errorCode')} value={record.errorCode} /> : null}
        <DetailRow label={t('activity.detail.requestId')} value={record.requestId || record.id} />
      </div>
    </div>
  );
};

const HISTORY_GRID = '128px 1.3fr 1fr 110px 96px 130px 96px 30px';

const UsageHistoryTable = ({ records, tlRate, loading }) => {
  const { t } = useT();
  const [modelFilter, setModelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(25);
  const [expandedId, setExpandedId] = useState(null);

  const modelOptions = useMemo(() => {
    const set = new Map();
    records.forEach((r) => {
      if (!set.has(r.modelId)) set.set(r.modelId, modelMeta(r.modelId).label || r.modelId);
    });
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr'));
  }, [records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (modelFilter !== 'all' && r.modelId !== modelFilter) return false;
      if (statusFilter === 'ok' && !isOkStatus(r.status)) return false;
      if (statusFilter === 'error' && isOkStatus(r.status)) return false;
      if (q) {
        const hay = `${r.modelId} ${modelMeta(r.modelId).label || ''} ${r.requestId || ''} ${r.apiKeyName || ''} ${r.errorCode || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, modelFilter, statusFilter, query]);

  useEffect(() => { setVisible(25); }, [modelFilter, statusFilter, query]);

  const shown = filtered.slice(0, visible);

  const selectStyle = {
    padding: '7px 10px', fontSize: 11.5, borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-2)',
  };

  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t('activity.table.title')}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
            {t('activity.table.subtitle')}
          </div>
        </div>
        <Chip tone="ok">
          <PulseDot color="#10b981" size={6} withRing={false} />
          {t('activity.table.recordCount', { count: fmt.num(filtered.length) })}
        </Chip>
      </div>

      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface-2)' }}>
        <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} style={selectStyle}>
          <option value="all">{t('activity.table.filter.allModels')}</option>
          {modelOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="all">{t('activity.table.filter.allStatuses')}</option>
          <option value="ok">{t('activity.table.filter.onlyOk')}</option>
          <option value="error">{t('activity.table.filter.onlyError')}</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('activity.table.filter.searchPlaceholder')}
          style={{ ...selectStyle, flex: 1, minWidth: 180 }}
        />
        {(modelFilter !== 'all' || statusFilter !== 'all' || query) && (
          <button
            onClick={() => { setModelFilter('all'); setStatusFilter('all'); setQuery(''); }}
            style={{ ...selectStyle, cursor: 'pointer' }}
          >
            {t('activity.table.filter.clear')}
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <div style={{ padding: 18 }}>
          <EmptyState>{t('activity.table.empty')}</EmptyState>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 18 }}>
          <EmptyState>{loading ? t('common.loading') : t('activity.table.noMatch')}</EmptyState>
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 860 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: HISTORY_GRID, gap: 10,
                padding: '10px 18px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
              }}>
                {[t('activity.table.col.datetime'), t('activity.table.col.model'), t('activity.table.col.apiKey'), t('activity.table.col.tokens'), t('activity.table.col.latency'), t('activity.table.col.cost'), t('activity.table.col.status'), ''].map((h, i) => (
                  <Caption key={i} style={{ fontSize: 9 }}>{h}</Caption>
                ))}
              </div>

              {shown.map((record) => {
                const meta = modelMeta(record.modelId);
                const provider = PROVIDERS[meta.provider] || null;
                const t = recordTokens(record);
                const usd = usdFor(record, tlRate);
                const tl = Number(record.costTL || 0);
                const expanded = expandedId === record.id;
                const keyLabel = record.apiKeyName || record.apiKeyMasked || '—';
                return (
                  <div key={record.id} style={{ display: 'contents' }}>
                    <div
                      onClick={() => setExpandedId(expanded ? null : record.id)}
                      style={{
                        display: 'grid', gridTemplateColumns: HISTORY_GRID, gap: 10,
                        padding: '12px 18px', borderBottom: '1px solid var(--border)',
                        alignItems: 'center', fontSize: 12, cursor: 'pointer',
                        background: expanded ? 'var(--surface-2)' : 'transparent',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 10.5 }}>{formatLogDateTime(record.timestamp)}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 2, background: provider?.color || 'var(--ink-3)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label || record.modelId}</span>
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{keyLabel}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }} className="tnum">
                        {fmt.num(t.inputUsage)}+{fmt.num(t.outputUsage)}
                        {t.cacheRead > 0 && (
                          <span style={{ fontSize: 9.5, color: 'var(--ink-4)', display: 'block' }}>cache {fmt.num(t.cacheRead)}</span>
                        )}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)' }} className="tnum">{record.responseMs ? `${record.responseMs}ms` : '—'}</span>
                      <span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }} className="tnum">₺{tl.toFixed(4)}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-4)', display: 'block' }} className="tnum">${usd.toFixed(6)}</span>
                      </span>
                      <StatusBadge status={record.status} />
                      <span style={{ display: 'grid', placeItems: 'center', color: 'var(--ink-3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                        <I.Chevron size={14} />
                      </span>
                    </div>
                    {expanded && <ExpandedDetail record={record} tlRate={tlRate} />}
                  </div>
                );
              })}
            </div>
          </div>

          {filtered.length > visible && (
            <div style={{ padding: 14, display: 'grid', placeItems: 'center' }}>
              <button
                onClick={() => setVisible((v) => v + 25)}
                style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
              >
                {t('activity.table.loadMore', { remaining: fmt.num(filtered.length - visible) })}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

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
  const { t } = useT();
  const { tweaks } = ctx;
  const tlRate = tweaks.tlRate || 0;
  const [range, setRange] = useState('day');
  const [records, setRecords] = useState(EMPTY_ACTIVITY);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
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
          setError(err?.message || t('activity.error.loadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Sunucu-tarafı agregat (tüm geçmiş, 200-cap YOK): grafikler + tam KPI'lar.
  // Aralık değişince yeniden çekilir; monthToDate her zaman güncel takvim ayı.
  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    apiJson(`/api/user/usage-stats?window=${range}`)
      .then((data) => { if (!cancelled) setStats(data && typeof data === 'object' ? data : null); })
      .catch(() => { if (!cancelled) setStats(null); })
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const now = new Date();
  const filtered = useMemo(() => {
    const cutoff = range === 'hour'
      ? now.getTime() - 3600000
      : range === 'week'
        ? now.getTime() - 7 * 86400000
        : range === 'month'
          ? now.getTime() - 30 * 86400000
          : now.getTime() - 24 * 3600000;
    return records.filter((record) => {
      const date = toDate(record.timestamp);
      return date ? date.getTime() >= cutoff : false;
    });
  }, [now, range, records]);

  const monthSpend = useMemo(() => {
    const monthStart = startOfMonth(now).getTime();
    let tl = 0;
    let usd = 0;
    records.forEach((record) => {
      const date = toDate(record.timestamp);
      if (!date || date.getTime() < monthStart) return;
      tl += Number(record.costTL || 0);
      usd += usdFor(record, tlRate);
    });
    return { tl, usd };
  }, [now, records, tlRate]);

  const tokenTotals = useMemo(() => {
    return filtered.reduce((acc, record) => {
      const t = recordTokens(record);
      acc.input += t.inputUsage;
      acc.output += t.outputUsage;
      acc.cache += t.cacheRead + t.cacheCreate;
      return acc;
    }, { input: 0, output: 0, cache: 0 });
  }, [filtered]);

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
  const rangeLabel = t(`activity.rangeLabel.${range}`);
  const totalTokensInRange = tokenTotals.input + tokenTotals.output;

  // — Tam-geçmiş agregatları (usage-stats); yoksa 200-cap'li records'a düş —
  const ov = stats?.overview || null;
  const monthAgg = stats?.monthToDate || null;
  const kpiRequests = ov ? ov.requestCount : total;
  const kpiTokens = ov ? ov.totalTokens : totalTokensInRange;
  const kpiInput = ov ? ov.inputTokens : tokenTotals.input;
  const kpiOutput = ov ? ov.outputTokens : tokenTotals.output;
  const kpiCache = ov ? ov.cacheTokens : tokenTotals.cache;
  const monthUsd = monthAgg ? monthAgg.costUsd : monthSpend.usd;
  const monthTl = monthAgg ? monthAgg.costTL : monthSpend.tl;
  const hasSeries = !!(stats && stats.timeseries && stats.timeseries.length);
  const hasStatsData = !!(ov && ov.requestCount > 0);
  const modelBar = useMemo(
    () => (stats?.models || []).slice(0, 8).map((m) => ({
      shortName: (modelMeta(m.id).label || m.name || m.id).slice(0, 22),
      requestCount: m.requestCount,
    })),
    [stats],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Caption>{t('activity.header.caption')}</Caption>
          <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8, margin: '6px 0 6px' }}>
            {t('activity.header.title')} <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>{t('activity.header.titleAccent')}</span>
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>
            {t('activity.header.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          {[['hour', t('activity.range.hour')], ['day', t('activity.range.day')], ['week', t('activity.range.week')], ['month', t('activity.range.month')]].map(([key, label]) => (
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
        <ActKPI label={t('activity.kpi.requests.label')} value={kpiRequests} delta={(loading || statsLoading) ? t('activity.kpi.requests.loading') : t('activity.kpi.requests.delta', { rangeLabel })} />
        <ActKPI label={t('activity.kpi.tokens.label')} value={kpiTokens} delta={kpiCache > 0 ? t('activity.kpi.tokens.deltaCache', { cache: fmt.num(kpiCache), rangeLabel }) : t('activity.kpi.tokens.deltaNoCache', { input: fmt.num(kpiInput), output: fmt.num(kpiOutput) })} />
        <ActKPI label={t('activity.kpi.latency.label')} value={avgLatency} unit="ms" delta={total ? t('activity.kpi.latency.measured', { total }) : t('activity.kpi.latency.none')} />
        <ActKPI label={t('activity.kpi.spend.label')} value={monthUsd} unit="$" delta={`≈ ₺${Number(monthTl).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} decimals={2} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <Card pad={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('activity.chart.latency.title')}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{t('activity.chart.latency.subtitle', { rangeLabel })}</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-2)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent)' }} />
                {t('activity.chart.latency.legend')}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 2, background: 'var(--warn)' }} />
                p50
              </span>
            </div>
          </div>
          {total === 0 && !loading ? (
            <EmptyState>{t('activity.chart.latency.empty')}</EmptyState>
          ) : (
            <LatencyChart points={latencyPoints} p50={p50} />
          )}
        </Card>

        <Card pad={20}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t('activity.card.provider.title')}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, marginBottom: 16 }}>
            {t('activity.card.provider.subtitle')}
          </div>
          <div style={{ display: 'grid', placeItems: 'center', marginBottom: 16 }}>
            <ProviderDonut counts={byProvider} total={total} />
          </div>
          {total === 0 ? (
            <EmptyState>{t('activity.card.provider.empty')}</EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxHeight: 200, overflow: 'auto' }}>
              {byProvider.slice(0, 6).map(({ provider, count }) => (
                <DistRow key={provider} provider={provider} count={count} total={total} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {hasStatsData ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
            <StatSection title={t('activity.chart.cost.title')} sub={t('activity.chart.cost.subtitle', { rangeLabel })}>
              {hasSeries ? (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={stats.timeseries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={22} />
                      <YAxis yAxisId="tl" tick={{ fontSize: 10 }} width={50} />
                      <YAxis yAxisId="usd" orientation="right" tick={{ fontSize: 10 }} width={50} />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="tl" type="monotone" dataKey="costTL" stroke="#7c3aed" strokeWidth={2} name={t('activity.chart.cost.lineTL')} dot={false} />
                      <Line yAxisId="usd" type="monotone" dataKey="costUsd" stroke="#10a37f" strokeWidth={1.8} name={t('activity.chart.cost.lineUSD')} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState>{t('activity.chart.cost.empty')}</EmptyState>}
            </StatSection>

            <StatSection title={t('activity.chart.tokens.title')} sub={t('activity.chart.tokens.subtitle', { rangeLabel })}>
              {hasSeries ? (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={stats.timeseries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={22} />
                      <YAxis tick={{ fontSize: 10 }} width={50} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="inputTokens" stroke="#2563eb" strokeWidth={2} name={t('activity.chart.tokens.input')} dot={false} />
                      <Line type="monotone" dataKey="outputTokens" stroke="#f59e0b" strokeWidth={2} name={t('activity.chart.tokens.output')} dot={false} />
                      <Line type="monotone" dataKey="cacheTokens" stroke="#0ea5e9" strokeWidth={1.6} name={t('activity.chart.tokens.cache')} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState>{t('activity.chart.tokens.empty')}</EmptyState>}
            </StatSection>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
            <StatSection title={t('activity.chart.successError.title')} sub={t('activity.chart.successError.subtitle', { rangeLabel })}>
              {hasSeries ? (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={stats.timeseries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={22} />
                      <YAxis tick={{ fontSize: 10 }} width={40} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="successCount" stackId="a" fill="#10a37f" name={t('activity.chart.successError.success')} />
                      <Bar dataKey="errorCount" stackId="a" fill="#ef4444" name={t('activity.chart.successError.error')} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState>{t('activity.chart.successError.empty')}</EmptyState>}
            </StatSection>

            <StatSection title={t('activity.chart.topModels.title')} sub={t('activity.chart.topModels.sub')}>
              {modelBar.length ? (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart layout="vertical" data={modelBar} margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                      <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="shortName" width={130} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="requestCount" fill="#2563eb" name={t('activity.chart.topModels.bar')} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState>{t('activity.chart.topModels.empty')}</EmptyState>}
            </StatSection>
          </div>

          <StatSection title={t('activity.section.heatgrid.title')} sub={t('activity.section.heatgrid.subtitle', { rangeLabel })}>
            {hasSeries ? <StatHeatGrid rows={stats.timeseries} /> : <EmptyState>{t('activity.section.heatgrid.empty')}</EmptyState>}
          </StatSection>

          <Card pad={0} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('activity.modelTable.title')}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{t('activity.modelTable.subtitle', { rangeLabel })}</div>
            </div>
            {stats.models && stats.models.length ? (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 66px 62px 84px 92px 92px 70px', gap: 10, padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <Caption>{t('activity.modelTable.col.model')}</Caption><Caption>{t('activity.modelTable.col.requests')}</Caption><Caption>{t('activity.modelTable.col.share')}</Caption><Caption>{t('activity.modelTable.col.tokens')}</Caption><Caption>{t('activity.modelTable.col.costTL')}</Caption><Caption>{t('activity.modelTable.col.costUSD')}</Caption><Caption>{t('activity.modelTable.col.costShare')}</Caption>
                </div>
                {stats.models.slice(0, 20).map((m) => (
                  <div key={m.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 66px 62px 84px 92px 92px 70px', gap: 10, padding: '0 16px' }}>
                    <div style={statCell}>
                      <div style={{ fontWeight: 600 }}>{modelMeta(m.id).label || m.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{m.id}</div>
                    </div>
                    <div className="tnum" style={statCell}>{fmt.num(m.requestCount)}</div>
                    <div className="tnum" style={statCell}>{m.trafficSharePct}%</div>
                    <div className="tnum" style={statCell}>{fmt.num(m.totalTokens)}</div>
                    <div className="tnum" style={statCell}>₺{Number(m.costTL).toFixed(2)}</div>
                    <div className="tnum" style={statCell}>${Number(m.costUsd).toFixed(4)}</div>
                    <div className="tnum" style={statCell}>{m.costSharePct}%</div>
                  </div>
                ))}
              </div>
            ) : <div style={{ padding: 16 }}><EmptyState>{t('activity.modelTable.empty')}</EmptyState></div>}
          </Card>
        </>
      ) : null}

      <UsageHistoryTable records={records} tlRate={tlRate} loading={loading} />
    </div>
  );
};

export { ActivityTab };
