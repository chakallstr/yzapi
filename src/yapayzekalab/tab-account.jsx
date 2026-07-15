import { useEffect, useMemo, useRef, useState } from 'react';
import {
  I, Card, Chip, Caption, PulseDot, Dot,
  PROVIDERS, MODELS, MODELS_BY_ID, MODEL_KEYS, modelMeta,
  modelsByType, modelsByProvider, ctxFor,
  computeOurUsd, usdToTL, computeTLPrice, fmt,
  OPUS48_LABEL, usdToOpusTokens,
  mockLogs, promptPool, useCountUp, useLogStream, nowTime,
} from './shared.jsx';
import { apiJson, authFetch, getAccessToken, hasStoredAuth } from './auth-client.js';
import { useT } from './i18n/index.jsx';

/* ============================================
   AccountTab — Bakiye (USD birincil) · API anahtarları · ödeme yöntemleri.
   ============================================ */

const payMethods = (t) => [
  { id: 'iban',    label: t('account.payMethod.ibanLabel'),    sub: t('account.payMethod.ibanSub'),    Ico: I.Database, time: t('account.payMethod.ibanTime') },
  { id: 'shopier', label: t('account.payMethod.shopierLabel'), sub: t('account.payMethod.shopierSub'), Ico: I.Wallet,   time: t('account.payMethod.shopierTime') },
  // Kripto ödeme yöntemi müşteri arayüzünden kaldırıldı (sorunlu — 2026-06-21).
  // Backend crypto/cryptomus altyapısı (payments.ts, schema, contract testleri) DOKUNULMADAN bırakıldı;
  // bu satır geri eklenerek seçenek tekrar açılabilir.
];

const mockKeys = [
  { id: 'k-1', name: 'Production',  prefix: 'yzk_live_DEMO_PROD', last: '24 May 14:32', requests: 12480, status: 'active', scopes: ['chat','messages','responses'] },
  { id: 'k-2', name: 'Geliştirme',  prefix: 'yzk_live_DEMO_DEV',  last: '23 May 09:14', requests: 1284,  status: 'active', scopes: ['chat','messages','responses'] },
  { id: 'k-3', name: 'Test',        prefix: 'yzk_live_DEMO_TEST', last: '21 May 18:08', requests: 318,   status: 'paused', scopes: ['chat'] },
];

const SCOPE_META = {
  chat:     { label: 'chat',     color: 'var(--accent-ink)', bg: 'var(--accent-bg)' },
  messages: { label: 'messages', color: 'var(--lav-ink)',    bg: 'var(--t-purple-bg)' },
  responses:{ label: 'responses',color: '#9a3412',            bg: '#fff7ed' },
};
const ALL_SCOPES = Object.keys(SCOPE_META);
const SANDBOX_TOKEN_LIMIT = 5000;
const SANDBOX_IMAGE_LIMIT = 2;

const downloadWithAuth = async (url, filename, t) => {
  const response = await authFetch(url);
  if (!response.ok) throw new Error(t('account.report.downloadFailed', { status: response.status }));
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
};

const currentMonth = () => new Date().toISOString().slice(0, 7);
const asNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const shortDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
// An error counts as "not authenticated" when the API replied 401 or the auth
// client signalled an expired/invalid session (it clears tokens then throws).
const isAuthError = (error) =>
  error?.status === 401 || /oturum|unauthorized|invalid|expired|user role|giriş/i.test(error?.message || '');

const rawKeyText = (key) => key?.fullKey || key?.key || '';
const rawKeyOrMessage = (key, t) => rawKeyText(key) || t('account.sandbox.oldKeyMessage');
const buildWhatsAppPaymentLink = (paymentInstruction) => {
  const url = paymentInstruction?.whatsapp?.whatsappUrl;
  if (url) return url;
  const number = paymentInstruction?.whatsapp?.whatsappNumber;
  const message = paymentInstruction?.whatsapp?.whatsappMessage;
  if (!number || !message) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};

// === AutoRechargeCard — bakiye eşiğe düşünce otomatik yükle ========
const AutoRechargeCard = ({ tweaks, setTweak }) => {
  const { t } = useT();
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(5);
  const [topUpAmount, setTopUpAmount] = useState(25);

  return (
    <Card pad={22}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <Caption>{t('account.autoRecharge.caption')}</Caption>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{t('account.autoRecharge.title')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.5 }}>
            {t('account.autoRecharge.desc')}
          </div>
        </div>
        <button onClick={() => setEnabled(v => !v)} style={{
          width: 48, height: 26, borderRadius: 999,
          background: enabled ? 'var(--accent)' : 'var(--ink-5)',
          position: 'relative', transition: 'background 0.2s',
        }}>
          <span style={{
            position: 'absolute', top: 3, left: enabled ? 25 : 3, width: 20, height: 20, borderRadius: '50%',
            background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
      </div>
      <div style={{ opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? 'auto' : 'none', transition: 'opacity 0.15s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-2)', flexShrink: 0 }}>{t('account.autoRecharge.myBalance')}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>$</span>
          <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
                 style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--ink)', minWidth: 0 }} className="tnum" />
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{t('account.autoRecharge.below')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-2)', flexShrink: 0 }}>{t('account.autoRecharge.auto')}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>$</span>
          <input type="number" value={topUpAmount} onChange={(e) => setTopUpAmount(Number(e.target.value))}
                 style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--ink)', minWidth: 0 }} className="tnum" />
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{t('account.autoRecharge.topUp')}</span>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', fontSize: 11.5, color: 'var(--accent-ink)' }}>
          <strong>Shopier</strong> {t('account.autoRecharge.note', { limit: '$200' })}
        </div>
      </div>
      {!enabled && (
        <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textAlign: 'center', marginTop: 12, fontFamily: 'var(--font-mono)' }}>
          {t('account.autoRecharge.disabled')}
        </div>
      )}
    </Card>
  );
};

// === SandboxKeyCard — ücretsiz test anahtarı =======================
const SandboxKeyCard = ({ sandboxKey, sandboxFullKey, onCreate, busy }) => {
  const { t } = useT();
  const quota = sandboxKey?.sandbox || {};
  const tokenUsed = asNumber(quota.tokenUsed, 0);
  const imageUsed = asNumber(quota.imageUsed, 0);
  const created = Boolean(sandboxKey || sandboxFullKey);
  return (
    <Card pad={22} style={{ background: 'linear-gradient(135deg, var(--ok-bg) 0%, var(--surface) 100%)', border: '1px solid #a7f3d0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: '#10b981', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <I.Beaker size={18} stroke="#fff" />
        </div>
        <div>
          <Caption style={{ color: '#047857' }}>{t('account.sandbox.caption')}</Caption>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{t('account.sandbox.title')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.5 }}>
            {t('account.sandbox.desc')}
          </div>
        </div>
      </div>
      {!created ? (
        <button onClick={onCreate} disabled={busy} style={{
          width: '100%', padding: '10px 14px', borderRadius: 9,
          background: '#10b981', color: '#fff', fontSize: 12.5, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: busy ? 0.7 : 1,
        }}>
          {busy ? <I.Refresh size={13} stroke="#fff" className="spin-slow" /> : <I.Key size={13} stroke="#fff" />}
          {busy ? t('account.sandbox.creating') : t('account.sandbox.create')}
        </button>
      ) : (
        <div className="fade-in" style={{ padding: 12, borderRadius: 9, background: 'var(--surface)', border: '1px dashed #a7f3d0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#047857', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sandboxFullKey || rawKeyOrMessage(sandboxKey, t)}
          </span>
          <button onClick={() => navigator.clipboard?.writeText(sandboxFullKey || rawKeyText(sandboxKey) || '')} style={{ color: '#047857', padding: 4 }}><I.Copy size={12} stroke="#047857" /></button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
        <span>{t('account.sandbox.tokenQuota', { used: fmt.num(tokenUsed) })}</span>
        <span>·</span>
        <span>{t('account.sandbox.imageQuota', { used: fmt.num(imageUsed) })}</span>
        <span>·</span>
        <span>{t('account.sandbox.onceOnly')}</span>
      </div>
    </Card>
  );
};

const TelegramLinkCard = ({ telegram, busy, message, deepLink, onLink, onOpenBot, onRefresh, onUnlink }) => {
  const { t } = useT();
  const linked = Boolean(telegram?.linked);
  const username = telegram?.username ? `@${telegram.username}` : t('account.telegram.defaultUsername');
  const linkedAt = telegram?.linkedAt ? shortDate(telegram.linkedAt) : '—';
  const statusTone = linked ? 'ok' : 'neutral';

  return (
    <Card pad={22} id="account-telegram" style={{ scrollMarginTop: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
        <div>
          <Caption>Telegram</Caption>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{t('account.telegram.subtitle')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.5 }}>
            {t('account.telegram.desc')}
          </div>
        </div>
        <Chip tone={statusTone} style={{ fontSize: 9.5 }}>
          {linked ? t('account.telegram.linked') : t('account.telegram.notLinked')}
        </Chip>
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>{t('account.telegram.account')}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{linked ? username : t('account.telegram.waiting')}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>{t('account.telegram.method')}</div>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{telegram?.linkMethod || 'site-first'}</div>
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>{t('account.telegram.connectedAt')}</div>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{linkedAt}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          onClick={onLink}
          disabled={busy}
          style={{
            padding: '9px 12px',
            borderRadius: 9,
            background: 'var(--ink)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            opacity: busy ? 0.65 : 1,
          }}
        >
          {/* contract: literal "Telegram bağla" must remain in source (telegram-link-contract) */}
          {'Telegram bağla'}
        </button>
        <button
          onClick={onOpenBot}
          disabled={!telegram?.botUrl}
          style={{
            padding: '9px 12px',
            borderRadius: 9,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            fontSize: 12,
            opacity: telegram?.botUrl ? 1 : 0.55,
          }}
        >
          {t('account.telegram.openBot')}
        </button>
        <button
          onClick={onRefresh}
          disabled={busy}
          style={{
            padding: '9px 12px',
            borderRadius: 9,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            fontSize: 12,
            opacity: busy ? 0.65 : 1,
          }}
        >
          {t('account.telegram.refresh')}
        </button>
        <button
          onClick={onUnlink}
          disabled={!linked || busy}
          style={{
            padding: '9px 12px',
            borderRadius: 9,
            border: '1px solid #fecaca',
            background: '#fff5f5',
            color: '#b91c1c',
            fontSize: 12,
            opacity: linked && !busy ? 1 : 0.55,
          }}
        >
          {/* contract: literal "Bağlantıyı kaldır" must remain in source (telegram-link-contract) */}
          {'Bağlantıyı kaldır'}
        </button>
      </div>

      <div style={{ fontSize: 11, color: message ? 'var(--accent-ink)' : 'var(--ink-3)', marginTop: 12, lineHeight: 1.5 }}>
        {message || (linked
          ? t('account.telegram.linkedHint')
          : t('account.telegram.unlinkedHint'))}
      </div>
      {deepLink && !linked && (
        <a
          href={deepLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            marginTop: 10,
            padding: '9px 14px',
            borderRadius: 9,
            background: '#229ED9',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {t('account.telegram.openAndLink')}
        </a>
      )}
    </Card>
  );
};

// === TeamCard — projeye üye davet et ===============================
const TeamCard = ({ team = [], onInvite, onRemove }) => {
  const { t } = useT();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('developer');
  const invite = async () => {
    if (!inviteEmail.includes('@')) return;
    await onInvite?.(inviteEmail, inviteRole);
    setInviteEmail('');
  };
  const roleTone = { sahip: 'accent', admin: 'purple', developer: 'neutral' };
  return (
    <Card pad={22}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <Caption>{t('account.team.caption')}</Caption>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{t('account.team.title')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{t('account.team.desc')}</div>
        </div>
        <Chip tone="neutral" style={{ fontFamily: 'var(--font-mono)' }}>{t('account.team.memberCount', { count: team.length })}</Chip>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {team.map((u, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 80px 80px 70px 20px', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-bg)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600 }}>
              {u.name.split(' ').map(w => w[0]).join('').slice(0,2)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
            </div>
            <Chip tone={roleTone[u.role] || 'neutral'} style={{ fontSize: 9.5, justifySelf: 'start' }}>{u.role}</Chip>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }} className="tnum">{u.requests > 0 ? fmt.num(u.requests) : '—'}</span>
            <Chip tone={u.status === 'aktif' ? 'ok' : 'neutral'} style={{ fontSize: 9.5, justifySelf: 'start', background: u.status === 'beklemede' ? '#fffbeb' : undefined, color: u.status === 'beklemede' ? '#a16207' : undefined }}>{u.status}</Chip>
            <button onClick={() => onRemove?.(u.id)} style={{ color: 'var(--ink-3)', padding: 2 }}>
              {u.role !== 'sahip' ? <I.Close size={11} stroke="var(--ink-3)" /> : null}
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@adresi.com"
               style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 12, outline: 'none' }} />
        <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          <option value="developer">developer</option>
          <option value="admin">admin</option>
        </select>
        <button onClick={invite} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--ink)', color: '#fff', fontSize: 12, fontWeight: 600 }}>{t('account.team.invite')}</button>
      </div>
    </Card>
  );
};

// === WebhookCard — Slack/Discord bildirim entegrasyonu =============
const eventKeyMap = {
  lowBalance: 'low_balance',
  anomaly: 'usage_anomaly',
  dailyReport: 'daily_summary',
  providerDown: 'provider_down',
};

const WebhookCard = ({ webhooks, onSaveWebhook, onTestWebhook }) => {
  const { t } = useT();
  const [slackUrl, setSlackUrl] = useState('');
  const [discordUrl, setDiscordUrl] = useState('');
  const [events, setEvents] = useState({ lowBalance: true, anomaly: true, dailyReport: false, providerDown: true });
  const [testing, setTesting] = useState(null);
  const selectedEvents = Object.entries(eventKeyMap).filter(([uiKey]) => events[uiKey]).map(([, apiKey]) => apiKey);
  const save = async () => {
    await onSaveWebhook?.({ slackUrl, discordUrl, events: selectedEvents });
  };
  const test = async (which) => {
    setTesting(which);
    try {
      await onSaveWebhook?.({ slackUrl, discordUrl, events: selectedEvents });
      await onTestWebhook?.(which);
    } finally {
      setTesting(null);
    }
  };
  useEffect(() => {
    if (!webhooks) return;
    const incoming = Array.isArray(webhooks.events) ? webhooks.events : [];
    setSlackUrl(webhooks.slackUrl || '');
    setDiscordUrl(webhooks.discordUrl || '');
    setEvents({
      lowBalance: incoming.includes('low_balance'),
      anomaly: incoming.includes('usage_anomaly'),
      dailyReport: incoming.includes('daily_summary'),
      providerDown: incoming.includes('provider_down'),
    });
  }, [webhooks]);
  return (
    <Card pad={22}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <Caption>{t('account.webhook.caption')}</Caption>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>Slack &amp; Discord {t('account.webhook.integration')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{t('account.webhook.desc')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { id: 'slack',   label: 'Slack',   url: slackUrl,   setUrl: setSlackUrl,   color: '#4a154b', bg: '#f5e6f5' },
          { id: 'discord', label: 'Discord', url: discordUrl, setUrl: setDiscordUrl, color: '#5865f2', bg: '#eef0fe' },
        ].map(w => (
          <div key={w.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: w.color, background: w.bg, padding: '3px 8px', borderRadius: 5 }}>{w.label}</span>
              <span style={{ fontSize: 10.5, color: w.url ? '#047857' : 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                {w.url ? t('account.webhook.connected') : t('account.webhook.notConnected')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={w.url} onChange={(e) => w.setUrl(e.target.value)} placeholder="webhook URL"
                     style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none' }} />
              <button onClick={() => test(w.id)} disabled={!w.url || testing === w.id} style={{
                padding: '7px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 500,
                background: testing === w.id ? 'var(--ok-bg)' : 'var(--surface)',
                color: testing === w.id ? '#047857' : 'var(--ink-2)',
                border: '1px solid var(--border)', opacity: !w.url ? 0.5 : 1,
              }}>{testing === w.id ? t('account.webhook.sent') : t('account.webhook.test')}</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
        <Caption style={{ color: 'var(--accent-ink)', marginBottom: 8 }}>{t('account.webhook.eventTypes')}</Caption>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { k: 'lowBalance',   label: t('account.webhook.evtLowBalance') },
            { k: 'anomaly',      label: t('account.webhook.evtAnomaly') },
            { k: 'providerDown', label: t('account.webhook.evtProviderDown') },
            { k: 'dailyReport',  label: t('account.webhook.evtDaily') },
          ].map(e => (
            <label key={e.k} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--accent-ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={events[e.k]} onChange={(ev) => setEvents(s => ({ ...s, [e.k]: ev.target.checked }))}
                     style={{ accentColor: 'var(--accent)' }} />
              {e.label}
            </label>
          ))}
        </div>
        <button onClick={save} style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 11.5, fontWeight: 600 }}>
          {t('account.webhook.saveSettings')}
        </button>
      </div>
    </Card>
  );
};

// === MonthlyReportCard — kullanım raporu indir =====================
const MonthlyReportCard = ({ report, onMonthChange, onDownloadReport }) => {
  const { t } = useT();
  const [month, setMonth] = useState(currentMonth());
  const [downloading, setDownloading] = useState(null);
  const summary = report?.summary || {};
  const dl = async (fmt) => {
    setDownloading(fmt);
    try {
      await onDownloadReport?.(month, fmt);
    } finally {
      setDownloading(null);
    }
  };
  const changeMonth = (value) => {
    setMonth(value);
    onMonthChange?.(value);
  };
  return (
    <Card pad={22}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <Caption>{t('account.report.caption')}</Caption>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{t('account.report.title')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{t('account.report.desc')}</div>
        </div>
        <select value={month} onChange={(e) => changeMonth(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
          {[currentMonth(), '2026-04','2026-03','2026-02','2026-01','2025-12'].filter((m, i, a) => a.indexOf(m) === i).map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div style={{ padding: 14, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[
            { l: t('account.report.requests'), v: fmt.num(asNumber(summary.requestCount, 0)) },
            { l: t('account.report.token'),    v: fmt.num(asNumber(summary.inputTokens, 0) + asNumber(summary.outputTokens, 0)) },
            { l: t('account.report.cost'),     v: `$${asNumber(summary.costUsd, 0).toFixed(2)}` },
            { l: t('account.report.payment'),  v: `₺${asNumber(summary.paymentTL, 0).toFixed(2)}` },
          ].map((s, i) => (
            <div key={i}>
              <Caption style={{ fontSize: 8.5 }}>{s.l}</Caption>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, fontFamily: 'var(--font-mono)' }} className="tnum">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => dl('csv')} disabled={downloading === 'csv'} style={{
          flex: 1, padding: '10px 14px', borderRadius: 8, background: 'var(--ink)', color: '#fff',
          fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}>
          {downloading === 'csv' ? <I.Refresh size={12} stroke="#fff" className="spin-slow" /> : <I.File size={12} stroke="#fff" />}
          {downloading === 'csv' ? t('account.report.preparing') : t('account.report.csvDownload')}
        </button>
        <button onClick={() => dl('pdf')} disabled={downloading === 'pdf'} style={{
          flex: 1, padding: '10px 14px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--ink)',
          fontSize: 12, fontWeight: 600, border: '1px solid var(--border-st)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}>
          {downloading === 'pdf' ? <I.Refresh size={12} stroke="var(--ink)" className="spin-slow" /> : <I.File size={12} stroke="var(--ink)" />}
          {downloading === 'pdf' ? t('account.report.preparing') : t('account.report.pdfDownload')}
        </button>
      </div>
    </Card>
  );
};

const TopUpAmount = ({ amount, selected, onSelect, tlRate }) => {
  const { t } = useT();
  return (
  <button onClick={() => onSelect(amount)} style={{
    padding: '14px 12px', borderRadius: 12,
    border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
    background: selected ? 'var(--accent-bg)' : 'var(--surface)',
    textAlign: 'center',
    transition: 'all 0.15s',
    position: 'relative',
  }}>
    {selected && <I.Check size={11} stroke="var(--accent)" style={{ position: 'absolute', top: 6, right: 6 }} />}
    <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.4, color: selected ? 'var(--accent-ink)' : 'var(--ink)', fontFamily: 'var(--font-sans)' }} className="tnum">
      ${amount}
    </div>
    <div style={{ fontSize: 9.5, color: selected ? 'var(--accent-ink)' : 'var(--ink-3)', marginTop: 2, fontFamily: 'var(--font-mono)' }} className="tnum">
      {t('account.topUpAmount.tokenApprox', { tokens: fmt.tokens(usdToOpusTokens(amount)) })}
    </div>
    <div style={{ fontSize: 9, color: 'var(--ink-4)', marginTop: 1, fontFamily: 'var(--font-mono)' }} className="tnum">
      ≈ ₺{(amount * tlRate).toFixed(0)}
    </div>
  </button>
  );
};

const AccountTab = ({ ctx }) => {
  const { t } = useT();
  const { tweaks, setTweak, goto } = ctx;
  const fallbackBalanceUSD = 0;
  const tlRate = tweaks.tlRate ?? 34.5;
  const MIN_USD = 5;

  // Scroll to sub-section when goto changes (driven by UserMenu items)
  useEffect(() => {
    if (!goto) return;
    const targetId = goto.startsWith('account-') ? goto : `account-${goto}`;
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('section-flash');
      setTimeout(() => el.classList.remove('section-flash'), 1500);
    }
  }, [goto]);

  const [topUp, setTopUp] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [payMethod, setPayMethod] = useState('iban');
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [keyName, setKeyName] = useState('production-key');
  const [panelError, setPanelError] = useState('');
  const [panelBusy, setPanelBusy] = useState(false);
  const [me, setMe] = useState(null);
  // Balance load lifecycle — distinguishes a genuine zero balance from auth/load
  // failures so we never show a misleading $0.00. Starts as 'loading'; becomes
  // 'unauthed' when no token / 401, 'error' on transient/network failure, or
  // 'ok' once /api/user/me succeeds.
  const [balanceState, setBalanceState] = useState(hasStoredAuth() ? 'loading' : 'unauthed');
  const [apiKeys, setApiKeys] = useState([]);
  const [usageRows, setUsageRows] = useState([]);
  const [paymentRows, setPaymentRows] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState(null);
  const [paymentInstruction, setPaymentInstruction] = useState(null);
  const [topUpCooldown, setTopUpCooldown] = useState(0);
  // İade politikası onay kapısı: onaylanmadan ödeme alanı bulanık/kapalı (her ziyarette tekrar onay).
  const [refundOk, setRefundOk] = useState(false);
  const [team, setTeam] = useState([]);
  const [webhooks, setWebhooks] = useState(null);
  const [sandboxKey, setSandboxKey] = useState(null);
  const [sandboxFullKey, setSandboxFullKey] = useState('');
  const [sandboxBusy, setSandboxBusy] = useState(false);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [settingsName, setSettingsName] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [usageModelFilter, setUsageModelFilter] = useState('all');
  const [usageRangeFilter, setUsageRangeFilter] = useState('all');
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState('');
  const [telegramDeepLink, setTelegramDeepLink] = useState('');
  const telegramPollRef = useRef(null);

  const hasLoadedBalance = me?.bakiyeUsd !== undefined && me?.bakiyeUsd !== null;
  const balanceUSD = asNumber(me?.bakiyeUsd, fallbackBalanceUSD);
  // Only show a balance number when we truly have one: a fresh success, or an
  // error/refresh state that still holds a previously-loaded (last-known) value.
  const showBalanceNumber = balanceState === 'ok' || (balanceState === 'error' && hasLoadedBalance);
  const userCode = me?.userCode || (me?.id ? `u-${String(me.id).replace(/-/g, '').slice(0, 8)}` : 'profil');
  const monthCostUsd = asNumber(monthlyReport?.summary?.costUsd, usageRows.reduce((sum, row) => sum + asNumber(row.costUsd, asNumber(row.costTL, 0) / tlRate), 0));
  const monthRequests = asNumber(monthlyReport?.summary?.requestCount, usageRows.length);

  // Kullanım geçmişi filtreleri (saf frontend — billing'e dokunmaz).
  // "Opus istedim ama hep Haiku görünüyor" yanılgısını çözer: arka plan (Claude Code
  // SMALL_FAST_MODEL = Haiku) mikro-istekleri model/tarih ile ayrıştırılabilir.
  const usageModelOptions = useMemo(() => {
    const ids = new Set();
    for (const row of usageRows) {
      const id = row.modelId || row.model;
      if (id) ids.add(id);
    }
    return [...ids].sort();
  }, [usageRows]);

  const filteredUsageRows = useMemo(() => {
    const rangeMs = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[usageRangeFilter];
    const cutoff = rangeMs ? Date.now() - rangeMs : null;
    return usageRows.filter((row) => {
      if (usageModelFilter !== 'all' && (row.modelId || row.model) !== usageModelFilter) return false;
      if (cutoff !== null) {
        const ts = row.timestamp ? Date.parse(row.timestamp) : NaN;
        if (Number.isFinite(ts) && ts < cutoff) return false;
      }
      return true;
    });
  }, [usageRows, usageModelFilter, usageRangeFilter]);

  const applyMeData = (meData) => {
    setMe(meData);
    setSettingsName(meData?.adSoyad || '');
    if (meData?.bakiyeUsd !== undefined) setTweak('balanceUSD', asNumber(meData.bakiyeUsd, fallbackBalanceUSD));
  };

  const refreshMe = async () => {
    const meData = await apiJson('/api/user/me');
    applyMeData(meData);
    setBalanceState('ok');
    return meData;
  };

  const stopTelegramPolling = () => {
    if (telegramPollRef.current) {
      window.clearInterval(telegramPollRef.current);
      telegramPollRef.current = null;
    }
  };

  const startTelegramPolling = () => {
    stopTelegramPolling();
    const startedAt = Date.now();
    telegramPollRef.current = window.setInterval(async () => {
      try {
        const meData = await refreshMe();
        if (meData?.telegram?.linked) {
          setTelegramMessage(t('account.telegram.linkedMessage'));
          stopTelegramPolling();
        } else if (Date.now() - startedAt > 90_000) {
          setTelegramMessage(t('account.telegram.notCompleted'));
          stopTelegramPolling();
        }
      } catch {
        stopTelegramPolling();
      }
    }, 4000);
  };

  const loadMonthlyReport = async (month = currentMonth()) => {
    const report = await apiJson(`/api/user/reports/monthly?month=${encodeURIComponent(month)}`);
    setMonthlyReport(report);
    return report;
  };

  const loadAccount = async () => {
    if (!getAccessToken()) {
      // No token at all: this is the not-authenticated state, not a zero balance.
      setBalanceState('unauthed');
      return;
    }
    setPanelBusy(true);
    setPanelError('');
    if (balanceState !== 'ok') setBalanceState('loading');
    const safe = (promise, fallback) => promise.catch(() => fallback);
    try {
      // The balance (me) request is tracked separately so we can tell apart a
      // genuine zero balance from an auth failure or a transient load error.
      // The remaining requests keep their empty-state fallbacks — they drive
      // non-balance UI (keys, usage, payments…) where "empty" is acceptable.
      const meResult = await apiJson('/api/user/me').then(
        (data) => ({ ok: true, data }),
        (error) => ({ ok: false, error }),
      );
      const [keysData, usageData, paymentsData, methodsData, teamData, webhookData, sandboxData, reportData] = await Promise.all([
        safe(apiJson('/api/user/api-keys'), []),
        safe(apiJson('/api/user/usage-records'), []),
        safe(apiJson('/api/payments/me'), []),
        safe(apiJson('/api/payments/methods'), null),
        safe(apiJson('/api/user/team/members'), []),
        safe(apiJson('/api/user/webhooks'), null),
        safe(apiJson('/api/user/sandbox-key'), null),
        safe(apiJson(`/api/user/reports/monthly?month=${currentMonth()}`), null),
      ]);

      if (meResult.ok) {
        applyMeData(meResult.data);
        setBalanceState('ok');
      } else if (isAuthError(meResult.error)) {
        // 401 / expired session: clear stale balance, show the login prompt.
        applyMeData(null);
        setBalanceState('unauthed');
      } else {
        // Transient/network/5xx: do NOT reset to 0 — keep any last-known balance
        // (label it as such in the UI) and surface a retry affordance.
        setBalanceState('error');
        setPanelError(meResult.error instanceof Error ? meResult.error.message : t('account.balanceLoadFailedFallback'));
      }

      setApiKeys(Array.isArray(keysData) ? keysData : []);
      setUsageRows(Array.isArray(usageData) ? usageData : []);
      setPaymentRows(Array.isArray(paymentsData) ? paymentsData : []);
      setPaymentMethods(methodsData);
      setTeam(Array.isArray(teamData) ? teamData : []);
      setWebhooks(webhookData);
      setSandboxKey(sandboxData);
      setMonthlyReport(reportData);
      if (meResult.ok) setSettingsMessage('');
    } catch (error) {
      setBalanceState((prev) => (prev === 'ok' ? 'ok' : 'error'));
      setPanelError(error instanceof Error ? error.message : t('account.panelLoadFailed'));
    } finally {
      setPanelBusy(false);
    }
  };

  useEffect(() => {
    loadAccount();
  }, []);

  useEffect(() => () => stopTelegramPolling(), []);

  useEffect(() => {
    const handleLinked = () => {
      void loadAccount();
      setTelegramMessage(t('account.telegram.linkedMessage'));
      stopTelegramPolling();
    };
    const handleError = (event) => {
      const detail = typeof event?.detail === 'string' ? event.detail : t('account.telegram.linkErrorGeneric');
      setTelegramMessage(detail);
      stopTelegramPolling();
    };
    window.addEventListener('yz:telegram-linked', handleLinked);
    window.addEventListener('yz:telegram-link-error', handleError);
    return () => {
      window.removeEventListener('yz:telegram-linked', handleLinked);
      window.removeEventListener('yz:telegram-link-error', handleError);
    };
  }, []);

  const createApiKey = async () => {
    const created = await apiJson('/api/user/api-keys', { method: 'POST', body: { ad: keyName || 'production-key' } });
    setNewKey(created.key);
    setShowNewKey(true);
    await loadAccount();
  };

  const revokeApiKey = async (key) => {
    if (!key?.id) return;
    const ok = window.confirm(t('account.keys.revokeConfirm', { name: key.ad || key.name || t('account.keys.defaultName') }));
    if (!ok) return;
    await apiJson(`/api/user/api-keys/${key.id}/revoke`, { method: 'POST' });
    await loadAccount();
  };

  const createSandboxKey = async () => {
    setSandboxBusy(true);
    setPanelError('');
    try {
      const created = await apiJson('/api/user/sandbox-key', { method: 'POST' });
      setSandboxFullKey(created.key || '');
      setSandboxKey(created);
      await loadAccount();
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : t('account.sandbox.createFailed'));
    } finally {
      setSandboxBusy(false);
    }
  };

  const saveProfileSettings = async () => {
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      const updated = await apiJson('/api/user/me', { method: 'PATCH', body: { adSoyad: settingsName } });
      setMe(updated);
      if (updated?.bakiyeUsd !== undefined) {
        setTweak('balanceUSD', asNumber(updated.bakiyeUsd, fallbackBalanceUSD));
        setBalanceState('ok');
      }
      setSettingsName(updated?.adSoyad || settingsName);
      setSettingsMessage(t('account.settings.profileSaved'));
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : t('account.settings.saveFailed'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const inviteTeamMember = async (email, role) => {
    await apiJson('/api/user/team/invite', { method: 'POST', body: { email, role } });
    await loadAccount();
  };

  const removeTeamMember = async (id) => {
    if (!id) return;
    await apiJson(`/api/user/team/members/${id}`, { method: 'DELETE' });
    await loadAccount();
  };

  const saveWebhook = async (payload) => {
    const saved = await apiJson('/api/user/webhooks', { method: 'PATCH', body: payload });
    setWebhooks(saved);
  };

  const testWebhook = async (channel) => {
    await apiJson('/api/user/webhooks/test', { method: 'POST', body: { channel } });
  };

  const downloadReport = async (month, format) => {
    await downloadWithAuth(`/api/user/reports/monthly?month=${encodeURIComponent(month)}&format=${format}`, `yapayzekalab-${month}.${format}`, t);
  };

  const startTelegramLink = async () => {
    setTelegramBusy(true);
    setTelegramMessage('');
    setTelegramDeepLink('');
    try {
      const result = await apiJson('/api/telegram/link-code', { method: 'POST' });
      const url = result?.deepLinkUrl || '';
      if (url) {
        setTelegramDeepLink(url);
        const win = window.open(url, '_blank', 'noopener,noreferrer');
        if (!win) {
          // Popup blocked (common when opened automatically without a click).
          setTelegramMessage(t('account.telegram.popupBlocked'));
        } else {
          setTelegramMessage(t('account.telegram.botOpened'));
        }
      } else {
        setTelegramMessage(t('account.telegram.prepareFailed'));
      }
      startTelegramPolling();
    } catch (error) {
      setTelegramMessage(error instanceof Error ? error.message : t('account.telegram.codeFailed'));
    } finally {
      setTelegramBusy(false);
    }
  };

  // Arrived from the Telegram bot "bağla" button (App stored the intent): once the
  // account panel is open and not yet linked, AUTO-start the deep-link connect so
  // the user does not have to find/press another button.
  useEffect(() => {
    let intent = false;
    try { intent = sessionStorage.getItem('yz_telegram_connect') === '1'; } catch { /* ignore */ }
    if (!intent) return;
    if (me === undefined || me === null) return; // wait until account loaded
    try { sessionStorage.removeItem('yz_telegram_connect'); } catch { /* ignore */ }
    const el = document.getElementById('account-telegram');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('section-flash');
      setTimeout(() => el.classList.remove('section-flash'), 1500);
    }
    if (me?.telegram?.linked) {
      setTelegramMessage(t('account.telegram.alreadyLinked'));
      return;
    }
    // Auto-trigger the working deep-link connect flow.
    void startTelegramLink();
  }, [me]);

  const openTelegramBot = () => {
    if (me?.telegram?.botUrl) window.open(me.telegram.botUrl, '_blank', 'noopener,noreferrer');
  };

  const refreshTelegramLink = async () => {
    setTelegramBusy(true);
    try {
      const meData = await refreshMe();
      setTelegramMessage(meData?.telegram?.linked ? t('account.telegram.statusCurrent') : t('account.telegram.statusNotLinked'));
    } catch (error) {
      setTelegramMessage(error instanceof Error ? error.message : t('account.telegram.refreshFailed'));
    } finally {
      setTelegramBusy(false);
    }
  };

  const unlinkTelegramLink = async () => {
    if (!me?.telegram?.linked) return;
    const ok = window.confirm(t('account.telegram.unlinkConfirm'));
    if (!ok) return;
    setTelegramBusy(true);
    try {
      await apiJson('/api/telegram/unlink', { method: 'POST' });
      stopTelegramPolling();
      await refreshMe();
      setTelegramMessage(t('account.telegram.unlinkedMessage'));
    } catch (error) {
      setTelegramMessage(error instanceof Error ? error.message : t('account.telegram.unlinkFailed'));
    } finally {
      setTelegramBusy(false);
    }
  };

  const rawAmount = customAmount ? Number(customAmount) : topUp;
  const effectiveAmount = Math.max(MIN_USD, isFinite(rawAmount) ? rawAmount : 0);
  const belowMin = (customAmount && Number(customAmount) > 0 && Number(customAmount) < MIN_USD);
  const creditTL = effectiveAmount * tlRate;
  const payableTL = Math.ceil(effectiveAmount * tlRate);
  const roundingTL = Math.max(0, payableTL - creditTL);
  const cryptoInvoiceUsd = Math.ceil(effectiveAmount * 100) / 100;
  const paymentTotalLabel = payMethod === 'crypto'
    ? `$${cryptoInvoiceUsd.toFixed(2)} USDT`
    : `₺${payableTL.toFixed(0)}`;
  const backendPaymentMethod = payMethod === 'crypto' ? 'cryptomus' : payMethod;
  const selectedPaymentMethod = paymentMethods?.[backendPaymentMethod];
  const paymentMethodEnabled = selectedPaymentMethod?.enabled !== false;

  // Ödeme butonu başarılı IBAN init'ten sonra 60sn geri-sayımla pasifleşir (müşterinin
  // ard arda basıp bildirim tetiklemesini önler; sunucu da ayrıca tekilleştirir).
  useEffect(() => {
    if (topUpCooldown <= 0) return undefined;
    const id = setInterval(() => setTopUpCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [topUpCooldown]);

  // Müşteri "Ödedim" linkine basınca: <a> wa.me'yi açar (müşterinin kendi WhatsApp'ı);
  // bu handler AYRICA sistemin de Ufuk'a otomatik bildirmesi için confirm ucunu çağırır.
  const onConfirmIbanPaidNotify = () => {
    const paymentId = paymentInstruction?.paymentId;
    if (!paymentId) return;
    apiJson('/api/payments/iban/confirm', { method: 'POST', body: { paymentId } }).catch(() => {});
  };

  const onTopUp = async () => {
    if (!refundOk) return; // iade politikası onaylanmadan ödeme başlatılamaz (klavye/bypass savunması)
    if (effectiveAmount < MIN_USD) return;
    if (!paymentMethodEnabled) {
      setPanelError(selectedPaymentMethod?.reason || t('account.topUp.methodClosedAlert'));
      return;
    }
    setPanelBusy(true);
    setPanelError('');
    try {
      const result = await apiJson(`/api/payments/${payMethod}/init`, {
        method: 'POST',
        body: { amountUsd: effectiveAmount },
      });

      if (payMethod === 'shopier' && result?.actionUrl && result?.fields) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = result.actionUrl;
        for (const [name, value] of Object.entries(result.fields)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = String(value);
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        return;
      }

      if (payMethod === 'crypto' && result?.url) {
        window.location.assign(result.url);
        return;
      }

      if (payMethod === 'iban') {
        setPaymentInstruction({
          method: 'iban',
          title: t('account.instruction.ibanTitle'),
          paymentId: result?.paymentId,
          quote: result?.quote,
          payableLabel: `₺${Number(result?.quote?.payableTL || payableTL).toFixed(0)}`,
          balanceLabel: `$${Number(result?.quote?.amountUsd || effectiveAmount).toFixed(2)}`,
          iban: result?.iban,
          whatsapp: result?.whatsapp,
          note: result?.aciklama,
        });
        setTopUpCooldown(60);
        await loadAccount();
        return;
      }

      if (payMethod === 'crypto' && result?.manual) {
        setPaymentInstruction({
          method: 'crypto',
          title: t('account.instruction.cryptoTitle'),
          quote: result?.quote,
          payableLabel: `$${Number(result?.quote?.amountUsd || effectiveAmount).toFixed(2)} ${result?.cryptoWallet?.asset || 'USDT'}`,
          balanceLabel: `$${Number(result?.quote?.amountUsd || effectiveAmount).toFixed(2)}`,
          cryptoWallet: result?.cryptoWallet,
          whatsapp: result?.whatsapp,
          note: result?.aciklama,
        });
        await loadAccount();
        return;
      }
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : t('account.topUp.initFailed'));
    } finally {
      setPanelBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* Header */}
      <div>
        <Caption>{t('account.header.caption')}</Caption>
        <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8, margin: '6px 0 6px' }}>
          {t('account.header.balanceWord')} <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>&</span> {t('account.header.keysWord')}
        </h2>
        <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
          {t('account.header.usdNotePre')} <strong>USD</strong> {t('account.header.usdNotePost')}
        </p>
        {panelError && (
          <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 11.5 }}>
            {panelError}
          </div>
        )}
        {panelBusy && (
          <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{t('account.panel.refreshing')}</div>
        )}
      </div>

      {/* Balance + top-up */}
      <div id="account-balance" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 18, scrollMarginTop: 80 }}>
        {/* Balance card */}
        <Card pad={28} style={{
          background: 'linear-gradient(135deg, var(--ink) 0%, #1e293b 100%)',
          color: 'var(--surface)', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -40, right: -40, width: 200, height: 200,
            borderRadius: '50%', background: 'var(--accent)', opacity: 0.15, filter: 'blur(40px)',
          }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Caption style={{ color: 'rgba(255,255,255,0.55)' }}>{t('account.balance.caption')}</Caption>
              {balanceState === 'ok' && (
                <Chip tone="ok" style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(110,231,183,0.3)' }}>
                  <PulseDot color="#10b981" size={5} withRing={false} /> {t('account.balance.active')}
                </Chip>
              )}
              {balanceState === 'unauthed' && (
                <Chip tone="neutral" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)' }}>
                  {t('account.balance.loginRequiredChip')}
                </Chip>
              )}
              {balanceState === 'error' && (
                <Chip tone="neutral" style={{ background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(252,211,77,0.3)' }}>
                  {t('account.balance.connectionIssue')}
                </Chip>
              )}
            </div>

            {/* --- NOT AUTHENTICATED: never show a balance number --- */}
            {balanceState === 'unauthed' && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.25 }}>
                  {t('account.balance.loginRequired')}
                </div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 8, lineHeight: 1.55 }}>
                  {t('account.balance.loginToSee')}
                </div>
                <button onClick={() => window.location.assign('/api/auth/google')} style={{
                  marginTop: 16, padding: '10px 16px', borderRadius: 10,
                  background: 'var(--accent)', color: '#fff', fontSize: 12.5, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  <I.Key size={13} stroke="#fff" /> {t('account.balance.login')}
                </button>
              </div>
            )}

            {/* --- LOADING (token present, first fetch in flight) --- */}
            {balanceState === 'loading' && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: -1, lineHeight: 1, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <I.Refresh size={18} stroke="rgba(255,255,255,0.6)" className="spin-slow" /> {t('account.balance.loadingBalance')}
                </div>
              </div>
            )}

            {/* --- LOAD ERROR with no prior value: keep zero hidden, offer retry --- */}
            {balanceState === 'error' && !hasLoadedBalance && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.25 }}>
                  {t('account.balance.loadFailed')}
                </div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 8, lineHeight: 1.55 }}>
                  {t('account.balance.loadFailedDesc')}
                </div>
                <button onClick={() => loadAccount()} disabled={panelBusy} style={{
                  marginTop: 16, padding: '10px 16px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12.5, fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.2)',
                  display: 'inline-flex', alignItems: 'center', gap: 8, opacity: panelBusy ? 0.6 : 1,
                }}>
                  <I.Refresh size={13} stroke="#fff" className={panelBusy ? 'spin-slow' : undefined} /> {t('account.balance.retry')}
                </button>
              </div>
            )}

            {/* --- SUCCESS, or ERROR-with-last-known: show the real number --- */}
            {showBalanceNumber && (
              <>
                <div style={{ fontSize: 52, fontWeight: 600, letterSpacing: -2.2, lineHeight: 1, marginTop: 14, fontFamily: 'var(--font-sans)' }} className="tnum">
                  ${balanceUSD.toFixed(2)}
                </div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.82)', marginTop: 8, fontFamily: 'var(--font-mono)' }} className="tnum">
                  {t('account.balance.tokenApprox', { tokens: fmt.tokens(usdToOpusTokens(balanceUSD)), label: OPUS48_LABEL })} <span style={{ opacity: 0.55 }}>{t('account.balance.average')}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 4, fontFamily: 'var(--font-mono)' }} className="tnum">
                  {t('account.balance.tlInfo', { tl: (balanceUSD * tlRate).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), rate: tlRate.toFixed(2) })}
                </div>
                {balanceState === 'error' && (
                  <div style={{ fontSize: 11, color: '#fcd34d', marginTop: 8, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{t('account.balance.lastKnown')}</span>
                    <button onClick={() => loadAccount()} disabled={panelBusy} style={{
                      padding: '3px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.12)', color: '#fff',
                      fontSize: 10.5, fontWeight: 600, border: '1px solid rgba(255,255,255,0.2)', opacity: panelBusy ? 0.6 : 1,
                    }}>{t('account.balance.retry')}</button>
                  </div>
                )}
              </>
            )}

            {/* Monthly usage summary — kept for any state that shows the panel */}
            {balanceState !== 'unauthed' && (
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-mono)', letterSpacing: 0.6 }}>{t('account.balance.monthUsage')}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.5, marginTop: 4 }} className="tnum">${monthCostUsd.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1, fontFamily: 'var(--font-mono)' }}>≈ ₺{(monthCostUsd * tlRate).toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-mono)', letterSpacing: 0.6 }}>{t('account.balance.request')}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.5, marginTop: 4 }} className="tnum">{fmt.num(monthRequests)}</div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Top-up form */}
        <Card pad={28}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <Caption>{t('account.topUp.caption')}</Caption>
            <Chip tone="neutral" style={{ fontFamily: 'var(--font-mono)' }}>{t('account.topUp.min', { amount: MIN_USD })}</Chip>
          </div>

          {/* İade politikası ONAY KAPISI — onaylanmadan aşağıdaki ödeme alanı bulanık + tıklanamaz */}
          <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: '#fffbeb', border: `1px solid ${refundOk ? '#fde68a' : '#f59e0b'}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>⚠️ {t('account.refund.title')}</div>
            <div style={{ fontSize: 11.5, color: '#78350f', lineHeight: 1.55, marginBottom: 10 }}>{t('account.refund.body')}</div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#92400e' }}>
              <input type="checkbox" checked={refundOk} onChange={(e) => setRefundOk(e.target.checked)} style={{ marginTop: 1, width: 16, height: 16, cursor: 'pointer', accentColor: '#d97706' }} />
              <span>{t('account.refund.accept')}</span>
            </label>
            {!refundOk && (
              <div style={{ fontSize: 11, color: '#b45309', marginTop: 7, fontWeight: 600 }}>{t('account.refund.gate')}</div>
            )}
          </div>

          {/* Ödeme alanı — iade politikası onaylanana dek BULANIK + tıklanamaz */}
          <div aria-hidden={!refundOk} style={{
            filter: refundOk ? 'none' : 'blur(5px)',
            pointerEvents: refundOk ? 'auto' : 'none',
            userSelect: refundOk ? 'auto' : 'none',
            opacity: refundOk ? 1 : 0.6,
            transition: 'filter .25s ease, opacity .25s ease',
          }}>

          {/* Quick amounts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            {[5, 10, 25, 50].map(a => (
              <TopUpAmount key={a} amount={a} selected={!customAmount && topUp === a} tlRate={tlRate}
                           onSelect={(v) => { setTopUp(v); setCustomAmount(''); }} />
            ))}
          </div>

          {/* Custom amount */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `1px solid ${belowMin ? '#fee2e2' : 'var(--border)'}`, background: belowMin ? '#fef2f2' : 'var(--surface-2)', marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>$</span>
            <input value={customAmount}
                   onChange={(e) => setCustomAmount(e.target.value.replace(/[^\d.]/g, ''))}
                   placeholder={t('account.topUp.customPlaceholder', { amount: MIN_USD })}
                   style={{
                     flex: 1, border: 0, outline: 'none', background: 'transparent',
                     fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--ink)',
                   }} className="tnum" />
            {customAmount && Number(customAmount) > 0 && (
              <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>≈ ₺{(Number(customAmount) * tlRate).toFixed(0)}</span>
            )}
          </div>
          {belowMin && (
            <div style={{ fontSize: 10.5, color: '#b91c1c', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
              {t('account.topUp.belowMin', { amount: MIN_USD })}
            </div>
          )}
          {!belowMin && <div style={{ marginBottom: 12 }} />}

          {/* Payment method */}
          <Caption style={{ marginBottom: 10 }}>{t('account.topUp.payMethod')}</Caption>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {payMethods(t).map(m => {
              const on = payMethod === m.id;
              const methodKey = m.id === 'crypto' ? 'cryptomus' : m.id;
              const methodInfo = paymentMethods?.[methodKey];
              const disabled = methodInfo?.enabled === false;
              return (
                <button key={m.id} disabled={disabled} onClick={() => !disabled && setPayMethod(m.id)} style={{
                  padding: '12px 14px', borderRadius: 12, textAlign: 'left',
                  border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  background: on ? 'var(--accent-bg)' : 'var(--surface)',
                  display: 'flex', alignItems: 'center', gap: 12,
                  opacity: disabled ? 0.55 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: on ? 'var(--accent)' : 'var(--surface-2)',
                    color: on ? '#fff' : 'var(--ink-2)',
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}>
                    <m.Ico size={16} stroke={on ? '#fff' : 'var(--ink-2)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.label}</div>
                    {/* contract: literal "Ödeme yöntemi şu an kapalı" must remain in source (payment-safety-contract) */}
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>{disabled ? (methodInfo?.reason || 'Ödeme yöntemi şu an kapalı') : m.sub}</div>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', letterSpacing: 0.5 }}>{m.time}</span>
                </button>
              );
            })}
          </div>

          {/* Otomatik ödeme uyarısı */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', marginBottom: 18 }}>
            <I.Bolt size={13} stroke="var(--accent-ink)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11, color: 'var(--accent-ink)', lineHeight: 1.5 }}>
              <strong>{t('account.topUp.autoNoteStrong')}</strong> {t('account.topUp.autoNoteRest')}
            </div>
          </div>

          {/* Breakdown */}
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
              <span style={{ color: 'var(--ink-2)' }}>{t('account.topUp.creditBalance')}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }} className="tnum">${effectiveAmount.toFixed(2)}</span>
            </div>
            {roundingTL > 0 && payMethod !== 'crypto' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                <span style={{ color: 'var(--ink-2)' }}>{t('account.topUp.tlRounding')}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }} className="tnum">₺{roundingTL.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0 0', marginTop: 6, borderTop: '1px solid var(--border)' }}>
              {/* contract: literal "Ödenecek" must remain in source near paymentTotalLabel (api-docs-content) */}
              <span style={{ fontWeight: 600 }}>{'Ödenecek'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-ink)' }} className="tnum">
                {paymentTotalLabel}
                <span style={{ fontWeight: 500, marginLeft: 8, color: 'var(--ink-3)' }}>
                  {payMethod === 'crypto' ? t('account.topUp.payableInfoTL', { tl: payableTL.toFixed(0) }) : t('account.topUp.creditToBalance', { amount: effectiveAmount.toFixed(2) })}
                </span>
              </span>
            </div>
          </div>

          {paymentInstruction && (
            <div className="fade-in" style={{ padding: 14, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{paymentInstruction.title}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>
                    {t('account.instruction.balanceLabel', { balance: paymentInstruction.balanceLabel, payable: paymentInstruction.payableLabel })}
                  </div>
                </div>
              </div>

              {/* contract: literals "Banka", "Alıcı", "IBAN" and the "açıklama kısmını lütfen boş bırak" phrase must remain in source (payment-safety-contract) */}
              {paymentInstruction.iban && (
                <div style={{ display: 'grid', gap: 7, fontSize: 11.5 }}>
                  <div><strong>{'Banka:'}</strong> {paymentInstruction.iban.bankName || t('account.instruction.undefined')}</div>
                  <div><strong>{'Alıcı:'}</strong> {paymentInstruction.iban.owner || t('account.instruction.undefined')}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}><strong>{'IBAN:'}</strong> {paymentInstruction.iban.ibanNumber || t('account.instruction.undefined')}</div>
                  <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{'Havale/EFT açıklama kısmını lütfen boş bırakın.'}</div>
                </div>
              )}

              {paymentInstruction.cryptoWallet && (
                <div style={{ display: 'grid', gap: 7, fontSize: 11.5 }}>
                  <div><strong>{t('account.instruction.network')}</strong> {paymentInstruction.cryptoWallet.network || 'TRC20'}</div>
                  <div><strong>{t('account.instruction.asset')}</strong> {paymentInstruction.cryptoWallet.asset || 'USDT'}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}><strong>{t('account.instruction.wallet')}</strong> {paymentInstruction.cryptoWallet.address || t('account.instruction.undefined')}</div>
                  {paymentInstruction.cryptoWallet.memo && <div><strong>{t('account.instruction.memo')}</strong> {paymentInstruction.cryptoWallet.memo}</div>}
                </div>
              )}

              {paymentInstruction.note && (
                <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  {paymentInstruction.note}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {buildWhatsAppPaymentLink(paymentInstruction) ? (
                  <a href={buildWhatsAppPaymentLink(paymentInstruction)} target="_blank" rel="noreferrer"
                     onClick={paymentInstruction.method === 'iban' ? onConfirmIbanPaidNotify : undefined}
                     style={{
                       padding: '8px 10px', borderRadius: 9, background: 'var(--ink)', color: '#fff',
                       fontSize: 11.5, fontWeight: 600, textDecoration: 'none',
                     }}>
                    {paymentInstruction.method === 'iban'
                      ? t('account.instruction.confirmPaid')
                      : t('account.instruction.whatsappNotify')}
                  </a>
                ) : (
                  <span style={{ fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                    {t('account.instruction.whatsappMissing')}
                  </span>
                )}
              </div>
            </div>
          )}

          <button onClick={onTopUp} disabled={!refundOk || belowMin || effectiveAmount < MIN_USD || !paymentMethodEnabled || topUpCooldown > 0} style={{
            width: '100%', padding: '11px 0', borderRadius: 10,
            background: belowMin || !paymentMethodEnabled || topUpCooldown > 0 ? 'var(--ink-4)' : 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: belowMin || !paymentMethodEnabled || topUpCooldown > 0 ? 0.55 : 1,
            cursor: belowMin || !paymentMethodEnabled || topUpCooldown > 0 ? 'not-allowed' : 'pointer',
          }}>
            <I.Wallet size={14} stroke="#fff" />
            <span>{topUpCooldown > 0
              ? t('account.topUp.cooldown', { n: topUpCooldown })
              : t('account.topUp.payButton', { total: paymentTotalLabel, amount: effectiveAmount.toFixed(2) })}</span>
          </button>

          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textAlign: 'center', marginTop: 10, fontFamily: 'var(--font-mono)', lineHeight: 1.55 }}>
            {t('account.topUp.footerPre')} <strong style={{ color: 'var(--ink-2)' }}>{t('account.topUp.footerRoundStrong')}</strong> {t('account.topUp.footerMid')} <strong style={{ color: 'var(--ink-2)' }}>${MIN_USD}</strong>.
          </div>
          </div>{/* /ödeme alanı (iade onay kapısı) */}
        </Card>
      </div>

      <TelegramLinkCard
        telegram={me?.telegram}
        busy={telegramBusy}
        message={telegramMessage}
        deepLink={telegramDeepLink}
        onLink={startTelegramLink}
        onOpenBot={openTelegramBot}
        onRefresh={refreshTelegramLink}
        onUnlink={unlinkTelegramLink}
      />

      {/* Auto-recharge + Sandbox key cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <AutoRechargeCard tweaks={tweaks} setTweak={setTweak} />
        <SandboxKeyCard sandboxKey={sandboxKey} sandboxFullKey={sandboxFullKey} onCreate={createSandboxKey} busy={sandboxBusy} />
      </div>

      {/* Team + Webhooks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18 }}>
        <TeamCard team={team} onInvite={inviteTeamMember} onRemove={removeTeamMember} />
        <WebhookCard webhooks={webhooks} onSaveWebhook={saveWebhook} onTestWebhook={testWebhook} />
      </div>

      {/* Monthly report */}
      <MonthlyReportCard report={monthlyReport} onMonthChange={loadMonthlyReport} onDownloadReport={downloadReport} />

      {/* API keys */}
      <Card pad={22} id="account-keys" style={{ scrollMarginTop: 80 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{t('account.header.keysWord')}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
              {t('account.keys.bearerPrefix')} <span style={{ fontFamily: 'var(--font-mono)' }}>yzk-live-[sana_ozel_anahtar]</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder={t('account.keys.namePlaceholder')}
                   style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 11.5, outline: 'none' }} />
            <button onClick={createApiKey} style={{
              background: 'var(--ink)', color: '#fff',
              padding: '8px 14px', borderRadius: 9,
              fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <I.Key size={12} stroke="#fff" /> {t('account.keys.newKey')}
            </button>
          </div>
        </div>

        <div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1.8fr 1.2fr 100px 90px 60px', gap: 14,
            padding: '0 0 10px', borderBottom: '1px solid var(--border)',
          }}>
            {[t('account.keys.colName'), t('account.keys.colKey'), t('account.keys.colScopes'), t('account.keys.colLastUse'), t('account.keys.colRequest'), t('account.keys.colStatus')].map(h => <Caption key={h} style={{ fontSize: 9 }}>{h}</Caption>)}
          </div>
          {apiKeys.length === 0 && (
            <div style={{ padding: '16px 0', fontSize: 12, color: 'var(--ink-3)' }}>
              {t('account.keys.empty')}
            </div>
          )}
          {apiKeys.map((k, i) => (
            <div key={k.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 1.8fr 1.2fr 100px 90px 60px', gap: 14,
              padding: '14px 0', borderBottom: i < apiKeys.length - 1 ? '1px solid var(--border)' : 'none',
              alignItems: 'center', fontSize: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <I.Key size={13} stroke="var(--ink-3)" />
                <span style={{ fontWeight: 500 }}>{k.ad || k.name || t('account.keys.defaultName')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rawKeyOrMessage(k, t)}
                </span>
                <button onClick={() => navigator.clipboard?.writeText(rawKeyText(k) || '')} style={{ color: 'var(--ink-3)', padding: 2 }} title={t('common.copy')}>
                  <I.Copy size={11} stroke="var(--ink-3)" />
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(k.scopes || ALL_SCOPES).map(s => {
                  const sm = SCOPE_META[s] || { label: s, color: 'var(--ink-3)', bg: 'rgba(15,23,42,0.06)' };
                  return (
                    <span key={s} style={{
                      fontSize: 9.5, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: 0.3,
                      padding: '2px 6px', borderRadius: 4,
                      background: sm.bg, color: sm.color,
                    }}>{sm.label}</span>
                  );
                })}
                <button onClick={() => revokeApiKey(k)} style={{ color: 'var(--ink-3)', padding: '2px 4px', fontSize: 10, fontWeight: 500 }}>{t('account.keys.revoke')}</button>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 11 }}>{shortDate(k.sonKullanim || k.olusturma)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }} className="tnum">{k.kind === 'sandbox' ? t('account.keys.tokenSuffix', { count: fmt.num(k.sandbox?.tokenUsed || 0) }) : '—'}</span>
              <Chip tone={k.aktif !== false ? 'ok' : 'neutral'} style={{ fontSize: 9.5 }}>
                {k.aktif !== false ? t('account.keys.active') : t('account.keys.inactive')}
              </Chip>
            </div>
          ))}
        </div>

        {showNewKey && (
          <div className="fade-in" style={{ marginTop: 18, padding: 16, borderRadius: 12, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <I.Key size={16} stroke="var(--accent-ink)" />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>{t('account.keys.newKeyGenerated')}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-ink)', marginTop: 2 }}>{newKey}</div>
                </div>
              </div>
              <button onClick={() => setShowNewKey(false)} style={{ color: 'var(--accent-ink)' }}>
                <I.Close size={14} stroke="var(--accent-ink)" />
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--accent-ink)', marginTop: 8, fontStyle: 'italic' }}>
              {t('account.keys.copyNow')}
            </div>
          </div>
        )}
      </Card>

      {/* Usage records (USD primary) */}
      <Card pad={0} id="account-usage" style={{ overflow: 'hidden', scrollMarginTop: 80 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('account.usage.title')}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{t('account.usage.desc')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={usageModelFilter}
              onChange={(e) => setUsageModelFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}
            >
              <option value="all">{t('account.usage.allModels')}</option>
              {usageModelOptions.map((id) => (
                <option key={id} value={id}>{(modelMeta(id)?.label) || id}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['all',t('common.all')],['24h',t('account.usage.range24h')],['7d',t('account.usage.range7d')],['30d',t('account.usage.range30d')]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setUsageRangeFilter(val)}
                  style={{
                    padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: usageRangeFilter === val ? 'var(--ink)' : 'var(--surface)',
                    color: usageRangeFilter === val ? '#fff' : 'var(--ink-3)',
                  }}
                >{label}</button>
              ))}
            </div>
            <Chip tone="neutral" style={{ fontFamily: 'var(--font-mono)' }}>{filteredUsageRows.length} / {usageRows.length}</Chip>
          </div>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '120px 1.4fr 80px 1.2fr 90px 110px 70px 70px',
          gap: 10, padding: '12px 20px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
        }}>
          {[t('account.usage.colRequestId'),t('account.usage.colModel'),t('account.usage.colType'),t('account.usage.colTokens'),t('account.usage.colCost'),t('account.usage.colRemaining'),t('account.usage.colDuration'),t('account.usage.colStatus')].map(h => (
            <Caption key={h} style={{ fontSize: 9 }}>{h}</Caption>
          ))}
        </div>
        {filteredUsageRows.length === 0 ? (
          <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
            {t('account.usage.empty')}
          </div>
        ) : filteredUsageRows.map((u, i) => {
          const m = modelMeta(u.modelId || u.model);
          const costUsd = asNumber(u.costUsd, asNumber(u.costTL, 0) / tlRate);
          const balanceAfterUsd = asNumber(u.remainingUsd, asNumber(u.remainingTL, 0) / tlRate);
          return (
            <div key={u.id} style={{
              display: 'grid', gridTemplateColumns: '120px 1.4fr 80px 1.2fr 90px 110px 70px 70px',
              gap: 10, padding: '11px 20px',
              borderBottom: i < filteredUsageRows.length - 1 ? '1px solid var(--border)' : 'none',
              alignItems: 'center', fontSize: 12,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 10.5 }}>{u.requestId || u.id}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: m.color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.modelId || u.model}</span>
              </div>
              <Chip tone="neutral" style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, justifySelf: 'start' }}>{u.type}</Chip>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', fontSize: 11 }} className="tnum">
                {fmt.num(u.inputUsage || u.inTok || 0)} <span style={{ color: 'var(--ink-4)' }}>→</span> {fmt.num(u.outputUsage || u.outTok || 0)}
              </span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }} className="tnum">${costUsd.toFixed(4)}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-4)' }} className="tnum">₺{asNumber(u.costTL, costUsd * tlRate).toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }} className="tnum">${balanceAfterUsd.toFixed(2)}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-4)' }} className="tnum">₺{asNumber(u.remainingTL, balanceAfterUsd * tlRate).toFixed(2)}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)' }} className="tnum">{u.responseMs || u.ms || 0}ms</span>
              <span>
                {u.status === 'success' ? (
                  <Chip tone="ok" style={{ fontSize: 9.5 }}><I.Check size={9} stroke="#047857" /> {t('account.usage.ok')}</Chip>
                ) : (
                  <Chip tone="neutral" style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 9.5 }}>{u.errorCode || u.err || t('account.usage.error')}</Chip>
                )}
              </span>
            </div>
          );
        })}
      </Card>

      {/* Account settings */}
      <Card pad={0} id="account-settings" style={{ overflow: 'hidden', scrollMarginTop: 80 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t('account.settings.title')}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{t('account.settings.desc')}</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1.1fr 1fr 160px 110px', gap: 12, alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Caption style={{ fontSize: 9 }}>{t('account.settings.fullName')}</Caption>
            <input
              value={settingsName}
              onChange={(e) => setSettingsName(e.target.value)}
              placeholder={t('account.settings.fullName')}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 12, outline: 'none' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Caption style={{ fontSize: 9 }}>{t('account.settings.email')}</Caption>
            <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me?.email || '—'}</div>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Caption style={{ fontSize: 9 }}>{t('account.settings.accountCode')}</Caption>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Chip tone="neutral" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>{userCode}</Chip>
              <button onClick={() => navigator.clipboard?.writeText(userCode)} style={{ color: 'var(--ink-3)', padding: 2 }} title={t('account.settings.copyCode')}>
                <I.Copy size={11} stroke="var(--ink-3)" />
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Caption style={{ fontSize: 9 }}>{t('account.settings.status')}</Caption>
            <Chip tone={me?.durum === 'aktif' ? 'ok' : 'neutral'} style={{ fontSize: 9.5, justifySelf: 'start' }}>{me?.durum || t('account.settings.statusActive')}</Chip>
          </div>
        </div>
        <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 11, color: settingsMessage === t('account.settings.profileSaved') ? '#047857' : 'var(--ink-3)' }}>{settingsMessage || t('account.settings.defaultMessage')}</div>
          <button
            onClick={saveProfileSettings}
            disabled={settingsSaving || settingsName.trim().length < 2}
            style={{
              padding: '9px 14px',
              borderRadius: 10,
              background: settingsSaving || settingsName.trim().length < 2 ? 'var(--ink-4)' : 'var(--ink)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              opacity: settingsSaving || settingsName.trim().length < 2 ? 0.6 : 1,
              cursor: settingsSaving || settingsName.trim().length < 2 ? 'not-allowed' : 'pointer',
            }}
          >
            {/* contract: literal "Profili kaydet" must remain in source (account-balance-contract) */}
            {settingsSaving ? t('account.settings.saving') : 'Profili kaydet'}
          </button>
        </div>
      </Card>

      {/* Payment history (USD primary) */}
      <Card pad={0} id="account-profile" style={{ overflow: 'hidden', scrollMarginTop: 80 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t('account.payments.title')}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{t('account.payments.desc')}</div>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '110px 110px 100px 90px 100px 110px 110px',
          gap: 10, padding: '12px 20px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
        }}>
          {/* "Bakiye USD" / "Tahsilat TL" / "Yuvarlama" kept as source literals (api-docs-content contract) */}
          {[t('account.payments.colId'),t('account.payments.colMethod'),'Bakiye USD','Tahsilat TL','Yuvarlama',t('account.payments.colStatus'),t('account.payments.colDate')].map(h => (
            <Caption key={h} style={{ fontSize: 9 }}>{h}</Caption>
          ))}
        </div>
        {paymentRows.map((p, i) => {
          const method = p.metod || p.method;
          const methodLabel = { iban: 'IBAN', shopier: 'Shopier', cryptomus: 'Cryptomus' }[method] || method;
          const statusTone = {
            tamamlandi: { bg: 'var(--ok-bg)', fg: '#047857', label: t('account.payments.statusCompleted') },
            basarili:   { bg: 'var(--ok-bg)', fg: '#047857', label: t('account.payments.statusCompleted') },
            onaylandi:  { bg: 'var(--ok-bg)', fg: '#047857', label: t('account.payments.statusCompleted') },
            bekliyor:   { bg: '#fffbeb',      fg: '#a16207', label: t('account.payments.statusPending')    },
            iptal:      { bg: '#fef2f2',      fg: '#b91c1c', label: t('account.payments.statusCancelled')  },
            reddedildi: { bg: '#fef2f2',      fg: '#b91c1c', label: t('account.payments.statusRejected')   },
            basarisiz:  { bg: '#fef2f2',      fg: '#b91c1c', label: t('account.payments.statusFailed')     },
          }[p.durum || p.status] || { bg: 'var(--surface-2)', fg: 'var(--ink-2)', label: p.durum || p.status || '—' };
          const collectedTL = asNumber(p.payableTL ?? p.miktarTL ?? p.gross, 0);
          const creditedTL = asNumber(p.creditTL ?? p.netTL ?? p.miktarTL ?? p.gross, collectedTL);
          const creditedUsd = asNumber(p.amountUsd, creditedTL / tlRate);
          const roundedTL = asNumber(p.roundingTL, Math.max(0, collectedTL - creditedTL));
          return (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: '110px 110px 100px 90px 100px 110px 110px',
              gap: 10, padding: '11px 20px',
              borderBottom: i < paymentRows.length - 1 ? '1px solid var(--border)' : 'none',
              alignItems: 'center', fontSize: 12,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 10.5 }}>{p.id}</span>
              <span style={{ fontWeight: 500 }}>{methodLabel}</span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)' }} className="tnum">${creditedUsd.toFixed(2)}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-4)' }} className="tnum">₺{creditedTL.toFixed(2)}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }} className="tnum">₺{collectedTL.toFixed(0)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }} className="tnum">₺{roundedTL.toFixed(2)}</span>
              <Chip tone="neutral" style={{ background: statusTone.bg, color: statusTone.fg, fontSize: 9.5, justifySelf: 'start' }}>{statusTone.label}</Chip>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 10.5 }}>{shortDate(p.tamamlanma || p.completedAt)}</span>
            </div>
          );
        })}
      </Card>
    </div>
  );
};

export { AccountTab };
