// Admin operasyon bildirimleri — OpenWA (WAHA tarzı HTTP API) üzerinden admin WhatsApp'a push.
//
// Üç olay için kullanılır: yeni üye, ödeme denemesi, ödeme sorunu.
//
// API SÖZLEŞMESİ (canlı doğrulandı 2026-06-01, docker openwa-alerts-api :2785):
//   POST {OPENWA_API_URL}/api/sessions/{OPENWA_SESSION_ID}/messages/send-text
//   header: x-api-key: {OPENWA_API_KEY}
//   body:   { chatId: "905...@c.us", text }   (ikisi de zorunlu, text ≤4096)
//   health: GET {OPENWA_API_URL}/api/health
//
// TASARIM:
//   • Yapılandırma (ADMIN_NOTIFY_WHATSAPP_ENABLED + ADMIN_WHATSAPP_NUMBER +
//     OPENWA_API_URL/KEY/SESSION_ID) eksikse SESSİZ NO-OP — hiçbir akışı bloklamaz.
//   • Gönderim hatası YUTULUR (log + return); bildirim asla ana işlemi düşürmez.
//   • Saf yardımcılar (formatAdminEvent, toChatId, isNotifyConfigured) DB/IO'suz
//     ve deterministik → birim test edilebilir.
//   • Secret/PII minimumda: mesaj yalnız olay tipi + güvenli alanlar. Token/imza/
//     ham gövde ASLA mesaja girmez. OPENWA_API_KEY yalnız x-api-key header'ında.

import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

export type AdminEventKind = "yeni_uye" | "odeme_denemesi" | "odeme_sorunu" | "sistem_uyarisi";

export interface AdminNotifyEvent {
  kind: AdminEventKind;
  title: string;
  userEmail?: string;
  method?: string;
  amountTL?: number;
  reference?: string;
  status?: string;
  detail?: string;
  severity?: "red" | "yellow"; // sistem_uyarisi (Gözcü) için ikon seçimi
}

const WA_TEXT_MAX = 4096;

// Ham alıcı girdisinden yalnız rakamları çıkarır (ülke kodu EKLEMEZ, format
// değiştirmez). Boş/undefined güvenli. toChatId'den farkı: normalize sadece
// temizler; chatId üretimi ve 0/+90 → 90 dönüşümü toChatId'nin işidir.
export function normalizeRecipient(raw: string): string {
  return String(raw ?? "").replace(/[^\d]/g, "");
}

// TR telefon numarasını WhatsApp chatId'ye çevirir: "905XXXXXXXXX@c.us".
// Zaten @c.us / @g.us ekliyse olduğu gibi bırakır. Yerel 0/+90/boşluk normalize.
export function toChatId(raw: string): string {
  const input = String(raw ?? "").trim();
  if (/@(c|g)\.us$/i.test(input)) return input; // zaten chatId
  let digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `90${digits.slice(1)}`; // 05xx → 905xx
  else if (digits.startsWith("5")) digits = `90${digits}`; // 5xx → 905xx
  return digits ? `${digits}@c.us` : "";
}

// Bildirim için gereken tüm yapılandırma mevcut mu? (eksikse no-op).
export function isNotifyConfigured(): boolean {
  return Boolean(
    env.ADMIN_NOTIFY_WHATSAPP_ENABLED &&
      env.ADMIN_WHATSAPP_NUMBER &&
      env.OPENWA_API_URL &&
      env.OPENWA_API_KEY &&
      env.OPENWA_SESSION_ID,
  );
}

// Olayı kısa, okunur bir WhatsApp metnine çevirir (saf — test edilebilir).
export function formatAdminEvent(event: AdminNotifyEvent): string {
  const ikon =
    event.kind === "sistem_uyarisi"
      ? event.severity === "yellow"
        ? "🟡"
        : "🔴"
      : event.kind === "odeme_sorunu"
        ? "🔴"
        : event.kind === "odeme_denemesi"
          ? "💳"
          : "🆕";
  const lines = [`${ikon} YapayZekaLab — ${event.title}`];
  if (event.userEmail) lines.push(`Kullanıcı: ${event.userEmail}`);
  if (event.method) lines.push(`Yöntem: ${event.method}`);
  if (typeof event.amountTL === "number" && Number.isFinite(event.amountTL)) {
    lines.push(`Tutar: ₺${event.amountTL.toFixed(2)}`);
  }
  if (event.reference) lines.push(`Referans: ${event.reference}`);
  if (event.status) lines.push(`Durum: ${event.status}`);
  if (event.detail) lines.push(event.detail);
  return lines.join("\n").slice(0, WA_TEXT_MAX);
}

function appendPath(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

// Admin'e WhatsApp bildirimi gönder. Yapılandırma yoksa sessiz no-op; hata yutulur.
// ASLA throw etmez — çağıran akış (auth/ödeme) etkilenmez.
export async function notifyAdmin(event: AdminNotifyEvent): Promise<void> {
  if (!isNotifyConfigured()) return;
  const chatId = toChatId(env.ADMIN_WHATSAPP_NUMBER as string);
  if (!chatId) {
    logger.warn({ kind: event.kind }, "[admin-notify] geçersiz ADMIN_WHATSAPP_NUMBER");
    return;
  }
  try {
    const url = appendPath(
      env.OPENWA_API_URL as string,
      `/api/sessions/${encodeURIComponent(env.OPENWA_SESSION_ID as string)}/messages/send-text`,
    );
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": env.OPENWA_API_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chatId, text: formatAdminEvent(event) }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      logger.warn({ kind: event.kind, status: response.status }, "[admin-notify] WhatsApp gönderilemedi");
    }
  } catch (e) {
    logger.error({ err: e, kind: event.kind }, "[admin-notify] WhatsApp bildirim hatası");
  }
}
