import { Router } from "express";

const router = Router();

// In-memory logs (same as original)
let logs = [
  {
    id: "log-1",
    timestamp: "2026-05-23T17:30:15Z",
    prompt: "Fizik moleküler analizinde sıcaklık 350 Kelvin üzerine çıktığında ne olur?",
    routedModel: "gemini-3.1-pro-preview",
    speedMs: 1240,
    costEstimate: 0.00240,
    status: "success",
    tokenCount: 450,
    reasoning: "İstem yüksek düzeyde bilimsel ve teorik fizik analizi gerektiriyor.",
    responseText: "Sıcaklık 350 Kelvin üzerine çıktığında moleküllerin ortalama kinetik enerjisi önemli ölçüde artar.",
  },
  {
    id: "log-2",
    timestamp: "2026-05-23T17:35:42Z",
    prompt: "Aşağıdaki kelimeyi Fransızcaya çevir: 'Bilim Laboratuvarı'",
    routedModel: "gemini-3.5-flash",
    speedMs: 240,
    costEstimate: 0.00018,
    status: "success",
    tokenCount: 85,
    reasoning: "Çeviri ve basit metin düzenleme görevleri düşük karmaşıklığa sahiptir.",
    responseText: "'Laboratoire de science'",
  },
];

router.get("/logs", (_req, res) => {
  res.json(logs);
});

// Export logs array mutably so legacy route can push to it
export { logs };
export default router;
