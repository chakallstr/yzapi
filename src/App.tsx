import React, { useState, useEffect } from "react";
import {
  Home,
  FolderOpen,
  HelpCircle,
  FileText,
  Search,
  Bell,
  ChevronDown,
  Copy,
  Check,
  Cpu,
  ArrowRight,
  Zap,
  Layers,
  Sparkles,
  Database,
  Terminal,
  Coins,
  Activity,
  Settings,
  Users,
  BarChart3,
  DollarSign,
  Megaphone,
  Shield,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
  X,
  Key,
  ListChecks,
} from "lucide-react";
import { getInitialAppTab, type AppTab } from "./navigation";
import { RoutingLog, RouterSettings, AdminConfig, ModelOverride, UserEntry, BakiyeHareketi, SystemAnnouncement, ProviderDurumu, AuditLog } from "./types";

interface ComputedModel {
  id: string;
  name: string;
  provider: string;
  type: "Metin" | "Görsel" | "Video";
  context: string;
  endpoints: string[];
  providerInputUsd?: number;
  providerOutputUsd?: number;
  providerImageInputUsd?: number;
  providerImageOutputUsd?: number;
  providerPerSecond?: { default?: number; "480p"?: number; "720p"?: number; "1080p"?: number };
  computed: {
    unit: string;
    input?: { usd: number; tl: number };
    output?: { usd: number; tl: number };
    perResolution?: Record<string, { usd: number; tl: number } | undefined>;
  };
  enabled: boolean;
}

const SSS_DATA = [
  { q: "Bakiye kredi mi, istek mi?", a: "Bakiye istek değildir. Kullanıcı hesabına para yükler. API kullandıkça modelin input ve output token maliyeti bakiyeden düşer." },
  { q: "Neden günlük istek paketi yok?", a: "Çünkü her istek aynı maliyette değildir. Kısa bir istek çok ucuz olabilir, uzun context kullanan bir istek çok pahalı olabilir. İstek sayısı maliyet değildir." },
  { q: "Ucuz model kullanan daha az mı öder?", a: "Evet. Her model kendi fiyatından bakiyeden düşer. Claude Haiku kullanan, GPT-5.5 kullanandan çok daha az öder." },
  { q: "Input ve output ayrı mı hesaplanır?", a: "Evet. Input token ve output token ayrı fiyatlanır." },
  { q: "Video ve görsel var mı?", a: "Görsel modeller (GPT Image 2) katalogda yer alır. Video modelleri de kapsama dahildir. Fiyatlar çözünürlük ve süreye göre değişir." },
  { q: "Kalan bakiye görünür mü?", a: "Evet. Her istekten sonra kalan bakiye panelde görünür." },
  { q: "Admin panel olacak mı?", a: "Evet. Model aktifliği, kullanıcılar ve sistem ayarları ayrı yönetim ekranında takip edilecek." },
];

interface LiveEntry {
  id: number;
  model: string;
  context: string;
  tokens: number;
  ms: number;
}

interface KonsolResult {
  model: ComputedModel;
  amount: number;
  unit: string;
}

interface ReconciliationReport {
  generatedAt: string;
  status: "ok" | "drift";
  totals: {
    users: number;
    currentBalanceTL: number;
    ledgerBalanceTL: number;
    driftTL: number;
    creditsTL: number;
    debitsTL: number;
    usageRecordsTL: number;
    usageRecordCount: number;
    errorUsageCount: number;
    streamMissingUsageCount: number;
    upstreamErrorCount: number;
  };
  userDrifts: Array<{
    userId: string;
    email: string;
    currentBalanceTL: number;
    ledgerBalanceTL: number;
    driftTL: number;
  }>;
}

type PaymentMethodKey = "shopier" | "iban" | "crypto";

interface PaymentMethodInfo {
  enabled: boolean;
  reason?: string | null;
}

interface PaymentMethodsResponse {
  shopier: PaymentMethodInfo;
  iban: PaymentMethodInfo & { bankName?: string; ibanNumber?: string; owner?: string };
  cryptomus: PaymentMethodInfo;
  limits?: { minBakiyeTL: number; maxBakiyeTL: number };
  kur?: number;
  kdvRate?: number;
}

interface TopupQuote {
  amountUsd: number;
  kur: number;
  payableTL: number;
  creditTL: number;
  roundingTL: number;
}

const ADMIN_EMAIL = "cix.crazy666@gmail.com";

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(() =>
    getInitialAppTab(window.location.pathname, window.location.search, window.location.hash)
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [modelSearch, setModelSearch] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<ComputedModel | null>(null);

  const [settings, setSettings] = useState<RouterSettings>({
    speedWeight: 40,
    qualityWeight: 50,
    costWeight: 10,
    fallbackModel: "anthropic/claude-haiku-4.5",
    systemInstructions: "Gelen istekleri en uygun modele yönlendir. Metin için Haiku, karmaşık görevler için Opus veya Sonnet kullan.",
  });
  const [logs, setLogs] = useState<RoutingLog[]>([]);

  const [codeLanguage, setCodeLanguage] = useState<"nodejs" | "python" | "curl">("nodejs");
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const [openSss, setOpenSss] = useState<number | null>(null);

  const [konsolBakiye, setKonsolBakiye] = useState("100");
  const [konsolResults, setKonsolResults] = useState<KonsolResult[] | null>(null);

  const [liveActivity, setLiveActivity] = useState<LiveEntry[]>([]);

  const [notifications] = useState<Array<{ id: number; text: string; time: string }>>([
    { id: 1, text: "Bakiye yüklendi: 50 TL", time: "5 dk önce" },
    { id: 2, text: "claude-haiku-4.5 isteği tamamlandı: $0.0003", time: "18 dk önce" },
    { id: 3, text: "Yeni model: GPT 5.5 eklendi", time: "2 saat önce" },
  ]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState<boolean>(false);

  // Admin state
  const [adminSection, setAdminSection] = useState<"dashboard" | "kur" | "models" | "users" | "bakiye" | "duyurular" | "sistem" | "gelir" | "apikeys" | "planlar" | "pending-iban">("dashboard");
  const defaultAdminConfig = {
    kur: 47.084289,
    liveKur: 47.084289,
    kurSource: "manual",
    autoKurRefresh: false,
    kurRefreshIntervalDk: 60,
    lastKurRefresh: null,
    platformAdi: "YapayZekaLab",
    destekEmail: "destek@yapayzekalab.com",
    maxBakiyeTL: 50000,
    minBakiyeTL: 10,
    anomaliEsikTL: 500,
  } as AdminConfig;
  const [adminConfig, setAdminConfig] = useState<AdminConfig>(defaultAdminConfig);
  const [adminConfigDraft, setAdminConfigDraft] = useState<AdminConfig>(defaultAdminConfig);
  const [modelOverrides, setModelOverrides] = useState<ModelOverride[]>([]);
  const [adminUsers, setAdminUsers] = useState<UserEntry[]>([]);
  const [adminBakiyeHareketleri, setAdminBakiyeHareketleri] = useState<BakiyeHareketi[]>([]);
  const [adminAnnouncements, setAdminAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [providerDurumlari, setProviderDurumlari] = useState<ProviderDurumu[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null);
  const [activeAnnouncements, setActiveAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [adminDashboard, setAdminDashboard] = useState<any>(null);
  const [userSearch, setUserSearch] = useState("");
  const [selectedAdminUser, setSelectedAdminUser] = useState<UserEntry | null>(null);
  const [bakiyeForm, setBakiyeForm] = useState({ miktar: "", aciklama: "" });
  const [selectedAdminModel, setSelectedAdminModel] = useState<ComputedModel | null>(null);
  const [newAnnouncement, setNewAnnouncement] = useState({ mesaj: "", tip: "bilgi" as "bilgi" | "uyari" | "bakim" | "yenilik", baslangic: new Date().toISOString().split("T")[0], bitis: "" });
  const [adminAuditSubTab, setAdminAuditSubTab] = useState<"provider" | "audit" | "reconciliation">("provider");
  const [dismissedAnnouncement, setDismissedAnnouncement] = useState(false);

  // New state per spec H
  const [models, setModels] = useState<ComputedModel[]>([]);
  const [modelTypeFilter, setModelTypeFilter] = useState<"Tümü" | "Metin" | "Görsel" | "Video">("Tümü");
  const [adminModelTypeFilter, setAdminModelTypeFilter] = useState<"Metin" | "Görsel" | "Video">("Metin");
  const [selectedVideoResolution, setSelectedVideoResolution] = useState<Record<string, string>>({});
  const [kurHistoryData, setKurHistoryData] = useState<any[]>([]);
  const [plansData, setPlansData] = useState<any[]>([]);
  const [apiKeysData, setApiKeysData] = useState<any[]>([]);
  const [konsolMode, setKonsolMode] = useState<"Metin" | "Görsel" | "Video">("Metin");
  const [newApiKeyForm, setNewApiKeyForm] = useState({ userId: "", ad: "" });
  const [newAdminApiKeyResult, setNewAdminApiKeyResult] = useState<{ key: string; maskedKey?: string; userEmail?: string } | null>(null);

  // Auth state
  const [userInfo, setUserInfo] = useState<{ email: string; bakiyeTL: string } | null>(null);
  const [userAuthChecked, setUserAuthChecked] = useState(false);
  const isAdminUser = userInfo?.email.trim().toLowerCase() === ADMIN_EMAIL;

  // BakiyeYukle modal state
  const [showBakiyeModal, setShowBakiyeModal] = useState(false);
  const [bakiyeModalMiktar, setBakiyeModalMiktar] = useState("10");
  const [bakiyeModalStep, setBakiyeModalStep] = useState<"select" | "shopier" | "iban" | "crypto">("select");
  const [bakiyeModalLoading, setBakiyeModalLoading] = useState(false);
  const [bakiyeModalError, setBakiyeModalError] = useState("");
  const [bakiyeIbanResult, setBakiyeIbanResult] = useState<{ referansKodu: string; iban: { bankName: string; ibanNumber: string; owner: string }; paymentId: string; quote?: TopupQuote } | null>(null);
  const [bakiyeShopierForm, setBakiyeShopierForm] = useState<{ actionUrl: string; fields: Record<string, string> } | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodsResponse | null>(null);
  const [userPayments, setUserPayments] = useState<Array<{ id: string; metod: string; miktarTL: number; kdvTL: number; durum: string; olusturma: string; amountUsd?: number | null; payableTL?: number | null; creditTL?: number | null; kurAtPayment?: number | null; roundingTL?: number | null; idempotencyKey?: string | null }>>([]);
  const [copiedRef, setCopiedRef] = useState(false);

  // Admin pending IBAN state
  const [pendingIbanList, setPendingIbanList] = useState<any[]>([]);
  const [pendingIbanLoading, setPendingIbanLoading] = useState(false);

  // Read Google tokens from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const at = params.get("at");
    const rt = params.get("rt");
    if (at) {
      localStorage.setItem("userAccessToken", at);
      if (rt) localStorage.setItem("userRefreshToken", rt);
      // Clean URL
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
  }, []);

  // Load user info if user token present
  useEffect(() => {
    const token = localStorage.getItem("userAccessToken");
    if (!token) {
      setUserAuthChecked(true);
      return;
    }
    fetch("/api/user/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUserInfo({ email: data.email, bakiyeTL: data.bakiyeTL }); })
      .catch(() => {})
      .finally(() => setUserAuthChecked(true));
  }, []);

  // adminFetch: admin is the allowlisted signed-in Google user.
  const adminFetch = async (path: string, opts: RequestInit = {}): Promise<Response> => {
    const token = localStorage.getItem("userAccessToken");
    const headers = { ...(opts.headers as Record<string, string> || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const res = await fetch(path, { ...opts, headers });
    if (res.status === 401 || res.status === 403) {
      setActiveTab("homepage");
    }
    return res;
  };

  const handleAdminExit = () => {
    setActiveTab("homepage");
  };

  // Live activity feed
  useEffect(() => {
    const textModels = models.filter(m => m.type === "Metin" && m.enabled !== false);
    if (textModels.length === 0) return;
    const generate = () => {
      const m = textModels[Math.floor(Math.random() * textModels.length)];
      const tokens = Math.floor(Math.random() * 9500) + 200;
      const ms = Math.floor(Math.random() * 870) + 130;
      setLiveActivity(prev => [{ id: Date.now(), model: m.name, context: m.context, tokens, ms }, ...prev].slice(0, 5));
    };
    generate();
    const interval = setInterval(generate, 2200);
    return () => clearInterval(interval);
  }, [models]);

  const refreshData = async () => {
    try {
      const [settingsRes, logsRes, annRes, modelsRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/logs"),
        fetch("/api/announcements/active"),
        fetch("/api/models"),
      ]);
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
      if (annRes.ok) setActiveAnnouncements(await annRes.json());
      if (modelsRes.ok) setModels(await modelsRes.json());
    } catch (error) {
      console.error("Veri yüklenirken hata:", error);
    }
  };

  const loadAdminData = async () => {
    try {
      const [configRes, kurHistRes, usersRes, overridesRes, hareketRes, annRes, provRes, auditRes, dashRes, plansRes, keysRes, reconciliationRes] = await Promise.all([
        adminFetch("/api/admin/config"),
        adminFetch("/api/admin/kur-history"),
        adminFetch("/api/admin/users"),
        adminFetch("/api/admin/model-overrides"),
        adminFetch("/api/admin/bakiye-hareketleri"),
        adminFetch("/api/admin/announcements"),
        adminFetch("/api/admin/provider-durumu"),
        adminFetch("/api/admin/audit-logs"),
        adminFetch("/api/admin/dashboard"),
        adminFetch("/api/admin/plans"),
        adminFetch("/api/admin/api-keys"),
        adminFetch("/api/admin/reconciliation"),
      ]);
      if (configRes.ok) {
        const cfg: AdminConfig = await configRes.json();
        setAdminConfig(cfg);
        setAdminConfigDraft(cfg);
      }
      if (kurHistRes.ok) setKurHistoryData(await kurHistRes.json());
      if (usersRes.ok) setAdminUsers(await usersRes.json());
      if (overridesRes.ok) setModelOverrides(await overridesRes.json());
      if (hareketRes.ok) setAdminBakiyeHareketleri(await hareketRes.json());
      if (annRes.ok) setAdminAnnouncements(await annRes.json());
      if (provRes.ok) setProviderDurumlari(await provRes.json());
      if (auditRes.ok) setAuditLogs(await auditRes.json());
      if (dashRes.ok) setAdminDashboard(await dashRes.json());
      if (plansRes.ok) setPlansData(await plansRes.json());
      if (keysRes.ok) setApiKeysData(await keysRes.json());
      if (reconciliationRes.ok) setReconciliationReport(await reconciliationRes.json());
    } catch (e) {
      console.error("Admin data yüklenirken hata:", e);
    }
  };

  const downloadReconciliationExport = async () => {
    const res = await adminFetch("/api/admin/reconciliation/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reconciliation-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => { refreshData(); }, []);

  useEffect(() => {
    if (isAdminUser) {
      loadAdminData();
    } else if (userAuthChecked && activeTab === "admin") {
      setActiveTab("homepage");
    }
  }, [isAdminUser, activeTab, userAuthChecked]);

  // Load user's own payment history
  const loadUserPayments = async () => {
    const token = localStorage.getItem("userAccessToken");
    if (!token) return;
    try {
      const res = await fetch("/api/payments/me", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setUserPayments(await res.json());
    } catch {}
  };

  // Load pending IBAN list (admin)
  const loadPendingIban = async () => {
    setPendingIbanLoading(true);
    try {
      const res = await adminFetch("/api/payments/admin/pending-iban");
      if (res.ok) setPendingIbanList(await res.json());
    } catch {} finally { setPendingIbanLoading(false); }
  };

  // KDV calculation helper (mirrors server)
  const calcKdvPreview = (gross: number) => {
    const kdvRate = paymentMethods?.kdvRate ?? 0.20;
    const netTL = gross / (1 + kdvRate);
    const kdvTL = gross - netTL;
    return { gross, netTL: Math.round(netTL * 100) / 100, kdvTL: Math.round(kdvTL * 100) / 100 };
  };

  const buildTopupQuotePreview = (amountUsd: number): TopupQuote => {
    const kur = paymentMethods?.kur ?? adminConfig.kur;
    const creditTL = Math.round(amountUsd * kur * 10000) / 10000;
    const payableTL = Math.ceil(amountUsd * kur);
    return {
      amountUsd,
      kur,
      payableTL,
      creditTL,
      roundingTL: Math.round((payableTL - creditTL) * 10000) / 10000,
    };
  };

  const loadPaymentMethods = async () => {
    const token = localStorage.getItem("userAccessToken");
    if (!token) return;
    try {
      const res = await fetch("/api/payments/methods", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setPaymentMethods(await res.json());
    } catch {}
  };

  const paymentMethodKey = (metod: PaymentMethodKey): "shopier" | "iban" | "cryptomus" =>
    metod === "crypto" ? "cryptomus" : metod;

  const isPaymentMethodEnabled = (metod: PaymentMethodKey) =>
    Boolean(paymentMethods?.[paymentMethodKey(metod)]?.enabled);

  const getPaymentMethodReason = (metod: PaymentMethodKey) => {
    const method = paymentMethods?.[paymentMethodKey(metod)];
    return method?.enabled ? null : (method?.reason ?? "Ödeme yöntemi şu an kapalı");
  };

  const handleOpenBakiyeModal = () => {
    setBakiyeModalStep("select");
    setBakiyeModalError("");
    setBakiyeIbanResult(null);
    setBakiyeShopierForm(null);
    setBakiyeModalMiktar("10");
    setShowBakiyeModal(true);
    loadUserPayments();
    loadPaymentMethods();
  };

  const handleBakiyeMethodSelect = async (metod: "shopier" | "iban" | "crypto") => {
    if (!isPaymentMethodEnabled(metod)) {
      setBakiyeModalError(getPaymentMethodReason(metod) ?? "Ödeme yöntemi şu an kapalı");
      return;
    }
    const amountUsd = parseFloat(bakiyeModalMiktar);
    if (!amountUsd || amountUsd <= 0) { setBakiyeModalError("Geçerli bir USD tutarı girin."); return; }
    setBakiyeModalLoading(true);
    setBakiyeModalError("");
    const token = localStorage.getItem("userAccessToken");
    try {
      const res = await fetch(`/api/payments/${metod === "crypto" ? "crypto" : metod}/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amountUsd }),
      });
      const data = await res.json();
      if (!res.ok) { setBakiyeModalError(data.error ?? "Hata oluştu."); return; }
      if (metod === "iban") {
        setBakiyeIbanResult({ referansKodu: data.referansKodu, iban: data.iban, paymentId: data.paymentId, quote: data.quote });
        setBakiyeModalStep("iban");
      } else if (metod === "shopier") {
        setBakiyeShopierForm({ actionUrl: data.actionUrl, fields: data.fields });
        setBakiyeModalStep("shopier");
      } else {
        window.location.href = data.url;
      }
    } catch { setBakiyeModalError("Bağlantı hatası."); }
    finally { setBakiyeModalLoading(false); }
  };

  const submitShopierForm = () => {
    if (!bakiyeShopierForm) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = bakiyeShopierForm.actionUrl;
    for (const [k, v] of Object.entries(bakiyeShopierForm.fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = v;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  };

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

  const handleCopyCode = (text: string | undefined) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const computeTL = (usd: number) => (usd * adminConfig.kur).toFixed(1);
  const formatUsd = (usd: number) => usd < 0.1 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
  const formatUsdTl = (point?: { usd: number; tl: number }) => {
    if (!point) return <span className="text-slate-400">—</span>;
    return (
      <div className="flex flex-col items-end">
        <span className="font-mono font-semibold text-slate-800">{formatUsd(point.usd)}</span>
        <span className="text-[10px] text-slate-400 font-mono">₺{point.tl.toFixed(1)}</span>
      </div>
    );
  };

  const getModelPrimaryPrice = (model: ComputedModel) => {
    if (model.type === "Video") {
      const resKey = selectedVideoResolution[model.id] ?? Object.keys(model.computed.perResolution ?? {}).find(k => (model.computed.perResolution as any)?.[k]) ?? "default";
      return model.computed.perResolution?.[resKey];
    }
    return model.computed.input;
  };

  const getModelSecondaryPrice = (model: ComputedModel) => {
    if (model.type === "Video") return undefined;
    return model.computed.output;
  };

  const hesaplaKonsol = () => {
    const bakiye = parseFloat(konsolBakiye) || 0;
    if (bakiye <= 0) return;
    const enabledModels = models.filter(m => m.enabled !== false);
    if (konsolMode === "Metin") {
      const results: KonsolResult[] = enabledModels
        .filter(m => m.type === "Metin" && m.computed.input && m.computed.input.tl > 0)
        .map(m => ({ model: m, amount: bakiye / m.computed.input!.tl, unit: "M token" }))
        .sort((a, b) => b.amount - a.amount);
      setKonsolResults(results);
    } else if (konsolMode === "Görsel") {
      const results: KonsolResult[] = enabledModels
        .filter(m => m.type === "Görsel" && m.computed.input && m.computed.output)
        .map(m => {
          const total = (m.computed.input?.tl ?? 0) + (m.computed.output?.tl ?? 0);
          return { model: m, amount: total > 0 ? bakiye / total : 0, unit: "görsel" };
        })
        .filter(r => r.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      setKonsolResults(results);
    } else {
      const results: KonsolResult[] = enabledModels
        .filter(m => m.type === "Video" && m.computed.perResolution)
        .map(m => {
          const res = m.computed.perResolution!;
          const rate = res["720p"]?.tl ?? res["default"]?.tl ?? 0;
          return { model: m, amount: rate > 0 ? bakiye / rate : 0, unit: "sn 720p" };
        })
        .filter(r => r.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      setKonsolResults(results);
    }
  };

  const getRoutingDecision = () => {
    const { speedWeight, qualityWeight, costWeight } = settings;
    const max = Math.max(speedWeight, qualityWeight, costWeight);
    if (max === qualityWeight) return { label: "Opus / GPT 5.5", desc: "Kalite öncelikli — karmaşık görevler için premium modeller seçilir.", color: "purple" };
    if (max === costWeight)    return { label: "Haiku / GPT Mini", desc: "Maliyet öncelikli — her görev için en ucuz model seçilir.", color: "emerald" };
    return { label: "Haiku / Sonnet", desc: "Hız öncelikli — hızlı ve ekonomik modeller tercih edilir.", color: "blue" };
  };

  const getCodeSnippet = (): string => {
    switch (codeLanguage) {
      case "nodejs":
        return `// YapayZekaLab - OpenAI uyumlu tek endpoint
const response = await fetch('https://api.yapayzekalab.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
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

# YapayZekaLab - OpenAI uyumlu
url = "https://api.yapayzekalab.com/v1/chat/completions"
payload = {
    "model": "anthropic/claude-haiku-4.5",
    "messages": [{"role": "user", "content": "Merhaba!"}]
}
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
}
response = requests.post(url, json=payload, headers=headers)
print(response.json()["choices"][0]["message"]["content"])`;

      case "curl":
        return `curl -X POST https://api.yapayzekalab.com/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-haiku-4.5",
    "messages": [
      {"role": "user", "content": "Merhaba!"}
    ]
  }'`;
    }
  };

  const filteredModels = models
    .filter(m => m.enabled !== false)
    .filter(m => modelTypeFilter === "Tümü" || m.type === modelTypeFilter)
    .filter(
      (m) =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.provider.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearch.toLowerCase())
    );

  const routingDecision = getRoutingDecision();

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
                <span className="font-display font-semibold text-slate-900 tracking-tight">YapayZekaLab</span>
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-1">
            {(["homepage", "models", "sss", "api"] as const).map((tab) => {
              const labels = { homepage: "Ana Sayfa", models: "Modeller", sss: "SSS", api: "API" };
              const icons  = { homepage: <Home className="w-4 h-4" />, models: <FolderOpen className="w-4 h-4" />, sss: <HelpCircle className="w-4 h-4" />, api: <FileText className="w-4 h-4" /> };
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

          {userInfo ? (
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
              <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                {userInfo.email[0].toUpperCase()}
              </div>
              <div className="hidden sm:flex flex-col items-start leading-none">
                <span className="text-xs font-medium text-slate-800 truncate max-w-[120px]">{userInfo.email}</span>
                <span className="text-[10px] text-emerald-600 font-mono">₺{parseFloat(userInfo.bakiyeTL).toFixed(2)}</span>
              </div>
              {isAdminUser && (
                <button
                  onClick={() => setActiveTab("admin")}
                  className={`hidden sm:flex items-center space-x-1 text-[10px] font-medium rounded-md px-2.5 py-1.5 border transition-all ${
                    activeTab === "admin" ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </button>
              )}
              <button
                onClick={() => {
                  localStorage.removeItem("userAccessToken");
                  localStorage.removeItem("userRefreshToken");
                  setUserInfo(null);
                  if (activeTab === "admin") setActiveTab("homepage");
                }}
                className="text-[10px] text-slate-400 hover:text-slate-700 ml-1"
                title="Çıkış"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
              <button
                onClick={() => { window.location.href = "/api/auth/google"; }}
                className="flex items-center space-x-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-100 transition-all"
              >
                <span>Giriş Yap</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ANNOUNCEMENT BANNER */}
      {!dismissedAnnouncement && activeAnnouncements.length > 0 && (
        <div className={`px-4 py-2 text-xs flex items-center justify-between ${
          activeAnnouncements[0].tip === "uyari" ? "bg-amber-50 border-b border-amber-200 text-amber-800" :
          activeAnnouncements[0].tip === "bakim" ? "bg-red-50 border-b border-red-200 text-red-800" :
          activeAnnouncements[0].tip === "yenilik" ? "bg-emerald-50 border-b border-emerald-200 text-emerald-800" :
          "bg-blue-50 border-b border-blue-200 text-blue-800"
        }`}>
          <div className="flex items-center space-x-2">
            <Megaphone className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{activeAnnouncements[0].mesaj}</span>
          </div>
          <button onClick={() => setDismissedAnnouncement(true)} className="ml-4 p-0.5 rounded hover:bg-black/10 transition-colors flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
                    <span>MODEL MALİYETİNİ SAKLAMAYAN AI API</span>
                  </div>
                  <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 tracking-tight leading-tight mt-1 mb-3">
                    Kota yok. Gizli limit yok.
                    <br className="hidden sm:inline" />
                    Bakiye yükle, kullandığın kadar öde.
                  </h1>
                  <p className="text-sm text-slate-600 max-w-xl leading-relaxed mb-6">
                    YapayZekaLab, model maliyetini saklamayan AI API katmanı. Hangi modeli ne kadar input ve output token ile kullandıysan, bakiyenden sadece o kullanım düşer.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5 mt-2">
                  <button
                    onClick={() => { if (userInfo) { handleOpenBakiyeModal(); } else { window.location.href = "/api/auth/google"; } }}
                    className="bg-blue-600 text-white hover:bg-blue-700 transition-all text-xs font-semibold px-4 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm"
                  >
                    <span>Bakiye Yükle</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setActiveTab("models")}
                    className="bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all text-xs font-semibold px-4 py-2 rounded-lg"
                  >
                    Model Fiyatları
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* System status */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-mono tracking-wider font-bold text-slate-400 uppercase">SİSTEM DURUMU</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1"></span>
                    <span className="text-xs font-medium text-slate-700">Tüm Servisler Çevrimiçi (%100)</span>
                  </div>
                </div>

                {/* Live Activity feed */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between" style={{ minHeight: 200 }}>
                  <div>
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-2">
                      <span className="text-xs font-display font-semibold text-slate-800 tracking-tight">API AKTİVİTESİ</span>
                      <span className="text-[10px] bg-sky-50 text-sky-700 font-mono px-1.5 py-0.5 rounded tracking-wide font-medium flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mr-1 animate-pulse"></span>
                        Canlı Feed
                      </span>
                    </div>
                    <div className="space-y-2 overflow-y-auto max-h-[140px] pr-1">
                      {liveActivity.length === 0 ? (
                        <span className="text-xs text-slate-400 block text-center py-4">Bağlanıyor...</span>
                      ) : (
                        liveActivity.map((a) => (
                          <div key={a.id} className="text-xs border-l-2 border-blue-500 pl-2 py-0.5 flex items-start justify-between animate-fadeIn">
                            <div className="flex flex-col truncate pr-2">
                              <span className="font-medium text-slate-700 truncate">{a.model}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{a.context} ctx • {a.tokens.toLocaleString()} token • {a.ms}ms</span>
                            </div>
                            <span className="text-[9px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                              ✓
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
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">OpenAI uyumlu API ile tüm modellere tek adresten erişin. Mevcut kodunuzu değiştirmeyin.</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600"><Zap className="w-4 h-4" /></div>
                <div>
                  <h4 className="font-display font-medium text-slate-900 text-xs">Token Şeffaflığı</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">Her isteğin input ve output token maliyeti açık şekilde gösterilir. Gizli sınır, gizli maliyet yok.</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="p-2 rounded-lg bg-purple-50 text-purple-600"><Coins className="w-4 h-4" /></div>
                <div>
                  <h4 className="font-display font-medium text-slate-900 text-xs">Bakiye Modeli</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">Paket veya günlük kota yok. Bakiyenden sadece kullandığın kadar düşer.</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Layers className="w-4 h-4" /></div>
                <div>
                  <h4 className="font-display font-medium text-slate-900 text-xs">Çoklu Model</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">Ekonomik, kodlama ve premium modeller aynı bakiyeyle. Her model kendi fiyatından düşer.</p>
                </div>
              </div>
            </div>

            {/* Mini catalog + Maliyet Konsolu */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Mini model catalog */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-display font-bold text-slate-900 text-sm">MODEL KATALOĞU</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Öne çıkan modeller ve fiyatları (1M token)</p>
                  </div>
                  <button onClick={() => setActiveTab("models")} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-1">
                    <span>Tümü</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-mono tracking-wider font-semibold">
                        <th className="pb-2">MODEL</th>
                        <th className="pb-2">SAĞLAYICI</th>
                        <th className="pb-2">CTX</th>
                        <th className="pb-2 text-right">$/1M</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {models.filter(m => m.type === "Metin" && m.enabled !== false).slice(0, 5).map((model) => (
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
                          <td className="py-2.5 text-right">
                            {model.computed.input ? (
                              <>
                                <span className="font-mono font-semibold text-slate-800">${model.computed.input.usd.toFixed(3)}</span>
                                <span className="text-[10px] text-slate-400 font-mono ml-1">₺{model.computed.input.tl.toFixed(1)}</span>
                              </>
                            ) : <span className="text-slate-400 text-[11px]">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Maliyet Konsolu */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-sm">Maliyet Konsolu</h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                    Yükleyeceğin bakiyeyle hangi modelden ne kadar kullanım alabileceğini gör.
                  </p>

                  {/* Mode tabs */}
                  <div className="flex space-x-1 mt-3">
                    {(["Metin", "Görsel", "Video"] as const).map(mode => (
                      <button key={mode} onClick={() => { setKonsolMode(mode); setKonsolResults(null); }}
                        className={`text-[10px] font-mono px-2.5 py-1 rounded transition-all ${konsolMode === mode ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                        {mode}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 space-y-1">
                    <label className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider block">Bakiye (₺)</label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        value={konsolBakiye}
                        onChange={(e) => { setKonsolBakiye(e.target.value); setKonsolResults(null); }}
                        placeholder="100"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-md py-1.5 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={hesaplaKonsol}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-1.5 font-semibold rounded-md transition-all flex items-center space-x-1"
                      >
                        <Coins className="w-3 h-3" />
                        <span>Hesapla</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  {konsolResults ? (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider block">₺{konsolBakiye} İLE ALABİLECEĞİN</span>
                      {konsolResults.map((r) => (
                        <div key={r.model.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-xs">
                          <div className="flex items-center space-x-2">
                            <Cpu className="w-3 h-3 text-blue-400 flex-shrink-0" />
                            <span className="text-slate-700 font-medium">{r.model.name}</span>
                          </div>
                          <span className="font-mono font-bold text-emerald-700 text-xs flex-shrink-0">
                            {konsolMode === "Metin"
                              ? (r.amount >= 1 ? `${r.amount.toFixed(1)}M token` : `${(r.amount * 1000).toFixed(0)}K token`)
                              : konsolMode === "Görsel"
                              ? `${r.amount.toFixed(0)} görsel`
                              : `${r.amount.toFixed(0)} sn 720p`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-center">
                      <p className="text-[11px] text-slate-400">Bakiye girin ve "Hesapla"ya basın.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MODELS TAB ── */}
        {activeTab === "models" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-display font-semibold text-slate-900">Model Fiyatları</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Her model kendi input ve output fiyatından bakiyeden düşer.
                </p>
              </div>
              <div className="mt-2 md:mt-0 flex items-center space-x-2">
                {/* Type sub-tabs */}
                <div className="flex space-x-1">
                  {(["Tümü", "Metin", "Görsel", "Video"] as const).map(t => (
                    <button key={t} onClick={() => { setModelTypeFilter(t); setSelectedModel(null); }}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${modelTypeFilter === t ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    placeholder="Model veya sağlayıcı ara..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs w-44 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-mono tracking-wider font-semibold">
                        <th className="p-3">MODEL</th>
                        <th className="p-3">SAĞLAYICI</th>
                        <th className="p-3">TÜR</th>
                        <th className="p-3">CONTEXT</th>
                        <th className="p-3 text-right">FİYAT</th>
                        <th className="p-3 text-right">OUTPUT / YEDEK</th>
                        <th className="p-3 text-right">DETAY</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredModels.map((model) => {
                        const resKey = selectedVideoResolution[model.id] ?? Object.keys(model.computed.perResolution ?? {}).find(k => (model.computed.perResolution as any)?.[k]) ?? "default";
                        return (
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
                            <td className="p-3">
                              <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                                model.type === "Metin" ? "bg-emerald-100 text-emerald-800" :
                                model.type === "Görsel" ? "bg-purple-100 text-purple-800" :
                                "bg-orange-100 text-orange-800"
                              }`}>{model.type}</span>
                            </td>
                            <td className="p-3 font-mono text-slate-500">
                              {model.type === "Video" && Object.keys(model.computed.perResolution ?? {}).length > 1 ? (
                                <select
                                  value={resKey}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => setSelectedVideoResolution(prev => ({ ...prev, [model.id]: e.target.value }))}
                                  className="text-[10px] font-mono bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none"
                                >
                                  {Object.keys(model.computed.perResolution ?? {}).map(k => (
                                    <option key={k} value={k}>{k}</option>
                                  ))}
                                </select>
                              ) : model.context}
                            </td>
                            <td className="p-3 text-right">
                              {formatUsdTl(getModelPrimaryPrice(model))}
                            </td>
                            <td className="p-3 text-right">
                              {formatUsdTl(getModelSecondaryPrice(model))}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedModel(model); }}
                                className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-all ${
                                  selectedModel?.id === model.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                                }`}
                              >
                                İncele
                              </button>
                            </td>
                          </tr>
                        );
                      })}
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
                          selectedModel.type === "Metin" ? "bg-emerald-100 text-emerald-800" :
                          selectedModel.type === "Görsel" ? "bg-purple-100 text-purple-800" :
                          "bg-orange-100 text-orange-800"
                        }`}>{selectedModel.type}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{selectedModel.provider}</span>
                      </div>
                      <h3 className="font-display font-bold text-slate-800 text-sm mt-1.5">{selectedModel.name}</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{selectedModel.id}</p>
                    </div>

                    {selectedModel.type === "Metin" && selectedModel.computed.input && (
                      <>
                        <div>
                          <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase mb-2 block">FİYAT BİLGİSİ</span>
                          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Input ($/1M)</span>
                              <span className="font-mono font-bold text-slate-800">${selectedModel.computed.input.usd.toFixed(3)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Input (₺/1M)</span>
                              <span className="font-mono font-semibold text-emerald-700">₺{selectedModel.computed.input.tl.toFixed(2)}</span>
                            </div>
                            {selectedModel.computed.output && (
                              <>
                                <div className="h-[1px] bg-slate-100" />
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Output ($/1M)</span>
                                  <span className="font-mono font-bold text-slate-800">${selectedModel.computed.output.usd.toFixed(3)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Output (₺/1M)</span>
                                  <span className="font-mono font-semibold text-emerald-700">₺{selectedModel.computed.output.tl.toFixed(2)}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px]">
                          <span className="font-semibold text-blue-800 block mb-1">Örnek Maliyet</span>
                          <div className="space-y-1 text-blue-700">
                            <div className="flex justify-between"><span>10K token</span><span className="font-mono font-semibold">₺{(selectedModel.computed.input.tl * 0.01).toFixed(3)}</span></div>
                            <div className="flex justify-between"><span>100K token</span><span className="font-mono font-semibold">₺{(selectedModel.computed.input.tl * 0.1).toFixed(2)}</span></div>
                          </div>
                        </div>
                      </>
                    )}

                    {selectedModel.type === "Görsel" && (
                      <div>
                        <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase mb-2 block">FİYAT BİLGİSİ</span>
                        <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                          <div className="flex justify-between"><span className="text-slate-500">Input ($/img)</span><span className="font-mono font-bold text-slate-800">${selectedModel.computed.input?.usd.toFixed(4) ?? "—"}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Output ($/img)</span><span className="font-mono font-bold text-slate-800">${selectedModel.computed.output?.usd.toFixed(4) ?? "—"}</span></div>
                          <div className="h-[1px] bg-slate-100" />
                          <div className="flex justify-between"><span className="text-slate-500">Toplam (₺/img)</span>
                            <span className="font-mono font-semibold text-emerald-700">
                              ₺{((selectedModel.computed.input?.tl ?? 0) + (selectedModel.computed.output?.tl ?? 0)).toFixed(3)}
                            </span>
                          </div>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px] mt-3">
                          <span className="font-semibold text-blue-800 block mb-1">Örnek: 10 görsel</span>
                          <span className="font-mono text-blue-700">₺{(((selectedModel.computed.input?.tl ?? 0) + (selectedModel.computed.output?.tl ?? 0)) * 10).toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {selectedModel.type === "Video" && selectedModel.computed.perResolution && (
                      <div>
                        <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase mb-2 block">ÇÖZÜNÜRLÜK FİYATLARI</span>
                        <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                          {Object.entries(selectedModel.computed.perResolution).map(([res, data]) => {
                            const d = data as { usd: number; tl: number } | undefined;
                            if (!d) return null;
                            return (
                              <div key={res} className="flex justify-between">
                                <span className="text-slate-500 font-mono">{res}</span>
                                <span className="font-mono text-emerald-700">₺{d.tl.toFixed(4)}/sn</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px] mt-3">
                          <span className="font-semibold text-blue-800 block mb-1">8 sn 720p</span>
                          <span className="font-mono text-blue-700">
                            ₺{((selectedModel.computed.perResolution["720p"]?.tl ?? selectedModel.computed.perResolution["default"]?.tl ?? 0) * 8).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}

                    <div>
                      <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase mb-2 block">MODEL BİLGİSİ</span>
                      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Context</span>
                          <span className="font-mono font-semibold text-slate-700">{selectedModel.context}</span>
                        </div>
                        {selectedModel.endpoints.map(ep => (
                          <div key={ep} className="flex justify-between">
                            <span className="text-slate-500">Endpoint</span>
                            <span className="font-mono text-[10px] text-blue-700">{ep}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 space-y-3">
                    <Cpu className="w-10 h-10 text-slate-300 mx-auto" />
                    <span className="text-xs text-slate-400 block font-medium max-w-xs mx-auto">
                      Fiyat detaylarını görmek için soldaki tablodan bir model seçin.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── SSS TAB ── */}
        {activeTab === "sss" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-display font-semibold text-slate-900">Sık Sorulan Sorular</h2>
              <p className="text-xs text-slate-500 mt-1">
                Bakiye modeli, token fiyatlandırması ve API kullanımı hakkında merak edilenler.
              </p>
            </div>

            {/* Neden kota değil bakiye? — üst banner */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 border border-slate-200 rounded-xl p-5 bg-slate-50">
                <span className="text-[11px] font-mono font-semibold text-slate-400 tracking-wider mb-3 block">NEDEN KOTA DEĞİL BAKİYE?</span>
                <p className="text-sm text-slate-700 leading-relaxed">
                  Paket veya günlük istek kotası satmak yerine bakiye satılır. Kullanıcı tek bakiyeyle ekonomik, kodlama veya premium modeller arasında geçiş yapabilir. Her model kendi fiyatından bakiyeden düşer.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs">
                    <span className="font-semibold text-slate-700 block mb-1">❌ İstek Paketi</span>
                    <span className="text-slate-500">Her istek aynı maliyette değil. 500 token da 100K token da "1 istek" sayılırsa zarar riski taşır.</span>
                  </div>
                  <div className="bg-white border border-blue-100 rounded-lg p-3 text-xs">
                    <span className="font-semibold text-blue-700 block mb-1">✓ Bakiye Modeli</span>
                    <span className="text-slate-500">Bakiye modeli daha şeffaf ve güvenlidir. Kullandığın kadar ödersin.</span>
                  </div>
                </div>
              </div>

              {/* Güven kartları */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <span className="text-[11px] font-mono font-semibold text-slate-400 tracking-wider block">GÜVEN & LİMİTLER</span>
                {[
                  { title: "Usage Log", desc: "Her isteğin model, token, maliyet ve kalan bakiye bilgisi kayıt altına alınır." },
                  { title: "Bakiye Kontrolü", desc: "Yetersiz bakiye varsa pahalı istek başlamadan durur." },
                  { title: "Model Kontrolü", desc: "Model aktifliği ve fiyat bilgisi yönetim ekranından takip edilir." },
                  { title: "Provider Kontrolü", desc: "Model ve provider bazlı açma/kapama kontrolü sistemde mevcuttur." },
                ].map((k, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-start space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 flex-shrink-0"></span>
                    <div>
                      <span className="text-[11px] font-semibold text-slate-700 block">{k.title}</span>
                      <span className="text-[10px] text-slate-500">{k.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SSS accordion */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-3 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 font-mono font-semibold tracking-wider">
                SIK SORULAN SORULAR
              </div>
              <div className="divide-y divide-slate-100">
                {SSS_DATA.map((item, i) => (
                  <div key={i} className="bg-white">
                    <button
                      onClick={() => setOpenSss(openSss === i ? null : i)}
                      className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-sm font-medium text-slate-800">{item.q}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 ml-3 transition-transform ${openSss === i ? 'rotate-180' : ''}`} />
                    </button>
                    {openSss === i && (
                      <div className="px-5 pb-4 text-xs text-slate-600 leading-relaxed bg-slate-50/50 border-t border-slate-100">
                        {item.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── API TAB ── */}
        {activeTab === "api" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-display font-semibold text-slate-900">API Ayarları</h2>
              <p className="text-xs text-slate-500 mt-1">
                Model tercih ağırlıkları ve bağlantı ayarları.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              {[
                { title: "Giriş", desc: userInfo ? userInfo.email : "Google ile giriş" },
                { title: "Bakiye", desc: userInfo ? `₺${parseFloat(userInfo.bakiyeTL).toFixed(2)}` : "IBAN veya ödeme" },
                { title: "API Key", desc: "Tam değer bir kez gösterilir" },
                { title: "İlk İstek", desc: "cURL, Node veya Python" },
                { title: "Usage", desc: "Request id ve kalan bakiye" },
              ].map((item, i) => (
                <div key={item.title} className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-slate-400 font-semibold">ADIM {i + 1}</span>
                    <span className={`w-2 h-2 rounded-full ${i < (userInfo ? 2 : 1) ? "bg-emerald-500" : "bg-slate-300"}`}></span>
                  </div>
                  <div className="text-xs font-semibold text-slate-800">{item.title}</div>
                  <div className="text-[10px] text-slate-500 truncate">{item.desc}</div>
                </div>
              ))}
            </div>

            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-emerald-700 uppercase tracking-wider">Text API Beta</span>
                <p className="text-xs text-emerald-800 mt-1">
                  Metin endpointleri satışa hazır akıştır. Görsel ve video modeller canlı kullanım kanıtı tamamlanana kadar erken erişim olarak tutulur.
                </p>
              </div>
              <a href="/status" target="_blank" rel="noreferrer"
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-white border border-emerald-200 rounded-lg px-3 py-2 whitespace-nowrap">
                Status Aç
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              <div className="space-y-6">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">TEMEL AKIŞ</span>

                <div className="space-y-2 mb-4">
                  {[
                    "Bakiye yükle.",
                    "API key oluştur.",
                    "Model seç.",
                    "İstek gönder.",
                    "Usage bilgisiyle maliyet hesaplanır.",
                    "Kalan bakiye güncellenir.",
                  ].map((step, i) => (
                    <div key={i} className="flex items-center space-x-3 text-xs bg-slate-50 rounded-lg px-3 py-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>
                      <span className="text-slate-700">{step}</span>
                    </div>
                  ))}
                </div>

                <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">MODEL TERCİH AĞIRLIKLARI</span>

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

                {/* Live routing decision */}
                <div className={`border rounded-xl p-4 text-xs ${
                  routingDecision.color === "purple"  ? "bg-purple-50 border-purple-200"  :
                  routingDecision.color === "emerald" ? "bg-emerald-50 border-emerald-200" :
                                                        "bg-blue-50 border-blue-200"
                }`}>
                  <div className="flex items-center space-x-2 mb-1.5">
                    <Activity className={`w-3.5 h-3.5 ${
                      routingDecision.color === "purple"  ? "text-purple-600"  :
                      routingDecision.color === "emerald" ? "text-emerald-600" :
                                                            "text-blue-600"
                    }`} />
                    <span className={`font-mono font-bold text-[10px] uppercase tracking-wider ${
                      routingDecision.color === "purple"  ? "text-purple-700"  :
                      routingDecision.color === "emerald" ? "text-emerald-700" :
                                                            "text-blue-700"
                    }`}>TERCİH AĞININ KARARI</span>
                  </div>
                  <div className={`font-semibold text-sm mb-1 ${
                    routingDecision.color === "purple"  ? "text-purple-800"  :
                    routingDecision.color === "emerald" ? "text-emerald-800" :
                                                          "text-blue-800"
                  }`}>{routingDecision.label}</div>
                  <p className={`text-[11px] leading-relaxed ${
                    routingDecision.color === "purple"  ? "text-purple-700"  :
                    routingDecision.color === "emerald" ? "text-emerald-700" :
                                                          "text-blue-700"
                  }`}>{routingDecision.desc}</p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block mb-3">METİN MODEL FİYATLARI</span>
                  <div className="space-y-1.5">
                    {models.filter(m => m.type === "Metin" && m.enabled !== false && m.computed.input).map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-slate-600 font-medium">{m.name}</span>
                          <span className="text-[9px] font-mono text-slate-400">{m.provider}</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-semibold text-slate-800">${m.computed.input!.usd.toFixed(3)}</span>
                          <span className="text-[10px] text-slate-400 font-mono">₺{m.computed.input!.tl.toFixed(1)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-5 bg-slate-50 border border-slate-200 rounded-xl p-5">
                <span className="text-xs font-mono font-semibold text-slate-400 tracking-wider block border-b border-slate-200 pb-1.5">API BAĞLANTI BİLGİSİ</span>

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
                    <span className="font-semibold block mb-1">Örnek İstek</span>
                    <code className="font-mono text-[10px] block bg-blue-100 rounded p-2 whitespace-pre-wrap">{"POST /v1/chat/completions\nAuthorization: Bearer YOUR_API_KEY\n{\"model\": \"anthropic/claude-haiku-4.5\"}"}</code>
                  </div>
                </div>

                {/* Code snippet */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-1.5">
                    {(["nodejs", "python", "curl"] as const).map((lang) => (
                      <button key={lang} onClick={() => setCodeLanguage(lang)}
                        className={`text-[10px] font-mono px-2.5 py-1 rounded transition-all ${codeLanguage === lang ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                        {lang}
                      </button>
                    ))}
                    <button onClick={() => handleCopyCode(getCodeSnippet())}
                      className="ml-auto flex items-center space-x-1 text-[10px] text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 transition-all">
                      {copiedCode ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCode ? "Kopyalandı" : "Kopyala"}</span>
                    </button>
                  </div>
                  <pre className="bg-slate-800 text-slate-100 rounded-lg p-3 text-[10px] font-mono overflow-x-auto leading-relaxed">
                    {getCodeSnippet()}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ADMIN TAB ── */}
        {activeTab === "admin" && isAdminUser && (
          <div className="flex gap-4" style={{ minHeight: "calc(100vh - 180px)" }}>

            {/* Sidebar */}
            <div className="w-44 flex-shrink-0 bg-slate-900 rounded-xl p-2 self-start sticky top-20">
              <div className="px-2 py-2 mb-1 flex items-center justify-between">
                <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">YZ Admin</span>
                <button onClick={handleAdminExit} title="Kapat" className="text-slate-500 hover:text-white transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
              {([
                { key: "dashboard",  icon: <BarChart3 className="w-3.5 h-3.5" />,  label: "Gösterge" },
                { key: "kur",        icon: <DollarSign className="w-3.5 h-3.5" />, label: "Sistem" },
                { key: "models",     icon: <Cpu className="w-3.5 h-3.5" />,        label: "Modeller" },
                { key: "users",      icon: <Users className="w-3.5 h-3.5" />,      label: "Kullanıcılar" },
                { key: "bakiye",     icon: <Coins className="w-3.5 h-3.5" />,      label: "Bakiye" },
                { key: "duyurular",  icon: <Megaphone className="w-3.5 h-3.5" />,  label: "Duyurular" },
                { key: "sistem",     icon: <Shield className="w-3.5 h-3.5" />,     label: "Sistem & Audit" },
                { key: "gelir",      icon: <BarChart3 className="w-3.5 h-3.5" />,  label: "Gelir Analizi" },
                { key: "apikeys",    icon: <Key className="w-3.5 h-3.5" />,        label: "API Keys" },
                { key: "planlar",    icon: <ListChecks className="w-3.5 h-3.5" />, label: "Planlar" },
                { key: "pending-iban", icon: <Database className="w-3.5 h-3.5" />, label: "Havaleler" },
              ] as { key: typeof adminSection; icon: React.ReactNode; label: string }[]).map(({ key, icon, label }) => (
                <button
                  key={key}
                  onClick={() => { setAdminSection(key); if (key === "pending-iban") loadPendingIban(); }}
                  className={`w-full flex items-center space-x-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all mb-0.5 text-left ${
                    adminSection === key
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-4">

              {/* ─ DASHBOARD ─ */}
              {adminSection === "dashboard" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-display font-bold text-slate-900">Gösterge Paneli</h2>
                    <button onClick={loadAdminData} className="flex items-center space-x-1.5 text-xs text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg transition-all">
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Yenile</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: "Toplam Kullanıcı", value: adminDashboard?.toplamKullanici ?? adminUsers.length, color: "blue" },
                      { label: "Toplam Bakiye", value: adminDashboard ? `₺${adminDashboard.toplamBakiyeTL.toFixed(0)}` : "—", color: "emerald" },
                      { label: "Toplam İstek", value: adminDashboard?.toplamIstek?.toLocaleString() ?? "—", color: "purple" },
                      { label: "Mutabakat", value: reconciliationReport ? (reconciliationReport.status === "ok" ? "OK" : "Fark Var") : "—", color: reconciliationReport?.status === "drift" ? "red" : "amber" },
                    ].map((s, i) => (
                      <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">{s.label}</span>
                        <span className={`text-2xl font-display font-bold ${s.color === "blue" ? "text-blue-700" : s.color === "emerald" ? "text-emerald-700" : s.color === "purple" ? "text-purple-700" : s.color === "red" ? "text-red-600" : "text-amber-700"}`}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block mb-3">Provider Durumu</span>
                    <div className="space-y-2">
                      {(adminDashboard?.providerDurumlari ?? providerDurumlari).map((p: ProviderDurumu) => (
                        <div key={p.provider} className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700 w-24">{p.provider}</span>
                          <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${p.durum === "aktif" ? "bg-emerald-50 text-emerald-700" : p.durum === "yavas" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{p.durum}</span>
                          <span className="font-mono text-slate-400">{p.gecikmeMs}ms</span>
                          <span className="text-slate-400 text-[10px] truncate max-w-[160px]">{p.not}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block mb-3">Son İşlemler</span>
                    {(adminDashboard?.sonAuditLogs ?? auditLogs.slice(0, 5)).length === 0 ? (
                      <span className="text-xs text-slate-400">Henüz işlem yok.</span>
                    ) : (
                      <div className="space-y-1.5">
                        {(adminDashboard?.sonAuditLogs ?? auditLogs.slice(0, 5)).map((l: AuditLog) => (
                          <div key={l.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2">
                            <span className="font-mono text-slate-500 text-[10px] w-36 truncate">{new Date(l.timestamp).toLocaleString("tr-TR")}</span>
                            <span className="font-medium text-slate-700 flex-1 px-3 truncate">{l.ozet}</span>
                            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[120px]">{l.hedef}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─ SİSTEM AYARLARI ─ */}
              {adminSection === "kur" && (
                <div className="space-y-4">
                  <h2 className="text-lg font-display font-bold text-slate-900">Sistem Ayarları</h2>

                  {/* Top: Live KUR card */}
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex items-center space-x-6">
                        <div>
                          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">Canlı USD/TRY</div>
                          <div className="text-3xl font-display font-bold text-white">{adminConfig.liveKur?.toFixed(2) ?? "—"} ₺</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">Güncel Kur</div>
                          <div className="text-2xl font-display font-bold text-emerald-400">{adminConfig.kur?.toFixed(2) ?? "—"} ₺</div>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          <div>{adminConfig.kurSource ?? "manual"}</div>
                          <div>{adminConfig.lastKurRefresh ? new Date(adminConfig.lastKurRefresh).toLocaleString("tr-TR") : "—"}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 flex-wrap gap-2">
                        <button onClick={async () => {
                          await adminFetch("/api/admin/refresh-kur", { method: "POST" });
                          await refreshData();
                          await loadAdminData();
                        }} className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all">
                          <RefreshCw className="w-3.5 h-3.5" /><span>Şimdi Yenile</span>
                        </button>
                        <label className="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer">
                          <input type="checkbox" checked={!!adminConfigDraft.autoKurRefresh}
                            onChange={async (e) => {
                              const val = e.target.checked;
                              setAdminConfigDraft(p => ({ ...p, autoKurRefresh: val }));
                              await adminFetch("/api/admin/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoKurRefresh: val }) });
                            }} className="rounded" />
                          <span>Otomatik Yenile</span>
                        </label>
                        <div className="flex items-center space-x-1 text-xs text-slate-300">
                          <span>Her</span>
                          <input type="number" min="1" value={adminConfigDraft.kurRefreshIntervalDk ?? 60}
                            onChange={async (e) => {
                              const val = parseInt(e.target.value) || 60;
                              setAdminConfigDraft(p => ({ ...p, kurRefreshIntervalDk: val }));
                              await adminFetch("/api/admin/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kurRefreshIntervalDk: val }) });
                            }}
                            className="w-14 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none" />
                          <span>dk</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Two-column: form + preview */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: config form */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                      <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">Platform Ayarları</span>
                      {([
                        { key: "platformAdi",     label: "Platform Adı",            type: "text",   step: undefined, get: (v: AdminConfig) => String(v.platformAdi ?? ""), set: (s: string) => ({ platformAdi: s }) },
                        { key: "destekEmail",     label: "Destek E-posta",          type: "email",  step: undefined, get: (v: AdminConfig) => String(v.destekEmail ?? ""), set: (s: string) => ({ destekEmail: s }) },
                        { key: "maxBakiyeTL",     label: "Maks Bakiye (₺)",         type: "number", step: "1",    get: (v: AdminConfig) => String(v.maxBakiyeTL ?? ""), set: (s: string) => ({ maxBakiyeTL: parseFloat(s) || 0 }) },
                        { key: "minBakiyeTL",     label: "Min Yükleme (₺)",         type: "number", step: "1",    get: (v: AdminConfig) => String(v.minBakiyeTL ?? ""), set: (s: string) => ({ minBakiyeTL: parseFloat(s) || 0 }) },
                        { key: "anomaliEsikTL",   label: "Anomali Eşiği (₺/60dk)", type: "number", step: "1",    get: (v: AdminConfig) => String(v.anomaliEsikTL ?? ""), set: (s: string) => ({ anomaliEsikTL: parseFloat(s) || 0 }) },
                      ] as { key: string; label: string; type: string; step?: string; get: (v: AdminConfig) => string; set: (s: string) => Partial<AdminConfig> }[]).map(({ key, label, type, step, get, set }) => (
                        <div key={key} className="space-y-1">
                          <label className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider block">{label}</label>
                          <input type={type} step={step} value={get(adminConfigDraft)}
                            onChange={(e) => setAdminConfigDraft(prev => ({ ...prev, ...set(e.target.value) }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-md py-1.5 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                      ))}
                      <button onClick={async () => {
                        const visibleConfig = {
                          platformAdi: adminConfigDraft.platformAdi,
                          destekEmail: adminConfigDraft.destekEmail,
                          maxBakiyeTL: adminConfigDraft.maxBakiyeTL,
                          minBakiyeTL: adminConfigDraft.minBakiyeTL,
                          anomaliEsikTL: adminConfigDraft.anomaliEsikTL,
                        };
                        await adminFetch("/api/admin/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(visibleConfig) });
                        setAdminConfig(adminConfigDraft);
                        await refreshData();
                        await loadAdminData();
                      }} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition-all">
                        Kaydet
                      </button>
                    </div>

                    {/* Right: live prices from backend */}
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-sm">
                      <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block mb-3">Canlı Fiyat Önizleme</span>
                      {(() => {
                        const textRows = models.filter(m => m.type === "Metin" && m.computed.input).slice(0, 5);
                        const imgRows = models.filter(m => m.type === "Görsel" && m.computed.input && m.computed.output).slice(0, 3);
                        const vidRows = (() => {
                          const def = models.filter(m => m.type === "Video" && m.computed.perResolution?.default).slice(0, 1);
                          const bt = models.filter(m => m.type === "Video" && m.provider === "ByteDance" && m.computed.perResolution?.["720p"]).slice(0, 2);
                          return [...def, ...bt];
                        })();
                        return (
                          <div className="space-y-4">
                            {textRows.length > 0 && (
                              <div>
                                <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">Metin (₺/1M)</div>
                                {textRows.map(m => {
                                  const price = m.computed.input?.tl ?? 0;
                                  return <div key={m.id} className="flex justify-between text-xs text-slate-300 py-0.5"><span className="truncate">{m.name}</span><span className="font-mono text-emerald-400">₺{price.toFixed(2)}</span></div>;
                                })}
                              </div>
                            )}
                            {imgRows.length > 0 && (
                              <div>
                                <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">Görsel (₺/img)</div>
                                {imgRows.map(m => {
                                  const inP = m.computed.input?.tl ?? 0;
                                  const outP = m.computed.output?.tl ?? 0;
                                  return <div key={m.id} className="flex justify-between text-xs text-slate-300 py-0.5"><span className="truncate">{m.name}</span><span className="font-mono text-emerald-400">₺{(inP + outP).toFixed(4)}</span></div>;
                                })}
                              </div>
                            )}
                            {vidRows.length > 0 && (
                              <div>
                                <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">Video (₺/sn)</div>
                                {vidRows.map(m => {
                                  const price = m.computed.perResolution?.["720p"]?.tl ?? m.computed.perResolution?.default?.tl ?? 0;
                                  return <div key={m.id} className="flex justify-between text-xs text-slate-300 py-0.5"><span className="truncate">{m.name}</span><span className="font-mono text-emerald-400">₺{price.toFixed(4)}</span></div>;
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Bottom: KUR history sparkline */}
                  {kurHistoryData.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                      <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block mb-3">KUR GEÇMİŞİ</span>
                      {(() => {
                        const last12 = kurHistoryData.slice(-12);
                        const vals = last12.map((e: any) => e.sellKur ?? e.kur ?? 0);
                        const minV = Math.min(...vals);
                        const maxV = Math.max(...vals);
                        const range = maxV - minV || 1;
                        return (
                          <div className="flex items-end space-x-1 h-16">
                            {last12.map((e: any, i: number) => {
                              const v = e.sellKur ?? e.kur ?? 0;
                              const h = Math.max(4, Math.round(((v - minV) / range) * 52) + 4);
                              return (
                                <div key={i} className="flex-1 group relative cursor-pointer">
                                  <div className="bg-blue-400 hover:bg-blue-600 rounded-t transition-all" style={{ height: h }} title={`${new Date(e.timestamp ?? e.tarih ?? "").toLocaleString("tr-TR")}: ₺${v.toFixed(4)}`} />
                                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                                    {new Date(e.timestamp ?? e.tarih ?? "").toLocaleString("tr-TR")}<br />₺{v.toFixed(4)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* ─ MODEL YÖNETİMİ ─ */}
              {adminSection === "models" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-display font-bold text-slate-900">Model Yönetimi</h2>
                    <div className="flex space-x-1">
                      {(["Metin", "Görsel", "Video"] as const).map(t => (
                        <button key={t} onClick={() => { setAdminModelTypeFilter(t); setSelectedAdminModel(null); }}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${adminModelTypeFilter === t ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                            <th className="p-3 text-left">Model</th>
                            <th className="p-3 text-left">Provider</th>
                            {adminModelTypeFilter === "Metin" && <><th className="p-3 text-right">Provider $ in</th><th className="p-3 text-right">Provider $ out</th><th className="p-3 text-right">Müşteri ₺</th></>}
                            {adminModelTypeFilter === "Görsel" && <><th className="p-3 text-right">Provider $ in</th><th className="p-3 text-right">Provider $ out</th><th className="p-3 text-right">Müşteri ₺</th></>}
                            {adminModelTypeFilter === "Video" && <th className="p-3 text-left">Fiyatlar</th>}
                            <th className="p-3 text-center">Durum</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {models.filter(m => m.type === adminModelTypeFilter).map(m => {
                            const ovr = modelOverrides.find(o => o.modelId === m.id);
                            const enabled = m.enabled !== false;
                            return (
                              <tr key={m.id}
                                className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedAdminModel?.id === m.id ? "bg-blue-50/50" : ""}`}
                                onClick={() => setSelectedAdminModel(m)}>
                                <td className="p-3 font-medium text-slate-800 truncate max-w-[140px]">{m.name}</td>
                                <td className="p-3"><span className="bg-slate-100 text-slate-600 font-mono px-1.5 py-0.5 rounded text-[10px]">{m.provider}</span></td>
                                {adminModelTypeFilter === "Metin" && (
                                  <>
                                    <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                      <input type="number" step="0.001" value={ovr?.inputUsdOverride ?? m.providerInputUsd ?? ""}
                                        onBlur={async (e) => {
                                          const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                          await adminFetch("/api/admin/model-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: m.id, enabled, inputUsdOverride: val, outputUsdOverride: ovr?.outputUsdOverride ?? null, notlar: ovr?.notlar ?? "" }) });
                                          await loadAdminData();
                                        }}
                                        onChange={() => {}}
                                        className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                    </td>
                                    <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                      <input type="number" step="0.001" value={ovr?.outputUsdOverride ?? m.providerOutputUsd ?? ""}
                                        onBlur={async (e) => {
                                          const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                          await adminFetch("/api/admin/model-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: m.id, enabled, inputUsdOverride: ovr?.inputUsdOverride ?? null, outputUsdOverride: val, notlar: ovr?.notlar ?? "" }) });
                                          await loadAdminData();
                                        }}
                                        onChange={() => {}}
                                        className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                    </td>
                                    <td className="p-3 text-right font-mono text-emerald-700">{m.computed.input ? `₺${m.computed.input.tl.toFixed(1)}` : "—"}</td>
                                  </>
                                )}
                                {adminModelTypeFilter === "Görsel" && (
                                  <>
                                    <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                      <input type="number" step="0.0001" value={ovr?.inputUsdOverride ?? m.providerImageInputUsd ?? ""}
                                        onBlur={async (e) => {
                                          const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                          await adminFetch("/api/admin/model-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: m.id, enabled, inputUsdOverride: val, outputUsdOverride: ovr?.outputUsdOverride ?? null, notlar: ovr?.notlar ?? "" }) });
                                          await loadAdminData();
                                        }}
                                        onChange={() => {}}
                                        className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                    </td>
                                    <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                      <input type="number" step="0.0001" value={ovr?.outputUsdOverride ?? m.providerImageOutputUsd ?? ""}
                                        onBlur={async (e) => {
                                          const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                          await adminFetch("/api/admin/model-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: m.id, enabled, inputUsdOverride: ovr?.inputUsdOverride ?? null, outputUsdOverride: val, notlar: ovr?.notlar ?? "" }) });
                                          await loadAdminData();
                                        }}
                                        onChange={() => {}}
                                        className="w-20 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                    </td>
                                    <td className="p-3 text-right font-mono text-emerald-700">{(m.computed.input && m.computed.output) ? `₺${(m.computed.input.tl + m.computed.output.tl).toFixed(4)}` : "—"}</td>
                                  </>
                                )}
                                {adminModelTypeFilter === "Video" && (
                                  <td className="p-3 text-slate-400 text-[10px] font-mono">
                                    {Object.entries(m.providerPerSecond ?? {}).map(([res, val]) => `${res}: $${val}`).join(" | ") || "—"}
                                    <span className="ml-2 text-amber-500 font-semibold">Video override yakında</span>
                                  </td>
                                )}
                                <td className="p-3 text-center">
                                  <button onClick={async (e) => {
                                    e.stopPropagation();
                                    await adminFetch("/api/admin/model-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: m.id, enabled: !enabled, inputUsdOverride: ovr?.inputUsdOverride ?? null, outputUsdOverride: ovr?.outputUsdOverride ?? null, notlar: ovr?.notlar ?? "" }) });
                                    await loadAdminData();
                                    await refreshData();
                                  }} className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all ${enabled ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-red-50 text-red-700 hover:bg-red-100"}`}>
                                    {enabled ? "Aktif" : "Kapalı"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                      {selectedAdminModel ? (
                        <div className="space-y-3">
                          <div className="border-b border-slate-100 pb-2">
                            <span className="text-xs font-bold text-slate-800 block">{selectedAdminModel.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{selectedAdminModel.id}</span>
                          </div>
                          {selectedAdminModel.type !== "Video" && (() => {
                            const ovr = modelOverrides.find(o => o.modelId === selectedAdminModel.id) ?? { modelId: selectedAdminModel.id, enabled: true, inputUsdOverride: null, outputUsdOverride: null, notlar: "" };
                            return (
                              <div className="space-y-3">
                                <div>
                                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Input USD Override</label>
                                  <input type="number" step="0.001" placeholder={String(selectedAdminModel.providerInputUsd ?? selectedAdminModel.providerImageInputUsd ?? "")}
                                    defaultValue={ovr.inputUsdOverride ?? ""}
                                    onBlur={async (e) => {
                                      const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                      await adminFetch("/api/admin/model-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ovr, inputUsdOverride: val }) });
                                      await loadAdminData();
                                    }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                </div>
                                <div>
                                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Output USD Override</label>
                                  <input type="number" step="0.001" placeholder={String(selectedAdminModel.providerOutputUsd ?? selectedAdminModel.providerImageOutputUsd ?? "")}
                                    defaultValue={ovr.outputUsdOverride ?? ""}
                                    onBlur={async (e) => {
                                      const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                      await adminFetch("/api/admin/model-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ovr, outputUsdOverride: val }) });
                                      await loadAdminData();
                                    }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                </div>
                                <div>
                                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Notlar</label>
                                  <textarea rows={2} defaultValue={ovr.notlar}
                                    onBlur={async (e) => {
                                      await adminFetch("/api/admin/model-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ovr, notlar: e.target.value }) });
                                      await loadAdminData();
                                    }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                </div>
                                <button onClick={async () => {
                                  await adminFetch(`/api/admin/model-overrides/${encodeURIComponent(selectedAdminModel.id)}`, { method: "DELETE" });
                                  await loadAdminData();
                                }} className="text-xs text-red-600 hover:text-red-800 flex items-center space-x-1">
                                  <Trash2 className="w-3 h-3" /><span>Override Sil</span>
                                </button>
                              </div>
                            );
                          })()}
                          {selectedAdminModel.type === "Video" && (
                            <div className="text-xs text-slate-400 text-center py-4">Video fiyat override yakında gelecek.</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-slate-400">
                          <Cpu className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          <span className="text-xs">Model seçin</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ─ KULLANICILAR ─ */}
              {adminSection === "users" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-display font-bold text-slate-900">Kullanıcılar</h2>
                    <input type="text" placeholder="E-posta veya ad ara..." value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg py-1.5 px-3 text-xs w-56 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                            <th className="p-3 text-left">Kullanıcı</th>
                            <th className="p-3 text-left">Plan</th>
                            <th className="p-3 text-left">Durum</th>
                            <th className="p-3 text-right">Bakiye</th>
                            <th className="p-3 text-right">Harcama</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {adminUsers.filter(u => !userSearch || u.email.toLowerCase().includes(userSearch.toLowerCase()) || u.adSoyad.toLowerCase().includes(userSearch.toLowerCase())).map(u => (
                            <tr key={u.id}
                              className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedAdminUser?.id === u.id ? "bg-blue-50/50" : ""}`}
                              onClick={() => setSelectedAdminUser(u)}>
                              <td className="p-3">
                                <div className="font-medium text-slate-800">{u.adSoyad}</div>
                                <div className="text-[10px] text-slate-400">{u.email}</div>
                              </td>
                              <td className="p-3">
                                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${u.plan === "kurumsal" ? "bg-purple-50 text-purple-700" : u.plan === "pro" ? "bg-blue-50 text-blue-700" : u.plan === "gelistirici" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{u.plan}</span>
                              </td>
                              <td className="p-3">
                                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${u.durum === "aktif" ? "bg-emerald-50 text-emerald-700" : u.durum === "askida" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{u.durum}</span>
                              </td>
                              <td className="p-3 text-right font-mono font-semibold text-slate-700">₺{u.bakiyeTL.toFixed(2)}</td>
                              <td className="p-3 text-right font-mono text-slate-400">₺{u.toplamHarcamaTL.toFixed(0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                      {selectedAdminUser ? (
                        <>
                          <div className="border-b border-slate-100 pb-2">
                            <span className="text-xs font-bold text-slate-800 block">{selectedAdminUser.adSoyad}</span>
                            <span className="text-[10px] text-slate-400">{selectedAdminUser.email}</span>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Durum</label>
                            <select value={selectedAdminUser.durum}
                              onChange={async (e) => {
                                const updated = { ...selectedAdminUser, durum: e.target.value as UserEntry["durum"] };
                                await adminFetch(`/api/admin/users/${selectedAdminUser.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durum: e.target.value }) });
                                setSelectedAdminUser(updated);
                                await loadAdminData();
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="aktif">aktif</option>
                              <option value="askida">askıda</option>
                              <option value="engelli">engelli</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Plan</label>
                            <select value={selectedAdminUser.plan}
                              onChange={async (e) => {
                                const updated = { ...selectedAdminUser, plan: e.target.value as UserEntry["plan"] };
                                await adminFetch(`/api/admin/users/${selectedAdminUser.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: e.target.value }) });
                                setSelectedAdminUser(updated);
                                await loadAdminData();
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="ucretsiz">ücretsiz</option>
                              <option value="gelistirici">geliştirici</option>
                              <option value="pro">pro</option>
                              <option value="kurumsal">kurumsal</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Not</label>
                            <textarea rows={2} value={selectedAdminUser.not}
                              onChange={(e) => setSelectedAdminUser({ ...selectedAdminUser, not: e.target.value })}
                              onBlur={async () => {
                                await adminFetch(`/api/admin/users/${selectedAdminUser.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ not: selectedAdminUser.not }) });
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div className="border-t border-slate-100 pt-3 space-y-2">
                            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Bakiye İşlemi</label>
                            <input type="number" placeholder="Miktar (₺, - için eksi)"
                              value={bakiyeForm.miktar}
                              onChange={(e) => setBakiyeForm(f => ({ ...f, miktar: e.target.value }))}
                              className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <input type="text" placeholder="Açıklama"
                              value={bakiyeForm.aciklama}
                              onChange={(e) => setBakiyeForm(f => ({ ...f, aciklama: e.target.value }))}
                              className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <button onClick={async () => {
                              const miktar = parseFloat(bakiyeForm.miktar);
                              if (!miktar) return;
                              const res = await adminFetch(`/api/admin/users/${selectedAdminUser.id}/bakiye`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ miktar, aciklama: bakiyeForm.aciklama }) });
                              const data = await res.json();
                              setSelectedAdminUser(data.user);
                              setBakiyeForm({ miktar: "", aciklama: "" });
                              await loadAdminData();
                            }} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 rounded transition-all">
                              Uygula
                            </button>
                          </div>
                          <div className="border-t border-slate-100 pt-2">
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-2">Son Hareketler</span>
                            {adminBakiyeHareketleri.filter(h => h.userId === selectedAdminUser.id).slice(0, 5).map(h => (
                              <div key={h.id} className="text-[10px] flex justify-between py-1 border-b border-slate-50">
                                <span className={`font-mono ${h.miktarTL >= 0 ? "text-emerald-600" : "text-red-500"}`}>{h.miktarTL >= 0 ? "+" : ""}{h.miktarTL} ₺</span>
                                <span className="text-slate-400 truncate ml-2">{h.aciklama}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-12 text-slate-400">
                          <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          <span className="text-xs">Kullanıcı seçin</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ─ BAKİYE İŞLEMLERİ ─ */}
              {adminSection === "bakiye" && (
                <div className="space-y-4">
                  <h2 className="text-lg font-display font-bold text-slate-900">Bakiye İşlemleri</h2>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {(["yukleme", "kullanim", "iade", "manuel"] as const).map(tip => {
                      const items = adminBakiyeHareketleri.filter(h => h.tip === tip);
                      const toplam = items.reduce((s, h) => s + Math.abs(h.miktarTL), 0);
                      return (
                        <div key={tip} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">{tip}</span>
                          <span className="text-xl font-bold text-slate-800">₺{toplam.toFixed(0)}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{items.length} işlem</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                          <th className="p-3 text-left">Tarih</th>
                          <th className="p-3 text-left">Kullanıcı</th>
                          <th className="p-3 text-left">Tip</th>
                          <th className="p-3 text-right">Miktar</th>
                          <th className="p-3 text-right">Sonraki Bakiye</th>
                          <th className="p-3 text-left">Açıklama</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {adminBakiyeHareketleri.slice(0, 50).map(h => (
                          <tr key={h.id} className="hover:bg-slate-50">
                            <td className="p-3 font-mono text-[10px] text-slate-400">{new Date(h.timestamp).toLocaleString("tr-TR")}</td>
                            <td className="p-3 text-slate-700">{h.userEmail}</td>
                            <td className="p-3"><span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${h.tip === "yukleme" ? "bg-emerald-50 text-emerald-700" : h.tip === "kullanim" ? "bg-blue-50 text-blue-700" : h.tip === "iade" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{h.tip}</span></td>
                            <td className={`p-3 text-right font-mono font-semibold ${h.miktarTL >= 0 ? "text-emerald-700" : "text-red-600"}`}>{h.miktarTL >= 0 ? "+" : ""}{h.miktarTL} ₺</td>
                            <td className="p-3 text-right font-mono text-slate-600">₺{h.sonrakiBakiye.toFixed(2)}</td>
                            <td className="p-3 text-slate-400 truncate max-w-[180px]">{h.aciklama}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {adminBakiyeHareketleri.length === 0 && <div className="p-8 text-center text-xs text-slate-400">Henüz bakiye hareketi yok.</div>}
                  </div>
                </div>
              )}

              {/* ─ DUYURULAR ─ */}
              {adminSection === "duyurular" && (
                <div className="space-y-4">
                  <h2 className="text-lg font-display font-bold text-slate-900">Duyurular</h2>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">Yeni Duyuru</span>
                    <textarea rows={2} placeholder="Duyuru metni..." value={newAnnouncement.mesaj}
                      onChange={(e) => setNewAnnouncement(a => ({ ...a, mesaj: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <div className="grid grid-cols-3 gap-3">
                      <select value={newAnnouncement.tip}
                        onChange={(e) => setNewAnnouncement(a => ({ ...a, tip: e.target.value as typeof newAnnouncement.tip }))}
                        className="bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="bilgi">Bilgi</option>
                        <option value="uyari">Uyarı</option>
                        <option value="bakim">Bakım</option>
                        <option value="yenilik">Yenilik</option>
                      </select>
                      <input type="date" value={newAnnouncement.baslangic}
                        onChange={(e) => setNewAnnouncement(a => ({ ...a, baslangic: e.target.value }))}
                        className="bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <input type="date" value={newAnnouncement.bitis}
                        onChange={(e) => setNewAnnouncement(a => ({ ...a, bitis: e.target.value }))}
                        className="bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <button onClick={async () => {
                      if (!newAnnouncement.mesaj || !newAnnouncement.bitis) return;
                      await adminFetch("/api/admin/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newAnnouncement, aktif: true, baslangic: new Date(newAnnouncement.baslangic).toISOString(), bitis: new Date(newAnnouncement.bitis).toISOString() }) });
                      setNewAnnouncement({ mesaj: "", tip: "bilgi", baslangic: new Date().toISOString().split("T")[0], bitis: "" });
                      await loadAdminData();
                      await refreshData();
                    }} className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all">
                      <Plus className="w-3.5 h-3.5" /><span>Ekle</span>
                    </button>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                          <th className="p-3 text-left">Mesaj</th>
                          <th className="p-3 text-left">Tip</th>
                          <th className="p-3 text-left">Durum</th>
                          <th className="p-3 text-left">Bitiş</th>
                          <th className="p-3 text-center">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {adminAnnouncements.map(a => (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="p-3 text-slate-700 max-w-[240px] truncate">{a.mesaj}</td>
                            <td className="p-3"><span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${a.tip === "uyari" ? "bg-amber-50 text-amber-700" : a.tip === "bakim" ? "bg-red-50 text-red-700" : a.tip === "yenilik" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{a.tip}</span></td>
                            <td className="p-3">
                              <button onClick={async () => {
                                await adminFetch(`/api/admin/announcements/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aktif: !a.aktif }) });
                                await loadAdminData(); await refreshData();
                              }} className={`font-mono text-[10px] px-1.5 py-0.5 rounded transition-all ${a.aktif ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{a.aktif ? "Aktif" : "Pasif"}</button>
                            </td>
                            <td className="p-3 font-mono text-slate-400 text-[10px]">{new Date(a.bitis).toLocaleDateString("tr-TR")}</td>
                            <td className="p-3 text-center">
                              <button onClick={async () => {
                                await adminFetch(`/api/admin/announcements/${a.id}`, { method: "DELETE" });
                                await loadAdminData(); await refreshData();
                              }} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {adminAnnouncements.length === 0 && <div className="p-8 text-center text-xs text-slate-400">Henüz duyuru yok.</div>}
                  </div>
                </div>
              )}

              {/* ─ SİSTEM & AUDIT ─ */}
              {adminSection === "sistem" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-display font-bold text-slate-900">Sistem & Audit</h2>
                    <div className="flex space-x-1">
                      {(["provider", "audit", "reconciliation"] as const).map(t => (
                        <button key={t} onClick={() => setAdminAuditSubTab(t)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${adminAuditSubTab === t ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                          {t === "provider" ? "Provider Durumu" : t === "audit" ? "Audit Log" : "Mutabakat"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {adminAuditSubTab === "provider" && (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                            <th className="p-3 text-left">Provider</th>
                            <th className="p-3 text-left">Durum</th>
                            <th className="p-3 text-right">Gecikme</th>
                            <th className="p-3 text-left">Not</th>
                            <th className="p-3 text-center">Kaydet</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {providerDurumlari.map(p => (
                            <tr key={p.provider} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-slate-800">{p.provider}</td>
                              <td className="p-3">
                                <select value={p.durum}
                                  onChange={(e) => setProviderDurumlari(prev => prev.map(x => x.provider === p.provider ? { ...x, durum: e.target.value as ProviderDurumu["durum"] } : x))}
                                  className={`font-mono text-[10px] px-2 py-0.5 rounded border focus:outline-none ${p.durum === "aktif" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : p.durum === "yavas" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                                  <option value="aktif">aktif</option>
                                  <option value="yavas">yavas</option>
                                  <option value="kapali">kapali</option>
                                </select>
                              </td>
                              <td className="p-3 text-right font-mono text-slate-500">{p.gecikmeMs}ms</td>
                              <td className="p-3">
                                <input type="text" value={p.not}
                                  onChange={(e) => setProviderDurumlari(prev => prev.map(x => x.provider === p.provider ? { ...x, not: e.target.value } : x))}
                                  className="bg-slate-50 border border-slate-200 rounded py-0.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-40" />
                              </td>
                              <td className="p-3 text-center">
                                <button onClick={async () => {
                                  await adminFetch(`/api/admin/provider-durumu/${encodeURIComponent(p.provider)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durum: p.durum, not: p.not }) });
                                  await loadAdminData();
                                }} className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-1 rounded transition-all font-semibold">Kaydet</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {adminAuditSubTab === "audit" && (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                            <th className="p-3 text-left">Zaman</th>
                            <th className="p-3 text-left">İşlem</th>
                            <th className="p-3 text-left">Hedef</th>
                            <th className="p-3 text-left">Özet</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {auditLogs.slice(0, 50).map(l => (
                            <tr key={l.id} className="hover:bg-slate-50">
                              <td className="p-3 font-mono text-[10px] text-slate-400 whitespace-nowrap">{new Date(l.timestamp).toLocaleString("tr-TR")}</td>
                              <td className="p-3"><span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{l.action}</span></td>
                              <td className="p-3 text-slate-500 font-mono text-[10px] truncate max-w-[120px]">{l.hedef}</td>
                              <td className="p-3 text-slate-700 truncate max-w-[240px]">{l.ozet}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {auditLogs.length === 0 && (
                        <div className="p-8 text-center">
                          <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <span className="text-xs text-slate-400">Henüz audit kaydı yok. İşlem yapıldıkça burada görünür.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {adminAuditSubTab === "reconciliation" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          { label: "Durum", value: reconciliationReport ? (reconciliationReport.status === "ok" ? "OK" : "Fark Var") : "—", color: reconciliationReport?.status === "drift" ? "red" : "emerald" },
                          { label: "Bakiye Toplamı", value: reconciliationReport ? `₺${reconciliationReport.totals.currentBalanceTL.toFixed(2)}` : "—", color: "blue" },
                          { label: "Ledger Toplamı", value: reconciliationReport ? `₺${reconciliationReport.totals.ledgerBalanceTL.toFixed(2)}` : "—", color: "purple" },
                          { label: "Fark", value: reconciliationReport ? `₺${reconciliationReport.totals.driftTL.toFixed(4)}` : "—", color: Math.abs(reconciliationReport?.totals.driftTL ?? 0) >= 0.0001 ? "red" : "emerald" },
                        ].map((s) => (
                          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">{s.label}</span>
                            <span className={`text-xl font-display font-bold ${s.color === "blue" ? "text-blue-700" : s.color === "purple" ? "text-purple-700" : s.color === "red" ? "text-red-600" : "text-emerald-700"}`}>{s.value}</span>
                          </div>
                        ))}
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-display font-semibold text-slate-900">Ledger Mutabakatı</h3>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Kullanıcı bakiyesi ile transaction ledger toplamı karşılaştırılır.
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button onClick={loadAdminData}
                              className="text-xs bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-all font-semibold">
                              Yenile
                            </button>
                            <button onClick={downloadReconciliationExport}
                              className="text-xs bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-all font-semibold">
                              CSV İndir
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4 border-b border-slate-100 bg-slate-50">
                          {[
                            { label: "Yükleme", value: reconciliationReport ? `₺${reconciliationReport.totals.creditsTL.toFixed(2)}` : "—" },
                            { label: "Kullanım", value: reconciliationReport ? `₺${reconciliationReport.totals.debitsTL.toFixed(2)}` : "—" },
                            { label: "Usage Record", value: reconciliationReport ? reconciliationReport.totals.usageRecordCount.toLocaleString() : "—" },
                            { label: "Error Usage", value: reconciliationReport ? reconciliationReport.totals.errorUsageCount.toLocaleString() : "—" },
                            { label: "Stream Eksik", value: reconciliationReport ? reconciliationReport.totals.streamMissingUsageCount.toLocaleString() : "—" },
                          ].map((m) => (
                            <div key={m.label}>
                              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">{m.label}</span>
                              <span className="text-sm font-semibold text-slate-800">{m.value}</span>
                            </div>
                          ))}
                        </div>

                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                              <th className="p-3 text-left">Kullanıcı</th>
                              <th className="p-3 text-right">Bakiye</th>
                              <th className="p-3 text-right">Ledger</th>
                              <th className="p-3 text-right">Fark</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(reconciliationReport?.userDrifts ?? []).map((row) => (
                              <tr key={row.userId} className="hover:bg-slate-50">
                                <td className="p-3">
                                  <span className="font-semibold text-slate-800 block">{row.email}</span>
                                  <span className="font-mono text-[10px] text-slate-400">{row.userId}</span>
                                </td>
                                <td className="p-3 text-right font-mono text-slate-600">₺{row.currentBalanceTL.toFixed(4)}</td>
                                <td className="p-3 text-right font-mono text-slate-600">₺{row.ledgerBalanceTL.toFixed(4)}</td>
                                <td className="p-3 text-right font-mono font-semibold text-red-600">₺{row.driftTL.toFixed(4)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(reconciliationReport?.userDrifts.length ?? 0) === 0 && (
                          <div className="p-8 text-center">
                            <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                            <span className="text-xs text-slate-500">Kullanıcı bazlı ledger farkı yok.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─ GELİR ANALİZİ ─ */}
              {adminSection === "gelir" && (
                <div className="space-y-4">
                  <h2 className="text-lg font-display font-bold text-slate-900">Gelir Analizi</h2>
                  {(() => {
                    const yukleme = adminBakiyeHareketleri.filter(h => h.tip === "yukleme").reduce((s, h) => s + h.miktarTL, 0);
                    const kullanim = Math.abs(adminBakiyeHareketleri.filter(h => h.tip === "kullanim").reduce((s, h) => s + h.miktarTL, 0));
                    const net = yukleme - kullanim;
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-4">
                          {[
                            { label: "Toplam Yükleme", value: `₺${yukleme.toFixed(0)}`, color: "emerald" },
                            { label: "Toplam Kullanım", value: `₺${kullanim.toFixed(0)}`, color: "blue" },
                            { label: "Net Gelir", value: `₺${net.toFixed(0)}`, color: net >= 0 ? "emerald" : "red" },
                          ].map((s, i) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">{s.label}</span>
                              <span className={`text-2xl font-display font-bold ${s.color === "emerald" ? "text-emerald-700" : s.color === "blue" ? "text-blue-700" : "text-red-700"}`}>{s.value}</span>
                            </div>
                          ))}
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block mb-4">Son 14 Gün</span>
                          {(() => {
                            const days: { label: string; yukleme: number; kullanim: number }[] = [];
                            for (let i = 13; i >= 0; i--) {
                              const d = new Date();
                              d.setDate(d.getDate() - i);
                              const label = `${d.getDate().toString().padStart(2,"0")}.${(d.getMonth()+1).toString().padStart(2,"0")}`;
                              const dateStr = d.toISOString().split("T")[0];
                              const dayItems = adminBakiyeHareketleri.filter(h => (h.timestamp ?? "").startsWith(dateStr));
                              days.push({
                                label,
                                yukleme: dayItems.filter(h => h.tip === "yukleme").reduce((s, h) => s + h.miktarTL, 0),
                                kullanim: Math.abs(dayItems.filter(h => h.tip === "kullanim").reduce((s, h) => s + h.miktarTL, 0)),
                              });
                            }
                            const maxVal = Math.max(...days.map(d => d.yukleme + d.kullanim), 1);
                            return (
                              <div className="flex items-end space-x-1">
                                {days.map((d, i) => (
                                  <div key={i} className="flex-1 flex flex-col items-center">
                                    <div className="w-full flex flex-col justify-end" style={{ height: 80 }}>
                                      <div className="w-full bg-emerald-400 rounded-t" style={{ height: Math.max(1, Math.round((d.yukleme / maxVal) * 40)) }} title={`Yükleme: ₺${d.yukleme.toFixed(0)}`} />
                                      <div className="w-full bg-red-400" style={{ height: Math.max(1, Math.round((d.kullanim / maxVal) * 40)) }} title={`Kullanım: ₺${d.kullanim.toFixed(0)}`} />
                                    </div>
                                    <span className="text-[8px] font-mono text-slate-400 mt-1">{d.label}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* ─ API KEYS ─ */}
              {adminSection === "apikeys" && (
                <div className="space-y-4">
                  <h2 className="text-lg font-display font-bold text-slate-900">API Keys</h2>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">Yeni Anahtar Oluştur</span>
                    <div className="flex items-center space-x-2">
                      <select value={newApiKeyForm.userId}
                        onChange={e => setNewApiKeyForm(f => ({ ...f, userId: e.target.value }))}
                        className="bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1">
                        <option value="">Kullanıcı seçin...</option>
                        {adminUsers.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                      </select>
                      <input type="text" placeholder="Anahtar adı" value={newApiKeyForm.ad}
                        onChange={e => setNewApiKeyForm(f => ({ ...f, ad: e.target.value }))}
                        className="bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1" />
                      <button onClick={async () => {
                        if (!newApiKeyForm.userId || !newApiKeyForm.ad) return;
                        const res = await adminFetch(`/api/admin/api-keys/${newApiKeyForm.userId}/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ad: newApiKeyForm.ad }) });
                        const data = await res.json();
                        if (!res.ok) return;
                        if (data.key) setNewAdminApiKeyResult({ key: data.key, maskedKey: data.maskedKey, userEmail: data.userEmail });
                        setNewApiKeyForm({ userId: "", ad: "" });
                        await loadAdminData();
                      }} className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap">
                        <Plus className="w-3.5 h-3.5" /><span>Oluştur</span>
                      </button>
                    </div>
                    {newAdminApiKeyResult && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        <div className="font-semibold">Yeni anahtar sadece bir kez görünür.</div>
                        <div className="mt-1 font-mono break-all">{newAdminApiKeyResult.key}</div>
                        <div className="mt-1 text-amber-700">{newAdminApiKeyResult.userEmail || newAdminApiKeyResult.maskedKey || "Kullanıcıya güvenli şekilde iletin."}</div>
                      </div>
                    )}
                  </div>
                  {(() => {
                    const grouped: Record<string, any[]> = {};
                    apiKeysData.forEach((k: any) => {
                      const email = k.userEmail ?? k.userId ?? "unknown";
                      if (!grouped[email]) grouped[email] = [];
                      grouped[email].push(k);
                    });
                    return Object.entries(grouped).map(([email, keys]) => (
                      <div key={email} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">{email}</div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                              <th className="p-3 text-left">Anahtar</th>
                              <th className="p-3 text-left">Ad</th>
                              <th className="p-3 text-left">Oluşturma</th>
                              <th className="p-3 text-left">Son Kullanım</th>
                              <th className="p-3 text-center">Durum</th>
                              <th className="p-3 text-center">İşlem</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {keys.map((k: any) => (
                              <tr key={k.id} className="hover:bg-slate-50">
                                <td className="p-3 font-mono text-[10px] text-slate-600">{k.maskedKey ?? (k.key ? k.key.slice(0,12)+"..." : "—")}</td>
                                <td className="p-3 text-slate-700">{k.ad ?? "—"}</td>
                                <td className="p-3 font-mono text-slate-400 text-[10px]">{k.olusturma ? new Date(k.olusturma).toLocaleDateString("tr-TR") : "—"}</td>
                                <td className="p-3 font-mono text-slate-400 text-[10px]">{k.sonKullanim ? new Date(k.sonKullanim).toLocaleDateString("tr-TR") : "—"}</td>
                                <td className="p-3 text-center">
                                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${k.aktif ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{k.aktif ? "Aktif" : "İptal"}</span>
                                </td>
                                <td className="p-3 text-center">
                                  {k.aktif && (
                                    <button onClick={async () => {
                                      await adminFetch(`/api/admin/api-keys/revoke/${k.id}`, { method: "POST" });
                                      await loadAdminData();
                                    }} className="text-xs text-red-600 hover:text-red-800 font-semibold">İptal</button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ));
                  })()}
                  {apiKeysData.length === 0 && <div className="p-8 text-center text-xs text-slate-400">Henüz API key yok.</div>}
                </div>
              )}

              {/* ─ BEKLEYEN HAVALELER ─ */}
              {adminSection === "pending-iban" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-display font-bold text-slate-900">Bekleyen Havaleler</h2>
                    <button onClick={loadPendingIban} className="flex items-center space-x-1.5 text-xs text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg transition-all">
                      <RefreshCw className={`w-3.5 h-3.5 ${pendingIbanLoading ? "animate-spin" : ""}`} />
                      <span>Yenile</span>
                    </button>
                  </div>

                  {pendingIbanList.length === 0 && !pendingIbanLoading && (
                    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-400">
                      Bekleyen havale yok.
                    </div>
                  )}

                  {pendingIbanList.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono tracking-wider font-semibold text-[10px]">
                            <th className="p-3 text-left">KULLANICI</th>
                            <th className="p-3 text-right">MİKTAR</th>
                            <th className="p-3 text-left">REFERANS</th>
                            <th className="p-3 text-left">DURUM</th>
                            <th className="p-3 text-left">TARİH</th>
                            <th className="p-3 text-center">İŞLEM</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pendingIbanList.map((entry: any) => (
                            <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3">
                                <div className="font-medium text-slate-700 truncate max-w-[140px]">{entry.userAdSoyad}</div>
                                <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{entry.userEmail}</div>
                              </td>
                              <td className="p-3 text-right font-mono">
                                <div className="font-bold text-slate-800">₺{Number(entry.payableTL ?? entry.miktarTL).toFixed(2)}</div>
                                {entry.amountUsd && <div className="text-[10px] text-blue-500">${Number(entry.amountUsd).toFixed(2)} bakiye</div>}
                                <div className="text-[10px] text-slate-400">KDV ₺{Number(entry.kdvTL).toFixed(2)}</div>
                              </td>
                              <td className="p-3">
                                <span className="font-mono text-[11px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{entry.referansKodu}</span>
                              </td>
                              <td className="p-3">
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                                  entry.durum === "bekliyor" ? "bg-amber-50 text-amber-700" :
                                  entry.durum === "onaylandi" ? "bg-emerald-50 text-emerald-700" :
                                  "bg-red-50 text-red-700"
                                }`}>{entry.durum}</span>
                              </td>
                              <td className="p-3 text-[10px] text-slate-400 font-mono">
                                {new Date(entry.olusturma).toLocaleString("tr-TR")}
                              </td>
                              <td className="p-3 text-center">
                                {entry.durum === "bekliyor" && (
                                  <div className="flex items-center justify-center space-x-1.5">
                                    <button
                                      onClick={async () => {
                                        const res = await adminFetch(`/api/payments/admin/pending-iban/${entry.id}/approve`, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({}),
                                        });
                                        if (res.ok) await loadPendingIban();
                                        else alert("Onaylama hatası: " + (await res.json()).error);
                                      }}
                                      className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2 py-1 rounded transition-colors"
                                    >
                                      Onayla
                                    </button>
                                    <button
                                      onClick={async () => {
                                        const reason = prompt("Red nedeni:");
                                        if (!reason) return;
                                        const res = await adminFetch(`/api/payments/admin/pending-iban/${entry.id}/reject`, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ not: reason }),
                                        });
                                        if (res.ok) await loadPendingIban();
                                        else alert("Red hatası: " + (await res.json()).error);
                                      }}
                                      className="text-[10px] font-semibold bg-red-50 text-red-700 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                                    >
                                      Reddet
                                    </button>
                                  </div>
                                )}
                                {entry.durum !== "bekliyor" && (
                                  <span className="text-[10px] text-slate-400">{entry.onaylayan ?? "—"}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ─ PLANLAR ─ */}
              {adminSection === "planlar" && (
                <div className="space-y-4">
                  <h2 className="text-lg font-display font-bold text-slate-900">Planlar</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {plansData.map((plan: any) => {
                      const allModelIds = models.map(m => m.id);
                      const izinli: string[] = plan.izinliModeller ?? [];
                      const isAll = izinli.length === 0;
                      return (
                        <div key={plan.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{plan.id}</span>
                            <span className="text-sm font-display font-bold text-slate-800">{plan.ad}</span>
                          </div>
                          <div className="flex space-x-2">
                            <div className="flex-1">
                              <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Günlük Limit (₺)</label>
                              <input type="number" defaultValue={plan.gunlukLimitTL ?? ""}
                                onBlur={async (e) => {
                                  const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                  await adminFetch(`/api/admin/plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gunlukLimitTL: val }) });
                                  await loadAdminData();
                                }}
                                placeholder="Sınırsız"
                                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Aylık Limit (₺)</label>
                              <input type="number" defaultValue={plan.aylikLimitTL ?? ""}
                                onBlur={async (e) => {
                                  const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                  await adminFetch(`/api/admin/plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aylikLimitTL: val }) });
                                  await loadAdminData();
                                }}
                                placeholder="Sınırsız"
                                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Açıklama</label>
                            <textarea rows={2} defaultValue={plan.aciklama ?? ""}
                              onBlur={async (e) => {
                                await adminFetch(`/api/admin/plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aciklama: e.target.value }) });
                                await loadAdminData();
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">İzinli Modeller</label>
                              <button onClick={async () => {
                                await adminFetch(`/api/admin/plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ izinliModeller: [] }) });
                                await loadAdminData();
                              }} className={`text-[10px] font-mono px-2 py-0.5 rounded transition-all ${isAll ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-blue-50"}`}>
                                {isAll ? "Tümü (aktif)" : "Tümünü Seç"}
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                              {allModelIds.map(mid => {
                                const active = isAll || izinli.includes(mid);
                                const mName = models.find(m => m.id === mid)?.name ?? mid;
                                return (
                                  <button key={mid}
                                    onClick={async () => {
                                      let newIzinli: string[];
                                      if (isAll) {
                                        newIzinli = allModelIds.filter(x => x !== mid);
                                      } else if (active) {
                                        newIzinli = izinli.filter(x => x !== mid);
                                      } else {
                                        newIzinli = [...izinli, mid];
                                      }
                                      await adminFetch(`/api/admin/plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ izinliModeller: newIzinli }) });
                                      await loadAdminData();
                                    }}
                                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-all ${active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"}`}>
                                    {mName.length > 16 ? mName.slice(0,16)+"…" : mName}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {plansData.length === 0 && <div className="p-8 text-center text-xs text-slate-400">Plan yüklenemedi.</div>}
                </div>
              )}

            </div>
          </div>
        )}

      </main>

      {/* ── BAKIYE YUKLE MODAL ── */}
      {showBakiyeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowBakiyeModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: "90vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Coins className="w-4 h-4 text-blue-600" />
                <span className="font-display font-bold text-slate-900">Bakiye Yükle</span>
              </div>
              <button onClick={() => setShowBakiyeModal(false)} className="p-1 rounded hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Step: method select */}
              {bakiyeModalStep === "select" && (
                <>
                  {/* Amount input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider block">Yüklenecek Bakiye ($)</label>
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      value={bakiyeModalMiktar}
                      onChange={e => { setBakiyeModalMiktar(e.target.value); setBakiyeModalError(""); }}
                      placeholder="10"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <div className="text-[10px] text-slate-400 font-mono">
                      Kur ₺{(paymentMethods?.kur ?? adminConfig.kur).toFixed(4)}
                      {paymentMethods?.limits?.minBakiyeTL ? ` · Minimum tahsilat ₺${paymentMethods.limits.minBakiyeTL}` : ""}
                      {paymentMethods?.limits?.maxBakiyeTL ? ` · Maksimum tahsilat ₺${paymentMethods.limits.maxBakiyeTL}` : ""}
                    </div>
                    {parseFloat(bakiyeModalMiktar) > 0 && (() => {
                      const quote = buildTopupQuotePreview(parseFloat(bakiyeModalMiktar));
                      const { netTL, kdvTL } = calcKdvPreview(quote.payableTL);
                      return (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-blue-700 font-semibold">${quote.amountUsd.toFixed(2)} bakiye</span>
                            <span className="text-blue-700 font-semibold">ödenecek ₺{quote.payableTL.toFixed(2)}</span>
                          </div>
                          <div className="text-blue-500 text-[10px]">
                            Kullanılabilir karşılık ₺{quote.creditTL.toFixed(2)} · TL yuvarlama ₺{quote.roundingTL.toFixed(2)} · KDV ₺{kdvTL.toFixed(2)} dahil · Net ₺{netTL.toFixed(2)}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Method cards */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider block">Ödeme Yöntemi</span>

                    {/* Kart — Shopier */}
                    <button
                      onClick={() => handleBakiyeMethodSelect("shopier")}
                      disabled={bakiyeModalLoading || !isPaymentMethodEnabled("shopier")}
                      className="w-full flex items-center space-x-3 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl p-4 transition-all text-left disabled:opacity-50"
                    >
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0"><DollarSign className="w-4 h-4" /></div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Kredi / Banka Kartı</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Shopier ile güvenli kart ödemesi</div>
                        {getPaymentMethodReason("shopier") && <div className="text-[10px] text-slate-400 mt-1">{getPaymentMethodReason("shopier")}</div>}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 ml-auto flex-shrink-0" />
                    </button>

                    {/* IBAN */}
                    <button
                      onClick={() => handleBakiyeMethodSelect("iban")}
                      disabled={bakiyeModalLoading || !isPaymentMethodEnabled("iban")}
                      className="w-full flex items-center space-x-3 bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30 rounded-xl p-4 transition-all text-left disabled:opacity-50"
                    >
                      <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 flex-shrink-0"><Database className="w-4 h-4" /></div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Banka Havalesi (IBAN)</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Manuel onaylı — 1-24 saat işlem süresi</div>
                        {getPaymentMethodReason("iban") && <div className="text-[10px] text-slate-400 mt-1">{getPaymentMethodReason("iban")}</div>}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 ml-auto flex-shrink-0" />
                    </button>

                    {/* Kripto */}
                    <button
                      onClick={() => handleBakiyeMethodSelect("crypto")}
                      disabled={bakiyeModalLoading || !isPaymentMethodEnabled("crypto")}
                      className="w-full flex items-center space-x-3 bg-white border border-slate-200 hover:border-purple-400 hover:bg-purple-50/30 rounded-xl p-4 transition-all text-left disabled:opacity-50"
                    >
                      <div className="p-2 rounded-lg bg-purple-50 text-purple-600 flex-shrink-0"><Zap className="w-4 h-4" /></div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Kripto Para (USDT TRC20)</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Cryptomus — blockchain onayı gerekir</div>
                        {getPaymentMethodReason("crypto") && <div className="text-[10px] text-slate-400 mt-1">{getPaymentMethodReason("crypto")}</div>}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 ml-auto flex-shrink-0" />
                    </button>
                  </div>

                  {bakiyeModalLoading && (
                    <div className="flex items-center justify-center py-2 space-x-2 text-xs text-slate-500">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>İşleniyor...</span>
                    </div>
                  )}

                  {bakiyeModalError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-center space-x-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{bakiyeModalError}</span>
                    </div>
                  )}

                  {/* Recent payments */}
                  {userPayments.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider block">Son Ödemelerim</span>
                      <div className="space-y-1">
                        {userPayments.slice(0, 5).map(p => (
                          <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-xs">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{p.metod}</span>
                              <span className="text-slate-700 font-semibold">{p.amountUsd ? `$${p.amountUsd.toFixed(2)}` : `₺${p.miktarTL}`}</span>
                              <span className="text-slate-400 font-mono text-[10px]">₺{Number(p.payableTL ?? p.miktarTL).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                                p.durum === "basarili" ? "bg-emerald-50 text-emerald-700" :
                                p.durum === "bekliyor" ? "bg-amber-50 text-amber-700" :
                                "bg-red-50 text-red-700"
                              }`}>{p.durum}</span>
                              <span className="text-slate-400 text-[10px]">{new Date(p.olusturma).toLocaleDateString("tr-TR")}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Step: IBAN result */}
              {bakiyeModalStep === "iban" && bakiyeIbanResult && (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center space-x-2 text-emerald-700">
                      <Check className="w-4 h-4" />
                      <span className="text-sm font-semibold">Havale Talebi Oluşturuldu</span>
                    </div>
                    <p className="text-xs text-emerald-700">Aşağıdaki bilgilere havale gönderin. Açıklama alanına referans kodunuzu yazmayı unutmayın.</p>
                  </div>

                  {bakiyeIbanResult.quote && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-blue-500 font-mono uppercase tracking-wider text-[10px]">Alınacak bakiye</span><span className="text-blue-800 font-semibold">${bakiyeIbanResult.quote.amountUsd.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-blue-500 font-mono uppercase tracking-wider text-[10px]">Gönderilecek tutar</span><span className="text-blue-800 font-semibold">₺{bakiyeIbanResult.quote.payableTL.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-blue-500 font-mono uppercase tracking-wider text-[10px]">Kur</span><span className="text-blue-800 font-mono">₺{bakiyeIbanResult.quote.kur.toFixed(4)}</span></div>
                    </div>
                  )}

                  {bakiyeIbanResult.iban.bankName && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-slate-500 font-mono uppercase tracking-wider text-[10px]">Banka</span><span className="text-slate-800 font-semibold">{bakiyeIbanResult.iban.bankName}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 font-mono uppercase tracking-wider text-[10px]">Alıcı</span><span className="text-slate-800 font-semibold">{bakiyeIbanResult.iban.owner}</span></div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-mono uppercase tracking-wider text-[10px]">IBAN</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-800 font-mono font-semibold">{bakiyeIbanResult.iban.ibanNumber}</span>
                          <button onClick={() => { navigator.clipboard.writeText(bakiyeIbanResult!.iban.ibanNumber); }}
                            className="p-1 rounded hover:bg-slate-200 transition-colors"><Copy className="w-3 h-3 text-slate-400" /></button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                    <div className="text-[10px] font-mono font-semibold text-amber-700 uppercase tracking-wider">Havale Açıklaması (zorunlu)</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-amber-800 text-base tracking-widest">{bakiyeIbanResult.referansKodu}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(bakiyeIbanResult!.referansKodu); setCopiedRef(true); setTimeout(() => setCopiedRef(false), 2000); }}
                        className="flex items-center space-x-1 text-[10px] text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded transition-colors"
                      >
                        {copiedRef ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedRef ? "Kopyalandı" : "Kopyala"}</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-amber-700">Bu kodu açıklama alanına yazmazsanız ödemeniz otomatik eşleştirilemez.</p>
                  </div>

                  <button onClick={() => setBakiyeModalStep("select")}
                    className="w-full text-xs text-slate-500 hover:text-slate-700 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    Geri Dön
                  </button>
                </div>
              )}

              {/* Step: Shopier auto-submit form */}
              {bakiyeModalStep === "shopier" && bakiyeShopierForm && (
                <div className="space-y-4 text-center">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
                    <DollarSign className="w-8 h-8 text-blue-600 mx-auto" />
                    <p className="text-sm font-semibold text-blue-800">Shopier ödeme sayfasına yönlendiriliyorsunuz</p>
                    <p className="text-xs text-blue-600">Devam Et'e basarak güvenli ödeme sayfasına geçin.</p>
                  </div>
                  <button onClick={submitShopierForm}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-3 rounded-xl transition-all flex items-center justify-center space-x-2">
                    <span>Devam Et</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => setBakiyeModalStep("select")}
                    className="w-full text-xs text-slate-500 hover:text-slate-700 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    Geri Dön
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
