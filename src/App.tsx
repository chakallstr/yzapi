import React, { useState, useEffect, useRef } from "react";
import { 
  Home, 
  FolderOpen, 
  Activity, 
  Settings, 
  Search, 
  Bell, 
  ChevronDown, 
  Copy, 
  Check, 
  Play, 
  TrendingUp, 
  FileText, 
  Cpu, 
  ArrowRight, 
  UploadCloud, 
  Trash2, 
  Zap,
  Layers,
  Sparkles,
  RefreshCw,
  Database,
  BarChart3,
  Terminal,
  Clock,
  Coins
} from "lucide-react";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { ScientificData, RoutingLog, RouterSettings } from "./types";

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<"homepage" | "files" | "activity" | "settings">("homepage");
  
  // Skeletons / Demo state toggle (Matches image's loading state exactly)
  const [isLoadingStateDemo, setIsLoadingStateDemo] = useState<boolean>(true);
  
  // Search query in header
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // State for loaded files & settings
  const [files, setFiles] = useState<ScientificData[]>([]);
  const [settings, setSettings] = useState<RouterSettings>({
    speedWeight: 40,
    qualityWeight: 50,
    costWeight: 10,
    fallbackModel: "gemini-3.5-flash",
    systemInstructions: "İstekleri en uygun modele yönlendirerek optimum yanıtı sağla."
  });
  const [logs, setLogs] = useState<RoutingLog[]>([]);
  
  // Playground prompt state
  const [promptInput, setPromptInput] = useState<string>("Sıcaklık ve absorbans verileri arasındaki korelasyonu çıkarıp, katsayıları hesaplar mısın?");
  const [isRoutingResponseLoading, setIsRoutingResponseLoading] = useState<boolean>(false);
  const [lastRouteResult, setLastRouteResult] = useState<RoutingLog | null>(null);
  
  // DragnDrop file state
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Quickstart code snippet language tab
  const [codeLanguage, setCodeLanguage] = useState<"nodejs" | "python" | "curl">("nodejs");
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  
  // Detailed file analysis modal/panel
  const [selectedFileForAnalysis, setSelectedFileForAnalysis] = useState<ScientificData | null>(null);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string>("");
  const [isAiAnalysisLoading, setIsAiAnalysisLoading] = useState<boolean>(false);

  // Notification lists
  const [notifications, setNotifications] = useState<Array<{id: number, text: string, time: string}>>([
    { id: 1, text: "Moleküler analiz tamamlandı", time: "10 dk önce" },
    { id: 2, text: "Yönlendirici gemini-3.1-pro modelini seçti", time: "22 dk önce" },
    { id: 3, text: "Veritabanı bağlantısı kuruldu", time: "1 saat önce" }
  ]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState<boolean>(false);

  // Load data from Express backend
  const refreshData = async () => {
    try {
      const settingsRes = await fetch("/api/settings");
      const settingsData = await settingsRes.json();
      setSettings(settingsData);

      const filesRes = await fetch("/api/files");
      const filesData = await filesRes.json();
      setFiles(filesData);

      const logsRes = await fetch("/api/logs");
      const logsData = await logsRes.json();
      setLogs(logsData);
    } catch (error) {
      console.error("Veri yuklenirken hata olustu:", error);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Sync settings when modified
  const handleUpdateSettings = async (updated: Partial<RouterSettings>) => {
    const newSettings = { ...settings, ...updated };
    setSettings(newSettings);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings)
      });
    } catch (e) {
      console.error("Ayarlar güncellenirken hata:", e);
    }
  };

  // Run Route Simulator Playground
  const handleRouteQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;

    setIsRoutingResponseLoading(true);
    setLastRouteResult(null);

    try {
      const response = await fetch("/api/route-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptInput })
      });
      const data = await response.json();
      setLastRouteResult(data);
      
      // Highlight new activity in feed
      refreshData();
    } catch (error) {
      console.error("Yönlendirme hatası:", error);
    } finally {
      setIsRoutingResponseLoading(false);
    }
  };

  // Trigger Gemini File Analysis
  const handleAnalyzeFile = async (file: ScientificData) => {
    setSelectedFileForAnalysis(file);
    setAiAnalysisResult("");
    setIsAiAnalysisLoading(true);

    try {
      const response = await fetch(`/api/files/${file.id}/analyze`, {
        method: "POST"
      });
      const data = await response.json();
      setAiAnalysisResult(data.analysis);
    } catch (error) {
      console.error("Analiz hatası:", error);
      setAiAnalysisResult("Dosya analizi başarısız oldu.");
    } finally {
      setIsAiAnalysisLoading(false);
    }
  };

  // Handle Drag-and-Drop file uploads
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const fileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toUpperCase() || '"TXT"';
    let fileType = ext;
    if (ext !== "CSV" && ext !== "JSON") {
      fileType = "TXT";
    }

    // Read client-side to simulate rows/columns
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      let chartData: any[] = [];
      let columns: string[] = ["Satir", "Deger"];

      try {
        if (fileType === "JSON") {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            chartData = parsed.slice(0, 8);
            if (chartData.length > 0) {
              columns = Object.keys(chartData[0]);
            }
          } else {
            chartData = [parsed];
            columns = Object.keys(parsed);
          }
        } else {
          // Parse basic CSV lines
          const lines = text.split('\n').filter(l => l.trim().length > 0);
          if (lines.length > 0) {
            columns = lines[0].split(',').map(c => c.trim());
            chartData = lines.slice(1, 7).map((line, idx) => {
              const vals = line.split(',');
              const obj: any = {};
              columns.forEach((col, cIdx) => {
                const num = Number(vals[cIdx]);
                obj[col] = isNaN(num) ? vals[cIdx]?.trim() : num;
              });
              return obj;
            });
          }
        }
      } catch (err) {
        console.warn("Dosya parse edilemedi, varsayilan format uygulaniyor:", err);
        chartData = [{ Satir: 1, Deger: 65 }, { Satir: 2, Deger: 78 }];
      }

      const payload = {
        name: file.name,
        type: fileType,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        columns: columns,
        data: chartData
      };

      try {
        const response = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (response.ok) {
          refreshData();
        }
      } catch (err) {
        console.error("Dosya yüklenemedi:", err);
      }
    };

    reader.readAsText(file);
  };

  const handleDeleteFile = async (id: string) => {
    try {
      const response = await fetch(`/api/files/${id}`, {
        method: "DELETE"
      });
      if (response.ok) {
        if (selectedFileForAnalysis?.id === id) {
          setSelectedFileForAnalysis(null);
        }
        refreshData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Copy code snippet helper
  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Sample codes depending on selected language
  const getCodeSnippet = () => {
    switch (codeLanguage) {
      case "nodejs":
        return `import { GoogleGenAI } from '@google/genai';

// YZ Lab akıllı yönlendiricisi üzerinden tek istek
const response = await fetch('https://api.yzlab.ai/v2/route', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_LAB_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: "Moleküler dinamik analizini başlat",
    routingWeights: {
      speed: ${settings.speedWeight},
      quality: ${settings.qualityWeight},
      cost: ${settings.costWeight}
    }
  })
});

const result = await response.json();
console.log("Seçilen Model:", result.routedModel);
console.log("Cevap:", result.responseText);`;

      case "python":
        return `import requests

# YZ Lab akıllı yönlendiricisine Python entegrasyonu
url = "https://api.yzlab.ai/v2/route"
payload = {
    "prompt": "Moleküler dinamik analizini başlat",
    "routingWeights": {
        "speed": ${settings.speedWeight},
        "quality": ${settings.qualityWeight},
        "cost": ${settings.costWeight}
    }
}
headers = {
    "Authorization": "Bearer YOUR_LAB_TOKEN",
    "Content-Type": "application/json"
}

response = requests.post(url, json=payload, headers=headers)
result = response.json()
print(f"Secilen Model: {result['routedModel']}")
print(f"Cevap: {result['responseText']}")`;

      case "curl":
        return `curl -X POST https://api.yzlab.ai/v2/route \\
  -H "Authorization: Bearer YOUR_LAB_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Moleküler dinamik analizini başlat",
    "routingWeights": {
      "speed": ${settings.speedWeight},
      "quality": ${settings.qualityWeight},
      "cost": ${settings.costWeight}
    }
  }'`;
    }
  };

  // Statistics calculations for Charts
  const getModelStatsData = () => {
    const proCount = logs.filter(l => l.routedModel === "gemini-3.1-pro-preview").length;
    const flashCount = logs.filter(l => l.routedModel === "gemini-3.5-flash").length;
    return [
      { name: "gemini-pro (Gelişmiş)", value: proCount || 1, color: "#3b82f6" },
      { name: "gemini-flash (Hızlı)", value: flashCount || 2, color: "#10b981" },
    ];
  };

  const getLatencyStatsData = () => {
    return logs.slice(0, 6).reverse().map((log, index) => ({
      index: index + 1,
      name: `Sorgu ${index+1}`,
      Gecikme: log.speedMs,
      Maliyet: log.costEstimate * 1000 // scaling for visual bar
    }));
  };

  return (
    <div className="min-h-screen blueprint-grid text-slate-800 font-sans flex flex-col selection:bg-blue-100">
      
      {/* 1. Global Interactive Top Bar (Matches image visual format) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-4 py-2.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="bg-blue-600 rounded p-1.5 text-white flex items-center justify-center">
              <span className="font-display font-bold text-lg select-none">YZ</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="font-display font-semibold text-slate-900 tracking-tight">YZ Lab</span>
                <span className="text-slate-400 text-xs">/</span>
                <span className="text-xs text-slate-500 font-mono font-medium">
                  {isLoadingStateDemo ? "Yükleniyor Durumu (Loading State)" : "Aktif Analiz Paneli"}
                </span>
              </div>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="hidden md:flex items-center space-x-1">
            <button 
              id="nav-home"
              onClick={() => setActiveTab("homepage")} 
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "homepage" 
                  ? "bg-blue-50 text-blue-700" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Home id="icon-home" className="w-4 h-4" />
              <span>Ana Sayfa</span>
            </button>
            <button 
              id="nav-files"
              onClick={() => setActiveTab("files")} 
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "files" 
                  ? "bg-blue-50 text-blue-700" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <FolderOpen id="icon-files" className="w-4 h-4" />
              <span>Dosyalar</span>
            </button>
            <button 
              id="nav-activity"
              onClick={() => setActiveTab("activity")} 
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "activity" 
                  ? "bg-blue-50 text-blue-700" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Activity id="icon-activity" className="w-4 h-4" />
              <span>Aktivite</span>
            </button>
            <button 
              id="nav-settings"
              onClick={() => setActiveTab("settings")} 
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "settings" 
                  ? "bg-blue-50 text-blue-700" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Settings id="icon-settings" className="w-4 h-4" />
              <span>Ayarlar</span>
            </button>
          </nav>
        </div>

        {/* Global Controls and State Switcher */}
        <div className="flex items-center space-x-4">
          
          {/* SKELETON LOADER DEMO CONTROLLER */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
            <button
              onClick={() => setIsLoadingStateDemo(true)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                isLoadingStateDemo 
                  ? "bg-slate-600 text-white shadow-sm" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="Göndermiş olduğunuz ekran görüntüsünün birebir yükleme durumunu simüle eder"
            >
              Skelet Modu (Görüntüdeki)
            </button>
            <button
              onClick={() => setIsLoadingStateDemo(false)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                !isLoadingStateDemo 
                  ? "bg-blue-600 text-white shadow-sm" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="Aktif çalışan ve AI ile bağlanan interaktif paneli açar"
            >
              Aktif Panel
            </button>
          </div>

          {/* Search Box */}
          <div className="relative hidden lg:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input 
              type="text" 
              placeholder="Ara..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-md py-1.5 pl-9 pr-4 text-xs w-56 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
            />
          </div>

          {/* Notifications */}
          <div className="relative">
            <button 
              onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 relative transition-all"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            </button>
            {showNotificationsDropdown && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-lg shadow-xl py-2 z-50 text-xs">
                <div className="px-3 py-1 font-semibold border-b border-slate-100 text-slate-700 flex justify-between items-center">
                  <span>Bildirimler</span>
                  <span className="text-[10px] bg-blue-100 text-blue-700 font-mono px-1.5 py-0.5 rounded">Yeni</span>
                </div>
                {notifications.map(n => (
                  <div key={n.id} className="p-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex flex-col">
                    <span className="text-slate-700 text-xs">{n.text}</span>
                    <span className="text-slate-400 text-[10px] mt-0.5">{n.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User Profile */}
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
            <img 
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" 
              alt="Profil" 
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-full border border-slate-300"
            />
            <div className="hidden sm:flex flex-col items-start leading-none">
              <span className="text-xs font-medium text-slate-800">Fasson</span>
              <span className="text-[10px] text-slate-400">Lab Yönetici</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">
        
        {/* HOMEPAGE VIEW */}
        {activeTab === "homepage" && (
          <div className="space-y-6">
            
            {/* Upper Grid: Hero, Lab Activity Feed & Status indicators */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Core Hero Component (White card/thin slate outline with custom font styling) */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10">
                  <Cpu className="w-32 h-32 text-blue-500" />
                </div>
                <div>
                  <div className="inline-flex items-center space-x-1 bg-blue-50 border border-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold tracking-wider uppercase mb-3">
                    <Sparkles className="w-3 h-3 text-blue-500 animate-spin" />
                    <span>GELECEK NESİL YÖNLENDİRME V2.0</span>
                  </div>
                  <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 tracking-tight leading-tight mt-1 mb-3">
                    YZ Ajanları ve Üst Düzey LLM'ler <br className="hidden sm:inline" />
                    için Tek Bir API
                  </h1>
                  <p className="text-sm text-slate-600 max-w-xl leading-relaxed mb-6">
                    Maliyetlerinizi düşürürken yanıt kalitesini üst düzeyde tutun! 
                    Akıllı Aspesl yönlendirme algoritmamız, isteklerinizi anlık olarak 
                    hız, maliyet ve kalite ağırlıklarınıza göre <strong className="font-semibold text-slate-850">Gemini-Pro</strong> veya <strong className="font-semibold text-slate-850">Gemini-Flash</strong> üzerine yönlendirir.
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2.5 mt-2">
                  <button 
                    onClick={() => {
                      alert("Tek Bir API entegrasyonu başarıyla aktif edildi. API Endpoint: 'https://api.yzlab.ai/v2/route' - Mevcut ağırlıklarınızı alt kısımdaki Quick Start panelinde simüle edebilirsiniz.");
                    }}
                    className="bg-blue-600 text-white hover:bg-blue-700 transition-all text-xs font-semibold px-4 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm"
                  >
                    <span>Tek Bir API</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => {
                      alert("Tek Ajan API aktif! Bu API, otonom bilimsel ajanlarımızın verileri doğrudan işlemesi ve raporlar oluşturması için sunulmuştur.");
                    }}
                    className="bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all text-xs font-semibold px-4 py-2 rounded-lg"
                  >
                    Tek Ajan API
                  </button>
                </div>
              </div>

              {/* Lab Activity / Realtime Feed & System Status Column */}
              <div className="space-y-6">
                
                {/* System Status Card (SİSTEM DURUMU) */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-mono tracking-wider font-bold text-slate-400 uppercase">SİSTEM DURUMU</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {isLoadingStateDemo ? (
                      <div className="flex items-center space-x-2 w-full">
                        <span className="text-xs text-slate-500 animate-pulse flex items-center">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 mr-2 animate-bounce"></span>
                          Kontrol ediliyor...
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1"></span>
                        <span className="text-xs font-medium text-slate-700">Tüm Servisler Çevrimiçi (%100)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lab Activity Component (LAB AKTİVİTESİ) */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[184px]">
                  <div>
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-2">
                      <span className="text-xs font-display font-semibold text-slate-800 tracking-tight">LAB AKTİVİTESİ</span>
                      <span className="text-[10px] bg-sky-50 text-sky-700 font-mono px-1.5 py-0.5 rounded tracking-wide font-medium flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mr-1 animate-pulse"></span>
                        Realtime Feed
                      </span>
                    </div>

                    <div className="space-y-2 overflow-y-auto max-h-[120px] pr-1">
                      {/* If Loading state demo is activated, show skeletons as requested */}
                      {isLoadingStateDemo ? (
                        <div className="space-y-2.5">
                          <div className="h-2.5 w-full bg-slate-200 rounded skeleton-shimmer"></div>
                          <div className="h-2.5 w-11/12 bg-slate-200 rounded skeleton-shimmer"></div>
                          <div className="h-2.5 w-10/12 bg-slate-200 rounded skeleton-shimmer"></div>
                          <div className="h-2.5 w-full bg-slate-200 rounded skeleton-shimmer"></div>
                        </div>
                      ) : (
                        logs.length === 0 ? (
                          <span className="text-xs text-slate-400 block text-center py-4">Kayıtlı işlem bulunamadı.</span>
                        ) : (
                          logs.slice(0, 3).map((log) => (
                            <div key={log.id} className="text-xs border-l-2 border-blue-500 pl-2 py-0.5 flex items-start justify-between">
                              <div className="flex flex-col truncate pr-2">
                                <span className="font-medium text-slate-700 truncate">{log.prompt}</span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {log.routedModel === "gemini-3.1-pro-preview" ? "Pro" : "Flash"} • {log.speedMs}ms
                                </span>
                              </div>
                              <span className="text-[9px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded font-semibold">
                                +${log.costEstimate.toFixed(5)}
                              </span>
                            </div>
                          ))
                        )
                      )}
                    </div>
                  </div>
                </div>

              </div>

            </div>

            {/* 4-Item Feature Row with clean outline borders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-display font-medium text-slate-900 text-xs">API for everything</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">
                    LLM yetenekleri, YZ ajanları ve otonom sistemleri tek bir çatıda birleştirir.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-display font-medium text-slate-900 text-xs">API'ta yönlendir</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">
                    Gelen her sorgunun içeriğini anlar ve optimal maliyet/hız oranıyla yönlendirir.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-display font-medium text-slate-900 text-xs text-nowrap">Veri ile besle</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">
                    Bilimsel veri formatlarını (CSV, JSON, TXT) doğrudan analiz edip yapay zekaya aktarın.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-display font-medium text-slate-900 text-xs">Teknoloji & Ölçek</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">
                    Binlerce paralel ajan ve yüksek eş zamanlı sorgu optimizasyonuyla tasarlanmıştır.
                  </p>
                </div>
              </div>

            </div>

            {/* Scientific Files list & Quickstart Interaction */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Scientific Data Files Table panel */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-display font-bold text-slate-900 text-sm">BİLİMSEL VERİ DOSYALARI</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Yüklenen lab verileri ve anlık AI özet analizleri</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab("files")}
                    className="text-xs text-blue-600 hover:text-blue-850 font-medium flex items-center space-x-1"
                  >
                    <span>Yönet</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  {isLoadingStateDemo ? (
                    // Skeleton representations matching exact user's picture details (shimmer style)
                    <div className="space-y-4 py-2">
                      <div className="grid grid-cols-5 gap-4">
                        <div className="h-3 bg-slate-200 rounded w-11/12"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                        <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                        <div className="h-3 bg-slate-200 rounded w-5/6"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                      </div>
                      <div className="h-[1px] bg-slate-100"></div>
                      <div className="grid grid-cols-5 gap-4">
                        <div className="h-3 bg-slate-200 rounded w-10/12"></div>
                        <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                        <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                        <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                      </div>
                      <div className="h-[1px] bg-slate-100"></div>
                      <div className="grid grid-cols-5 gap-4">
                        <div className="h-3 bg-slate-200 rounded w-full"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                        <div className="h-3 bg-slate-200 rounded w-5/6"></div>
                        <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                        <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                      </div>
                      <div className="h-[1px] bg-slate-100"></div>
                      <div className="grid grid-cols-5 gap-4">
                        <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                        <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                        <div className="h-3 bg-slate-200 rounded w-full"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                      </div>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-mono tracking-wider font-semibold">
                          <th className="pb-2">DOSYA ADI</th>
                          <th className="pb-2">TÜR</th>
                          <th className="pb-2">BOYUT</th>
                          <th className="pb-2 text-right">TARİH</th>
                          <th className="pb-2 text-right">İŞLEMLER</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {files.map((file) => (
                          <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2.5 font-medium truncate max-w-[140px]" title={file.name}>
                              <div className="flex items-center space-x-1.5">
                                <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                                <span className="truncate">{file.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 font-mono">
                              <span className="bg-slate-100 text-slate-700 font-semibold px-1.5 py-0.5 rounded text-[10px]">
                                {file.type}
                              </span>
                            </td>
                            <td className="py-2.5 font-mono text-slate-500">{file.size}</td>
                            <td className="py-2.5 text-right font-mono text-slate-500">{file.date}</td>
                            <td className="py-2.5 text-right">
                              <div className="flex items-center justify-end space-x-1">
                                <button 
                                  onClick={() => handleAnalyzeFile(file)}
                                  className="text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold px-2 py-1 rounded"
                                >
                                  Özet Çıkar
                                </button>
                                <button
                                  onClick={() => handleDeleteFile(file.id)}
                                  className="p-1 text-slate-300 hover:text-red-500 rounded transition-all"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Quick Start Card (With embedded code blocks & active prompt testing) */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-sm">Quick Start</h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                    Son adımda optimize edilen veri ajanlarını yönlendiren tek bir API ile kolay entegrasyon.
                  </p>

                  {/* Languages Selector */}
                  <div className="flex space-x-2 mt-3 mb-2.5 border-b border-slate-100 pb-1.5">
                    <button 
                      onClick={() => setCodeLanguage("nodejs")}
                      className={`text-xs pb-1 font-semibold border-b ${
                        codeLanguage === "nodejs" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      NodeJS
                    </button>
                    <button 
                      onClick={() => setCodeLanguage("python")}
                      className={`text-xs pb-1 font-semibold border-b ${
                        codeLanguage === "python" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      Python
                    </button>
                    <button 
                      onClick={() => setCodeLanguage("curl")}
                      className={`text-xs pb-1 font-semibold border-b ${
                        codeLanguage === "curl" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      cURL
                    </button>
                  </div>

                  {/* Code Block */}
                  <div className="relative bg-slate-950 rounded-lg p-3 text-[10px] font-mono text-slate-200 leading-normal max-h-36 overflow-y-auto mb-4 border border-slate-800">
                    <button 
                      onClick={() => handleCopyCode(getCodeSnippet())}
                      className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 p-1 rounded transition-all"
                      title="Kodu kopyala"
                    >
                      {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <pre className="whitespace-pre-wrap">{getCodeSnippet()}</pre>
                  </div>
                </div>

                {/* Intelligent Playground Router Simulator (Active only if Loading state demo is off) */}
                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3.5">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-mono text-blue-600 font-bold block">LAB PROMPT PLAYGROUND</span>
                    {isLoadingStateDemo && (
                      <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-medium">
                        Simülatör için 'Aktif Mod'u açın
                      </span>
                    )}
                  </div>
                  <form onSubmit={handleRouteQuery} className="flex gap-2">
                    <input 
                      type="text" 
                      value={promptInput}
                      onChange={(e) => setPromptInput(e.target.value)}
                      disabled={isLoadingStateDemo || isRoutingResponseLoading}
                      placeholder={isLoadingStateDemo ? "Simülatör pasif modda." : "Prompt girin..."}
                      className="flex-1 bg-white border border-slate-200 rounded-md py-1 px-2.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    <button 
                      type="submit"
                      disabled={isLoadingStateDemo || isRoutingResponseLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-200 disabled:text-slate-400 text-xs px-3 py-1.5 font-medium rounded-md transition-all flex items-center space-x-1"
                    >
                      {isRoutingResponseLoading ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 fill-white" />
                      )}
                      <span>Yönlendir</span>
                    </button>
                  </form>

                  {/* Dynamic response state displaying live routing logs */}
                  {lastRouteResult && !isLoadingStateDemo && (
                    <div className="mt-3 bg-white p-3 border border-slate-200 rounded-md text-xs space-y-2 max-h-44 overflow-y-auto shadow-inner">
                      <div className="flex flex-wrap justify-between items-center bg-blue-50/70 p-1.5 rounded text-[10px] gap-1">
                        <div className="flex items-center space-x-1">
                          <Cpu className="w-3.5 h-3.5 text-blue-600" />
                          <span className="font-semibold text-slate-800">Seçilen Model:</span>
                          <span className="font-mono bg-blue-100 text-blue-800 px-1 py-0.2 rounded font-semibold">{lastRouteResult.routedModel}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="font-mono text-slate-500 font-semibold">{lastRouteResult.speedMs}ms</span>
                          <span className="font-mono text-emerald-600 font-semibold">${lastRouteResult.costEstimate.toFixed(5)}</span>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 bg-slate-50 p-1 border border-slate-100 rounded leading-relaxed">
                        <strong className="text-slate-700">Yönlendirici Gerekçesi: </strong>{lastRouteResult.reasoning}
                      </div>
                      <div className="whitespace-pre-wrap text-slate-700 text-[11px] leading-relaxed border-t border-slate-100 pt-2 font-sans">
                        {lastRouteResult.responseText}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Quick Summary at bottom */}
            <div className="text-center pt-4 text-slate-400 text-[10px] font-mono">
              <p>Y2 Lab: Akıllı Blueprint (V2) • Geliştirilmiş Gemini Yönlendirme Modülü</p>
              <p className="mt-0.5">Y2 Lab: Nezi CiorRouter - Antal-ain tesn Blueprint</p>
            </div>

          </div>
        )}

        {/* DETAILED SCIENTIFIC DATA FILES TAB */}
        {activeTab === "files" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-display font-semibold text-slate-900">Bilimsel Veri Merkezi</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Laboratuvardaki CSV, JSON, TXT formatındaki veri matrislerini yükleyin ve yapay zeka ile otomatik grafik analizleri çalıştırın.
                </p>
              </div>
              <div className="mt-2 md:mt-0 flex space-x-2">
                <button 
                  onClick={() => {
                    const confirmReset = window.confirm("Varsayılan bilimsel verileri sıfırlamak istiyor musunuz?");
                    if (confirmReset) {
                      refreshData();
                    }
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs px-3 py-2 rounded-lg font-medium flex items-center space-x-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sıfırla</span>
                </button>
              </div>
            </div>

            {/* Files & Analysis interactive grid layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* File uploading & table controls (Left) */}
              <div className="lg:col-span-2 space-y-4">
                
                {/* Drag n Drop block */}
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    dragActive 
                      ? "border-blue-500 bg-blue-50/50" 
                      : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
                  }`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={fileSelected} 
                    accept=".csv,.json,.txt" 
                    className="hidden" 
                  />
                  <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <span className="text-slate-700 text-xs font-semibold block">Dökümanı Buraya Sürükleyin veya Tıklayın</span>
                  <span className="text-[10px] text-slate-400 mt-1 block">Yalnızca .CSV, .JSON, .TXT uzantıları (Maks. 5MB)</span>
                </div>

                {/* File list */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-mono tracking-wider font-semibold">
                        <th className="p-3">DOSYA ADI</th>
                        <th className="p-3">UZANTI</th>
                        <th className="p-3">BOYUT</th>
                        <th className="p-3">YÜKLEME TARİHİ</th>
                        <th className="p-3 text-right">EYLEM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {files.map((file) => (
                        <tr key={file.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-semibold">
                            <div className="flex items-center space-x-2">
                              <FileText className="w-4 h-4 text-blue-500" />
                              <span>{file.name}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="bg-blue-50 text-blue-700 font-mono border border-blue-100 px-2 py-0.5 rounded text-[10px]">
                              {file.type}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-slate-500">{file.size}</td>
                          <td className="p-3 text-slate-500 font-mono">{file.date}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button 
                                onClick={() => handleAnalyzeFile(file)}
                                className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-all ${
                                  selectedFileForAnalysis?.id === file.id
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                                }`}
                              >
                                Analiz Et
                              </button>
                              <button 
                                onClick={() => handleDeleteFile(file.id)}
                                className="p-1 text-slate-400 hover:text-red-500 rounded transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
              
              {/* Dynamic Analysis panel (Right) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-4">
                {selectedFileForAnalysis ? (
                  <div className="space-y-4">
                    <div className="border-b border-slate-200 pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs bg-blue-100 text-blue-800 font-mono font-semibold px-2 py-0.5 rounded">
                          {selectedFileForAnalysis.type}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {selectedFileForAnalysis.id}</span>
                      </div>
                      <h3 className="font-display font-bold text-slate-800 text-sm mt-1.5 truncate">{selectedFileForAnalysis.name}</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Toplam boyutu: {selectedFileForAnalysis.size} • Satır sayısı: {selectedFileForAnalysis.rowsCount}</p>
                    </div>

                    {/* Dynamic Line Chart of dataset attributes */}
                    <div>
                      <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase mb-2 block">Dinamik Trend Çizelgesi</span>
                      <div className="h-44 bg-white border border-slate-200 rounded-lg p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={selectedFileForAnalysis.data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey={selectedFileForAnalysis.columns[0]} stroke="#94a3b8" fontSize={9} />
                            <YAxis stroke="#94a3b8" fontSize={9} />
                            <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6 }} />
                            <Line 
                              type="monotone" 
                              dataKey={selectedFileForAnalysis.columns[1] || "Deger"} 
                              stroke="#2563eb" 
                              strokeWidth={2}
                              activeDot={{ r: 4 }} 
                            />
                            {selectedFileForAnalysis.columns[2] && (
                              <Line 
                                type="monotone" 
                                dataKey={selectedFileForAnalysis.columns[2]} 
                                stroke="#16a34a" 
                                strokeWidth={1.5} 
                              />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* AI Agent Report content */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase flex items-center space-x-1">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                        <span>AJAN ANALİZ RAPORU</span>
                      </span>
                      {isAiAnalysisLoading ? (
                        <div className="bg-white border border-slate-200 rounded-lg p-3 text-center py-6 space-y-2">
                          <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mx-auto" />
                          <span className="text-xs text-slate-500 block animate-pulse">Gemini verileri analiz ediyor...</span>
                        </div>
                      ) : (
                        <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs leading-relaxed text-slate-600 space-y-2 overflow-y-auto max-h-48 shadow-inner">
                          {aiAnalysisResult ? (
                            <p className="whitespace-pre-wrap">{aiAnalysisResult}</p>
                          ) : (
                            <span className="text-slate-400 text-xs italic block text-center py-4">"Özet Çıkar" butonuna basarak yapay zekayı tetikleyin.</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 space-y-3">
                    <FolderOpen className="w-10 h-10 text-slate-300 mx-auto" />
                    <span className="text-xs text-slate-400 block font-medium max-w-xs mx-auto">
                      Trend çizelgelerini görüntülemek ve akıllı raporlamayı tetiklemek için soldaki tablodan bir dosyanın "Analiz Et" seçeneğini seçin.
                    </span>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* DETAILED ACTIVITY TAB */}
        {activeTab === "activity" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-display font-semibold text-slate-900">Aktivite Akışı & Latency Performansı</h2>
              <p className="text-xs text-slate-500 mt-1">
                Yönlendirme işlem geçmişi, milisaniye bazında yanıt süreleri ve modeller arası yük dağılım katsayıları.
              </p>
            </div>

            {/* Statistics charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Latency History */}
              <div className="lg:col-span-2 border border-slate-200 rounded-xl p-4 bg-slate-50">
                <span className="text-[11px] font-mono font-semibold text-slate-400 tracking-wider mb-3 block">GECİKME GEÇMİŞİ (MILİSANİYE)</span>
                <div className="h-56 bg-white border border-slate-100 p-2 rounded-lg">
                  {logs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400 text-xs">Yeterli veri bulunmamaktadır.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getLatencyStatsData()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} />
                        <YAxis stroke="#94a3b8" fontSize={9} />
                        <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="Gecikme" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Gecikme (ms)" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Models Share Chart */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-mono font-semibold text-slate-400 tracking-wider mb-2 block">İŞLEM YÜKÜ MODEL DAĞILIMI</span>
                  <div className="h-44 flex items-center justify-center bg-white border border-slate-100 rounded-lg relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getModelStatsData()}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={65}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {getModelStatsData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center mt-[-4px]">
                      <span className="text-lg font-bold block text-slate-800 font-mono">{logs.length}</span>
                      <span className="text-[9px] text-slate-400 tracking-wider uppercase font-mono">Toplam</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 mt-3 border-t border-slate-100 pt-3">
                  {getModelStatsData().map((entry, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: entry.color }}></span>
                        <span className="text-slate-600">{entry.name}</span>
                      </div>
                      <span className="font-mono font-semibold text-slate-700">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Traces Audit console list */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-slate-950 font-mono">
              <div className="p-3 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-300 flex justify-between items-center whitespace-normal">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-emerald-500 animate-pulse" />
                  <span className="font-semibold text-slate-200">LAB SYSTEM ROUTING CORELINES</span>
                </div>
                <div className="flex space-x-3 text-slate-400">
                  <span>LATENCY: ~{logs.length > 0 ? Math.round(logs.reduce((acc,l)=>acc+l.speedMs, 0)/logs.length) : 0}ms</span>
                  <span>TOTAL ESTIMATE SAVED: $0.1420</span>
                </div>
              </div>

              <div className="p-2 space-y-3 max-h-96 overflow-y-auto text-xs text-slate-300 leading-relaxed">
                {logs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-900/60 rounded border border-slate-800 flex flex-col space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-1.5">
                      <div className="flex items-center space-x-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                        <span className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className="font-semibold text-slate-200 truncate max-w-xs">{log.prompt}</span>
                      </div>
                      <div className="flex items-center space-x-2.5 text-[10px]">
                        <span className="bg-slate-800 text-slate-200 px-1.5 py-0.2 rounded font-semibold text-[9px]">{log.routedModel}</span>
                        <span className="text-yellow-400 font-semibold">{log.speedMs}ms</span>
                        <span className="text-green-400 font-semibold">${log.costEstimate.toFixed(5)}</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 pl-3">
                      <strong className="text-slate-300">Karar Gerekçesi:</strong> {log.reasoning}
                    </div>
                    <div className="text-[11px] text-slate-200 pl-3 border-l border-slate-800 mt-1 whitespace-pre-wrap">
                      {log.responseText}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS VIEW */}
        {activeTab === "settings" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-display font-semibold text-slate-900">Uygulama ve Algoritma Ayarları</h2>
              <p className="text-xs text-slate-500 mt-1">
                İsteklerinizin Pro ve Flash modellerine nasıl yönlendirileceğinin ağırlıklarını dinamik olarak yönetin.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Sliders for Routing Weight Parameters */}
              <div className="space-y-6">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">YÖNLENDİRME METRİK AĞIRLIKLARI</span>
                
                {/* Speed Weight */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700">Hız Ağırlığı (Düşük Gecikme)</span>
                    <span className="font-mono bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded text-[11px]">{settings.speedWeight}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={settings.speedWeight}
                    onChange={(e) => handleUpdateSettings({ speedWeight: Number(e.target.value) })}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <span className="text-[10px] text-slate-400 block">Daha yüksek değerler, Flash modellerini her zaman tercih etmeye yönlendirir.</span>
                </div>

                {/* Quality Weight */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700">Yanıt Kalitesi & Derinlik Ağırlığı</span>
                    <span className="font-mono bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded text-[11px]">{settings.qualityWeight}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={settings.qualityWeight}
                    onChange={(e) => handleUpdateSettings({ qualityWeight: Number(e.target.value) })}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <span className="text-[10px] text-slate-400 block">Daha yüksek değerler, karmaşık akıl süzgeçlerinden geçirerek Pro versiyon modeller kurgular.</span>
                </div>

                {/* Cost Weight */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700">Tasarruf & Maliyet Optimizasyon Ağırlığı</span>
                    <span className="font-mono bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded text-[11px]">{settings.costWeight}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={settings.costWeight}
                    onChange={(e) => handleUpdateSettings({ costWeight: Number(e.target.value) })}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <span className="text-[10px] text-slate-400 block">Maliyet tasarrufu önceliği. Token boyut optimizasyonu sağlar.</span>
                </div>

                {/* Reset button weights */}
                <button
                  onClick={() => handleUpdateSettings({ speedWeight: 40, qualityWeight: 50, costWeight: 10 })}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  Varsayılan Ağırlıklara Dön
                </button>
              </div>

              {/* Static configurations / System status instructions */}
              <div className="space-y-5 bg-slate-50 border border-slate-200 rounded-xl p-5">
                <span className="text-xs font-mono font-semibold text-slate-400 tracking-wider block border-b border-slate-200 pb-1.5">LAB SİSTEM ENTEGRASYONU</span>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-750 block">Sistem Geri Çekilme (Fallback) Modeli</label>
                  <select 
                    value={settings.fallbackModel}
                    onChange={(e) => handleUpdateSettings({ fallbackModel: e.target.value })}
                    className="bg-white border border-slate-200 rounded-md py-1.5 px-3 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="gemini-3.5-flash">gemini-3.5-flash (Standard Entegeı)</option>
                    <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Gelişmiş Analitik)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-750 block">Yönlendirici Eğitmeni Sistem Talimatları</label>
                  <textarea 
                    rows={4}
                    value={settings.systemInstructions}
                    onChange={(e) => handleUpdateSettings({ systemInstructions: e.target.value })}
                    className="bg-white border border-slate-200 rounded-md py-1.5 px-3 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans leading-relaxed"
                  />
                  <span className="text-[10px] text-slate-400 block leading-normal">
                    AI Ajanının yönlendirme yaparken uymasını istediğiniz kural kümesi ve hedef persona tanımlaması.
                  </span>
                </div>

                {/* Information on Keys */}
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs flex items-start space-x-2">
                  <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-blue-800 leading-normal text-[11px]">
                    <span className="font-semibold block mb-0.5">Yapay Zeka Anahtar Entegrasyonu</span>
                    Biz uygulamamızı gelişmiş sunucu taraflı güvenli asistan mimarisiyle tasarladık. API anahtarlarınızı <strong>Settings &gt; Secrets</strong> panelinden eklediğinizde, YZ Lab algoritmalarınız gerçek zamanlı olarak çalışmaya başlayacaktır.
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

      </main>
      
    </div>
  );
}
