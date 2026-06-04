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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Caption>{t('studio.title')}</Caption>
      {error && <div style={{ color: 'var(--danger, #e5484d)' }}>{error}</div>}
      <Card pad={14}>
        {models.length === 0 && (
          <div style={{ color: 'var(--ink-2)', marginBottom: 8 }}>{t('studio.no_models')}</div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.length === 0 && <option value="">model…</option>}
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            {['1024x1024', '1024x1536', '1536x1024', '512x512'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label style={{ fontSize: 13 }}>{t('studio.count_label')} <input type="number" min="1" max="4" value={n} onChange={(e) => setN(e.target.value)} style={{ width: 56 }} /></label>
        </div>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('studio.prompt_placeholder')} rows={3} style={{ width: '100%' }} />
        <div style={{ marginTop: 8 }}>
          <button disabled={busy || !model} onClick={generate}>{busy ? t('studio.generating') : t('studio.generate')}</button>
        </div>
      </Card>
      {images.length > 0 && (
        <Card pad={14}>
          <Caption>{t('studio.result')}</Caption>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10, marginTop: 8 }}>
            {images.map((u, i) => <img key={i} src={u} alt={t('studio.image_alt', { n: i + 1 })} style={{ width: '100%', borderRadius: 8 }} />)}
          </div>
        </Card>
      )}
    </div>
  );
}
