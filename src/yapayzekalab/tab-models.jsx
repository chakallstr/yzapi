import { useEffect, useMemo, useRef, useState } from 'react';
import {
  I, Card, Chip, Caption, PulseDot, Dot,
  PROVIDERS, MODELS, MODELS_BY_ID, MODEL_KEYS, modelMeta,
  modelsByType, modelsByProvider, ctxFor,
  computeOurUsd, usdToTL, computeTLPrice, fmt,
  mockLogs, promptPool, useCountUp, useLogStream, nowTime,
  mockUsers, mockUsageRecords, mockPayments, mockAnnouncements,
  mockAuditLogs, mockKurHistory, mockProviderStatus,
} from './shared.jsx';

/* ============================================
   ModelsTab — metin model fiyat listesi
   Sağlayıcıya göre gruplandırma · tür filtresi · canlı TL fiyat.
   ============================================ */

const TYPE_META = {
  text:  { label: 'Metin', Ico: I.Text,  color: 'var(--accent)' },
};

const ProviderBadge = ({ provider }) => {
  const p = PROVIDERS[provider] || { short: provider, bg: 'rgba(15,23,42,0.06)', ink: 'var(--ink-2)' };
  return (
    <span style={{
      fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: 0.3,
      padding: '3px 8px', borderRadius: 999,
      background: p.bg, color: p.ink, whiteSpace: 'nowrap',
    }}>{p.short}</span>
  );
};

const ModelRow = ({ m, tweaks, onToggleCompare, compareOn }) => {
  const rate     = tweaks?.tlRate         ?? 34.5;
  const textMul  = tweaks?.textMultiplier ?? 3.0;
  const mediaMul = tweaks?.mediaMultiplier?? 2.3;

  // USD birincil. TL sadece bilgi amaçlı.
  const inputUsd  = m.type === 'text'  ? computeOurUsd(m.input, 'text', { textMul, mediaMul }) : null;
  const outputUsd = m.type === 'text'  ? computeOurUsd(m.output,'text', { textMul, mediaMul }) : null;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '36px 1fr 110px 1fr 1fr', gap: 14,
      padding: '14px 18px',
      borderBottom: '1px solid var(--border)',
      alignItems: 'center', fontSize: 12,
    }} className="card-hover">
      {/* Compare checkbox */}
      <button onClick={() => onToggleCompare?.(m.id)} style={{
        width: 22, height: 22, borderRadius: 6,
        background: compareOn ? 'var(--accent)' : 'var(--surface)',
        border: `1.5px solid ${compareOn ? 'var(--accent)' : 'var(--border-st)'}`,
        display: 'grid', placeItems: 'center', cursor: 'pointer',
      }} title={compareOn ? 'Karşılaştırmadan çıkar' : 'Karşılaştırmaya ekle'}>
        {compareOn && <I.Check size={12} stroke="#fff" />}
      </button>
      {/* Model name + id */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.15, color: 'var(--ink)' }}>{m.label}</div>
        <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.id}{m.ctx ? <span style={{ marginLeft: 8, color: 'var(--ink-4)' }}>· {m.ctx} ctx</span> : null}
        </div>
      </div>
      {/* Provider */}
      <div><ProviderBadge provider={m.provider} /></div>
      {/* Catalog USD price */}
      <div style={{ textAlign: 'right' }}>
        {m.type === 'text'  && (
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)' }} className="tnum">{fmt.usdPer(m.input)} · {fmt.usdPer(m.output)}</div>
            <div style={{ fontSize: 9.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 2, letterSpacing: 0.3 }}>in / out · USD/1M</div>
          </div>
        )}
      </div>
      {/* YapayZekaLab USD price (TL bilgi olarak küçük) */}
      <div style={{ textAlign: 'right' }}>
        {m.type === 'text' && (
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--accent-ink)' }} className="tnum">{fmt.usdPer(inputUsd)} · {fmt.usdPer(outputUsd)}</div>
            <div style={{ fontSize: 9.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 2, letterSpacing: 0.3 }}>in / out · USD/1M · ≈ ₺{(inputUsd*rate).toFixed(2)} / ₺{(outputUsd*rate).toFixed(2)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// === CompareTray — yan yana model karşılaştırma ====================
const CompareTray = ({ ids, onRemove, onClear, tweaks }) => {
  if (ids.length === 0) return null;
  const textMul = tweaks?.textMultiplier ?? 3.0;
  const mediaMul = tweaks?.mediaMultiplier ?? 2.3;

  const rows = ids.map(id => {
    const m = modelMeta(id);
    const catalogPrice = (m.input + m.output) / 2;
    const ourPrice = computeOurUsd(catalogPrice, 'text', { textMul, mediaMul });
    return { id, m, catalogPrice, ourPrice };
  });

  return (
    <Card pad={0} style={{ overflow: 'hidden', position: 'sticky', top: 70, zIndex: 30,
                           boxShadow: '0 8px 24px -8px rgba(15,23,42,0.18)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--ink)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <I.Layers size={14} stroke="#fff" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Karşılaştırma</span>
          <Chip tone="accent" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
            {ids.length} / 3 model
          </Chip>
        </div>
        <button onClick={onClear} style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)' }}>tümünü temizle</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length}, 1fr)` }}>
        {rows.map(({ id, m, catalogPrice, ourPrice }) => (
          <div key={id} style={{ padding: 16, borderRight: '1px solid var(--border)', position: 'relative' }}>
            <button onClick={() => onRemove(id)} style={{
              position: 'absolute', top: 8, right: 8, padding: 4,
              borderRadius: 6, color: 'var(--ink-3)',
            }}><I.Close size={11} stroke="var(--ink-3)" /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{m.label}</span>
            </div>
            <ProviderBadge provider={m.provider} />
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5 }}>
              <CompareRow label="Katalog USD" value={fmt.usdPer(catalogPrice) + ' / 1M'} />
              <CompareRow label="YapayZekaLab" value={fmt.usdPer(ourPrice) + ' / 1M'} accent />
              <CompareRow label="Context" value={m.ctx || '—'} />
              <CompareRow label="Tip" value={m.type} />
              <CompareRow label="Tier" value={m.tier || '—'} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

const CompareRow = ({ label, value, accent }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
    <span style={{ color: 'var(--ink-3)' }}>{label}</span>
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: accent ? 600 : 500, color: accent ? 'var(--accent-ink)' : 'var(--ink)' }} className="tnum">{value}</span>
  </div>
);

// === ModelsTab ====================================================
const ModelsTab = ({ ctx }) => {
  const { tweaks } = ctx;
  const [filter, setFilter] = useState('text');
  const [providerFilter, setProviderFilter] = useState('all');
  const [compareIds, setCompareIds] = useState([]);

  const toggleCompare = (id) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  };

  const filtered = useMemo(() => {
    return MODELS.filter(m => m.type === filter && (providerFilter === 'all' || m.provider === providerFilter));
  }, [filter, providerFilter]);

  const counts = useMemo(() => ({
    text:  MODELS.filter(m => m.type === 'text').length,
  }), []);

  const providersFor = useMemo(() => {
    const set = new Set(MODELS.filter(m => m.type === filter).map(m => m.provider));
    return ['all', ...Array.from(set)];
  }, [filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Caption>Modeller</Caption>
          <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8, margin: '6px 0 6px' }}>
            {MODELS.length} metin modeli, <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>tek API geçidi</span>
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, maxWidth: 640, lineHeight: 1.55 }}>
            Tüm fiyatlar <strong>USD</strong> bazındadır. TL gösterimleri yalnızca bilgi amaçlıdır.
            {' '}Bu geçişte aktif katalog yalnızca metin modelleridir.
          </p>
        </div>

        {/* Tip filter */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          {Object.entries(TYPE_META).map(([k, meta]) => (
            <button key={k} onClick={() => { setFilter(k); setProviderFilter('all'); }} style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 500, borderRadius: 7,
              background: filter === k ? 'var(--ink)' : 'transparent',
              color: filter === k ? 'var(--surface)' : 'var(--ink-3)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <meta.Ico size={12} stroke={filter === k ? 'var(--surface)' : 'var(--ink-3)'} />
              <span>{meta.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.65, marginLeft: 2 }} className="tnum">{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pricing explainer */}
      <Card pad={20} style={{ background: 'var(--surface-2)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
          {[
            { label: 'Metin fiyatı',   value: 'katalog satış fiyatı',                                           mono: true },
            { label: 'Aktif kapsam',   value: 'metin modelleri · görsel/video kapalı',                          mono: true },
            { label: 'Para birimi',   value: 'USD birincil · TL bilgi',                                           mono: false, accent: true },
            { label: 'Bilgi kuru',    value: '₺' + (tweaks.tlRate ?? 34.5).toFixed(2) + ' / USD',                  mono: false },
          ].map((row, i) => (
            <div key={i}>
              <Caption>{row.label}</Caption>
              <div style={{
                marginTop: 6,
                fontSize: row.mono ? 12 : 14,
                fontFamily: row.mono ? 'var(--font-mono)' : 'var(--font-sans)',
                fontWeight: row.accent ? 600 : 500,
                color: row.accent ? 'var(--accent-ink)' : 'var(--ink)',
              }}>{row.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Provider filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', letterSpacing: 0.6, marginRight: 4 }}>SAĞLAYICI</span>
        {providersFor.map(p => {
          const on = providerFilter === p;
          const meta = p === 'all' ? null : PROVIDERS[p];
          return (
            <button key={p} onClick={() => setProviderFilter(p)} style={{
              padding: '5px 11px', fontSize: 11.5, fontWeight: 500, borderRadius: 999,
              background: on ? 'var(--ink)' : (meta?.bg || 'var(--surface)'),
              color: on ? 'var(--surface)' : (meta?.ink || 'var(--ink-2)'),
              border: on ? '1px solid var(--ink)' : '1px solid var(--border)',
              fontFamily: p === 'all' ? 'var(--font-sans)' : 'var(--font-mono)',
              letterSpacing: p === 'all' ? 0 : 0.3,
            }}>
              {p === 'all' ? 'Tümü' : meta.short}
            </button>
          );
        })}
      </div>

      {/* Compare tray */}
      <CompareTray ids={compareIds}
                   onRemove={(id) => setCompareIds(prev => prev.filter(x => x !== id))}
                   onClear={() => setCompareIds([])}
                   tweaks={tweaks} />

      {/* Model table */}
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '36px 1fr 110px 1fr 1fr', gap: 14,
          padding: '14px 18px', background: 'var(--surface-2)',
          borderBottom: '1px solid var(--border)',
        }}>
          <Caption>≡</Caption>
          <Caption>Model</Caption>
          <Caption>Sağlayıcı</Caption>
          <Caption style={{ textAlign: 'right' }}>Katalog fiyatı</Caption>
          <Caption style={{ textAlign: 'right' }}>YapayZekaLab fiyatı (USD)</Caption>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
            Bu filtreyle eşleşen model yok.
          </div>
        ) : (
          filtered.map(m => <ModelRow key={m.id} m={m} tweaks={tweaks}
                                       onToggleCompare={toggleCompare}
                                       compareOn={compareIds.includes(m.id)} />)
        )}
      </Card>

      <div style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', padding: '8px 0', fontFamily: 'var(--font-mono)' }}>
        * Ücretlendirme USD bazındadır. TL karşılığı günlük TCMB kurundan hesaplanıp yalnızca bilgi olarak gösterilir. Görsel/video endpointleri bu geçişte kapalıdır ve 501 JSON hata döndürür.
      </div>
    </div>
  );
};

export { ModelsTab };
