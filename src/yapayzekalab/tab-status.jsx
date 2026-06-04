import { useEffect, useState } from 'react';
import { Card, Chip, Caption } from './shared.jsx';

const STATUS_LABEL = { ok: 'Çalışıyor', degraded: 'Kısmi sorun', down: 'Çalışmıyor' };
const STATUS_TONE = { ok: 'ok', degraded: 'warn', down: 'danger' };
const CHECK_LABEL = { api: 'API', db: 'Veritabanı', aiProvider: 'AI Sağlayıcı' };

function tone(v) { return STATUS_TONE[v] || 'neutral'; }
function label(v) { return STATUS_LABEL[v] || String(v ?? '—'); }
function fmtUptime(s) {
  const sec = Number(s) || 0;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d ? d + 'g ' : ''}${h}s ${m}d`;
}

export function StatusTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = () => {
    fetch('/status')
      .then((r) => r.json())
      .then((d) => { setData(d); setUpdatedAt(new Date()); setError(''); })
      .catch(() => setError('Durum alınamadı.'));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const checks = data?.checks || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Caption>Sistem Durumu</Caption>
      {error && <div style={{ color: 'var(--danger, #e5484d)' }}>{error}</div>}

      <Card pad={16}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Chip tone={tone(data?.status)} style={{ fontSize: 14 }}>{label(data?.status)}</Chip>
          <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>
            {data ? `Çalışma süresi ${fmtUptime(data.uptimeSeconds)} · ${data.modelCount ?? '—'} model · v${data.version ?? '—'}` : 'Yükleniyor…'}
          </span>
          {updatedAt && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>Son kontrol: {updatedAt.toLocaleTimeString('tr-TR')}</span>}
        </div>
      </Card>

      <Card pad={0} style={{ overflow: 'hidden' }}>
        {Object.keys(checks).length === 0 && <div style={{ padding: 16, color: 'var(--ink-3)' }}>Kontrol verisi yok.</div>}
        {Object.entries(checks).map(([k, v], i, arr) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{CHECK_LABEL[k] || k}</span>
            <Chip tone={tone(v)}>{label(v)}</Chip>
          </div>
        ))}
      </Card>

      {data?.lastKurRefresh && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          Son kur güncelleme: {new Date(data.lastKurRefresh).toLocaleString('tr-TR')}
        </div>
      )}
    </div>
  );
}
