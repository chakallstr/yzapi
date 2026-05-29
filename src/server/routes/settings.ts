import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { systemConfig } from "../db/schema.js";
import { adminAuth } from "../middleware/admin-auth.js";

const router = Router();

type PublicConfigRow = {
  kur?: string | number | null;
  updatedAt?: Date | string | null;
};

const FALLBACK_KUR = 47.084289;

function safeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildPublicConfigResponse(row?: PublicConfigRow | null) {
  const updatedAt = row?.updatedAt instanceof Date
    ? row.updatedAt.toISOString()
    : typeof row?.updatedAt === "string"
      ? row.updatedAt
      : null;

  return {
    kur: safeNumber(row?.kur, FALLBACK_KUR),
    updatedAt,
    source: row ? "system_config" : "fallback",
  };
}

// In-memory settings (same as original — not persisted to DB per Phase A scope)
let defaultSettings = {
  speedWeight: 40,
  qualityWeight: 50,
  costWeight: 10,
  fallbackModel: "gemini-3.5-flash",
  systemInstructions: "İstekleri en uygun modele yönlendirerek optimum yanıtı sağla.",
};

router.get("/settings", (_req, res) => {
  res.json(defaultSettings);
});

router.get("/public-config", async (_req, res) => {
  try {
    const rows = await db
      .select({ kur: systemConfig.kur, updatedAt: systemConfig.updatedAt })
      .from(systemConfig)
      .where(eq(systemConfig.id, 1))
      .limit(1);
    res.json(buildPublicConfigResponse(rows[0] ?? null));
  } catch {
    res.json(buildPublicConfigResponse(null));
  }
});

// Mutating runtime routing settings requires admin auth — previously this was
// open, letting anyone change fallbackModel / systemInstructions / weights.
router.post("/settings", adminAuth, (req, res) => {
  defaultSettings = { ...defaultSettings, ...req.body };
  res.json({ success: true, settings: defaultSettings });
});

export default router;
