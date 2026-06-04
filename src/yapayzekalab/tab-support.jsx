import { useEffect, useState } from 'react';
import { Card, Caption } from './shared.jsx';
import { useT } from './i18n/index.jsx';

export function SupportTab() {
  const { t } = useT();
  const [channels, setChannels] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/support')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setChannels(d?.channels || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Caption>{t('support.heading')}</Caption>
      <Card pad={16}>
        <p style={{ color: 'var(--ink-2)', marginTop: 0 }}>
          {t('support.description')}
        </p>
        {loaded && channels.length === 0 && (
          <div style={{ color: 'var(--ink-3)' }}>{t('support.emptyState')}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {channels.map((c) => (
            <a
              key={c.kind}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', fontWeight: 600, maxWidth: 300 }}
            >
              {c.label} →
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
