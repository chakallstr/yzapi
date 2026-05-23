import React, { useState, useEffect } from "react";
import {
  Home,
  FolderOpen,
  Activity,
  Search,
  Bell,
  ChevronDown,
  Copy,
  Check,
  Play,
  Cpu,
  ArrowRight,
  Zap,
  Layers,
  Sparkles,
  RefreshCw,
  Database,
  Terminal,
  Coins,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ModelEntry, RoutingLog, RouterSettings } from "./types";

const KUR = 45.698502;
const CARPAN = 3.0;

const MODEL_CATALOG: ModelEntry[] = [
  { id: "anthropic/claude-haiku-4.5",  name: "Claude Haiku 4.5",  provider: "Anthropic", context: "200K", type: "Metin",  inputUsd: 0.15,  outputUsd: 0.15  },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "Anthropic", context: "1M",   type: "Metin",  inputUsd: 0.255, outputUsd: 0.255 },
  { id: "anthropic/claude-opus-4.6",   name: "Claude Opus 4.6",   provider: "Anthropic", context: "1M",   type: "Metin",  inputUsd: 0.30,  outputUsd: 0.30  },
  { id: "anthropic/claude-opus-4.7",   name: "Claude Opus 4.7",   provider: "Anthropic", context: "1M",   type: "Metin",  inputUsd: 0.30,  outputUsd: 0.30  },
  { id: "openai/gpt-5.4-mini",         name: "GPT 5.4 Mini",      provider: "OpenAI",    context: "400K", type: "Metin",  inputUsd: 0.10,  outputUsd: 0.10  },
  { id: "openai/gpt-5.3-codex",        name: "GPT 5.3 Codex",     provider: "OpenAI",    context: "400K", type: "Metin",  inputUsd: 0.13,  outputUsd: 0.13  },
  { id: "openai/gpt-5.4",              name: "GPT 5.4",           provider: "OpenAI",    context: "1M",   type: "Metin",  inputUsd: 0.15,  outputUsd: 0.15  },
  { id: "openai/gpt-5.5",              name: "GPT 5.5",           provider: "OpenAI",    context: "1M",   type: "Metin",  inputUsd: 0.20,  outputUsd: 0.20  },
  { id: "openai/gpt-image-2",          name: "GPT Image 2",       provider: "OpenAI",    context: "272K", type: "Görsel", inputUsd: 0,     outputUsd: 0     },
];

const toTL = (usd: number) => (usd * CARPAN * KUR).toFixed(1);

export default function App() {
  const [activeTab, setActiveTab] = useState<"homepage" | "models" | "activity" | "pricing">("homepage");
  const [isLoadingStateDemo, setIsLoadingStateDemo] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [modelSearch, setModelSearch] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<ModelEntry | null>(null);

  const [settings, setSettings] = useState<RouterSettings>({
    speedWeight: 40,
    qualityWeight: 50,
    costWeight: 10,
    fallbackModel: "anthropic/claude-haiku-4.5",
    systemInstructions: "Gelen istekleri en uygun modele yönlendir. Metin için Haiku, karmaşık görevler için Opus veya Sonnet kullan.",
  });
  const [logs, setLogs] = useState<RoutingLog[]>([]);

  const [promptInput, setPromptInput] = useState<string>("Türkçe kısa bir hikaye yaz.");
  const [isRoutingResponseLoading, setIsRoutingResponseLoading] = useState<boolean>(false);
  const [lastRouteResult, setLastRouteResult] = useState<RoutingLog | null>(null);

  const [codeLanguage, setCodeLanguage] = useState<"nodejs" | "python" | "curl">("nodejs");
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const [notifications] = useState<Array<{ id: number; text: string; time: string }>>([
    { id: 1, text: "API bakiyeniz yüklendi: 50 TL", time: "5 dk önce" },
    { id: 2, text: "claude-haiku-4.5 isteği tamamlandı", time: "18 dk önce" },
    { id: 3, text: "Yeni model eklendi: GPT 5.5", time: "2 saat önce" },
  ]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState<boolean>(false);

  const refreshData = async () => {
    try {
      const settingsRes = await fetch("/api/settings");
      const settingsData = await settingsRes.json();
      setSettings(settingsData);
      const logsRes = await fetch("/api/logs");
      const logsData = await logsRes.json();
      setLogs(logsData);
    } catch (error) {
      console.error("Veri yüklenirken hata:", error);
    }
  };

  useEffect(() => { refreshData(); }, []);

  const handleUpdateSettings = async (updated: Partial<RouterSettings>) => {
    const newSettings = { ...settings, ...updated };
    setSettings(newSettings);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });
    } catch (e) {
      console.error("Ayarlar güncellenirken hata:", e);
    }
  };

  const handleRouteQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    setIsRoutingResponseLoading(true);
    setLastRouteResult(null);
    try {
      const response = await fetch("/api/route-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptInput }),
      });
      const data = await response.json();
      setLastRouteResult(data);
      refreshData();
    } catch (error) {
      console.error("Yönlendirme hatası:", error);
    } finally {
      setIsRoutingResponseLoading(false);
    }
  };

  const handleCopyCode = (text: string | undefined) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const getCodeSnippet = (): string => {
    switch (codeLanguage) {
      case "nodejs":
        return `// YZ API - OpenAI uyumlu tek endpoint
const response = await fetch('https://api.yzapi.store/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_YZAPI_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'anthropic/claude-haiku-4.5',
    messages: [{ role: 'user', content: 'Merhaba!' }]
  })
});
const result = await response.json();
console.log(result.choices[0].message.content);`;

      case "python":
        return `import requests

# YZ API - OpenAI uyumlu
url = "https://api.yzapi.store/v1/chat/completions"
payload = {
    "model": "anthropic/claude-haiku-4.5",
    "messages": [{"role": "user", "content": "Merhaba!"}]
}
headers = {
    "Authorization": "Bearer YOUR_YZAPI_KEY",
    "Content-Type": "application/json"
}
response = requests.post(url, json=payload, headers=headers)
print(response.json()["choices"][0]["message"]["content"])`;

      case "curl":
        return `curl -X POST https://api.yzapi.store/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_YZAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-haiku-4.5",
    "messages": [
      {"role": "user", "content": "Merhaba!"}
    ]
  }'`;
    }
  };

  const getModelStatsData = () => {
    const haikuCount  = logs.filter(l => l.routedModel.includes("haiku")).length;
    const opusCount   = logs.filter(l => l.routedModel.includes("opus")).length;
    const midCount    = logs.filter(l => l.routedModel.includes("sonnet") || l.routedModel.includes("gpt")).length;
    return [
      { name: "Haiku / Mini (Hızlı)",    value: haikuCount || 2, color: "#3b82f6" },
      { name: "Sonnet / GPT (Orta)",     value: midCount   || 1, color: "#10b981" },
      { name: "Opus / GPT-5.5 (Premium)",value: opusCount  || 1, color: "#8b5cf6" },
    ];
  };

  const getLatencyStatsData = () =>
    logs.slice(0, 6).reverse().map((log, index) => ({
      name: `İstek ${index + 1}`,
      Gecikme: log.speedMs,
    }));

  const filteredModels = MODEL_CATALOG.filter(
    (m) =>
      m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.provider.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.id.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen blueprint-grid text-slate-800 font-sans flex flex-col selection:bg-blue-100">

      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-4 py-2.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="bg-blue-600 rounded p-1.5 text-white flex items-center justify-center">
              <span className="font-display font-bold text-lg select-none">YZ</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="font-display font-semibold text-slate-900 tracking-tight">YZ API</span>
                <span className="text-slate-400 text-xs">/</span>
                <span className="text-xs text-slate-500 font-mono font-medium">
                  {isLoadingStateDemo ? "Demo Modu" : "Canlı Panel"}
                </span>
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-1">
            {(["homepage", "models", "activity", "pricing"] as const).map((tab) => {
              const labels = { homepage: "Ana Sayfa", models: "Modeller", activity: "Kullanım", pricing: "Fiyatlar" };
              const icons  = { homepage: <Home className="w-4 h-4" />, models: <FolderOpen className="w-4 h-4" />, activity: <Activity className="w-4 h-4" />, pricing: <Coins className="w-4 h-4" /> };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeTab === tab ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  {icons[tab]}
                  <span>{labels[tab]}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
            <button
              onClick={() => setIsLoadingStateDemo(true)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${isLoadingStateDemo ? "bg-slate-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              Demo Modu
            </button>
            <button
              onClick={() => setIsLoadingStateDemo(false)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!isLoadingStateDemo ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              Canlı Panel
            </button>
          </div>

          <div className="relative hidden lg:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Model ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-md py-1.5 pl-9 pr-4 text-xs w-56 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
            />
          </div>

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
                {notifications.map((n) => (
                  <div key={n.id} className="p-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex flex-col">
                    <span className="text-slate-700 text-xs">{n.text}</span>
                    <span className="text-slate-400 text-[10px] mt-0.5">{n.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
              U
            </div>
            <div className="hidden sm:flex flex-col items-start leading-none">
              <span className="text-xs font-medium text-slate-800">Geliştirici</span>
              <span className="text-[10px] text-slate-400">API Kullanıcısı</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">

        {/* ── HOMEPAGE ── */}
        {activeTab === "homepage" && (
          <div className="space-y-6">

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Hero */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10">
                  <Cpu className="w-32 h-32 text-blue-500" />
                </div>
                <div>
                  <div className="inline-flex items-center space-x-1 bg-blue-50 border border-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold tracking-wider uppercase mb-3">
                    <Sparkles className="w-3 h-3 text-blue-500 animate-spin" />
                    <span>TÜRK GELİŞTİRİCİLER İÇİN AI API PLATFORMU</span>
                  </div>
                  <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 tracking-tight leading-tight mt-1 mb-3">
                    33+ Model, Tek Endpoint,{" "}
                    <br className="hidden sm:inline" />
                    TL Kredi Sistemi
                  </h1>
                  <p className="text-sm text-slate-600 max-w-xl leading-relaxed mb-6">
                    TL bakiyenizi yükleyin,{" "}
                    <strong className="font-semibold text-slate-800">Anthropic</strong>,{" "}
                    <strong className="font-semibold text-slate-800">OpenAI</strong> ve{" "}
                    <strong className="font-semibold text-slate-800">Google</strong> modellerine tek bir OpenAI uyumlu
                    endpoint üzerinden erişin. Model bazlı token fiyatlandırması, şeffaf maliyet takibi.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5 mt-2">
                  <button
                    onClick={() => alert("API anahtarı almak için: https://yzapi.store/register")}
                    className="bg-blue-600 text-white hover:bg-blue-700 transition-all text-xs font-semibold px-4 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm"
                  >
                    <span>API Anahtarı Al</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setActiveTab("pricing")}
                    className="bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all text-xs font-semibold px-4 py-2 rounded-lg"
                  >
                    Fiyat Listesi
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {/* System status */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-mono tracking-wider font-bold text-slate-400 uppercase">SİSTEM DURUMU</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  </div>
                  {isLoadingStateDemo ? (
                    <span className="text-xs text-slate-500 animate-pulse flex items-center">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 mr-2 animate-bounce"></span>
                      Kontrol ediliyor...
                    </span>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1"></span>
                      <span className="text-xs font-medium text-slate-700">Tüm Servisler Çevrimiçi (%100)</span>
                    </div>
                  )}
                </div>

                {/* Activity feed */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[184px]">
                  <div>
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-2">
                      <span className="text-xs font-display font-semibold text-slate-800 tracking-tight">API AKTİVİTESİ</span>
                      <span className="text-[10px] bg-sky-50 text-sky-700 font-mono px-1.5 py-0.5 rounded tracking-wide font-medium flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mr-1 animate-pulse"></span>
                        Canlı Feed
                      </span>
                    </div>
                    <div className="space-y-2 overflow-y-auto max-h-[120px] pr-1">
                      {isLoadingStateDemo ? (
                        <div className="space-y-2.5">
                          <div className="h-2.5 w-full bg-slate-200 rounded skeleton-shimmer"></div>
                          <div className="h-2.5 w-11/12 bg-slate-200 rounded skeleton-shimmer"></div>
                          <div className="h-2.5 w-10/12 bg-slate-200 rounded skeleton-shimmer"></div>
                          <div className="h-2.5 w-full bg-slate-200 rounded skeleton-shimmer"></div>
                        </div>
                      ) : logs.length === 0 ? (
                        <span className="text-xs text-slate-400 block text-center py-4">Henüz istek yok.</span>
                      ) : (
                        logs.slice(0, 3).map((log) => (
                          <div key={log.id} className="text-xs border-l-2 border-blue-500 pl-2 py-0.5 flex items-start justify-between">
                            <div className="flex flex-col truncate pr-2">
                              <span className="font-medium text-slate-700 truncate">{log.prompt}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{log.routedModel} • {log.speedMs}ms</span>
                            </div>
                            <span className="text-[9px] font-mono text-emerald-600 bg-emerald-50 px-1.5 rounded font-semibold">
                              ₺{(log.costEstimate * KUR * CARPAN).toFixed(3)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="p-2 rounded-lg bg-teal-50 text-teal-600"><Terminal className="w-4 h-4" /></div>
                <div>
                  <h4 className="font-display font-medium text-slate-900 text-xs">Tek Endpoint</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">OpenAI uyumlu API ile 33+ modele tek adresten erişin. Mevcut kodunuzu değiştirmeyin.</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600"><Zap className="w-4 h-4" /></div>
                <div>
                  <h4 className="font-display font-medium text-slate-900 text-xs">33+ Model</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">Anthropic, OpenAI, Google, Qwen ve daha fazlası. Metin, görsel ve video modelleri.</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="p-2 rounded-lg bg-purple-50 text-purple-600"><Coins className="w-4 h-4" /></div>
                <div>
                  <h4 className="font-display font-medium text-slate-900 text-xs">TL Kredi Sistemi</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">TL bakiyenizi yükleyin, model bazlı token harcaması yapın. Kart veya havale ile ödeme.</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Layers className="w-4 h-4" /></div>
                <div>
                  <h4 className="font-display font-medium text-slate-900 text-xs">Token Bazlı Fiyat</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">Model bazlı 1M token fiyatlandırması. Ucuz modelde ucuz öde, premium modelde premium öde.</p>
                </div>
              </div>
            </div>

            {/* Mini catalog + Quick Start */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Mini model catalog */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-display font-bold text-slate-900 text-sm">MODEL KATALOĞU</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Öne çıkan modeller ve TL fiyatları (1M token)</p>
                  </div>
                  <button onClick={() => setActiveTab("models")} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-1">
                    <span>Tümü</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  {isLoadingStateDemo ? (
                    <div className="space-y-4 py-2">
                      {[...Array(4)].map((_, i) => (
                        <div key={i}>
                          <div className="grid grid-cols-5 gap-4">
                            {[11, 6, 9, 10, 6].map((w, j) => (
                              <div key={j} className={`h-3 bg-slate-200 rounded w-${w}/12`}></div>
                            ))}
                          </div>
                          {i < 3 && <div className="h-[1px] bg-slate-100 mt-4"></div>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-mono tracking-wider font-semibold">
                          <th className="pb-2">MODEL</th>
                          <th className="pb-2">SAĞLAYICI</th>
                          <th className="pb-2">CTX</th>
                          <th className="pb-2 text-right">₺/1M</th>
                          <th className="pb-2 text-right">TÜR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {MODEL_CATALOG.filter((m) => m.type === "Metin").slice(0, 5).map((model) => (
                          <tr key={model.id} className="hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => { setSelectedModel(model); setActiveTab("models"); }}>
                            <td className="py-2.5 font-medium truncate max-w-[130px]" title={model.name}>
                              <div className="flex items-center space-x-1.5">
                                <Cpu className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                                <span className="truncate">{model.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5">
                              <span className="bg-slate-100 text-slate-700 font-mono font-semibold px-1.5 py-0.5 rounded text-[10px]">{model.provider}</span>
                            </td>
                            <td className="py-2.5 font-mono text-slate-500">{model.context}</td>
                            <td className="py-2.5 text-right font-mono text-emerald-700 font-semibold">₺{toTL(model.inputUsd)}</td>
                            <td className="py-2.5 text-right">
                              <span className="text-[9px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{model.type}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Quick Start */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-sm">Quick Start</h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                    OpenAI uyumlu API ile dakikalar içinde entegre edin. Model adını değiştir, hazır.
                  </p>
                  <div className="flex space-x-2 mt-3 mb-2.5 border-b border-slate-100 pb-1.5">
                    {(["nodejs", "python", "curl"] as const).map((lang) => (
                      <button key={lang} onClick={() => setCodeLanguage(lang)}
                        className={`text-xs pb-1 font-semibold border-b ${codeLanguage === lang ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-700"}`}>
                        {lang === "nodejs" ? "NodeJS" : lang === "python" ? "Python" : "cURL"}
                      </button>
                    ))}
                  </div>
                  <div className="relative bg-slate-950 rounded-lg p-3 text-[10px] font-mono text-slate-200 leading-normal max-h-36 overflow-y-auto mb-4 border border-slate-800">
                    <button onClick={() => handleCopyCode(getCodeSnippet())}
                      className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 p-1 rounded transition-all" title="Kodu kopyala">
                      {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <pre className="whitespace-pre-wrap">{getCodeSnippet()}</pre>
                  </div>
                </div>

                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3.5">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-mono text-blue-600 font-bold block">API TEST PLAYGROUND</span>
                    {isLoadingStateDemo && (
                      <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-medium">
                        Test için 'Canlı Panel'i açın
                      </span>
                    )}
                  </div>
                  <form onSubmit={handleRouteQuery} className="flex gap-2">
                    <input
                      type="text"
                      value={promptInput}
                      onChange={(e) => setPromptInput(e.target.value)}
                      disabled={isLoadingStateDemo || isRoutingResponseLoading}
                      placeholder={isLoadingStateDemo ? "Demo modda." : "Prompt girin..."}
                      className="flex-1 bg-white border border-slate-200 rounded-md py-1 px-2.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    <button type="submit" disabled={isLoadingStateDemo || isRoutingResponseLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-200 disabled:text-slate-400 text-xs px-3 py-1.5 font-medium rounded-md transition-all flex items-center space-x-1">
                      {isRoutingResponseLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-white" />}
                      <span>Gönder</span>
                    </button>
                  </form>
                  {lastRouteResult && !isLoadingStateDemo && (
                    <div className="mt-3 bg-white p-3 border border-slate-200 rounded-md text-xs space-y-2 max-h-44 overflow-y-auto shadow-inner">
                      <div className="flex flex-wrap justify-between items-center bg-blue-50/70 p-1.5 rounded text-[10px] gap-1">
                        <div className="flex items-center space-x-1">
                          <Cpu className="w-3.5 h-3.5 text-blue-600" />
                          <span className="font-semibold text-slate-800">Model:</span>
                          <span className="font-mono bg-blue-100 text-blue-800 px-1 rounded font-semibold">{lastRouteResult.routedModel}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="font-mono text-slate-500 font-semibold">{lastRouteResult.speedMs}ms</span>
                          <span className="font-mono text-emerald-600 font-semibold">₺{(lastRouteResult.costEstimate * KUR * CARPAN).toFixed(4)}</span>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 bg-slate-50 p-1 border border-slate-100 rounded leading-relaxed">
                        <strong className="text-slate-700">Gerekçe: </strong>{lastRouteResult.reasoning}
                      </div>
                      <div className="whitespace-pre-wrap text-slate-700 text-[11px] leading-relaxed border-t border-slate-100 pt-2 font-sans">
                        {lastRouteResult.responseText}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="text-center pt-4 text-slate-400 text-[10px] font-mono">
              <p>YZ API: Türkiye'nin AI API Platformu • CloseRouter altyapısı üzerinde çalışır</p>
              <p className="mt-0.5">1 USD = ₺{KUR} • Satış çarpanı: {CARPAN}x • Fiyatlar 1M token başınadır</p>
            </div>
          </div>
        )}

        {/* ── MODELS TAB ── */}
        {activeTab === "models" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-display font-semibold text-slate-900">Model Kataloğu</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Anthropic, OpenAI ve Google modellerini TL kredi ile kullanın. 33+ model, tek endpoint.
                </p>
              </div>
              <div className="mt-2 md:mt-0">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    placeholder="Model veya sağlayıcı ara..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs w-52 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">

                {/* Endpoint info — same visual style as old drag-drop */}
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50/50">
                  <Database className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <span className="text-slate-700 text-xs font-semibold block">OpenAI Uyumlu Endpoint</span>
                  <code className="text-[10px] text-slate-600 mt-2 block bg-slate-100 rounded px-3 py-1.5 inline-block font-mono">
                    https://api.yzapi.store/v1/chat/completions
                  </code>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Mevcut OpenAI entegrasyonunuzda sadece <code className="font-mono">base_url</code> ve API anahtarını değiştirin.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-mono tracking-wider font-semibold">
                        <th className="p-3">MODEL</th>
                        <th className="p-3">SAĞLAYICI</th>
                        <th className="p-3">CONTEXT</th>
                        <th className="p-3">TÜR</th>
                        <th className="p-3 text-right">₺/1M TOKEN</th>
                        <th className="p-3 text-right">DETAY</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredModels.map((model) => (
                        <tr key={model.id}
                          className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${selectedModel?.id === model.id ? "bg-blue-50/30" : ""}`}
                          onClick={() => setSelectedModel(model)}>
                          <td className="p-3 font-semibold">
                            <div className="flex items-center space-x-2">
                              <Cpu className="w-4 h-4 text-blue-500" />
                              <span>{model.name}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="bg-blue-50 text-blue-700 font-mono border border-blue-100 px-2 py-0.5 rounded text-[10px]">{model.provider}</span>
                          </td>
                          <td className="p-3 font-mono text-slate-500">{model.context}</td>
                          <td className="p-3">
                            <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${
                              model.type === "Metin"  ? "bg-emerald-50 text-emerald-700" :
                              model.type === "Görsel" ? "bg-purple-50 text-purple-700"  :
                                                        "bg-orange-50 text-orange-700"
                            }`}>{model.type}</span>
                          </td>
                          <td className="p-3 text-right font-mono font-semibold text-emerald-700">
                            {model.inputUsd > 0 ? `₺${toTL(model.inputUsd)}` : "Özel fiyat"}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedModel(model); }}
                              className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-all ${
                                selectedModel?.id === model.id
                                  ? "bg-blue-600 text-white"
                                  : "bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                              }`}
                            >
                              İncele
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Model detail panel */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col space-y-4">
                {selectedModel ? (
                  <div className="space-y-4">
                    <div className="border-b border-slate-200 pb-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                          selectedModel.type === "Metin"  ? "bg-emerald-100 text-emerald-800" :
                          selectedModel.type === "Görsel" ? "bg-purple-100 text-purple-800"  :
                                                            "bg-orange-100 text-orange-800"
                        }`}>{selectedModel.type}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{selectedModel.provider}</span>
                      </div>
                      <h3 className="font-display font-bold text-slate-800 text-sm mt-1.5">{selectedModel.name}</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{selectedModel.id}</p>
                    </div>

                    {selectedModel.inputUsd > 0 ? (
                      <>
                        <div>
                          <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase mb-2 block">FİYAT BİLGİSİ</span>
                          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Maliyet (USD/1M)</span>
                              <span className="font-mono font-semibold text-slate-700">${selectedModel.inputUsd}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Satış (USD/1M)</span>
                              <span className="font-mono font-semibold text-slate-700">${(selectedModel.inputUsd * CARPAN).toFixed(3)}</span>
                            </div>
                            <div className="h-[1px] bg-slate-100"></div>
                            <div className="flex justify-between">
                              <span className="text-slate-700 font-semibold">Fiyat (₺/1M)</span>
                              <span className="font-mono font-bold text-emerald-700 text-sm">₺{toTL(selectedModel.inputUsd)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px]">
                          <span className="font-semibold text-blue-800 block mb-1">Örnek Maliyet</span>
                          <div className="space-y-1 text-blue-700">
                            <div className="flex justify-between">
                              <span>10K token</span>
                              <span className="font-mono font-semibold">₺{(parseFloat(toTL(selectedModel.inputUsd)) * 0.01).toFixed(3)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>100K token</span>
                              <span className="font-mono font-semibold">₺{(parseFloat(toTL(selectedModel.inputUsd)) * 0.1).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs text-slate-500 text-center">
                        Bu model için iletişime geçin.
                      </div>
                    )}

                    <div>
                      <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase mb-2 block">MODEL BİLGİSİ</span>
                      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Context Penceresi</span>
                          <span className="font-mono font-semibold text-slate-700">{selectedModel.context}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Endpoint</span>
                          <span className="font-mono text-[10px] text-blue-700">/v1/chat/completions</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Faturalama</span>
                          <span className="font-mono font-semibold text-slate-700">Token bazlı</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 space-y-3">
                    <Cpu className="w-10 h-10 text-slate-300 mx-auto" />
                    <span className="text-xs text-slate-400 block font-medium max-w-xs mx-auto">
                      Fiyat detaylarını ve örnek maliyetleri görmek için soldaki tablodan bir model seçin.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {activeTab === "activity" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-display font-semibold text-slate-900">API Kullanım Geçmişi</h2>
              <p className="text-xs text-slate-500 mt-1">
                İstek geçmişi, milisaniye bazında yanıt süreleri ve modeller arası kullanım dağılımı.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 border border-slate-200 rounded-xl p-4 bg-slate-50">
                <span className="text-[11px] font-mono font-semibold text-slate-400 tracking-wider mb-3 block">YANIT SÜRESİ GEÇMİŞİ (MİLİSANİYE)</span>
                <div className="h-56 bg-white border border-slate-100 p-2 rounded-lg">
                  {logs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400 text-xs">Henüz veri yok. Playground'dan bir istek gönderin.</div>
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

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-mono font-semibold text-slate-400 tracking-wider mb-2 block">MODEL KULLANIM DAĞILIMI</span>
                  <div className="h-44 flex items-center justify-center bg-white border border-slate-100 rounded-lg relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={getModelStatsData()} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={5} dataKey="value">
                          {getModelStatsData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center">
                      <span className="text-lg font-bold block text-slate-800 font-mono">{logs.length}</span>
                      <span className="text-[9px] text-slate-400 tracking-wider uppercase font-mono">İstek</span>
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

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-slate-950 font-mono">
              <div className="p-3 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-300 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-emerald-500 animate-pulse" />
                  <span className="font-semibold text-slate-200">YZ API REQUEST LOGS</span>
                </div>
                <div className="flex space-x-3 text-slate-400">
                  <span>AVG: ~{logs.length > 0 ? Math.round(logs.reduce((a, l) => a + l.speedMs, 0) / logs.length) : 0}ms</span>
                  <span>FALLBACK: {settings.fallbackModel}</span>
                </div>
              </div>
              <div className="p-2 space-y-3 max-h-96 overflow-y-auto text-xs text-slate-300 leading-relaxed">
                {logs.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs">Henüz istek yok. Playground'dan bir istek gönderin.</div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="p-3 bg-slate-900/60 rounded border border-slate-800 flex flex-col space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-1.5">
                        <div className="flex items-center space-x-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${log.status === "success" ? "bg-emerald-500" : "bg-red-500"}`}></span>
                          <span className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          <span className="font-semibold text-slate-200 truncate max-w-xs">{log.prompt}</span>
                        </div>
                        <div className="flex items-center space-x-2.5 text-[10px]">
                          <span className="bg-slate-800 text-slate-200 px-1.5 rounded font-semibold text-[9px]">{log.routedModel}</span>
                          <span className="text-yellow-400 font-semibold">{log.speedMs}ms</span>
                          <span className="text-green-400 font-semibold">₺{(log.costEstimate * KUR * CARPAN).toFixed(4)}</span>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 pl-3">
                        <strong className="text-slate-300">Gerekçe:</strong> {log.reasoning}
                      </div>
                      <div className="text-[11px] text-slate-200 pl-3 border-l border-slate-800 mt-1 whitespace-pre-wrap">
                        {log.responseText}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PRICING TAB ── */}
        {activeTab === "pricing" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-display font-semibold text-slate-900">Fiyatlandırma & API Ayarları</h2>
              <p className="text-xs text-slate-500 mt-1">
                Model bazlı TL fiyat listesi ve yönlendirme ağırlık ayarları. Kur: 1 USD = ₺{KUR} • Çarpan: {CARPAN}x
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              <div className="space-y-6">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">YÖNLENDİRME AĞIRLIK AYARLARI</span>

                {[
                  { key: "speedWeight" as const,   label: "Hız Önceliği (Haiku / Mini)",       hint: "Yüksek değer → ucuz ve hızlı modeller tercih edilir." },
                  { key: "qualityWeight" as const,  label: "Kalite Önceliği (Opus / Sonnet)",   hint: "Yüksek değer → karmaşık görevlerde premium modeller seçilir." },
                  { key: "costWeight" as const,     label: "Maliyet Optimizasyonu",             hint: "TL bakiye harcamasını minimize et." },
                ].map(({ key, label, hint }) => (
                  <div key={key} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-700">{label}</span>
                      <span className="font-mono bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded text-[11px]">{settings[key]}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={settings[key]}
                      onChange={(e) => handleUpdateSettings({ [key]: Number(e.target.value) })}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    <span className="text-[10px] text-slate-400 block">{hint}</span>
                  </div>
                ))}

                <button onClick={() => handleUpdateSettings({ speedWeight: 40, qualityWeight: 50, costWeight: 10 })}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                  Varsayılan Ağırlıklara Dön
                </button>

                <div className="border-t border-slate-100 pt-4">
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block mb-3">METİN MODEL FİYATLARI (₺/1M TOKEN)</span>
                  <div className="space-y-1.5">
                    {MODEL_CATALOG.filter((m) => m.type === "Metin" && m.inputUsd > 0).map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-slate-600 font-medium">{m.name}</span>
                          <span className="text-[9px] font-mono text-slate-400">{m.provider}</span>
                        </div>
                        <span className="font-mono font-semibold text-emerald-700">₺{toTL(m.inputUsd)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-5 bg-slate-50 border border-slate-200 rounded-xl p-5">
                <span className="text-xs font-mono font-semibold text-slate-400 tracking-wider block border-b border-slate-200 pb-1.5">API BAĞLANTI AYARLARI</span>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">Yedek (Fallback) Model</label>
                  <select value={settings.fallbackModel}
                    onChange={(e) => handleUpdateSettings({ fallbackModel: e.target.value })}
                    className="bg-white border border-slate-200 rounded-md py-1.5 px-3 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="anthropic/claude-haiku-4.5">claude-haiku-4.5 — Hızlı, Ekonomik</option>
                    <option value="anthropic/claude-sonnet-4.6">claude-sonnet-4.6 — Dengeli</option>
                    <option value="anthropic/claude-opus-4.7">claude-opus-4.7 — Premium</option>
                    <option value="openai/gpt-5.4-mini">gpt-5.4-mini — Çok Ekonomik</option>
                    <option value="openai/gpt-5.4">gpt-5.4 — Orta</option>
                    <option value="openai/gpt-5.5">gpt-5.5 — Gelişmiş</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">Sistem Talimatları</label>
                  <textarea rows={4} value={settings.systemInstructions}
                    onChange={(e) => handleUpdateSettings({ systemInstructions: e.target.value })}
                    className="bg-white border border-slate-200 rounded-md py-1.5 px-3 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans leading-relaxed" />
                  <span className="text-[10px] text-slate-400 block leading-normal">
                    Yönlendirici modelin hangi kriterlere göre model seçeceğini tanımlayın.
                  </span>
                </div>

                <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs flex items-start space-x-2">
                  <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-blue-800 leading-normal text-[11px]">
                    <span className="font-semibold block mb-0.5">TL Kredi Yükleme</span>
                    Bakiyenizi TL olarak yükleyin. Her istekte model fiyatına göre otomatik düşer.
                    Bakiye dolunca istek durur — sürpriz fatura yok.
                  </div>
                </div>

                <div className="bg-slate-100 border border-slate-200 p-3 rounded-lg text-[11px] space-y-1">
                  <span className="font-semibold text-slate-600 block">Fiyat Formülü</span>
                  <code className="text-slate-700 font-mono block">
                    Fiyat = CloseRouter_USD × {CARPAN} × {KUR} TL
                  </code>
                  <span className="text-slate-500">Gerçek token: 900K = 1M faturalama birimi</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
