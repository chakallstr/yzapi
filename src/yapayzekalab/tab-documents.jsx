import { useEffect, useMemo, useState } from 'react';
import { I, Card, Chip, Caption } from './shared.jsx';
import { API_DOC_SECTIONS, buildApiDocsPlainText, OS_LABELS } from './api-docs.js';
import { apiJson, hasStoredAuth } from './auth-client.js';

const KEY_PLACEHOLDER = 'yzk_live_YOUR_KEY';
const OS_ORDER = ['windows', 'macos', 'linux'];

// Detect the visitor's OS so the install code defaults to the right syntax
// (PowerShell vs bash). Falls back to windows (where most copy-paste errors
// happen). Read once at module load; safe in SSR-less SPA.
const detectOs = () => {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux') || ua.includes('android')) return 'linux';
  return 'windows';
};

// Replace the docs placeholder with the signed-in user's own key everywhere it
// appears in copyable code. When the user hides the key (or has none), the
// original placeholder is preserved so nothing leaks to screenshots/clipboard.
const personalizeText = (text, key, reveal) => {
  if (!text || !key || !reveal) return text;
  return text.split(KEY_PLACEHOLDER).join(key);
};

// OS selector tabs (Windows / macOS / Linux). Only the OS keys present in
// `variants` are shown; selecting one swaps the rendered code block.
const OsTabs = ({ variants, selected, onSelect }) => {
  const available = OS_ORDER.filter((os) => variants[os]);
  if (available.length <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
      {available.map((os) => {
        const active = os === selected;
        return (
          <button
            key={os}
            type="button"
            onClick={() => onSelect(os)}
            style={{
              padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              background: active ? 'var(--ink)' : 'var(--surface-2)',
              color: active ? '#fff' : 'var(--ink-2)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
          >
            {OS_LABELS[os]}
          </button>
        );
      })}
    </div>
  );
};

// Styled inline-code chip for `backtick` spans inside prose/steps.
const CodeSpan = ({ children }) => (
  <code style={{
    fontFamily: 'var(--font-mono)', fontSize: '0.92em',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '1px 5px', color: 'var(--ink)',
    wordBreak: 'break-word',
  }}>{children}</code>
);

// Turn a plain string into React nodes, rendering `backtick` spans as styled
// inline code. Unbalanced backticks → render the raw string (never mis-style).
const renderWithInlineCode = (text) => {
  const s = String(text ?? '');
  if (!s.includes('`')) return s;
  const segs = s.split('`');
  if (segs.length % 2 === 0) return s;
  return segs.map((seg, i) =>
    i % 2 === 1 ? <CodeSpan key={i}>{seg}</CodeSpan> : <span key={i}>{seg}</span>
  );
};

const DocumentsTab = () => {
  const [copied, setCopied] = useState(false);
  const [copiedBlock, setCopiedBlock] = useState('');
  const [myKey, setMyKey] = useState('');
  const [keyMasked, setKeyMasked] = useState('');
  const [keyState, setKeyState] = useState('idle'); // idle | loading | ready | none | error
  const [showKey, setShowKey] = useState(true);
  const [osChoice, setOsChoice] = useState(detectOs());
  const docs = useMemo(() => API_DOC_SECTIONS, []);

  // Return the code string for an entry (clientCard or codeBlock), honoring the
  // selected OS variant when present, otherwise the default `code`.
  const codeForOs = (entry) => {
    if (entry?.osVariants) return entry.osVariants[osChoice] ?? entry.osVariants.windows ?? entry.code ?? '';
    return entry?.code ?? '';
  };

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
  // Personalize first (swap in the user's key), then render `backtick` spans as code chips.
  const renderInline = (text) => renderWithInlineCode(personalize(text));

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
                <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, minWidth: 0, overflowWrap: 'anywhere' }}>{doc.title}</span>
              </button>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
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
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.72, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {renderInline(doc.intro)}
                </p>

                {doc.bullets?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {doc.bullets.map((bullet, index) => (
                      <div key={index} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
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
                        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.68, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderInline(bullet)}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {doc.clientCards?.length ? (() => {
                  const cards = doc.clientCards;
                  const isCli = (c) => c.surface === 'cli' || Boolean(c.osVariants) || Boolean(c.code);
                  const cliCards = cards.filter(isCli);
                  const guiCards = cards.filter((c) => !isCli(c));

                  // Code block (CLI tools): OS tabs + dark <pre> with an overlay copy button.
                  const renderCodeBlock = (card) => {
                    const blockKey = `${doc.key}-${card.name}`;
                    const copied = copiedBlock === blockKey;
                    return (
                      <div style={{ position: 'relative', marginTop: 12, minWidth: 0 }}>
                        {card.osVariants ? (
                          <OsTabs variants={card.osVariants} selected={osChoice} onSelect={setOsChoice} />
                        ) : null}
                        <div style={{ position: 'relative', minWidth: 0 }}>
                          <button
                            onClick={() => copyBlock(blockKey, codeForOs(card))}
                            style={{
                              position: 'absolute', top: 8, right: 8, zIndex: 1,
                              padding: '5px 9px', borderRadius: 8,
                              background: copied ? 'var(--ok-bg)' : 'rgba(226,232,240,0.12)',
                              color: copied ? '#047857' : '#e2e8f0',
                              fontSize: 10.5, fontWeight: 600,
                              display: 'flex', alignItems: 'center', gap: 5,
                            }}
                          >
                            <I.Copy size={11} stroke={copied ? '#047857' : '#e2e8f0'} />
                            {copied ? 'Kopyalandı' : 'Kopyala'}
                          </button>
                          <pre style={{ margin: 0, padding: '34px 12px 12px', borderRadius: 10, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto', maxWidth: '100%', fontSize: 11, lineHeight: 1.55 }}>
                            <code>{personalize(codeForOs(card))}</code>
                          </pre>
                        </div>
                      </div>
                    );
                  };

                  // Copyable field values (GUI tools): one row per Base URL / Key / Model.
                  const renderValues = (card) => (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {card.values.map((val) => {
                        const valKey = `${doc.key}-${card.name}-${val.label}`;
                        const copied = copiedBlock === valKey;
                        return (
                          <div key={val.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 0 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', letterSpacing: 0.6, textTransform: 'uppercase' }}>{val.label}</div>
                              <code style={{ display: 'block', fontSize: 11.5, color: 'var(--ink)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', marginTop: 1 }}>{personalize(val.value)}</code>
                            </div>
                            <button
                              onClick={() => copyBlock(valKey, val.value)}
                              style={{
                                flexShrink: 0, padding: '6px 10px', borderRadius: 8,
                                background: copied ? 'var(--ok-bg)' : 'var(--ink)',
                                color: copied ? '#047857' : '#fff',
                                fontSize: 10.5, fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 5,
                              }}
                            >
                              <I.Copy size={11} stroke={copied ? '#047857' : '#fff'} />
                              {copied ? 'Kopyalandı' : 'Kopyala'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );

                  const renderCard = (card) => (
                    <div key={card.name} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 12, padding: 16, minWidth: 0 }}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{card.name}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{card.type}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {card.steps.map((step, i) => (
                          <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', minWidth: 0 }}>
                            <span style={{
                              width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'var(--ink)', color: '#fff', fontSize: 10, fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                            }}>{i + 1}</span>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderInline(step)}</p>
                          </div>
                        ))}
                      </div>
                      {card.values?.length ? renderValues(card) : null}
                      {card.osVariants || card.code ? renderCodeBlock(card) : null}
                      {card.desktopCode ? (() => {
                        const dKey = `${doc.key}-${card.name}-desktop`;
                        const dCopied = copiedBlock === dKey;
                        const dCode = card.desktopCode[osChoice] ?? card.desktopCode.macos ?? card.desktopCode.windows ?? '';
                        return (
                          <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--accent-ink)', marginBottom: 8 }}>
                              Kalıcı Kurulum — ~/.claude/settings.json
                            </div>
                            {card.desktopSteps?.length ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
                                {card.desktopSteps.map((step, i) => (
                                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', minWidth: 0 }}>
                                    <span style={{
                                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700,
                                      fontFamily: 'var(--font-mono)',
                                    }}>{i + 1}</span>
                                    <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderInline(step)}</p>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <OsTabs variants={card.desktopCode} selected={osChoice} onSelect={setOsChoice} />
                            <div style={{ position: 'relative', minWidth: 0 }}>
                              <button
                                onClick={() => copyBlock(dKey, dCode)}
                                style={{
                                  position: 'absolute', top: 8, right: 8, zIndex: 1,
                                  padding: '5px 9px', borderRadius: 8,
                                  background: dCopied ? 'var(--ok-bg)' : 'rgba(226,232,240,0.12)',
                                  color: dCopied ? '#047857' : '#e2e8f0',
                                  fontSize: 10.5, fontWeight: 600,
                                  display: 'flex', alignItems: 'center', gap: 5,
                                }}
                              >
                                <I.Copy size={11} stroke={dCopied ? '#047857' : '#e2e8f0'} />
                                {dCopied ? 'Kopyalandı' : 'Kopyala'}
                              </button>
                              <pre style={{ margin: 0, padding: '34px 12px 12px', borderRadius: 10, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto', maxWidth: '100%', fontSize: 11, lineHeight: 1.55 }}>
                                <code>{personalize(dCode)}</code>
                              </pre>
                            </div>
                            {card.desktopNote ? (
                              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic', lineHeight: 1.5 }}>{card.desktopNote}</p>
                            ) : null}
                          </div>
                        );
                      })() : null}
                    </div>
                  );

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                      {cliCards.length ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                          {cliCards.map(renderCard)}
                        </div>
                      ) : null}
                      {guiCards.length ? (
                        <>
                          <Caption style={{ marginTop: cliCards.length ? 4 : 0 }}>Editör eklentileri · tıkla-ayarla</Caption>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12, minWidth: 0 }}>
                            {guiCards.map(renderCard)}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })() : null}

                {doc.referenceRows?.length ? (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {doc.referenceRows.map((row, index) => (
                      <div
                        key={row.key}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.4fr)',
                          gap: 12,
                          padding: '12px 14px',
                          background: index % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                          borderBottom: index < doc.referenceRows.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <code style={{ fontSize: 11.5, color: 'var(--ink)', fontFamily: 'var(--font-mono)', wordBreak: 'break-word', minWidth: 0 }}>{row.key}</code>
                        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.62, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderInline(row.value)}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {doc.modelGroups?.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 12, minWidth: 0 }}>
                    {doc.modelGroups.map((group) => (
                      <div key={group.family} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 12, padding: 14, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{group.family}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {group.models.map((model) => (
                            <code key={model} style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{model}</code>
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
                            onClick={() => copyBlock(`${doc.key}-${block.title}`, codeForOs(block))}
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
                        {block.osVariants ? (
                          <OsTabs variants={block.osVariants} selected={osChoice} onSelect={setOsChoice} />
                        ) : null}
                        <pre style={{ margin: 0, padding: 14, borderRadius: 12, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto', maxWidth: '100%', fontSize: 11.5, lineHeight: 1.6 }}>
                          <code>{personalize(codeForOs(block))}</code>
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
