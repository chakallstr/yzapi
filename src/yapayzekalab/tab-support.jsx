import { useEffect, useState } from 'react';
import { Card, Caption } from './shared.jsx';

export function SupportTab() {
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
      <Caption>Destek</Caption>
      <Card pad={16}>
        <p style={{ color: 'var(--ink-2)', marginTop: 0 }}>
          Hesap, ödeme, paket teslimatı ve teknik destek için aşağıdaki kanallardan bize ulaşın.
          Ekibimiz mesajınızı inceleyip en kısa sürede dönüş yapar.
        </p>
        {loaded && channels.length === 0 && (
          <div style={{ color: 'var(--ink-3)' }}>Destek kanalı henüz tanımlı değil.</div>
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
