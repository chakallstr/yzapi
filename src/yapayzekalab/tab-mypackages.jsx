import { useEffect, useState, useCallback } from 'react';
import { Card, Caption, PulseDot, I, fmt } from './shared.jsx';
import { apiJson } from './auth-client.js';
import { useT } from './i18n/index.jsx';

/* ============================================
   MyPackagesTab — "Paketlerim": takip + duraklat + kullandığın kadar öde
   ============================================ */

const DURUM_META = {
  aktif:        { bg: '#dcfce7', fg: '#15803d' },
  duraklatildi: { bg: '#e0e7ff', fg: '#4338ca' },
  gunluk_doldu: { bg: '#fef3c7', fg: '#b45309' },
  tukendi:      { bg: '#fee2e2', fg: '#b91c1c' },
  suresi_doldu: { bg: '#e5e7eb', fg: '#4b5563' },
};

const safeDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
};

const isActiveDurum = (durum) => durum === 'aktif' || durum === 'duraklatildi' || durum === 'gunluk_doldu';

export function MyPackagesTab() {
  const { t } = useT();
  const [packages, setPackages] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(''); // entitlement id veya 'payg'
  const [notice, setNotice] = useState(null); // { type: 'ok'|'err', msg }

  const load = useCallback(async () => {
    setLoading(true);
    const [pkgs, meRes] = await Promise.all([
      apiJson('/api/user/packages').catch(() => []),
      apiJson('/api/user/me').catch(() => null),
    ]);
    setPackages(Array.isArray(pkgs) ? pkgs : []);
    setMe(meRes);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const paygOn = me?.paygMode === true;
  const balanceTL = Number(me?.bakiyeTL ?? 0);

  const togglePayg = async () => {
    setBusy('payg');
    try {
      await apiJson('/api/user/me', { method: 'PATCH', body: { paygMode: !paygOn } });
      await load();
    } catch { /* sessiz */ } finally { setBusy(''); }
  };

  const togglePause = async (ent) => {
    setBusy(ent.id);
    try {
      const action = ent.paused ? 'resume' : 'pause';
      await apiJson(`/api/user/entitlements/${encodeURIComponent(ent.id)}/${action}`, { method: 'POST' });
      await load();
    } catch { /* sessiz */ } finally { setBusy(''); }
  };

  // Paketimi Yenile — bakiyeden yeniden satın al (taze kota). Çift-tık: busy + Idempotency-Key.
  const renew = async (ent) => {
    if (typeof window !== 'undefined' && !window.confirm(t('mypackages.renewConfirm'))) return;
    setBusy(ent.id);
    setNotice(null);
    try {
      const key = (typeof window !== 'undefined' && window.crypto?.randomUUID)
        ? window.crypto.randomUUID()
        : `renew_${ent.id}_${Date.now()}`;
      await apiJson(`/api/user/entitlements/${encodeURIComponent(ent.id)}/renew`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
      });
      setNotice({ type: 'ok', msg: t('mypackages.renewOk') });
      await load();
    } catch (e) {
      const msg = e?.status === 402 ? t('mypackages.renewNoBalance') : (e?.message || t('mypackages.renewErr'));
      setNotice({ type: 'err', msg });
    } finally { setBusy(''); }
  };

  const active = packages.filter((p) => isActiveDurum(p.durum));
  const history = packages.filter((p) => !isActiveDurum(p.durum));

  const DurumBadge = ({ durum }) => {
    const m = DURUM_META[durum] || DURUM_META.suresi_doldu;
    return (
      <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: m.bg, color: m.fg }}>
        {t(`mypackages.status.${durum}`)}
      </span>
    );
  };

  const PackageRow = ({ p, last }) => {
    const limit = Number(p.gunlukLimit) || 0;
    const kalan = Number(p.kalan) || 0;
    const pct = limit > 0 ? Math.max(0, Math.min(100, (kalan / limit) * 100)) : 0;
    const canControl = isActiveDurum(p.durum); // sadece aktif/duraklatılmış pakette duraklat/devam
    return (
      <div style={{ padding: '14px', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.paketAdi}</div>
            <Caption>{p.kategori}</Caption>
          </div>
          <DurumBadge durum={p.durum} />
        </div>

        {limit > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ color: 'var(--ink-3)' }}>
                <span className="tnum" style={{ fontWeight: 700, color: 'var(--ink)' }}>{fmt.num(kalan)}</span>
                {' / '}{fmt.num(limit)} {t('mypackages.unitReq')} {t('mypackages.remaining')}
              </span>
              <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                {safeDate(p.activatedAt)} → {safeDate(p.expiresAt)}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: p.durum === 'aktif' ? 'var(--ok, #16a34a)' : 'var(--ink-3)', transition: 'width .3s' }} />
            </div>
          </div>
        )}

        {p.paused && <Caption style={{ marginTop: 6, color: '#b45309' }}>⏸ {t('mypackages.pausedNote')}</Caption>}

        {(canControl || p.renewable) && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canControl && (
              <button
                onClick={() => togglePause(p)}
                disabled={busy === p.id}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: p.paused ? 'var(--ink)' : 'var(--surface)',
                  color: p.paused ? '#fff' : 'var(--ink)',
                  opacity: busy === p.id ? 0.6 : 1,
                }}
              >
                {p.paused ? `▶ ${t('mypackages.resume')}` : `⏸ ${t('mypackages.pause')}`}
              </button>
            )}
            {p.renewable && (
              <button
                onClick={() => renew(p)}
                disabled={busy === p.id}
                title={t('mypackages.renewHint')}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: '1px solid var(--accent, #2563eb)',
                  background: 'var(--accent, #2563eb)', color: '#fff',
                  opacity: busy === p.id ? 0.6 : 1,
                }}
              >
                {busy === p.id ? `… ${t('mypackages.renew')}` : `🔄 ${t('mypackages.renew')}`}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t('mypackages.title')}</h2>
        <Caption>{t('mypackages.subtitle')}</Caption>
      </div>

      {notice && (
        <div
          onClick={() => setNotice(null)}
          style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            background: notice.type === 'ok' ? '#dcfce7' : '#fee2e2',
            color: notice.type === 'ok' ? '#15803d' : '#b91c1c',
            border: `1px solid ${notice.type === 'ok' ? '#86efac' : '#fca5a5'}`,
          }}
        >
          {notice.type === 'ok' ? '✓ ' : '⚠ '}{notice.msg}
        </div>
      )}

      {/* Kullandığın kadar öde modu */}
      <Card style={{ padding: 16, marginBottom: 16, border: paygOn ? '1px solid #fbbf24' : undefined, background: paygOn ? '#fffbeb' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <PulseDot color={paygOn ? '#a16207' : 'var(--ink-3)'} size={7} />
              {t('mypackages.payg.title')}
              <span style={{ fontSize: 11, fontWeight: 700, color: paygOn ? '#a16207' : 'var(--ink-3)' }}>
                · {paygOn ? t('mypackages.payg.on') : t('mypackages.payg.off')}
              </span>
            </div>
            <Caption style={{ marginTop: 4 }}>{t('mypackages.payg.desc')}</Caption>
            <Caption style={{ marginTop: 4, fontFamily: 'var(--font-mono)' }}>{t('mypackages.payg.balance', { bal: balanceTL.toFixed(2) })}</Caption>
          </div>
          <button
            onClick={togglePayg}
            disabled={busy === 'payg'}
            style={{
              padding: '8px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              border: 'none', background: paygOn ? 'var(--ink)' : '#a16207', color: '#fff',
              opacity: busy === 'payg' ? 0.6 : 1,
            }}
          >
            {paygOn ? t('mypackages.payg.disable') : t('mypackages.payg.enable')}
          </button>
        </div>
        {paygOn && <Caption style={{ marginTop: 8, color: '#92400e' }}>⚠ {t('mypackages.payg.activeWarn')}</Caption>}
        {paygOn && balanceTL <= 0 && <Caption style={{ marginTop: 4, color: '#b91c1c', fontWeight: 600 }}>⚠ {t('mypackages.payg.zeroWarn')}</Caption>}
      </Card>

      {loading ? (
        <Card style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>{t('mypackages.loading')}</Card>
      ) : packages.length === 0 ? (
        <Card style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
          <I.Wallet size={28} stroke="var(--ink-4)" /><div style={{ marginTop: 8 }}>{t('mypackages.empty')}</div>
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <Card pad={0} style={{ overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>
                {t('mypackages.active')}
              </div>
              {active.map((p, i) => <PackageRow key={p.id} p={p} last={i === active.length - 1} />)}
            </Card>
          )}
          {history.length > 0 && (
            <Card pad={0} style={{ overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--ink-3)' }}>
                {t('mypackages.history')}
              </div>
              {history.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i === history.length - 1 ? 'none' : '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.paketAdi}</div>
                    <Caption style={{ fontFamily: 'var(--font-mono)' }}>{safeDate(p.activatedAt)} → {safeDate(p.expiresAt)}</Caption>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <DurumBadge durum={p.durum} />
                    {p.renewable && (
                      <button
                        onClick={() => renew(p)}
                        disabled={busy === p.id}
                        title={t('mypackages.renewHint')}
                        style={{
                          padding: '5px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                          border: '1px solid var(--accent, #2563eb)',
                          background: 'var(--accent, #2563eb)', color: '#fff',
                          opacity: busy === p.id ? 0.6 : 1,
                        }}
                      >
                        {busy === p.id ? `… ${t('mypackages.renew')}` : `🔄 ${t('mypackages.renew')}`}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
