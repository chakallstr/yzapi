import { useMemo, useState } from 'react';
import { I, Card, Chip, Caption } from './shared.jsx';
import { LEGAL_DOCS, LEGAL_DOC_ORDER, buildLegalDocsPlainText } from './legal-docs.js';

const DocumentsTab = () => {
  const [copied, setCopied] = useState(false);
  const docs = useMemo(() => LEGAL_DOC_ORDER.map((key) => ({ key, ...LEGAL_DOCS[key] })), []);

  const copyAll = async () => {
    try {
      await navigator.clipboard?.writeText(buildLegalDocsPlainText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Caption>Documents</Caption>
          <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8, margin: '6px 0 6px' }}>
            Resmi dokümanlar, <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>tek sayfada</span>
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55, maxWidth: 720 }}>
            KVKK, Kullanıcı Sözleşmesi, Gizlilik ve Mesafeli Satış metinleri burada tam haliyle yer alır.
          </p>
        </div>
        <button onClick={copyAll} style={{
          padding: '9px 14px', borderRadius: 10,
          background: copied ? 'var(--ok-bg)' : 'var(--ink)',
          color: copied ? '#047857' : '#fff',
          fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <I.Copy size={13} stroke={copied ? '#047857' : '#fff'} />
          {copied ? 'Tümü kopyalandı' : 'Tüm sayfayı kopyala'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <Card pad={18} style={{ position: 'sticky', top: 84 }}>
          <Caption>İçindekiler</Caption>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {docs.map((doc, index) => (
              <a
                key={doc.key}
                href={`#doc-${doc.key}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, padding: '10px 12px', borderRadius: 10,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--ink)', textDecoration: 'none',
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{doc.title}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{doc.body.length} paragraf</div>
                </div>
                <Chip tone="neutral" style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>{index + 1}</Chip>
              </a>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {docs.map((doc) => (
            <Card key={doc.key} pad={22} id={`doc-${doc.key}`} style={{ scrollMarginTop: 84 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div>
                  <Caption>Belge</Caption>
                  <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{doc.title}</div>
                </div>
                <Chip tone="accent" style={{ fontSize: 9.5 }}>{doc.key.toUpperCase()}</Chip>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {doc.body.map((paragraph, index) => (
                  <p key={index} style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.72 }}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export { DocumentsTab };
