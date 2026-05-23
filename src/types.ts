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
