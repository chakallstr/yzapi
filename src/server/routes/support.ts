import { Router } from "express";
import { env } from "../lib/env.js";

const router = Router();

// Public: yalnız ENV'de tanımlı destek kanallarını döndürür (CodeFast: destek WhatsApp/kanal üzerinden).
router.get("/support", (_req, res) => {
  const channels = [
    env.SUPPORT_WHATSAPP_URL && { kind: "whatsapp", label: "WhatsApp", url: env.SUPPORT_WHATSAPP_URL },
    env.SUPPORT_TELEGRAM_URL && { kind: "telegram", label: "Telegram", url: env.SUPPORT_TELEGRAM_URL },
    env.SUPPORT_DISCORD_URL && { kind: "discord", label: "Discord", url: env.SUPPORT_DISCORD_URL },
    env.SUPPORT_EMAIL && { kind: "email", label: "E-posta", url: `mailto:${env.SUPPORT_EMAIL}` },
  ].filter(Boolean);
  res.json({ channels });
});

export default router;
