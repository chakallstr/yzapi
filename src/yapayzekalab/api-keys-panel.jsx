import { useCallback, useEffect, useState } from 'react';
import { I, Card } from './shared.jsx';
import { apiJson, hasStoredAuth } from './auth-client.js';

/* ============================================
   ApiKeysPanel — Documents içine gömülü API anahtarı yönetimi.
   Oluştur / listele / sil. İlk girişte (anahtar yoksa) belirgin
   "İlk API anahtarını oluştur" formu. Backend uçları mevcut:
   GET/POST /api/user/api-keys, POST /:id/revoke, GET /:id/reveal.
   Para/billing'e dokunmaz; salt anahtar CRUD.
   ============================================ */

const fmtDate = (s) => {
  try { return new Date(s).toLocaleDateString('tr-TR'); } catch { return '—'; }
};

const NameInput = ({ value, onChange, onEnter }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }}
    placeholder="Anahtar adı (örn. production)"
    style={{
      padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border-st)',
      background: 'var(--surface-2)', fontSize: 12.5, outline: 'none', minWidth: 0, flex: 1,
      fontFamily: 'var(--font-sans)', color: 'var(--ink)',
    }}
  />
);

const CreateButton = ({ onClick, busy }) => (
  <button onClick={onClick} disabled={busy} style={{
    display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
    background: busy ? 'var(--ink-4)' : 'var(--ink)', color: '#fff', border: 'none',
    padding: '10px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
    cursor: busy ? 'default' : 'pointer',
  }}>
    <I.Key size={13} stroke="#fff" /> {busy ? 'Oluşturuluyor…' : 'API anahtarı oluştur'}
  </button>
);

const ApiKeysPanel = ({ onKeysChanged }) => {
  const [authed] = useState(() => hasStoredAuth());
  const [keys, setKeys] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | ready | error
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!hasStoredAuth()) { setKeys([]); setState('ready'); return; }
    setState('loading');
    try {
      const rows = await apiJson('/api/user/api-keys');
      setKeys(Array.isArray(rows) ? rows.filter((k) => k.aktif !== false) : []);
      setState('ready');
    } catch { setState('error'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (creating) return;
    setErr(''); setCreating(true);
    try {
      const res = await apiJson('/api/user/api-keys', { method: 'POST', body: { ad: name.trim() || 'production-key' } });
      if (res?.key) {
        setNewKey(res.key);
        try { await navigator.clipboard?.writeText(res.key); setCopied('__new__'); } catch { /* clipboard blok */ }
      }
      setName('');
      await load();
      onKeysChanged?.();
    } catch { setErr('Anahtar oluşturulamadı. Lütfen tekrar dene.'); }
    finally { setCreating(false); }
  };

  const revoke = async (k) => {
    if (typeof window !== 'undefined' && !window.confirm('Bu API anahtarını silmek istediğine emin misin? Bu anahtarı kullanan uygulamalar çalışmayı durdurur.')) return;
    setErr('');
    try {
      await apiJson(`/api/user/api-keys/${k.id}/revoke`, { method: 'POST' });
      await load();
      onKeysChanged?.();
    } catch { setErr('Anahtar silinemedi.'); }
  };

  const copyKey = async (k) => {
    setErr('');
    try {
      const r = await apiJson(`/api/user/api-keys/${k.id}/reveal`);
      if (r?.key) {
        await navigator.clipboard?.writeText(r.key);
        setCopied(k.id); setTimeout(() => setCopied((c) => (c === k.id ? '' : c)), 1500);
      } else {
        setErr('Bu anahtar gösterilemiyor (eski anahtar). Yeni bir anahtar oluştur.');
      }
    } catch { setErr('Kopyalanamadı.'); }
  };

  // --- Giriş yapılmamış ---
  if (!authed) {
    return (
      <Card pad={22} style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <I.Key size={18} stroke="var(--accent-ink)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--accent-ink)' }}>API anahtarı için giriş yap</div>
            <div style={{ fontSize: 12, color: 'var(--accent-ink)', marginTop: 2 }}>Giriş yaptıktan sonra anahtarını buradan oluşturup kopyalayabilirsin.</div>
          </div>
        </div>
      </Card>
    );
  }

  const newKeyBanner = newKey ? (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 11, background: 'var(--ok-bg)', border: '1px solid #a7f3d0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ok-ink)' }}>Yeni anahtarın oluşturuldu — şimdi kaydet</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', marginTop: 4, wordBreak: 'break-all' }}>{newKey}</div>
          <div style={{ fontSize: 11, color: 'var(--ok-ink)', marginTop: 4, fontStyle: 'italic' }}>Panoya kopyalandı. Bu anahtarı bir daha tam göremezsin — güvenli bir yere kaydet.</div>
        </div>
        <button onClick={() => setNewKey('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ok-ink)', flexShrink: 0 }}><I.Close size={15} stroke="var(--ok-ink)" /></button>
      </div>
    </div>
  ) : null;

  const errLine = err ? (
    <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--err)' }}>{err}</div>
  ) : null;

  // --- Boş durum: ilk anahtarı oluştur ---
  if (state === 'ready' && keys.length === 0) {
    return (
      <Card pad={24}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent-bg)', display: 'grid', placeItems: 'center' }}>
            <I.Key size={16} stroke="var(--accent-ink)" />
          </span>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>İlk API anahtarını oluştur</div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 14 }}>
          API'yi kullanmak için bir anahtara ihtiyacın var. Bir ad ver ve oluştur — anahtarın aşağıdaki kod örneklerine otomatik gömülür.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <NameInput value={name} onChange={setName} onEnter={create} />
          <CreateButton onClick={create} busy={creating} />
        </div>
        {newKeyBanner}
        {errLine}
      </Card>
    );
  }

  // --- Anahtar listesi + oluşturma ---
  return (
    <Card pad={22}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>API anahtarların</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>Buradan yeni anahtar oluştur veya kullanmadığını sil — ayrı bir yere gitmene gerek yok.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <NameInput value={name} onChange={setName} onEnter={create} />
          <CreateButton onClick={create} busy={creating} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {keys.map((k) => (
          <div key={k.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '11px 13px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)',
          }}>
            <I.Key size={14} stroke="var(--ink-3)" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{k.ad || k.name || 'Anahtar'}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {k.maskedKey || (k.prefix ? k.prefix + '••••' : '••••••••')}
              </div>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>{fmtDate(k.olusturma)}</span>
            <button onClick={() => copyKey(k)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid var(--border-st)',
              padding: '6px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: 'var(--ink-2)',
            }}>
              {copied === k.id ? <><I.Check size={11} stroke="var(--ok-ink)" /> Kopyalandı</> : <><I.Copy size={11} stroke="var(--ink-3)" /> Kopyala</>}
            </button>
            <button onClick={() => revoke(k)} style={{
              background: 'transparent', border: '1px solid var(--border-st)', padding: '6px 10px', borderRadius: 8,
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: 'var(--err)',
            }}>Sil</button>
          </div>
        ))}
      </div>

      {state === 'error' && <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--err)' }}>Anahtarlar yüklenemedi. Sayfayı yenile.</div>}
      {newKeyBanner}
      {errLine}
    </Card>
  );
};

export { ApiKeysPanel };
