import { useCallback, useEffect, useMemo, useState } from 'react';
import { I, Card, Caption, Chip } from './shared.jsx';
import { authFetch } from './auth-client.js';

const fmtInt = (value) => Number(value || 0).toLocaleString('tr-TR');
const fmtTL = (value) => Number(value || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const adminGet = async (path, token) => {
  const response = await authFetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.error || `İstek başarısız (${response.status})`);
  return body;
};

const tableLabels = {
  users: 'Kullanıcılar',
  api_keys: 'API anahtarları',
  payments: 'Ödemeler',
  pending_iban_payments: 'IBAN talepleri',
  transactions: 'Ledger',
  usage_records: 'Kullanım',
  audit_logs: 'Audit',
  sessions: 'Oturumlar',
  kur_history: 'Kur geçmişi',
  model_saglik: 'Model sağlık',
  provider_profiles: 'Sağlayıcı profilleri',
  system_api_config: 'API config',
  model_overrides: 'Model override',
  added_models: 'Ek modeller',
  announcements: 'Duyurular',
  telegram_accounts: 'Telegram',
  whatsapp_verified_numbers: 'WhatsApp',
  user_webhooks: 'Webhook',
};

const Box = ({ label, value, sub, tone = 'neutral' }) => (
  <Card pad={16} style={{ minHeight: 96, borderColor: tone === 'warn' ? '#facc15' : 'var(--border)' }}>
    <Caption>{label}</Caption>
    <div style={{ fontSize: 24, fontWeight: 650, marginTop: 8 }}>{value}</div>
    {sub && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 5 }}>{sub}</div>}
  </Card>
);

const renderValue = (value) => {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export function AdminLiveState({ token }) {
  const [summary, setSummary] = useState(null);
  const [tables, setTables] = useState([]);
  const [selected, setSelected] = useState('users');
  const [rows, setRows] = useState({ rows: [], limit: 25, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedMeta = useMemo(
    () => tables.find((table) => table.table === selected) || tables[0],
    [selected, tables],
  );
  const columns = useMemo(() => selectedMeta?.columns?.slice(0, 10) || [], [selectedMeta]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryBody, tablesBody] = await Promise.all([
        adminGet('/api/admin/live-state/summary', token),
        adminGet('/api/admin/live-state/tables', token),
      ]);
      setSummary(summaryBody);
      setTables(tablesBody);
      if (!tablesBody.some((table) => table.table === selected) && tablesBody[0]) {
        setSelected(tablesBody[0].table);
      }
    } catch (err) {
      setError(err?.message || 'Canlı durum alınamadı');
    } finally {
      setLoading(false);
    }
  }, [selected, token]);

  const loadRows = useCallback(async (table = selected, offset = 0) => {
    if (!table) return;
    setTableLoading(true);
    setError('');
    try {
      const body = await adminGet(`/api/admin/live-state/table/${encodeURIComponent(table)}?limit=25&offset=${offset}`, token);
      setRows(body);
    } catch (err) {
      setError(err?.message || 'Tablo detayı alınamadı');
    } finally {
      setTableLoading(false);
    }
  }, [selected, token]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadRows(selected, 0); }, [loadRows, selected]);

  const publicCounts = summary?.publicModels || [];
  const usageSuccess = summary?.usage24h?.find((row) => row.status === 'success');
  const pendingIban = summary?.pendingIban?.find((row) => row.durum === 'bekliyor');
  const activeKeys = summary?.apiKeys?.find((row) => row.aktif === 'true');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card pad={16} style={{ background: 'var(--surface)', borderColor: summary?.alarms?.modelCountMismatch ? '#facc15' : 'var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <Caption>Canlı durum</Caption>
            <h3 style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 650 }}>Snapshot ve canlı tablo görünümü</h3>
          </div>
          <button onClick={loadSummary} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}>
            <I.Refresh size={14} /> Yenile
          </button>
        </div>
        {summary?.alarms?.modelCountMismatch && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#854d0e' }}>
            Model sayıları farklı: {publicCounts.map((row) => `${row.path}: ${row.count ?? 'hata'}`).join(' · ')}
          </div>
        )}
      </Card>

      {error && <div style={{ padding: 12, border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 12 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Box label="Kullanıcı" value={fmtInt(summary?.counts?.users)} sub={`API key aktif: ${fmtInt(activeKeys?.n)}`} />
        <Box label="Kullanım 24s" value={fmtInt(usageSuccess?.n)} sub={`Maliyet ₺${fmtTL(usageSuccess?.cost_tl)}`} />
        <Box label="Bekleyen IBAN" value={fmtInt(pendingIban?.n)} sub={`Ödeme kaydı: ${fmtInt(summary?.counts?.payments)}`} />
        <Box label="Public model" value={publicCounts.map((row) => row.count ?? '-').join(' / ')} sub="/status /api /v1" tone={summary?.alarms?.modelCountMismatch ? 'warn' : 'neutral'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <Card pad={10} style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 620, overflow: 'auto' }}>
          {tables.map((table) => {
            const active = table.table === selected;
            return (
              <button key={table.table} onClick={() => setSelected(table.table)} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 7, textAlign: 'left',
                background: active ? 'var(--ink)' : 'transparent', color: active ? '#fff' : 'var(--ink)',
                border: '1px solid transparent', fontSize: 12,
              }}>
                <span>{tableLabels[table.table] || table.table}</span>
                <Chip tone="neutral" style={{ fontSize: 10 }}>{fmtInt(table.count)}</Chip>
              </button>
            );
          })}
        </Card>

        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: 14, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <div>
              <Caption>{selected}</Caption>
              <div style={{ fontSize: 16, fontWeight: 650 }}>{tableLabels[selected] || selected}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={tableLoading || rows.offset <= 0} onClick={() => loadRows(selected, Math.max(0, rows.offset - rows.limit))} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}>Önceki</button>
              <button disabled={tableLoading || rows.rows.length < rows.limit} onClick={() => loadRows(selected, rows.offset + rows.limit)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}>Sonraki</button>
            </div>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column} style={{ textAlign: 'left', padding: '9px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rows.rows || []).map((row, idx) => (
                  <tr key={`${selected}-${rows.offset}-${idx}`}>
                    {columns.map((column) => (
                      <td key={column} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={renderValue(row[column])}>
                        {renderValue(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
