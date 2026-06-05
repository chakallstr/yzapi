import { useEffect, useState } from 'react';
import { Card, Caption } from './shared.jsx';
import { apiJson } from './auth-client.js';
import { useT } from './i18n/index.jsx';

export function StudioTab() {
  const { t } = useT();
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState([]);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const raw = d?.MODELS || d?.models || (Array.isArray(d) ? d : []);
        const list = raw
          .filter((m) => m.type === 'Görsel' || m.type === 'image')
          .map((m) => ({ id: m.id || m.modelId, label: m.label || m.name || m.id || m.modelId }))
          .filter((m) => m.id);
        setModels(list);
        setModel((prev) => prev || (list[0]?.id ?? ''));
      })
      .catch(() => {});
  }, []);

  const generate = async () => {
    if (!prompt.trim() || !model || busy) return;
    setBusy(true); setError(''); setImages([]);
    try {
      const r = await apiJson('/api/user/studio', {
        method: 'POST',
        body: { endpoint: 'generations', model, prompt: prompt.trim(), n: Number(n), size },
      });
      const data = r?.data || [];
      const urls = data
        .map((d) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : null))
        .filter(Boolean);
      if (!urls.length) setError(t('studio.err_no_result'));
      setImages(urls);
    } catch (e) {
      if (e.status === 400) setError(e.message || t('studio.err_bad_request'));
      else if (e.status === 402) setError(t('studio.err_low_balance'));
      else if (e.status === 501 || e.status === 503) setError(t('studio.err_provider_down'));
      else setError(e.message || t('studio.err_generic'));
    } finally {
      setBusy(false);
    }
  };

  const selectStyle = {
    padding: '8px 12px', borderRadius: 9,
    border: '1px solid var(--border-st)',
    background: 'var(--surface-2)', color: 'var(--ink)',
    fontSize: 13, fontFamily: 'var(--font-mono)',
    outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Başlık */}
      <div>
        <Caption>{t('studio.title')}</Caption>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, margin: '4px 0 0', color: 'var(--ink)' }}>
          {t('studio.title')}
        </h1>
      </div>

      {/* Hata */}
      {error && (
        <div className="fade-in" style={{
          padding: '12px 16px', borderRadius: 10,
          background: '#fff1f2', border: '1px solid #fecdd3',
          fontSize: 13, color: '#be123c',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Ayarlar + prompt */}
      <Card pad={20}>
        {models.length === 0 && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 16,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)',
          }}>
            ℹ️ {t('studio.no_models')}
          </div>
        )}

        {/* Model / boyut / adet */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ ...selectStyle, minWidth: 200 }}>
            {models.length === 0 && <option value="">model…</option>}
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>

          <select value={size} onChange={(e) => setSize(e.target.value)} style={selectStyle}>
            {['1024x1024', '1024x1536', '1536x1024', '512x512'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            {t('studio.count_label')}
            <input
              type="number" min="1" max="4" value={n}
              onChange={(e) => setN(e.target.value)}
              style={{ ...selectStyle, width: 58, textAlign: 'center' }}
            />
          </label>
        </div>

        {/* Prompt */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) generate(); }}
          placeholder={t('studio.prompt_placeholder')}
          rows={4}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 10,
            border: '1px solid var(--border-st)',
            background: 'var(--surface-2)', color: 'var(--ink)',
            fontSize: 13.5, fontFamily: 'var(--font-sans)',
            resize: 'vertical', outline: 'none', lineHeight: 1.6,
            boxSizing: 'border-box',
          }}
        />

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            disabled={busy || !model || !prompt.trim()}
            onClick={generate}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 0,
              background: busy || !model || !prompt.trim() ? 'var(--border)' : 'var(--accent)',
              color: busy || !model || !prompt.trim() ? 'var(--ink-3)' : '#fff',
              fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 7,
              transition: 'background 0.15s',
              cursor: busy || !model || !prompt.trim() ? 'default' : 'pointer',
            }}
          >
            {busy ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin-slow">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                {t('studio.generating')}
              </>
            ) : (
              <>✦ {t('studio.generate')}</>
            )}
          </button>
        </div>
      </Card>

      {/* Sonuçlar */}
      {images.length > 0 && (
        <Card pad={20} className="fade-in">
          <Caption style={{ marginBottom: 14 }}>{t('studio.result')}</Caption>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}>
            {images.map((u, i) => (
              <div key={i} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <img
                  src={u}
                  alt={t('studio.image_alt', { n: i + 1 })}
                  style={{ width: '100%', display: 'block' }}
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
