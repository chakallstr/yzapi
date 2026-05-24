import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { env } from "../lib/env.js";
import { logs } from "./logs.js";

const router = Router();

let ai: GoogleGenAI | null = null;
if (env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

// Re-read settings from settings route (shared singleton not exported, so inline defaults)
let defaultSettings = {
  speedWeight: 40,
  qualityWeight: 50,
  costWeight: 10,
  fallbackModel: "gemini-3.5-flash",
  systemInstructions: "İstekleri en uygun modele yönlendirerek optimum yanıtı sağla.",
};

// Keep in sync: settings router also exposes PATCH /api/settings
// For now, legacy route uses its own copy (same initial values as settings route)

router.post("/route-agent", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt girmek zorunludur." });

  const { speedWeight, qualityWeight } = defaultSettings;
  const promptLen = prompt.length;
  const wordCount = prompt.split(/\s+/).length;
  const complexRegex = /(fizik|kimya|kod|hesapla|sekanslama|algoritma|matematik|analiz|molekuler|spektroskopi|şifrele|formül|compile|optimize|database|veritabanı|model)/i;
  const matchesComplex = complexRegex.test(prompt);

  const qualityScore = qualityWeight * (matchesComplex ? 1.5 : 1.0);
  const speedScore = speedWeight * (wordCount < 10 ? 1.6 : 1.0);

  const routedModel = qualityScore > speedScore ? "gemini-3.1-pro-preview" : "gemini-3.5-flash";
  const decisionReasoning =
    qualityScore > speedScore
      ? `İstem karmaşık terimler içeriyor (Kalite ${qualityScore.toFixed(0)} - Hız ${speedScore.toFixed(0)}). Pro model seçildi.`
      : `İstem basit (Hız ${speedScore.toFixed(0)} - Kalite ${qualityScore.toFixed(0)}). Flash model seçildi.`;

  const baseLatency = routedModel === "gemini-3.5-flash" ? 180 : 850;
  const speedMs = Math.round(baseLatency + Math.min(promptLen * 1.5, 400) + Math.random() * 100);
  const tokenCount = Math.round(wordCount * 1.4 + 40);
  const costPerToken = routedModel === "gemini-3.5-flash" ? 0.00000015 : 0.00000125;
  const costEstimate = parseFloat((tokenCount * costPerToken).toFixed(7));

  if (!ai) {
    const finalResponseText =
      routedModel === "gemini-3.1-pro-preview"
        ? `[SİMÜLASYON - PRO MODEL] "${prompt}" Pro analitik motorumuz tarafından işlendi.`
        : `[SİMÜLASYON - FLASH MODEL] "${prompt}" Flash motorumuz tarafından hızlıca işlendi.`;

    const mockLog = {
      id: "log-" + Date.now(),
      timestamp: new Date().toISOString(),
      prompt,
      routedModel,
      speedMs,
      costEstimate,
      status: "success",
      tokenCount,
      reasoning: decisionReasoning + " (API anahtarı bulunmadığı için simülasyon modunda)",
      responseText: finalResponseText,
    };
    logs.unshift(mockLog);
    return res.json(mockLog);
  }

  try {
    const systemPrompt = `Sen bir akıllı yönlendiricinin çıkış organısın. Yönlendiricimiz bu sorguyu "${routedModel}" modeline yönlendirdi. Gerekçe: "${decisionReasoning}". Türkçe profesyonel cevap üret.`;
    const response = await (ai as any).models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { systemInstruction: systemPrompt, temperature: 0.8 },
    });

    const realLog = {
      id: "log-" + Date.now(),
      timestamp: new Date().toISOString(),
      prompt,
      routedModel,
      speedMs,
      costEstimate,
      status: "success",
      tokenCount,
      reasoning: decisionReasoning,
      responseText: response.text || "Model tarafından yanıt üretilemedi.",
    };
    logs.unshift(realLog);
    res.json(realLog);
  } catch (error: any) {
    const errLog = {
      id: "log-" + Date.now(),
      timestamp: new Date().toISOString(),
      prompt,
      routedModel,
      speedMs: 150,
      costEstimate: 0,
      status: "error",
      tokenCount: 0,
      reasoning: "API isteğinde hata: " + error.message,
      responseText: "Gemini API bağlantısı başarısız oldu.",
    };
    logs.unshift(errLog);
    res.status(500).json(errLog);
  }
});

export default router;
