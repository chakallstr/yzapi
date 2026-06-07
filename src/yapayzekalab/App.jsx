import { useCallback, useEffect, useRef, useState } from 'react';
import './tokens.css';
import {
  I, Card, Chip, Caption, PulseDot, Dot, PROVIDERS,
  fmt, OPUS48_LABEL, usdToOpusTokens,
  mockLogs, mockProviderStatus, useLogStream,
} from './shared.jsx';
import { useT, LangToggle } from './i18n/index.jsx';
import { AccountTab } from './tab-account.jsx';
import { ActivityTab } from './tab-activity.jsx';
import { AdminTab } from './tab-admin.jsx';
import { DocumentsTab } from './tab-documents.jsx';
import { HomeTab } from './tab-home.jsx';
import { ModelsTab } from './tab-models.jsx';
import { PackagesTab } from './tab-packages.jsx';
import { AiChatTab } from './tab-ai-chat.jsx';
import { StudioTab } from './tab-studio.jsx';
import { StatusTab } from './tab-status.jsx';
import { LEGAL_DOCS } from './legal-docs.js';
import {
  apiJson,
  clearTelegramLinkPayload,
  clearStoredAuth,
  clearWhatsappPendingToken,
  getAccessToken,
  getTelegramLinkPayload,
  getWhatsappPendingToken,
  hasStoredAuth,
  storeTelegramLinkPayload,
  storeAuthTokens,
  storeWhatsappPendingToken,
} from './auth-client.js';

/* ============================================
   YapayZekaLab — Main App
   TopBar, tab routing, Tweaks panel, global state.
   ============================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "original",
  "accentHex": "#3b82f6",
  "animSpeed": 1,
  "streamRate": "normal",
  "routeDotCount": 4,
  "routeDur": 3.6,
  "routeGlow": true,
  "routeGuides": true,
  "routePulse": true,
  "routeLblInput": "İstek",
  "routeLblInputSub": "API KEY",
  "routeLblRouterTitle": "YAPAYZEKALAB",
  "routeLblRouterSub": "api · v1",
  "priceTickerOn": true,
  "priceTickerMs": 700,
  "priceTickerInc": 0.5,
  "sparkleSpin": true,
  "kpiCountMs": 1100,
  "logSlideIn": true,
  "tlRate": 47.084289,
  "textMultiplier": 3.0,
  "mediaMultiplier": 2.3,
  "feePct": 5,
  "balanceUSD": 0
}/*EDITMODE-END*/;

const useAppSettings = (defaults) => {
  const [values, setValues] = useState(defaults);
  const setValue = useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits
      : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
  }, []);
  return [values, setValue];
};

// Map accent hex → CSS [data-accent] selector name
const ACCENT_MAP = {
  '#3b82f6': 'blue',
  '#4a8a6a': 'mint',
  '#c2693a': 'peach',
  '#7a5af0': 'lav',
};

const ADMIN_EMAIL = 'cix.crazy666@gmail.com';
const FALLBACK_USD_TRY = 47.084289;
const PROTECTED_TABS = new Set(['activity', 'account', 'admin', 'ai-chat', 'studio']);
const SUPPORT_WHATSAPP_NUMBER = '905319310781';
const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`;
const FALLBACK_TELEGRAM_BOT_URL = 'https://t.me/YapayZekaLabAPIBot';

const initialsFor = (value) => {
  const clean = String(value || '').trim();
  if (!clean) return 'H';
  return clean
    .split(/\s+|@/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

const ANNOUNCEMENT_DOT = {
  bilgi: 'var(--accent)',
  uyari: '#f59e0b',
  hata: 'var(--err)',
  basari: 'var(--ok)',
};

const formatNotifTime = (value, t) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return t('appShell.notif.timeNew');
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) return t('appShell.notif.timeJustNow');
  if (diffMin < 60) return t('appShell.notif.timeMinAgo', { n: diffMin });
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return t('appShell.notif.timeHourAgo', { n: diffHour });
  const diffDay = Math.round(diffHour / 24);
  return t('appShell.notif.timeDayAgo', { n: diffDay });
};

const formatNotifSub = (item, t) => {
  const tip = String(item?.tip || 'bilgi').toUpperCase();
  const end = item?.bitis ? new Date(item.bitis) : null;
  if (!end || Number.isNaN(end.getTime())) return t('appShell.notif.subAnnouncement', { tip });
  return t('appShell.notif.subAnnouncementUntil', { tip, end: end.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) });
};

const TELEGRAM_LOGIN_FIELDS = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash'];

const readTelegramLinkPayloadFromQuery = (query) => {
  const payload = {};
  for (const field of TELEGRAM_LOGIN_FIELDS) {
    const value = query.get(field);
    if (value) payload[field] = value;
  }
  if (!payload.id || !payload.auth_date || !payload.hash) return null;
  return payload;
};

// === Notifications dropdown =========================================
const NotificationsButton = () => {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/announcements/active');
      const body = await response.json().catch(() => []);
      if (!response.ok) throw new Error(body?.message || t('appShell.notif.fetchError', { status: response.status }));
      const rows = Array.isArray(body) ? body : [];
      rows.sort((a, b) => new Date(b.baslangic || 0).getTime() - new Date(a.baslangic || 0).getTime());
      setItems(rows);
    } catch (err) {
      setItems([]);
      setError(err?.message || t('appShell.notif.fetchErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);
  useEffect(() => {
    if (open) loadAnnouncements();
  }, [open, loadAnnouncements]);

  const activeCount = items.length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{
                width: 32, height: 32, borderRadius: 10,
                display: 'grid', placeItems: 'center', position: 'relative',
                background: open ? 'rgba(15,23,42,0.05)' : 'transparent',
                transition: 'background 0.15s ease',
              }}>
        <I.Bell size={15} stroke="var(--ink-2)" />
        {activeCount > 0 && (
          <span style={{
            position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%',
            background: 'var(--err)',
          }} className="pulse-dot" />
        )}
      </button>
      {open && (
        <div className="fade-in" style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          width: 320, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--sh-3)', zIndex: 60, overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('appShell.notif.title')}</span>
            <Chip tone="accent" style={{ fontSize: 10 }}>{t('appShell.notif.activeCount', { n: activeCount })}</Chip>
          </div>
          {loading && (
            <div style={{ padding: '16px 14px', fontSize: 11.5, color: 'var(--ink-3)' }}>
              {t('appShell.notif.loading')}
            </div>
          )}
          {!loading && error && (
            <div style={{ padding: '16px 14px', fontSize: 11.5, color: '#b91c1c' }}>
              {error}
            </div>
          )}
          {!loading && !error && activeCount === 0 && (
            <div style={{ padding: '16px 14px', fontSize: 11.5, color: 'var(--ink-3)' }}>
              {t('appShell.notif.empty')}
            </div>
          )}
          {!loading && !error && items.map((n) => (
            <div key={n.id} className="card-hover" style={{
              padding: '12px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <Dot color={ANNOUNCEMENT_DOT[n.tip] || 'var(--accent)'} size={7} style={{ marginTop: 5 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>{n.mesaj}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{formatNotifSub(n, t)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 }}>{formatNotifTime(n.baslangic, t)}</div>
              </div>
            </div>
          ))}
          <div style={{
            width: '100%', padding: '10px',
            fontSize: 11.5, fontWeight: 500, color: 'var(--accent-ink)',
            background: 'transparent', textAlign: 'center',
          }}>{t('appShell.notif.footer')}</div>
        </div>
      )}
    </div>
  );
};

// === Logo — minimal YapayZekaLab wordmark + routing mark ===========
const Logo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
      <line x1="1" y1="9" x2="11" y2="9" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="11" y1="9" x2="19" y2="3"  stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="11" y1="9" x2="19" y2="15" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="11" cy="9" r="2.2" fill="var(--accent)" />
      <circle cx="19" cy="3"  r="1.6" fill="var(--accent)" opacity="0.6" />
      <circle cx="19" cy="15" r="1.6" fill="var(--accent)" opacity="0.6" />
    </svg>
    <div style={{ fontSize: 16, color: 'var(--ink)', letterSpacing: -0.4, display: 'flex', alignItems: 'baseline' }}>
      <span style={{ fontWeight: 700 }}>YapayZeka</span>
      <span style={{ fontWeight: 500, color: 'var(--ink-2)' }}>Lab</span>
    </div>
  </div>
);

// === LoginScreen — çıkış yapıldığında gösterilir ===================
const LoginScreen = () => {
  const { t } = useT();
  const [legalOpen, setLegalOpen] = useState('');
  const startGoogleAuth = () => {
    window.location.assign('/api/auth/google');
  };
  const startGithubAuth = () => {
    window.location.assign('/api/auth/github');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'linear-gradient(135deg, var(--bg) 0%, #e0e7ff 100%)',
      display: 'grid', placeItems: 'center', padding: 24,
    }} className="fade-in blueprint-grid yz-login-screen">
      <div style={{
        background: 'var(--surface)', borderRadius: 20, padding: 36,
        width: '100%', maxWidth: 420, boxShadow: 'var(--sh-3)',
        border: '1px solid var(--border)', position: 'relative',
      }} className="yz-login-card">
        <div style={{ position: 'absolute', top: 16, right: 16 }}>
          <LangToggle compact />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Logo />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, textAlign: 'center', margin: '0 0 6px' }}>
          {t('appShell.login.title')}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', margin: '0 0 24px' }}>
          {t('appShell.login.subtitle')}
        </p>

        {/* Google button */}
        <button type="button" onClick={startGoogleAuth} style={{
          width: '100%', padding: '11px 14px', borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border-st)',
          fontSize: 13, fontWeight: 500, color: 'var(--ink)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          marginBottom: 14,
        }}>
          <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.4 35.1 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.5 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.3 5.3C42 35.1 44 30 44 24c0-1.2-.1-2.4-.4-3.5z"/>
          </svg>
          {t('appShell.login.googleBtn')}
        </button>

        {/* GitHub button */}
        <button type="button" onClick={startGithubAuth} style={{
          width: '100%', padding: '11px 14px', borderRadius: 10,
          background: '#24292f', border: '1px solid #24292f',
          fontSize: 13, fontWeight: 500, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          marginBottom: 14,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#fff" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          {t('appShell.login.githubBtn')}
        </button>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          {t('appShell.login.hint')}
        </div>
        <div style={{
          marginTop: 16,
          padding: '14px 16px',
          borderRadius: 12,
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.18)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.55 }}>
            {t('appShell.login.consent')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10, fontSize: 11.5 }}>
            <button type="button" onClick={() => setLegalOpen('kvkk')} style={{ color: 'var(--accent-ink)', textDecoration: 'underline' }}>KVKK</button>
            <button type="button" onClick={() => setLegalOpen('gizlilik')} style={{ color: 'var(--accent-ink)', textDecoration: 'underline' }}>{t('appShell.login.legalPrivacy')}</button>
            <button type="button" onClick={() => setLegalOpen('sozlesme')} style={{ color: 'var(--accent-ink)', textDecoration: 'underline' }}>{t('appShell.login.legalAgreement')}</button>
            <button type="button" onClick={() => setLegalOpen('mesafeli')} style={{ color: 'var(--accent-ink)', textDecoration: 'underline' }}>{t('appShell.login.legalDistanceSale')}</button>
          </div>
        </div>
        {legalOpen && <LegalModal docKey={legalOpen} onClose={() => setLegalOpen('')} />}
      </div>
    </div>
  );
};

// === WhatsAppOtpScreen — Google sonrası telefon doğrulama ===========
const WhatsAppOtpScreen = ({ pendingToken, onVerified, onCancel }) => {
  const { t } = useT();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [phoneMasked, setPhoneMasked] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const requestOtp = async (mode = 'start') => {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/auth/whatsapp-otp/${mode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pendingToken}`,
        },
        body: JSON.stringify(mode === 'resend' ? { verificationId } : { phone, marketingConsent }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || t('appShell.otp.sendError'));
      setVerificationId(body.verificationId);
      setPhoneMasked(body.phoneMasked || '');
      setMessage(t('appShell.otp.sent'));
    } catch (err) {
      setError(err?.message || t('appShell.otp.sendError'));
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/whatsapp-otp/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pendingToken}`,
        },
        body: JSON.stringify({ verificationId, code, marketingConsent }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || t('appShell.otp.verifyError'));
      onVerified(body);
    } catch (err) {
      setError(err?.message || t('appShell.otp.verifyError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 210,
      background: 'linear-gradient(135deg, var(--bg) 0%, #e0e7ff 100%)',
      display: 'grid', placeItems: 'center', padding: 24,
    }} className="fade-in blueprint-grid yz-login-screen">
      <div style={{
        background: 'var(--surface)', borderRadius: 20, padding: 36,
        width: '100%', maxWidth: 420, boxShadow: 'var(--sh-3)',
        border: '1px solid var(--border)',
      }} className="yz-login-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Logo />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, textAlign: 'center', margin: '0 0 6px' }}>
          {t('appShell.otp.title')}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', margin: '0 0 24px', lineHeight: 1.55 }}>
          {t('appShell.otp.subtitle')}
        </p>

        {!verificationId ? (
          <>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('appShell.otp.phonePlaceholder')}
              inputMode="tel"
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10,
                background: 'var(--surface)', border: '1px solid var(--border-st)',
                fontSize: 13, color: 'var(--ink)', marginBottom: 10,
              }}
            />
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.45, marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              {t('appShell.otp.marketingConsent')}
            </label>
            <button type="button" disabled={submitting} onClick={() => requestOtp('start')} style={{
              width: '100%', padding: '11px 14px', borderRadius: 10,
              background: 'var(--ink)', color: '#fff',
              fontSize: 13, fontWeight: 600,
            }}>
              {submitting ? t('common.sending') : t('appShell.otp.sendBtn')}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 10, textAlign: 'center' }}>
              {t('appShell.otp.sentTo')} <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{phoneMasked}</span>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              placeholder={t('appShell.otp.codePlaceholder')}
              inputMode="numeric"
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10,
                background: 'var(--surface)', border: '1px solid var(--border-st)',
                fontSize: 13, color: 'var(--ink)', marginBottom: 10,
                letterSpacing: 2, textAlign: 'center',
              }}
            />
            <button type="button" disabled={submitting || code.length !== 6} onClick={verifyOtp} style={{
              width: '100%', padding: '11px 14px', borderRadius: 10,
              background: 'var(--ink)', color: '#fff',
              fontSize: 13, fontWeight: 600,
              marginBottom: 10,
            }}>
              {submitting ? t('appShell.otp.verifying') : t('appShell.otp.verifyBtn')}
            </button>
            <button type="button" disabled={submitting} onClick={() => requestOtp('resend')} style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border-st)',
              fontSize: 12, fontWeight: 500, color: 'var(--ink-2)',
            }}>
              {t('appShell.otp.resendBtn')}
            </button>
          </>
        )}

        {message && <div style={{ marginTop: 14, fontSize: 12, color: '#047857', textAlign: 'center' }}>{message}</div>}
        {error && <div style={{ marginTop: 14, fontSize: 12, color: '#b91c1c', textAlign: 'center' }}>{error}</div>}

        <button type="button" onClick={onCancel} style={{
          display: 'block', margin: '18px auto 0',
          fontSize: 12, color: 'var(--ink-3)', background: 'transparent',
        }}>
          {t('appShell.otp.backToLogin')}
        </button>
      </div>
    </div>
  );
};

// === LogoutConfirm — küçük modal ===================================
const LogoutConfirm = ({ onClose, onConfirm }) => {
  const { t } = useT();
  return (
  <div onClick={onClose} className="fade-in" style={{
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
    zIndex: 100, display: 'grid', placeItems: 'center', padding: 24,
  }}>
    <div onClick={(e) => e.stopPropagation()} style={{
      background: 'var(--surface)', borderRadius: 16, padding: 24,
      width: '100%', maxWidth: 380, boxShadow: 'var(--sh-3)',
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{t('appShell.logout.title')}</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, marginBottom: 20 }}>
        {t('appShell.logout.body')}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 12, color: 'var(--ink-2)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>{t('common.cancel')}</button>
        <button onClick={onConfirm} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff', background: '#b91c1c' }}>{t('appShell.logout.confirm')}</button>
      </div>
    </div>
  </div>
  );
};

// === UserMenu — sağ üst kullanıcı dropdown'u =======================
const UserMenu = ({ onAction, profile, balanceUSD }) => {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const displayName = profile?.adSoyad || profile?.email?.split('@')[0] || t('appShell.user.fallbackName');
  const email = profile?.email || t('appShell.user.fallbackEmail');
  const status = profile?.durum || 'aktif';
  const plan = profile?.planAd || profile?.plan || t('appShell.user.fallbackPlan');
  const userCode = profile?.userCode || (profile?.id ? `u-${String(profile.id).replace(/-/g, '').slice(0, 8)}` : 'profil');
  const balanceHint = `$${Number(balanceUSD ?? profile?.bakiyeUsd ?? 0).toFixed(2)}`;

  const items = [
    { Ico: I.Wallet,   label: t('appShell.user.itemAccountBalance'),     hint: balanceHint,          section: 'account-balance' },
    { Ico: I.Key,      label: t('appShell.user.itemKeys'),       hint: t('appShell.user.hintRealList'),       section: 'account-keys' },
    { Ico: I.Activity, label: t('appShell.user.itemUsage'),      hint: t('appShell.user.hintRecent'),       section: 'account-usage' },
    { Ico: I.Settings, label: t('appShell.user.itemSettings'),        hint: t('appShell.user.hintProfileEmail'),     section: 'account-settings' },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 9,
        paddingLeft: 12, borderLeft: '1px solid var(--border)',
        padding: '4px 4px 4px 12px', borderRadius: 'var(--r-sm)',
        background: open ? 'rgba(15,23,42,0.04)' : 'transparent',
        transition: 'background 0.15s',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--accent-bg)', color: 'var(--accent-ink)',
          display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 600,
        }}>{initialsFor(displayName)}</div>
        <div style={{ lineHeight: 1.15, marginRight: 2, textAlign: 'left' }}>
          <div style={{ fontSize: 12, fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{profile?.email ? plan : t('appShell.user.fallbackPlan')}</div>
        </div>
        <I.Chevron size={12} stroke="var(--ink-3)" style={{
          transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </button>

      {open && (
        <div className="fade-in" style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          width: 280, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--sh-3)', zIndex: 60, overflow: 'hidden',
        }}>
          {/* Profile header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            background: 'var(--surface-2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--accent-bg)', color: 'var(--accent-ink)',
                display: 'grid', placeItems: 'center',
                fontSize: 16, fontWeight: 600,
              }}>{initialsFor(displayName)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{displayName}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <Chip tone={status === 'aktif' ? 'ok' : 'neutral'} style={{ fontSize: 9.5 }}>{status}</Chip>
              <Chip tone="accent" style={{ fontSize: 9.5 }}>{plan}</Chip>
              <Chip tone="neutral" style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)' }}>{userCode}</Chip>
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding: 4 }}>
            {items.map((it, i) => (
              <button key={i} onClick={() => { setOpen(false); onAction({ tab: 'account', section: it.section }); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                background: 'transparent', color: 'var(--ink)',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <it.Ico size={14} stroke="var(--ink-2)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{it.label}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{it.hint}</div>
                </div>
                <I.Arrow size={11} stroke="var(--ink-4)" />
              </button>
            ))}
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

          <button onClick={() => { setOpen(false); setShowLogoutConfirm(true); }} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 11,
            padding: '11px 16px', textAlign: 'left',
            background: 'transparent', color: '#b91c1c',
            fontSize: 12.5, fontWeight: 500,
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <I.Close size={13} stroke="#b91c1c" />
            <span>{t('appShell.user.logout')}</span>
          </button>
        </div>
      )}

      {showLogoutConfirm && (
        <LogoutConfirm
          onClose={() => setShowLogoutConfirm(false)}
          onConfirm={() => { setShowLogoutConfirm(false); onAction({ logout: true }); }} />
      )}
    </div>
  );
};

// === TopBar =========================================================
const TopBar = ({ active, onTab, balanceUSD, tlRate, onUserAction, isAuthenticated, onLoginClick, profile, isAdmin }) => {
  const { t } = useT();
  const tabs = [
    { id: 'home',     label: t('nav.home'),  Ico: I.Home },
    { id: 'models',   label: t('nav.models'),   Ico: I.Layers },
    { id: 'packages', label: t('nav.packages'),   Ico: I.Wallet },
    { id: 'ai-chat',  label: t('nav.aiChat'),    Ico: I.Sparkle },
    // { id: 'studio',   label: t('nav.studio'),     Ico: I.Layers },
    { id: 'documents',label: t('nav.documents'),  Ico: I.File },
    { id: 'status',   label: t('nav.status'),      Ico: I.Activity },
    { id: 'activity', label: t('nav.activity'),   Ico: I.Activity },
    { id: 'account',  label: t('nav.account'),      Ico: I.Wallet },
    ...(isAdmin ? [{ id: 'admin', label: t('nav.admin'), Ico: I.Shield }] : []),
  ];

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(255,255,255,0.78)',
      backdropFilter: 'blur(14px) saturate(160%)',
      WebkitBackdropFilter: 'blur(14px) saturate(160%)',
      borderBottom: '1px solid var(--border)',
      padding: '10px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }} className="yz-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="yz-topbar-left">
        <Logo />

        <nav style={{ display: 'flex', gap: 2 }} className="yz-topbar-nav">
          {tabs.map(t => {
            const on = t.id === active;
            return (
              <button key={t.id} onClick={() => onTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 11px', borderRadius: 'var(--r-sm)',
                fontSize: 13, fontWeight: 500, letterSpacing: -0.1,
                color: on ? 'var(--accent-ink)' : 'var(--ink-2)',
                background: on ? 'var(--accent-bg)' : 'transparent',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}>
                <t.Ico size={14} stroke={on ? 'var(--accent-ink)' : 'var(--ink-2)'} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }} className="yz-topbar-actions">
        <LangToggle compact />
        {isAuthenticated ? (
          <>
            {/* Balance pill — USD birincil, TL bilgi, token tooltip */}
            <button onClick={() => onTab('account')}
              title={t('appShell.topbar.balanceTooltip', { tokens: fmt.tokens(usdToOpusTokens(balanceUSD ?? 0)), model: OPUS48_LABEL })}
              style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', borderRadius: 999,
              background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
            }}>
              <I.Wallet size={13} stroke="var(--accent-ink)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-ink)', fontFamily: 'var(--font-mono)' }} className="tnum">
                ${(balanceUSD ?? 0).toFixed(2)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--accent-ink)', opacity: 0.6, fontFamily: 'var(--font-mono)' }} className="tnum">
                (₺{((balanceUSD ?? 0) * (tlRate ?? FALLBACK_USD_TRY)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </span>
            </button>

            {/* Search */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 'var(--r-sm)',
              background: 'rgba(15,23,42,0.04)', border: '1px solid var(--border)',
              width: 200,
            }}>
              <I.Search size={13} stroke="var(--ink-3)" />
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t('appShell.topbar.searchPlaceholder')}</span>
              <span style={{
                marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10,
                color: 'var(--ink-3)', padding: '1px 5px',
                border: '1px solid var(--border)', borderRadius: 4,
              }}>⌘K</span>
            </div>

            <NotificationsButton />

            <UserMenu onAction={onUserAction} profile={profile} balanceUSD={balanceUSD} />
          </>
        ) : (
          <>
            <button onClick={onLoginClick} style={{
              padding: '8px 14px', borderRadius: 999,
              background: 'var(--surface)', border: '1px solid var(--border-st)',
              color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 600,
            }}>
              {t('appShell.topbar.login')}
            </button>
            <button onClick={onLoginClick} style={{
              padding: '8px 14px', borderRadius: 999,
              background: 'var(--ink)', color: '#fff',
              fontSize: 12.5, fontWeight: 700,
            }}>
              {t('appShell.topbar.register')}
            </button>
          </>
        )}
      </div>
    </header>
  );
};

// === PublicStatus — açık erişim sistem durumu modali ================
const PublicStatusModal = ({ onClose }) => {
  const { t } = useT();
  const items = mockProviderStatus;
  const total = items.length;
  const ok = items.filter(x => x.durum === 'aktif').length;
  const allOk = ok === total;
  return (
    <div onClick={onClose} className="fade-in" style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
      zIndex: 90, display: 'grid', placeItems: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 620,
        boxShadow: 'var(--sh-3)', overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)',
                      background: allOk ? 'var(--ok-bg)' : '#fffbeb',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PulseDot color={allOk ? '#10b981' : '#a16207'} size={9} />
            <div>
              <Caption style={{ color: allOk ? '#047857' : '#92400e' }}>{t('appShell.status.caption')}</Caption>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: allOk ? '#047857' : '#92400e' }}>
                {allOk ? t('appShell.status.allOnline') : t('appShell.status.partial', { ok, total })}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--ink-3)', padding: 6 }}>
            <I.Close size={16} stroke="var(--ink-3)" />
          </button>
        </div>
        <div style={{ padding: 20, maxHeight: 480, overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {items.map(s => {
              const p = PROVIDERS[s.provider] || { label: s.provider, color: 'var(--ink-3)' };
              const tone = s.durum === 'aktif' ? { bg: 'var(--ok-bg)', fg: '#047857', label: t('appShell.status.toneActive') }
                          : s.durum === 'yavaş' ? { bg: '#fffbeb', fg: '#a16207', label: t('appShell.status.toneSlow') }
                          : { bg: '#fef2f2', fg: '#b91c1c', label: t('appShell.status.toneDown') };
              return (
                <div key={s.provider} style={{ display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                      {s.gecikmeMs ? `${s.gecikmeMs}ms` : '—'} · {s.sonKontrol}
                    </div>
                  </div>
                  <Chip tone="neutral" style={{ background: tone.bg, color: tone.fg, fontSize: 9.5 }}>{tone.label}</Chip>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 16, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            {t('appShell.status.autoCheck')}
          </div>
        </div>
      </div>
    </div>
  );
};

const LegalModal = ({ docKey, onClose }) => {
  const { t } = useT();
  const doc = LEGAL_DOCS[docKey];
  if (!doc) return null;
  return (
    <div onClick={onClose} className="fade-in" style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
      zIndex: 95, display: 'grid', placeItems: 'center', padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 760,
        boxShadow: 'var(--sh-3)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <Caption>{t('appShell.legal.caption')}</Caption>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{doc.title}</div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--ink-3)', padding: 6 }}>
            <I.Close size={16} stroke="var(--ink-3)" />
          </button>
        </div>
        <div style={{ padding: 22, maxHeight: '70vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {doc.body.map((paragraph, index) => (
            <p key={index} style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

const WhatsAppFloat = () => {
  const { t } = useT();
  return (
  <a
    href={SUPPORT_WHATSAPP_URL}
    target="_blank"
    rel="noreferrer"
    aria-label={t('appShell.float.whatsappAria')}
    style={{
      position: 'fixed',
      right: 20,
      bottom: 20,
      zIndex: 70,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      borderRadius: 999,
      background: '#fff',
      border: '1px solid rgba(37,211,102,0.22)',
      boxShadow: 'var(--sh-3)',
      textDecoration: 'none',
      color: '#128c45',
      fontSize: 12.5,
      fontWeight: 700,
    }}
  >
    <span style={{
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: '#25D366',
      boxShadow: '0 0 0 4px rgba(37,211,102,0.16)',
      flexShrink: 0,
    }} />
    WhatsApp
  </a>
  );
};

const TelegramFloat = ({ href = FALLBACK_TELEGRAM_BOT_URL }) => {
  const { t } = useT();
  return (
  <a
    href={href || FALLBACK_TELEGRAM_BOT_URL}
    target="_blank"
    rel="noreferrer"
    aria-label={t('appShell.float.telegramAria')}
    style={{
      position: 'fixed',
      left: 20,
      bottom: 20,
      zIndex: 70,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      borderRadius: 999,
      background: 'linear-gradient(rgba(255,255,255,0.82), rgba(255,255,255,0.82)), repeating-linear-gradient(0deg, rgba(59,130,246,0.08) 0 1px, transparent 1px 18px), repeating-linear-gradient(90deg, rgba(59,130,246,0.08) 0 1px, transparent 1px 18px)',
      border: '1px solid rgba(59,130,246,0.22)',
      boxShadow: 'var(--sh-3)',
      backdropFilter: 'blur(10px)',
      textDecoration: 'none',
      color: 'var(--accent-ink)',
      fontSize: 12.5,
      fontWeight: 700,
    }}
  >
    <span style={{
      width: 22,
      height: 22,
      borderRadius: '50%',
      border: '1px solid rgba(59,130,246,0.24)',
      background: 'rgba(59,130,246,0.08)',
      color: 'var(--accent-ink)',
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0,
      fontSize: 11,
      fontFamily: 'var(--font-mono)',
      fontWeight: 700,
    }}>
      TG
    </span>
    Telegram
  </a>
  );
};

// === Footer with public status link =================================
const SiteFooter = () => {
  const { t } = useT();
  const [statusOpen, setStatusOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState('');
  const okCount = mockProviderStatus.filter(x => x.durum === 'aktif').length;
  const allOk = okCount === mockProviderStatus.length;
  return (
    <>
      <footer style={{
        padding: '24px 24px 28px', maxWidth: 1400, margin: '0 auto', width: '100%',
        borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
          © 2026 YapayZekaLab · yapayzekalab.org/v1 · support@yapayzekalab.org
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--ink-3)', alignItems: 'center' }}>
          <button onClick={() => setStatusOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 7, fontSize: 11,
            color: allOk ? '#047857' : '#a16207', fontWeight: 500,
          }}>
            <PulseDot color={allOk ? '#10b981' : '#f59e0b'} size={6} withRing={false} />
            {allOk ? t('appShell.footer.allOnline') : t('appShell.footer.partial', { ok: okCount, total: mockProviderStatus.length })}
          </button>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>WhatsApp</a>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <button onClick={() => setLegalOpen('kvkk')} style={{ color: 'inherit', textDecoration: 'none' }}>KVKK</button>
          <button onClick={() => setLegalOpen('sozlesme')} style={{ color: 'inherit', textDecoration: 'none' }}>{t('appShell.login.legalAgreement')}</button>
          <button onClick={() => setLegalOpen('gizlilik')} style={{ color: 'inherit', textDecoration: 'none' }}>{t('appShell.login.legalPrivacy')}</button>
          <button onClick={() => setLegalOpen('mesafeli')} style={{ color: 'inherit', textDecoration: 'none' }}>{t('appShell.login.legalDistanceSale')}</button>
        </div>
      </footer>
      {statusOpen && <PublicStatusModal onClose={() => setStatusOpen(false)} />}
      {legalOpen && <LegalModal docKey={legalOpen} onClose={() => setLegalOpen('')} />}
    </>
  );
};
const App = ({ initialTab = 'home' }) => {
  const { t: tr, lang, setLang } = useT();
  const initialAuth = hasStoredAuth();
  const initialWhatsappPending = getWhatsappPendingToken();
  const initialTabRequiresAuth = PROTECTED_TABS.has(initialTab);
  const [t, setTweak] = useAppSettings(TWEAK_DEFAULTS);
  const [tab, setTab] = useState(() => (!initialAuth && initialTabRequiresAuth ? 'home' : initialTab));
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuth);
  const [showLogin, setShowLogin] = useState(() => !initialAuth && initialTabRequiresAuth);
  const [whatsappPendingToken, setWhatsappPendingToken] = useState(initialWhatsappPending);
  const [pendingTab, setPendingTab] = useState(() => (!initialAuth && initialTabRequiresAuth ? initialTab : null));
  const [goto, setGoto] = useState(null);
  const [profile, setProfile] = useState(null);
  const skeleton = false;
  const isAdmin = String(profile?.email || '').trim().toLowerCase() === ADMIN_EMAIL || profile?.role === 'partner';

  // i18n: seed the UI language from the saved profile preference once it loads
  // (profile wins over a stale localStorage choice). Depends only on profile.lang
  // so it does NOT fight the live toggle (which doesn't change profile.lang).
  useEffect(() => {
    const pl = profile?.lang;
    if ((pl === 'tr' || pl === 'en') && pl !== lang) setLang(pl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.lang]);

  // i18n: when the user toggles language while signed in, persist the preference
  // to the profile (best-effort) so server-side emails follow the same language.
  useEffect(() => {
    const onLangChange = (e) => {
      const next = e?.detail;
      if (!isAuthenticated || (next !== 'tr' && next !== 'en')) return;
      void apiJson('/api/user/me', { method: 'PATCH', body: { lang: next } }).catch(() => {});
    };
    window.addEventListener('yz:lang-change', onLangChange);
    return () => window.removeEventListener('yz:lang-change', onLangChange);
  }, [isAuthenticated]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const accessToken = query.get('at');
    const refreshToken = query.get('rt');
    const whatsappToken = query.get('wpt');
    const telegramConnect = query.get('telegramConnect') === '1';
    const telegramLinkPayload = readTelegramLinkPayloadFromQuery(query);

    if (telegramConnect) {
      // User arrived from the Telegram bot's "bağla" button. Remember the intent,
      // strip the param, and route them into the account Telegram section (login
      // first if needed) where the working deep-link connect flow lives.
      try { sessionStorage.setItem('yz_telegram_connect', '1'); } catch { /* ignore */ }
      query.delete('telegramConnect');
      const cleanQuery = query.toString();
      const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState(window.history.state, document.title, cleanUrl);
      if (hasStoredAuth()) {
        setTab('account');
        setGoto('telegram');
      } else {
        setPendingTab('account');
        setShowLogin(true);
      }
      if (!accessToken && !refreshToken && !whatsappToken && !telegramLinkPayload) return;
    }

    if (telegramLinkPayload) {
      storeTelegramLinkPayload(telegramLinkPayload);
      for (const field of TELEGRAM_LOGIN_FIELDS) query.delete(field);
    }

    if (!accessToken && !refreshToken && !whatsappToken && !telegramLinkPayload) return;

    if (whatsappToken) {
      clearStoredAuth();
      storeWhatsappPendingToken(whatsappToken);
      query.delete('wpt');
      query.delete('wv');

      const cleanQuery = query.toString();
      const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState(window.history.state, document.title, cleanUrl);

      setWhatsappPendingToken(whatsappToken);
      setIsAuthenticated(false);
      setShowLogin(false);
      return;
    }

    if (!accessToken && !refreshToken) {
      const cleanQuery = query.toString();
      const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState(window.history.state, document.title, cleanUrl);
      if (!hasStoredAuth()) {
        setPendingTab('account');
        setShowLogin(true);
      } else {
        setTab('account');
      }
      return;
    }

    const tokens = { accessToken, refreshToken };
    storeAuthTokens(tokens);
    clearWhatsappPendingToken();
    query.delete('at');
    query.delete('rt');

    const cleanQuery = query.toString();
    const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash || ''}`;
    window.history.replaceState(window.history.state, document.title, cleanUrl);

    setIsAuthenticated(true);
    setWhatsappPendingToken('');
    setShowLogin(false);
    let telegramConnectIntent = false;
    try { telegramConnectIntent = sessionStorage.getItem('yz_telegram_connect') === '1'; } catch { /* ignore */ }
    if (telegramConnectIntent) {
      setTab('account');
      setGoto('telegram');
    } else {
      setTab(pendingTab || (PROTECTED_TABS.has(initialTab) ? initialTab : 'account'));
    }
    setPendingTab(null);
  }, [initialTab, pendingTab]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const payload = getTelegramLinkPayload();
    if (!payload) return undefined;

    let cancelled = false;
    void apiJson('/api/telegram/login-link', { method: 'POST', body: payload })
      .then(() => apiJson('/api/user/me'))
      .then((data) => {
        clearTelegramLinkPayload();
        if (cancelled || !data) return;
        setProfile(data);
        if (data.bakiyeUsd !== undefined) setTweak('balanceUSD', Number(data.bakiyeUsd));
        setTab('account');
        setGoto('settings');
        window.dispatchEvent(new Event('yz:telegram-linked'));
      })
      .catch((error) => {
        clearTelegramLinkPayload();
        if (cancelled) return;
        window.dispatchEvent(new CustomEvent('yz:telegram-link-error', {
          detail: error?.message || tr('appShell.telegram.linkError'),
        }));
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, setTweak, tr]);

  useEffect(() => {
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.accent = ACCENT_MAP[t.accentHex] || 'blue';
    document.documentElement.style.setProperty('--speed', String(t.animSpeed));
  }, [t.theme, t.accentHex, t.animSpeed]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        const nextRate = Number(cfg?.kur);
        if (!cancelled && Number.isFinite(nextRate) && nextRate > 0) {
          setTweak('tlRate', nextRate);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [setTweak]);

  // Streaming logs — running based on streamRate tweak
  const rateMap = { off: { running: false, mul: 1 }, slow: { running: true, mul: 0.5 }, normal: { running: true, mul: 1 }, fast: { running: true, mul: 2.5 } };
  const rate = rateMap[t.streamRate] || rateMap.normal;
  // persistKey → akış localStorage'da tutulur; F5'te baştan sarmaz, "API Aktivitesi" sürekli akıyor görünür.
  const logs = useLogStream({ running: rate.running, intervalMs: 3000, speedMul: rate.mul, max: 80, persistKey: 'yz_activity_stream_v1' });

  const ctx = { skeleton, logs, tweaks: t, setTweak, goto };

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setProfile(null);
      return undefined;
    }

    const token = getAccessToken();
    if (!token) {
      setIsAuthenticated(false);
      return undefined;
    }

    apiJson('/api/user/me')
      .then((data) => {
        if (!cancelled && data) {
          setProfile(data);
          if (data.bakiyeUsd !== undefined) setTweak('balanceUSD', Number(data.bakiyeUsd));
        }
      })
      .catch((error) => {
        const expired = /oturum|unauthorized|invalid|expired|user role/i.test(error?.message || '');
        if (!cancelled) {
          setProfile(null);
          if (expired) {
            clearStoredAuth();
            setIsAuthenticated(false);
          }
        }
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, setTweak]);

  useEffect(() => {
    if (tab === 'admin' && profile && !isAdmin) {
      setTab('home');
    }
  }, [tab, profile, isAdmin]);

  const selectTab = (nextTab) => {
    if (nextTab === 'admin' && !isAdmin) {
      setPendingTab(null);
      setTab('home');
      return;
    }
    if (!isAuthenticated && PROTECTED_TABS.has(nextTab)) {
      setPendingTab(nextTab);
      setShowLogin(true);
      return;
    }
    setPendingTab(null);
    setTab(nextTab);
  };

  // Handle user menu actions: nav to tab + sub-section, or logout
  const onUserAction = (action) => {
    if (action.logout) {
      clearStoredAuth();
      setIsAuthenticated(false);
      setWhatsappPendingToken('');
      setPendingTab(null);
      setTab('home');
      return;
    }
    if (action.tab) {
      setTab(action.tab);
      setGoto(null);
      requestAnimationFrame(() => setGoto(action.section || null));
    }
  };

  // Clear goto after consumer scrolls (avoids re-scroll on next render)
  useEffect(() => {
    if (goto) {
      const t = setTimeout(() => setGoto(null), 600);
      return () => clearTimeout(t);
    }
  }, [goto]);

  // Düşük bakiye uyarısı — header'ın hemen altında banner
  const balance = t.balanceUSD ?? 0;
  const lowBalanceWarn = isAuthenticated && balance > 0 && balance < 5;
  const emptyBalance = isAuthenticated && balance <= 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }} className="blueprint-grid yz-app">
      <TopBar
        active={tab}
        onTab={selectTab}
        balanceUSD={t.balanceUSD}
        tlRate={t.tlRate}
        onUserAction={onUserAction}
        isAuthenticated={isAuthenticated}
        profile={profile}
        isAdmin={isAdmin}
        onLoginClick={() => {
          setPendingTab(null);
          setShowLogin(true);
        }}
      />

      {(lowBalanceWarn || emptyBalance) && (
        <div className="fade-in" style={{
          background: emptyBalance ? '#fef2f2' : '#fffbeb',
          borderBottom: `1px solid ${emptyBalance ? '#fecaca' : '#fde68a'}`,
          padding: '10px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PulseDot color={emptyBalance ? '#b91c1c' : '#a16207'} size={7} />
            <div style={{ fontSize: 12.5, color: emptyBalance ? '#991b1b' : '#92400e' }}>
              {emptyBalance ? (
                <>
                  <strong>{tr('appShell.banner.emptyTitle')}</strong> {tr('appShell.banner.emptyBody')} <span style={{ fontFamily: 'var(--font-mono)' }}>402 Payment Required</span>{tr('appShell.banner.emptyReturning')}
                </>
              ) : (
                <>
                  <strong>{tr('appShell.banner.lowTitle')}</strong> {tr('appShell.banner.lowBody', { balance: balance.toFixed(2), tokens: fmt.tokens(usdToOpusTokens(balance)), model: OPUS48_LABEL })}
                </>
              )}
            </div>
          </div>
          <button onClick={() => setTab('account')} style={{
            padding: '6px 14px', borderRadius: 8,
            background: emptyBalance ? '#b91c1c' : 'var(--ink)',
            color: '#fff', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <I.Wallet size={12} stroke="#fff" />
            {tr('appShell.banner.topUp')}
          </button>
        </div>
      )}

      <main key={tab} className="fade-in yz-main" style={{ flex: 1, padding: '24px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        {tab === 'home'     && <HomeTab     ctx={ctx} onTab={selectTab} onAction={onUserAction} />}
        {tab === 'models'   && <ModelsTab   ctx={ctx} />}
        {tab === 'packages' && <PackagesTab />}
        {tab === 'ai-chat' && <AiChatTab />}
        {tab === 'studio' && <StudioTab />}
        {tab === 'activity' && <ActivityTab ctx={ctx} />}
        {tab === 'documents' && <DocumentsTab />}
        {tab === 'status' && <StatusTab />}
        {tab === 'account'  && <AccountTab  ctx={ctx} />}
        {tab === 'admin' && isAdmin && <AdminTab ctx={ctx} />}
      </main>

      <footer style={{ display: 'none' }} />
      <SiteFooter />

      {showLogin && <LoginScreen />}
      <TelegramFloat href={profile?.telegram?.botUrl || FALLBACK_TELEGRAM_BOT_URL} />
      <WhatsAppFloat />

      {whatsappPendingToken && (
        <WhatsAppOtpScreen
          pendingToken={whatsappPendingToken}
          onVerified={(tokens) => {
            storeAuthTokens(tokens);
            clearWhatsappPendingToken();
            setWhatsappPendingToken('');
            setIsAuthenticated(true);
            setShowLogin(false);
            setTab(pendingTab || (PROTECTED_TABS.has(initialTab) ? initialTab : 'account'));
            setPendingTab(null);
          }}
          onCancel={() => {
            clearWhatsappPendingToken();
            setWhatsappPendingToken('');
            setShowLogin(true);
          }}
        />
      )}

    </div>
  );
};

export { App };
export default App;
