import { useCallback, useEffect, useRef, useState } from 'react';
import './tokens.css';
import {
  I, Card, Chip, Caption, PulseDot, Dot, PROVIDERS,
  mockLogs, mockProviderStatus, useLogStream,
} from './shared.jsx';
import { AccountTab } from './tab-account.jsx';
import { ActivityTab } from './tab-activity.jsx';
import { AdminTab } from './tab-admin.jsx';
import { DocumentsTab } from './tab-documents.jsx';
import { HomeTab } from './tab-home.jsx';
import { ModelsTab } from './tab-models.jsx';
import { LEGAL_DOCS } from './legal-docs.js';
import {
  apiJson,
  clearStoredAuth,
  clearWhatsappPendingToken,
  getAccessToken,
  getWhatsappPendingToken,
  hasStoredAuth,
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
const PROTECTED_TABS = new Set(['activity', 'account', 'admin']);
const SUPPORT_WHATSAPP_NUMBER = '905319310781';
const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`;

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

const formatNotifTime = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'yeni';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) return 'az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} sa önce`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay} gün önce`;
};

const formatNotifSub = (item) => {
  const tip = String(item?.tip || 'bilgi').toUpperCase();
  const end = item?.bitis ? new Date(item.bitis) : null;
  if (!end || Number.isNaN(end.getTime())) return `Sistem duyurusu · ${tip}`;
  return `Sistem duyurusu · ${tip} · ${end.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} kadar`;
};

// === Notifications dropdown =========================================
const NotificationsButton = () => {
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
      if (!response.ok) throw new Error(body?.message || `Bildirimler alınamadı (${response.status})`);
      const rows = Array.isArray(body) ? body : [];
      rows.sort((a, b) => new Date(b.baslangic || 0).getTime() - new Date(a.baslangic || 0).getTime());
      setItems(rows);
    } catch (err) {
      setItems([]);
      setError(err?.message || 'Bildirimler alınamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

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
            <span style={{ fontSize: 13, fontWeight: 600 }}>Bildirimler</span>
            <Chip tone="accent" style={{ fontSize: 10 }}>{activeCount} aktif</Chip>
          </div>
          {loading && (
            <div style={{ padding: '16px 14px', fontSize: 11.5, color: 'var(--ink-3)' }}>
              Bildirimler yükleniyor…
            </div>
          )}
          {!loading && error && (
            <div style={{ padding: '16px 14px', fontSize: 11.5, color: '#b91c1c' }}>
              {error}
            </div>
          )}
          {!loading && !error && activeCount === 0 && (
            <div style={{ padding: '16px 14px', fontSize: 11.5, color: 'var(--ink-3)' }}>
              Aktif admin duyurusu yok.
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
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{formatNotifSub(n)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 }}>{formatNotifTime(n.baslangic)}</div>
              </div>
            </div>
          ))}
          <div style={{
            width: '100%', padding: '10px',
            fontSize: 11.5, fontWeight: 500, color: 'var(--accent-ink)',
            background: 'transparent', textAlign: 'center',
          }}>Admin duyuruları anlık yayınlanır</div>
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
  const [legalOpen, setLegalOpen] = useState('');
  const startGoogleAuth = () => {
    window.location.assign('/api/auth/google');
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
        border: '1px solid var(--border)',
      }} className="yz-login-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Logo />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, textAlign: 'center', margin: '0 0 6px' }}>
          Google ile devam et
        </h2>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', margin: '0 0 24px' }}>
          YapayZekaLab hesabın Google oturumu ile açılır; ayrı şifre tutulmaz.
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
          Google ile giriş yap
        </button>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          Hesap oluşturma ve giriş aynı Google akışıyla tamamlanır.
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
            Giriş yaparak KVKK Aydınlatma Metni, Gizlilik Politikası, Kullanıcı Sözleşmesi ve Mesafeli Satış koşullarını kabul etmiş sayılırsınız.
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10, fontSize: 11.5 }}>
            <button type="button" onClick={() => setLegalOpen('kvkk')} style={{ color: 'var(--accent-ink)', textDecoration: 'underline' }}>KVKK</button>
            <button type="button" onClick={() => setLegalOpen('gizlilik')} style={{ color: 'var(--accent-ink)', textDecoration: 'underline' }}>Gizlilik</button>
            <button type="button" onClick={() => setLegalOpen('sozlesme')} style={{ color: 'var(--accent-ink)', textDecoration: 'underline' }}>Kullanıcı Sözleşmesi</button>
            <button type="button" onClick={() => setLegalOpen('mesafeli')} style={{ color: 'var(--accent-ink)', textDecoration: 'underline' }}>Mesafeli Satış</button>
          </div>
        </div>
        {legalOpen && <LegalModal docKey={legalOpen} onClose={() => setLegalOpen('')} />}
      </div>
    </div>
  );
};

// === WhatsAppOtpScreen — Google sonrası telefon doğrulama ===========
const WhatsAppOtpScreen = ({ pendingToken, onVerified, onCancel }) => {
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
      if (!response.ok) throw new Error(body?.error || 'Kod gönderilemedi.');
      setVerificationId(body.verificationId);
      setPhoneMasked(body.phoneMasked || '');
      setMessage('WhatsApp doğrulama kodu gönderildi.');
    } catch (err) {
      setError(err?.message || 'Kod gönderilemedi.');
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
      if (!response.ok) throw new Error(body?.error || 'Kod doğrulanamadı.');
      onVerified(body);
    } catch (err) {
      setError(err?.message || 'Kod doğrulanamadı.');
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
          WhatsApp doğrulaması
        </h2>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', margin: '0 0 24px', lineHeight: 1.55 }}>
          Google hesabın doğrulandı. Paneli açmadan önce WhatsApp numaranı tek seferlik kodla doğrula.
        </p>

        {!verificationId ? (
          <>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xx xxx xx xx"
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
              Kampanya ve duyuru mesajlarını WhatsApp üzerinden almak istiyorum. Bu izin OTP için zorunlu değildir.
            </label>
            <button type="button" disabled={submitting} onClick={() => requestOtp('start')} style={{
              width: '100%', padding: '11px 14px', borderRadius: 10,
              background: 'var(--ink)', color: '#fff',
              fontSize: 13, fontWeight: 600,
            }}>
              {submitting ? 'Gönderiliyor…' : 'WhatsApp kodu gönder'}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 10, textAlign: 'center' }}>
              Kod gönderilen numara: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{phoneMasked}</span>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              placeholder="6 haneli kod"
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
              {submitting ? 'Doğrulanıyor…' : 'Kodu doğrula'}
            </button>
            <button type="button" disabled={submitting} onClick={() => requestOtp('resend')} style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border-st)',
              fontSize: 12, fontWeight: 500, color: 'var(--ink-2)',
            }}>
              Kodu tekrar gönder
            </button>
          </>
        )}

        {message && <div style={{ marginTop: 14, fontSize: 12, color: '#047857', textAlign: 'center' }}>{message}</div>}
        {error && <div style={{ marginTop: 14, fontSize: 12, color: '#b91c1c', textAlign: 'center' }}>{error}</div>}

        <button type="button" onClick={onCancel} style={{
          display: 'block', margin: '18px auto 0',
          fontSize: 12, color: 'var(--ink-3)', background: 'transparent',
        }}>
          Girişe geri dön
        </button>
      </div>
    </div>
  );
};

// === LogoutConfirm — küçük modal ===================================
const LogoutConfirm = ({ onClose, onConfirm }) => (
  <div onClick={onClose} className="fade-in" style={{
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
    zIndex: 100, display: 'grid', placeItems: 'center', padding: 24,
  }}>
    <div onClick={(e) => e.stopPropagation()} style={{
      background: 'var(--surface)', borderRadius: 16, padding: 24,
      width: '100%', maxWidth: 380, boxShadow: 'var(--sh-3)',
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Çıkış yapılsın mı?</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, marginBottom: 20 }}>
        Aktif oturumun sonlandırılacak. Bakiyen ve API anahtarların korunur — tekrar giriş yaptığında her şey aynı kalır.
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 12, color: 'var(--ink-2)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>İptal</button>
        <button onClick={onConfirm} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff', background: '#b91c1c' }}>Çıkış yap</button>
      </div>
    </div>
  </div>
);

// === UserMenu — sağ üst kullanıcı dropdown'u =======================
const UserMenu = ({ onAction, profile, balanceUSD }) => {
  const [open, setOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const displayName = profile?.adSoyad || profile?.email?.split('@')[0] || 'Hesabım';
  const email = profile?.email || 'oturum aktif';
  const status = profile?.durum || 'aktif';
  const plan = profile?.planAd || profile?.plan || 'hesap';
  const userCode = profile?.id ? `u-${String(profile.id).slice(0, 4)}` : 'profil';
  const balanceHint = `$${Number(balanceUSD ?? profile?.bakiyeUsd ?? 0).toFixed(2)}`;

  const items = [
    { Ico: I.Wallet,   label: 'Hesabım & bakiye',     hint: balanceHint,          section: 'balance' },
    { Ico: I.Key,      label: 'API anahtarları',       hint: 'gerçek liste',       section: 'keys' },
    { Ico: I.Activity, label: 'Kullanım geçmişi',      hint: 'son istekler',       section: 'usage' },
    { Ico: I.Settings, label: 'Hesap ayarları',        hint: 'profil, email',     section: 'profile' },
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
          <div style={{ fontSize: 12, fontWeight: 500 }}>Hesabım</div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{plan}</div>
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
            <span>Çıkış yap</span>
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
  const tabs = [
    { id: 'home',     label: 'Ana Sayfa',  Ico: I.Home },
    { id: 'models',   label: 'Modeller',   Ico: I.Layers },
    { id: 'documents',label: 'Documents',  Ico: I.File },
    { id: 'activity', label: 'Aktivite',   Ico: I.Activity },
    { id: 'account',  label: 'Hesap',      Ico: I.Wallet },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', Ico: I.Shield }] : []),
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
        {isAuthenticated ? (
          <>
            {/* Balance pill — USD birincil, TL bilgi */}
            <button onClick={() => onTab('account')} style={{
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
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Model ara…</span>
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
              Giriş yap
            </button>
            <button onClick={onLoginClick} style={{
              padding: '8px 14px', borderRadius: 999,
              background: 'var(--ink)', color: '#fff',
              fontSize: 12.5, fontWeight: 700,
            }}>
              Kayıt ol
            </button>
          </>
        )}
      </div>
    </header>
  );
};

// === PublicStatus — açık erişim sistem durumu modali ================
const PublicStatusModal = ({ onClose }) => {
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
              <Caption style={{ color: allOk ? '#047857' : '#92400e' }}>Sistem durumu · public</Caption>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: allOk ? '#047857' : '#92400e' }}>
                {allOk ? 'Tüm servisler çevrimiçi' : `${ok} / ${total} sağlayıcı aktif`}
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
              const tone = s.durum === 'aktif' ? { bg: 'var(--ok-bg)', fg: '#047857', label: 'aktif' }
                          : s.durum === 'yavaş' ? { bg: '#fffbeb', fg: '#a16207', label: 'yavaş' }
                          : { bg: '#fef2f2', fg: '#b91c1c', label: 'kapalı' };
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
            Otomatik kontrol her 30 saniyede · status.yapayzekalab.org
          </div>
        </div>
      </div>
    </div>
  );
};

const LegalModal = ({ docKey, onClose }) => {
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
            <Caption>Yasal metin</Caption>
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

const WhatsAppFloat = () => (
  <a
    href={SUPPORT_WHATSAPP_URL}
    target="_blank"
    rel="noreferrer"
    aria-label="WhatsApp ile destek al"
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

// === Footer with public status link =================================
const SiteFooter = () => {
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
            {allOk ? 'Tüm servisler çevrimiçi' : `${okCount}/${mockProviderStatus.length} sağlayıcı`}
          </button>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>WhatsApp</a>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <button onClick={() => setLegalOpen('kvkk')} style={{ color: 'inherit', textDecoration: 'none' }}>KVKK</button>
          <button onClick={() => setLegalOpen('sozlesme')} style={{ color: 'inherit', textDecoration: 'none' }}>Kullanıcı Sözleşmesi</button>
          <button onClick={() => setLegalOpen('gizlilik')} style={{ color: 'inherit', textDecoration: 'none' }}>Gizlilik</button>
          <button onClick={() => setLegalOpen('mesafeli')} style={{ color: 'inherit', textDecoration: 'none' }}>Mesafeli Satış</button>
        </div>
      </footer>
      {statusOpen && <PublicStatusModal onClose={() => setStatusOpen(false)} />}
      {legalOpen && <LegalModal docKey={legalOpen} onClose={() => setLegalOpen('')} />}
    </>
  );
};
const App = ({ initialTab = 'home' }) => {
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
  const isAdmin = String(profile?.email || '').trim().toLowerCase() === ADMIN_EMAIL;

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const accessToken = query.get('at');
    const refreshToken = query.get('rt');
    const whatsappToken = query.get('wpt');

    if (!accessToken && !refreshToken && !whatsappToken) return;

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
    setTab(pendingTab || (PROTECTED_TABS.has(initialTab) ? initialTab : 'account'));
    setPendingTab(null);
  }, [initialTab, pendingTab]);

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
  const logs = useLogStream({ running: rate.running, intervalMs: 3000, speedMul: rate.mul, max: 80 });

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
      setGoto(action.section || null);
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
                  <strong>Bakiyen bitti.</strong> Yeni API çağrıları <span style={{ fontFamily: 'var(--font-mono)' }}>402 Payment Required</span> dönüyor.
                </>
              ) : (
                <>
                  <strong>Bakiyen düşük:</strong> ${balance.toFixed(2)} kaldı. Ortalama maliyetle bu ~{Math.round(balance * 200)} istek demek.
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
            Bakiye yükle
          </button>
        </div>
      )}

      <main key={tab} className="fade-in yz-main" style={{ flex: 1, padding: '24px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        {tab === 'home'     && <HomeTab     ctx={ctx} onTab={selectTab} />}
        {tab === 'models'   && <ModelsTab   ctx={ctx} />}
        {tab === 'activity' && <ActivityTab ctx={ctx} />}
        {tab === 'documents' && <DocumentsTab />}
        {tab === 'account'  && <AccountTab  ctx={ctx} />}
        {tab === 'admin' && isAdmin && <AdminTab ctx={ctx} />}
      </main>

      <footer style={{ display: 'none' }} />
      <SiteFooter />

      {showLogin && <LoginScreen />}
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
