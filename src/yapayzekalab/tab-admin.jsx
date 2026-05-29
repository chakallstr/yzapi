import { useEffect, useMemo, useState } from 'react';
import {
  I, Card, Chip, Caption, PulseDot,
  PROVIDERS, MODELS, modelMeta, fmt, useCountUp,
} from './shared.jsx';
import { AdminTrafficAnalytics } from './tab-admin-traffic.jsx';

const LAUNCH_ADMIN_EMAIL = 'cix.crazy666@gmail.com';
const ACCESS_TOKEN_KEY = 'yz_access_token';
const LEGACY_ACCESS_TOKEN_KEY = 'userAccessToken';

const ADMIN_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', Ico: I.Activity },
  { id: 'traffic', label: 'Trafik Analitiği', Ico: I.TrendUp },
  { id: 'users', label: 'Kullanıcılar', Ico: I.Users },
  { id: 'overrides', label: 'Modeller', Ico: I.Layers },
  { id: 'announce', label: 'Duyurular', Ico: I.Megaphone },
  { id: 'providers', label: 'Sağlayıcı', Ico: I.Server },
  { id: 'kur', label: 'Kur', Ico: I.Coins },
  { id: 'payments', label: 'Ödeme', Ico: I.Wallet },
  { id: 'telegram', label: 'Telegram', Ico: I.Bell },
  { id: 'apikeys', label: 'API anahtarları', Ico: I.Key },
  { id: 'logs', label: 'Loglar', Ico: I.Terminal },
  { id: 'animations', label: 'Animasyon', Ico: I.Sparkle },
];

const STATUS_TONE = {
  aktif: { bg: 'var(--ok-bg)', fg: '#047857', label: 'aktif' },
  yavaş: { bg: '#fff7ed', fg: '#c2410c', label: 'yavaş' },
  kapali: { bg: '#fef2f2', fg: '#b91c1c', label: 'kapalı' },
  askida: { bg: '#fef2f2', fg: '#b91c1c', label: 'askıda' },
  bekliyor: { bg: '#fffbeb', fg: '#a16207', label: 'bekliyor' },
};

const PLAN_TONE = {
  ucretsiz: { bg: 'rgba(15,23,42,0.06)', fg: 'var(--ink-2)' },
  pro: { bg: 'var(--accent-bg)', fg: 'var(--accent-ink)' },
  kurumsal: { bg: 'var(--t-purple-bg)', fg: 'var(--t-purple)' },
};

const ANN_TONE = {
  bilgi: { bg: 'var(--accent-bg)', fg: 'var(--accent-ink)', label: 'BILGI' },
  uyari: { bg: '#fffbeb', fg: '#a16207', label: 'UYARI' },
  hata: { bg: '#fef2f2', fg: '#b91c1c', label: 'HATA' },
  basari: { bg: 'var(--ok-bg)', fg: '#047857', label: 'BAŞARI' },
};

const grid = (min = 220) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap: 14,
});

const inputStyle = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  fontSize: 12,
  outline: 'none',
};

const getAdminToken = () => {
  try {
    return (
      window.localStorage?.getItem(ACCESS_TOKEN_KEY) ||
      window.localStorage?.getItem(LEGACY_ACCESS_TOKEN_KEY) ||
      ''
    );
  } catch {
    return '';
  }
};

const adminRequest = async (path, token, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.message || body?.error || `Admin isteği başarısız (${response.status})`;
    throw new Error(message);
  }
  return body;
};

const adminDownload = async (path, token) => {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(path, { headers });
  if (!response.ok) throw new Error('CSV indirilemedi');
  return response.blob();
};

const safeDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const money = (value) => `₺${Number(value || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const initials = (name = '') => name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'YZ';
const userCodeFromId = (id = '') => (id ? `u-${String(id).replace(/-/g, '').slice(0, 8)}` : '—');
const StatusChip = ({ status }) => {
  const tone = STATUS_TONE[status] || STATUS_TONE.bekliyor;
  return <Chip tone="neutral" style={{ background: tone.bg, color: tone.fg, fontSize: 10 }}>{tone.label || status}</Chip>;
};

const EmptyState = ({ children = 'Kayıt yok.' }) => (
  <div style={{ padding: 18, borderRadius: 12, border: '1px dashed var(--border)', color: 'var(--ink-3)', fontSize: 12 }}>
    {children}
  </div>
);

const ErrorBox = ({ children }) => (
  <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: 12 }}>
    {children}
  </div>
);

const SubNav = ({ section, onSection }) => (
  <div style={{
    display: 'flex', gap: 4, padding: 5,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh-1)',
    overflowX: 'auto', maxWidth: '100%',
  }}>
    {ADMIN_SECTIONS.map((s) => {
      const on = section === s.id;
      return (
        <button key={s.id} onClick={() => onSection(s.id)} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 14px', borderRadius: 'var(--r-sm)',
          fontSize: 12.5, fontWeight: 500,
          color: on ? '#fff' : 'var(--ink-2)',
          background: on ? 'var(--ink)' : 'transparent',
          whiteSpace: 'nowrap', flexShrink: 0,
          transition: 'all 0.15s',
        }}>
          <s.Ico size={14} stroke={on ? '#fff' : 'var(--ink-2)'} />
          <span>{s.label}</span>
        </button>
      );
    })}
  </div>
);

const AdminKPI = ({ label, value, sub, Ico, decimals = 0 }) => {
  const n = useCountUp(Number(value || 0), { duration: 850, decimals });
  return (
    <Card pad={20}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <Caption>{label}</Caption>
        {Ico && (
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-bg)', display: 'grid', placeItems: 'center' }}>
            <Ico size={14} stroke="var(--accent-ink)" />
          </div>
        )}
      </div>
      <div className="tnum" style={{ fontSize: 28, fontWeight: 600, letterSpacing: -1 }}>
        {decimals ? n.toFixed(decimals) : fmt.num(Math.round(n))}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{sub}</div>}
    </Card>
  );
};

const AdminAccessNotice = () => (
  <Card pad={26} style={{ maxWidth: 520 }}>
    <Caption>Admin erişimi</Caption>
    <h2 style={{ fontSize: 24, fontWeight: 600, margin: '8px 0 8px' }}>Yetkili oturum gerekli</h2>
    <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 0 }}>
      Admin paneli yalnızca Google ile giriş yapmış açılış yöneticisine görünür.
      Yetkili e-posta: <span style={{ fontFamily: 'var(--font-mono)' }}>{LAUNCH_ADMIN_EMAIL}</span>
    </p>
  </Card>
);

const AdminDashboard = ({ dashboard, config, auditLogs, providers }) => {
  const providerRows = providers.length ? providers : (dashboard?.providerDurumlari || []);
  const recentLogs = auditLogs.length ? auditLogs.slice(0, 5) : (dashboard?.sonAuditLogs || []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={grid(170)}>
        <AdminKPI label="Toplam Kullanıcı" value={dashboard?.toplamKullanici || 0} Ico={I.Users} sub="veritabanından" />
        <AdminKPI label="Bakiye Toplamı" value={dashboard?.toplamBakiyeTL || 0} decimals={2} Ico={I.Wallet} sub="TL ledger" />
        <AdminKPI label="Bugünkü İşlem" value={dashboard?.bugunIstek || 0} Ico={I.Activity} sub="son 24 saat" />
        <AdminKPI label="Aktif Duyuru" value={dashboard?.aktifDuyuru || 0} Ico={I.Megaphone} sub="yayında" />
        <AdminKPI label="Toplam İstek" value={dashboard?.toplamIstek || 0} Ico={I.TrendUp} sub="kullanıcı toplamı" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.9fr)', gap: 18 }}>
        <Card pad={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Sağlayıcı durumu</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Canlı admin API kaydı</div>
            </div>
            <Chip tone="ok"><PulseDot color="#10b981" size={5} withRing={false} />DB</Chip>
          </div>
          {providerRows.length === 0 ? <EmptyState>Sağlayıcı kaydı yok.</EmptyState> : (
            <div style={grid(210)}>
              {providerRows.map((s) => {
                const p = PROVIDERS[s.provider] || { label: s.provider, color: 'var(--ink-3)' };
                return (
                  <div key={s.provider} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{p.label}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                        {s.gecikmeMs ? `${s.gecikmeMs}ms` : '—'} · {safeDate(s.sonKontrol)}
                      </div>
                    </div>
                    <StatusChip status={s.durum} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card pad={20}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Son audit logları</div>
          {recentLogs.length === 0 ? <EmptyState>Audit log yok.</EmptyState> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentLogs.map((l) => (
                <div key={l.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{l.action}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{safeDate(l.timestamp)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.45 }}>{l.hedef} — {l.ozet}</div>
                </div>
              ))}
            </div>
          )}
          {config && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--accent-bg)', color: 'var(--accent-ink)', fontSize: 11.5 }}>
              Kur: <strong>{Number(config.kur || 0).toFixed(2)}</strong> · Son yenileme: {safeDate(config.lastKurRefresh)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

const AdminUsers = ({ users, token, refresh, focusUserId = '', focusNonce = '' }) => {
  const [q, setQ] = useState('');
  const [openUserId, setOpenUserId] = useState('');
  const [detailById, setDetailById] = useState({});
  const [detailLoadingId, setDetailLoadingId] = useState('');
  const [detailError, setDetailError] = useState('');
  const [draftById, setDraftById] = useState({});
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => `${u.email} ${u.adSoyad}`.toLowerCase().includes(needle));
  }, [q, users]);

  const updateUser = async (user, patch) => {
    await adminRequest(`/api/admin/users/${user.id}`, token, { method: 'PATCH', body: patch });
    await refresh();
  };

  const updateBalance = async (user, mode = 'add') => {
    const isRemove = mode === 'remove';
    const label = isRemove ? 'silinecek' : 'eklenecek';
    const rawAmount = Number(window.prompt(`${user.email} için ${label} TL tutarı`, '0'));
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) return;
    const amount = isRemove ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    const defaultNote = isRemove ? 'Manuel admin bakiye düşümü' : 'Manuel admin bakiye ekleme';
    const note = window.prompt('Açıklama', defaultNote) || defaultNote;
    await adminRequest(`/api/admin/users/${user.id}/bakiye`, token, { method: 'POST', body: { miktar: amount, aciklama: note } });
    await refresh();
    if (openUserId === user.id) await loadDetail(user.id, true);
  };

  const loadDetail = async (userId, force = false) => {
    if (!force && detailById[userId]) return detailById[userId];
    setDetailLoadingId(userId);
    setDetailError('');
    try {
      const detail = await adminRequest(`/api/admin/users/${userId}/detail`, token);
      setDetailById((current) => ({ ...current, [userId]: detail }));
      setDraftById((current) => ({
        ...current,
        [userId]: {
          adSoyad: detail.user?.adSoyad || '',
          durum: detail.user?.durum || 'aktif',
          plan: detail.user?.plan || 'ucretsiz',
          not: detail.user?.not || '',
          gunlukLimitTL: detail.user?.gunlukLimitTL ?? '',
        },
      }));
      return detail;
    } finally {
      setDetailLoadingId('');
    }
  };

  const toggleDetail = async (userId) => {
    if (openUserId === userId) {
      setOpenUserId('');
      setDetailError('');
      return;
    }
    setOpenUserId(userId);
    try {
      await loadDetail(userId);
    } catch (error) {
      setDetailError(error.message || 'Kullanıcı detayı alınamadı.');
    }
  };

  const setDraftField = (userId, key, value) => {
    setDraftById((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] || {}),
        [key]: value,
      },
    }));
  };

  const saveDetail = async (userId) => {
    const draft = draftById[userId];
    if (!draft) return;
    await adminRequest(`/api/admin/users/${userId}`, token, {
      method: 'PATCH',
      body: {
        adSoyad: draft.adSoyad,
        durum: draft.durum,
        plan: draft.plan,
        not: draft.not,
        gunlukLimitTL: draft.gunlukLimitTL === '' ? null : Number(draft.gunlukLimitTL),
      },
    });
    await refresh();
    await loadDetail(userId, true);
  };

  const createAdminKey = async (user) => {
    const ad = window.prompt(`${user.email} için API anahtarı adı`, 'admin-olusturulan-key');
    if (!ad?.trim()) return;
    const result = await adminRequest(`/api/admin/api-keys/${user.id}/create`, token, {
      method: 'POST',
      body: { ad: ad.trim() },
    });
    window.alert(`Yeni anahtar oluşturuldu: ${result.maskedKey}`);
    if (openUserId === user.id) await loadDetail(user.id, true);
    await refresh();
  };

  useEffect(() => {
    if (!focusUserId) return;
    const user = users.find((row) => row.id === focusUserId);
    if (!user) return;
    setQ(user.email || user.adSoyad || '');
    setOpenUserId(focusUserId);
    loadDetail(focusUserId, true).catch((error) => {
      setDetailError(error.message || 'Kullanıcı detayı alınamadı.');
    });
  }, [focusUserId, focusNonce, users]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card pad={16}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kullanıcı ara…" style={inputStyle} />
      </Card>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) 120px 120px 120px 120px 160px', gap: 12, padding: '13px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
          {['Kullanıcı', 'Bakiye', 'İstek', 'Plan', 'Durum', 'İşlem'].map((h) => <Caption key={h} style={{ fontSize: 9 }}>{h}</Caption>)}
        </div>
        {filtered.length === 0 && <div style={{ padding: 16 }}><EmptyState>Kullanıcı bulunamadı.</EmptyState></div>}
        {filtered.map((u, i) => {
          const planTone = PLAN_TONE[u.plan] || PLAN_TONE.ucretsiz;
          return (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) 120px 120px 120px 120px 160px', gap: 12, padding: '13px 16px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', fontSize: 12, minWidth: 920 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-bg)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600 }}>{initials(u.adSoyad || u.email)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.adSoyad || u.email}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                </div>
              </div>
              <span className="tnum" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{money(u.bakiyeTL)}</span>
              <span className="tnum" style={{ fontFamily: 'var(--font-mono)' }}>{fmt.num(u.toplamIstek || 0)}</span>
              <Chip tone="neutral" style={{ background: planTone.bg, color: planTone.fg, fontSize: 10 }}>{u.plan}</Chip>
              <StatusChip status={u.durum} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => toggleDetail(u.id)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>{openUserId === u.id ? 'Kapat' : 'Detay'}</button>
                <button onClick={() => updateUser(u, { durum: u.durum === 'aktif' ? 'askida' : 'aktif' })} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>Durum</button>
                <button onClick={() => updateUser(u, { plan: u.plan === 'pro' ? 'kurumsal' : 'pro' })} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>Plan</button>
                <button onClick={() => updateBalance(u, 'add')} style={{ padding: '6px 9px', borderRadius: 8, background: 'var(--ink)', color: '#fff', fontSize: 11 }}>Bakiye +</button>
                <button onClick={() => updateBalance(u, 'remove')} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', fontSize: 11 }}>Bakiye -</button>
              </div>
              {openUserId === u.id && (
                <div style={{ gridColumn: '1 / -1', paddingTop: 10 }}>
                  {detailError && <ErrorBox>{detailError}</ErrorBox>}
                  {detailLoadingId === u.id && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Kullanıcı detayı yükleniyor…</div>}
                  {detailById[u.id] && (() => {
                    const detail = detailById[u.id];
                    const draft = draftById[u.id] || {};
                    return (
                      <Card pad={16} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 600 }}>{detail.user?.adSoyad || detail.user?.email}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{detail.user?.email}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Chip tone="neutral" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{detail.userCode || userCodeFromId(u.id)}</Chip>
                            <StatusChip status={detail.user?.durum} />
                            <Chip tone="neutral" style={{ background: planTone.bg, color: planTone.fg, fontSize: 10 }}>{detail.user?.plan}</Chip>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                          <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}><Caption>Toplam istek</Caption><div className="tnum" style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{fmt.num(detail.summary?.requestCount || 0)}</div></div>
                          <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}><Caption>Input token</Caption><div className="tnum" style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{fmt.num(detail.summary?.totalInputTokens || 0)}</div></div>
                          <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}><Caption>Output token</Caption><div className="tnum" style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{fmt.num(detail.summary?.totalOutputTokens || 0)}</div></div>
                          <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}><Caption>Toplam harcama</Caption><div className="tnum" style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{money(detail.summary?.totalCostTL || 0)}</div></div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <Caption>Ad soyad</Caption>
                            <input value={draft.adSoyad || ''} onChange={(e) => setDraftField(u.id, 'adSoyad', e.target.value)} style={inputStyle} />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <Caption>Durum</Caption>
                            <select value={draft.durum || 'aktif'} onChange={(e) => setDraftField(u.id, 'durum', e.target.value)} style={inputStyle}>
                              <option value="aktif">aktif</option>
                              <option value="askida">askıda</option>
                            </select>
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <Caption>Plan</Caption>
                            <select value={draft.plan || 'ucretsiz'} onChange={(e) => setDraftField(u.id, 'plan', e.target.value)} style={inputStyle}>
                              <option value="ucretsiz">ucretsiz</option>
                              <option value="pro">pro</option>
                              <option value="kurumsal">kurumsal</option>
                            </select>
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <Caption>Günlük limit TL</Caption>
                            <input value={draft.gunlukLimitTL ?? ''} onChange={(e) => setDraftField(u.id, 'gunlukLimitTL', e.target.value)} type="number" step="0.01" placeholder="boş = limitsiz" style={inputStyle} />
                          </label>
                        </div>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                          <Caption>Admin notu</Caption>
                          <textarea value={draft.not || ''} onChange={(e) => setDraftField(u.id, 'not', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 78 }} />
                        </label>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                          <button onClick={() => saveDetail(u.id)} style={{ padding: '9px 12px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontSize: 12, fontWeight: 600 }}>Detayı kaydet</button>
                          <button onClick={() => createAdminKey(u)} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12 }}>API key oluştur</button>
                          <button onClick={() => updateBalance(u, 'add')} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12 }}>Bakiye ekle</button>
                          <button onClick={() => updateBalance(u, 'remove')} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', fontSize: 12 }}>Bakiye sil</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
                          <Card pad={0} style={{ overflow: 'hidden' }}>
                            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>API anahtarları</div>
                            </div>
                            {(detail.apiKeys || []).length === 0 ? <div style={{ padding: 14 }}><EmptyState>API anahtarı yok.</EmptyState></div> : detail.apiKeys.map((key, index) => (
                              <div key={key.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 120px 110px', gap: 10, padding: '10px 14px', borderBottom: index < detail.apiKeys.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 11.5 }}>
                                <div><div style={{ fontWeight: 600 }}>{key.ad}</div><div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{key.maskedKey}</div></div>
                                <div style={{ color: 'var(--ink-3)' }}>{safeDate(key.sonKullanim || key.olusturma)}</div>
                                <StatusChip status={key.aktif ? 'aktif' : 'kapali'} />
                              </div>
                            ))}
                          </Card>

                          <Card pad={0} style={{ overflow: 'hidden' }}>
                            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>Model kullanımı</div>
                            </div>
                            {(detail.modelStats || []).length === 0 ? <div style={{ padding: 14 }}><EmptyState>Kullanım kaydı yok.</EmptyState></div> : detail.modelStats.slice(0, 8).map((row, index) => (
                              <div key={`${row.modelId}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 70px 110px 110px', gap: 10, padding: '10px 14px', borderBottom: index < Math.min(detail.modelStats.length, 8) - 1 ? '1px solid var(--border)' : 'none', fontSize: 11.5 }}>
                                <div><div style={{ fontWeight: 600 }}>{modelMeta(row.modelId).label}</div><div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{row.modelId}</div></div>
                                <div className="tnum">{fmt.num(row.requests)}</div>
                                <div className="tnum">{fmt.num(row.totalTokens)}</div>
                                <div className="tnum" style={{ fontWeight: 600 }}>{money(row.costTL)}</div>
                              </div>
                            ))}
                          </Card>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 0.9fr)', gap: 14, marginTop: 14 }}>
                          <Card pad={0} style={{ overflow: 'hidden' }}>
                            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>Son API kullanımı</div>
                            </div>
                            {(detail.usageRecords || []).length === 0 ? <div style={{ padding: 14 }}><EmptyState>Kullanım kaydı yok.</EmptyState></div> : detail.usageRecords.slice(0, 12).map((row, index) => (
                              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 1fr) 70px 70px 90px 90px 120px', gap: 10, padding: '10px 14px', borderBottom: index < Math.min(detail.usageRecords.length, 12) - 1 ? '1px solid var(--border)' : 'none', fontSize: 11.5 }}>
                                <div><div style={{ fontWeight: 600 }}>{modelMeta(row.modelId).label}</div><div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{row.requestId || row.id}</div></div>
                                <div className="tnum">{fmt.num(row.inputUsage || 0)}</div>
                                <div className="tnum">{fmt.num(row.outputUsage || 0)}</div>
                                <div className="tnum">{money(row.costTL || 0)}</div>
                                <StatusChip status={row.status === 'success' ? 'aktif' : 'askida'} />
                                <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{safeDate(row.timestamp)}</div>
                              </div>
                            ))}
                          </Card>

                          <Card pad={0} style={{ overflow: 'hidden' }}>
                            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>Bakiye hareketleri</div>
                            </div>
                            {(detail.transactions || []).length === 0 ? <div style={{ padding: 14 }}><EmptyState>Hareket yok.</EmptyState></div> : detail.transactions.slice(0, 12).map((row, index) => (
                              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '90px 90px 1fr 110px', gap: 10, padding: '10px 14px', borderBottom: index < Math.min(detail.transactions.length, 12) - 1 ? '1px solid var(--border)' : 'none', fontSize: 11.5 }}>
                                <div className="tnum" style={{ fontWeight: 600, color: Number(row.miktarTL || 0) >= 0 ? '#047857' : '#b91c1c' }}>{money(row.miktarTL || 0)}</div>
                                <div className="tnum">{money(row.sonrakiBakiye || 0)}</div>
                                <div>{row.aciklama || row.tip}</div>
                                <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{safeDate(row.timestamp)}</div>
                              </div>
                            ))}
                          </Card>
                        </div>
                      </Card>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
};

const AdminOverrides = ({ overrides, token, refresh }) => {
  const [modelId, setModelId] = useState(MODELS[0]?.id || '');
  const [inputUsdOverride, setInputUsdOverride] = useState('');
  const [outputUsdOverride, setOutputUsdOverride] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const selectedModel = useMemo(() => MODELS.find((m) => m.id === modelId) || MODELS[0], [modelId]);
  const currentOverride = useMemo(
    () => (overrides || []).find((override) => override.modelId === modelId) || null,
    [overrides, modelId],
  );
  useEffect(() => {
    setInputUsdOverride(currentOverride?.inputUsdOverride !== null && currentOverride?.inputUsdOverride !== undefined ? String(currentOverride.inputUsdOverride) : '');
    setOutputUsdOverride(currentOverride?.outputUsdOverride !== null && currentOverride?.outputUsdOverride !== undefined ? String(currentOverride.outputUsdOverride) : '');
    setEnabled(currentOverride ? currentOverride.enabled !== false : true);
    setSaved(false);
    setError('');
  }, [currentOverride, modelId]);

  const startEdit = (override) => {
    setModelId(override.modelId);
    setInputUsdOverride(override.inputUsdOverride !== null && override.inputUsdOverride !== undefined ? String(override.inputUsdOverride) : '');
    setOutputUsdOverride(override.outputUsdOverride !== null && override.outputUsdOverride !== undefined ? String(override.outputUsdOverride) : '');
    setEnabled(override.enabled !== false);
    setSaved(false);
    setError('');
  };

  const clearForm = () => {
    setInputUsdOverride('');
    setOutputUsdOverride('');
    setEnabled(true);
    setSaved(false);
    setError('');
  };

  const save = async () => {
    const nextInput = inputUsdOverride === '' ? null : Number(inputUsdOverride);
    const nextOutput = outputUsdOverride === '' ? null : Number(outputUsdOverride);
    if ((nextInput !== null && !Number.isFinite(nextInput)) || (nextOutput !== null && !Number.isFinite(nextOutput))) {
      setError('Override alanlarına geçerli sayı gir.');
      setSaved(false);
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await adminRequest('/api/admin/model-overrides', token, {
        method: 'POST',
        body: {
          modelId,
          enabled,
          inputUsdOverride: nextInput,
          outputUsdOverride: nextOutput,
          notlar: 'Admin panelinden güncellendi',
        },
      });
      await refresh();
      setSaved(true);
    } catch (saveError) {
      setError(saveError.message || 'Override kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const toggleOverride = async (override) => {
    await adminRequest('/api/admin/model-overrides', token, {
      method: 'POST',
      body: {
        modelId: override.modelId,
        enabled: !override.enabled,
        inputUsdOverride: override.inputUsdOverride,
        outputUsdOverride: override.outputUsdOverride,
        notlar: 'Admin panelinden durum güncellendi',
      },
    });
    await refresh();
    if (modelId === override.modelId) {
      setEnabled(!override.enabled);
    }
  };

  const removeOverride = async (override) => {
    if (!window.confirm(`${modelMeta(override.modelId).label} override silinsin mi?`)) return;
    await adminRequest(`/api/admin/model-overrides/${encodeURIComponent(override.modelId)}`, token, {
      method: 'DELETE',
    });
    await refresh();
    if (modelId === override.modelId) clearForm();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card pad={18}>
        <Caption>Model override</Caption>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) 150px', gap: 12, alignItems: 'end' }}>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} style={inputStyle}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <input value={inputUsdOverride} onChange={(e) => setInputUsdOverride(e.target.value)} placeholder="input USD/M override" type="number" step="0.0001" style={inputStyle} />
          <input value={outputUsdOverride} onChange={(e) => setOutputUsdOverride(e.target.value)} placeholder="output USD/M override" type="number" step="0.0001" style={inputStyle} />
          <button onClick={save} disabled={saving} style={{ borderRadius: 9, background: 'var(--ink)', color: '#fff', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <Caption>Geçerli fiyat</Caption>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{selectedModel ? `${usd(selectedModel.input)} · ${usd(selectedModel.output)}` : '—'}</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>{selectedModel?.ctx || '—'} ctx · {selectedModel?.provider || '—'}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <Caption>Etkin fiyat</Caption>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>
              {usd(inputUsdOverride === '' ? selectedModel?.input : Number(inputUsdOverride || 0))} · {usd(outputUsdOverride === '' ? selectedModel?.output : Number(outputUsdOverride || 0))}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>{currentOverride ? 'override mevcut' : 'taban fiyat'}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Caption>Durum</Caption>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <StatusChip status={enabled ? 'aktif' : 'kapali'} />
              <button onClick={() => setEnabled((value) => !value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>
                {enabled ? 'Pasifleştir' : 'Aktifleştir'}
              </button>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button onClick={clearForm} style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>Formu temizle</button>
          {currentOverride && (
            <button onClick={() => removeOverride(currentOverride)} style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', fontSize: 11 }}>
              Override kaldır
            </button>
          )}
          {saved && <Chip tone="ok">Override kaydedildi</Chip>}
        </div>
        {error && <div style={{ marginTop: 10 }}><ErrorBox>{error}</ErrorBox></div>}
      </Card>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {(overrides || []).length === 0 ? <div style={{ padding: 16 }}><EmptyState>Override yok.</EmptyState></div> : overrides.map((o, i) => {
          const m = modelMeta(o.modelId);
          return (
            <div key={o.modelId} style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) 120px 120px 80px 220px', gap: 12, padding: '13px 16px', borderBottom: i < overrides.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', fontSize: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{m.label}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>{m.id}</div>
              </div>
              <span>{o.inputUsdOverride === null ? '—' : usd(o.inputUsdOverride)}</span>
              <span>{o.outputUsdOverride === null ? '—' : usd(o.outputUsdOverride)}</span>
              <Chip tone={o.enabled ? 'ok' : 'neutral'}>{o.enabled ? 'aktif' : 'pasif'}</Chip>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => startEdit(o)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>Düzenle</button>
                <button onClick={() => toggleOverride(o)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>{o.enabled ? 'Pasifleştir' : 'Aktifleştir'}</button>
                <button onClick={() => removeOverride(o)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', fontSize: 11 }}>Override kaldır</button>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
};

const AdminAnnouncements = ({ announcements, token, refresh }) => {
  const [message, setMessage] = useState('');
  const [tip, setTip] = useState('bilgi');

  const create = async () => {
    if (!message.trim()) return;
    const now = new Date();
    const until = new Date(Date.now() + 7 * 86400000);
    await adminRequest('/api/admin/announcements', token, {
      method: 'POST',
      body: { mesaj: message.trim(), tip, aktif: true, baslangic: now.toISOString(), bitis: until.toISOString() },
    });
    setMessage('');
    await refresh();
  };

  const toggle = async (a) => {
    await adminRequest(`/api/admin/announcements/${a.id}`, token, { method: 'PATCH', body: { aktif: !a.aktif } });
    await refresh();
  };

  const remove = async (a) => {
    if (!window.confirm('Duyuru silinsin mi?')) return;
    await adminRequest(`/api/admin/announcements/${a.id}`, token, { method: 'DELETE' });
    await refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card pad={18}>
        <Caption>Yeni duyuru</Caption>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) 130px 120px', gap: 10, alignItems: 'center' }}>
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Duyuru metni" style={inputStyle} />
          <select value={tip} onChange={(e) => setTip(e.target.value)} style={inputStyle}>
            {Object.keys(ANN_TONE).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={create} style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontWeight: 600 }}>Yayınla</button>
        </div>
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {announcements.length === 0 && <EmptyState>Duyuru yok.</EmptyState>}
        {announcements.map((a) => {
          const tone = ANN_TONE[a.tip] || ANN_TONE.bilgi;
          return (
            <Card key={a.id} pad={16}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <Chip tone="neutral" style={{ background: tone.bg, color: tone.fg, fontSize: 9.5 }}>{tone.label}</Chip>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>{a.mesaj}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>{safeDate(a.baslangic)} → {safeDate(a.bitis)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => toggle(a)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>{a.aktif ? 'Pasifleştir' : 'Aktifleştir'}</button>
                  <button onClick={() => remove(a)} style={{ padding: '6px 9px', borderRadius: 8, color: '#b91c1c', border: '1px solid #fecaca', fontSize: 11 }}>Sil</button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const AdminProviders = ({ providers, token, refresh }) => {
  const updateProvider = async (provider, patch) => {
    await adminRequest(`/api/admin/provider-durumu/${encodeURIComponent(provider)}`, token, { method: 'PATCH', body: patch });
    await refresh();
  };

  return (
    <div style={grid(240)}>
      {providers.length === 0 && <EmptyState>Sağlayıcı kaydı yok.</EmptyState>}
      {providers.map((p) => {
        const meta = PROVIDERS[p.provider] || { label: p.provider, color: 'var(--ink-3)' };
        return (
          <Card key={p.provider} pad={18}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <Caption>{p.provider}</Caption>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, marginTop: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: meta.color }} />
                  {meta.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>{safeDate(p.sonKontrol)} · {p.gecikmeMs || '—'}ms</div>
              </div>
              <StatusChip status={p.durum} />
            </div>
            {p.not && <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink-2)' }}>{p.not}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
              {['aktif', 'yavaş', 'kapali'].map((status) => (
                <button key={status} onClick={() => updateProvider(p.provider, { durum: status })} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>{status}</button>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
};

const AdminKur = ({ config, kurHistory, token, refresh }) => {
  const refreshKur = async () => {
    await adminRequest('/api/admin/refresh-kur', token, { method: 'POST' });
    await refresh();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.8fr) minmax(300px, 1.2fr)', gap: 18 }}>
      <Card pad={20}>
        <Caption>Kur ayarı</Caption>
        <div className="tnum" style={{ fontSize: 42, fontWeight: 650, letterSpacing: -2, color: 'var(--accent)' }}>
          {Number(config?.kur || 0).toFixed(2)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7 }}>
          Canlı kur: {Number(config?.liveKur || 0).toFixed(2)} · Buffer: %{Number(config?.kurBuffer || 0).toFixed(3) * 100}
          <br />
          Saatlik yenileme: {config?.autoKurRefresh ? 'aktif' : 'kapalı'} · {config?.kurRefreshIntervalDk || 60} dk
          <br />
          Son yenileme: {safeDate(config?.lastKurRefresh)}
        </div>
        <button onClick={refreshKur} style={{ marginTop: 14, width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--ink)', color: '#fff', fontWeight: 600 }}>
          Kuru şimdi yenile
        </button>
      </Card>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Kur geçmişi</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Son 24 kayıt</div>
        </div>
        {kurHistory.length === 0 ? <div style={{ padding: 16 }}><EmptyState>Kur geçmişi yok.</EmptyState></div> : kurHistory.map((k, i) => (
          <div key={`${k.timestamp}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 80px', gap: 12, padding: '12px 16px', borderBottom: i < kurHistory.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{safeDate(k.timestamp)}</span>
            <span className="tnum">{Number(k.liveKur || 0).toFixed(2)}</span>
            <span className="tnum" style={{ fontWeight: 600 }}>{Number(k.sellKur || 0).toFixed(2)}</span>
            <Chip tone="neutral" style={{ justifySelf: 'start', fontSize: 9.5 }}>{k.source}</Chip>
          </div>
        ))}
      </Card>
    </div>
  );
};

const AdminPaymentSettings = ({ config, token, refresh }) => {
  const [form, setForm] = useState({
    paymentWhatsappNumber: '',
    cryptoWalletEnabled: false,
    cryptoWalletAsset: 'USDT',
    cryptoWalletNetwork: 'TRC20',
    cryptoWalletAddress: '',
    cryptoWalletMemo: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      paymentWhatsappNumber: config?.paymentWhatsappNumber || '',
      cryptoWalletEnabled: Boolean(config?.cryptoWalletEnabled),
      cryptoWalletAsset: config?.cryptoWalletAsset || 'USDT',
      cryptoWalletNetwork: config?.cryptoWalletNetwork || 'TRC20',
      cryptoWalletAddress: config?.cryptoWalletAddress || '',
      cryptoWalletMemo: config?.cryptoWalletMemo || '',
    });
  }, [config]);

  const setField = (key, value) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await adminRequest('/api/admin/config', token, { method: 'POST', body: form });
      setSaved(true);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(320px, 1.1fr)', gap: 18 }}>
      <Card pad={20}>
        <Caption>Ödeme bildirimi</Caption>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>WhatsApp yönlendirme</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 6 }}>
          IBAN ve manuel kripto ödemelerinde müşteriye ödeme bilgileri gösterilir; bildirim butonu bu numaraya hazır mesaj açar.
        </div>
        <div style={{ marginTop: 14 }}>
          <Caption style={{ marginBottom: 6 }}>WhatsApp numarası</Caption>
          <input
            value={form.paymentWhatsappNumber}
            onChange={(e) => setField('paymentWhatsappNumber', e.target.value)}
            placeholder="905000000000"
            style={inputStyle}
          />
        </div>
      </Card>

      <Card pad={20}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <Caption>Manuel kripto cüzdanı</Caption>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>USDT adresi</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 6 }}>
              Cryptomus kapalıysa bu alan aktif olduğunda kullanıcıya cüzdan, ağ, referans ve WhatsApp bildirimi gösterilir. Bakiye otomatik eklenmez.
            </div>
          </div>
          <button onClick={() => setField('cryptoWalletEnabled', !form.cryptoWalletEnabled)} style={{
            width: 48, height: 26, borderRadius: 999,
            background: form.cryptoWalletEnabled ? 'var(--accent)' : 'var(--ink-5)',
            position: 'relative',
          }}>
            <span style={{ position: 'absolute', top: 3, left: form.cryptoWalletEnabled ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, marginTop: 14 }}>
          <input value={form.cryptoWalletAsset} onChange={(e) => setField('cryptoWalletAsset', e.target.value)} placeholder="USDT" style={inputStyle} />
          <input value={form.cryptoWalletNetwork} onChange={(e) => setField('cryptoWalletNetwork', e.target.value)} placeholder="TRC20" style={inputStyle} />
        </div>
        <div style={{ marginTop: 10 }}>
          <input value={form.cryptoWalletAddress} onChange={(e) => setField('cryptoWalletAddress', e.target.value)} placeholder="Cüzdan adresi" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
        </div>
        <div style={{ marginTop: 10 }}>
          <input value={form.cryptoWalletMemo} onChange={(e) => setField('cryptoWalletMemo', e.target.value)} placeholder="Memo / tag / ek not (opsiyonel)" style={inputStyle} />
        </div>
        <button onClick={save} disabled={saving} style={{ marginTop: 14, width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--ink)', color: '#fff', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Kaydediliyor…' : 'Ödeme ayarlarını kaydet'}
        </button>
        {saved && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: '#047857', background: 'var(--ok-bg)', border: '1px solid #a7f3d0', borderRadius: 9, padding: '8px 10px' }}>
            Ödeme ayarları kaydedildi.
          </div>
        )}
      </Card>
    </div>
  );
};

const AdminApiKeys = ({ apiKeys, users, token, refresh, filterUserId = '', filterApiKeyId = '', filterNonce = '' }) => {
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('admin-created-key');
  const [createdKey, setCreatedKey] = useState('');

  useEffect(() => {
    if (filterUserId) setUserId(filterUserId);
  }, [filterUserId, filterNonce]);

  const filteredKeys = useMemo(() => {
    return apiKeys.filter((key) => {
      if (filterUserId && key.userId !== filterUserId) return false;
      if (filterApiKeyId && key.id !== filterApiKeyId) return false;
      return true;
    });
  }, [apiKeys, filterApiKeyId, filterUserId]);

  const selectedUser = users.find((user) => user.id === (filterUserId || userId));

  const create = async () => {
    if (!userId) return;
    const result = await adminRequest(`/api/admin/api-keys/${userId}/create`, token, { method: 'POST', body: { ad: name } });
    setCreatedKey(result.key || '');
    await refresh();
  };

  const revoke = async (key) => {
    if (!window.confirm('API anahtarı iptal edilsin mi?')) return;
    await adminRequest(`/api/admin/api-keys/revoke/${key.id}`, token, { method: 'POST' });
    await refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card pad={18}>
        <Caption>Admin API key yönetimi</Caption>
        {(filterUserId || filterApiKeyId) && (
          <div style={{ marginTop: 10, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Chip tone="neutral" style={{ fontSize: 10.5 }}>
              Filtre: {selectedUser?.email || filterUserId}
              {filterApiKeyId ? ` · key ${filterApiKeyId.slice(0, 8)}` : ''}
            </Chip>
          </div>
        )}
        <div style={grid(200)}>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} style={inputStyle}>
            <option value="">Kullanıcı seç</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Anahtar adı" style={inputStyle} />
          <button onClick={create} style={{ borderRadius: 9, background: 'var(--ink)', color: '#fff', fontWeight: 600 }}>Oluştur</button>
        </div>
        {createdKey && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--accent-bg)', color: 'var(--accent-ink)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            Yeni anahtar: {createdKey}
          </div>
        )}
      </Card>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {filteredKeys.length === 0 ? <div style={{ padding: 16 }}><EmptyState>API anahtarı yok.</EmptyState></div> : filteredKeys.map((k, i) => (
          <div key={k.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr) 110px 90px 90px', gap: 12, padding: '12px 16px', borderBottom: i < filteredKeys.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', fontSize: 12, minWidth: 780 }}>
            <span style={{ fontWeight: 600 }}>{k.ad}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{k.fullKey || 'Eski key raw saklanmadi.'}</span>
            <Chip tone={k.kind === 'sandbox' ? 'ok' : 'neutral'}>{k.kind || 'live'}</Chip>
            <Chip tone={k.aktif ? 'ok' : 'neutral'}>{k.aktif ? 'aktif' : 'pasif'}</Chip>
            <button onClick={() => revoke(k)} disabled={!k.aktif} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid #fecaca', color: '#b91c1c', fontSize: 11, opacity: k.aktif ? 1 : 0.5 }}>Revoke</button>
          </div>
        ))}
      </Card>
    </div>
  );
};

const AdminLogs = ({ reconciliation, auditLogs, token }) => {
  const download = async () => {
    const blob = await adminDownload('/api/admin/reconciliation/export', token);
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `reconciliation-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card pad={20}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <Caption>Reconciliation</Caption>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{reconciliation?.status || 'bilinmiyor'}</div>
          </div>
          <button onClick={download} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12 }}>CSV indir</button>
        </div>
        <div style={grid(170)}>
          <AdminKPI label="Kullanıcı" value={reconciliation?.totals?.users || 0} Ico={I.Users} />
          <AdminKPI label="Cari bakiye" value={reconciliation?.totals?.currentBalanceTL || 0} decimals={2} Ico={I.Wallet} />
          <AdminKPI label="Ledger bakiye" value={reconciliation?.totals?.ledgerBalanceTL || 0} decimals={2} Ico={I.Database} />
          <AdminKPI label="Fark" value={reconciliation?.totals?.driftTL || 0} decimals={2} Ico={I.Activity} />
        </div>
      </Card>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Audit logları</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Son 50 admin işlemi</div>
        </div>
        {auditLogs.length === 0 ? <div style={{ padding: 16 }}><EmptyState>Audit log yok.</EmptyState></div> : auditLogs.map((l, i) => (
          <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '150px minmax(160px, 1fr) minmax(200px, 2fr) 150px', gap: 12, padding: '12px 16px', borderBottom: i < auditLogs.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', fontSize: 12, minWidth: 780 }}>
            <Chip tone="neutral" style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, justifySelf: 'start' }}>{l.action}</Chip>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 11 }}>{l.hedef}</span>
            <span>{l.ozet}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 11 }}>{safeDate(l.timestamp)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
};

const AdminTelegram = ({ token }) => {
  const [accounts, setAccounts] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [accountRows, deliveryRows, conflictRows] = await Promise.all([
        adminRequest('/api/telegram/admin/accounts', token),
        adminRequest('/api/telegram/admin/deliveries', token),
        adminRequest('/api/telegram/admin/conflicts', token),
      ]);
      setAccounts(Array.isArray(accountRows) ? accountRows : []);
      setDeliveries(Array.isArray(deliveryRows) ? deliveryRows : []);
      setConflicts(Array.isArray(conflictRows) ? conflictRows : []);
    } catch (loadError) {
      setError(loadError.message || 'Telegram admin verisi alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const runReconcile = async () => {
    setBusyKey('reconcile');
    setMessage('');
    try {
      const result = await adminRequest('/api/telegram/admin/reconcile', token, { method: 'POST' });
      setMessage(`Tarandı: ${result.scanned || 0} · birleşti: ${result.merged || 0} · bekleyen: ${result.skipped || 0}`);
      await load();
    } catch (actionError) {
      setError(actionError.message || 'Telegram backfill çalıştırılamadı.');
    } finally {
      setBusyKey('');
    }
  };

  const relinkConflict = async (row) => {
    if (!row?.telegramAccountId || !row?.targetUserId) return;
    setBusyKey(row.telegramAccountId);
    setMessage('');
    try {
      await adminRequest('/api/telegram/admin/relink', token, {
        method: 'POST',
        body: { telegramAccountId: row.telegramAccountId, targetUserId: row.targetUserId },
      });
      setMessage(`Telegram ${row.telegramId} -> ${row.targetUserEmail || row.targetUserId} bağlandı.`);
      await load();
    } catch (actionError) {
      setError(actionError.message || 'Telegram identity taşınamadı.');
    } finally {
      setBusyKey('');
    }
  };

  const linkedCount = accounts.filter((row) => row.status === 'linked').length;
  const unlinkedCount = accounts.filter((row) => row.status !== 'linked').length;
  const failedDeliveries = deliveries.filter((row) => row.status === 'failed').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={grid(180)}>
        <AdminKPI label="Linked" value={linkedCount} Ico={I.Check} />
        <AdminKPI label="Unlinked" value={unlinkedCount} Ico={I.Users} />
        <AdminKPI label="Conflict" value={conflicts.length} Ico={I.Activity} />
        <AdminKPI label="Delivery fail" value={failedDeliveries} Ico={I.Bell} />
      </div>

      <Card pad={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <Caption>Telegram eşleme</Caption>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>
              Güvenli ghost hesaplar otomatik toparlanır. Manuel çatışmalar bu listede kalır.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => load()} style={{ padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12 }}>Yenile</button>
            <button onClick={runReconcile} disabled={busyKey === 'reconcile'} style={{ padding: '8px 11px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontSize: 12, opacity: busyKey === 'reconcile' ? 0.7 : 1 }}>
              {busyKey === 'reconcile' ? 'Çalışıyor…' : 'Otomatik düzelt'}
            </button>
          </div>
        </div>
        {message && <div style={{ marginTop: 12, fontSize: 11.5, color: '#047857' }}>{message}</div>}
        {error && <div style={{ marginTop: 12 }}><ErrorBox>{error}</ErrorBox></div>}
      </Card>

      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Çatışmalar</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Hedef kullanıcı bilinen ve güvenli olanlar doğrudan bağlanabilir.</div>
        </div>
        {loading ? <div style={{ padding: 16, fontSize: 12, color: 'var(--ink-3)' }}>Telegram verisi yükleniyor…</div> : null}
        {!loading && conflicts.length === 0 ? <div style={{ padding: 16 }}><EmptyState>Çatışma görünmüyor.</EmptyState></div> : null}
        {!loading && conflicts.map((row, index) => (
          <div key={`${row.telegramAccountId}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(180px, 1.3fr) minmax(180px, 1.3fr) 140px 120px', gap: 12, padding: '12px 16px', borderBottom: index < conflicts.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', fontSize: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.telegramId}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{row.username ? `@${row.username}` : row.status}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Mevcut</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{row.currentUserEmail || row.currentUserId || '—'}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Hedef</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{row.targetUserEmail || row.targetUserId || '—'}</div>
            </div>
            <Chip tone={row.canAutoMerge ? 'ok' : 'neutral'} style={{ fontSize: 10 }}>{row.reason}</Chip>
            <button
              onClick={() => relinkConflict(row)}
              disabled={!row.canAutoMerge || !row.targetUserId || busyKey === row.telegramAccountId}
              style={{
                padding: '7px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 11,
                opacity: row.canAutoMerge && row.targetUserId ? 1 : 0.5,
              }}
            >
              {busyKey === row.telegramAccountId ? 'Bağlanıyor…' : 'Bağla'}
            </button>
          </div>
        ))}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(280px, 1fr)', gap: 14 }}>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Telegram kimlikleri</div>
          </div>
          {accounts.slice(0, 12).map((row, index) => (
            <div key={row.id || `${row.telegramId}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(180px, 1.4fr) 110px 120px', gap: 12, padding: '12px 16px', borderBottom: index < Math.min(accounts.length, 12) - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', fontSize: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.telegramId}</span>
              <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{row.userEmail || 'bağlı değil'}</span>
              <Chip tone={row.status === 'linked' ? 'ok' : 'neutral'}>{row.status}</Chip>
              <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{safeDate(row.lastSeenAt || row.linkedAt)}</span>
            </div>
          ))}
          {accounts.length === 0 && !loading ? <div style={{ padding: 16 }}><EmptyState>Telegram kimliği yok.</EmptyState></div> : null}
        </Card>

        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Teslimatlar</div>
          </div>
          {deliveries.slice(0, 12).map((row, index) => (
            <div key={row.id || index} style={{ display: 'grid', gridTemplateColumns: '110px 90px minmax(140px, 1fr)', gap: 12, padding: '12px 16px', borderBottom: index < Math.min(deliveries.length, 12) - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', fontSize: 12 }}>
              <Chip tone={row.status === 'delivered' ? 'ok' : row.status === 'failed' ? 'neutral' : 'accent'}>{row.status}</Chip>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{row.deliveryType}</span>
              <span style={{ color: row.status === 'failed' ? '#b91c1c' : 'var(--ink-3)' }}>{row.lastError || safeDate(row.deliveredAt || row.updatedAt)}</span>
            </div>
          ))}
          {deliveries.length === 0 && !loading ? <div style={{ padding: 16 }}><EmptyState>Teslim kaydı yok.</EmptyState></div> : null}
        </Card>
      </div>
    </div>
  );
};

const AdminAnimations = ({ tweaks = {}, setTweak }) => {
  const Row = ({ children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(220px, 1.6fr)', gap: 14, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>{children}</div>
  );
  const Slider = ({ k, min, max, step = 1, unit = '' }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <input type="range" min={min} max={max} step={step} value={tweaks[k] ?? min} onChange={(e) => setTweak?.(k, Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 60, textAlign: 'right' }}>{tweaks[k] ?? min}{unit}</span>
    </div>
  );
  const Toggle = ({ k }) => (
    <button onClick={() => setTweak?.(k, !tweaks[k])} style={{ width: 48, height: 26, borderRadius: 999, justifySelf: 'start', background: tweaks[k] ? 'var(--accent)' : 'var(--ink-5)', position: 'relative' }}>
      <span style={{ position: 'absolute', top: 3, left: tweaks[k] ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card pad={18} style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>Animasyon yönetimi</div>
        <div style={{ fontSize: 11.5, color: 'var(--accent-ink)', marginTop: 4 }}>Bu bölüm veritabanı müşteri kaydı değildir; sadece zip temasındaki görsel davranışları ayarlar.</div>
      </Card>
      <Card pad={22}>
        <Caption style={{ marginBottom: 14 }}>Genel animasyon</Caption>
        <Row><span>Genel hız</span><Slider k="animSpeed" min={0.25} max={3} step={0.25} unit="×" /></Row>
        <Row><span>KPI sayma süresi</span><Slider k="kpiCountMs" min={200} max={3000} step={50} unit="ms" /></Row>
        <Row><span>Sparkle döner</span><Toggle k="sparkleSpin" /></Row>
        <Row><span>Log slide-in</span><Toggle k="logSlideIn" /></Row>
      </Card>
    </div>
  );
};

const loadAdminData = async (token) => {
  const [
    me,
    dashboard,
    users,
    announcements,
    providers,
    kurHistory,
    reconciliation,
    auditLogs,
    config,
    overrides,
    apiKeys,
  ] = await Promise.all([
    adminRequest('/api/admin/me', token),
    adminRequest('/api/admin/dashboard', token),
    adminRequest('/api/admin/users', token),
    adminRequest('/api/admin/announcements', token),
    adminRequest('/api/admin/provider-durumu', token),
    adminRequest('/api/admin/kur-history', token),
    adminRequest('/api/admin/reconciliation', token),
    adminRequest('/api/admin/audit-logs', token),
    adminRequest('/api/admin/config', token),
    adminRequest('/api/admin/model-overrides', token),
    adminRequest('/api/admin/api-keys', token),
  ]);

  return { me, dashboard, users, announcements, providers, kurHistory, reconciliation, auditLogs, config, overrides, apiKeys };
};

const AdminTab = ({ ctx = {} }) => {
  const { tweaks, setTweak } = ctx;
  const [token, setToken] = useState(getAdminToken);
  const [section, setSection] = useState('dashboard');
  const [data, setData] = useState({
    users: [],
    announcements: [],
    providers: [],
    kurHistory: [],
    auditLogs: [],
    overrides: [],
    apiKeys: [],
  });
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState('');
  const [trafficUserJump, setTrafficUserJump] = useState({ userId: '', nonce: '' });
  const [trafficApiKeyJump, setTrafficApiKeyJump] = useState({ userId: '', apiKeyId: '', nonce: '' });

  const refresh = async (nextToken = token) => {
    if (!nextToken) return;
    setLoading(true);
    setError('');
    try {
      const nextData = await loadAdminData(nextToken);
      setData(nextData);
    } catch (e) {
      if (String(e.message || '').includes('401')) {
        setToken('');
      }
      setError(e.message || 'Admin verisi alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) refresh(token);
  }, [token]);

  const logout = async () => {
    try {
      window.localStorage?.removeItem(ACCESS_TOKEN_KEY);
      window.localStorage?.removeItem(LEGACY_ACCESS_TOKEN_KEY);
    } catch {
      // Çıkış için client token temizliği yeterli.
    }
    setToken('');
  };

  const openTrafficUser = (row) => {
    if (!row?.userId) return;
    setTrafficUserJump({ userId: row.userId, nonce: `${Date.now()}` });
    setSection('users');
  };

  const openTrafficApiKeys = (row) => {
    const userId = row?.userId || '';
    const apiKeyId = row?.apiKeyId || '';
    if (!userId && !apiKeyId) return;
    setTrafficApiKeyJump({ userId, apiKeyId, nonce: `${Date.now()}` });
    setSection('apikeys');
  };

  if (!token) {
    return <AdminAccessNotice />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Caption>Admin paneli</Caption>
          <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8, margin: '6px 0 6px' }}>
            Sistem <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>yönetimi</span>
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>
            Gerçek admin API verileri · {data.me?.email || LAUNCH_ADMIN_EMAIL}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Chip tone="accent" style={{ background: 'var(--ink)', color: 'var(--surface)', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
            <I.Shield size={11} stroke="var(--surface)" /> ADMIN
          </Chip>
          <button onClick={() => refresh()} style={{ padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12 }}>Yenile</button>
          <button onClick={logout} style={{ padding: '8px 11px', borderRadius: 9, color: '#b91c1c', border: '1px solid #fecaca', fontSize: 12 }}>Çıkış</button>
        </div>
      </div>

      <SubNav section={section} onSection={setSection} />
      {loading && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Admin verisi yükleniyor…</div>}
      {error && <ErrorBox>{error}</ErrorBox>}

      <div key={section} className="fade-in">
        {section === 'dashboard' && <AdminDashboard dashboard={data.dashboard} config={data.config} providers={data.providers || []} auditLogs={data.auditLogs || []} />}
        {section === 'traffic' && <AdminTrafficAnalytics token={token} onOpenUser={openTrafficUser} onOpenApiKeys={openTrafficApiKeys} />}
        {section === 'users' && <AdminUsers users={data.users || []} token={token} refresh={refresh} focusUserId={trafficUserJump.userId} focusNonce={trafficUserJump.nonce} />}
        {section === 'overrides' && <AdminOverrides overrides={data.overrides || []} token={token} refresh={refresh} />}
        {section === 'announce' && <AdminAnnouncements announcements={data.announcements || []} token={token} refresh={refresh} />}
        {section === 'providers' && <AdminProviders providers={data.providers || []} token={token} refresh={refresh} />}
        {section === 'kur' && <AdminKur config={data.config} kurHistory={data.kurHistory || []} token={token} refresh={refresh} />}
        {section === 'payments' && <AdminPaymentSettings config={data.config} token={token} refresh={refresh} />}
        {section === 'telegram' && <AdminTelegram token={token} />}
        {section === 'apikeys' && <AdminApiKeys apiKeys={data.apiKeys || []} users={data.users || []} token={token} refresh={refresh} filterUserId={trafficApiKeyJump.userId} filterApiKeyId={trafficApiKeyJump.apiKeyId} filterNonce={trafficApiKeyJump.nonce} />}
        {section === 'logs' && <AdminLogs reconciliation={data.reconciliation} auditLogs={data.auditLogs || []} token={token} />}
        {section === 'animations' && <AdminAnimations tweaks={tweaks} setTweak={setTweak} />}
      </div>
    </div>
  );
};

export { AdminTab };
