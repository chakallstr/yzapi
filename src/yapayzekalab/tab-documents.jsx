import { useEffect, useMemo, useState } from 'react';
import { I, Card, Chip, Caption } from './shared.jsx';
import { API_DOC_SECTIONS, buildApiDocsPlainText } from './api-docs.js';
import { apiJson, hasStoredAuth } from './auth-client.js';

const KEY_PLACEHOLDER = 'yzk_live_YOUR_KEY';

// Replace the docs placeholder with the signed-in user's own key everywhere it
// appears in copyable code. When the user hides the key (or has none), the
// original placeholder is preserved so nothing leaks to screenshots/clipboard.
const personalizeText = (text, key, reveal) => {
  if (!text || !key || !reveal) return text;
  return text.split(KEY_PLACEHOLDER).join(key);
};

const DocumentsTab = () => {
  const [copied, setCopied] = useState(false);
  const [copiedBlock, setCopiedBlock] = useState('');
  const [myKey, setMyKey] = useState('');
  const [keyMasked, setKeyMasked] = useState('');
  const [keyState, setKeyState] = useState('idle'); // idle | loading | ready | none | error
  const [showKey, setShowKey] = useState(true);
  const docs = useMemo(() => API_DOC_SECTIONS, []);

  // On mount, if the user is signed in, fetch their active key and reveal its
  // plaintext (owner-scoped backend endpoint) so examples are copy-ready.
  useEffect(() => {
    let cancelled = false;
    const loadKey = async () => {
      if (!hasStoredAuth()) { setKeyState('none'); return; }
      setKeyState('loading');
      try {
        const keys = await apiJson('/api/user/api-keys');
        const active = Array.isArray(keys) ? keys.find((k) => k.aktif !== false) || keys[0] : null;
        if (!active) { if (!cancelled) setKeyState('none'); return; }
        const revealed = await apiJson(`/api/user/api-keys/${active.id}/reveal`);
        if (cancelled) return;
        if (revealed?.key) {
          setMyKey(revealed.key);
          setKeyMasked(revealed.maskedKey || active.maskedKey || '');
          setKeyState('ready');
        } else {
          setKeyMasked(active.maskedKey || '');
          setKeyState('none');
        }
      } catch {
        if (!cancelled) setKeyState('error');
      }
    };
    loadKey();
    return () => { cancelled = true; };
  }, []);

  const hasKey = keyState === 'ready' && Boolean(myKey);
  const reveal = hasKey && showKey;
  const personalize = (text) => personalizeText(text, myKey, reveal);

  const copyAll = async () => {
    try {
      await navigator.clipboard?.writeText(personalize(buildApiDocsPlainText()));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const copyBlock = async (key, text) => {
    try {
      await navigator.clipboard?.writeText(personalize(text));
      setCopiedBlock(key);
      window.setTimeout(() => setCopiedBlock(''), 1600);
    } catch {
      setCopiedBlock('');
    }
  };

  const copyKey = async () => {
    if (!myKey) return;
    try {
      await navigator.clipboard?.writeText(myKey);
      setCopiedBlock('__own_key__');
      window.setTimeout(() => setCopiedBlock(''), 1600);
    } catch {
      setCopiedBlock('');
    }
  };

  const navigateToDoc = (key) => {
    const target = document.getElementById(`doc-${key}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#doc-${key}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Caption>Dokümantasyon</Caption>
          <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8, margin: '6px 0 6px' }}>
            API Dokümantasyonu — <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>sıfırdan adım adım</span>
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55, maxWidth: 720 }}>
            Hiç API kullanmamış biri için baştan sona kurulum. Sırayla ilerle: anahtarını al, bakiye yükle,
            ilk isteğini gönder, sonra aracını (Codex, Claude Code, Roo Code, OpenAI SDK) bağla. Soldaki
            içindekilerden istediğin adıma atlayabilirsin.
          </p>
        </div>
        <button onClick={copyAll} style={{
          padding: '9px 14px', borderRadius: 10,
          background: copied ? 'var(--ok-bg)' : 'var(--ink)',
          color: copied ? '#047857' : '#fff',
          fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <I.Copy size={13} stroke={copied ? '#047857' : '#fff'} />
          {copied ? 'Tümü kopyalandı' : 'Tüm sayfayı kopyala'}
        </button>
      </div>

      {/* Kişisel anahtar bandı — kod örneklerine kendi key'in gömülür */}
      {hasKey ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          padding: '12px 16px', borderRadius: 12,
          background: 'var(--ok-bg)', border: '1px solid var(--accent-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <I.Key size={15} stroke="var(--accent-ink)" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>
                Kod örneklerine kendi API anahtarın gömüldü
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 2, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {showKey ? myKey : (keyMasked || '••••••••')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setShowKey((v) => !v)} style={{
              padding: '7px 11px', borderRadius: 9, fontSize: 11.5, fontWeight: 600,
              background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-2)',
            }}>
              {showKey ? 'Gizle' : 'Göster'}
            </button>
            <button onClick={copyKey} style={{
              padding: '7px 11px', borderRadius: 9, fontSize: 11.5, fontWeight: 600,
              background: copiedBlock === '__own_key__' ? 'var(--ok-bg)' : 'var(--ink)',
              color: copiedBlock === '__own_key__' ? '#047857' : '#fff',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <I.Copy size={12} stroke={copiedBlock === '__own_key__' ? '#047857' : '#fff'} />
              {copiedBlock === '__own_key__' ? 'Kopyalandı' : 'Anahtarı kopyala'}
            </button>
          </div>
        </div>
      ) : keyState === 'none' ? (
        <div style={{
          padding: '12px 16px', borderRadius: 12,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55,
        }}>
          Kod örneklerinde <code style={{ fontFamily: 'var(--font-mono)' }}>{KEY_PLACEHOLDER}</code> görünüyor.
          Hesap sayfandan bir API anahtarı oluşturduğunda, buradaki tüm örneklere kendi anahtarın otomatik gömülür.
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <Card pad={18} style={{ position: 'sticky', top: 84 }}>
          <Caption>İçindekiler</Caption>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            {docs.map((doc, index) => (
              <button
                key={doc.key}
                onClick={() => navigateToDoc(doc.key)}
                type="button"
                style={{
                  display: 'flex', alignItems: 'center',
                  gap: 11, padding: '9px 11px', borderRadius: 10,
                  background: 'transparent', border: '1px solid transparent',
                  color: 'var(--ink)', textAlign: 'left', width: '100%', cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                }}>{index + 1}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{doc.title}</span>
              </button>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {docs.map((doc, index) => (
            <Card key={doc.key} pad={22} id={`doc-${doc.key}`} style={{ scrollMarginTop: 84 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                <span style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                }}>{index + 1}</span>
                <div>
                  <Caption>{`Adım ${index + 1} · ${doc.label}`}</Caption>
                  <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{doc.title}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.72 }}>
                  {doc.intro}
                </p>

                {doc.bullets?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {doc.bullets.map((bullet, index) => (
                      <div key={index} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        {doc.ordered ? (
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--accent)', color: '#fff', fontSize: 10.5, fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                          }}>{index + 1}</span>
                        ) : (
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 7, flexShrink: 0 }} />
                        )}
                        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.68 }}>{personalize(bullet)}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {doc.clientCards?.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                    {doc.clientCards.map((card) => (
                      <div key={card.name} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 12, padding: 16 }}>
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{card.name}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{card.type}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                          {card.steps.map((step, index) => (
                            <div key={index} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                              <span style={{
                                width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--ink)', color: '#fff', fontSize: 10, fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                              }}>{index + 1}</span>
                              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>{personalize(step)}</p>
                            </div>
                          ))}
                        </div>
                        {card.code ? (
                          <div style={{ position: 'relative' }}>
                            <button
                              onClick={() => copyBlock(`${doc.key}-${card.name}`, card.code)}
                              style={{
                                position: 'absolute', top: 10, right: 10,
                                padding: '5px 9px', borderRadius: 8,
                                background: copiedBlock === `${doc.key}-${card.name}` ? 'var(--ok-bg)' : 'rgba(226,232,240,0.12)',
                                color: copiedBlock === `${doc.key}-${card.name}` ? '#047857' : '#e2e8f0',
                                fontSize: 10.5, fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 5,
                              }}
                            >
                              <I.Copy size={11} stroke={copiedBlock === `${doc.key}-${card.name}` ? '#047857' : '#e2e8f0'} />
                              {copiedBlock === `${doc.key}-${card.name}` ? 'Kopyalandı' : 'Kopyala'}
                            </button>
                            <pre style={{ margin: '12px 0 0', padding: 12, borderRadius: 10, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto', fontSize: 11, lineHeight: 1.55 }}>
                              <code>{personalize(card.code)}</code>
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {doc.referenceRows?.length ? (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {doc.referenceRows.map((row, index) => (
                      <div
                        key={row.key}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(160px, 0.9fr) minmax(0, 1.4fr)',
                          gap: 12,
                          padding: '12px 14px',
                          background: index % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                          borderBottom: index < doc.referenceRows.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <code style={{ fontSize: 11.5, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{row.key}</code>
                        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.62 }}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {doc.modelGroups?.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                    {doc.modelGroups.map((group) => (
                      <div key={group.family} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 12, padding: 14 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{group.family}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {group.models.map((model) => (
                            <code key={model} style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>{model}</code>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {doc.codeBlocks?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {doc.codeBlocks.map((block) => (
                      <div key={block.title}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{block.title}</div>
                          <button
                            onClick={() => copyBlock(`${doc.key}-${block.title}`, block.code)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 9,
                              background: copiedBlock === `${doc.key}-${block.title}` ? 'var(--ok-bg)' : 'var(--surface-2)',
                              color: copiedBlock === `${doc.key}-${block.title}` ? '#047857' : 'var(--ink-2)',
                              fontSize: 11,
                              fontWeight: 600,
                              border: '1px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <I.Copy size={12} stroke={copiedBlock === `${doc.key}-${block.title}` ? '#047857' : 'var(--ink-2)'} />
                            {copiedBlock === `${doc.key}-${block.title}` ? 'Kopyalandı' : 'Kod kopyala'}
                          </button>
                        </div>
                        <pre style={{ margin: 0, padding: 14, borderRadius: 12, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto', fontSize: 11.5, lineHeight: 1.6 }}>
                          <code>{personalize(block.code)}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export { DocumentsTab };
