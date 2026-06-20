import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { I, Card, Chip, Caption } from './shared.jsx';
import { API_DOC_SECTIONS, CLIENT_GUIDES, buildApiDocsPlainText, OS_LABELS } from './api-docs.js';
import { apiJson, hasStoredAuth } from './auth-client.js';
import { ApiKeysPanel } from './api-keys-panel.jsx';

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

// Numbered step cards with flow arrows (Hızlı Başlangıç). Wraps to vertical on
// mobile (flex-wrap). Pure presentational — no key personalization.
const JourneyDiagram = ({ steps }) => (
  <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
    {steps.map((step, i) => (
      <Fragment key={i}>
        <div style={{
          flex: '1 1 130px', minWidth: 120, position: 'relative',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '18px 12px 12px', textAlign: 'center',
        }}>
          <span style={{
            position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
            width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)',
            color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{i + 1}</span>
          <div style={{ fontSize: 24, margin: '2px 0 6px' }}>{step.icon}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>{step.title}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>{step.desc}</div>
        </div>
        {i < steps.length - 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: 18, minWidth: 18 }}>→</div>
        ) : null}
      </Fragment>
    ))}
  </div>
);

// Real panel screenshot from public/docs/*.png with a border + caption.
const Screenshot = ({ shot }) => (
  <figure style={{ margin: 0, border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface-2)' }}>
    <img src={`/${shot.src}`} alt={shot.caption || 'Ekran görüntüsü'} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
    {shot.caption ? (
      <figcaption style={{ padding: '9px 14px', fontSize: 11, color: 'var(--ink-2)', borderTop: '1px solid var(--border)', lineHeight: 1.5 }}>{shot.caption}</figcaption>
    ) : null}
  </figure>
);

// Colored showcase cards (free / builder / test-key). Tone sets accent color.
const FEATURE_TONES = {
  free: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.45)', badge: '#059669' },
  builder: { bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.45)', badge: '#7c3aed' },
  key: { bg: 'rgba(244,63,94,0.10)', border: 'rgba(244,63,94,0.45)', badge: '#e11d48' },
};
const FeatureCards = ({ cards }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
    {cards.map((card, i) => {
      const tone = FEATURE_TONES[card.tone] || FEATURE_TONES.builder;
      return (
        <div key={i} style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 12, padding: 16, minWidth: 0 }}>
          {card.badge ? (
            <span style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, padding: '2px 8px', borderRadius: 999, background: tone.badge, color: '#fff', marginBottom: 8 }}>{card.badge}</span>
          ) : null}
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{card.icon} {card.title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{card.desc}</div>
        </div>
      );
    })}
  </div>
);

// Payment method tiles (icon + name + sub + auto/manual tag).
const PaymentList = ({ methods }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
    {methods.map((m, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', minWidth: 0 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>{m.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{m.name}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 1 }}>{m.sub}</div>
        </div>
        <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 9.5, fontWeight: 700, color: 'var(--ink-2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px' }}>{m.tag}</span>
      </div>
    ))}
  </div>
);

// Mandatory refund-policy callout (amber). Mirrors the account-page consent gate.
const RefundBox = ({ policy }) => (
  <div style={{ borderRadius: 12, padding: '14px 16px', background: 'rgba(245,183,61,0.10)', border: '1px solid rgba(245,183,61,0.5)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
      <span>⚠️</span>{policy.title}
    </div>
    <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.62 }}>{policy.body}</p>
  </div>
);

// ── Görsel rehber motoru (CLIENT_GUIDES) ───────────────────────────────────
// Adım görselleri koda gömülü mockup'lardır (gerçek/sahte ekran görüntüsü değil,
// kişisel veri yok). Tipler: app / browser / file / chat / errors / screenshot.

const WinDots = () => (
  <span style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
    {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
      <span key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c, display: 'inline-block' }} />
    ))}
  </span>
);

// Küçük "← buraya bak" açıklama balonu (oklu etiket).
const NoteChip = ({ text }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700,
    color: 'var(--accent-ink)', background: 'var(--ok-bg)', border: '1px solid var(--accent-border)',
    borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap',
  }}>← {text}</span>
);

const MockRow = ({ r }) => {
  const note = r.note ? <NoteChip text={r.note} /> : null;
  if (r.kind === 'button') {
    const bg = r.primary ? 'var(--accent)' : r.muted ? 'var(--surface-2)' : 'var(--surface)';
    const col = r.primary ? '#fff' : r.muted ? 'var(--ink-3)' : 'var(--ink)';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          padding: '9px 14px', borderRadius: 9, background: bg, color: col,
          border: r.highlight ? '2px solid var(--accent)' : '1px solid var(--border)',
          fontSize: 12.5, fontWeight: 600, opacity: r.muted ? 0.6 : 1,
        }}>{r.text}</span>
        {note}
      </div>
    );
  }
  if (r.kind === 'input') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 180, flex: '1 1 200px' }}>
          {r.label ? (
            <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{r.label}</div>
          ) : null}
          <div style={{
            padding: '9px 12px', borderRadius: 9, background: 'var(--surface-2)',
            border: r.highlight ? '2px solid var(--accent)' : '1px solid var(--border)',
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)', overflowWrap: 'anywhere',
          }}>{r.value}</div>
        </div>
        {note}
      </div>
    );
  }
  return <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{r.text}</div>;
};

const AppMock = ({ v, pk }) => (
  <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)', boxShadow: '0 6px 22px rgba(0,0,0,0.16)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
      <WinDots />
      <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</span>
    </div>
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
      {v.rows.map((r, i) => <MockRow key={i} r={r.value ? { ...r, value: pk(r.value) } : r} />)}
    </div>
  </div>
);

const BrowserMock = ({ v }) => (
  <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)', boxShadow: '0 6px 22px rgba(0,0,0,0.16)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
      <WinDots />
      <span style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', fontSize: 11, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔒 {v.url}</span>
    </div>
    <div style={{ padding: '22px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{v.heading}</div>
      {v.sub ? <div style={{ fontSize: 12, color: 'var(--ink-3)', margin: '4px 0 16px' }}>{v.sub}</div> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        {v.buttons.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ padding: '10px 18px', borderRadius: 10, background: b.primary ? 'var(--accent)' : 'var(--surface)', color: b.primary ? '#fff' : 'var(--ink)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>{b.text}</span>
            {b.note ? <NoteChip text={b.note} /> : null}
          </div>
        ))}
      </div>
    </div>
  </div>
);

const FileMock = ({ v, pk }) => (
  <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 6px 22px rgba(0,0,0,0.16)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
      <WinDots />
      <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>📄 {v.path}</span>
    </div>
    <pre style={{ margin: 0, padding: '14px 14px', background: '#0f172a', color: '#e2e8f0', fontSize: 11.5, lineHeight: 1.7, overflowX: 'auto' }}>
      {v.lines.map((l0, i) => { const l = pk(l0); return (
        <div key={i} style={{ display: 'flex', gap: 12 }}>
          <span style={{ color: '#475569', userSelect: 'none', minWidth: 14, textAlign: 'right' }}>{i + 1}</span>
          <span>{l}</span>
        </div>
      ); })}
    </pre>
  </div>
);

const ChatMock = ({ v }) => (
  <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)', boxShadow: '0 6px 22px rgba(0,0,0,0.16)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
      <WinDots />
      <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>{v.app ? `${v.app} · ` : ''}{v.model}</span>
    </div>
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--accent)', color: '#fff', borderRadius: '12px 12px 4px 12px', padding: '9px 12px', fontSize: 12 }}>{v.user}</div>
      <div style={{ alignSelf: 'flex-start', maxWidth: '85%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '12px 12px 12px 4px', padding: '9px 12px', fontSize: 12, color: 'var(--ink)' }}>{v.assistant}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, border: '1px solid var(--border)', borderRadius: 10, padding: '7px 10px', background: 'var(--surface-2)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-ink)', background: 'var(--ok-bg)', borderRadius: 999, padding: '2px 8px' }}>{v.model}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>mesaj yaz…</span>
      </div>
    </div>
    {v.note ? <div style={{ padding: '0 14px 12px', fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic' }}>{v.note}</div> : null}
  </div>
);

const ErrorsViz = ({ v }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {v.items.map((it, i) => (
      <div key={i} style={{ border: '1px solid rgba(244,63,94,0.4)', background: 'rgba(244,63,94,0.08)', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: '#e11d48', borderRadius: 6, padding: '2px 8px', fontFamily: 'var(--font-mono)' }}>{it.code}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{it.cause}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>✅ Çözüm: {it.fix}</div>
      </div>
    ))}
  </div>
);

const GuideVisual = ({ visual, pk }) => {
  if (!visual) return null;
  const px = pk || ((x) => x);
  switch (visual.type) {
    case 'app': return <AppMock v={visual} pk={px} />;
    case 'browser': return <BrowserMock v={visual} />;
    case 'file': return <FileMock v={visual} pk={px} />;
    case 'chat': return <ChatMock v={visual} />;
    case 'errors': return <ErrorsViz v={visual} />;
    case 'screenshot': return <Screenshot shot={visual} />;
    default: return null;
  }
};

// "Senin API anahtarın" — giriş yapmışsa gerçek anahtar + Kopyala; değilse
// yer-tutucu + Hesap'tan oluşturma yönlendirmesi. Çocuk-dostu, tek-tık kopya.
const ApiKeyBox = ({ apiKey }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!apiKey) return;
    try { await navigator.clipboard?.writeText(apiKey); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); }
  };
  if (apiKey) {
    return (
      <div style={{ borderRadius: 12, padding: '12px 14px', background: 'var(--ok-bg)', border: '1px solid var(--accent-border)', marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-ink)', marginBottom: 7 }}>✓ Senin API anahtarın hazır — tıkla, kopyala</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <code style={{ flex: '1 1 220px', minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', overflowX: 'auto', whiteSpace: 'nowrap' }}>{apiKey}</code>
          <button onClick={copy} style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 9, background: copied ? 'var(--surface)' : 'var(--ink)', color: copied ? '#047857' : '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)' }}>
            <I.Copy size={12} stroke={copied ? '#047857' : '#fff'} />
            {copied ? 'Kopyalandı ✓' : 'Anahtarı kopyala'}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ borderRadius: 12, padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 14, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>
      <b>Giriş yaptığında</b> kendi API anahtarın tam olarak burada görünür ve tek tıkla kopyalanır. Şimdilik: <b>Hesap → API Anahtarları → Yeni Anahtar</b> ile bir anahtar oluştur (<code style={{ fontFamily: 'var(--font-mono)' }}>{KEY_PLACEHOLDER}</code>).
    </div>
  );
};

// Hub — "Hangi aracı kullanıyorsun?" araç seçim ekranı.
const DocsHub = ({ guides, onPick, onClassic }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Hangi aracı kullanıyorsun?</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>Aracına tıkla — sadece onun adım adım, görselli kurulum rehberi açılır.</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
      {guides.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onPick(g.id)}
          style={{
            textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)',
            borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          <div style={{ fontSize: 30 }}>{g.icon}</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{g.name}</div>
          {g.badge ? (
            <span style={{ alignSelf: 'flex-start', fontSize: 9.5, fontWeight: 700, color: 'var(--accent-ink)', background: 'var(--ok-bg)', border: '1px solid var(--accent-border)', borderRadius: 999, padding: '2px 8px' }}>{g.badge}</span>
          ) : null}
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{g.forWhom}</div>
          <div style={{ marginTop: 2, fontSize: 12, fontWeight: 700, color: 'var(--accent-ink)' }}>{g.steps.length} adım · adım adım →</div>
        </button>
      ))}
    </div>
    <div>
      <Caption>Bunları mı arıyorsun?</Caption>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10, marginTop: 10 }}>
        {[
          { k: 'packages', t: '🎁 Paketler & ücretsiz', d: 'Paket al, özel paket kur, NVIDIA bedava' },
          { k: 'payment', t: '💳 Ödeme & iade', d: 'Bakiye yükleme yöntemleri + iade politikası' },
          { k: null, t: '📚 Tüm araçlar + API referansı', d: 'Claude Code, Cline, Roo, OpenAI-uyumlu + uçlar' },
        ].map((c) => (
          <button
            key={c.t}
            type="button"
            onClick={() => onClassic(c.k)}
            style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 12, padding: 14, minWidth: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>{c.t}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.45 }}>{c.d}</div>
          </button>
        ))}
      </div>
    </div>
  </div>
);

// Tek aracın kendi sayfası: geri-dön + başlık + her adım görselli.
const ClientGuidePage = ({ guide, onBack, renderInline, apiKey }) => {
  const [copiedStep, setCopiedStep] = useState(-1);
  const [os, setOs] = useState(detectOs());
  const copyStep = async (i, text) => {
    try { await navigator.clipboard?.writeText(text); setCopiedStep(i); window.setTimeout(() => setCopiedStep(-1), 1500); } catch { setCopiedStep(-1); }
  };
  // Giriş yapan müşterinin gerçek anahtarını yer-tutucuların yerine koy (kopya + görsel).
  const pk = (text) => {
    if (!apiKey || !text) return text;
    let s = text;
    for (const tk of ['yzk_live_YOUR_KEY', 'yzk_live_••••••••••••', 'yzk_live_••••••••', 'yzk_live_…']) s = s.split(tk).join(apiKey);
    return s;
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button
        type="button"
        onClick={onBack}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
      >← Tüm araçlar</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 36 }}>{guide.icon}</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{guide.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{guide.tagline} · {guide.forWhom}</div>
        </div>
      </div>

      {guide.steps.map((step, i) => {
        const stepCopied = copiedStep === i;
        return (
          <Card key={i} pad={22}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)',
              }}>{i + 1}</span>
              <div style={{ fontSize: 16, fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>{step.title}</div>
            </div>
            {step.body ? (
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderInline(step.body)}</p>
            ) : null}
            {step.callouts?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {step.callouts.map((c, ci) => (
                  <div key={ci} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', minWidth: 0 }}>
                    <span style={{ color: 'var(--accent)', fontSize: 12, flexShrink: 0, marginTop: 1 }}>→</span>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderInline(c)}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {step.showKeyBox ? <ApiKeyBox apiKey={apiKey} /> : null}
            {step.osVariants ? (() => {
              const osCode = step.osVariants[os]?.code ?? step.osVariants.macos?.code ?? step.osVariants.windows?.code ?? '';
              const osCopied = copiedStep === `${i}-os`;
              return (
                <div style={{ marginBottom: 14, minWidth: 0 }}>
                  <OsTabs variants={step.osVariants} selected={step.osVariants[os] ? os : (step.osVariants.macos ? 'macos' : 'windows')} onSelect={setOs} />
                  <div style={{ position: 'relative', minWidth: 0 }}>
                    <button
                      onClick={() => copyStep(`${i}-os`, pk(osCode))}
                      style={{
                        position: 'absolute', top: 8, right: 8, zIndex: 1, padding: '5px 9px', borderRadius: 8,
                        background: osCopied ? 'var(--ok-bg)' : 'rgba(226,232,240,0.12)', color: osCopied ? '#047857' : '#e2e8f0',
                        fontSize: 10.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <I.Copy size={11} stroke={osCopied ? '#047857' : '#e2e8f0'} />
                      {osCopied ? 'Kopyalandı' : 'Kopyala'}
                    </button>
                    <pre style={{ margin: 0, padding: '34px 12px 12px', borderRadius: 10, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto', maxWidth: '100%', fontSize: 11.5, lineHeight: 1.6 }}>
                      <code>{pk(osCode)}</code>
                    </pre>
                  </div>
                </div>
              );
            })() : null}
            {step.code ? (
              <div style={{ position: 'relative', minWidth: 0, marginBottom: 14 }}>
                <button
                  onClick={() => copyStep(i, pk(step.code))}
                  style={{
                    position: 'absolute', top: 8, right: 8, zIndex: 1, padding: '5px 9px', borderRadius: 8,
                    background: stepCopied ? 'var(--ok-bg)' : 'rgba(226,232,240,0.12)', color: stepCopied ? '#047857' : '#e2e8f0',
                    fontSize: 10.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <I.Copy size={11} stroke={stepCopied ? '#047857' : '#e2e8f0'} />
                  {stepCopied ? 'Kopyalandı' : 'Kopyala'}
                </button>
                <pre style={{ margin: 0, padding: '34px 12px 12px', borderRadius: 10, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto', maxWidth: '100%', fontSize: 11.5, lineHeight: 1.6 }}>
                  <code>{pk(step.code)}</code>
                </pre>
              </div>
            ) : null}
            <GuideVisual visual={step.visual} pk={pk} />
          </Card>
        );
      })}

      <button
        type="button"
        onClick={onBack}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
      >← Tüm araçlar</button>
    </div>
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
  // view: 'hub' (araç seçimi) | <guide.id> (tek aracın sayfası) | 'classic' (eski uzun referans)
  const [view, setView] = useState('hub');
  const docs = useMemo(() => API_DOC_SECTIONS, []);
  const selectedGuide = CLIENT_GUIDES.find((g) => g.id === view) || null;

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

  // API panelinden anahtar oluşturulunca/silinince kod örneklerindeki kişisel
  // anahtarı tazele (unmount-guard'sız hafif yeniden çekme — manuel tetiklenir).
  const refreshDocKey = useCallback(async () => {
    if (!hasStoredAuth()) { setKeyState('none'); setMyKey(''); return; }
    try {
      const keys = await apiJson('/api/user/api-keys');
      const active = Array.isArray(keys) ? keys.find((k) => k.aktif !== false) || keys[0] : null;
      if (!active) { setKeyState('none'); setMyKey(''); return; }
      const revealed = await apiJson(`/api/user/api-keys/${active.id}/reveal`);
      if (revealed?.key) { setMyKey(revealed.key); setKeyMasked(revealed.maskedKey || active.maskedKey || ''); setKeyState('ready'); }
      else { setKeyMasked(active.maskedKey || ''); setKeyState('none'); }
    } catch { setKeyState('error'); }
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
            {view === 'classic'
              ? 'Hiç API kullanmamış biri için baştan sona kurulum. Sırayla ilerle: anahtarını al, bakiye yükle, ilk isteğini gönder, sonra aracını bağla. Soldaki içindekilerden istediğin adıma atlayabilirsin.'
              : 'Hiç bilmeyen biri için bile adım adım, görselli kurulum. Aşağıdan kullandığın aracı seç — sadece onun rehberi açılır. Giriş yaptıysan kendi API anahtarın örneklere otomatik gömülür ve kopyalanır.'}
          </p>
        </div>
        {view === 'classic' ? (
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
        ) : null}
      </div>

      {/* Kişisel anahtar bandı — yalnız klasik/API-referansı görünümünde (hub ve
          araç sayfalarının kendi anahtar kutusu var; hub en üstte kalsın). */}
      {view === 'classic' && (hasKey ? (
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
      ) : null)}

      {view === 'hub' ? (
        <>
          <ApiKeysPanel onKeysChanged={refreshDocKey} />
          <DocsHub
            guides={CLIENT_GUIDES}
            onPick={(id) => { setView(id); window.scrollTo({ top: 0 }); }}
            onClassic={(k) => { setView('classic'); window.setTimeout(() => { if (k) navigateToDoc(k); else window.scrollTo({ top: 0 }); }, 60); }}
          />
        </>
      ) : selectedGuide ? (
        <ClientGuidePage guide={selectedGuide} onBack={() => { setView('hub'); window.scrollTo({ top: 0 }); }} renderInline={renderInline} apiKey={reveal ? myKey : null} />
      ) : (
      <>
      <button
        type="button"
        onClick={() => { setView('hub'); window.scrollTo({ top: 0 }); }}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 4 }}
      >← Rehber seçimine dön</button>
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

                {doc.journeySteps?.length ? <JourneyDiagram steps={doc.journeySteps} /> : null}

                {doc.featureCards?.length ? <FeatureCards cards={doc.featureCards} /> : null}

                {doc.paymentMethods?.length ? <PaymentList methods={doc.paymentMethods} /> : null}

                {doc.refundPolicy ? <RefundBox policy={doc.refundPolicy} /> : null}

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
                              Kalıcı Kurulum — {card.desktopPath || '~/.claude/settings.json'}
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

                {doc.annotatedSteps?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                    {doc.annotatedSteps.map((step, i) => {
                      const blockKey = `${doc.key}-astep-${i}`;
                      const stepCopied = copiedBlock === blockKey;
                      return (
                        <div key={i} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 12, padding: 16, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <span style={{
                              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                            }}>{i + 1}</span>
                            <div style={{ fontSize: 13.5, fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>{step.title}</div>
                          </div>
                          {step.body ? (
                            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderInline(step.body)}</p>
                          ) : null}
                          {step.callouts?.length ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: step.code ? 12 : 0 }}>
                              {step.callouts.map((c, ci) => (
                                <div key={ci} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 0 }}>
                                  <span style={{ color: 'var(--accent)', fontSize: 12, flexShrink: 0, marginTop: 1 }}>→</span>
                                  <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderInline(c)}</div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {step.code ? (
                            <div style={{ position: 'relative', minWidth: 0 }}>
                              <button
                                onClick={() => copyBlock(blockKey, step.code)}
                                style={{
                                  position: 'absolute', top: 8, right: 8, zIndex: 1,
                                  padding: '5px 9px', borderRadius: 8,
                                  background: stepCopied ? 'var(--ok-bg)' : 'rgba(226,232,240,0.12)',
                                  color: stepCopied ? '#047857' : '#e2e8f0',
                                  fontSize: 10.5, fontWeight: 600,
                                  display: 'flex', alignItems: 'center', gap: 5,
                                }}
                              >
                                <I.Copy size={11} stroke={stepCopied ? '#047857' : '#e2e8f0'} />
                                {stepCopied ? 'Kopyalandı' : 'Kopyala'}
                              </button>
                              <pre style={{ margin: 0, padding: '34px 12px 12px', borderRadius: 10, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto', maxWidth: '100%', fontSize: 11, lineHeight: 1.55 }}>
                                <code>{step.code}</code>
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

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

                {doc.screenshot ? <Screenshot shot={doc.screenshot} /> : null}
              </div>
            </Card>
          ))}
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export { DocumentsTab, DocsHub, ClientGuidePage, GuideVisual };
