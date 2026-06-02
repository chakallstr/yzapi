/* ============================================
   Shared: ikonlar, sağlayıcılar, modeller, mock data, hooks.
   Vite/React modülleri için export edilir.
   ============================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// --- Icon factory ---------------------------------------------------
const Icon = ({ d, paths, size = 16, stroke = 'currentColor', fill = 'none', strokeWidth = 1.6, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
       strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
       style={style} className={className} aria-hidden="true">
    {d && <path d={d} />}
    {paths && paths.map((p, i) => <path key={i} d={p} />)}
  </svg>
);

const I = {
  Home:     (p) => <Icon {...p} d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  Folder:   (p) => <Icon {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  Activity: (p) => <Icon {...p} d="M3 12h4l3-8 4 16 3-8h4" />,
  Settings: (p) => <Icon {...p} paths={["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z","M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"]} />,
  Search:   (p) => <Icon {...p} paths={["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z","m21 21-4.3-4.3"]} />,
  Bell:     (p) => <Icon {...p} paths={["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9","M10.3 21a1.94 1.94 0 0 0 3.4 0"]} />,
  Chevron:  (p) => <Icon {...p} d="m6 9 6 6 6-6" />,
  Copy:     (p) => <Icon {...p} paths={["M8 4h10a2 2 0 0 1 2 2v10","M16 8H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Z"]} />,
  Check:    (p) => <Icon {...p} d="M20 6 9 17l-5-5" />,
  Play:     (p) => <Icon {...p} d="M6 4v16l14-8z" fill="currentColor" stroke="none" />,
  Sparkle:  (p) => <Icon {...p} paths={["M12 3v4M12 17v4M3 12h4M17 12h4","m5.6 5.6 2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"]} />,
  Cpu:      (p) => <Icon {...p} paths={["M9 4v3M15 4v3M9 17v3M15 17v3M4 9h3M4 15h3M17 9h3M17 15h3","M6 6h12v12H6z","M9 9h6v6H9z"]} />,
  Zap:      (p) => <Icon {...p} d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />,
  Layers:   (p) => <Icon {...p} paths={["M12 2 2 7l10 5 10-5-10-5z","m2 17 10 5 10-5","m2 12 10 5 10-5"]} />,
  Database: (p) => <Icon {...p} paths={["M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z","M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6","M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"]} />,
  File:     (p) => <Icon {...p} paths={["M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z","M14 3v6h6"]} />,
  Trash:    (p) => <Icon {...p} paths={["M3 6h18","M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2","M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"]} />,
  Upload:   (p) => <Icon {...p} paths={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4","M17 8l-5-5-5 5","M12 3v12"]} />,
  Arrow:    (p) => <Icon {...p} d="M5 12h14M13 6l6 6-6 6" />,
  Clock:    (p) => <Icon {...p} paths={["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z","M12 6v6l4 2"]} />,
  Coin:     (p) => <Icon {...p} paths={["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z","M12 8v8M9 11h6"]} />,
  Refresh:  (p) => <Icon {...p} paths={["M3 12a9 9 0 1 0 3-6.7L3 8","M3 3v5h5"]} />,
  Terminal: (p) => <Icon {...p} paths={["m4 17 6-6-6-6","M12 19h8"]} />,
  Bolt:     (p) => <Icon {...p} d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" fill="currentColor" stroke="none" />,
  Beaker:   (p) => <Icon {...p} paths={["M9 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-10V3","M9 3h6","M7 14h10"]} />,
  TrendUp:  (p) => <Icon {...p} paths={["m22 7-8.5 8.5-5-5L2 17","M16 7h6v6"]} />,
  Close:    (p) => <Icon {...p} d="M18 6 6 18M6 6l12 12" />,
  Wallet:   (p) => <Icon {...p} paths={["M19 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z","M16 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z","M3 7V5a2 2 0 0 1 2-2h12"]} />,
  Key:      (p) => <Icon {...p} paths={["m21 2-9.6 9.6","M15.5 7.5 19 11l3-3-3.5-3.5L15.5 7.5Z","M7 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 0 4.4-4.4"]} />,
  Image:    (p) => <Icon {...p} paths={["M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Z","m21 15-5-5-9 9","M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"]} />,
  Video:    (p) => <Icon {...p} paths={["m22 8-6 4 6 4V8Z","M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z"]} />,
  Text:     (p) => <Icon {...p} paths={["M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2","M9 20h6","M12 4v16"]} />,
  Filter:   (p) => <Icon {...p} d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z" />,
  Shield:   (p) => <Icon {...p} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  Users:    (p) => <Icon {...p} paths={["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2","M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z","M22 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75"]} />,
  Megaphone:(p) => <Icon {...p} paths={["M3 11v2l8 4V7l-8 4Z","M11 7 21 3v18l-10-4","M9 17v3a2 2 0 0 1-4 0v-1"]} />,
  Server:   (p) => <Icon {...p} paths={["M3 4h18v6H3z","M3 14h18v6H3z","M7 7v.01M7 17v.01"]} />,
  Coins:    (p) => <Icon {...p} paths={["M14 8a5 5 0 1 0 0 8 5 5 0 0 0 0-8Z","M14 2a5 5 0 1 0 0 8","M2 5c0 1.7 4 3 9 3s9-1.3 9-3","M2 5v3c0 1.7 4 3 9 3","M2 8v3c0 1.7 4 3 9 3"]} />,
};

// --- Providers catalog --------------------------------------------
const PROVIDERS = {
  anthropic:  { label: 'Anthropic',  short: 'Anthropic',  color: '#c2693a', bg: '#fef3ec', ink: '#7a3a18' },
  openai:     { label: 'OpenAI',     short: 'OpenAI',     color: '#10a37f', bg: '#ecfdf5', ink: '#047857' },
  google:     { label: 'Google',     short: 'Google',     color: '#4285f4', bg: '#eff6ff', ink: '#1d4ed8' },
};

// --- Models catalog -----------------------------------------------
// USD prices: per 1M tokens (input/output). Video: per second (480p/720p/1080p).
// ctx: human-readable context window.
const MODEL_DISPLAY_ORDER = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-1-20250805',
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5-20251101',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-3.1-pro-preview',
  'gemini-3.1-pro-preview-customtools',
  'o3-mini-2025-01-31',
  'o3-mini',
  'o3-2025-04-16',
  'o3',
  'o4-mini-2025-04-16',
  'o4-mini',
  'gpt-5-2025-08-07',
  'gpt-5',
  'gpt-5-mini-2025-08-07',
  'gpt-5-mini',
  'gpt-5-nano-2025-08-07',
  'gpt-5-nano',
  'gpt-5-search-api-2025-10-14',
  'gpt-5-search-api',
  'gpt-5-chat-latest',
  'gpt-5.1-2025-11-13',
  'gpt-5.1',
  'gpt-5.1-chat-latest',
  'gpt-5.2-2025-12-11',
  'gpt-5.2',
  'gpt-5.2-chat-latest',
  'gpt-5.3-chat-latest',
  'gpt-5.4-2026-03-05',
  'gpt-5.4',
  'gpt-5.4-mini-2026-03-17',
  'gpt-5.4-mini',
  'gpt-5.4-nano-2026-03-17',
  'gpt-5.4-nano',
  'claude-opus-4-7',
  'gpt-5.5',
  'gpt-5.5-2026-04-23',
];
const MODEL_DISPLAY_INDEX = Object.fromEntries(MODEL_DISPLAY_ORDER.map((id, index) => [id, index]));

const MODELS = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'anthropic', type: 'text', input: 1.25, output: 1.25, ctx: '1M' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic', type: 'text', input: 1.05, output: 1.05, ctx: '1M' },
  { id: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5', provider: 'anthropic', type: 'text', input: 0.52, output: 0.52, ctx: '1M' },
  { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1', provider: 'anthropic', type: 'text', input: 0.52, output: 0.52, ctx: '1M' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic', type: 'text', input: 0.78, output: 0.78, ctx: '1M' },
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', provider: 'anthropic', type: 'text', input: 0.52, output: 0.52, ctx: '1M' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', provider: 'anthropic', type: 'text', input: 0.52, output: 0.52, ctx: '1M' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'anthropic', type: 'text', input: 0.70, output: 0.70, ctx: '200K' },
  { id: 'gpt-5.5', label: 'GPT-5.5', provider: 'openai', type: 'text', input: 0.96, output: 0.96, ctx: '1M' },
  { id: 'gpt-5.5-2026-04-23', label: 'GPT-5.5 2026-04-23', provider: 'openai', type: 'text', input: 0.96, output: 0.96, ctx: '1M' },
  { id: 'gpt-5.4', label: 'GPT-5.4', provider: 'openai', type: 'text', input: 0.83, output: 0.83, ctx: '1M' },
  { id: 'gpt-5.4-2026-03-05', label: 'GPT-5.4 2026-03-05', provider: 'openai', type: 'text', input: 0.83, output: 0.83, ctx: '1M' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', provider: 'openai', type: 'text', input: 0.75, output: 0.75, ctx: '1M' },
  { id: 'gpt-5.4-mini-2026-03-17', label: 'GPT-5.4 mini 2026-03-17', provider: 'openai', type: 'text', input: 0.75, output: 0.75, ctx: '1M' },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano', provider: 'openai', type: 'text', input: 0.71, output: 0.71, ctx: '1M' },
  { id: 'gpt-5.4-nano-2026-03-17', label: 'GPT-5.4 nano 2026-03-17', provider: 'openai', type: 'text', input: 0.71, output: 0.71, ctx: '1M' },
  { id: 'gpt-5.3-chat-latest', label: 'GPT-5.3 Chat Latest', provider: 'openai', type: 'text', input: 0.67, output: 0.67, ctx: '1M' },
  { id: 'gpt-5.2', label: 'GPT-5.2', provider: 'openai', type: 'text', input: 0.63, output: 0.63, ctx: '1M' },
  { id: 'gpt-5.2-2025-12-11', label: 'GPT-5.2 2025-12-11', provider: 'openai', type: 'text', input: 0.63, output: 0.63, ctx: '1M' },
  { id: 'gpt-5.2-chat-latest', label: 'GPT-5.2 Chat Latest', provider: 'openai', type: 'text', input: 0.63, output: 0.63, ctx: '1M' },
  { id: 'gpt-5.1', label: 'GPT-5.1', provider: 'openai', type: 'text', input: 0.6, output: 0.6, ctx: '1M' },
  { id: 'gpt-5.1-2025-11-13', label: 'GPT-5.1 2025-11-13', provider: 'openai', type: 'text', input: 0.6, output: 0.6, ctx: '1M' },
  { id: 'gpt-5.1-chat-latest', label: 'GPT-5.1 Chat Latest', provider: 'openai', type: 'text', input: 0.6, output: 0.6, ctx: '1M' },
  { id: 'gpt-5', label: 'GPT-5', provider: 'openai', type: 'text', input: 0.58, output: 0.58, ctx: '1M' },
  { id: 'gpt-5-2025-08-07', label: 'GPT-5 2025-08-07', provider: 'openai', type: 'text', input: 0.58, output: 0.58, ctx: '1M' },
  { id: 'gpt-5-chat-latest', label: 'GPT-5 Chat Latest', provider: 'openai', type: 'text', input: 0.54, output: 0.54, ctx: '1M' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', provider: 'openai', type: 'text', input: 0.53, output: 0.53, ctx: '1M' },
  { id: 'gpt-5-mini-2025-08-07', label: 'GPT-5 mini 2025-08-07', provider: 'openai', type: 'text', input: 0.53, output: 0.53, ctx: '1M' },
  { id: 'gpt-5-nano', label: 'GPT-5 nano', provider: 'openai', type: 'text', input: 0.52, output: 0.52, ctx: '1M' },
  { id: 'gpt-5-nano-2025-08-07', label: 'GPT-5 nano 2025-08-07', provider: 'openai', type: 'text', input: 0.52, output: 0.52, ctx: '1M' },
  { id: 'gpt-5-search-api', label: 'GPT-5 Search API', provider: 'openai', type: 'text', input: 0.55, output: 0.55, ctx: '1M' },
  { id: 'gpt-5-search-api-2025-10-14', label: 'GPT-5 Search API 2025-10-14', provider: 'openai', type: 'text', input: 0.55, output: 0.55, ctx: '1M' },
  { id: 'o4-mini', label: 'o4-mini', provider: 'openai', type: 'text', input: 0.6, output: 0.6, ctx: '200K' },
  { id: 'o4-mini-2025-04-16', label: 'o4-mini 2025-04-16', provider: 'openai', type: 'text', input: 0.6, output: 0.6, ctx: '200K' },
  { id: 'o3', label: 'o3', provider: 'openai', type: 'text', input: 0.63, output: 0.63, ctx: '200K' },
  { id: 'o3-2025-04-16', label: 'o3 2025-04-16', provider: 'openai', type: 'text', input: 0.63, output: 0.63, ctx: '200K' },
  { id: 'o3-mini', label: 'o3-mini', provider: 'openai', type: 'text', input: 0.57, output: 0.57, ctx: '200K' },
  { id: 'o3-mini-2025-01-31', label: 'o3-mini 2025-01-31', provider: 'openai', type: 'text', input: 0.57, output: 0.57, ctx: '200K' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', provider: 'google', type: 'text', input: 0.71, output: 0.71, ctx: '1M' },
  { id: 'gemini-3.1-pro-preview-customtools', label: 'Gemini 3.1 Pro Preview Custom Tools', provider: 'google', type: 'text', input: 0.71, output: 0.71, ctx: '1M' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', provider: 'google', type: 'text', input: 0.58, output: 0.58, ctx: '1M' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', provider: 'google', type: 'text', input: 0.58, output: 0.58, ctx: '1M' }
];

MODELS.sort((a, b) => (MODEL_DISPLAY_INDEX[a.id] ?? Number.MAX_SAFE_INTEGER) - (MODEL_DISPLAY_INDEX[b.id] ?? Number.MAX_SAFE_INTEGER));

const MODELS_BY_ID = Object.fromEntries(MODELS.map(m => [m.id, m]));
const MODEL_KEYS = MODELS.map(m => m.id);

// Combined meta: model + provider colors
const modelMeta = (id) => {
  const m = MODELS_BY_ID[id];
  if (!m) return { id, label: id, provider: 'unknown', color: 'var(--ink-3)', bg: 'rgba(15,23,42,0.06)', ink: 'var(--ink-2)' };
  const p = PROVIDERS[m.provider] || { color: 'var(--ink-3)', bg: 'rgba(15,23,42,0.06)', ink: 'var(--ink-2)' };
  return { ...m, color: p.color, bg: p.bg, ink: p.ink, providerLabel: p.label, providerShort: p.short };
};

// Models grouped by type / provider (for the Models browser)
const modelsByType = (type) => MODELS.filter(m => m.type === type);
const modelsByProvider = () => {
  const out = {};
  for (const m of MODELS) (out[m.provider] = out[m.provider] || []).push(m);
  return out;
};

// Common ctx pools per model — used by the streaming feed
const ctxFor = (id) => modelMeta(id).ctx || '128K';

// --- Pricing math --------------------------------------------------
// MODELS içindeki USD değerleri müşteri satış fiyatıdır. TL yalnızca bilgi amaçlı gösterilir.
const computeOurUsd = (usd, type, { textMul, mediaMul }) => {
  return usd;
};
const usdToTL = (usd, rate) => usd * rate;

// Eski API uyumluluğu — ModelsTab hâlâ bunu çağırıyor.
const computeTLPrice = (usdPrice, type, { rate, textMul, mediaMul }) => {
  return usdToTL(computeOurUsd(usdPrice, type, { textMul, mediaMul }), rate);
};

// Pretty USD/TL formatting
const fmt = {
  usd:   (n) => '$' + (n < 1 ? n.toFixed(n < 0.01 ? 4 : 2) : n.toFixed(2)),
  usdPer:(n) => '$' + n.toFixed(n < 0.01 ? 4 : 2),
  usd6:  (n) => '$' + n.toFixed(n < 0.001 ? 6 : 4),
  try:   (n) => '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  num:   (n) => n.toLocaleString('tr-TR'),
  ms:    (n) => Math.round(n) + 'ms',
  cost:  (n) => '$' + n.toFixed(5),
};

// --- Streaming prompt pool ----------------------------------------
const promptPool = [
  { p: 'UV-vis spektrumdaki pikler için Lambert-Beer hesapla',     id: 'claude-opus-4-7',             ms: 2090, cost: 0.00541, t: 1480 },
  { p: 'Tablodaki eksik değerleri tahmin et',                       id: 'gemini-3-flash-preview',      ms: 380,  cost: 0.00029, t: 210 },
  { p: 'Reaksiyon mekanizmasını adım adım açıkla',                  id: 'gpt-5.4',                     ms: 1740, cost: 0.00498, t: 1620 },
  { p: 'JSON\'u CSV\'ye dönüştür',                                   id: 'gpt-5.4-mini',                ms: 240,  cost: 0.00018, t: 120 },
  { p: 'Veri setini z-score ile normalize et',                      id: 'gemini-3.1-pro-preview',      ms: 460,  cost: 0.00034, t: 250 },
  { p: 'GC-MS pikleri için bileşik eşleştirme yap',                  id: 'claude-sonnet-4-6',           ms: 1280, cost: 0.00421, t: 1080 },
  { p: 'Eğri uydurma için en iyi modeli seç',                       id: 'gpt-5.5',                     ms: 980,  cost: 0.00198, t: 1340 },
  { p: 'CSV başlıklarını snake_case\'e çevir',                       id: 'gemini-3-flash-preview',      ms: 180,  cost: 0.00012, t: 80 },
  { p: 'Yayın için literatür özeti çıkar',                           id: 'claude-opus-4-6',             ms: 2410, cost: 0.00612, t: 1820 },
  { p: 'Hata barlarıyla histogram yorumla',                         id: 'gemini-3-pro-preview',        ms: 1640, cost: 0.00378, t: 1120 },
  { p: 'Faz diyagramından soğuma yolunu çıkar',                      id: 'o3',                          ms: 2280, cost: 0.00582, t: 1740 },
  { p: 'Bibliografi DOI\'lerini doğrula',                            id: 'o4-mini',                     ms: 1280, cost: 0.00412, t: 980 },
  { p: 'Müşteri yorumlarını duygu analizine sok',                    id: 'gpt-5-mini',                  ms: 820,  cost: 0.00162, t: 580 },
  { p: 'Hukuki sözleşmedeki riskli maddeleri bul',                   id: 'claude-haiku-4-5-20251001',   ms: 540,  cost: 0.00098, t: 720 },
  { p: 'Türkçe ürün açıklamalarını İngilizce\'ye çevir',              id: 'gpt-5.4-nano',                ms: 690,  cost: 0.00131, t: 880 },
];

// Initial seed for the activity feed — shown before stream kicks in
const mockLogs = [
  { id: 'r-001', prompt: '—', model: 'claude-opus-4-7',           ms: 1840, cost: 0.00412, tokens: 4836, ctx: '1M',   time: '14:32:01', status: 'ok' },
  { id: 'r-002', prompt: '—', model: 'gpt-5.4',                   ms: 904,  cost: 0.00298, tokens: 6306, ctx: '1M',   time: '14:31:48', status: 'ok' },
  { id: 'r-003', prompt: '—', model: 'gemini-3.1-pro-preview',    ms: 589,  cost: 0.00138, tokens: 7271, ctx: '1M',   time: '14:31:30', status: 'ok' },
  { id: 'r-004', prompt: '—', model: 'gpt-5.5',                   ms: 740,  cost: 0.00198, tokens: 5420, ctx: '1M',   time: '14:31:12', status: 'ok' },
  { id: 'r-005', prompt: '—', model: 'claude-haiku-4-5-20251001', ms: 410,  cost: 0.00088, tokens: 1660, ctx: '200K', time: '14:30:54', status: 'ok' },
];

// --- Hooks ----------------------------------------------------------

function useCountUp(target, { duration = 1200, speed = 1, decimals = 0 } = {}) {
  const safe = typeof target === 'number' ? target : 0;
  const [v, setV] = useState(0);

  useEffect(() => {
    if (duration <= 0 || !isFinite(safe)) { setV(safe); return; }
    let raf, cancelled = false;
    const start = performance.now();
    const dur = Math.max(50, duration / Math.max(0.1, speed));

    const tick = (now) => {
      if (cancelled) return;
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(safe * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setV(safe);
    };
    raf = requestAnimationFrame(tick);

    // Safety net: if for any reason RAF doesn't progress, snap to target
    // after dur + 200ms so cards never stay stuck at 0.
    const safetyTimer = setTimeout(() => { if (!cancelled) setV(safe); }, dur + 200);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(safetyTimer);
    };
  }, [safe, duration, speed]);

  return decimals === 0 ? Math.round(v) : Number(v.toFixed(decimals));
}

function nowTime() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
}

function useLogStream({ seed = mockLogs, running = true, intervalMs = 3000, speedMul = 1, max = 60 }) {
  const [logs, setLogs] = useState(seed);
  const idRef = useRef(seed.length);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const pick = promptPool[Math.floor(Math.random() * promptPool.length)];
      idRef.current += 1;
      const tokens = 800 + Math.floor(Math.random() * 6700);
      const ms = Math.max(120, Math.round(pick.ms + (Math.random() - 0.5) * pick.ms * 0.5));
      setLogs(prev => [{
        id: 'r-' + String(idRef.current).padStart(3, '0'),
        prompt: pick.p,
        model: pick.id,
        ms,
        cost: pick.cost,
        tokens,
        ctx: ctxFor(pick.id),
        time: nowTime(),
        status: Math.random() > 0.96 ? 'slow' : 'ok',
      }, ...prev].slice(0, max));
    }, Math.max(400, intervalMs / Math.max(0.1, speedMul)));
    return () => clearInterval(t);
  }, [running, intervalMs, speedMul]);
  return logs;
}

// --- Atoms ----------------------------------------------------------

const Chip = ({ children, tone, style, onClick }) => {
  const tones = {
    accent:  { bg: 'var(--accent-bg)',  fg: 'var(--accent-ink)', bd: 'var(--accent-border)' },
    ok:      { bg: 'var(--ok-bg)',      fg: '#047857',          bd: '#a7f3d0' },
    neutral: { bg: 'rgba(15,23,42,0.04)', fg: 'var(--ink-2)',   bd: 'transparent' },
    outline: { bg: 'transparent', fg: 'var(--ink-2)', bd: 'var(--border)' },
    ink:     { bg: 'var(--ink)', fg: 'var(--surface)', bd: 'transparent' },
    teal:    { bg: 'var(--t-teal-bg)',   fg: 'var(--t-teal)',   bd: 'transparent' },
    indigo:  { bg: 'var(--t-indigo-bg)', fg: 'var(--t-indigo)', bd: 'transparent' },
    purple:  { bg: 'var(--t-purple-bg)', fg: 'var(--t-purple)', bd: 'transparent' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 999,
      fontSize: 10.5, fontWeight: 500, letterSpacing: 0.2,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      fontFamily: 'var(--font-sans)',
      cursor: onClick ? 'pointer' : 'default',
      ...style,
    }}>{children}</span>
  );
};

const PulseDot = ({ color = 'var(--ok)', size = 8, withRing = true, style }) => (
  <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, ...style }}>
    {withRing && <span className="ping" style={{ background: color, opacity: 0.4, borderRadius: '50%' }} />}
    <span className="pulse-dot" style={{
      width: size, height: size, borderRadius: '50%', background: color,
      color: color, display: 'inline-block', position: 'relative',
    }} />
  </span>
);

const Dot = ({ color = 'var(--ok)', size = 6, style }) => (
  <span style={{
    width: size, height: size, borderRadius: '50%',
    background: color, display: 'inline-block', flexShrink: 0, ...style,
  }} />
);

const Caption = ({ children, style }) => (
  <div style={{
    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.2,
    textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 500,
    ...style,
  }}>{children}</div>
);

const Card = ({ children, style, pad = 20, hoverable = false, onClick, id }) => (
  <div id={id} onClick={onClick} className={`card ${hoverable ? 'card-hover' : ''}`} style={{
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding: pad,
    boxShadow: 'var(--sh-1)',
    cursor: onClick ? 'pointer' : 'default',
    ...style,
  }}>{children}</div>
);

// ===================================================================
// MOCK DATA — Admin Paneli ve Müşteri Paneli için ortak
// ===================================================================

const mockUsers = [
  { id: 'u-1248', email: 'mehmet.ay@example.com',     name: 'Mehmet Ay',         balanceTL: 1247.30, totalSpentTL: 384.15, requests: 8420,  status: 'aktif',  plan: 'pro',       keys: 3, joinedAt: '12 Mar 26', lastActive: '14:32', note: 'VIP müşteri', dailyLimit: null },
  { id: 'u-1247', email: 'asli.k@gozeyazilim.com',     name: 'Aslı Köprülü',       balanceTL: 487.32,  totalSpentTL: 142.86, requests: 14022, status: 'aktif',  plan: 'kurumsal',  keys: 5, joinedAt: '24 May 26', lastActive: '14:34', note: '',           dailyLimit: 50 },
  { id: 'u-1246', email: 'devops@gentanum.io',         name: 'Burak Tan',         balanceTL: 92.18,   totalSpentTL: 1208.42,requests: 38240, status: 'aktif',  plan: 'kurumsal',  keys: 12,joinedAt: '8 Şub 26',  lastActive: '14:33', note: 'Yüksek hacim',dailyLimit: null },
  { id: 'u-1245', email: 'demo@yapay.dev',             name: 'Cem Demir',         balanceTL: 18.50,   totalSpentTL: 31.50,  requests: 412,   status: 'aktif',  plan: 'ucretsiz',  keys: 1, joinedAt: '21 May 26', lastActive: '13:18', note: '',           dailyLimit: 10 },
  { id: 'u-1244', email: 'iletisim@labmavi.org',       name: 'Deniz Yılmaz',      balanceTL: 0.00,    totalSpentTL: 240.00, requests: 5210,  status: 'askida', plan: 'pro',       keys: 2, joinedAt: '18 Nis 26', lastActive: '23 May', note: 'Bakiye sıfır', dailyLimit: 30 },
  { id: 'u-1243', email: 'eda@yapayzeka.app',          name: 'Eda Sönmez',        balanceTL: 320.00,  totalSpentTL: 80.00,  requests: 1840,  status: 'aktif',  plan: 'pro',       keys: 2, joinedAt: '2 May 26',  lastActive: '12:42', note: '',           dailyLimit: null },
];

const mockUsageRecords = [
  { id: 'req_9f3a8b', model: 'claude-haiku-4-5-20251001', type: 'chat',     inTok: 1240, outTok:  840, costTL: 0.12, balanceAfterTL: 487.20, ms:  540, status: 'success', err: null,         time: '14:34:02' },
  { id: 'req_9f3a89', model: 'gemini-3.1-pro-preview',    type: 'chat',     inTok: 4620, outTok: 2310, costTL: 0.84, balanceAfterTL: 487.32, ms:  589, status: 'success', err: null,         time: '14:33:48' },
  { id: 'req_9f3a88', model: 'gpt-5.4',                   type: 'chat',     inTok: 3120, outTok: 1680, costTL: 0.68, balanceAfterTL: 488.16, ms:  904, status: 'success', err: null,         time: '14:33:24' },
  { id: 'req_9f3a87', model: 'gpt-5.4-mini',              type: 'responses',inTok:  960, outTok:  420, costTL: 0.16, balanceAfterTL: 488.84, ms:  410, status: 'success', err: null,         time: '14:32:51' },
  { id: 'req_9f3a86', model: 'claude-opus-4-7',           type: 'messages', inTok: 5840, outTok: 1240, costTL: 2.42, balanceAfterTL: 491.24, ms: 2090, status: 'success', err: null,         time: '14:32:18' },
  { id: 'req_9f3a85', model: 'gemini-3-flash-preview',    type: 'chat',     inTok:  420, outTok:  240, costTL: 0.05, balanceAfterTL: 493.66, ms:  380, status: 'success', err: null,         time: '14:31:54' },
  { id: 'req_9f3a84', model: 'gpt-5.5',                   type: 'chat',     inTok: 1820, outTok:  920, costTL: 0.18, balanceAfterTL: 493.71, ms:  740, status: 'success', err: null,         time: '14:31:22' },
  { id: 'req_9f3a83', model: 'claude-sonnet-4-6',         type: 'messages', inTok: 2640, outTok: 1480, costTL: 0.94, balanceAfterTL: 493.89, ms: 1280, status: 'error',   err: 'rate_limit', time: '14:30:48' },
  { id: 'req_9f3a82', model: 'o3',                        type: 'chat',     inTok:  640, outTok:  320, costTL: 0.08, balanceAfterTL: 494.83, ms:  820, status: 'success', err: null,         time: '14:30:12' },
];

const mockPayments = [
  { id: 'pay_a2f9', method: 'shopier',   gross: 250.00, vat: 50.00,  fee: 12.50, net: 187.50, status: 'tamamlandi', createdAt: '24 May 11:42', completedAt: '24 May 11:43' },
  { id: 'pay_a2f8', method: 'iban',      gross: 500.00, vat: 100.00, fee:  0,    net: 400.00, status: 'tamamlandi', createdAt: '20 May 09:18', completedAt: '20 May 14:32' },
  { id: 'pay_a2f7', method: 'cryptomus', gross: 1000.00,vat: 200.00, fee: 50.00, net: 750.00, status: 'tamamlandi', createdAt: '12 May 17:08', completedAt: '12 May 17:11' },
  { id: 'pay_a2f6', method: 'iban',      gross: 100.00, vat: 20.00,  fee:  0,    net:  80.00, status: 'bekliyor',    createdAt: '24 May 15:01', completedAt: null },
  { id: 'pay_a2f5', method: 'shopier',   gross:  50.00, vat: 10.00,  fee:  2.50, net:  37.50, status: 'iptal',       createdAt: '15 May 12:22', completedAt: '15 May 12:23' },
];

const mockAnnouncements = [
  { id: 1, mesaj: 'Metin kataloğu aktif · görsel/video geçici kapalı', tip: 'basari', aktif: true,  baslangic: '24 May 09:00', bitis: '—' },
  { id: 2, mesaj: 'Anthropic planlı bakım: 25 Mayıs 02:00–04:00 arası kısa kesinti',     tip: 'uyari',  aktif: true,  baslangic: '24 May 14:00', bitis: '25 May 04:00' },
  { id: 3, mesaj: 'Cryptomus USDT onay süreleri normal seviyede',                          tip: 'bilgi',  aktif: true,  baslangic: '23 May 18:00', bitis: '—' },
  { id: 4, mesaj: 'GPT katalog fiyatları güncellendi — yeni kur ile TL karşılığı yenilendi', tip: 'basari', aktif: false, baslangic: '20 May 10:00', bitis: '22 May 10:00' },
];

const mockAuditLogs = [
  { id: 1, action: 'config_update',     hedef: 'system',                       ozet: 'kurBuffer 0.015 → 0.020',                  zaman: '14:34:18' },
  { id: 2, action: 'bakiye_update',     hedef: 'u-1248 / Mehmet Ay',           ozet: '+₺500.00 · IBAN onaylandı',                zaman: '14:32:04' },
  { id: 3, action: 'model_override_upsert', hedef: 'claude-opus-4-7',          ozet: 'satış fiyatı geçici kampanya olarak güncellendi', zaman: '14:18:50' },
  { id: 4, action: 'user_update',       hedef: 'u-1244 / Deniz Yılmaz',        ozet: 'durum aktif → askida',                     zaman: '13:42:11' },
  { id: 5, action: 'announcement_create',hedef: 'duyuru #2',                   ozet: 'Anthropic bakım uyarısı yayınlandı',       zaman: '14:00:02' },
  { id: 6, action: 'provider_update',   hedef: 'google',                       ozet: 'durum aktif → yavaş · gecikme 1180ms',     zaman: '13:08:24' },
  { id: 7, action: 'apikey_revoke',     hedef: 'u-1243 / k-0298',              ozet: 'kullanıcı talebi',                          zaman: '12:14:50' },
  { id: 8, action: 'plan_update',       hedef: 'pro plan',                     ozet: 'aylık limit ₺5.000 → ₺7.500',              zaman: '11:58:02' },
];

const mockKurHistory = [
  { ts: '14:00', liveKur: 34.42, sellKur: 34.50, source: 'auto' },
  { ts: '13:00', liveKur: 34.41, sellKur: 34.49, source: 'auto' },
  { ts: '12:00', liveKur: 34.40, sellKur: 34.48, source: 'auto' },
  { ts: '11:00', liveKur: 34.38, sellKur: 34.46, source: 'auto' },
  { ts: '10:00', liveKur: 34.36, sellKur: 34.44, source: 'auto' },
  { ts: '09:00', liveKur: 34.32, sellKur: 34.40, source: 'manual' },
  { ts: '08:00', liveKur: 34.30, sellKur: 34.38, source: 'auto' },
  { ts: '07:00', liveKur: 34.28, sellKur: 34.36, source: 'auto' },
];

const mockProviderStatus = [
  { provider: 'anthropic',  durum: 'aktif',  gecikmeMs: 1820, sonKontrol: '14:34:00', not: '' },
  { provider: 'openai',     durum: 'aktif',  gecikmeMs: 940,  sonKontrol: '14:33:58', not: '' },
  { provider: 'google',     durum: 'aktif',  gecikmeMs: 560,  sonKontrol: '14:34:02', not: '' },
];

// Expose new mock data once it's all defined (avoid TDZ in the first Object.assign).

export {
  Icon, I, Chip, PulseDot, Dot, Caption, Card,
  PROVIDERS, MODELS, MODELS_BY_ID, MODEL_KEYS, modelMeta,
  modelsByType, modelsByProvider, ctxFor,
  computeOurUsd, usdToTL, computeTLPrice, fmt,
  mockLogs, promptPool,
  useCountUp, useLogStream, nowTime,
  mockUsers, mockUsageRecords, mockPayments, mockAnnouncements,
  mockAuditLogs, mockKurHistory, mockProviderStatus,
};
