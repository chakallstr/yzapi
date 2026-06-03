import React, { useEffect, useMemo, useRef, useState } from 'react';
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
   HomeTab — YapayZekaLab anasayfa
   Hero · 3 özellik · Nasıl çalışır · Değer önerisi banner ·
   API Aktivitesi · Quickstart · SSS
   ============================================ */

// === RouteFlow — canlı sağlayıcı routing animasyonu ================
// 4 farklı Claude metin modeli arasında routing (Opus/Sonnet/Haiku).
const RouteFlow = ({ tweaks }) => {
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
      fontFamily="var(--font-mono)" fill="var(--ink-2)" fontWeight="500">{tweaks?.routeLblInput ?? 'İstek'}</text>
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
            <I.Layers size={10} stroke="var(--surface)" /> ÇOKLU SAĞLAYICI
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
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: 18, color: 'var(--ink)' }}>model</span><br />
              3 sağlayıcıdan<br />
              tek API key ile
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
            <I.Check size={10} stroke="#047857" /> BAKİYE SİSTEMİ
          </Chip>

          <div style={{
            fontSize: 38, fontWeight: 600, letterSpacing: -1.6, lineHeight: 1, color: 'var(--ink)',
            marginBottom: 14
          }}>
            <span style={{ fontStyle: 'italic', fontWeight: 400, fontFamily: "\"Geist Mono\"" }}>Kota</span> yok.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
            { t: 'Aylık abonelik yok', d: 'Kullandığın kadar düşer' },
            { t: 'Gizli limit yok', d: 'Sağlayıcı limitine kadar açık' },
            { t: 'Süresiz geçerli bakiye', d: 'Kalanı her zaman kullanabilirsin' },
            { t: 'Minimum $2 yükleme', d: 'Test için bile yeterli' }].
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
            <Caption style={{ color: 'var(--accent-ink)' }}>Bu ay TR toplam istek</Caption>
            <div style={{
              fontSize: 36, fontWeight: 600, letterSpacing: -1.4, lineHeight: 1.05,
              color: 'var(--ink)', marginTop: 10, fontFamily: 'var(--font-sans)'
            }} className="tnum">
              {requests.toLocaleString('tr-TR')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <PulseDot color="#10b981" size={6} withRing={false} />
              canlı sayaç · 1.842 aktif lab
            </div>
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 10 }}>
              Claude (Opus/Sonnet/Haiku) metin modelleri — hepsi tek noktadan.
            </div>
            <button onClick={() => onAction?.({ tab: 'account', section: 'account-balance' })} style={{
              background: 'var(--accent)', color: '#fff',
              padding: '8px 14px', borderRadius: 9,
              fontSize: 12, fontWeight: 500, width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7
            }}>
              <span>Bakiye yükle</span><I.Arrow size={12} stroke="#fff" />
            </button>
          </div>
        </div>
      </div>
    </Card>);

};

// === Feed row — model adı başlık + ctx · token · ms + ✓ ============
const FeedRow = ({ log, isNew, animateIn = true }) => {
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
          {log.ctx} ctx · {fmt.num(log.tokens)} token · {log.ms}ms
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
  const [lang, setLang] = useState('python');
  const [copied, setCopied] = useState(false);
  const code = codeSnippets[lang]();

  const [prompt, setPrompt] = useState('Türkçe ürün açıklamalarını İngilizce\'ye çevir');
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
      const fullText = 'Tamam — kısa ve net çeviri yapıldı. 240 token kullanıldı; bakiyenden $0.000098 USD düşüldü (≈ ₺0.0034 bilgi amaçlı).';
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
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>Hızlı başlangıç</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>OpenAI uyumlu — sadece base_url değiştir</div>
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
        }} title="Kopyala">
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
          <Caption style={{ color: 'var(--accent-ink)', fontSize: 9.5 }}>Playground · örnek akış</Caption>
          <Chip tone="accent" style={{ background: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)' }}>
            yzk_live_YOUR_KEY
          </Chip>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="Bir prompt yazın…"
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
            <span>{thinking ? 'Çalışıyor…' : 'Gönder'}</span>
          </button>
        </form>

        {thinking &&
        <div className="fade-in" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-ink)', fontSize: 11.5 }}>
            <span className="think-dot" style={{ animationDelay: '0s' }}>●</span>
            <span className="think-dot" style={{ animationDelay: '0.15s' }}>●</span>
            <span className="think-dot" style={{ animationDelay: '0.30s' }}>●</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>örnek yanıt hazırlanıyor…</span>
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
                <span style={{ fontSize: 11.5, fontWeight: 500 }}>Yanıtlayan:</span>
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
const HowItWorks = () =>
<Card pad={28}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
      <div>
        <Caption>Başla</Caption>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, margin: '6px 0 0' }}>
          Nasıl çalışır?
        </h2>
      </div>
      <Chip tone="ok" style={{ fontFamily: 'var(--font-mono)' }}>5 dakika</Chip>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, position: 'relative' }}>
      {/* Connecting dotted line */}
      <div style={{
      position: 'absolute', top: 24, left: '12%', right: '12%', height: 1,
      borderTop: '1.5px dashed var(--accent-border)', zIndex: 0
    }} />

      {[
    { n: '01', title: 'Kayıt Ol', desc: 'Email veya Google ile 30 saniyede hesap aç' },
    { n: '02', title: 'Bakiye Yükle', desc: 'IBAN havale, Shopier kart veya USDT' },
    { n: '03', title: 'API Key Oluştur', desc: 'Dashboard\'dan yzk_live_… formatında key üret' },
    { n: '04', title: 'İstek Gönder', desc: 'base_url: yapayzekalab.org/v1 yeterli' }].
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
  </Card>;


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
  const [openIdx, setOpenIdx] = useState(0);
  const items = [
  { q: 'OpenAI SDK ile kullanabilir miyim?', a: 'Evet. base_url\'i https://yapayzekalab.org/v1 olarak ayarla, API key\'ini yaz, hazır. Model adları katalogdaki canonical ID ile kullanılır.' },
  { q: 'Hangi API endpointleri destekleniyor?', a: 'Ana canlı endpoint /v1/chat/completions. Anthropic uyumlu kullanım için /v1/messages desteklenir. /v1/responses bu sağlayıcıda aktif değilse JSON hata döner ve ücret yazmaz. Görsel ve video endpointleri sağlayıcı geçişi boyunca 501 JSON hata döndürür ve ücret yazmaz.' },
  { q: 'Bakiye kredi mi, istek mi?', a: 'Bakiye istek değildir. Para yüklersin, API kullandıkça modelin gerçek input/output maliyeti bakiyenden düşer. Aylık abonelik yoktur.' },
  { q: 'Ücretlendirme USD mi yoksa TL mi?', a: 'Ücretlendirme USD bazındadır. Her API çağrısı USD olarak hesaplanıp bakiyenden USD olarak düşer. TL gösterimleri yalnızca bilgi amaçlıdır.' },
  { q: 'Minimum bakiye ne kadar?', a: 'Minimum yükleme 2 USD. Üst limit yok. Bakiye USD bazında tutulur.' },
  { q: 'Hangi ödeme yöntemleri var?', a: 'IBAN banka havalesi (komisyonsuz), Shopier ile kredi/banka kartı, Cryptomus ile USDT (TRC20). Yatırılan TL anlık kurdan USD\'ye çevrilip bakiyene eklenir.' },
  { q: 'Görsel ve video API aktif mi?', a: 'Hayır. Bu geçişte aktif katalog yalnızca metin modelleridir; görsel/video endpointleri 501 döner ve ücretlendirilmez.' },
  { q: 'Veri gizliliği nasıl sağlanıyor?', a: 'İstekler yalnızca ilgili sağlayıcıya iletilir ve loglanmaz. KVKK kapsamında kişisel veriler Türkiye\'de barındırılır.' }];

  return (
    <Card pad={28}>
      <div style={{ marginBottom: 14 }}>
        <Caption>Sıkça sorulanlar</Caption>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, margin: '6px 0 0' }}>
          SSS
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
      directLabel: 'Claude liste fiyatı',
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
  const directLabel = priceOverride?.directLabel ?? 'Piyasa referansı';
  const ourLabel = priceOverride?.ourLabel ?? 'YAPAYZEKALAB';

  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <div style={{
        background: 'linear-gradient(135deg, var(--accent-bg) 0%, var(--surface) 100%)',
        padding: '20px 24px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Caption style={{ color: 'var(--accent-ink)' }}>Bakiye kalkülatörü</Caption>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.4, marginTop: 5 }}>
              Ayda ne kadar <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400 }}>ödersin?</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 4 }}>
              Sürgüleri oynat, gerçek aylık maliyet anında hesaplansın
            </div>
          </div>
          <Chip tone="accent">canlı hesap</Chip>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 0 }}>
        {/* Controls */}
        <div style={{ padding: 22, borderRight: '1px solid var(--border)' }}>
          <Caption style={{ marginBottom: 10 }}>Model</Caption>
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
            <Caption>Aylık token (milyon)</Caption>
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
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8, fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>HIZLI SEÇİM</div>
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
          <Caption>Aylık maliyet · {directLabel}</Caption>
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
            ${directPerM.toFixed(4)} / 1M token · piyasa liste fiyatı
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
                  +%{moreExpensivePct.toFixed(0)} fark
                  <span style={{ fontWeight: 400, opacity: 0.8 }}>(kolaylık ücreti — tek API, TL ödeme, KVKK)</span>
                </>
              ) : (
                <>
                  <I.Check size={12} stroke="#047857" />
                  %{savedPct.toFixed(0)} tasarruf · ${(monthlyDirect - monthlyOurs).toFixed(2)} daha az
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
  const [step, setStep] = useState(0);
  const [keyName, setKeyName] = useState('production');
  const [topUp, setTopUp] = useState(10);
  const [keyGenerated, setKeyGenerated] = useState(false);
  const [funded, setFunded] = useState(false);
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState('');

  const steps = ['API anahtarı', 'Bakiye yükle', 'İlk istek'];
  const next = () => setStep(s => Math.min(2, s + 1));

  const genKey = () => { setKeyGenerated(true); onTab?.('account'); setTimeout(next, 600); };
  const fund = () => { setFunded(true); onTab?.('account'); setTimeout(next, 600); };
  const sendReq = () => {
    setRunning(true); setResponse('');
    setTimeout(() => {
      setRunning(false);
      const text = 'Merhaba! Bu YapayZekaLab örnek yanıtı.';
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
              <Caption>Adım 1 · API anahtarı</Caption>
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.5, margin: '6px 0 8px' }}>İlk anahtarı oluştur</h3>
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: '0 0 18px' }}>
                Bu anahtar OpenAI uyumlu — tüm SDK'larla çalışır. <strong>yalnız bir kez gösterilir</strong>, hemen kopyala.
              </p>
              <input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Anahtar adı (örn. production)"
                     style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 13, outline: 'none', marginBottom: 14 }} />
              {keyGenerated && (
                <div className="fade-in" style={{ padding: 12, borderRadius: 9, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-ink)' }}>
                  API anahtarı paneli açıldı. Raw key yalnızca gerçek oluşturma anında gösterilir.
                </div>
              )}
              <button onClick={genKey} disabled={keyGenerated} style={primaryBtn(keyGenerated)}>
                <I.Key size={13} stroke="#fff" />
                {keyGenerated ? 'API paneli açıldı — devam ediyorum…' : 'API anahtarı panelini aç'}
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <Caption>Adım 2 · Bakiye</Caption>
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.5, margin: '6px 0 8px' }}>Bakiyeni yükle (min $2)</h3>
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: '0 0 18px' }}>
                Bakiye USD bazında tutulur, kullandıkça düşer. Test için $10 yeterli.
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 600, fontFamily: 'var(--font-sans)' }} className="tnum">${topUp}</span>
              </div>
              <input type="range" min={2} max={100} step={1} value={topUp} onChange={(e) => setTopUp(Number(e.target.value))}
                     style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 18 }} />
              <button onClick={fund} disabled={funded} style={primaryBtn(funded)}>
                <I.Wallet size={13} stroke="#fff" />
                {funded ? 'Bakiye paneli açıldı — devam ediyorum…' : `${topUp} USD için ödeme bildirimi aç`}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <Caption>Adım 3 · İlk istek</Caption>
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.5, margin: '6px 0 8px' }}>API'ye bağlandığını test et</h3>
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: '0 0 14px' }}>
                Aşağıdaki komut gerçek endpointi gösterir; çalıştırmak için kendi API anahtarın ve bakiye gerekir.
              </p>
              <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 10, fontSize: 11, fontFamily: 'var(--font-mono)', overflow: 'auto', margin: '0 0 14px' }}>
{`curl -X POST https://yapayzekalab.org/v1/chat/completions \\
  -H "Authorization: Bearer yzk_live_YOUR_KEY" \\
  -d '{"model":"claude-haiku-4-5-20251001","messages":[{"role":"user","content":"Selam"}]}'`}
              </pre>
              {response && (
                <div className="fade-in" style={{ padding: 12, borderRadius: 9, background: 'var(--ok-bg)', border: '1px solid #a7f3d0', marginBottom: 14, fontSize: 12.5, color: '#047857' }}>
                  <strong>✓ Bağlandı.</strong> {response}{response.length < 50 && <span className="caret" />}
                </div>
              )}
              {!response && !running && (
                <button onClick={sendReq} style={primaryBtn(false)}>
                  <I.Play size={11} stroke="#fff" fill="#fff" /> İlk isteği gönder
                </button>
              )}
              {running && (
                <div style={{ padding: 12, fontSize: 12, color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <I.Refresh size={13} stroke="var(--accent-ink)" className="spin-slow" />
                  Örnek yanıt hazırlanıyor…
                </div>
              )}
              {response && (
                <button onClick={() => { onClose(); onTab('home'); }} style={primaryBtn(false)}>
                  <I.Check size={13} stroke="#fff" /> Tamamlandı · panele dön
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
const CLIShowcase = () => (
  <Card pad={0} style={{ overflow: 'hidden', background: '#0f172a', color: '#e2e8f0' }}>
    <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <Caption style={{ color: '#94a3b8' }}>CLI · komut satırı</Caption>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.4, marginTop: 6, color: '#f1f5f9' }}>
            <span style={{ fontFamily: 'var(--font-mono)' }}>yzlab</span> <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: '#cbd5e1' }}>komut satırı aracı</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
            Bakiye sorgula, anahtar yönet, model çağır — terminalden ayrılma.
          </div>
        </div>
        <Chip tone="ok" style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(110,231,183,0.3)' }}>v0.9 beta</Chip>
      </div>
    </div>
    <div style={{ padding: 22, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7 }}>
      <div style={{ color: '#94a3b8' }}># Yükle</div>
      <div><span style={{ color: '#a78bfa' }}>npm install</span> <span style={{ color: '#10b981' }}>-g @yapayzekalab/cli</span></div>
      <div style={{ marginTop: 14, color: '#94a3b8' }}># Giriş yap (tarayıcıdan otomatik token alır)</div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab login</div>
      <div style={{ marginTop: 14, color: '#94a3b8' }}># Hızlı işlemler</div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab balance        <span style={{ color: '#64748b' }}># $15.20 USD · ≈ ₺524</span></div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab keys list      <span style={{ color: '#64748b' }}># 3 aktif anahtar</span></div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab models         <span style={{ color: '#64748b' }}># {MODELS.length} model, fiyat tablosu</span></div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab chat <span style={{ color: '#10b981' }}>"Hangi modelin daha hızlı?"</span></div>
      <div style={{ marginTop: 14, color: '#94a3b8' }}># Otomasyon için stream</div>
      <div><span style={{ color: '#f59e0b' }}>$</span> yzlab chat --model claude-opus-4-7 --stream <span style={{ color: '#10b981' }}>&lt; prompt.txt</span></div>
    </div>
  </Card>
);

// === HomeTab =======================================================
const HomeTab = ({ ctx, onTab, onAction }) => {
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
                Türkiye'nin <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, letterSpacing: -1 }}>Yapay Zekâ</span> API Geçidi
              </h1>
              <div style={{ fontSize: 14, color: 'var(--ink-2)', fontStyle: 'italic', fontFamily: 'var(--font-serif)', marginBottom: 10 }}>
                Kota yok. Gizli limit yok. Aylık abonelik yok.
              </div>
              <p className="pretty" style={{
                fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0
              }}>
                Claude (Opus/Sonnet/Haiku) metin modelleri — hepsi <strong>tek API key</strong> ile. Bakiye yükle, kullandığın kadar öde.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                <button onClick={() => onTab('account')} style={{
                  background: 'var(--accent)', color: '#fff',
                  padding: '10px 18px', borderRadius: 9,
                  fontSize: 12.5, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 7,
                  boxShadow: 'var(--sh-1)'
                }}>
                  <span>Kayıt Ol</span><I.Arrow size={13} stroke="#fff" />
                </button>
                <button onClick={() => onTab('models')} style={{
                  background: 'var(--surface)', color: 'var(--ink)',
                  padding: '10px 18px', borderRadius: 9,
                  fontSize: 12.5, fontWeight: 500,
                  border: '1px solid var(--border-st)'
                }}>Fiyat Listesi</button>
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
            <Caption>API Aktivitesi</Caption>
            <Chip tone="accent" style={{ fontSize: 9.5 }}>
              <PulseDot color="var(--accent)" size={5} withRing={false} />
              {tweaks.streamRate === 'off' ? 'Duraklatıldı' : 'Canlı'}
            </Chip>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentLogs.map((l, i) =>
            <FeedRow key={l.id} log={l} isNew={i === 0} animateIn={tweaks.logSlideIn ?? true} />
            )}
          </div>
        </Card>
      </div>

      {/* ===== VALUE BANNER ===== */}
      <ValueBanner tweaks={tweaks} onAction={onAction} />

      {/* ===== 3 FEATURE CARDS ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <FeatureCard tone="teal" Ico={I.Layers} title="Claude Model Ailesi"
        body="Claude Opus 4.8/4.7/4.6, Sonnet 4.6 ve Haiku 4.5 metin modelleri. Tek API key, tek bakiye, sıfır karmaşıklık." />
        <FeatureCard tone="indigo" Ico={I.Wallet} title="Saydam Fiyatlama"
        body="Katalogda görünen satış fiyatı kullanılır. Tüm ücretlendirme USD bazındadır — TL karşılığı yalnızca bilgi amaçlı gösterilir." />
        <FeatureCard tone="purple" Ico={I.Zap} title="5 Dakikada Başla"
        body="Kayıt ol → Bakiye yükle (IBAN / Shopier / Cryptomus) → API key oluştur → İlk isteği gönder. Kredi kartı zorunlu değil, minimum bakiye 2 USD." />
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
