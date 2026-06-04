import { useEffect, useState } from 'react';
import { Card, Chip, Caption } from './shared.jsx';
import { useT } from './i18n/index.jsx';

const STATUS_TONE = { ok: 'ok', degraded: 'warn', down: 'danger' };

function tone(v) { return STATUS_TONE[v] || 'neutral'; }
function fmtUptime(s) {
  const sec = Number(s) || 0;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d ? d + 'g ' : ''}${h}s ${m}d`;
}

export function StatusTab() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = () => {
    fetch('/status')
      .then((r) => r.json())
      .then((d) => { setData(d); setUpdatedAt(new Date()); setError(''); })
      .catch(() => setError(t('status.fetchError')));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const checks = data?.checks || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Caption>{t('status.title')}</Caption>
      {error && <div style={{ color: 'var(--danger, #e5484d)' }}>{error}</div>}

      <Card pad={16}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Chip tone={tone(data?.status)} style={{ fontSize: 14 }}>{data?.status ? t(`status.statusLabel_${data.status}`) || String(data.status) : '—'}</Chip>
          <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>
            {data ? t('status.uptimeSummary', { uptime: fmtUptime(data.uptimeSeconds), modelCount: data.modelCount ?? '—', version: data.version ?? '—' }) : t('status.loading')}
          </span>
          {updatedAt && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>{t('status.lastChecked', { time: updatedAt.toLocaleTimeString('tr-TR') })}</span>}
        </div>
      </Card>

      <Card pad={0} style={{ overflow: 'hidden' }}>
        {Object.keys(checks).length === 0 && <div style={{ padding: 16, color: 'var(--ink-3)' }}>{t('status.noCheckData')}</div>}
        {Object.entries(checks).map(([k, v], i, arr) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{t(`status.checkLabel_${k}`) || k}</span>
            <Chip tone={tone(v)}>{t(`status.statusLabel_${v}`) || String(v ?? '—')}</Chip>
          </div>
        ))}
      </Card>

      {data?.lastKurRefresh && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {t('status.lastKurRefresh', { datetime: new Date(data.lastKurRefresh).toLocaleString('tr-TR') })}
        </div>
      )}
    </div>
  );
}
