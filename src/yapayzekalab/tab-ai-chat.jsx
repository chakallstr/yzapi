import { useEffect, useRef, useState } from 'react';
import { Card, Chip, Caption } from './shared.jsx';
import { authFetch, apiJson } from './auth-client.js';
import { useT } from './i18n/index.jsx';

export function AiChatTab() {
  const { t } = useT();
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [streaming, setStreaming] = useState(true);
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const raw = d?.MODELS || d?.models || (Array.isArray(d) ? d : []);
        const list = raw
          .map((m) => ({ id: m.id || m.modelId, label: m.label || m.name || m.id || m.modelId }))
          .filter((m) => m.id);
        setModels(list);
        setModel((prev) => prev || (list[0]?.id ?? ''));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !model) return;
    setError(''); setBusy(true);
    const history = [...messages, { role: 'user', content: text }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    const body = { model, messages: history, temperature: Number(temperature), max_tokens: Number(maxTokens), stream: streaming };
    try {
      if (streaming) {
        const resp = await authFetch('/api/user/ai-chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!resp.ok || !resp.body) {
          const e = await resp.json().catch(() => null);
          throw new Error(e?.error || t('aiChat.errorStatus', { status: resp.status }));
        }
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const j = JSON.parse(payload);
              const delta = j.choices?.[0]?.delta?.content || '';
              if (delta) {
                setMessages((prev) => {
                  const c = [...prev];
                  c[c.length - 1] = { role: 'assistant', content: c[c.length - 1].content + delta };
                  return c;
                });
              }
            } catch { /* yarım JSON parçası — yoksay */ }
          }
        }
      } else {
        const j = await apiJson('/api/user/ai-chat', { method: 'POST', body });
        const content = j?.choices?.[0]?.message?.content || t('aiChat.emptyResponse');
        setMessages((prev) => {
          const c = [...prev];
          c[c.length - 1] = { role: 'assistant', content };
          return c;
        });
      }
    } catch (e) {
      setError(e.message || t('aiChat.chatError'));
      setMessages((prev) => {
        const c = [...prev];
        if (c.length && c[c.length - 1].role === 'assistant' && !c[c.length - 1].content) c.pop();
        return c;
      });
    } finally {
      setBusy(false);
    }
  };

  const clear = () => { setMessages([]); setError(''); };
  const exportChat = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sohbet.json';
    a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Caption>AI Chat</Caption>
      {error && <div style={{ color: 'var(--danger, #e5484d)' }}>{error}</div>}
      <Card pad={12}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.length === 0 && <option value="">{t('aiChat.modelPlaceholder')}</option>}
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <label style={{ fontSize: 13 }}>Temp <input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(e) => setTemperature(e.target.value)} style={{ width: 60 }} /></label>
          <label style={{ fontSize: 13 }}>Max tokens <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} style={{ width: 84 }} /></label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={streaming} onChange={(e) => setStreaming(e.target.checked)} /> Streaming</label>
          <button onClick={clear}>{t('aiChat.clearHistory')}</button>
          <button onClick={exportChat} disabled={!messages.length}>{t('aiChat.exportChat')}</button>
        </div>
      </Card>

      <Card pad={12}>
        <div ref={scrollRef} style={{ maxHeight: 440, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.length === 0 && <div style={{ color: 'var(--ink-2)' }}>{t('aiChat.noMessages')}</div>}
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '82%', background: m.role === 'user' ? 'var(--accent-soft, #eef2ff)' : 'var(--surface-2, #f5f5f7)', padding: '8px 12px', borderRadius: 10, whiteSpace: 'pre-wrap' }}>
              <Chip>{m.role === 'user' ? t('aiChat.youLabel') : 'AI'}</Chip>
              <div style={{ marginTop: 4 }}>{m.content || (busy && i === messages.length - 1 ? '…' : '')}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={t('aiChat.inputPlaceholder')}
            rows={2}
            style={{ flex: 1 }}
          />
          <button onClick={send} disabled={busy || !model}>{busy ? '…' : t('common.send')}</button>
        </div>
      </Card>
    </div>
  );
}
