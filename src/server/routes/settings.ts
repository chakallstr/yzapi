import { Router } from "express";

const router = Router();

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

router.post("/settings", (req, res) => {
  defaultSettings = { ...defaultSettings, ...req.body };
  res.json({ success: true, settings: defaultSettings });
});

export default router;
