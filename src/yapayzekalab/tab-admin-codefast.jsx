import { useCallback, useEffect, useState } from 'react';
import { I, Card, Caption, Chip } from './shared.jsx';
import { authFetch } from './auth-client.js';

const fmtTL = (v) => v == null ? '—' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const adminGet = async (path, token) => {
  const r = await authFetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const t = await r.text(); const b = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(b?.error || `İstek başarısız (${r.status})`);
  return b;
};
const adminPost = async (path, body, token) => {
  const r = await authFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const t = await r.text(); const b = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(b?.error || `İstek başarısız (${r.status})`);
  return b;
};

export function AdminCodefast({ token }) {
  const [packages, setPackages] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyInputs, setKeyInputs] = useState({}); // entitlementId → cf_rc_live_ key
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [pk, pd] = await Promise.all([
        adminGet('/api/admin/codefast/packages', token),
        adminGet('/api/admin/codefast/pending-manual', token),
      ]);
      setPackages(pk?.packages || []);
      setPending(pd?.pending || []);
    } catch (e) { setError(e.message || 'Yükleme hatası'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const deliver = async (entitlementId) => {
    const key = (keyInputs[entitlementId] || '').trim();
    if (!key) { setError('cf_rc_live_ keyi girin'); return; }
    setBusy(entitlementId); setError('');
    try {
      await adminPost(`/api/admin/codefast/entitlements/${entitlementId}/deliver-manual`, { customerApiKey: key }, token);
      setKeyInputs((s) => ({ ...s, [entitlementId]: '' }));
      await load();
    } catch (e) { setError(e.message || 'Teslim hatası'); }
    finally { setBusy(''); }
  };

  if (loading) return <Card pad={16}><Caption>CodeFast verisi yükleniyor…</Caption></Card>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <Card pad={12} style={{ borderColor: '#f87171', color: '#f87171' }}>{error}</Card>}

      <Card pad={16}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 650 }}>CodeFast Paketleri (alış / satış / marj)</div>
          <button onClick={load} style={{ fontSize: 12 }}>Yenile</button>
        </div>
        <Caption>Satış fiyatını paket düzenleme ekranından değiştir (1:1 ayna varsayılan). Alış = liste × 0,90.</Caption>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--ink-3)' }}>
              <th style={{ padding: '6px 8px' }}>Paket</th><th>Slug</th><th>Tip</th>
              <th>Alış ₺</th><th>Satış ₺</th><th>Marj</th><th>Durum</th>
            </tr></thead>
            <tbody>
              {packages.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>{p.ad}</td>
                  <td>{p.slug}</td>
                  <td>{p.manual ? <Chip>MANUEL</Chip> : <Chip>oto</Chip>}</td>
                  <td>{fmtTL(p.alisTl)}</td>
                  <td>{fmtTL(p.satisTl)}</td>
                  <td style={{ color: (p.marjPct ?? 0) >= 10 ? '#22c55e' : '#facc15' }}>
                    {p.marjTl == null ? '—' : `₺${fmtTL(p.marjTl)} (%${p.marjPct})`}
                  </td>
                  <td>{p.satista ? <Chip>satışta</Chip> : <Chip>yakında</Chip>}</td>
                </tr>
              ))}
              {!packages.length && <tr><td colSpan={7} style={{ padding: 12, color: 'var(--ink-3)' }}>CodeFast paketi yok (seed-codefast-packages.ts ile ekle).</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card pad={16}>
        <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 6 }}>Elle Teslim Kuyruğu (Claude)</div>
        <Caption>CodeFast admininin teslim ettiği cf_rc_live_ keyini buraya gir → müşteri erişimi aktifleşir.</Caption>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.map((e) => (
            <div key={e.entitlementId} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{e.paketAdi}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{e.email || e.userId} · {e.slug}</div>
              </div>
              <input
                placeholder="cf_rc_live_..."
                value={keyInputs[e.entitlementId] || ''}
                onChange={(ev) => setKeyInputs((s) => ({ ...s, [e.entitlementId]: ev.target.value }))}
                style={{ flex: 1, minWidth: 220, fontSize: 12, padding: '6px 8px' }}
              />
              <button disabled={busy === e.entitlementId} onClick={() => deliver(e.entitlementId)} style={{ fontSize: 12 }}>
                {busy === e.entitlementId ? '...' : 'Teslim et'}
              </button>
            </div>
          ))}
          {!pending.length && <Caption>Bekleyen elle teslim yok.</Caption>}
        </div>
      </Card>
    </div>
  );
}
