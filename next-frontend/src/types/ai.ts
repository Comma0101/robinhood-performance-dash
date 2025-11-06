export type DirectionalBias = "Bullish" | "Bearish" | "Sideways";
export type CommandCenterPhase =
  | "Pre-Market"
  | "Active Session"
  | "Post-Market";
export type ModelHealth = "Operational" | "Degraded" | "Offline";

export interface DirectionalInsight {
  instrument: string;
  bias: DirectionalBias;
  confidence: number; // 0 - 1 scale
  narrative: string;
  keyLevels: Array<{
    label: string;
    price: number;
    type: "liquidity" | "fvg" | "smt" | "order_block";
  }>;
  supportingSignals: string[];
  lastUpdatedISO: string;
}

export interface NewsInsight {
  id: string;
  headline: string;
  summary: string;
  source: string;
  impactScore: number; // 0 - 1 scale
  impactNarrative: string;
  relatedTickers: string[];
  publishedAtISO: string;
  url?: string;
}

export interface JournalHighlight {
  id: string;
  dateISO: string;
  outcome: "Win" | "Loss" | "Neutral";
  pnl: number;
  takeaway: string;
  recommendedAction: string;
}

export interface ModelStatus {
  id: string;
  name: string;
  version: string;
  status: ModelHealth;
  latencyMs: number;
  lastUpdatedISO: string;
  notes?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
  completed: boolean;
  pillar: "Preparation" | "Execution" | "Review";
}

export interface SocialPost {
  id: string;
  source: "twitter" | "stocktwits" | "other";
  author: {
    name: string;
    handle: string;
    avatarUrl?: string;
    verified?: boolean;
  };
  text: string;
  url: string;
  metrics: {
    likeCount: number;
    retweetCount: number;
    replyCount: number;
  };
  relatedTickers: string[];
  publishedAtISO: string;
}

export interface CommandCenterSnapshot {
  sessionDateISO: string;
  session: {
    phase: CommandCenterPhase;
    focusTickers: string[];
    nextEvent: {
      label: string;
      timeISO: string;
    };
  };
  directional: DirectionalInsight;
  news: NewsInsight[];
  journal: {
    summary: string;
    highlights: JournalHighlight[];
    actionItems: string[];
  };
  models: ModelStatus[];
  checklist: ChecklistItem[];
  social?: SocialPost[];
}

export interface NewsFeedPayload {
  news: NewsInsight[];
  social: SocialPost[];
  fetchedAtISO: string;
}
