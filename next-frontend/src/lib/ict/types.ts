export type ICTInterval =
  | "1min"
  | "5min"
  | "15min"
  | "30min"
  | "60min"
  | "4h"
  | "daily"
  | "weekly"
  | "monthly";

export interface ICTBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type MarketBias = "bullish" | "bearish" | "neutral";

export type StructureEventType = "BOS" | "ChoCH" | "Sweep";

export interface SwingPoint {
  time: string;
  price: number;
  strength: "major" | "minor";
  index: number;
}

export interface StructureEvent {
  type: StructureEventType;
  direction: "up" | "down";
  time: string;
  barIndex: number;
  referenceSwing: SwingPoint;
  displacement?: number;
  atr?: number;
  threshold?: number;
  hasDisplacement: boolean;
}

export interface LiquidityLevel {
  time: string;
  price: number;
  count: number;
  stackScore?: number;
  classification?: "internal" | "external" | "relative";
  label?: string;
  source?: "major" | "minor";
}

export interface LiquidityStack {
  direction: "high" | "low";
  price: number;
  strength: number;
  members: LiquidityLevel[];
}

export type OrderBlockType = "demand" | "supply";
export type OrderBlockOrigin = "BOS" | "ChoCH";
export type OrderBlockZone = "main" | "sub";
export type OrderBlockRefinementMethod = "defensive" | "aggressive" | "mean_threshold";

export interface OrderBlock {
  type: OrderBlockType;
  origin: OrderBlockOrigin;
  zoneType: OrderBlockZone;
  candleTime: string;
  candleIndex: number;
  range: {
    low: number;
    high: number;
  };
  refined?: {
    low: number;
    high: number;
    method: OrderBlockRefinementMethod;
    mean?: number;
  };
  ageBars: number;
  score: number;
  isValid: boolean;
  touchCount: number;
  lastTouchAt?: string;
  invalidatedAt?: string;
  status: "active" | "mitigated" | "invalidated";
  classification: "origin" | "breaker" | "mitigation";
  reclaimed?: boolean;
  breakerParentTime?: string;
}

export type FairValueGapType = "bullish" | "bearish";

export interface FairValueGap {
  type: FairValueGapType;
  startTime: string;
  endTime: string;
  bounds: {
    low: number;
    high: number;
  };
  filled: boolean;
  ce: number;
  firstTouchAt?: string;
  lastTouchAt?: string;
  touchCount: number;
  filledRatio: number;
  ageBars: number;
  potency: number;
}

export interface SessionsConfig {
  label: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export interface KillZone {
  name: string;
  start: string;
  end: string;
  active: boolean;
}

export interface ICTAnalysisMeta {
  symbol: string;
  interval: ICTInterval | string;
  tz: "America/New_York";
  exchangeTZ?: string;
  lookbackBars?: number;
  barsCount?: number;
  range: {
    start: string;
    end: string;
  };
  lastBar: ICTBar | null;
  sourceInterval?: ICTInterval | string;
  generatedAt?: string;
  currentBar?: ICTBar | null;
  currentBarSummary?: string | null;
  lastClosedBarTimeISO?: string;
  pricePrecision?: number;
  includesCurrentBar?: boolean;
}

export interface ICTAnalysisStructure {
  bias: MarketBias;
  lastBosAt?: string;
  lastChoChAt?: string;
  swings: {
    highs: SwingPoint[];
    lows: SwingPoint[];
  };
  events: StructureEvent[];
}

export interface ICTAnalysis {
  meta: ICTAnalysisMeta;
  structure: ICTAnalysisStructure;
  dealingRange: DealingRange | null;
  orderBlocks: OrderBlock[];
  fvg: FairValueGap[];
  liquidity: {
    equalHighs: LiquidityLevel[];
    equalLows: LiquidityLevel[];
    externalHighs: LiquidityLevel[];
    externalLows: LiquidityLevel[];
    relativeEqualHighs: LiquidityLevel[];
    relativeEqualLows: LiquidityLevel[];
    stacks: LiquidityStack[];
  };
  sessions: {
    killZones: KillZone[];
  };
  levels: {
    prevDayHigh?: number;
    prevDayLow?: number;
    weeklyHigh?: number;
    weeklyLow?: number;
  };
  smtSignals: SMTSignal[];
}

export interface DealingRange {
  low: number;
  high: number;
  eq: number;
  pdPercent: number;
}

export type FVGFilterMode = "very_aggressive" | "aggressive" | "defensive" | "very_defensive";
export type LiquidityMode = "static" | "dynamic" | "both";

export interface ICTAnalysisOptions {
  symbol: string;
  interval: ICTInterval | string;
  lookbackBars?: number;
  pivotPeriod?: number;
  minorPivotPeriod?: number;
  liquidityTolerancePct?: number;
  session?: "NY" | "LDN" | "ASIAN";
  now?: Date;
  orderBlockRefinement?: OrderBlockRefinementMethod;
  orderBlockValidityPeriod?: number;
  fvgFilterMode?: FVGFilterMode;
  liquidityMode?: LiquidityMode;
  staticLiquidityPeriod?: number;
  dynamicLiquidityPeriod?: number;
  staticLiquiditySensitivity?: number;
  dynamicLiquiditySensitivity?: number;
  structureAtrPeriod?: number;
  structureDisplacementMultiplier?: number;
  comparativeSymbols?: string[];
  comparativeSeries?: Record<string, ICTBar[]>;
}

export interface SMTSignal {
  timestamp: string;
  primarySymbol: string;
  comparativeSymbol: string;
  direction: "bullish" | "bearish";
  basis: "high" | "low";
  strength: number;
  primaryPrice: number;
  comparativePrice: number;
  note: string;
}
