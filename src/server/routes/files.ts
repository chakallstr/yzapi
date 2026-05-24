import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { env } from "../lib/env.js";

const router = Router();

const initialFiles = [
  {
    id: "sci-1",
    name: "molekuler_dinamik_v3.csv",
    type: "CSV",
    size: "1.2 MB",
    date: "2026-05-23",
    status: "success",
    rowsCount: 4200,
    columns: ["Zaman", "Sicaklik", "Basinc", "Aktivasyon_Enerjisi"],
    data: [
      { Zaman: 0, Sicaklik: 298, Basinc: 1.0, Aktivasyon_Enerjisi: 45.2 },
      { Zaman: 10, Sicaklik: 305, Basinc: 1.1, Aktivasyon_Enerjisi: 44.8 },
      { Zaman: 20, Sicaklik: 315, Basinc: 1.2, Aktivasyon_Enerjisi: 43.1 },
      { Zaman: 30, Sicaklik: 322, Basinc: 1.3, Aktivasyon_Enerjisi: 42.0 },
      { Zaman: 40, Sicaklik: 330, Basinc: 1.5, Aktivasyon_Enerjisi: 41.2 },
      { Zaman: 50, Sicaklik: 338, Basinc: 1.8, Aktivasyon_Enerjisi: 40.5 },
    ],
  },
  {
    id: "sci-2",
    name: "spektroskopi_analiz_raporu.json",
    type: "JSON",
    size: "450 KB",
    date: "2026-05-22",
    status: "success",
    rowsCount: 150,
    columns: ["DalgaBoyu", "Absorbans", "Yansima"],
    data: [
      { DalgaBoyu: 400, Absorbans: 0.12, Yansima: 0.85 },
      { DalgaBoyu: 450, Absorbans: 0.28, Yansima: 0.70 },
      { DalgaBoyu: 500, Absorbans: 0.65, Yansima: 0.32 },
      { DalgaBoyu: 550, Absorbans: 0.89, Yansima: 0.10 },
      { DalgaBoyu: 600, Absorbans: 0.42, Yansima: 0.55 },
      { DalgaBoyu: 650, Absorbans: 0.15, Yansima: 0.82 },
    ],
  },
  {
    id: "sci-3",
    name: "genomik_sekanslama_t2.txt",
    type: "TXT",
    size: "2.8 MB",
    date: "2026-05-21",
    status: "success",
    rowsCount: 8800,
    columns: ["Dizilim_Karakter", "Elesme_Yuzdesi"],
    data: [
      { Dizilim_Karakter: "A", Elesme_Yuzdesi: 98 },
      { Dizilim_Karakter: "T", Elesme_Yuzdesi: 97 },
      { Dizilim_Karakter: "C", Elesme_Yuzdesi: 99 },
      { Dizilim_Karakter: "G", Elesme_Yuzdesi: 96 },
    ],
  },
  {
    id: "sci-4",
    name: "termal_iletkenlik_matrisi.csv",
    type: "CSV",
    size: "820 KB",
    date: "2026-05-20",
    status: "success",
    rowsCount: 960,
    columns: ["X_Ekseni", "Y_Ekseni", "Iletkenlik"],
    data: [
      { X_Ekseni: 1, Y_Ekseni: 1, Iletkenlik: 12.5 },
      { X_Ekseni: 1, Y_Ekseni: 2, Iletkenlik: 13.1 },
      { X_Ekseni: 2, Y_Ekseni: 1, Iletkenlik: 12.8 },
      { X_Ekseni: 2, Y_Ekseni: 2, Iletkenlik: 14.2 },
    ],
  },
];

let files = [...initialFiles];

let ai: GoogleGenAI | null = null;
if (env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

router.get("/files", (_req, res) => {
  res.json(files);
});

router.post("/files", (req, res) => {
  const { name, type, size, columns, data } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: "Dosya adı ve türü zorunludur." });
  }
  const newFile = {
    id: "sci-" + Date.now(),
    name,
    type,
    size: size || "10 KB",
    date: new Date().toISOString().split("T")[0],
    status: "success",
    rowsCount: data ? data.length : 1,
    columns: columns || ["Parametre", "Deger"],
    data: data || [{ Parametre: "Varsayilan", Deger: 100 }],
  };
  files.push(newFile);
  res.status(201).json(newFile);
});

router.delete("/files/:id", (req, res) => {
  const { id } = req.params;
  files = files.filter((f) => f.id !== id);
  res.json({ success: true });
});

router.post("/files/:id/analyze", async (req, res) => {
  const { id } = req.params;
  const file = files.find((f) => f.id === id);
  if (!file) return res.status(404).json({ error: "Dosya bulunamadı" });

  if (!ai) {
    const mockAns = `[SİMÜLASYON ANALİZİ] "${file.name}" adlı dosya incelendi. ${file.rowsCount} satır ve ${file.columns.join(", ")} kolonlarından oluşmaktadır.`;
    return res.json({ analysis: mockAns, isMock: true });
  }

  try {
    const fileSnippetString = JSON.stringify(file.data);
    const systemInstruction = "Sen bir bilimsel veri analiz asistanısın. Türkçe profesyonel analiz yaz.";
    const userPrompt = `Dosya Adı: ${file.name}\nKolonlar: ${file.columns.join(", ")}\nÖrnek Veri: ${fileSnippetString}`;
    const response = await (ai as any).models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: { systemInstruction, temperature: 0.7 },
    });
    res.json({ analysis: response.text || "Herhangi bir analiz üretilemedi.", isMock: false });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Analiz sırasında hata oluştu" });
  }
});

export default router;
