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

export type StructureEventType = "BOS" | "ChoCH";

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
}

export interface LiquidityLevel {
  time: string;
  price: number;
  count: number;
}

export type OrderBlockType = "demand" | "supply";
export type OrderBlockOrigin = "BOS" | "ChoCH";
export type OrderBlockZone = "main" | "sub";
export type OrderBlockRefinementMethod = "defensive" | "aggressive";

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
  };
  ageBars: number;
  score: number;
  isValid: boolean;
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
  range: {
    start: string;
    end: string;
  };
  lastBar: ICTBar | null;
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
}
