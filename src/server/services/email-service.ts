import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

export interface EmailUser {
  email: string;
  adSoyad: string;
}

export interface EmailPayment {
  miktarTL: number;
  kdvTL: number;
  netTL: number;
  metod: string;
  refKod: string;
  transactionId?: string;
  amountUsd?: number;
  paidTL?: number;
  kurAtPayment?: number;
  roundingTL?: number;
}

type EmailProvider = "resend" | "smtp" | "none";

function detectProvider(): EmailProvider {
  if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY) return "resend";
  if (env.EMAIL_PROVIDER === "smtp" && env.SMTP_HOST) return "smtp";
  if (!env.EMAIL_PROVIDER) {
    logger.warn("EMAIL_PROVIDER not configured — emails disabled");
  }
  return "none";
}

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? "noreply@yapayzekalab.com",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

async function sendViaSmtp(to: string, subject: string, html: string): Promise<void> {
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
  await transporter.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    to,
    subject,
    html,
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const provider = detectProvider();
  if (provider === "none") return;
  try {
    if (provider === "resend") {
      await sendViaResend(to, subject, html);
    } else {
      await sendViaSmtp(to, subject, html);
    }
    logger.info({ to, subject }, "[email] sent");
  } catch (e: any) {
    logger.error({ err: e, to, subject }, "[email] send failed");
    // Do NOT rethrow — email failures must not block main flow
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function welcomeEmail(user: EmailUser): Promise<void> {
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:8px">
  <h2 style="color:#1d4ed8;margin-bottom:8px">YapayZekaLab'a Hoş Geldiniz!</h2>
  <p style="color:#374151">Merhaba <strong>${user.adSoyad}</strong>,</p>
  <p style="color:#374151">Hesabınız başarıyla oluşturuldu. Hemen giriş yaparak yapay zeka modellerimizi kullanmaya başlayabilirsiniz.</p>
  <div style="margin:24px 0">
    <a href="${env.APP_BASE_URL}" style="background:#1d4ed8;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">
      Hemen Başla
    </a>
  </div>
  <p style="color:#6b7280;font-size:13px">Sorularınız için <a href="mailto:destek@yapayzekalab.com" style="color:#1d4ed8">destek@yapayzekalab.com</a> adresine yazabilirsiniz.</p>
</div>`;
  await sendEmail(user.email, "YapayZekaLab'a Hoş Geldiniz!", html);
}

export async function lowBalanceEmail(
  user: EmailUser,
  balance: number,
  threshold: number,
): Promise<void> {
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">
  <h2 style="color:#c2410c;margin-bottom:8px">Bakiye Uyarısı</h2>
  <p style="color:#374151">Merhaba <strong>${user.adSoyad}</strong>,</p>
  <p style="color:#374151">Hesabınızdaki bakiye <strong>₺${balance.toFixed(2)}</strong> olup belirlenen <strong>₺${threshold.toFixed(2)}</strong> eşiğinin altına düşmüştür.</p>
  <p style="color:#374151">Hizmet kesintisi yaşamamak için lütfen bakiyenizi yükleyin.</p>
  <div style="margin:24px 0">
    <a href="${env.APP_BASE_URL}/bakiye-yukle" style="background:#ea580c;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">
      Bakiye Yükle
    </a>
  </div>
</div>`;
  await sendEmail(user.email, "YapayZekaLab — Düşük Bakiye Uyarısı", html);
}

export async function paymentReceiptEmail(
  user: EmailUser,
  payment: EmailPayment,
): Promise<void> {
  const paidTL = payment.paidTL ?? payment.miktarTL;
  const usdRows = payment.amountUsd && payment.kurAtPayment
    ? `
    <tr><td style="color:#6b7280;padding:4px 0">Alınan USD bakiye</td><td style="text-align:right;color:#374151">$${payment.amountUsd.toFixed(2)}</td></tr>
    <tr><td style="color:#6b7280;padding:4px 0">İşlem kuru</td><td style="text-align:right;color:#374151">₺${payment.kurAtPayment.toFixed(4)}</td></tr>
    ${payment.roundingTL && payment.roundingTL > 0 ? `<tr><td style="color:#6b7280;padding:4px 0">TL yuvarlama</td><td style="text-align:right;color:#374151">₺${payment.roundingTL.toFixed(2)}</td></tr>` : ""}`
    : "";
  const kdvRow = payment.kdvTL > 0
    ? `<tr><td style="color:#6b7280;padding:4px 0">KDV</td><td style="text-align:right;color:#374151">₺${payment.kdvTL.toFixed(2)}</td></tr>`
    : "";
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
  <h2 style="color:#15803d;margin-bottom:8px">Ödeme Alındı</h2>
  <p style="color:#374151">Merhaba <strong>${user.adSoyad}</strong>,</p>
  <p style="color:#374151">Ödemeniz başarıyla işlendi. Kullanılabilir bakiyenize <strong>₺${payment.miktarTL.toFixed(2)}</strong> eklendi.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="color:#6b7280;padding:4px 0">Ödeme Yöntemi</td><td style="text-align:right;color:#374151">${payment.metod}</td></tr>
    <tr><td style="color:#6b7280;padding:4px 0">Ödenen Tutar</td><td style="text-align:right;color:#374151">₺${paidTL.toFixed(2)}</td></tr>
    ${usdRows}
    ${kdvRow}
    <tr><td style="color:#6b7280;padding:4px 0">Net Tutar</td><td style="text-align:right;color:#374151">₺${payment.netTL.toFixed(2)}</td></tr>
    <tr style="border-top:1px solid #bbf7d0"><td style="color:#15803d;font-weight:bold;padding:8px 0">Kullanılabilir Bakiye</td><td style="text-align:right;color:#15803d;font-weight:bold">₺${payment.miktarTL.toFixed(2)}</td></tr>
  </table>
  <p style="color:#6b7280;font-size:12px">Referans Kodu: <code>${payment.refKod}</code>${payment.transactionId ? ` &nbsp;|&nbsp; İşlem ID: <code>${payment.transactionId}</code>` : ""}</p>
</div>`;
  await sendEmail(user.email, "YapayZekaLab — Ödeme Makbuzu", html);
}

export async function adminPaymentNotificationEmail(event: {
  title: string;
  userEmail?: string;
  method?: string;
  amountUsd?: number;
  payableTL?: number;
  creditTL?: number;
  reference?: string;
  status?: string;
  reason?: string;
}): Promise<void> {
  const to = env.PAYMENT_NOTIFICATION_EMAIL;
  if (!to) {
    logger.warn({ title: event.title }, "[email] PAYMENT_NOTIFICATION_EMAIL not configured");
    return;
  }

  const html = `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
  <h2 style="color:#0f172a;margin-bottom:8px">${event.title}</h2>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    ${event.userEmail ? `<tr><td style="color:#64748b;padding:4px 0">Kullanıcı</td><td style="text-align:right;color:#0f172a">${event.userEmail}</td></tr>` : ""}
    ${event.method ? `<tr><td style="color:#64748b;padding:4px 0">Yöntem</td><td style="text-align:right;color:#0f172a">${event.method}</td></tr>` : ""}
    ${event.amountUsd ? `<tr><td style="color:#64748b;padding:4px 0">USD</td><td style="text-align:right;color:#0f172a">$${event.amountUsd.toFixed(2)}</td></tr>` : ""}
    ${event.payableTL ? `<tr><td style="color:#64748b;padding:4px 0">Ödenecek TL</td><td style="text-align:right;color:#0f172a">₺${event.payableTL.toFixed(2)}</td></tr>` : ""}
    ${event.creditTL ? `<tr><td style="color:#64748b;padding:4px 0">Kredi TL</td><td style="text-align:right;color:#0f172a">₺${event.creditTL.toFixed(2)}</td></tr>` : ""}
    ${event.reference ? `<tr><td style="color:#64748b;padding:4px 0">Referans</td><td style="text-align:right;color:#0f172a"><code>${event.reference}</code></td></tr>` : ""}
    ${event.status ? `<tr><td style="color:#64748b;padding:4px 0">Durum</td><td style="text-align:right;color:#0f172a">${event.status}</td></tr>` : ""}
    ${event.reason ? `<tr><td style="color:#64748b;padding:4px 0">Not</td><td style="text-align:right;color:#0f172a">${event.reason}</td></tr>` : ""}
  </table>
</div>`;

  await sendEmail(to, `YapayZekaLab — ${event.title}`, html);
}

export async function sendDailyReport(adminEmail: string, html: string): Promise<void> {
  await sendEmail(adminEmail, `YapayZekaLab — Günlük Rapor ${new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}`, html);
}

export async function kurChangeEmail(
  adminEmail: string,
  oldKur: number,
  newKur: number,
  delta: number,
): Promise<void> {
  const direction = newKur > oldKur ? "artış" : "düşüş";
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px">
  <h2 style="color:#dc2626;margin-bottom:8px">KUR Anomalisi Tespit Edildi</h2>
  <p style="color:#374151">USD/TRY kurunda <strong>%${(Math.abs(delta) * 100).toFixed(2)}</strong> oranında ${direction} tespit edildi.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="color:#6b7280;padding:4px 0">Önceki Kur</td><td style="text-align:right">₺${oldKur.toFixed(4)}</td></tr>
    <tr><td style="color:#6b7280;padding:4px 0">Yeni Kur</td><td style="text-align:right">₺${newKur.toFixed(4)}</td></tr>
    <tr><td style="color:#dc2626;font-weight:bold;padding:4px 0">Değişim</td><td style="text-align:right;color:#dc2626;font-weight:bold">%${(delta * 100).toFixed(2)}</td></tr>
  </table>
  <p style="color:#6b7280;font-size:12px">Tarih: ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</p>
</div>`;
  await sendEmail(adminEmail, "YapayZekaLab — KUR Anomalisi", html);
}
