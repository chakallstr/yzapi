export interface ScientificData {
  id: string;
  name: string;
  type: string;
  size: string;
  date: string;
  status: 'loading' | 'success' | 'error';
  rowsCount: number;
  columns: string[];
  data: Array<Record<string, string | number>>;
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
