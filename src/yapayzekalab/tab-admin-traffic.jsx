import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { I, Card, Chip, Caption, modelMeta, fmt, useCountUp } from './shared.jsx';

const TRAFFIC_WINDOWS = [
  { id: '24h', label: '24 saat' },
  { id: '7d', label: '7 gün' },
  { id: '30d', label: '30 gün' },
];

const adminRequest = async (path, token) => {
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `Admin isteği başarısız (${response.status})`);
  }
  return body;
};

const panelGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 14,
};

const chartCardStyle = { minHeight: 320, overflow: 'hidden' };

const trafficTableCell = { padding: '10px 12px', fontSize: 11.5, borderBottom: '1px solid var(--border)' };

const ErrorBox = ({ children }) => (
  <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: 12 }}>
    {children}
  </div>
);

const EmptyState = ({ children = 'Kayıt yok.' }) => (
  <div style={{ padding: 18, borderRadius: 12, border: '1px dashed var(--border)', color: 'var(--ink-3)', fontSize: 12 }}>
    {children}
  </div>
);

const MetricCard = ({ label, value, sub, decimals = 0, icon: Icon }) => {
  const n = useCountUp(Number(value || 0), { duration: 850, decimals });
  return (
    <Card pad={18}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <Caption>{label}</Caption>
        {Icon ? (
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-bg)', display: 'grid', placeItems: 'center' }}>
            <Icon size={14} stroke="var(--accent-ink)" />
          </div>
        ) : null}
      </div>
      <div className="tnum" style={{ fontSize: 28, fontWeight: 600, letterSpacing: -1, marginTop: 10 }}>
        {decimals ? Number(n).toFixed(decimals) : fmt.num(Math.round(n))}
      </div>
      {sub ? <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{sub}</div> : null}
    </Card>
  );
};

const SectionCard = ({ title, sub, children, right }) => (
  <Card pad={0} style={{ overflow: 'hidden', ...chartCardStyle }}>
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {sub ? <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{sub}</div> : null}
      </div>
      {right}
    </div>
    <div style={{ padding: 14 }}>{children}</div>
  </Card>
);

const HeatGrid = ({ rows }) => {
  const max = Math.max(...rows.map((row) => row.requestCount || 0), 1);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: 8 }}>
      {rows.map((row) => {
        const intensity = Math.max(0.12, (row.requestCount || 0) / max);
        return (
          <div
            key={row.bucketStart}
            style={{
              borderRadius: 12,
              padding: '12px 10px',
              border: '1px solid var(--border)',
              background: `rgba(59,130,246,${Math.min(0.82, intensity)})`,
              color: intensity > 0.55 ? '#fff' : 'var(--ink)',
            }}
          >
            <div style={{ fontSize: 10.5, opacity: intensity > 0.55 ? 0.92 : 0.72 }}>{row.label}</div>
            <div className="tnum" style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{fmt.num(row.requestCount || 0)}</div>
            <div style={{ fontSize: 10.5, marginTop: 4 }}>hata {fmt.num(row.errorCount || 0)}</div>
          </div>
        );
      })}
    </div>
  );
};

const TableCard = ({ title, sub, columns, rows, empty, renderRow }) => (
  <Card pad={0} style={{ overflow: 'hidden' }}>
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      {sub ? <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{sub}</div> : null}
    </div>
    {!rows.length ? (
      <div style={{ padding: 16 }}><EmptyState>{empty}</EmptyState></div>
    ) : (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 10, padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
          {renderRow('header')}
        </div>
        {rows.map((row, index) => (
          <div key={row.id || row.userId || row.apiKeyId || row.modelId || row.provider || index} style={{ display: 'grid', gridTemplateColumns: columns, gap: 10, padding: '0 16px' }}>
            {renderRow(row, index)}
          </div>
        ))}
      </>
    )}
  </Card>
);

function trafficColor(index) {
  const palette = ['#2563eb', '#10a37f', '#c2693a', '#7c3aed', '#ef4444', '#f59e0b', '#0ea5e9', '#059669'];
  return palette[index % palette.length];
}

const formatTopModels = (topModels = []) => topModels.map((item) => item.label).join(', ') || '—';

const formatTopProvider = (topProvider) => topProvider?.provider || '—';

function toPieData(rows, key, nameKey) {
  return rows.slice(0, 6).map((row, index) => ({
    name: row[nameKey],
    value: row[key],
    fill: trafficColor(index),
  }));
}

const AdminTrafficAnalytics = ({ token, onOpenUser, onOpenApiKeys }) => {
  const [windowId, setWindowId] = useState('24h');
  const [data, setData] = useState({
    overview: null,
    timeseries: [],
    models: [],
    providers: [],
    users: [],
    apiKeys: [],
    errors: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');

  const fetchTraffic = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const payload = await adminRequest(`/api/admin/traffic?window=${windowId}`, token);
      setData(payload);
      setLastUpdatedAt(new Date().toISOString());
    } catch (nextError) {
      setError(nextError.message || 'Trafik analitiği alınamadı.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTraffic();
  }, [token, windowId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchTraffic(true);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [token, windowId]);

  const overview = data.overview || {};
  const topUsersByCost = useMemo(() => [...(data.users || [])].sort((a, b) => b.totalCostTL - a.totalCostTL).slice(0, 20), [data.users]);
  const topModelsByCost = useMemo(() => [...(data.models || [])].sort((a, b) => b.costTL - a.costTL).slice(0, 20), [data.models]);
  const providerPie = useMemo(() => toPieData(data.providers || [], 'requestCount', 'name'), [data.providers]);
  const modelBar = useMemo(() => (data.models || []).slice(0, 8).map((row) => ({ ...row, shortName: row.name })), [data.models]);
  const anomalyCount =
    (data.errors?.anomalies?.requestSpikes?.length || 0) +
    (data.errors?.anomalies?.userTokenSpikes?.length || 0) +
    (data.errors?.anomalies?.apiKeyErrorSpikes?.length || 0) +
    (data.errors?.anomalies?.expensiveModelSpikes?.length || 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Caption>Trafik analitiği</Caption>
          <h3 style={{ fontSize: 24, fontWeight: 600, margin: '6px 0 4px' }}>
            Kullanım, <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>maliyet ve hata akışı</span>
          </h3>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            Son yenileme: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString('tr-TR') : '—'} · 60 sn otomatik yenileme
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip tone="neutral" style={{ fontSize: 10.5 }}>{windowId}</Chip>
          {TRAFFIC_WINDOWS.map((option) => {
            const active = option.id === windowId;
            return (
              <button
                key={option.id}
                onClick={() => setWindowId(option.id)}
                style={{
                  padding: '8px 11px',
                  borderRadius: 9,
                  border: active ? '1px solid var(--ink)' : '1px solid var(--border)',
                  background: active ? 'var(--ink)' : 'var(--surface)',
                  color: active ? '#fff' : 'var(--ink-2)',
                  fontSize: 11.5,
                }}
              >
                {option.label}
              </button>
            );
          })}
          <button onClick={() => fetchTraffic()} style={{ padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12 }}>
            <I.Refresh size={13} /> Yenile
          </button>
        </div>
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Trafik verisi yükleniyor…</div>}
      {error && <ErrorBox>{error}</ErrorBox>}

      <div style={panelGrid}>
        <MetricCard label="Toplam istek" value={overview.totalRequests || 0} icon={I.Activity} />
        <MetricCard label="Aktif kullanıcı" value={overview.activeUserCount || 0} icon={I.Users} />
        <MetricCard label="Aktif API key" value={overview.activeApiKeyCount || 0} icon={I.Key} />
        <MetricCard label="Toplam token" value={overview.totalTokens || 0} icon={I.Text} />
        <MetricCard label="Toplam maliyet TL" value={overview.totalCostTL || 0} decimals={2} icon={I.Wallet} />
        <MetricCard label="Ort. cevap süresi" value={overview.averageResponseMs || 0} icon={I.Clock} sub="ms" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 18 }}>
        <SectionCard title="İstek hacmi zaman serisi" sub="İstek, başarı ve hata akışı">
          {data.timeseries?.length ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={data.timeseries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="requestCount" stroke="#2563eb" strokeWidth={2} name="İstek" dot={false} />
                  <Line type="monotone" dataKey="successCount" stroke="#10a37f" strokeWidth={2} name="Başarılı" dot={false} />
                  <Line type="monotone" dataKey="errorCount" stroke="#ef4444" strokeWidth={2} name="Hata" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState>Zaman serisi yok.</EmptyState>}
        </SectionCard>

        <SectionCard title="Sağlayıcı dağılımı" sub="Trafiğin provider bazlı payı">
          {providerPie.length ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={providerPie} dataKey="value" nameKey="name" innerRadius={54} outerRadius={88} paddingAngle={2}>
                    {providerPie.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState>Provider verisi yok.</EmptyState>}
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
        <SectionCard title="Maliyet zaman serisi" sub="TL bazında tüketim akışı">
          {data.timeseries?.length ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={data.timeseries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="costTL" stroke="#7c3aed" strokeWidth={2} name="Maliyet TL" dot={false} />
                  <Line type="monotone" dataKey="creditsTL" stroke="#10a37f" strokeWidth={1.8} name="Yükleme TL" dot={false} />
                  <Line type="monotone" dataKey="debitsTL" stroke="#ef4444" strokeWidth={1.8} name="Düşüm TL" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState>Maliyet akışı yok.</EmptyState>}
        </SectionCard>

        <SectionCard title="Token tüketimi" sub="Input + output toplam token akışı">
          {data.timeseries?.length ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={data.timeseries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="inputTokens" stroke="#2563eb" strokeWidth={2} name="Input" dot={false} />
                  <Line type="monotone" dataKey="outputTokens" stroke="#f59e0b" strokeWidth={2} name="Output" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState>Token akışı yok.</EmptyState>}
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
        <SectionCard title="Başarı / hata dağılımı" sub="Her bucket içindeki sonuç oranı">
          {data.timeseries?.length ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={data.timeseries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="successCount" stackId="a" fill="#10a37f" name="Başarılı" />
                  <Bar dataKey="errorCount" stackId="a" fill="#ef4444" name="Hata" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState>Sonuç verisi yok.</EmptyState>}
        </SectionCard>

        <SectionCard title="En çok kullanılan modeller" sub="İstek sayısına göre ilk 8 model">
          {modelBar.length ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart layout="vertical" data={modelBar}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="shortName" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="requestCount" fill="#2563eb" name="İstek" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState>Model verisi yok.</EmptyState>}
        </SectionCard>
      </div>

      <SectionCard title="Saat / gün yoğunluk ısı görünümü" sub="Hangi bucket’ta trafik sıçrıyor">
        {data.timeseries?.length ? <HeatGrid rows={data.timeseries} /> : <EmptyState>Yoğunluk verisi yok.</EmptyState>}
      </SectionCard>

      <div style={panelGrid}>
        <TableCard
          title="En çok kullanan 20 kullanıcı"
          sub="İstek adedine göre"
          columns="minmax(180px, 1fr) 90px 110px 90px 120px"
          rows={(data.users || []).slice(0, 20)}
          empty="Kullanıcı verisi yok."
          renderRow={(row) => row === 'header'
            ? [<Caption key="1">Kullanıcı</Caption>, <Caption key="2">İstek</Caption>, <Caption key="3">Token</Caption>, <Caption key="4">Hata</Caption>, <Caption key="5">İşlem</Caption>]
            : [
                <div key="1" style={trafficTableCell}><div style={{ fontWeight: 600 }}>{row.adSoyad || row.email}</div><div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{row.userCode} · {row.email}</div></div>,
                <div key="2" className="tnum" style={trafficTableCell}>{fmt.num(row.requestCount)}</div>,
                <div key="3" className="tnum" style={trafficTableCell}>{fmt.num(row.totalTokens)}</div>,
                <div key="4" className="tnum" style={trafficTableCell}>{fmt.num(row.errorCount)}</div>,
                <div key="5" style={trafficTableCell}><button onClick={() => onOpenUser?.(row)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>Detaya git</button></div>,
              ]}
        />

        <TableCard
          title="En maliyetli 20 kullanıcı"
          sub="TL maliyetine göre"
          columns="minmax(180px, 1fr) 110px 120px 120px"
          rows={topUsersByCost}
          empty="Maliyet verisi yok."
          renderRow={(row) => row === 'header'
            ? [<Caption key="1">Kullanıcı</Caption>, <Caption key="2">Maliyet TL</Caption>, <Caption key="3">Top modeller</Caption>, <Caption key="4">İşlem</Caption>]
            : [
                <div key="1" style={trafficTableCell}><div style={{ fontWeight: 600 }}>{row.adSoyad || row.email}</div><div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{row.userCode}</div></div>,
                <div key="2" className="tnum" style={trafficTableCell}>₺{Number(row.totalCostTL).toFixed(2)}</div>,
                <div key="3" style={trafficTableCell}>{formatTopModels(row.topModels)}</div>,
                <div key="4" style={trafficTableCell}><button onClick={() => onOpenUser?.(row)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>Detaya git</button></div>,
              ]}
        />

        <TableCard
          title="En çok kullanılan 20 model"
          sub="Trafik payı ve token oranı"
          columns="minmax(180px, 1fr) 90px 90px 90px 90px"
          rows={(data.models || []).slice(0, 20)}
          empty="Model verisi yok."
          renderRow={(row) => row === 'header'
            ? [<Caption key="1">Model</Caption>, <Caption key="2">İstek</Caption>, <Caption key="3">Pay %</Caption>, <Caption key="4">Token %</Caption>, <Caption key="5">Sağlayıcı</Caption>]
            : [
                <div key="1" style={trafficTableCell}><div style={{ fontWeight: 600 }}>{row.name}</div><div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{row.id}</div></div>,
                <div key="2" className="tnum" style={trafficTableCell}>{fmt.num(row.requestCount)}</div>,
                <div key="3" className="tnum" style={trafficTableCell}>{row.trafficSharePct}%</div>,
                <div key="4" className="tnum" style={trafficTableCell}>{row.tokenSharePct}%</div>,
                <div key="5" style={trafficTableCell}><Chip tone="neutral">{row.provider}</Chip></div>,
              ]}
        />

        <TableCard
          title="En pahalı 20 model"
          sub="TL maliyetine göre"
          columns="minmax(180px, 1fr) 110px 90px 90px 90px"
          rows={topModelsByCost}
          empty="Model maliyet verisi yok."
          renderRow={(row) => row === 'header'
            ? [<Caption key="1">Model</Caption>, <Caption key="2">Maliyet TL</Caption>, <Caption key="3">İstek</Caption>, <Caption key="4">Kullanıcı</Caption>, <Caption key="5">Hata %</Caption>]
            : [
                <div key="1" style={trafficTableCell}><div style={{ fontWeight: 600 }}>{row.name}</div><div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{row.id}</div></div>,
                <div key="2" className="tnum" style={trafficTableCell}>₺{Number(row.costTL).toFixed(2)}</div>,
                <div key="3" className="tnum" style={trafficTableCell}>{fmt.num(row.requestCount)}</div>,
                <div key="4" className="tnum" style={trafficTableCell}>{fmt.num(row.uniqueUsers)}</div>,
                <div key="5" className="tnum" style={trafficTableCell}>{100 - row.successRate}%</div>,
              ]}
        />

        <TableCard
          title="En yoğun 20 API key"
          sub="Key bazında istek ve maliyet"
          columns="minmax(180px, 1fr) 90px 110px 110px 120px"
          rows={(data.apiKeys || []).slice(0, 20)}
          empty="API key verisi yok."
          renderRow={(row) => row === 'header'
            ? [<Caption key="1">API key</Caption>, <Caption key="2">İstek</Caption>, <Caption key="3">Maliyet TL</Caption>, <Caption key="4">Top model</Caption>, <Caption key="5">İşlem</Caption>]
            : [
                <div key="1" style={trafficTableCell}><div style={{ fontWeight: 600 }}>{row.ad || row.maskedKey}</div><div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{row.maskedKey}</div></div>,
                <div key="2" className="tnum" style={trafficTableCell}>{fmt.num(row.requestCount)}</div>,
                <div key="3" className="tnum" style={trafficTableCell}>₺{Number(row.totalCostTL).toFixed(2)}</div>,
                <div key="4" style={trafficTableCell}>{formatTopModels(row.topModels)}</div>,
                <div key="5" style={trafficTableCell}><button onClick={() => onOpenApiKeys?.(row)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>API key git</button></div>,
              ]}
        />

        <TableCard
          title="Son 50 hatalı istek"
          sub={`Hata oranı %${data.errors?.failureRate || 0} · anomali ${anomalyCount}`}
          columns="minmax(180px, 1fr) 110px 100px 100px 120px"
          rows={(data.errors?.recent || []).slice(0, 50)}
          empty="Hatalı istek yok."
          renderRow={(row) => row === 'header'
            ? [<Caption key="1">İstek</Caption>, <Caption key="2">Hata</Caption>, <Caption key="3">Sağlayıcı</Caption>, <Caption key="4">Süre</Caption>, <Caption key="5">Kullanıcı</Caption>]
            : [
                <div key="1" style={trafficTableCell}><div style={{ fontWeight: 600 }}>{modelMeta(row.modelId).label}</div><div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{row.requestId || row.id}</div></div>,
                <div key="2" style={trafficTableCell}>{row.errorCode || row.status}</div>,
                <div key="3" style={trafficTableCell}><Chip tone="neutral">{row.provider}</Chip></div>,
                <div key="4" className="tnum" style={trafficTableCell}>{fmt.num(row.responseMs || 0)} ms</div>,
                <div key="5" style={trafficTableCell}><button onClick={() => onOpenUser?.(row)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>Kullanıcı</button></div>,
              ]}
        />
      </div>
    </div>
  );
};

export { AdminTrafficAnalytics };
