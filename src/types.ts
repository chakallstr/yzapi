export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  context: string;
  type: "Metin" | "Görsel" | "Video";
  inputUsd: number;
  outputUsd: number;
}

export interface RoutingLog {
  id: string;
  timestamp: string;
  prompt: string;
  routedModel: string;
  speedMs: number;
  costEstimate: number;
  status: 'success' | 'error';
  tokenCount: number;
  reasoning: string;
  responseText: string;
}

export interface RouterSettings {
  speedWeight: number;
  qualityWeight: number;
  costWeight: number;
  fallbackModel: string;
  systemInstructions: string;
}

export interface AdminConfig {
  kur: number;
  liveKur: number;
  kurBuffer: number;
  kurSource: string;
  autoKurRefresh: boolean;
  kurRefreshIntervalDk: number;
  lastKurRefresh: string | null;
  textCarpan: number;
  imageCarpan: number;
  videoCarpan: number;
  platformAdi: string;
  destekEmail: string;
  maxBakiyeTL: number;
  minBakiyeTL: number;
  anomaliEsikTL: number;
}

export interface KurHistory {
  timestamp: string;
  liveKur: number;
  sellKur: number;
  source: string;
}

export interface PlanDefinition {
  id: string;
  ad: string;
  gunlukLimitTL: number | null;
  aylikLimitTL: number | null;
  izinliModeller: string[];
  aciklama: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  userEmail: string;
  ad: string;
  maskedKey: string;
  olusturma: string;
  sonKullanim: string | null;
  aktif: boolean;
}

export interface ModelOverride {
  modelId: string;
  enabled: boolean;
  inputUsdOverride: number | null;
  outputUsdOverride: number | null;
  notlar: string;
}

export interface UserEntry {
  id: string;
  email: string;
  adSoyad: string;
  bakiyeTL: number;
  toplamHarcamaTL: number;
  toplamIstek: number;
  durum: "aktif" | "askida" | "engelli";
  kayitTarihi: string;
  sonAktivite: string;
  plan: "ucretsiz" | "gelistirici" | "pro" | "kurumsal";
  apiKeyCount: number;
  not: string;
  gunlukLimitTL: number | null;
}

export interface BakiyeHareketi {
  id: string;
  userId: string;
  userEmail: string;
  tip: "yukleme" | "kullanim" | "iade" | "manuel";
  miktarTL: number;
  oncekiBakiye: number;
  sonrakiBakiye: number;
  aciklama: string;
  timestamp: string;
}

export interface SystemAnnouncement {
  id: string;
  mesaj: string;
  tip: "bilgi" | "uyari" | "bakim" | "yenilik";
  aktif: boolean;
  baslangic: string;
  bitis: string;
}

export interface ProviderDurumu {
  provider: string;
  durum: "aktif" | "yavas" | "kapali";
  gecikmeMs: number;
  sonKontrol: string;
  not: string;
}

export interface AuditLog {
  id: string;
  action: string;
  hedef: string;
  ozet: string;
  timestamp: string;
}
