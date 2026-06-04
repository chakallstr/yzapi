import React, { useEffect, useMemo, useState } from 'react';
import { useT } from './i18n/index.jsx';

const nfTL = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });
const nfUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const getTelegramWebApp = () => {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp || null;
};

const getTelegramInitData = () => {
  const app = getTelegramWebApp();
  if (app?.initData) return app.initData;
  if (typeof window === 'undefined') return '';

  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return hash.get('tgWebAppData') || search.get('tgWebAppData') || '';
};

async function telegramFetch(path, initData, options = {}, t) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || t('telegramTopup.requestFailed', { status: response.status }));
  return data;
}

export default function TelegramTopupApp() {
  const { t } = useT();
  const [initData, setInitData] = useState('');
  const [profile, setProfile] = useState(null);
  const [amount, setAmount] = useState('10');
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const app = getTelegramWebApp();
    app?.ready?.();
    app?.expand?.();
    app?.setHeaderColor?.('#10231d');
    app?.setBackgroundColor?.('#10231d');

    const signedInitData = getTelegramInitData();
    setInitData(signedInitData);
    if (!signedInitData) {
      setError(t('telegramTopup.mustOpenInTelegram'));
      setLoading(false);
      return;
    }

    telegramFetch('/api/telegram/webapp/me', signedInitData, {}, t)
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const amountNumber = Number(amount);
  const estimate = useMemo(() => {
    if (!profile || !Number.isFinite(amountNumber) || amountNumber <= 0) return null;
    const creditTL = amountNumber * profile.kur;
    return {
      creditTL,
      payableTL: Math.ceil(creditTL),
      insideLimits: Math.ceil(creditTL) >= profile.minBakiyeTL && Math.ceil(creditTL) <= profile.maxBakiyeTL,
    };
  }, [amountNumber, profile]);

  const createInvoice = async () => {
    setError('');
    setInvoice(null);
    setSubmitting(true);
    try {
      const nextInvoice = await telegramFetch('/api/telegram/webapp/invoices', initData, {
        method: 'POST',
        body: { amountUsd: amount },
      }, t);
      setInvoice(nextInvoice);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openInvoice = () => {
    if (!invoice?.payUrl) return;
    const app = getTelegramWebApp();
    if (app?.openTelegramLink && invoice.payUrl.includes('t.me/')) {
      app.openTelegramLink(invoice.payUrl);
      return;
    }
    if (app?.openLink) {
      app.openLink(invoice.payUrl);
      return;
    }
    window.location.assign(invoice.payUrl);
  };

  return (
    <main className="tg-topup-shell">
      <style>{`
        :root {
          color-scheme: dark;
          --tg-ink: #f5f1df;
          --tg-muted: rgba(245, 241, 223, .68);
          --tg-line: rgba(245, 241, 223, .16);
          --tg-green: #9be36d;
          --tg-gold: #f2c14e;
          --tg-bg: #10231d;
        }
        body { margin: 0; background: var(--tg-bg); }
        .tg-topup-shell {
          min-height: 100vh;
          padding: 22px;
          color: var(--tg-ink);
          font-family: Fraunces, Avenir Next, ui-serif, Georgia, serif;
          background:
            radial-gradient(circle at 8% 8%, rgba(155, 227, 109, .30), transparent 28%),
            radial-gradient(circle at 92% 10%, rgba(242, 193, 78, .25), transparent 32%),
            linear-gradient(145deg, #10231d 0%, #172a20 54%, #09140f 100%);
        }
        .tg-topup-card {
          max-width: 520px;
          margin: 0 auto;
          border: 1px solid var(--tg-line);
          border-radius: 30px;
          padding: 22px;
          background: linear-gradient(160deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
          box-shadow: 0 24px 70px rgba(0,0,0,.34);
          animation: panelIn .48s cubic-bezier(.2,.9,.2,1) both;
        }
        .tg-kicker { color: var(--tg-green); font-size: 12px; letter-spacing: .16em; text-transform: uppercase; }
        h1 { margin: 10px 0 8px; font-size: clamp(31px, 9vw, 56px); line-height: .92; }
        .tg-muted { color: var(--tg-muted); line-height: 1.55; }
        .tg-stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
        .tg-stat { border: 1px solid var(--tg-line); border-radius: 20px; padding: 13px; background: rgba(0,0,0,.18); }
        .tg-stat span { display: block; color: var(--tg-muted); font-size: 12px; }
        .tg-stat strong { display: block; margin-top: 5px; font-size: 17px; }
        .tg-chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 12px; }
        .tg-chip, .tg-button {
          border: 0;
          border-radius: 999px;
          padding: 12px 15px;
          color: #10231d;
          background: var(--tg-gold);
          font-weight: 800;
          cursor: pointer;
        }
        .tg-chip[data-active="true"] { background: var(--tg-green); }
        .tg-input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--tg-line);
          border-radius: 22px;
          padding: 17px 18px;
          color: var(--tg-ink);
          background: rgba(0,0,0,.28);
          font-size: 24px;
          font-weight: 800;
          outline: none;
        }
        .tg-button {
          width: 100%;
          margin-top: 14px;
          padding: 16px;
          background: var(--tg-green);
          font-size: 16px;
        }
        .tg-button:disabled { opacity: .5; cursor: not-allowed; }
        .tg-invoice {
          margin-top: 16px;
          padding: 16px;
          border-radius: 22px;
          background: rgba(155, 227, 109, .13);
          border: 1px solid rgba(155, 227, 109, .35);
          animation: slideUp .32s ease both;
        }
        .tg-error { margin-top: 12px; color: #ffd1c7; }
        @keyframes panelIn { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
      `}</style>
      <section className="tg-topup-card">
        <div className="tg-kicker">YapayZekaLab Crypto Topup</div>
        <h1>{t('telegramTopup.heading')}</h1>
        <p className="tg-muted">{t('telegramTopup.description')}</p>

        {loading && <p className="tg-muted">{t('telegramTopup.preparing')}</p>}

        {!loading && profile && (
          <>
            <div className="tg-stat-grid">
              <div className="tg-stat"><span>{t('telegramTopup.statBalance')}</span><strong>{nfTL.format(profile.balanceTL)}</strong></div>
              <div className="tg-stat"><span>{t('telegramTopup.statRate')}</span><strong>{nfTL.format(profile.kur)} / USD</strong></div>
              <div className="tg-stat"><span>{t('telegramTopup.statMin')}</span><strong>{nfTL.format(profile.minBakiyeTL)}</strong></div>
              <div className="tg-stat"><span>{t('telegramTopup.statMax')}</span><strong>{nfTL.format(profile.maxBakiyeTL)}</strong></div>
            </div>

            <div className="tg-chip-row">
              {(profile.quickAmountsUsd || [5, 10, 25]).map((value) => (
                <button
                  className="tg-chip"
                  data-active={Number(amount) === value}
                  key={value}
                  onClick={() => { setAmount(String(value)); setInvoice(null); }}
                  type="button"
                >
                  {nfUsd.format(value)}
                </button>
              ))}
            </div>

            <input
              className="tg-input"
              inputMode="decimal"
              min="0"
              onChange={(event) => { setAmount(event.target.value.replace(',', '.')); setInvoice(null); }}
              placeholder={t('telegramTopup.amountPlaceholder')}
              step="0.01"
              type="number"
              value={amount}
            />

            {estimate && (
              <p className="tg-muted">
                {t('telegramTopup.estimateSummary', { creditTL: nfTL.format(estimate.creditTL), payableTL: nfTL.format(estimate.payableTL) })}
              </p>
            )}

            <button className="tg-button" disabled={submitting || !estimate?.insideLimits} onClick={createInvoice} type="button">
              {submitting ? t('telegramTopup.creatingInvoice') : t('telegramTopup.createInvoiceBtn')}
            </button>

            {invoice && (
              <div className="tg-invoice">
                <strong>{t('telegramTopup.invoiceReady', { amountUsd: nfUsd.format(invoice.amountUsd) })}</strong>
                <p className="tg-muted">{t('telegramTopup.invoiceDescription', { creditTL: nfTL.format(invoice.creditTL) })}</p>
                <button className="tg-button" onClick={openInvoice} type="button">{t('telegramTopup.payWithCryptoBot')}</button>
              </div>
            )}
          </>
        )}

        {error && <p className="tg-error">{error}</p>}
      </section>
    </main>
  );
}
