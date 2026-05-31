import { useEffect, useState, useCallback } from 'react';
import { Card, Chip, Caption } from './shared.jsx';

// Canlı Mali İzleme paneli (canli-mali-izleme spec, Task 6).
// Salt gösterim: backend tek-doğruluk. Frontend YENİDEN HESAP YAPMAZ, marj/maliyet
// tabanı/upstream gideri GÖMÜLMEZ — yalnız admin API yanıtını render eder (R16 sızıntı yok).

const VERDICT_TONE = {
  SORUN_YOK: { emoji: '🟢', label: 'SORUN YOK', bg: 'var(--ok-bg)', fg: '#047857', bd: '#a7f3d0' },
  DIKKAT: { emoji: '🟡', label: 'DİKKAT', bg: '#fffbeb', fg: '#a16207', bd: '#fde68a' },
  SORUN_VAR: { emoji: '🔴', label: 'SORUN VAR', bg: '#fef2f2', fg: '#b91c1c', bd: '#fecaca' },
};
const SEV_STYLE = {
  green: { bg: 'var(--ok-bg)', fg: '#047857', bd: '#a7f3d0' },
  yellow: { bg: '#fffbeb', fg: '#a16207', bd: '#fde68a' },
  red: { bg: '#fef2f2', fg: '#b91c1c', bd: '#fecaca' },
};
const SEV_EMOJI = { green: '🟢', yellow: '🟡', red: '🔴' };

// Severity rozeti (Chip warn/bad tonlarını desteklemediği için kendi inline rozetimiz;
// mevcut Chip/tema bileşenine DOKUNMAZ — additive).
const SevBadge = ({ severity }) => {
  const s = SEV_STYLE[severity] || { bg: 'rgba(15,23,42,0.04)', fg: 'var(--ink-2)', bd: 'transparent' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 999,
      fontSize: 10.5, fontWeight: 500, background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
    }}>{severity}</span>
  );
};

const apiGet = async (path, token) => {
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error || `İstek başarısız (${res.status})`);
  return body;
};
const apiPost = async (path, token) => {
  const res = await fetch(path, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error || `İstek başarısız (${res.status})`);
  return body;
};

const fmtTL = (n) => `₺${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n) => Number(n || 0).toLocaleString('tr-TR');

export function AdminMaliIzleme({ token }) {
  const [scan, setScan] = useState(null);
  const [akis, setAkis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [son, canli] = await Promise.all([
        apiGet('/api/admin/mali-izleme/son', token),
        apiGet('/api/admin/mali-izleme/canli-akis', token),
      ]);
      setScan(son && son.verdict ? son : null);
      setAkis(canli);
    } catch (e) {
      setError(e.message || 'İzleme verisi alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const taraNow = async () => {
    setScanning(true);
    setError('');
    try {
      const result = await apiPost('/api/admin/mali-izleme/tara', token);
      setScan(result);
      await load();
    } catch (e) {
      setError(e.message || 'Tarama başlatılamadı.');
    } finally {
      setScanning(false);
    }
  };

  // permission/error state
  if (error) {
    return (
      <Card pad={18}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div><SevBadge severity="red" /> <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{error}</span></div>
          <button onClick={load} style={btnPrimary}>Tekrar dene</button>
        </div>
      </Card>
    );
  }

  // loading state
  if (loading) {
    return <Card pad={18}><Caption>Mali izleme yükleniyor…</Caption></Card>;
  }

  const v = scan ? (VERDICT_TONE[scan.verdict] || { emoji: '⚪', label: scan.verdict }) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Verdict + Şimdi Tara */}
      <Card pad={18}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>{v ? v.emoji : '⚪'}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
                {v ? v.label : 'Henüz tarama yok'}
              </div>
              <Caption>{scan ? `Son tarama: ${new Date(scan.scanAt).toLocaleString('tr-TR')}` : 'Bir tarama başlatın'}</Caption>
            </div>
          </div>
          <button onClick={taraNow} disabled={scanning} style={{ ...btnPrimary, opacity: scanning ? 0.7 : 1 }}>
            {scanning ? 'Taranıyor…' : 'Şimdi Tara'}
          </button>
        </div>
      </Card>

      {/* Canlı akış (son 15 dk) */}
      {akis && (
        <Card pad={18}>
          <Caption>Canlı akış · {akis.pencere}</Caption>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 10 }}>
            <Metric label="İstek" value={fmtNum(akis.istek)} />
            <Metric label="Girdi token" value={fmtNum(akis.inputToken)} />
            <Metric label="Çıktı token" value={fmtNum(akis.outputToken)} />
            <Metric label="Gelir" value={fmtTL(akis.gelirTL)} />
          </div>
          <Caption style={{ marginTop: 8 }}>{akis.not}</Caption>
        </Card>
      )}

      {/* empty state: hiç tarama yok */}
      {!scan && (
        <Card pad={18}><Caption>Henüz tarama kaydı yok. "Şimdi Tara" ile ilk taramayı başlatabilirsiniz.</Caption></Card>
      )}

      {/* Kontrol tablosu */}
      {scan && Array.isArray(scan.checks) && (
        <Card pad={18}>
          <Caption>Kontroller ({scan.checks.length})</Caption>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {scan.checks.map((c) => (
              <div key={c.name} style={rowStyle}>
                <span style={{ fontSize: 16 }}>{SEV_EMOJI[c.severity] || '⚪'}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', minWidth: 160 }}>{c.name}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-2)', flex: 1 }}>{String(c.measured)}</span>
                <SevBadge severity={c.severity} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Bulgular (kanıtlı) */}
      {scan && Array.isArray(scan.findings) && scan.findings.length > 0 && (
        <Card pad={18}>
          <Caption>Bulgular ({scan.findings.length})</Caption>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {scan.findings.map((f) => (
              <div key={f.name} style={{ padding: 12, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span>{SEV_EMOJI[f.severity]}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{f.name}</span>
                  <SevBadge severity={f.severity} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Ölçülen: {String(f.measured)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>Eşik: {f.threshold}</div>
                {f.evidence != null && (
                  <pre style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8, maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(f.evidence, null, 2).slice(0, 2000)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {scan && Array.isArray(scan.findings) && scan.findings.length === 0 && (
        <Card pad={18}><Chip tone="ok">Bulgu yok — tüm kontroller sağlıklı.</Chip></Card>
      )}
    </div>
  );
}

const Metric = ({ label, value }) => (
  <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
    <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginTop: 2 }} className="tnum">{value}</div>
  </div>
);

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)',
};
const btnPrimary = {
  padding: '9px 14px', borderRadius: 9, background: 'var(--ink)', color: '#fff',
  fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
};
