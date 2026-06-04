import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Chip, Caption } from './shared.jsx';
import { apiJson } from './auth-client.js';
import { useT } from './i18n/index.jsx';

export function PackagesTab() {
  const { t } = useT();
  const [packages, setPackages] = useState([]);
  const [ents, setEnts] = useState([]);
  const [cat, setCat] = useState('Tümü');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const keysRef = useRef({});
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState('');
  const [orders, setOrders] = useState([]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [pkgs, entitlements, dorders] = await Promise.all([
        fetch('/api/packages').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        apiJson('/api/user/entitlements').catch(() => []),
        apiJson('/api/user/delivery-orders').catch(() => []),
      ]);
      setPackages(Array.isArray(pkgs) ? pkgs : []);
      setEnts(Array.isArray(entitlements) ? entitlements : []);
      setOrders(Array.isArray(dorders) ? dorders : []);
    } catch (e) { setError(e.message || t('packages.errorLoadFailed')); }
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
    const pkg = packages.find((p) => p.id === id);
    let contact;
    if (pkg?.tip === 'account_delivery') {
      contact = window.prompt(t('packages.deliveryContactPrompt'), '');
      if (contact === null) return; // iptal
    }
    setBusyId(id); setError('');
    // Aynı satın alma niyeti için sabit idempotency key: retry'de aynı kalır (çift tahsil
    // önlenir), başarıda temizlenir → sonraki kasıtlı alım yeni key alır.
    const key = keysRef.current[id] || (keysRef.current[id] = (window.crypto?.randomUUID?.() || `${id}-${Date.now()}`));
    try {
      const r = await apiJson(`/api/user/packages/${encodeURIComponent(id)}/purchase`, {
        method: 'POST', headers: { 'Idempotency-Key': key }, body: contact ? { contact } : undefined,
      });
      delete keysRef.current[id];
      if (r?.tip === 'account_delivery') setRedeemMsg(t('packages.orderPlaced'));
      await load();
    } catch (e) {
      if (e.status === 402) setError(t('packages.errorInsufficientBalance'));
      else if (e.status === 401) setError(t('packages.errorLoginToBuy'));
      else setError(e.message || t('packages.errorBuyFailed'));
    } finally { setBusyId(''); }
  };

  const redeem = async () => {
    if (!code.trim()) return;
    setRedeeming(true); setRedeemMsg(''); setError('');
    try {
      const r = await apiJson('/api/user/redeem', { method: 'POST', body: { code: code.trim() } });
      setRedeemMsg(r.tip === 'balance' ? t('packages.redeemBalanceSuccess', { amount: r.amountTL }) : t('packages.redeemPackageSuccess'));
      setCode('');
      await load();
    } catch (e) {
      setRedeemMsg(e.status === 401 ? t('packages.errorLoginToRedeem') : (e.message || t('packages.errorRedeemFailed')));
    } finally { setRedeeming(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Caption>{t('packages.title')}</Caption>
      {error && <div style={{ color: 'var(--danger, #e5484d)' }}>{error}</div>}

      <Card pad={16}>
        <Caption>{t('packages.giftCodeTitle')}</Caption>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input placeholder={t('packages.codePlaceholder')} value={code} onChange={(e) => setCode(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <button disabled={redeeming} onClick={redeem}>{redeeming ? t('packages.redeeming') : t('packages.redeemBtn')}</button>
        </div>
        {redeemMsg && <div style={{ marginTop: 6, color: 'var(--ink-2)' }}>{redeemMsg}</div>}
      </Card>

      {ents.length > 0 && (
        <Card pad={16}>
          <Caption>{t('packages.myActivePackages')}</Caption>
          {ents.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', flexWrap: 'wrap' }}>
              <span>{e.paketAdi} <Chip>{e.kategori}</Chip></span>
              <span style={{ color: 'var(--ink-2)' }}>
                {t('packages.todayRemaining')}: {e.kalanBugun}/{e.gunlukLimit} · {t('packages.expiry')}: {new Date(e.expiresAt).toLocaleDateString('tr-TR')}
              </span>
            </div>
          ))}
        </Card>
      )}

      {orders.length > 0 && (
        <Card pad={16}>
          <Caption>{t('packages.myOrders')}</Caption>
          {orders.map((o) => (
            <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span>{o.paketAdi || o.packageId} <Chip>{o.durum}</Chip></span>
                <span style={{ color: 'var(--ink-2)' }}>₺{o.amountTL} · {new Date(o.olusturma).toLocaleDateString('tr-TR')}</span>
              </div>
              {o.durum === 'teslim_edildi' && o.teslimPayload && (
                <div style={{ marginTop: 4, fontSize: 13, background: 'var(--surface-2,#f5f5f7)', padding: '6px 10px', borderRadius: 8, whiteSpace: 'pre-wrap' }}>{o.teslimPayload}</div>
              )}
              {o.durum === 'bekliyor' && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-3)' }}>{t('packages.deliveryPending')}</div>}
              {o.durum === 'iptal' && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-3)' }}>{t('packages.orderCancelled')}</div>}
            </div>
          ))}
        </Card>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {categories.map(([c, n]) => (
          <button key={c} onClick={() => setCat(c)} style={{ fontWeight: cat === c ? 700 : 400 }}>{c === 'Tümü' ? t('common.all') : c} {n}</button>
        ))}
      </div>

      {loading ? <div>{t('common.loading')}</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {visible.map((p) => (
            <Card key={p.id} pad={16}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{p.ad}</strong><Chip>{p.kategori}</Chip>
              </div>
              <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>{p.aciklama}</p>
              <div style={{ fontSize: 13 }}>{t('packages.packageSpecs', { requests: p.gunlukIstekLimiti, days: p.sureGun })}</div>
              <div style={{ fontSize: 20, fontWeight: 700, margin: '8px 0' }}>₺{p.fiyatTL}</div>
              <button disabled={busyId === p.id} onClick={() => buy(p.id)}>
                {busyId === p.id ? t('packages.buying') : t('packages.buyBtn')}
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
