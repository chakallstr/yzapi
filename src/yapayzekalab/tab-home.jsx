import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  I, Card, Chip, Caption, PulseDot, Dot,
  PROVIDERS, MODELS, MODELS_BY_ID, MODEL_KEYS, modelMeta,
  modelsByType, modelsByProvider, ctxFor,
  computeOurUsd, usdToTL, computeTLPrice, fmt, computeCatalogDiff, providerLabelFor, FAST_MODE_IDS,
  mockLogs, promptPool, useCountUp, useLogStream, nowTime,
  mockUsers, mockUsageRecords, mockPayments, mockAnnouncements,
  mockAuditLogs, mockKurHistory, mockProviderStatus,
} from './shared.jsx';
import { useT } from './i18n/index.jsx';

/* ============================================
   HomeTab — YapayZekaLab anasayfa
   Hero · 3 özellik · Nasıl çalışır · Değer önerisi banner ·
   API Aktivitesi · Quickstart · SSS
   ============================================ */

// === RouteFlow — canlı sağlayıcı routing animasyonu ================
// 4 farklı Claude metin modeli arasında routing (Opus/Sonnet/Haiku).
const RouteFlow = ({ tweaks }) => {
  const { t } = useT();
  const dotCount = tweaks?.routeDotCount ?? 4;
  const dur = tweaks?.routeDur ?? 3.6;
  const glow = tweaks?.routeGlow ?? true;
  const guides = tweaks?.routeGuides ?? true;
  const pulse = tweaks?.routePulse ?? true;

  const paths = {
    'claude-opus-4-6': "M70,130 L98,130 L178,130 C190,130 192,75 200,40",
    'claude-opus-4-7': "M70,130 L98,130 L178,130 C190,130 192,108 200,90",
    'claude-sonnet-4-6': "M70,130 L98,130 L178,130 C190,130 192,152 200,170",
    'claude-haiku-4-5-20251001': "M70,130 L98,130 L178,130 C190,130 192,205 200,220"
  };
  const dests = [
  { key: 'claude-opus-4-6', y: 26 },
  { key: 'claude-opus-4-7', y: 76 },
  { key: 'claude-sonnet-4-6', y: 156 },
  { key: 'claude-haiku-4-5-20251001', y: 206 }];

  const staggers = Array.from({ length: dotCount }, (_, i) => i * dur / dotCount);

  return (
    <svg viewBox="0 0 280 260" style={{ width: '100%', height: 260 }} aria-hidden="true">
      <defs>
        <filter id="rfGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>

      {guides && Object.values(paths).map((d, i) =>
      <path key={i} d={d} fill="none" stroke="var(--ink-3)" strokeWidth="0.7"
      strokeDasharray="2 4" opacity="0.22" />
      )}

      {pulse &&
      <rect x="95" y="98" width="86" height="64" rx="16" fill="none"
      stroke="var(--accent)" strokeWidth="1.2" opacity="0.22">
          <animate attributeName="opacity" values="0.1;0.32;0.1" dur="2.4s" repeatCount="indefinite" />
        </rect>
      }

      <rect x="12" y="112" width="58" height="36" rx="10"
      fill="var(--surface)" stroke="var(--border-st)" strokeWidth="1" />
      <text x="41" y="135" textAnchor="middle" fontSize="10.5"
      fontFamily="var(--font-mono)" fill="var(--ink-2)" fontWeight="500">{tweaks?.routeLblInput ?? t('home.routeLblInput')}</text>
      <text x="41" y="103" textAnchor="middle" fontSize="8.5"
      fontFamily="var(--font-mono)" fill="var(--ink-3)" letterSpacing="0.5">{tweaks?.routeLblInputSub ?? 'API KEY'}</text>

      <rect x="98" y="100" width="80" height="60" rx="14" fill="var(--accent)" />
      <text x="138" y="124" textAnchor="middle" fontSize="9.5"
      fontFamily="var(--font-sans)" fontWeight="700" fill="#fff" letterSpacing="0.8">{tweaks?.routeLblRouterTitle ?? 'YAPAYZEKALAB'}</text>
      <text x="138" y="142" textAnchor="middle" fontSize="8.5"
      fontFamily="var(--font-mono)" fill="rgba(255,255,255,0.72)" letterSpacing="0.3">{tweaks?.routeLblRouterSub ?? 'api · v1'}</text>

      {dests.map(({ key, y }) => {
        const m = modelMeta(key);
        return (
          <g key={key}>
            <rect x="198" y={y} width="74" height="28" rx="9"
            fill={m.bg} stroke={m.color} strokeOpacity="0.4" strokeWidth="1" />
            <text x="235" y={y + 12} textAnchor="middle" fontSize="7.5"
            fontFamily="var(--font-mono)" fill={m.ink} opacity="0.7" letterSpacing="0.4">{m.providerShort.toUpperCase()}</text>
            <text x="235" y={y + 23} textAnchor="middle" fontSize="9"
            fontFamily="var(--font-mono)" fontWeight="600" fill={m.ink}>{m.label.replace(/^(Claude|GPT|Gemini) /, '')}</text>
          </g>);

      })}

      {dests.map(({ key }) => {
        const m = modelMeta(key);
        return staggers.map((b, i) =>
        <circle key={key + i} r="3.2" fill={m.color} filter={glow ? "url(#rfGlow)" : undefined}>
            <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`-${b}s`} path={paths[key]} />
            <animate attributeName="opacity" values="0;1;1;1;0"
          keyTimes="0;0.06;0.4;0.94;1" dur={`${dur}s`} repeatCount="indefinite" begin={`-${b}s`} />
          </circle>
        );
      })}
    </svg>);

};

// "Bu ay TR toplam istek" — ay başına demirlenmiş, gerçek-zamanla artan canlı
// sayaç. Her F5'te baştan sarmaz: değer (ay başından beri geçen saniye × oran +
// taban) ile hesaplanır ve localStorage tabanıyla asla geri gitmez. Sekme kapalı
// kalsa bile bir sonraki açılışta zaman ilerlemiş olur → "sürekli ediyor" hissi.
// Sabitler tunable; ay sonunda doğal sıfırlanır ("bu ay" semantiği).
const TR_REQ_KEY = 'yz_home_tr_requests_v1';
const TR_REQ_BASE = 238000; // ay başı taban
const TR_REQ_RATE = 0.18;   // ~istek/sn artış
function trRequestsTimeFloor() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
  const secs = Math.max(0, (Date.now() - monthStart) / 1000);
  return Math.floor(TR_REQ_BASE + secs * TR_REQ_RATE);
}
function trRequestsReadFloor() {
  try {
    const raw = window.localStorage?.getItem(TR_REQ_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.month === new Date().getMonth() && Number.isFinite(o.value)) return o.value;
    }
  } catch { /* yok say */ }
  return 0;
}
function trRequestsWriteFloor(value) {
  try {
    window.localStorage?.setItem(TR_REQ_KEY, JSON.stringify({ month: new Date().getMonth(), value }));
  } catch { /* yok say */ }
}

// === ValueBanner — 3-up değer önerisi banner =======================
const ValueBanner = ({ tweaks, onAction }) => {
  const { t } = useT();
  const animSpeed = tweaks?.animSpeed ?? 1;
  const tickerOn = tweaks?.priceTickerOn ?? true;
  const tickerMs = tweaks?.priceTickerMs ?? 700;
  const tickerInc = tweaks?.priceTickerInc ?? 0.5;

  // Live "Türkiye toplam istek" ticker — F5'te sıfırlanmaz, hep artar.
  const [requests, setRequests] = useState(() => Math.max(trRequestsTimeFloor(), trRequestsReadFloor()));
  useEffect(() => {
    if (!tickerOn) return;
    const t = setInterval(() => {
      setRequests((n) => {
        const inc = Math.max(1, Math.round(tickerInc * (0.6 + Math.random() * 1.2)));
        // Zaman tabanının altına asla düşme (idle sonrası ileri sıçrar), üstüne canlı artış.
        const next = Math.max(n + inc, trRequestsTimeFloor());
        trRequestsWriteFloor(next);
        return next;
      });
    }, Math.max(80, tickerMs / Math.max(0.1, animSpeed)));
    return () => clearInterval(t);
  }, [tickerOn, tickerMs, tickerInc, animSpeed]);

  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      {/* Provider gradient stripe */}
      <div style={{
        height: 4,
        background: 'linear-gradient(90deg, #c2693a 0%, #10a37f 25%, #4285f4 50%, #7a5af0 75%, #e8484a 100%)',
        opacity: 0.85
      }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr 1fr', gap: 0, alignItems: 'stretch' }}>

        {/* ===== LEFT: model catalog ===== */}
        <div style={{ padding: '26px 28px', borderRight: '1px solid var(--border)' }}>
          <Chip tone="ink" style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 14 }}>
            <I.Layers size={10} stroke="var(--surface)" /> {t('home.banner.multiProvider')}
          </Chip>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <div style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 76, fontWeight: 600, letterSpacing: -3.8, lineHeight: 0.9,
              background: 'linear-gradient(135deg, var(--ink) 0%, var(--accent) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }} className="tnum">{MODELS.length}</div>
            <div style={{ fontSize: 14, lineHeight: 1.35, color: 'var(--ink-2)' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: 18, color: 'var(--ink)' }}>{t('home.banner.modelWord')}</span><br />
              {t('home.banner.modelDesc1')}<br />
              {t('home.banner.modelDesc2')}
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {Object.entries(PROVIDERS).map(([k, p]) =>
            <span key={k} style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
              padding: '3px 8px', borderRadius: 999,
              background: p.bg, color: p.ink
            }}>{p.short}</span>
            )}
          </div>
        </div>

        {/* ===== CENTER: "KOTA YOK" promises ===== */}
        <div style={{ padding: '26px 28px', borderRight: '1px solid var(--border)' }}>
          <Chip tone="ok" style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 14 }}>
            <I.Check size={10} stroke="#047857" /> {t('home.banner.balanceSystem')}
          </Chip>

          <div style={{
            fontSize: 38, fontWeight: 600, letterSpacing: -1.6, lineHeight: 1, color: 'var(--ink)',
            marginBottom: 14
          }}>
            <span style={{ fontStyle: 'italic', fontWeight: 400, fontFamily: "\"Geist Mono\"" }}>{t('home.banner.quotaWordItalic')}</span>{t('home.banner.quotaRest')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
            { t: t('home.banner.noSubTitle'), d: t('home.banner.noSubDesc') },
            { t: t('home.banner.noLimitTitle'), d: t('home.banner.noLimitDesc') },
            { t: t('home.banner.indefiniteTitle'), d: t('home.banner.indefiniteDesc') },
            { t: t('home.banner.minTopupTitle'), d: t('home.banner.minTopupDesc') }].
            map((row, i) =>
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                width: 18, height: 18, borderRadius: '50%', background: 'var(--ok-bg)',
                display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1
              }}>
                  <I.Check size={11} stroke="#047857" />
                </span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>{row.t}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>{row.d}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== RIGHT: Live ticker + CTA ===== */}
        <div style={{
          padding: '26px 28px',
          background: 'linear-gradient(135deg, var(--accent-bg) 0%, var(--surface) 100%)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
        }}>
          <div>
            <Caption style={{ color: 'var(--accent-ink)' }}>{t('home.banner.trRequests')}</Caption>
            <div style={{
              fontSize: 36, fontWeight: 600, letterSpacing: -1.4, lineHeight: 1.05,
              color: 'var(--ink)', marginTop: 10, fontFamily: 'var(--font-sans)'
            }} className="tnum">
              {requests.toLocaleString('tr-TR')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <PulseDot color="#10b981" size={6} withRing={false} />
              {t('home.banner.liveCounter')}
            </div>
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 10 }}>
              {t('home.banner.claudeLine')}
            </div>
            <button onClick={() => onAction?.({ tab: 'account', section: 'account-balance' })} style={{
              background: 'var(--accent)', color: '#fff',
              padding: '8px 14px', borderRadius: 9,
              fontSize: 12, fontWeight: 500, width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7
            }}>
              <span>{t('home.banner.topUpCta')}</span><I.Arrow size={12} stroke="#fff" />
            </button>
          </div>
        </div>
      </div>
    </Card>);

};

// === Feed row — model adı başlık + ctx · token · ms + ✓ ============
const FeedRow = ({ log, isNew, animateIn = true }) => {
  const { t } = useT();
  const m = modelMeta(log.model);
  return (
    <div className={isNew && animateIn ? 'stream-in' : ''} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      borderRadius: 10,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${m.color}`
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, letterSpacing: -0.15, color: 'var(--ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>{m.label}</div>
        <div style={{
          fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3,
          fontFamily: 'var(--font-mono)', letterSpacing: 0.1
        }}>
          {t('home.feed.meta', { ctx: log.ctx, tokens: fmt.num(log.tokens), ms: log.ms })}
        </div>
      </div>
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        background: log.status === 'slow' ? '#fff7ed' : 'var(--ok-bg)',
        color: log.status === 'slow' ? '#c2410c' : '#047857',
        display: 'grid', placeItems: 'center', flexShrink: 0
      }}>
        {log.status === 'slow' ? <I.Clock size={11} stroke="#c2410c" /> : <I.Check size={12} stroke="#047857" />}
      </span>
    </div>);

};

// === Code snippet generator + syntax highlight =====================
const codeSnippets = {
  curl: () => `curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "messages": [{"role": "user", "content": "Merhaba"}]
  }'`,
  python: () => `from openai import OpenAI

client = OpenAI(
    base_url="https://yapayzekalab.org/v1",
    api_key="yzk_live_YOUR_KEY"
)

response = client.chat.completions.create(
    model="claude-haiku-4-5-20251001",
    messages=[{"role": "user", "content": "Merhaba"}]
)
print(response.choices[0].message.content)`,
  nodejs: () => `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://yapayzekalab.org/v1',
  apiKey: 'yzk_live_YOUR_KEY'
});

const response = await client.chat.completions.create({
  model: 'claude-haiku-4-5-20251001',
  messages: [{ role: 'user', content: 'Merhaba' }]
});
console.log(response.choices[0].message.content);`
};

function highlight(code, lang) {
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const commentSrc = lang === 'nodejs' ? '\\/\\/[^\\n]*' : '#[^\\n]*';
  const kwSrc = {
    nodejs: 'import|from|const|let|await|async|function|return|new',
    python: 'import|from|def|return|if|else|for|in|print',
    curl: 'curl|POST|GET|PUT'
  }[lang] || '';
  const parts = [
  `(${commentSrc})`,
  `('[^'\\n]*'|"[^"\\n]*")`,
  `(\\b\\d+\\.?\\d*\\b)`];

  if (kwSrc) parts.push(`(\\b(?:${kwSrc})\\b)`);
  const re = new RegExp(parts.join('|'), 'g');
  return escaped.replace(re, (m, c, s, n, k) => {
    if (c) return '<span style="color:#94a3b8">' + c + '</span>';
    if (s) return '<span style="color:#10b981">' + s + '</span>';
    if (n) return '<span style="color:#f59e0b">' + n + '</span>';
    if (k) return '<span style="color:#a78bfa">' + k + '</span>';
    return m;
  });
}

// === Quickstart playground =========================================
const Quickstart = () => {
  const { t } = useT();
  const [lang, setLang] = useState('python');
  const [copied, setCopied] = useState(false);
  const code = codeSnippets[lang]();

  const [prompt, setPrompt] = useState(t('home.quick.promptDefault'));
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState(null);
  const [streamedText, setStreamedText] = useState('');
  const streamRef = useRef(null);
  const submit = (e) => {
    e?.preventDefault();
    if (!prompt.trim()) return;
    if (streamRef.current) clearInterval(streamRef.current);
    setThinking(true);
    setResult(null);
    setStreamedText('');
    setTimeout(() => {
      setThinking(false);
      const fullText = t('home.quick.resultText');
      setResult({
        model: 'claude-haiku-4-5-20251001',
        ms: 540 + Math.round(Math.random() * 220),
        cost: 0.00098 + Math.random() * 0.0004,
        text: fullText
      });
      // Typewriter streaming effect
      let i = 0;
      streamRef.current = setInterval(() => {
        i += 2 + Math.floor(Math.random() * 3);
        setStreamedText(fullText.slice(0, i));
        if (i >= fullText.length) { clearInterval(streamRef.current); streamRef.current = null; }
      }, 22);
    }, 900);
  };
  useEffect(() => () => { if (streamRef.current) clearInterval(streamRef.current); }, []);

  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card pad={20}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{t('home.quick.title')}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{t('home.quick.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', gap: 2, padding: 3, background: 'rgba(15,23,42,0.04)', borderRadius: 9, border: '1px solid var(--border)' }}>
          {[['python', 'Python'], ['nodejs', 'Node'], ['curl', 'cURL']].map(([k, l]) =>
          <button key={k} onClick={() => setLang(k)} style={{
            padding: '4px 9px', fontSize: 11, fontWeight: 500, borderRadius: 6,
            background: lang === k ? 'var(--surface)' : 'transparent',
            color: lang === k ? 'var(--ink)' : 'var(--ink-3)',
            boxShadow: lang === k ? 'var(--sh-1)' : 'none',
            transition: 'all 0.15s'
          }}>{l}</button>
          )}
        </div>
      </div>

      <div key={lang} className="fade-in" style={{
        position: 'relative', background: '#0f172a', color: '#e2e8f0',
        borderRadius: 'var(--r-md)', padding: '14px 16px',
        fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.7,
        maxHeight: 240, overflow: 'auto',
        border: '1px solid var(--border-st)'
      }}>
        <button onClick={copy} style={{
          position: 'absolute', top: 10, right: 10,
          padding: 6, borderRadius: 6,
          background: 'rgba(255,255,255,0.08)', color: '#cbd5e1',
          display: 'grid', placeItems: 'center'
        }} title={t('common.copy')}>
          {copied ? <I.Check size={13} stroke="#10b981" /> : <I.Copy size={13} stroke="#cbd5e1" />}
        </button>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}
        dangerouslySetInnerHTML={{ __html: highlight(code, lang) }} />
      </div>

      <div style={{
        marginTop: 14, padding: 14, borderRadius: 'var(--r-md)',
        background: 'var(--accent-bg)',
        border: '1px solid var(--accent-border)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Caption style={{ color: 'var(--accent-ink)', fontSize: 9.5 }}>{t('home.quick.playgroundCaption')}</Caption>
          <Chip tone="accent" style={{ background: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)' }}>
            yzk_live_YOUR_KEY
          </Chip>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('home.quick.promptPlaceholder')}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 8,
            background: 'var(--surface)', border: '1px solid var(--accent-border)',
            fontSize: 12, color: 'var(--ink)', outline: 'none'
          }} />
          <button type="submit" disabled={thinking} style={{
            padding: '8px 14px', borderRadius: 8,
            background: 'var(--accent)', color: '#fff',
            fontSize: 12, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: thinking ? 0.6 : 1, transition: 'opacity 0.15s'
          }}>
            {thinking ? <I.Refresh size={11} stroke="#fff" className="spin-slow" /> : <I.Play size={10} stroke="#fff" fill="#fff" />}
            <span>{thinking ? t('home.quick.running') : t('common.send')}</span>
          </button>
        </form>

        {thinking &&
        <div className="fade-in" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-ink)', fontSize: 11.5 }}>
            <span className="think-dot" style={{ animationDelay: '0s' }}>●</span>
            <span className="think-dot" style={{ animationDelay: '0.15s' }}>●</span>
            <span className="think-dot" style={{ animationDelay: '0.30s' }}>●</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{t('home.quick.preparing')}</span>
          </div>
        }

        {result &&
        <div className="fade-in" style={{
          marginTop: 12, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 8, padding: 12,
          display: 'flex', flexDirection: 'column', gap: 8
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <I.Cpu size={14} stroke="var(--accent)" />
                <span style={{ fontSize: 11.5, fontWeight: 500 }}>{t('home.quick.answeredBy')}</span>
                <Chip tone="accent" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                  {result.model}
                </Chip>
              </div>
              <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 10.5 }} className="tnum">
                <span style={{ color: 'var(--ink-3)' }}>{result.ms}ms</span>
                <span style={{ color: '#047857' }}>${result.cost.toFixed(5)}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55, paddingTop: 4,
            borderTop: '1px solid var(--border)' }}>
              {streamedText || result.text}
              {streamedText && streamedText.length < result.text.length && <span className="caret"></span>}
            </div>
          </div>
        }
      </div>
    </Card>);

};

// === Feature card ==================================================
const FeatureCard = ({ tone, Ico, title, body }) =>
<Card hoverable pad={22} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{
    width: 40, height: 40, borderRadius: 12,
    background: `var(--t-${tone}-bg)`, color: `var(--t-${tone})`,
    display: 'grid', placeItems: 'center'
  }}>
      <Ico size={18} stroke={`var(--t-${tone})`} />
    </div>
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>{body}</div>
    </div>
  </Card>;


// === HowItWorks 4-step =============================================
const HowItWorks = () => {
  const { t } = useT();
  return (
<Card pad={28}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
      <div>
        <Caption>{t('home.how.caption')}</Caption>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, margin: '6px 0 0' }}>
          {t('home.how.title')}
        </h2>
      </div>
      <Chip tone="ok" style={{ fontFamily: 'var(--font-mono)' }}>{t('home.how.fiveMin')}</Chip>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, position: 'relative' }}>
      {/* Connecting dotted line */}
      <div style={{
      position: 'absolute', top: 24, left: '12%', right: '12%', height: 1,
      borderTop: '1.5px dashed var(--accent-border)', zIndex: 0
    }} />

      {[
    { n: '01', title: t('home.how.step1Title'), desc: t('home.how.step1Desc') },
    { n: '02', title: t('home.how.step2Title'), desc: t('home.how.step2Desc') },
    { n: '03', title: t('home.how.step3Title'), desc: t('home.how.step3Desc') },
    { n: '04', title: t('home.how.step4Title'), desc: t('home.how.step4Desc') }].
    map((s, i) =>
    <div key={i} style={{ position: 'relative', padding: '0 12px', textAlign: 'left' }}>
          <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: 'var(--surface)', border: '1.5px solid var(--accent-border)',
        display: 'grid', placeItems: 'center', position: 'relative', zIndex: 1,
        margin: '0 0 14px',
        fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22, fontWeight: 500,
        color: 'var(--accent-ink)'
      }}>{s.n}</div>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.15, marginBottom: 4 }}>{s.title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>{s.desc}</div>
        </div>
    )}
    </div>
  </Card>);
};


// === FAQ accordion =================================================
const FAQItem = ({ q, a, open, onToggle }) =>
<div style={{ borderBottom: '1px solid var(--border)' }}>
    <button onClick={onToggle} style={{
    width: '100%', padding: '16px 0', textAlign: 'left',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12
  }}>
      <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{q}</span>
      <span style={{
      width: 24, height: 24, borderRadius: 999, background: open ? 'var(--accent)' : 'var(--surface-2)',
      color: open ? '#fff' : 'var(--ink-2)',
      display: 'grid', placeItems: 'center', flexShrink: 0,
      transition: 'transform 0.2s, background 0.2s',
      transform: open ? 'rotate(180deg)' : 'rotate(0)'
    }}>
        <I.Chevron size={13} stroke={open ? '#fff' : 'var(--ink-2)'} />
      </span>
    </button>
    {open &&
  <div className="fade-in" style={{ padding: '0 0 18px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
        {a}
      </div>
  }
  </div>;


const FAQ = () => {
  const { t } = useT();
  const [openIdx, setOpenIdx] = useState(0);
  const items = [
  { q: t('home.faq.q1'), a: t('home.faq.a1') },
  { q: t('home.faq.q2'), a: t('home.faq.a2') },
  { q: t('home.faq.q3'), a: t('home.faq.a3') },
  { q: t('home.faq.q4'), a: t('home.faq.a4') },
  { q: t('home.faq.q5'), a: t('home.faq.a5') },
  { q: t('home.faq.q6'), a: t('home.faq.a6') },
  { q: t('home.faq.q7'), a: t('home.faq.a7') },
  { q: t('home.faq.q8'), a: t('home.faq.a8') }];

  return (
    <Card pad={28}>
      <div style={{ marginBottom: 14 }}>
        <Caption>{t('home.faq.caption')}</Caption>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, margin: '6px 0 0' }}>
          {t('home.faq.title')}
        </h2>
      </div>
      <div>
        {items.map((it, i) =>
        <FAQItem key={i} q={it.q} a={it.a} open={openIdx === i}
        onToggle={() => setOpenIdx(openIdx === i ? -1 : i)} />
        )}
      </div>
    </Card>);

};

// === CostCalculator — "ben şu kadar token kullansam ne öderim" ====
const CostCalculator = ({ tweaks }) => {
  const { t } = useT();
  const [modelId, setModelId] = useState('claude-opus-4-7');
  const [monthlyM, setMonthlyM] = useState(10); // million tokens/ay
  const m = modelMeta(modelId);
  const textMul  = tweaks?.textMultiplier ?? 3.0;
  const mediaMul = tweaks?.mediaMultiplier ?? 2.3;
  const rate     = tweaks?.tlRate ?? 47.084289;

  const calculatorPriceOverrides = {
    'claude-opus-4-7': {
      directPerM: 30,
      ourPerM: 1,
      directLabel: t('home.calc.directLabel'),
      ourLabel: 'YAPAYZEKALAB',
    },
  };

  // Yalnızca metin modelleri kalkülatöre dahil.
  const textModels = MODELS.filter(x => x.type === 'text');
  // Ortalama input+output (basit kalkülatör)
  const avgProvider = m.type === 'text' ? (m.input + m.output) / 2 : 0.15;
  const priceOverride = calculatorPriceOverrides[modelId];
  const directPerM = priceOverride?.directPerM ?? avgProvider;
  const ourPerM = priceOverride?.ourPerM ?? computeOurUsd(avgProvider, 'text', { textMul, mediaMul });
  const monthlyOurs = ourPerM * monthlyM;
  const monthlyDirect = directPerM * monthlyM;
  const savedPct = directPerM > 0 ? ((directPerM - ourPerM) / directPerM) * 100 : 0;
  const moreExpensivePct = ourPerM > directPerM ? ((ourPerM - directPerM) / directPerM) * 100 : 0;
  const directLabel = priceOverride?.directLabel ?? t('home.calc.directLabelDefault');
  const ourLabel = priceOverride?.ourLabel ?? 'YAPAYZEKALAB';

  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <div style={{
        background: 'linear-gradient(135deg, var(--accent-bg) 0%, var(--surface) 100%)',
        padding: '20px 24px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Caption style={{ color: 'var(--accent-ink)' }}>{t('home.calc.caption')}</Caption>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.4, marginTop: 5 }}>
              {t('home.calc.titlePrefix')}<span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400 }}>{t('home.calc.titleItalic')}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 4 }}>
              {t('home.calc.subtitle')}
            </div>
          </div>
          <Chip tone="accent">{t('home.calc.liveBadge')}</Chip>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 0 }}>
        {/* Controls */}
        <div style={{ padding: 22, borderRight: '1px solid var(--border)' }}>
          <Caption style={{ marginBottom: 10 }}>{t('home.calc.modelLabel')}</Caption>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--surface-2)',
                    fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--ink)',
                    outline: 'none', marginBottom: 22,
                  }}>
            {textModels.map(x => (
              <option key={x.id} value={x.id}>
                {x.label} — ${calculatorPriceOverrides[x.id]?.directPerM ?? ((x.input + x.output) / 2)}/M
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <Caption>{t('home.calc.monthlyTokens')}</Caption>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 600, letterSpacing: -0.6 }} className="tnum">
              {monthlyM}<span style={{ fontSize: 13, color: 'var(--ink-3)', marginLeft: 3 }}>M</span>
            </div>
          </div>
          <input type="range" min={1} max={500} step={1} value={monthlyM}
                 onChange={(e) => setMonthlyM(Number(e.target.value))}
                 style={{ width: '100%', accentColor: 'var(--accent)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
            <span>1M</span><span>50M</span><span>200M</span><span>500M</span>
          </div>

          <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8, fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>{t('home.calc.quickSelect')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1, 5, 10, 50, 100, 250].map(p => (
                <button key={p} onClick={() => setMonthlyM(p)} style={{
                  padding: '5px 11px', borderRadius: 7, fontSize: 11.5, fontWeight: 500,
                  background: monthlyM === p ? 'var(--accent)' : 'var(--surface)',
                  color: monthlyM === p ? '#fff' : 'var(--ink-2)',
                  border: '1px solid var(--border)',
                }}>{p}M</button>
              ))}
            </div>
          </div>
        </div>

        {/* Result */}
        <div style={{ padding: 22, background: 'var(--surface-2)' }}>
          <Caption>{t('home.calc.monthlyCostFor', { label: directLabel })}</Caption>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
            <div style={{
              fontSize: 48, fontWeight: 600, letterSpacing: -2, lineHeight: 1,
              color: 'var(--accent-ink)', fontFamily: 'var(--font-sans)',
            }} className="tnum">
              ${monthlyDirect.toFixed(2)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }} className="tnum">
              ≈ ₺{(monthlyDirect * rate).toFixed(0)}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
            {t('home.calc.perMillionList', { price: directPerM.toFixed(4) })}
          </div>

          <div style={{ marginTop: 18, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5, marginBottom: 8 }}>{ourLabel}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 24, fontWeight: 500, color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }} className="tnum">${monthlyOurs.toFixed(2)}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>≈ ₺{(monthlyOurs * rate).toFixed(0)}</span>
            </div>
          </div>

          <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 8,
                        background: moreExpensivePct > 0 ? '#fef3ec' : 'var(--ok-bg)',
                        border: `1px solid ${moreExpensivePct > 0 ? '#fed7aa' : '#a7f3d0'}` }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: moreExpensivePct > 0 ? '#9a3412' : '#047857', display: 'flex', alignItems: 'center', gap: 6 }}>
              {moreExpensivePct > 0 ? (
                <>
                  <I.TrendUp size={12} stroke="#9a3412" />
                  {t('home.calc.diffPct', { pct: moreExpensivePct.toFixed(0) })}
                  <span style={{ fontWeight: 400, opacity: 0.8 }}>{t('home.calc.diffNote')}</span>
                </>
              ) : (
                <>
                  <I.Check size={12} stroke="#047857" />
                  {t('home.calc.savedPct', { pct: savedPct.toFixed(0), amount: (monthlyDirect - monthlyOurs).toFixed(2) })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

// === Onboarding wizard ============================================
const OnboardingWizard = ({ onClose, onTab }) => {
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [keyName, setKeyName] = useState('production');
  const [topUp, setTopUp] = useState(10);
  const [keyGenerated, setKeyGenerated] = useState(false);
  const [funded, setFunded] = useState(false);
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState('');

  const steps = [t('home.wiz.step1'), t('home.wiz.step2'), t('home.wiz.step3')];
  const next = () => setStep(s => Math.min(2, s + 1));

  const genKey = () => { setKeyGenerated(true); onTab?.('account'); setTimeout(next, 600); };
  const fund = () => { setFunded(true); onTab?.('account'); setTimeout(next, 600); };
  const sendReq = () => {
    setRunning(true); setResponse('');
    setTimeout(() => {
      setRunning(false);
      const text = t('home.wiz.sampleResponse');
      let i = 0; const it = setInterval(() => {
        i += 2; setResponse(text.slice(0, i));
        if (i >= text.length) clearInterval(it);
      }, 25);
    }, 800);
  };

  return (
    <div onClick={onClose} className="fade-in" style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(8px)',
      zIndex: 100, display: 'grid', placeItems: 'center', padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 540,
        boxShadow: 'var(--sh-3)', overflow: 'hidden',
      }}>
        {/* Progress */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: i <= step ? 'var(--accent)' : 'var(--surface-2)',
                  color: i <= step ? '#fff' : 'var(--ink-3)',
                  display: 'grid', placeItems: 'center',
                  fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  border: i === step ? '2px solid var(--accent-border)' : 'none',
                }}>{i < step ? '✓' : i + 1}</div>
                <span style={{ fontSize: 11.5, color: i <= step ? 'var(--ink)' : 'var(--ink-3)', fontWeight: i === step ? 600 : 500 }}>{s}</span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 1, background: i < step ? 'var(--accent)' : 'var(--border)' }} />}
            </React.Fragment>
          ))}
          <button onClick={onClose} style={{ color: 'var(--ink-3)', padding: 4 }}><I.Close size={14} stroke="var(--ink-3)" /></button>
        </div>

        <div style={{ padding: 28 }}>
          {step === 0 && (
            <>
              <Caption>{t('home.wiz.s1Caption')}</Caption>
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.5, margin: '6px 0 8px' }}>{t('home.wiz.s1Title')}</h3>
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: '0 0 18px' }}>
                {t('home.wiz.s1LeadPrefix')}<strong>{t('home.wiz.s1LeadStrong')}</strong>{t('home.wiz.s1LeadSuffix')}
              </p>
              <input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder={t('home.wiz.s1KeyName')}
                     style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 13, outline: 'none', marginBottom: 14 }} />
              {keyGenerated && (
                <div className="fade-in" style={{ padding: 12, borderRadius: 9, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-ink)' }}>
                  {t('home.wiz.s1Generated')}
                </div>
              )}
              <button onClick={genKey} disabled={keyGenerated} style={primaryBtn(keyGenerated)}>
                <I.Key size={13} stroke="#fff" />
                {keyGenerated ? t('home.wiz.s1BtnDone') : t('home.wiz.s1Btn')}
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <Caption>{t('home.wiz.s2Caption')}</Caption>
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.5, margin: '6px 0 8px' }}>{t('home.wiz.s2Title')}</h3>
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: '0 0 18px' }}>
                {t('home.wiz.s2Lead')}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 600, fontFamily: 'var(--font-sans)' }} className="tnum">${topUp}</span>
              </div>
              <input type="range" min={2} max={100} step={1} value={topUp} onChange={(e) => setTopUp(Number(e.target.value))}
                     style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 18 }} />
              <button onClick={fund} disabled={funded} style={primaryBtn(funded)}>
                <I.Wallet size={13} stroke="#fff" />
                {funded ? t('home.wiz.s2BtnDone') : t('home.wiz.s2Btn', { amount: topUp })}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <Caption>{t('home.wiz.s3Caption')}</Caption>
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.5, margin: '6px 0 8px' }}>{t('home.wiz.s3Title')}</h3>
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: '0 0 14px' }}>
                {t('home.wiz.s3Lead')}
              </p>
              <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 10, fontSize: 11, fontFamily: 'var(--font-mono)', overflow: 'auto', margin: '0 0 14px' }}>
{`curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -d '{"model":"claude-haiku-4-5-20251001","messages":[{"role":"user","content":"Selam"}]}'`}
              </pre>
              {response && (
                <div className="fade-in" style={{ padding: 12, borderRadius: 9, background: 'var(--ok-bg)', border: '1px solid #a7f3d0', marginBottom: 14, fontSize: 12.5, color: '#047857' }}>
                  <strong>{t('home.wiz.s3Connected')}</strong> {response}{response.length < 50 && <span className="caret" />}
                </div>
              )}
              {!response && !running && (
                <button onClick={sendReq} style={primaryBtn(false)}>
                  <I.Play size={11} stroke="#fff" fill="#fff" /> {t('home.wiz.s3SendBtn')}
                </button>
              )}
              {running && (
                <div style={{ padding: 12, fontSize: 12, color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <I.Refresh size={13} stroke="var(--accent-ink)" className="spin-slow" />
                  {t('home.wiz.s3Preparing')}
                </div>
              )}
              {response && (
                <button onClick={() => { onClose(); onTab('home'); }} style={primaryBtn(false)}>
                  <I.Check size={13} stroke="#fff" /> {t('home.wiz.s3DoneBtn')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const primaryBtn = (disabled) => ({
  width: '100%', padding: '11px 16px', borderRadius: 10,
  background: disabled ? '#10b981' : 'var(--accent)', color: '#fff',
  fontSize: 13, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  opacity: disabled ? 0.85 : 1,
});

// === CLI showcase ==================================================
const CLIShowcase = () => {
  const { t } = useT();
  return (
  <Card pad={0} style={{ overflow: 'hidden', background: '#0f172a', color: '#e2e8f0' }}>
    <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <Caption style={{ color: '#94a3b8' }}>{t('home.cli.caption')}</Caption>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.4, marginTop: 6, color: '#f1f5f9' }}>
            <span style={{ fontFamily: 'var(--font-mono)' }}>yzlab</span> <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: '#cbd5e1' }}>{t('home.cli.titleSuffix')}</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
            {t('home.cli.subtitle')}
          </div>
        </div>
        <Chip tone="ok" style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(110,231,183,0.3)' }}>{t('home.cli.beta')}</Chip>
      </div>
    </div>
    <div style={{ padding: 22, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7 }}>
      <div style={{ color: '#94a3b8' }}>{t('home.cli.cmtInstall')}</div>
      <div><span style={{ color: '#a78bfa' }}>npm install</span> <span style={{ color: '#10b981' }}>-g @yapayzekalab/cli</span></div>
      <div style={{ marginTop: 14, color: '#94a3b8' }}>{t('home.cli.cmtLogin')}</div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab login</div>
      <div style={{ marginTop: 14, color: '#94a3b8' }}>{t('home.cli.cmtQuick')}</div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab balance        <span style={{ color: '#64748b' }}>{t('home.cli.cmtBalance')}</span></div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab keys list      <span style={{ color: '#64748b' }}>{t('home.cli.cmtKeys')}</span></div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab models         <span style={{ color: '#64748b' }}>{t('home.cli.cmtModels', { count: MODELS.length })}</span></div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab chat <span style={{ color: '#10b981' }}>"{t('home.cli.chatPrompt')}"</span></div>
      <div style={{ marginTop: 14, color: '#94a3b8' }}>{t('home.cli.cmtStream')}</div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab chat --model claude-opus-4-7 --stream <span style={{ color: '#10b981' }}>&lt; prompt.txt</span></div>
    </div>
  </Card>
  );
};

// === PriceComparison — üretici fiyatı vs YapayZekaLab (6 model, animasyonlu) =====
const CMP_FEATURED_IDS = [
  'claude-opus-4-7', 'gpt-5.5', 'claude-sonnet-4-6',
  'gpt-5.4', 'gemini-3-pro-preview', 'claude-haiku-4-5-20251001',
];

const CMP_REDUCE = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

const CmpCell = ({ m, diff, t, index }) => {
  const ourWidth = Math.max((diff.ourTotal / diff.catTotal) * 100, 3);
  const [shown, setShown] = useState(CMP_REDUCE);
  useEffect(() => {
    if (CMP_REDUCE) return undefined;
    const tmr = setTimeout(() => setShown(true), 80 + index * 110);
    return () => clearTimeout(tmr);
  }, [index]);
  const catV = useCountUp(diff.catTotal, { duration: CMP_REDUCE ? 0 : 1000, decimals: 2 });
  const ourV = useCountUp(diff.ourTotal, { duration: CMP_REDUCE ? 0 : 1000, decimals: 2 });
  const pctV = useCountUp(diff.pct, { duration: CMP_REDUCE ? 0 : 800 });

  const track = { height: 13, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden' };
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12, padding: '15px 16px',
      background: 'var(--surface)', boxShadow: 'var(--sh-1)',
      opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(14px)',
      transition: 'opacity .5s ease, transform .5s cubic-bezier(.22,1,.36,1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.id}</span>
        <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#fff', background: 'var(--ok)', borderRadius: 999, padding: '3px 10px', letterSpacing: -0.4,
          transform: shown ? 'scale(1)' : 'scale(0.6)', opacity: shown ? 1 : 0,
          transition: 'transform .45s cubic-bezier(.34,1.56,.64,1) .25s, opacity .3s ease .25s' }} className="tnum">{t('home.cmp.off', { pct: Math.round(pctV) })}</span>
      </div>
      {/* Üretici (katalog) fiyatı — kırmızı */}
      <div style={{ marginBottom: 9 }}>
        <div style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>{providerLabelFor(m)}{FAST_MODE_IDS.has(m.id) ? ' (Fast mode)' : ''}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', alignItems: 'center', gap: 10 }}>
          <div style={track}>
            <div style={{ height: '100%', width: shown ? '100%' : '0%', borderRadius: 999, background: 'linear-gradient(90deg,#fca5a5,#ef4444)', transition: 'width .8s cubic-bezier(.22,1,.36,1)' }} />
          </div>
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 700, color: '#dc2626' }} className="tnum">{fmt.usdPer(catV)}</span>
        </div>
      </div>
      {/* YapayZekaLab fiyatı — yeşil */}
      <div>
        <div style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: 'var(--ok-ink)', marginBottom: 4 }}>{t('home.cmp.legendYzl')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', alignItems: 'center', gap: 10 }}>
          <div style={track}>
            <div style={{ height: '100%', width: shown ? ourWidth + '%' : '0%', borderRadius: 999, background: 'linear-gradient(90deg,#34d399,#10b981)', transition: 'width .7s cubic-bezier(.22,1,.36,1) .3s' }} />
          </div>
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 700, color: 'var(--ok-ink)' }} className="tnum">{fmt.usdPer(ourV)}</span>
        </div>
      </div>
    </div>
  );
};

const PriceComparison = ({ onTab }) => {
  const { t } = useT();
  const rows = useMemo(() => CMP_FEATURED_IDS
    .map((id) => MODELS_BY_ID[id])
    .filter(Boolean)
    .map((m) => ({ m, diff: computeCatalogDiff(m) }))
    .filter((r) => r.diff), []);
  if (rows.length === 0) return null;
  const avg = Math.round(rows.reduce((s, r) => s + r.diff.pct, 0) / rows.length);

  return (
    <Card pad={26}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: 0.7, color: 'var(--ok-ink)', textTransform: 'uppercase' }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--ok)', boxShadow: '0 0 0 3px var(--ok-bg)' }} />
        {t('home.cmp.eyebrow')}
      </span>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1, lineHeight: 1.12, margin: '14px 0 6px' }}>
        {t('home.cmp.title', { pct: avg })}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5, maxWidth: 580 }}>{t('home.cmp.sub')}</div>

      <div style={{ display: 'flex', gap: 18, margin: '20px 0 16px', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><i style={{ width: 22, height: 7, borderRadius: 3, background: '#ef4444' }} />{t('home.cmp.legendProvider')}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><i style={{ width: 22, height: 7, borderRadius: 3, background: 'var(--ok)' }} />{t('home.cmp.legendYzl')}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--ink-4)' }}>{t('home.cmp.unit')}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '18px 24px' }}>
        {rows.map((r, i) => <CmpCell key={r.m.id} m={r.m} diff={r.diff} t={t} index={i} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>{t('home.cmp.foot')}</span>
        <button onClick={() => onTab?.('models')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700,
          color: '#fff', background: 'var(--ink)', border: 'none', borderRadius: 11, padding: '12px 20px', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          {t('home.cmp.cta')} <I.Arrow size={14} stroke="#fff" />
        </button>
      </div>
    </Card>
  );
};

// === HomeTab =======================================================
const HomeTab = ({ ctx, onTab, onAction }) => {
  const { t } = useT();
  const { logs, tweaks } = ctx;
  const recentLogs = logs.slice(0, 4);
  const [showOnboarding, setShowOnboarding] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ===== HERO + API AKTİVİTESİ ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        {/* Hero card */}
        <Card pad={28} style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <Chip tone="accent" style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: 0.8 }}>
                <I.Sparkle size={11} stroke="var(--accent)" className={tweaks.sparkleSpin === false ? '' : 'spin-slow'} />
                yapayzekalab.org/v1
              </Chip>
              <h1 className="balance" style={{
                fontSize: 34, lineHeight: 1.08, letterSpacing: -1.3,
                fontWeight: 600, margin: '14px 0 10px', color: 'var(--ink)'
              }}>
                {t('home.hero.titlePrefix')}<span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, letterSpacing: -1 }}>{t('home.hero.titleItalic')}</span>{t('home.hero.titleSuffix')}
              </h1>
              <div style={{ fontSize: 14, color: 'var(--ink-2)', fontStyle: 'italic', fontFamily: 'var(--font-serif)', marginBottom: 10 }}>
                {t('home.hero.tagline')}
              </div>
              <p className="pretty" style={{
                fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0
              }}>
                {t('home.hero.leadPrefix')}<strong>{t('home.hero.leadStrong')}</strong>{t('home.hero.leadSuffix')}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                <button onClick={() => onTab('account')} style={{
                  background: 'var(--accent)', color: '#fff',
                  padding: '10px 18px', borderRadius: 9,
                  fontSize: 12.5, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 7,
                  boxShadow: 'var(--sh-1)'
                }}>
                  <span>{t('home.hero.signupCta')}</span><I.Arrow size={13} stroke="#fff" />
                </button>
                <button onClick={() => onTab('models')} style={{
                  background: 'var(--surface)', color: 'var(--ink)',
                  padding: '10px 18px', borderRadius: 9,
                  fontSize: 12.5, fontWeight: 500,
                  border: '1px solid var(--border-st)'
                }}>{t('home.hero.pricingCta')}</button>
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <RouteFlow tweaks={tweaks} />
            </div>
          </div>
        </Card>

        {/* API Aktivitesi side card */}
        <Card pad={16} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Caption>{t('home.activity.caption')}</Caption>
            <Chip tone="accent" style={{ fontSize: 9.5 }}>
              <PulseDot color="var(--accent)" size={5} withRing={false} />
              {tweaks.streamRate === 'off' ? t('home.activity.paused') : t('home.activity.live')}
            </Chip>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentLogs.map((l, i) =>
            <FeedRow key={l.id} log={l} isNew={i === 0} animateIn={tweaks.logSlideIn ?? true} />
            )}
          </div>
        </Card>
      </div>

      {/* ===== FİYAT KARŞILAŞTIRMASI (üretici vs YapayZekaLab) — hero hemen altı ===== */}
      <PriceComparison onTab={onTab} />

      {/* ===== VALUE BANNER ===== */}
      <ValueBanner tweaks={tweaks} onAction={onAction} />

      {/* ===== 3 FEATURE CARDS ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <FeatureCard tone="teal" Ico={I.Layers} title={t('home.feature.modelsTitle')}
        body={t('home.feature.modelsBody')} />
        <FeatureCard tone="indigo" Ico={I.Wallet} title={t('home.feature.pricingTitle')}
        body={t('home.feature.pricingBody')} />
        <FeatureCard tone="purple" Ico={I.Zap} title={t('home.feature.startTitle')}
        body={t('home.feature.startBody')} />
      </div>

      {/* ===== HOW IT WORKS ===== */}
      <HowItWorks />

      {/* ===== COST CALCULATOR ===== */}
      <CostCalculator tweaks={tweaks} />

      {/* ===== CLI showcase ===== */}
      <CLIShowcase />

      {/* ===== QUICKSTART ===== */}
      <Quickstart />

      {/* ===== FAQ ===== */}
      <FAQ />

      {showOnboarding && <OnboardingWizard onClose={() => setShowOnboarding(false)} onTab={onTab} />}
    </div>);

};

export { HomeTab };
