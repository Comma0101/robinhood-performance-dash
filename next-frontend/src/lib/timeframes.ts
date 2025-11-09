import type { ICTInterval } from "@/lib/ict";

export type UiTimeframeKey =
  | "1m"
  | "5m"
  | "15m"
  | "1H"
  | "4H"
  | "1D"
  | "3M"
  | "6M"
  | "1Y"
  | "Max";

export type ExtendedICTInterval =
  | "1min"
  | "5min"
  | "15min"
  | "30min"
  | "60min"
  | "4h"
  | "daily"
  | "weekly"
  | "monthly";

export interface TimeframeProfile {
  key: UiTimeframeKey;
  interval: ExtendedICTInterval;
  sourceInterval: ExtendedICTInterval;
  lookbackBars: number;
  horizon: string;
  rangeLabel: string;
}

const TIMEFRAME_CONFIG: Record<UiTimeframeKey, TimeframeProfile> = {
  "1m": {
    key: "1m",
    interval: "1min",
    sourceInterval: "1min",
    lookbackBars: 60,
    horizon: "scalp (≈1 hour)",
    rangeLabel: "≈1 hour",
  },
  "5m": {
    key: "5m",
    interval: "5min",
    sourceInterval: "1min",
    lookbackBars: 72,
    horizon: "session (≈6 hours)",
    rangeLabel: "≈6 hours",
  },
  "15m": {
    key: "15m",
    interval: "15min",
    sourceInterval: "1min",
    lookbackBars: 288,
    horizon: "intraday (≈3 days)",
    rangeLabel: "≈3 days",
  },
  "1H": {
    key: "1H",
    interval: "60min",
    sourceInterval: "1min",
    lookbackBars: 336,
    horizon: "short swing (≈14 days)",
    rangeLabel: "≈14 days",
  },
  "4H": {
    key: "4H",
    interval: "4h",
    sourceInterval: "60min",
    lookbackBars: 180,
    horizon: "medium swing (≈30 days)",
    rangeLabel: "≈30 days",
  },
  "1D": {
    key: "1D",
    interval: "daily",
    sourceInterval: "daily",
    lookbackBars: 365,
    horizon: "daily (≈1 year)",
    rangeLabel: "≈1 year",
  },
  "3M": {
    key: "3M",
    interval: "weekly",
    sourceInterval: "daily",
    lookbackBars: 12,
    horizon: "weekly (≈3 months)",
    rangeLabel: "≈3 months",
  },
  "6M": {
    key: "6M",
    interval: "monthly",
    sourceInterval: "daily",
    lookbackBars: 6,
    horizon: "monthly (≈6 months)",
    rangeLabel: "≈6 months",
  },
  "1Y": {
    key: "1Y",
    interval: "daily",
    sourceInterval: "daily",
    lookbackBars: 365,
    horizon: "daily (≈1 year)",
    rangeLabel: "≈1 year",
  },
  Max: {
    key: "Max",
    interval: "daily",
    sourceInterval: "daily",
    lookbackBars: 1825,
    horizon: "position (≈5 years)",
    rangeLabel: "≈5 years",
  },
};

const TIMEFRAME_ALIASES: Record<string, UiTimeframeKey> = {
  "1m": "1m",
  "1min": "1m",
  "5m": "5m",
  "5min": "5m",
  "15m": "15m",
  "15min": "15m",
  "1h": "1H",
  "60m": "1H",
  "60min": "1H",
  "4h": "4H",
  "240m": "4H",
  "1d": "1D",
  daily: "1D",
  "3m": "3M",
  "3M": "3M",
  "1w": "3M",
  weekly: "3M",
  "6m": "6M",
  "6M": "6M",
  "1mo": "6M",
  monthly: "6M",
  "1y": "1Y",
  yearly: "1Y",
  max: "Max",
};

const normalizeKey = (key?: string): UiTimeframeKey | null => {
  if (!key) {
    return null;
  }
  const trimmed = key.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = TIMEFRAME_ALIASES[trimmed];
  if (directMatch) {
    return directMatch;
  }

  const lowerMatch = TIMEFRAME_ALIASES[trimmed.toLowerCase()];
  if (lowerMatch) {
    return lowerMatch;
  }

  const upperMatch = TIMEFRAME_ALIASES[trimmed.toUpperCase()];
  if (upperMatch) {
    return upperMatch;
  }
  return null;
};

export const getTimeframeProfile = (
  timeframe?: string
): TimeframeProfile | null => {
  const key = normalizeKey(timeframe);
  if (!key) {
    return null;
  }
  return TIMEFRAME_CONFIG[key];
};

export const mapUiTimeframeToInterval = (
  timeframe?: string
): ExtendedICTInterval | null => {
  return getTimeframeProfile(timeframe)?.interval ?? null;
};

export const lookbackBarsForTimeframe = (timeframe?: string): number | null => {
  return getTimeframeProfile(timeframe)?.lookbackBars ?? null;
};

export const getTimeframeHorizon = (timeframe?: string): string | null => {
  return getTimeframeProfile(timeframe)?.horizon ?? null;
};

export const getTimeframeRangeLabel = (timeframe?: string): string | null => {
  return getTimeframeProfile(timeframe)?.rangeLabel ?? null;
};

export const getTimeframeSourceInterval = (
  timeframe?: string
): ExtendedICTInterval | null => {
  return getTimeframeProfile(timeframe)?.sourceInterval ?? null;
};

export const TIMEFRAME_KEYS = Object.keys(
  TIMEFRAME_CONFIG
) as UiTimeframeKey[];

export type TimeframeConfigMap = typeof TIMEFRAME_CONFIG;
