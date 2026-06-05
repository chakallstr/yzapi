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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Başlık */}
      <div>
        <Caption>AI Chat</Caption>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, margin: '4px 0 0', color: 'var(--ink)' }}>
          {t('aiChat.noMessages') ? 'Model ile sohbet et' : ''}
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

      {/* Ayarlar */}
      <Card pad={16}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Model seç */}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 9,
              border: '1px solid var(--border-st)',
              background: 'var(--surface-2)', color: 'var(--ink)',
              fontSize: 13, fontFamily: 'var(--font-mono)',
              outline: 'none', minWidth: 180,
            }}
          >
            {models.length === 0 && <option value="">{t('aiChat.modelPlaceholder')}</option>}
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>

          {/* Temp */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            Temp
            <input
              type="number" step="0.1" min="0" max="2" value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              style={{
                width: 58, padding: '7px 8px', borderRadius: 8,
                border: '1px solid var(--border-st)',
                background: 'var(--surface-2)', color: 'var(--ink)',
                fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'center',
              }}
            />
          </label>

          {/* Max tokens */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            Max tokens
            <input
              type="number" value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              style={{
                width: 78, padding: '7px 8px', borderRadius: 8,
                border: '1px solid var(--border-st)',
                background: 'var(--surface-2)', color: 'var(--ink)',
                fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'center',
              }}
            />
          </label>

          {/* Streaming toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => setStreaming((s) => !s)}
              style={{
                width: 36, height: 20, borderRadius: 999, cursor: 'pointer',
                background: streaming ? 'var(--accent)' : 'var(--border)',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, left: streaming ? 19 : 3,
                width: 14, height: 14, borderRadius: 999,
                background: '#fff', transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
            Streaming
          </label>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              onClick={clear}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-st)',
                background: 'var(--surface)', color: 'var(--ink-2)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}
            >
              {t('aiChat.clearHistory')}
            </button>
            <button
              onClick={exportChat}
              disabled={!messages.length}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-st)',
                background: 'var(--surface)', color: 'var(--ink-2)',
                fontSize: 12, fontWeight: 500,
                opacity: messages.length ? 1 : 0.4, cursor: messages.length ? 'pointer' : 'default',
              }}
            >
              {t('aiChat.exportChat')}
            </button>
          </div>
        </div>
      </Card>

      {/* Sohbet */}
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {/* Mesajlar */}
        <div
          ref={scrollRef}
          style={{
            height: 420, overflowY: 'auto', padding: '20px 20px 16px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}
        >
          {messages.length === 0 && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
              color: 'var(--ink-3)',
            }}>
              <span style={{ fontSize: 32 }}>✦</span>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{t('aiChat.noMessages')}</span>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}
            >
              <span style={{
                fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)',
                color: 'var(--ink-4)',
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                letterSpacing: 0.5, textTransform: 'uppercase',
              }}>
                {m.role === 'user' ? t('aiChat.youLabel') : 'AI'}
              </span>
              <div style={{
                padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: m.role === 'user' ? 'var(--accent)' : 'var(--surface-2)',
                color: m.role === 'user' ? '#fff' : 'var(--ink)',
                fontSize: 13.5, lineHeight: 1.6,
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {m.content || (busy && i === messages.length - 1
                  ? <span style={{ opacity: 0.5 }} className="pulse-dot">●●●</span>
                  : '')}
              </div>
            </div>
          ))}
        </div>

        {/* Girdi alanı */}
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '12px 16px',
          display: 'flex', gap: 10, alignItems: 'flex-end',
          background: 'var(--surface)',
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={t('aiChat.inputPlaceholder')}
            rows={2}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              border: '1px solid var(--border-st)',
              background: 'var(--surface-2)', color: 'var(--ink)',
              fontSize: 13.5, fontFamily: 'var(--font-sans)',
              resize: 'none', outline: 'none', lineHeight: 1.5,
            }}
          />
          <button
            onClick={send}
            disabled={busy || !model || !input.trim()}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 0,
              background: busy || !model || !input.trim() ? 'var(--border)' : 'var(--accent)',
              color: busy || !model || !input.trim() ? 'var(--ink-3)' : '#fff',
              fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background 0.15s, color 0.15s',
              cursor: busy || !model || !input.trim() ? 'default' : 'pointer',
              flexShrink: 0, alignSelf: 'flex-end',
            }}
          >
            {busy ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin-slow">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : '↑'}
            {busy ? '…' : t('common.send')}
          </button>
        </div>
      </Card>
    </div>
  );
}
