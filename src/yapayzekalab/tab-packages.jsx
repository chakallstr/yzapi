import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Chip, Caption } from './shared.jsx';
import { apiJson } from './auth-client.js';

export function PackagesTab() {
  const [packages, setPackages] = useState([]);
  const [ents, setEnts] = useState([]);
  const [cat, setCat] = useState('Tümü');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const keysRef = useRef({});

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [pkgs, entitlements] = await Promise.all([
        fetch('/api/packages').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        apiJson('/api/user/entitlements').catch(() => []),
      ]);
      setPackages(Array.isArray(pkgs) ? pkgs : []);
      setEnts(Array.isArray(entitlements) ? entitlements : []);
    } catch (e) { setError(e.message || 'Paketler alınamadı.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const categories = useMemo(() => {
    const counts = { 'Tümü': packages.length };
    packages.forEach((p) => { counts[p.kategori] = (counts[p.kategori] || 0) + 1; });
    return Object.entries(counts);
  }, [packages]);

  const visible = cat === 'Tümü' ? packages : packages.filter((p) => p.kategori === cat);

  const buy = async (id) => {
    setBusyId(id); setError('');
    // Aynı satın alma niyeti için sabit idempotency key: retry'de aynı kalır (çift tahsil
    // önlenir), başarıda temizlenir → sonraki kasıtlı alım yeni key alır.
    const key = keysRef.current[id] || (keysRef.current[id] = (window.crypto?.randomUUID?.() || `${id}-${Date.now()}`));
    try {
      await apiJson(`/api/user/packages/${encodeURIComponent(id)}/purchase`, { method: 'POST', headers: { 'Idempotency-Key': key } });
      delete keysRef.current[id];
      await load();
    } catch (e) {
      if (e.status === 402) setError('Yetersiz bakiye. Önce bakiye yükleyin.');
      else if (e.status === 401) setError('Satın almak için giriş yapın.');
      else setError(e.message || 'Satın alma başarısız.');
    } finally { setBusyId(''); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Caption>Paketler</Caption>
      {error && <div style={{ color: 'var(--danger, #e5484d)' }}>{error}</div>}

      {ents.length > 0 && (
        <Card pad={16}>
          <Caption>Aktif Paketlerim</Caption>
          {ents.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', flexWrap: 'wrap' }}>
              <span>{e.paketAdi} <Chip>{e.kategori}</Chip></span>
              <span style={{ color: 'var(--ink-2)' }}>
                Bugün kalan: {e.kalanBugun}/{e.gunlukLimit} · bitiş: {new Date(e.expiresAt).toLocaleDateString('tr-TR')}
              </span>
            </div>
          ))}
        </Card>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {categories.map(([c, n]) => (
          <button key={c} onClick={() => setCat(c)} style={{ fontWeight: cat === c ? 700 : 400 }}>{c} {n}</button>
        ))}
      </div>

      {loading ? <div>Yükleniyor…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {visible.map((p) => (
            <Card key={p.id} pad={16}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{p.ad}</strong><Chip>{p.kategori}</Chip>
              </div>
              <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>{p.aciklama}</p>
              <div style={{ fontSize: 13 }}>{p.gunlukIstekLimiti} istek/gün · {p.sureGun} gün</div>
              <div style={{ fontSize: 20, fontWeight: 700, margin: '8px 0' }}>₺{p.fiyatTL}</div>
              <button disabled={busyId === p.id} onClick={() => buy(p.id)}>
                {busyId === p.id ? 'Alınıyor…' : 'Bakiye ile al'}
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
