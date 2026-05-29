import { useMemo, useState } from 'react';
import { I, Card, Chip, Caption } from './shared.jsx';
import { API_DOC_SECTIONS, buildApiDocsPlainText } from './api-docs.js';

const DocumentsTab = () => {
  const [copied, setCopied] = useState(false);
  const [copiedBlock, setCopiedBlock] = useState('');
  const docs = useMemo(() => API_DOC_SECTIONS, []);

  const copyAll = async () => {
    try {
      await navigator.clipboard?.writeText(buildApiDocsPlainText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const copyBlock = async (key, text) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedBlock(key);
      window.setTimeout(() => setCopiedBlock(''), 1600);
    } catch {
      setCopiedBlock('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Caption>Documents</Caption>
          <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8, margin: '6px 0 6px' }}>
            Claude Popusk akışı, <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>YapayZekaLab’e uyarlanmış</span>
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55, maxWidth: 720 }}>
            `docs.claude-popusk.shop` içeriğinin ürününe uyarlanmış sürümü burada yer alır. Araç bağlantıları, model kimlikleri, v1 endpoint yüzeyi ve bakiye davranışı YapayZekaLab canlı akışına göre yazılmıştır.
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
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{doc.label}</div>
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
                  <Caption>{doc.label}</Caption>
                  <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{doc.title}</div>
                </div>
                <Chip tone="accent" style={{ fontSize: 9.5 }}>{doc.key.toUpperCase()}</Chip>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.72 }}>
                  {doc.intro}
                </p>

                {doc.bullets?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {doc.bullets.map((bullet, index) => (
                      <div key={index} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 7, flexShrink: 0 }} />
                        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.68 }}>{bullet}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {doc.clientCards?.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                    {doc.clientCards.map((card) => (
                      <div key={card.name} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 12, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{card.name}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{card.type}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {card.steps.map((step, index) => (
                            <p key={index} style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.62 }}>
                              {index + 1}. {step}
                            </p>
                          ))}
                        </div>
                        {card.code ? (
                          <pre style={{ margin: '12px 0 0', padding: 12, borderRadius: 10, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto', fontSize: 11, lineHeight: 1.55 }}>
                            <code>{card.code}</code>
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {doc.referenceRows?.length ? (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {doc.referenceRows.map((row, index) => (
                      <div
                        key={row.key}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(160px, 0.9fr) minmax(0, 1.4fr)',
                          gap: 12,
                          padding: '12px 14px',
                          background: index % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                          borderBottom: index < doc.referenceRows.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <code style={{ fontSize: 11.5, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{row.key}</code>
                        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.62 }}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {doc.modelGroups?.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                    {doc.modelGroups.map((group) => (
                      <div key={group.family} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 12, padding: 14 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{group.family}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {group.models.map((model) => (
                            <code key={model} style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>{model}</code>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {doc.codeBlocks?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {doc.codeBlocks.map((block) => (
                      <div key={block.title}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{block.title}</div>
                          <button
                            onClick={() => copyBlock(`${doc.key}-${block.title}`, block.code)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 9,
                              background: copiedBlock === `${doc.key}-${block.title}` ? 'var(--ok-bg)' : 'var(--surface-2)',
                              color: copiedBlock === `${doc.key}-${block.title}` ? '#047857' : 'var(--ink-2)',
                              fontSize: 11,
                              fontWeight: 600,
                              border: '1px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <I.Copy size={12} stroke={copiedBlock === `${doc.key}-${block.title}` ? '#047857' : 'var(--ink-2)'} />
                            {copiedBlock === `${doc.key}-${block.title}` ? 'Kopyalandı' : 'Kod kopyala'}
                          </button>
                        </div>
                        <pre style={{ margin: 0, padding: 14, borderRadius: 12, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto', fontSize: 11.5, lineHeight: 1.6 }}>
                          <code>{block.code}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export { DocumentsTab };
