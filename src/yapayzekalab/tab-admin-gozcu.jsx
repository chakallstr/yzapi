import { useEffect, useState, useCallback } from 'react';
import { Card, Chip, Caption } from './shared.jsx';

// Gözcü (Sentinel) paneli. Salt gösterim: backend tek-doğruluk, frontend YENİDEN HESAP
// YAPMAZ. /gozcu/son'dan persist edilmiş bulguları render eder; "Şimdi Tara" /gozcu/tara
// çağırır, ardından /gozcu/son'u yeniler.

const VERDICT_TONE = {
  SORUN_YOK: { emoji: '🟢', label: 'SORUN YOK', fg: '#047857' },
  DIKKAT: { emoji: '🟡', label: 'DİKKAT', fg: '#a16207' },
  SORUN_VAR: { emoji: '🔴', label: 'SORUN VAR', fg: '#b91c1c' },
};
const SEV_STYLE = {
  green: { bg: 'var(--ok-bg)', fg: '#047857', bd: '#a7f3d0' },
  yellow: { bg: '#fffbeb', fg: '#a16207', bd: '#fde68a' },
  red: { bg: '#fef2f2', fg: '#b91c1c', bd: '#fecaca' },
};
const SEV_EMOJI = { green: '🟢', yellow: '🟡', red: '🔴' };
const DOMAIN_LABEL = { money: 'Para', uptime: 'Uptime', provider: 'Sağlayıcı', security: 'Güvenlik', code: 'Kod' };

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
const apiPost = async (path, token, body) => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(parsed?.error || `İstek başarısız (${res.status})`);
  return parsed;
};

export function AdminGozcu({ token }) {
  const [latest, setLatest] = useState(null);
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await apiGet('/api/admin/gozcu/son', token);
      setLatest(data?.latest ?? null);
      setFindings(Array.isArray(data?.findings) ? data.findings : []);
    } catch (e) {
      setError(e.message || 'Gözcü verisi alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const taraNow = async () => {
    setScanning(true);
    setError('');
    try {
      await apiPost('/api/admin/gozcu/tara', token);
      await load();
    } catch (e) {
      setError(e.message || 'Tarama başlatılamadı.');
    } finally {
      setScanning(false);
    }
  };

  const ack = async (id) => {
    try { await apiPost(`/api/admin/gozcu/findings/${id}/ack`, token); await load(); }
    catch (e) { setError(e.message); }
  };
  const snooze = async (id) => {
    try { await apiPost(`/api/admin/gozcu/findings/${id}/snooze`, token, { hours: 24 }); await load(); }
    catch (e) { setError(e.message); }
  };

  if (error && !findings.length && !latest) {
    return (
      <Card pad={18}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div><SevBadge severity="red" /> <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{error}</span></div>
          <button onClick={load} style={btnPrimary}>Tekrar dene</button>
        </div>
      </Card>
    );
  }
  if (loading) return <Card pad={18}><Caption>Gözcü yükleniyor…</Caption></Card>;

  const v = latest ? (VERDICT_TONE[latest.verdict] || { emoji: '⚪', label: latest.verdict }) : null;
  const domainVerdicts = latest?.domain_verdicts_json || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Verdict + Şimdi Tara */}
      <Card pad={18}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>{v ? v.emoji : '⚪'}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{v ? v.label : 'Henüz tarama yok'}</div>
              <Caption>
                {latest
                  ? `Son tarama: ${new Date(latest.scan_at).toLocaleString('tr-TR')} · 🔴 ${latest.red_count} · 🟡 ${latest.yellow_count}`
                  : 'Bir tarama başlatın'}
              </Caption>
            </div>
          </div>
          <button onClick={taraNow} disabled={scanning} style={{ ...btnPrimary, opacity: scanning ? 0.7 : 1 }}>
            {scanning ? 'Taranıyor…' : 'Şimdi Tara'}
          </button>
        </div>
        {/* Domain verdict çipleri */}
        {Object.keys(domainVerdicts).length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {Object.entries(domainVerdicts).map(([dom, verd]) => {
              const t = VERDICT_TONE[verd] || { emoji: '⚪' };
              return (
                <span key={dom} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999,
                  fontSize: 11.5, fontWeight: 600, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink-2)',
                }}>
                  {t.emoji} {DOMAIN_LABEL[dom] || dom}
                </span>
              );
            })}
          </div>
        )}
      </Card>

      {/* Bulgu yok */}
      {findings.length === 0 && (
        <Card pad={18}><Chip tone="ok">Açık bulgu yok — tüm sistem sağlıklı. 🟢</Chip></Card>
      )}

      {/* Bulgu listesi */}
      {findings.map((f) => (
        <Card key={f.id} pad={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16 }}>{SEV_EMOJI[f.severity] || '⚪'}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{f.check_name}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>· {DOMAIN_LABEL[f.domain] || f.domain}</span>
            <SevBadge severity={f.severity} />
            {f.status && f.status !== 'open' && <Chip tone="muted">{f.status}</Chip>}
            {f.autoheal_attempted && <Chip tone="ok">oto-müdahale ✓</Chip>}
            <div style={{ flex: 1 }} />
            <button onClick={() => ack(f.id)} style={btnGhost}>Onayla</button>
            <button onClick={() => snooze(f.id)} style={btnGhost}>24sa ertele</button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 8 }}>Ölçülen: {String(f.measured)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>Eşik: {f.threshold}</div>

          {/* Katman-2 LLM teşhisi */}
          {f.root_cause && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Caption>Kök-neden</Caption>
                {f.confidence != null && (
                  <span style={{ fontSize: 10, color: Number(f.confidence) < 0.4 ? '#b91c1c' : 'var(--ink-3)' }}>
                    güven {Math.round(Number(f.confidence) * 100)}%{Number(f.confidence) < 0.4 ? ' · doğrulanmamış' : ''}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{f.root_cause}</div>
              {f.suggested_fix && (
                <>
                  <Caption style={{ marginTop: 8 }}>Çözüm önerisi</Caption>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{f.suggested_fix}</div>
                </>
              )}
            </div>
          )}

          {/* Kanıt */}
          {f.evidence_json != null && (
            <pre style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8, maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(f.evidence_json, null, 2).slice(0, 1800)}
            </pre>
          )}
        </Card>
      ))}
    </div>
  );
}

const btnPrimary = {
  padding: '9px 14px', borderRadius: 9, background: 'var(--ink)', color: '#fff',
  fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
};
const btnGhost = {
  padding: '6px 11px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--ink-2)',
  fontSize: 11.5, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer',
};
