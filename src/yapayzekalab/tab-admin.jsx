import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  I, Card, Chip, Caption, PulseDot,
  PROVIDERS, MODELS, modelMeta, fmt, useCountUp,
} from './shared.jsx';
import { AdminTrafficAnalytics } from './tab-admin-traffic.jsx';
import { AdminMaliIzleme } from './tab-admin-mali-izleme.jsx';
import { AdminGozcu } from './tab-admin-gozcu.jsx';

const LAUNCH_ADMIN_EMAIL = 'cix.crazy666@gmail.com';
const ACCESS_TOKEN_KEY = 'yz_access_token';
const LEGACY_ACCESS_TOKEN_KEY = 'userAccessToken';

const ADMIN_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', Ico: I.Activity },
  { id: 'traffic', label: 'Trafik Analitiği', Ico: I.TrendUp },
  { id: 'mali-izleme', label: 'Mali İzleme', Ico: I.Wallet },
  { id: 'gozcu', label: 'Gözcü', Ico: I.Bell },
  { id: 'api', label: 'API Yönetimi', Ico: I.Server },
  { id: 'users', label: 'Kullanıcılar', Ico: I.Users },
  { id: 'overrides', label: 'Modeller', Ico: I.Layers },
  { id: 'packages', label: 'Paketler', Ico: I.Wallet },
  { id: 'codes', label: 'Kodlar', Ico: I.Key },
  { id: 'teslimler', label: 'Teslimler', Ico: I.Wallet },
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
const normalizeDecimalInput = (value) => String(value ?? '').trim().replace(',', '.');
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

const SubNav = ({ section, onSection, sections }) => (
  <div style={{
    display: 'flex', gap: 4, padding: 5,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh-1)',
    overflowX: 'auto', maxWidth: '100%',
  }}>
    {sections.map((s) => {
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

const AdminUsers = ({ users, token, refresh, meRole = '', focusUserId = '', focusNonce = '' }) => {
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
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.adSoyad || u.email}</span>
                    {u.role === 'partner' && (
                      <Chip tone="neutral" style={{ background: 'var(--t-purple-bg)', color: 'var(--t-purple)', fontSize: 9, flexShrink: 0 }}>ORTAK</Chip>
                    )}
                  </div>
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
                {meRole === 'owner' && u.email !== LAUNCH_ADMIN_EMAIL && (
                  <button
                    onClick={async () => {
                      const nextRole = u.role === 'partner' ? 'user' : 'partner';
                      const confirmMsg = nextRole === 'partner'
                        ? `${u.email} ORTAK yapılsın mı? (sınırlı admin paneline erişir)`
                        : `${u.email} ortaklıktan çıkarılsın mı?`;
                      if (!window.confirm(confirmMsg)) return;
                      try {
                        await adminRequest(`/api/admin/users/${u.id}/role`, token, {
                          method: 'POST',
                          body: { role: nextRole },
                        });
                        await refresh();
                      } catch (e) {
                        window.alert(e.message || 'Rol değiştirilemedi');
                      }
                    }}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11.5 }}
                  >
                    {u.role === 'partner' ? 'Ortaklıktan çıkar' : 'Ortak yap'}
                  </button>
                )}
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
  const normalizedInputUsdOverride = normalizeDecimalInput(inputUsdOverride);
  const normalizedOutputUsdOverride = normalizeDecimalInput(outputUsdOverride);
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
    const nextInput = normalizedInputUsdOverride === '' ? null : Number(normalizedInputUsdOverride);
    const nextOutput = normalizedOutputUsdOverride === '' ? null : Number(normalizedOutputUsdOverride);
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
          <input value={inputUsdOverride} onChange={(e) => setInputUsdOverride(e.target.value)} placeholder="input USD/M override" type="text" inputMode="decimal" style={inputStyle} />
          <input value={outputUsdOverride} onChange={(e) => setOutputUsdOverride(e.target.value)} placeholder="output USD/M override" type="text" inputMode="decimal" style={inputStyle} />
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
              {usd(normalizedInputUsdOverride === '' ? selectedModel?.input : Number(normalizedInputUsdOverride || 0))} · {usd(normalizedOutputUsdOverride === '' ? selectedModel?.output : Number(normalizedOutputUsdOverride || 0))}
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

const AdminDeliveryOrders = ({ token }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { const list = await adminRequest('/api/admin/delivery-orders', token); setRows(Array.isArray(list) ? list : []); }
    catch (e) { setError(e.message || 'Siparişler alınamadı.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token]);

  const deliver = async (row) => {
    const payload = window.prompt(`${row.paketAdi || row.packageId} — teslim bilgisi (kimlik/aktivasyon kodu):`, '');
    if (!payload) return;
    try { await adminRequest(`/api/admin/delivery-orders/${row.id}/deliver`, token, { method: 'POST', body: { teslimPayload: payload } }); await load(); }
    catch (e) { setError(e.message || 'Teslim işaretlenemedi.'); }
  };
  const cancel = async (row) => {
    if (!window.confirm(`${row.paketAdi || row.packageId} siparişi iptal edilip ₺${row.amountTL} iade edilsin mi?`)) return;
    try { await adminRequest(`/api/admin/delivery-orders/${row.id}/cancel`, token, { method: 'POST', body: { not: 'admin iptal' } }); await load(); }
    catch (e) { setError(e.message || 'İptal edilemedi.'); }
  };

  return (
    <Card pad={18}>
      <Caption>Hesap-Teslim Siparişleri</Caption>
      {error && <div style={{ color: 'var(--danger, #e5484d)', marginTop: 6 }}>{error}</div>}
      {loading ? <div style={{ marginTop: 12 }}>Yükleniyor…</div> : (
        <table style={{ width: '100%', marginTop: 12, fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left' }}><th>paket</th><th>kullanıcı</th><th>iletişim</th><th>₺</th><th>durum</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.paketAdi || r.packageId}</td><td>{r.userEmail}</td><td>{r.contact}</td><td>{r.amountTL}</td><td>{r.durum}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {r.durum === 'bekliyor' && (
                    <>
                      <button onClick={() => deliver(r)}>Teslim et</button>
                      <button onClick={() => cancel(r)}>İptal+iade</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};

const AdminRedeemCodes = ({ token }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ tip: 'balance', amountTL: '', packageId: '', count: '1', prefix: '', maxUses: '1', expiresAt: '', aciklama: '' });
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState([]);

  const load = async () => {
    setLoading(true); setError('');
    try { const list = await adminRequest('/api/admin/redeem-codes', token); setRows(Array.isArray(list) ? list : []); }
    catch (e) { setError(e.message || 'Kodlar alınamadı.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token]);

  const create = async () => {
    setSaving(true); setError(''); setGenerated([]);
    try {
      const res = await adminRequest('/api/admin/redeem-codes', token, { method: 'POST', body: {
        tip: form.tip,
        amountTL: form.tip === 'balance' ? Number(form.amountTL) : undefined,
        packageId: form.tip === 'package' ? form.packageId.trim() : undefined,
        count: Number(form.count || 1), prefix: form.prefix, maxUses: Number(form.maxUses || 1),
        expiresAt: form.expiresAt || null, aciklama: form.aciklama,
      } });
      setGenerated(res.codes || []);
      await load();
    } catch (e) { setError(e.message || 'Kod üretilemedi.'); }
    finally { setSaving(false); }
  };

  const toggle = async (row) => {
    try { await adminRequest(`/api/admin/redeem-codes/${row.id}/toggle`, token, { method: 'POST', body: { enabled: !row.enabled } }); await load(); }
    catch (e) { setError(e.message || 'Durum değiştirilemedi.'); }
  };

  return (
    <Card pad={18}>
      <Caption>Hediye / Geçiş Kodları</Caption>
      {error && <div style={{ color: 'var(--danger, #e5484d)', marginTop: 6 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, margin: '12px 0' }}>
        <select value={form.tip} onChange={(e) => setForm({ ...form, tip: e.target.value })}>
          <option value="balance">Bakiye (TL)</option>
          <option value="package">Paket</option>
        </select>
        {form.tip === 'balance'
          ? <input placeholder="tutar ₺" value={form.amountTL} onChange={(e) => setForm({ ...form, amountTL: e.target.value })} />
          : <input placeholder="paket id" value={form.packageId} onChange={(e) => setForm({ ...form, packageId: e.target.value })} />}
        <input placeholder="adet" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
        <input placeholder="prefix (ops)" value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} />
        <input placeholder="max kullanım" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
        <input placeholder="bitiş (ISO, ops)" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
      </div>
      <button disabled={saving} onClick={create}>{saving ? 'Üretiliyor…' : 'Kod Üret'}</button>
      {generated.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Caption>Üretilen kodlar</Caption>
          <textarea readOnly rows={Math.min(generated.length, 8)} style={{ width: '100%' }} value={generated.join('\n')} />
        </div>
      )}
      {loading ? <div style={{ marginTop: 12 }}>Yükleniyor…</div> : (
        <table style={{ width: '100%', marginTop: 12, fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left' }}><th>kod</th><th>tip</th><th>değer</th><th>kullanım</th><th>durum</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.code}</td><td>{r.tip}</td>
                <td>{r.tip === 'balance' ? `₺${Number(r.amount_tl)}` : r.package_id}</td>
                <td>{r.used_count}/{r.max_uses}</td>
                <td>{r.enabled ? 'Açık' : 'Kapalı'}</td>
                <td><button onClick={() => toggle(r)}>{r.enabled ? 'Kapat' : 'Aç'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};

const AdminPackages = ({ token }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ id: '', ad: '', kategori: '', aciklama: '', gunlukIstekLimiti: '', sureGun: '', allowedModels: '', fiyatTL: '', displayOrder: '0' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const list = await adminRequest('/api/admin/packages', token);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) { setError(e.message || 'Paketler alınamadı.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token]);

  const create = async () => {
    if (!form.id.trim() || !form.ad.trim() || !form.kategori.trim()) { setError('id, ad, kategori zorunlu'); return; }
    setSaving(true); setError(''); setSaved('');
    try {
      await adminRequest('/api/admin/packages', token, { method: 'POST', body: {
        id: form.id.trim(), ad: form.ad.trim(), kategori: form.kategori.trim(), aciklama: form.aciklama,
        gunlukIstekLimiti: Number(form.gunlukIstekLimiti), sureGun: Number(form.sureGun),
        allowedModels: form.allowedModels.split(',').map((s) => s.trim()).filter(Boolean),
        fiyatTL: Number(form.fiyatTL), displayOrder: Number(form.displayOrder || 0),
      } });
      setForm({ id: '', ad: '', kategori: '', aciklama: '', gunlukIstekLimiti: '', sureGun: '', allowedModels: '', fiyatTL: '', displayOrder: '0' });
      setSaved('Paket eklendi.'); await load();
    } catch (e) { setError(e.message || 'Paket eklenemedi.'); }
    finally { setSaving(false); }
  };

  const toggle = async (row) => {
    try {
      await adminRequest(`/api/admin/packages/${encodeURIComponent(row.id)}/toggle`, token, { method: 'POST', body: { enabled: !row.enabled } });
      await load();
    } catch (e) { setError(e.message || 'Durum değiştirilemedi.'); }
  };

  const remove = async (row) => {
    if (!window.confirm(`${row.id} paketi kapatılsın mı?`)) return;
    try {
      await adminRequest(`/api/admin/packages/${encodeURIComponent(row.id)}`, token, { method: 'DELETE' });
      await load();
    } catch (e) { setError(e.message || 'Paket silinemedi.'); }
  };

  return (
    <Card pad={18}>
      <Caption>Paketler</Caption>
      {error && <div style={{ color: 'var(--danger, #e5484d)', marginTop: 6 }}>{error}</div>}
      {saved && <div style={{ color: 'var(--ok, #30a46c)', marginTop: 6 }}>{saved}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, margin: '12px 0' }}>
        <input placeholder="id (slug)" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
        <input placeholder="ad" value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} />
        <input placeholder="kategori" value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })} />
        <input placeholder="günlük istek" value={form.gunlukIstekLimiti} onChange={(e) => setForm({ ...form, gunlukIstekLimiti: e.target.value })} />
        <input placeholder="süre (gün)" value={form.sureGun} onChange={(e) => setForm({ ...form, sureGun: e.target.value })} />
        <input placeholder="fiyat ₺" value={form.fiyatTL} onChange={(e) => setForm({ ...form, fiyatTL: e.target.value })} />
        <input placeholder="modeller (virgülle)" value={form.allowedModels} onChange={(e) => setForm({ ...form, allowedModels: e.target.value })} />
        <input placeholder="sıra" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} />
      </div>
      <button disabled={saving} onClick={create}>{saving ? 'Ekleniyor…' : 'Paket Ekle'}</button>
      {loading ? <div style={{ marginTop: 12 }}>Yükleniyor…</div> : (
        <table style={{ width: '100%', marginTop: 12, fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left' }}><th>id</th><th>ad</th><th>kategori</th><th>limit/gün</th><th>süre</th><th>₺</th><th>durum</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td><td>{r.ad}</td><td><Chip>{r.kategori}</Chip></td>
                <td>{r.gunlukIstekLimiti}</td><td>{r.sureGun}g</td><td>{Number(r.fiyatTL)}</td>
                <td>{r.enabled ? 'Açık' : 'Kapalı'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => toggle(r)}>{r.enabled ? 'Kapat' : 'Aç'}</button>
                  <button onClick={() => remove(r)}>Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};

const AdminAddedModels = ({ token }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ modelId: '', name: '', providerLabel: '', inputUsd: '', outputUsd: '', type: 'Metin', imagePriceUsd: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await adminRequest('/api/admin/added-models', token);
      setRows(Array.isArray(list) ? list : []);
    } catch (loadError) {
      setError(loadError.message || 'Ek modeller alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const setField = (key, value) => {
    setSaved('');
    setForm((current) => ({ ...current, [key]: value }));
  };

  const create = async () => {
    const modelId = form.modelId.trim();
    const name = form.name.trim();
    const providerLabel = form.providerLabel.trim();
    if (!modelId || !name || !providerLabel) {
      setError('Model id, ad ve sağlayıcı etiketi zorunlu.');
      setSaved('');
      return;
    }
    const isImage = form.type === 'Görsel';
    const inputUsd = Number(normalizeDecimalInput(form.inputUsd || '0'));
    const outputUsd = Number(normalizeDecimalInput(form.outputUsd || '0'));
    const imagePriceUsd = Number(normalizeDecimalInput(form.imagePriceUsd || '0'));
    if (isImage ? !Number.isFinite(imagePriceUsd) : (!Number.isFinite(inputUsd) || !Number.isFinite(outputUsd))) {
      setError('Fiyat alanlarına geçerli sayı gir.');
      setSaved('');
      return;
    }
    setSaving(true);
    setError('');
    setSaved('');
    try {
      await adminRequest('/api/admin/added-models', token, {
        method: 'POST',
        body: { modelId, name, providerLabel, inputUsd, outputUsd, type: form.type, imagePriceUsd },
      });
      setForm({ modelId: '', name: '', providerLabel: '', inputUsd: '', outputUsd: '', type: 'Metin', imagePriceUsd: '' });
      setSaved('Ek model eklendi.');
      await load();
    } catch (createError) {
      // 409 (yinelenen id) ve 400 (master id) hataları aynı kutuda gösterilir.
      setError(createError.message || 'Ek model eklenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`${row.modelId} ek modeli silinsin mi?`)) return;
    setError('');
    setSaved('');
    try {
      await adminRequest(`/api/admin/added-models/${encodeURIComponent(row.modelId)}`, token, { method: 'DELETE' });
      await load();
    } catch (deleteError) {
      setError(deleteError.message || 'Ek model silinemedi.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card pad={18}>
        <Caption>Ek modeller</Caption>
        <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 4, marginBottom: 12 }}>
          Master kataloğa dokunmadan eklenen modeller. Yinelenen veya master id reddedilir.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
          <input value={form.modelId} onChange={(e) => setField('modelId', e.target.value)} placeholder="model id" style={{ ...inputStyle, fontFamily: 'var(--font-mono)', flex: '1 1 160px' }} />
          <input value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="ad" style={{ ...inputStyle, flex: '1 1 140px' }} />
          <input value={form.providerLabel} onChange={(e) => setField('providerLabel', e.target.value)} placeholder="sağlayıcı" style={{ ...inputStyle, flex: '1 1 120px' }} />
          <select value={form.type} onChange={(e) => setField('type', e.target.value)} style={{ ...inputStyle, flex: '0 0 110px' }}>
            <option value="Metin">Metin</option>
            <option value="Görsel">Görsel</option>
          </select>
          {form.type === 'Görsel' ? (
            <input value={form.imagePriceUsd} onChange={(e) => setField('imagePriceUsd', e.target.value)} placeholder="görsel $/adet" type="text" inputMode="decimal" style={{ ...inputStyle, flex: '0 0 120px' }} />
          ) : (
            <>
              <input value={form.inputUsd} onChange={(e) => setField('inputUsd', e.target.value)} placeholder="input $/M" type="text" inputMode="decimal" style={{ ...inputStyle, flex: '0 0 110px' }} />
              <input value={form.outputUsd} onChange={(e) => setField('outputUsd', e.target.value)} placeholder="output $/M" type="text" inputMode="decimal" style={{ ...inputStyle, flex: '0 0 110px' }} />
            </>
          )}
          <button onClick={create} disabled={saving} style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>{saving ? 'Ekleniyor…' : 'Ekle'}</button>
        </div>
        {saved && <div style={{ marginTop: 10 }}><Chip tone="ok">{saved}</Chip></div>}
        {error && <div style={{ marginTop: 10 }}><ErrorBox>{error}</ErrorBox></div>}
      </Card>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 16, fontSize: 12, color: 'var(--ink-3)' }}>Ek modeller yükleniyor…</div> : null}
        {!loading && rows.length === 0 ? <div style={{ padding: 16 }}><EmptyState>Ek model yok.</EmptyState></div> : null}
        {!loading && rows.map((row, i) => (
          <div key={row.modelId} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) minmax(140px, 1fr) 110px 110px 80px 100px', gap: 12, padding: '13px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', fontSize: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{row.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{row.modelId}</div>
            </div>
            <span>{row.providerLabel}</span>
            <span className="tnum">{usd(row.inputUsd)}</span>
            <span className="tnum">{usd(row.outputUsd)}</span>
            <Chip tone={row.enabled ? 'ok' : 'neutral'}>{row.enabled ? 'aktif' : 'pasif'}</Chip>
            <button onClick={() => remove(row)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', fontSize: 11 }}>Sil</button>
          </div>
        ))}
      </Card>
    </div>
  );
};

const API_SUB_SECTIONS = [
  { id: 'general', label: 'Genel API' },
  { id: 'limits', label: 'Limitler' },
  { id: 'models', label: 'Model Politikaları' },
  { id: 'keys', label: 'API Key Politikaları' },
  { id: 'providers', label: 'Provider Yönlendirme' },
  { id: 'security', label: 'Davranış ve Güvenlik' },
];

const AdminApiSettings = ({ token, apiKeys = [] }) => {
  const [subSection, setSubSection] = useState('general');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [saved, setSaved] = useState('');
  const [apiSettings, setApiSettings] = useState(null);
  const [providerSnapshot, setProviderSnapshot] = useState({ activeProviderId: '', providers: [] });
  const [modelPolicies, setModelPolicies] = useState([]);
  const [configForm, setConfigForm] = useState({});
  const [selectedModelId, setSelectedModelId] = useState('');
  const [modelForm, setModelForm] = useState({});
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [keyPolicySnapshot, setKeyPolicySnapshot] = useState(null);
  const [keyForm, setKeyForm] = useState({});
  const [providerForm, setProviderForm] = useState({ providerBaseUrl: '', providerApiKey: '' });
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerSaved, setProviderSaved] = useState('');
  const [providerError, setProviderError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState('');

  // ── Aktif sağlayıcı (provider_profiles): profiller arası geçiş ──────────
  const [profiles, setProfiles] = useState([]);
  const [profilesError, setProfilesError] = useState('');
  const [profileDrafts, setProfileDrafts] = useState({}); // id -> { baseUrl, apiKey, supportedModelIds }
  const [activatingId, setActivatingId] = useState('');
  const [savingProfileId, setSavingProfileId] = useState('');
  const [testingProfileId, setTestingProfileId] = useState('');
  const [profileTestResult, setProfileTestResult] = useState({}); // id -> result
  const [profileNotice, setProfileNotice] = useState('');

  const selectedModel = useMemo(
    () => modelPolicies.find((row) => row.modelId === selectedModelId) || modelPolicies[0] || null,
    [modelPolicies, selectedModelId],
  );
  const selectedKey = useMemo(
    () => apiKeys.find((row) => row.id === selectedKeyId) || apiKeys[0] || null,
    [apiKeys, selectedKeyId],
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [settings, providers, models] = await Promise.all([
        adminRequest('/api/admin/api-settings', token),
        adminRequest('/api/admin/api-settings/providers', token),
        adminRequest('/api/admin/api-settings/models', token),
      ]);
      setApiSettings(settings);
      setProviderSnapshot(providers);
      setModelPolicies(models);
      setConfigForm({
        ...settings.general,
        ...settings.limits,
        ...settings.behavior,
      });
      setProviderForm({
        providerBaseUrl: settings.provider?.providerBaseUrl || '',
        providerApiKey: '',
      });
      setTestResult(null);
      setTestError('');
      await loadProfiles();
      if (!selectedModelId && models[0]?.modelId) setSelectedModelId(models[0].modelId);
      if (!selectedKeyId && apiKeys[0]?.id) setSelectedKeyId(apiKeys[0].id);
    } catch (loadError) {
      setError(loadError.message || 'API yönetimi verisi alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [token, selectedModelId, selectedKeyId, apiKeys.length]);

  useEffect(() => {
    if (!selectedModel) return;
    setModelForm({
      pricingEnabled: selectedModel.pricingEnabled !== false,
      runtimeEnabled: selectedModel.runtimeEnabled !== false,
      inputUsdOverride: selectedModel.inputUsdOverride ?? '',
      outputUsdOverride: selectedModel.outputUsdOverride ?? '',
      contextOverrideTokens: selectedModel.contextOverrideTokens ?? '',
      maxOutputTokens: selectedModel.runtimeMaxOutputTokens ?? '',
      allowStreaming: selectedModel.allowStreaming ?? selectedModel.supportsStreaming,
    });
  }, [selectedModel]);

  useEffect(() => {
    if (!selectedKeyId) return;
    adminRequest(`/api/admin/api-settings/api-keys/${selectedKeyId}/policy`, token)
      .then((snapshot) => {
        setKeyPolicySnapshot(snapshot);
        setKeyForm({
          perKeyPerMinute: snapshot.policy?.perKeyPerMinute ?? configForm.defaultPerKeyPerMinute ?? '',
          maxContextTokens: snapshot.policy?.maxContextTokens ?? configForm.defaultContextLimitTokens ?? '',
          maxOutputTokens: snapshot.policy?.maxOutputTokens ?? configForm.defaultMaxTokensPerRequest ?? '',
          allowedModels: Array.isArray(snapshot.policy?.allowedModels) ? snapshot.policy.allowedModels.join(', ') : '',
          dailySpendLimitTL: snapshot.policy?.dailySpendLimitTL ?? '',
          monthlySpendLimitTL: snapshot.policy?.monthlySpendLimitTL ?? '',
          allowStreaming: snapshot.policy?.allowStreaming ?? true,
        });
      })
      .catch((keyError) => {
        setError(keyError.message || 'API key politikası alınamadı.');
      });
  }, [selectedKeyId, token, configForm.defaultPerKeyPerMinute, configForm.defaultContextLimitTokens, configForm.defaultMaxTokensPerRequest]);

  const setConfigField = (key, value) => {
    setSaved('');
    setConfigForm((current) => ({ ...current, [key]: value }));
  };

  const saveConfig = async () => {
    setSaving('config');
    setSaved('');
    setError('');
    try {
      await adminRequest('/api/admin/api-settings', token, { method: 'POST', body: configForm });
      await load();
      setSaved('API ayarları kaydedildi.');
    } catch (saveError) {
      setError(saveError.message || 'API ayarları kaydedilemedi.');
    } finally {
      setSaving('');
    }
  };

  const saveModel = async () => {
    if (!selectedModelId) return;
    setSaving('model');
    setSaved('');
    setError('');
    try {
      await adminRequest(`/api/admin/api-settings/models/${encodeURIComponent(selectedModelId)}`, token, {
        method: 'POST',
        body: {
          pricingEnabled: Boolean(modelForm.pricingEnabled),
          runtimeEnabled: Boolean(modelForm.runtimeEnabled),
          inputUsdOverride: modelForm.inputUsdOverride === '' ? null : Number(normalizeDecimalInput(modelForm.inputUsdOverride)),
          outputUsdOverride: modelForm.outputUsdOverride === '' ? null : Number(normalizeDecimalInput(modelForm.outputUsdOverride)),
          contextOverrideTokens: modelForm.contextOverrideTokens === '' ? null : Number(modelForm.contextOverrideTokens),
          maxOutputTokens: modelForm.maxOutputTokens === '' ? null : Number(modelForm.maxOutputTokens),
          allowStreaming: Boolean(modelForm.allowStreaming),
        },
      });
      await load();
      setSaved('Model politikası kaydedildi.');
    } catch (saveError) {
      setError(saveError.message || 'Model politikası kaydedilemedi.');
    } finally {
      setSaving('');
    }
  };

  const saveKeyPolicy = async () => {
    if (!selectedKeyId) return;
    setSaving('key');
    setSaved('');
    setError('');
    try {
      await adminRequest(`/api/admin/api-settings/api-keys/${selectedKeyId}/policy`, token, {
        method: 'POST',
        body: {
          perKeyPerMinute: keyForm.perKeyPerMinute === '' ? null : Number(keyForm.perKeyPerMinute),
          maxContextTokens: keyForm.maxContextTokens === '' ? null : Number(keyForm.maxContextTokens),
          maxOutputTokens: keyForm.maxOutputTokens === '' ? null : Number(keyForm.maxOutputTokens),
          allowedModels: String(keyForm.allowedModels || '').split(',').map((entry) => entry.trim()).filter(Boolean),
          dailySpendLimitTL: keyForm.dailySpendLimitTL === '' ? null : Number(normalizeDecimalInput(keyForm.dailySpendLimitTL)),
          monthlySpendLimitTL: keyForm.monthlySpendLimitTL === '' ? null : Number(normalizeDecimalInput(keyForm.monthlySpendLimitTL)),
          allowStreaming: Boolean(keyForm.allowStreaming),
        },
      });
      setSaved('API key politikası kaydedildi.');
      setKeyPolicySnapshot(await adminRequest(`/api/admin/api-settings/api-keys/${selectedKeyId}/policy`, token));
    } catch (saveError) {
      setError(saveError.message || 'API key politikası kaydedilemedi.');
    } finally {
      setSaving('');
    }
  };

  const saveProvider = async () => {
    setProviderSaving(true);
    setProviderSaved('');
    setProviderError('');
    try {
      const trimmedKey = String(providerForm.providerApiKey || '').trim();
      const body = { providerBaseUrl: String(providerForm.providerBaseUrl || '').trim() };
      // Boş key alanı = mevcut anahtar korunur (providerApiKey gönderilmez).
      if (trimmedKey) body.providerApiKey = trimmedKey;
      await adminRequest('/api/admin/api-settings', token, { method: 'POST', body });
      await load();
      setProviderSaved('Sağlayıcı bağlantısı kaydedildi.');
    } catch (saveError) {
      setProviderError(saveError.message || 'Sağlayıcı bağlantısı kaydedilemedi.');
    } finally {
      setProviderSaving(false);
    }
  };

  const testProviderConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError('');
    try {
      const trimmedKey = String(providerForm.providerApiKey || '').trim();
      const baseUrl = String(providerForm.providerBaseUrl || '').trim();
      const body = {};
      // Kaydedilmemiş (pending) değerlerle test; anahtar asla geri gösterilmez.
      if (baseUrl) body.providerBaseUrl = baseUrl;
      if (trimmedKey) body.providerApiKey = trimmedKey;
      const result = await adminRequest('/api/admin/provider/test-connection', token, { method: 'POST', body });
      setTestResult(result);
    } catch (testErr) {
      setTestError(testErr.message || 'Bağlantı testi başarısız.');
    } finally {
      setTesting(false);
    }
  };

  // ── Aktif sağlayıcı (provider_profiles) yönetimi ─────────────────────────────
  const loadProfiles = async () => {
    setProfilesError('');
    try {
      const list = await adminRequest('/api/admin/provider-profiles', token);
      const rows = Array.isArray(list) ? list : [];
      setProfiles(rows);
      // Düzenleme taslaklarını yükle (anahtar asla geri gösterilmez → boş).
      setProfileDrafts((current) => {
        const next = { ...current };
        for (const p of rows) {
          if (!next[p.id]) {
            next[p.id] = {
              baseUrl: p.baseUrl || '',
              apiKey: '',
              supportedModelIds: (p.supportedModelIds || []).join(', '),
            };
          }
        }
        return next;
      });
    } catch (loadErr) {
      setProfilesError(loadErr.message || 'Sağlayıcı profilleri alınamadı.');
    }
  };

  const setProfileDraftField = (id, key, value) => {
    setProfileNotice('');
    setProfileDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  };

  const activateProfile = async (profile) => {
    setActivatingId(profile.id);
    setProfilesError('');
    setProfileNotice('');
    try {
      await adminRequest('/api/admin/provider-profiles/activate', token, {
        method: 'POST',
        body: { id: profile.id },
      });
      await load();
      setProfileNotice(`Aktif sağlayıcı: ${profile.label || profile.id}`);
    } catch (activateErr) {
      setProfilesError(activateErr.message || 'Sağlayıcı aktifleştirilemedi.');
    } finally {
      setActivatingId('');
    }
  };

  const saveProfile = async (profile) => {
    const draft = profileDrafts[profile.id] || {};
    setSavingProfileId(profile.id);
    setProfilesError('');
    setProfileNotice('');
    try {
      const trimmedKey = String(draft.apiKey || '').trim();
      const body = {
        id: profile.id,
        baseUrl: String(draft.baseUrl || '').trim(),
        supportedModelIds: String(draft.supportedModelIds || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      };
      // Boş key alanı = mevcut anahtar korunur (apiKey gönderilmez).
      if (trimmedKey) body.apiKey = trimmedKey;
      await adminRequest('/api/admin/provider-profiles', token, { method: 'POST', body });
      // Kaydedilen anahtarı taslaktan temizle (write-only).
      setProfileDrafts((current) => ({ ...current, [profile.id]: { ...current[profile.id], apiKey: '' } }));
      await load();
      setProfileNotice(`${profile.label || profile.id} kaydedildi.`);
    } catch (saveErr) {
      setProfilesError(saveErr.message || 'Sağlayıcı profili kaydedilemedi.');
    } finally {
      setSavingProfileId('');
    }
  };

  const testProfile = async (profile) => {
    const draft = profileDrafts[profile.id] || {};
    setTestingProfileId(profile.id);
    setProfilesError('');
    setProfileTestResult((current) => ({ ...current, [profile.id]: null }));
    try {
      const trimmedKey = String(draft.apiKey || '').trim();
      const baseUrl = String(draft.baseUrl || '').trim();
      const body = {};
      // Kaydedilmemiş (pending) base/key ile test; anahtar asla geri gösterilmez.
      if (baseUrl) body.providerBaseUrl = baseUrl;
      if (trimmedKey) body.providerApiKey = trimmedKey;
      const result = await adminRequest('/api/admin/provider/test-connection', token, { method: 'POST', body });
      setProfileTestResult((current) => ({ ...current, [profile.id]: result }));
    } catch (testErr) {
      setProfileTestResult((current) => ({
        ...current,
        [profile.id]: { ok: false, upstreamStatus: null, latencyMs: null, errorCategory: testErr.message || 'test başarısız' },
      }));
    } finally {
      setTestingProfileId('');
    }
  };

  const TopCard = ({ label, value, sub }) => (
    <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <Caption>{label}</Caption>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card pad={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <Caption>API yönetimi</Caption>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>
              Hız, context, endpoint, model ve anahtar politikaları tek yerden yönetilir.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => load()} style={{ padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12 }}>Yenile</button>
            <button onClick={saveConfig} disabled={saving === 'config'} style={{ padding: '8px 11px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontSize: 12, opacity: saving === 'config' ? 0.7 : 1 }}>
              {saving === 'config' ? 'Kaydediliyor…' : 'Üst ayarları kaydet'}
            </button>
          </div>
        </div>

        <div style={{ ...grid(180), marginTop: 14 }}>
          <TopCard label="Aktif provider" value={providerSnapshot.activeProviderId || configForm.activeProviderId || '—'} />
          <TopCard label="Context limiti" value={`${fmt.num(Number(configForm.defaultContextLimitTokens || 0))}`} sub="1M varsayılan sınır" />
          <TopCard label="Key / dk" value={fmt.num(Number(configForm.defaultPerKeyPerMinute || 0))} sub="dakika başına anahtar limiti" />
          <TopCard label="Bakım modu" value={configForm.maintenanceModeForApi ? 'Açık' : 'Kapalı'} sub={configForm.maintenanceModeForApi ? (configForm.maintenanceMessage || 'Bakım mesajı var') : 'canlı trafik açık'} />
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {API_SUB_SECTIONS.map((item) => (
          <button
            key={item.id}
            onClick={() => setSubSection(item.id)}
            style={{
              padding: '8px 11px',
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: subSection === item.id ? 'var(--ink)' : 'var(--surface)',
              color: subSection === item.id ? '#fff' : 'var(--ink-2)',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>API yönetimi verisi yükleniyor…</div>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {saved && (
        <div style={{ padding: 10, borderRadius: 10, background: 'var(--ok-bg)', border: '1px solid #a7f3d0', color: '#047857', fontSize: 12 }}>
          {saved}
        </div>
      )}

      {subSection === 'general' && (
        <Card pad={18}>
          <div style={grid(220)}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Caption>Aktif provider</Caption>
              <select value={configForm.activeProviderId || ''} onChange={(e) => setConfigField('activeProviderId', e.target.value)} style={inputStyle}>
                {(providerSnapshot.providers || []).map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Caption>Request timeout (ms)</Caption>
              <input value={configForm.defaultRequestTimeoutMs ?? ''} onChange={(e) => setConfigField('defaultRequestTimeoutMs', e.target.value)} type="number" style={inputStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Caption>Stream timeout (ms)</Caption>
              <input value={configForm.defaultStreamTimeoutMs ?? ''} onChange={(e) => setConfigField('defaultStreamTimeoutMs', e.target.value)} type="number" style={inputStyle} />
            </label>
          </div>
          <div style={{ ...grid(220), marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(configForm.allowChatEndpoint)} onChange={(e) => setConfigField('allowChatEndpoint', e.target.checked)} />Chat endpoint açık</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(configForm.allowResponsesEndpoint)} onChange={(e) => setConfigField('allowResponsesEndpoint', e.target.checked)} />Responses endpoint açık</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(configForm.allowMessagesEndpoint)} onChange={(e) => setConfigField('allowMessagesEndpoint', e.target.checked)} />Messages endpoint açık</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(configForm.allowStreaming)} onChange={(e) => setConfigField('allowStreaming', e.target.checked)} />Streaming açık</label>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><input type="checkbox" checked={Boolean(configForm.maintenanceModeForApi)} onChange={(e) => setConfigField('maintenanceModeForApi', e.target.checked)} />Bakım modu</label>
            <textarea value={configForm.maintenanceMessage || ''} onChange={(e) => setConfigField('maintenanceMessage', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 76 }} />
          </div>
        </Card>
      )}

      {subSection === 'limits' && (
        <Card pad={18}>
          <div style={grid(220)}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Caption>Context limiti</Caption><input value={configForm.defaultContextLimitTokens ?? ''} onChange={(e) => setConfigField('defaultContextLimitTokens', e.target.value)} type="number" style={inputStyle} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Caption>Output reserve</Caption><input value={configForm.defaultOutputReserveTokens ?? ''} onChange={(e) => setConfigField('defaultOutputReserveTokens', e.target.value)} type="number" style={inputStyle} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Caption>Request max token</Caption><input value={configForm.defaultMaxTokensPerRequest ?? ''} onChange={(e) => setConfigField('defaultMaxTokensPerRequest', e.target.value)} type="number" style={inputStyle} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Caption>Key / dk</Caption><input value={configForm.defaultPerKeyPerMinute ?? ''} onChange={(e) => setConfigField('defaultPerKeyPerMinute', e.target.value)} type="number" style={inputStyle} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Caption>User / dk</Caption><input value={configForm.defaultPerUserPerMinute ?? ''} onChange={(e) => setConfigField('defaultPerUserPerMinute', e.target.value)} type="number" style={inputStyle} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Caption>IP / dk</Caption><input value={configForm.defaultPerIpPerMinute ?? ''} onChange={(e) => setConfigField('defaultPerIpPerMinute', e.target.value)} type="number" style={inputStyle} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Caption>Temperature min</Caption><input value={configForm.defaultTemperatureMin ?? ''} onChange={(e) => setConfigField('defaultTemperatureMin', e.target.value)} type="number" step="0.1" style={inputStyle} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Caption>Temperature max</Caption><input value={configForm.defaultTemperatureMax ?? ''} onChange={(e) => setConfigField('defaultTemperatureMax', e.target.value)} type="number" step="0.1" style={inputStyle} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Caption>Top P min</Caption><input value={configForm.defaultTopPMin ?? ''} onChange={(e) => setConfigField('defaultTopPMin', e.target.value)} type="number" step="0.1" style={inputStyle} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Caption>Top P max</Caption><input value={configForm.defaultTopPMax ?? ''} onChange={(e) => setConfigField('defaultTopPMax', e.target.value)} type="number" step="0.1" style={inputStyle} /></label>
          </div>
        </Card>
      )}

      {subSection === 'models' && (
        <Card pad={18}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) repeat(6, minmax(120px, 1fr))', gap: 10, alignItems: 'end' }}>
            <select value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)} style={inputStyle}>
              {modelPolicies.map((row) => <option key={row.modelId} value={row.modelId}>{row.name}</option>)}
            </select>
            <input value={modelForm.inputUsdOverride ?? ''} onChange={(e) => setModelForm((current) => ({ ...current, inputUsdOverride: e.target.value }))} placeholder="input $" type="text" inputMode="decimal" style={inputStyle} />
            <input value={modelForm.outputUsdOverride ?? ''} onChange={(e) => setModelForm((current) => ({ ...current, outputUsdOverride: e.target.value }))} placeholder="output $" type="text" inputMode="decimal" style={inputStyle} />
            <input value={modelForm.contextOverrideTokens ?? ''} onChange={(e) => setModelForm((current) => ({ ...current, contextOverrideTokens: e.target.value }))} placeholder="context" type="number" style={inputStyle} />
            <input value={modelForm.maxOutputTokens ?? ''} onChange={(e) => setModelForm((current) => ({ ...current, maxOutputTokens: e.target.value }))} placeholder="max output" type="number" style={inputStyle} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}><input type="checkbox" checked={Boolean(modelForm.allowStreaming)} onChange={(e) => setModelForm((current) => ({ ...current, allowStreaming: e.target.checked }))} />stream</label>
            <button onClick={saveModel} disabled={saving === 'model'} style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontWeight: 600, opacity: saving === 'model' ? 0.7 : 1 }}>{saving === 'model' ? 'Kaydediliyor…' : 'Modeli kaydet'}</button>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(modelForm.pricingEnabled)} onChange={(e) => setModelForm((current) => ({ ...current, pricingEnabled: e.target.checked }))} />fiyat aktif</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(modelForm.runtimeEnabled)} onChange={(e) => setModelForm((current) => ({ ...current, runtimeEnabled: e.target.checked }))} />runtime aktif</label>
          </div>
          <Card pad={0} style={{ overflow: 'hidden', marginTop: 14 }}>
            {modelPolicies.map((row, index) => (
              <div key={row.modelId} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.5fr) 100px 100px 120px 120px 100px', gap: 10, padding: '10px 14px', borderBottom: index < modelPolicies.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 11.5, alignItems: 'center' }}>
                <div><div style={{ fontWeight: 600 }}>{row.name}</div><div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{row.modelId}</div></div>
                <div>{row.inputUsdOverride === null ? '—' : usd(row.inputUsdOverride)}</div>
                <div>{row.outputUsdOverride === null ? '—' : usd(row.outputUsdOverride)}</div>
                <div className="tnum">{row.contextOverrideTokens || row.contextTokens || '—'}</div>
                <div className="tnum">{row.runtimeMaxOutputTokens || row.maxOutputTokens || '—'}</div>
                <Chip tone={row.effectiveEnabled ? 'ok' : 'neutral'}>{row.effectiveEnabled ? 'aktif' : 'pasif'}</Chip>
              </div>
            ))}
          </Card>
        </Card>
      )}

      {subSection === 'keys' && (
        <Card pad={18}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) repeat(5, minmax(140px, 1fr)) 150px', gap: 10, alignItems: 'end' }}>
            <select value={selectedKeyId} onChange={(e) => setSelectedKeyId(e.target.value)} style={inputStyle}>
              {apiKeys.map((row) => <option key={row.id} value={row.id}>{row.userEmail} · {row.maskedKey}</option>)}
            </select>
            <input value={keyForm.perKeyPerMinute ?? ''} onChange={(e) => setKeyForm((current) => ({ ...current, perKeyPerMinute: e.target.value }))} placeholder="key/dk" type="number" style={inputStyle} />
            <input value={keyForm.maxContextTokens ?? ''} onChange={(e) => setKeyForm((current) => ({ ...current, maxContextTokens: e.target.value }))} placeholder="max context" type="number" style={inputStyle} />
            <input value={keyForm.maxOutputTokens ?? ''} onChange={(e) => setKeyForm((current) => ({ ...current, maxOutputTokens: e.target.value }))} placeholder="max output" type="number" style={inputStyle} />
            <input value={keyForm.dailySpendLimitTL ?? ''} onChange={(e) => setKeyForm((current) => ({ ...current, dailySpendLimitTL: e.target.value }))} placeholder="günlük TL" type="text" inputMode="decimal" style={inputStyle} />
            <input value={keyForm.monthlySpendLimitTL ?? ''} onChange={(e) => setKeyForm((current) => ({ ...current, monthlySpendLimitTL: e.target.value }))} placeholder="aylık TL" type="text" inputMode="decimal" style={inputStyle} />
            <button onClick={saveKeyPolicy} disabled={saving === 'key'} style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontWeight: 600, opacity: saving === 'key' ? 0.7 : 1 }}>{saving === 'key' ? 'Kaydediliyor…' : 'Key politikasını kaydet'}</button>
          </div>
          <div style={{ marginTop: 10 }}>
            <Caption>İzinli modeller</Caption>
            <input value={keyForm.allowedModels ?? ''} onChange={(e) => setKeyForm((current) => ({ ...current, allowedModels: e.target.value }))} placeholder="virgülle model id listesi" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(keyForm.allowStreaming)} onChange={(e) => setKeyForm((current) => ({ ...current, allowStreaming: e.target.checked }))} />stream izinli</label>
            {selectedKey && <Chip tone="neutral" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{selectedKey.maskedKey}</Chip>}
          </div>
          {keyPolicySnapshot?.apiKey && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-3)' }}>
              Kullanıcı: {keyPolicySnapshot.apiKey.userId} · aktif: {keyPolicySnapshot.apiKey.aktif ? 'evet' : 'hayır'}
            </div>
          )}
        </Card>
      )}

      {subSection === 'providers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card pad={18}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <Caption>Aktif sağlayıcı</Caption>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>
                  Tek tıkla aktif sağlayıcıyı değiştir. Değişiklik anında geçerli olur, restart gerekmez.
                </div>
              </div>
              {profileNotice && <Chip tone="ok">{profileNotice}</Chip>}
            </div>
            {profilesError && <div style={{ marginTop: 10 }}><ErrorBox>{profilesError}</ErrorBox></div>}
            {profiles.length === 0 ? (
              <div style={{ marginTop: 14 }}><EmptyState>Sağlayıcı profili yok.</EmptyState></div>
            ) : (
              <div style={{ ...grid(300), marginTop: 14 }}>
                {profiles.map((profile) => {
                  const draft = profileDrafts[profile.id] || { baseUrl: '', apiKey: '', supportedModelIds: '' };
                  const pTest = profileTestResult[profile.id];
                  return (
                    <Card key={profile.id} pad={16} style={profile.isActive ? { border: '1.5px solid var(--ok-bg)', boxShadow: '0 0 0 1px #a7f3d0' } : undefined}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div>
                          <Caption>{profile.id}</Caption>
                          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{profile.label || profile.id}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                            {profile.apiKeyMasked ? `anahtar: ${profile.apiKeyMasked}` : 'anahtar yok'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                          <Chip tone={profile.isActive ? 'ok' : 'neutral'}>{profile.isActive ? 'aktif' : (profile.enabled ? 'pasif' : 'kapalı')}</Chip>
                        </div>
                      </div>

                      <button
                        onClick={() => activateProfile(profile)}
                        disabled={profile.isActive || !profile.enabled || activatingId === profile.id}
                        style={{
                          marginTop: 12,
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: 9,
                          background: profile.isActive ? 'var(--surface-2)' : 'var(--ink)',
                          color: profile.isActive ? 'var(--ink-3)' : '#fff',
                          fontWeight: 600,
                          fontSize: 12,
                          border: profile.isActive ? '1px solid var(--border)' : 'none',
                          opacity: (profile.isActive || !profile.enabled || activatingId === profile.id) ? 0.7 : 1,
                          cursor: profile.isActive ? 'default' : 'pointer',
                        }}
                      >
                        {profile.isActive ? 'Şu an aktif' : (activatingId === profile.id ? 'Aktifleştiriliyor…' : 'Aktifleştir')}
                      </button>

                      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <Caption>Base URL</Caption>
                          <input
                            value={draft.baseUrl}
                            onChange={(e) => setProfileDraftField(profile.id, 'baseUrl', e.target.value)}
                            placeholder="https://upstream.example.com/v1"
                            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                          />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <Caption>API anahtarı (yazılır, gösterilmez)</Caption>
                          <input
                            type="password"
                            autoComplete="new-password"
                            value={draft.apiKey}
                            onChange={(e) => setProfileDraftField(profile.id, 'apiKey', e.target.value)}
                            placeholder={profile.apiKeyMasked || 'sk-… (boş bırakılırsa değişmez)'}
                            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                          />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <Caption>Desteklenen model id (virgülle)</Caption>
                          <textarea
                            value={draft.supportedModelIds}
                            onChange={(e) => setProfileDraftField(profile.id, 'supportedModelIds', e.target.value)}
                            rows={2}
                            placeholder="gpt-5, claude-opus-4.8, gemini-3.5-flash"
                            style={{ ...inputStyle, resize: 'vertical', minHeight: 56, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                          />
                        </label>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                        <button
                          onClick={() => saveProfile(profile)}
                          disabled={savingProfileId === profile.id}
                          style={{ padding: '8px 11px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontWeight: 600, fontSize: 12, opacity: savingProfileId === profile.id ? 0.7 : 1 }}
                        >
                          {savingProfileId === profile.id ? 'Kaydediliyor…' : 'Kaydet'}
                        </button>
                        <button
                          onClick={() => testProfile(profile)}
                          disabled={testingProfileId === profile.id}
                          style={{ padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12, opacity: testingProfileId === profile.id ? 0.7 : 1 }}
                        >
                          {testingProfileId === profile.id ? 'Test ediliyor…' : 'Test'}
                        </button>
                      </div>

                      {pTest && (
                        <div style={{ marginTop: 10, padding: 10, borderRadius: 9, border: '1px solid var(--border)', background: pTest.ok ? 'var(--ok-bg)' : '#fef2f2', color: pTest.ok ? '#047857' : '#b91c1c', fontSize: 11.5 }}>
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600 }}>{pTest.ok ? 'Bağlantı başarılı' : 'Bağlantı başarısız'}</span>
                            <span className="tnum">upstream: {pTest.upstreamStatus ?? '—'}</span>
                            <span className="tnum">gecikme: {pTest.latencyMs ?? '—'}ms</span>
                            {pTest.errorCategory && <span style={{ fontFamily: 'var(--font-mono)' }}>{pTest.errorCategory}</span>}
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>

          <Card pad={18}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <Caption>Sağlayıcı bağlantısı</Caption>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>
                  Upstream base URL ve API anahtarı. Anahtar yalnızca yazılır; panelde maskeli gösterilir.
                </div>
              </div>
              <Chip tone="neutral" style={{ fontSize: 10 }}>
                {apiSettings?.provider?.providerBaseUrlSource === 'db' ? 'DB kaydı' : 'env varsayılanı'}
              </Chip>
            </div>
            <div style={{ ...grid(260), marginTop: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Caption>Base URL</Caption>
                <input
                  value={providerForm.providerBaseUrl}
                  onChange={(e) => { setProviderForm((current) => ({ ...current, providerBaseUrl: e.target.value })); setProviderSaved(''); }}
                  placeholder={apiSettings?.provider?.providerBaseUrlSource === 'env' ? 'env varsayılanı kullanılıyor' : 'https://upstream.example.com/v1'}
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Caption>API anahtarı (yazılır, gösterilmez)</Caption>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={providerForm.providerApiKey}
                  onChange={(e) => { setProviderForm((current) => ({ ...current, providerApiKey: e.target.value })); setProviderSaved(''); }}
                  placeholder={apiSettings?.provider?.providerApiKeyMasked || 'sk-… (boş bırakılırsa değişmez)'}
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                />
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                  {apiSettings?.provider?.providerApiKeyMasked
                    ? `Mevcut: ${apiSettings.provider.providerApiKeyMasked} · son güncelleme ${safeDate(apiSettings.provider.providerApiKeyUpdatedAt)}`
                    : 'Henüz DB anahtarı yok (env varsayılanı geçerli).'}
                  {' '}Boş alan = anahtar değişmez.
                </div>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <button onClick={saveProvider} disabled={providerSaving} style={{ padding: '9px 12px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontWeight: 600, fontSize: 12, opacity: providerSaving ? 0.7 : 1 }}>
                {providerSaving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              <button onClick={testProviderConnection} disabled={testing} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12, opacity: testing ? 0.7 : 1 }}>
                {testing ? 'Test ediliyor…' : 'Bağlantıyı Test Et'}
              </button>
              {providerSaved && <Chip tone="ok">{providerSaved}</Chip>}
            </div>
            {providerError && <div style={{ marginTop: 10 }}><ErrorBox>{providerError}</ErrorBox></div>}
            {testError && <div style={{ marginTop: 10 }}><ErrorBox>{testError}</ErrorBox></div>}
            {testResult && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: testResult.ok ? 'var(--ok-bg)' : '#fef2f2', color: testResult.ok ? '#047857' : '#b91c1c', fontSize: 12 }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{testResult.ok ? 'Bağlantı başarılı' : 'Bağlantı başarısız'}</span>
                  <span className="tnum">upstream: {testResult.upstreamStatus ?? '—'}</span>
                  <span className="tnum">gecikme: {testResult.latencyMs ?? '—'}ms</span>
                  {testResult.errorCategory && <span style={{ fontFamily: 'var(--font-mono)' }}>{testResult.errorCategory}</span>}
                </div>
              </div>
            )}
          </Card>
          <div style={grid(240)}>
            {(providerSnapshot.providers || []).map((provider) => (
              <Card key={provider.id} pad={18}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <Caption>{provider.id}</Caption>
                    <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{provider.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{provider.baseUrlLabel} · {provider.gecikmeMs || 0}ms</div>
                  </div>
                  <Chip tone={provider.active ? 'ok' : 'neutral'}>{provider.active ? 'aktif' : provider.durum}</Chip>
                </div>
                {provider.not ? <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 10 }}>{provider.not}</div> : null}
              </Card>
            ))}
          </div>
        </div>
      )}

      {subSection === 'security' && (
        <Card pad={18}>
          <div style={grid(260)}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(configForm.insufficientBalanceBlockEnabled)} onChange={(e) => setConfigField('insufficientBalanceBlockEnabled', e.target.checked)} />Bakiye yetersizse anında blokla</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(configForm.streamMissingUsageFallbackEnabled)} onChange={(e) => setConfigField('streamMissingUsageFallbackEnabled', e.target.checked)} />Stream usage fallback</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(configForm.upstream402PassThroughEnabled)} onChange={(e) => setConfigField('upstream402PassThroughEnabled', e.target.checked)} />Upstream 402 passthrough</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(configForm.enforceModelAllowlist)} onChange={(e) => setConfigField('enforceModelAllowlist', e.target.checked)} />Model allowlist zorunlu</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(configForm.strictCanonicalModelIds)} onChange={(e) => setConfigField('strictCanonicalModelIds', e.target.checked)} />Strict canonical model kimliği</label>
          </div>
        </Card>
      )}
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

  // ── Yeni üye deneme bonusu ayarları ──────────────────────────────────────────
  const [bonusForm, setBonusForm] = useState({
    signupBonusEnabled: false,
    signupBonusTL: 10,
    signupBonusMaxPerIp: 3,
  });
  const [bonusSaving, setBonusSaving] = useState(false);
  const [bonusSaved, setBonusSaved] = useState(false);

  useEffect(() => {
    setBonusForm({
      signupBonusEnabled: Boolean(config?.signupBonusEnabled),
      signupBonusTL: Number(config?.signupBonusTL ?? 10),
      signupBonusMaxPerIp: Number(config?.signupBonusMaxPerIp ?? 3),
    });
  }, [config]);

  const setBonusField = (key, value) => {
    setBonusSaved(false);
    setBonusForm((current) => ({ ...current, [key]: value }));
  };

  const saveBonus = async () => {
    setBonusSaving(true);
    setBonusSaved(false);
    try {
      await adminRequest('/api/admin/config', token, {
        method: 'POST',
        body: {
          signupBonusEnabled: bonusForm.signupBonusEnabled,
          signupBonusTL: Number(bonusForm.signupBonusTL) || 0,
          signupBonusMaxPerIp: Number(bonusForm.signupBonusMaxPerIp) || 0,
        },
      });
      setBonusSaved(true);
      await refresh();
    } finally {
      setBonusSaving(false);
    }
  };

  // ── Bekleyen havale (IBAN) onay kuyruğu ──────────────────────────────────────
  const [pendingIban, setPendingIban] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState('');
  const [actionId, setActionId] = useState('');
  const [rejectNotes, setRejectNotes] = useState({});

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError('');
    try {
      const rows = await adminRequest('/api/payments/admin/pending-iban', token);
      const list = Array.isArray(rows) ? rows : [];
      setPendingIban(list.filter((r) => r.durum === 'bekliyor'));
    } catch (e) {
      setPendingError(e?.message || 'Bekleyen havaleler alınamadı.');
    } finally {
      setPendingLoading(false);
    }
  }, [token]);

  useEffect(() => { loadPending(); }, [loadPending]);

  const approveIban = async (row) => {
    setActionId(row.id);
    try {
      await adminRequest(`/api/payments/admin/pending-iban/${row.id}/approve`, token, {
        method: 'POST',
        body: { not: rejectNotes[row.id] || undefined },
      });
      await loadPending();
      await refresh();
    } catch (e) {
      setPendingError(e?.message || 'Onaylama başarısız.');
    } finally {
      setActionId('');
    }
  };

  const rejectIban = async (row) => {
    const not = (rejectNotes[row.id] || '').trim();
    if (!not) {
      setPendingError('Red için neden (not) yazın.');
      return;
    }
    setActionId(row.id);
    try {
      await adminRequest(`/api/payments/admin/pending-iban/${row.id}/reject`, token, {
        method: 'POST',
        body: { not },
      });
      await loadPending();
      await refresh();
    } catch (e) {
      setPendingError(e?.message || 'Reddetme başarısız.');
    } finally {
      setActionId('');
    }
  };

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Bekleyen havale onayları</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
              Müşterinin havale/EFT bildirimleri · onaylayınca bakiye otomatik yüklenir
            </div>
          </div>
          <button onClick={loadPending} disabled={pendingLoading} style={{
            padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)',
            background: 'var(--surface-2)', fontSize: 12, fontWeight: 600, opacity: pendingLoading ? 0.6 : 1,
          }}>
            {pendingLoading ? 'Yükleniyor…' : `Yenile${pendingIban.length ? ` (${pendingIban.length})` : ''}`}
          </button>
        </div>

        {pendingError && (
          <div style={{ margin: '12px 20px 0', fontSize: 11.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '8px 10px' }}>
            {pendingError}
          </div>
        )}

        {!pendingLoading && pendingIban.length === 0 && !pendingError && (
          <div style={{ padding: '24px 20px', fontSize: 12.5, color: 'var(--ink-3)', textAlign: 'center' }}>
            Bekleyen havale bildirimi yok.
          </div>
        )}

        {pendingIban.map((row, i) => (
          <div key={row.id} style={{
            padding: '14px 20px',
            borderBottom: i < pendingIban.length - 1 ? '1px solid var(--border)' : 'none',
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {money(row.creditTL ?? row.miktarTL)}
                <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400, marginLeft: 8 }}>
                  tahsilat {money(row.payableTL ?? row.miktarTL)}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                {row.userAdSoyad || '—'} · {row.userEmail || row.userId}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
                {safeDate(row.olusturma)}
              </div>
              <input
                value={rejectNotes[row.id] || ''}
                onChange={(e) => setRejectNotes((cur) => ({ ...cur, [row.id]: e.target.value }))}
                placeholder="Not (red için zorunlu, onayda opsiyonel)"
                style={{ ...inputStyle, marginTop: 6, fontSize: 11.5 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => approveIban(row)}
                disabled={actionId === row.id}
                style={{ padding: '9px 16px', borderRadius: 9, background: '#047857', color: '#fff', fontWeight: 600, fontSize: 12.5, opacity: actionId === row.id ? 0.6 : 1 }}
              >
                {actionId === row.id ? '…' : 'Onayla + yükle'}
              </button>
              <button
                onClick={() => rejectIban(row)}
                disabled={actionId === row.id}
                style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontWeight: 600, fontSize: 12.5, opacity: actionId === row.id ? 0.6 : 1 }}
              >
                Reddet
              </button>
            </div>
          </div>
        ))}
      </Card>

      <Card pad={20}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <Caption>Yeni üye bonusu</Caption>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>Deneme bonusu</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 6 }}>
              Açıkken her yeni üyeye hesap başına TAM bir kez bonus bakiye eklenir. Kötüye kullanım koruması:
              hesap başına 1 kez, e-posta tekilliği ve IP başına azami hesap sınırı uygulanır.
            </div>
          </div>
          <button onClick={() => setBonusField('signupBonusEnabled', !bonusForm.signupBonusEnabled)} style={{
            width: 48, height: 26, borderRadius: 999, flexShrink: 0,
            background: bonusForm.signupBonusEnabled ? 'var(--accent)' : 'var(--ink-5)',
            position: 'relative',
          }}>
            <span style={{ position: 'absolute', top: 3, left: bonusForm.signupBonusEnabled ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <div>
            <Caption style={{ marginBottom: 6 }}>Bonus tutarı (TL)</Caption>
            <input
              type="number" min="0" step="1"
              value={bonusForm.signupBonusTL}
              onChange={(e) => setBonusField('signupBonusTL', e.target.value)}
              placeholder="10"
              style={inputStyle}
            />
          </div>
          <div>
            <Caption style={{ marginBottom: 6 }}>IP başına azami hesap</Caption>
            <input
              type="number" min="0" step="1"
              value={bonusForm.signupBonusMaxPerIp}
              onChange={(e) => setBonusField('signupBonusMaxPerIp', e.target.value)}
              placeholder="3"
              style={inputStyle}
            />
          </div>
        </div>
        <button onClick={saveBonus} disabled={bonusSaving} style={{ marginTop: 14, width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--ink)', color: '#fff', fontWeight: 600, opacity: bonusSaving ? 0.7 : 1 }}>
          {bonusSaving ? 'Kaydediliyor…' : 'Bonus ayarlarını kaydet'}
        </button>
        {bonusSaved && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: '#047857', background: 'var(--ok-bg)', border: '1px solid #a7f3d0', borderRadius: 9, padding: '8px 10px' }}>
            Bonus ayarları kaydedildi.{!bonusForm.signupBonusEnabled ? ' (Şu an kapalı — bonus verilmez.)' : ` Her yeni üyeye ₺${Number(bonusForm.signupBonusTL).toFixed(2)} eklenecek.`}
          </div>
        )}
      </Card>

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
                Cryptomus kapalıysa bu alan aktif olduğunda kullanıcıya cüzdan, ağ ve WhatsApp bildirimi gösterilir. Bakiye otomatik eklenmez.
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

  const allowedTabs = data.me?.allowedTabs || ADMIN_SECTIONS.map((s) => s.id);
  const visibleSections = ADMIN_SECTIONS.filter((s) => allowedTabs.includes(s.id));

  useEffect(() => {
    if (visibleSections.length && !visibleSections.some((s) => s.id === section)) {
      setSection(visibleSections[0].id);
    }
  }, [data.me]); // me geldiğinde owner-only sekmedeyse ilk izinliye düş

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
            <I.Shield size={11} stroke="var(--surface)" /> {data.me?.role === 'partner' ? 'ORTAK' : 'ADMIN'}
          </Chip>
          <button onClick={() => refresh()} style={{ padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12 }}>Yenile</button>
          <button onClick={logout} style={{ padding: '8px 11px', borderRadius: 9, color: '#b91c1c', border: '1px solid #fecaca', fontSize: 12 }}>Çıkış</button>
        </div>
      </div>

      <SubNav section={section} onSection={setSection} sections={visibleSections} />
      {loading && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Admin verisi yükleniyor…</div>}
      {error && <ErrorBox>{error}</ErrorBox>}

      <div key={section} className="fade-in">
        {section === 'dashboard' && <AdminDashboard dashboard={data.dashboard} config={data.config} providers={data.providers || []} auditLogs={data.auditLogs || []} />}
        {section === 'traffic' && <AdminTrafficAnalytics token={token} onOpenUser={openTrafficUser} onOpenApiKeys={openTrafficApiKeys} />}
        {section === 'mali-izleme' && <AdminMaliIzleme token={token} />}
        {section === 'gozcu' && <AdminGozcu token={token} />}
        {section === 'api' && <AdminApiSettings token={token} apiKeys={data.apiKeys || []} />}
        {section === 'users' && <AdminUsers users={data.users || []} token={token} refresh={refresh} meRole={data.me?.role} focusUserId={trafficUserJump.userId} focusNonce={trafficUserJump.nonce} />}
        {section === 'overrides' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <AdminOverrides overrides={data.overrides || []} token={token} refresh={refresh} />
            <AdminAddedModels token={token} />
          </div>
        )}
        {section === 'announce' && <AdminAnnouncements announcements={data.announcements || []} token={token} refresh={refresh} />}
        {section === 'providers' && <AdminProviders providers={data.providers || []} token={token} refresh={refresh} />}
        {section === 'kur' && <AdminKur config={data.config} kurHistory={data.kurHistory || []} token={token} refresh={refresh} />}
        {section === 'payments' && <AdminPaymentSettings config={data.config} token={token} refresh={refresh} />}
        {section === 'packages' && <AdminPackages token={token} />}
        {section === 'codes' && <AdminRedeemCodes token={token} />}
        {section === 'teslimler' && <AdminDeliveryOrders token={token} />}
        {section === 'telegram' && <AdminTelegram token={token} />}
        {section === 'apikeys' && <AdminApiKeys apiKeys={data.apiKeys || []} users={data.users || []} token={token} refresh={refresh} filterUserId={trafficApiKeyJump.userId} filterApiKeyId={trafficApiKeyJump.apiKeyId} filterNonce={trafficApiKeyJump.nonce} />}
        {section === 'logs' && <AdminLogs reconciliation={data.reconciliation} auditLogs={data.auditLogs || []} token={token} />}
        {section === 'animations' && <AdminAnimations tweaks={tweaks} setTweak={setTweak} />}
      </div>
    </div>
  );
};

export { AdminTab };
