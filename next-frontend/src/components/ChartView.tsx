"use client";

import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { sub } from "date-fns";
import type { Duration } from "date-fns";
import {
  CandlestickData,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  TickMarkType,
  Time,
  createChart,
} from "lightweight-charts";
import { analyzeICT, type ICTAnalysis, type ICTBar } from "@/lib/ict";
import { getTimeframeProfile } from "@/lib/timeframes";
import IctOverlays from "./overlays/IctOverlays";
import IctToggles, {
  type IctToggleKey,
  type IctTogglesState,
} from "./overlays/IctToggles";

type ConversationRole = "user" | "assistant";

interface ConversationMessage {
  id: string;
  role: ConversationRole;
  author: string;
  content: string;
  timestamp: string;
}

type PriceBar = ICTBar;

interface PriceResponse {
  interval: string;
  bars: PriceBar[];
}

interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface AgentContextState {
  symbol: string;
  timeframe: TimeframeKey;
  interval?: string | null;
  lookbackBars?: number | null;
  sourceInterval?: string | null;
  range?: {
    start?: string | null;
    end?: string | null;
  } | null;
  barsCount?: number | null;
  horizon?: string | null;
  rangeLabel?: string | null;
  tz?: string | null;
  generatedAt?: string | null;
  lastClosedBarTimeISO?: string | null;
  usage?: TokenUsage | null;
  updatedAt?: string | null;
  includesCurrentBar?: boolean | null;
}

const presetSymbols = ["AAPL", "TSLA", "NVDA", "SPY", "QQQ", "MSFT"];
const TIME_ZONE = "America/New_York";

const timeframeOrder = [
  "1m",
  "5m",
  "15m",
  "1H",
  "4H",
  "1D",
  "3M",
  "6M",
  "1Y",
  "Max",
] as const;
type TimeframeKey = (typeof timeframeOrder)[number];

type AggregationConfig =
  | { type: "intraday"; minutes: number; resultInterval: string }
  | { type: "daily"; days: number; resultInterval: string };

interface TimeframeConfig {
  fetchInterval: "1min" | "5min" | "15min" | "30min" | "60min" | "daily";
  subtract: Duration;
  description: string;
  aggregation?: AggregationConfig;
}

const timeframeConfig: Record<TimeframeKey, TimeframeConfig> = {
  "1m": {
    fetchInterval: "1min",
    subtract: { days: 2 },
    description: "Micro view (1-minute candles)",
  },
  "5m": {
    fetchInterval: "1min",
    subtract: { days: 2 },
    description: "Intraday structure (5-minute candles)",
    aggregation: { type: "intraday", minutes: 5, resultInterval: "5m" },
  },
  "15m": {
    fetchInterval: "1min",
    subtract: { days: 3 },
    description: "Tactical flow (15-minute candles)",
    aggregation: { type: "intraday", minutes: 15, resultInterval: "15m" },
  },
  "1H": {
    fetchInterval: "1min",
    subtract: { days: 14 }, // 2 weeks for ~90 hourly bars
    description: "Hourly rhythm (60-minute candles)",
    aggregation: { type: "intraday", minutes: 60, resultInterval: "1h" },
  },
  "4H": {
    fetchInterval: "60min",
    subtract: { days: 30 }, // 1 month for ~180 4-hour bars
    description: "Session swings (4-hour composite candles)",
    aggregation: { type: "intraday", minutes: 240, resultInterval: "4h" },
  },
  "1D": {
    fetchInterval: "daily",
    subtract: { years: 1 },
    description: "Daily trend (1-day candles)",
  },
  "3M": {
    fetchInterval: "daily",
    subtract: { months: 3 },
    description: "Quarterly performance (weekly candles)",
    aggregation: { type: "daily", days: 7, resultInterval: "weekly" },
  },
  "6M": {
    fetchInterval: "daily",
    subtract: { months: 6 },
    description: "Half-year structure (monthly candles)",
    aggregation: { type: "daily", days: 30, resultInterval: "monthly" },
  },
  "1Y": {
    fetchInterval: "daily",
    subtract: { years: 1 },
    description: "Annual view (daily candles)",
  },
  Max: {
    fetchInterval: "daily",
    subtract: { years: 5 },
    description: "Five-year lookback (daily candles)",
  },
};

const CHAT_MODE_DETAILS = {
  plan: {
    label: "Plan",
    description: "Structured trade plan with JSON + rationale",
  },
  chat: {
    label: "Chat",
    description: "Conversational ICT commentary (no plan JSON)",
  },
} as const;

const intradayIntervals = new Set([
  "1m",
  "1min",
  "5m",
  "5min",
  "15m",
  "15min",
  "30m",
  "30min",
  "60min",
  "1h",
  "4h",
]);
const intradayTimeframes = new Set<TimeframeKey>([
  "1m",
  "5m",
  "15m",
  "1H",
  "4H",
]);

const priceDataCache = new Map<string, PriceResponse>();

const utcFormatterCache = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const padNumber = (value: number): string => value.toString().padStart(2, "0");

const parseTimestampParts = (
  timestamp: string
): {
  dateKey: string;
  hour: number;
  minute: number;
  second: number;
  minuteOfDay: number;
} | null => {
  if (!timestamp) {
    return null;
  }

  const [datePart, rawTime = "00:00:00"] = timestamp.trim().split(" ");
  if (!datePart) {
    return null;
  }

  const [hourPart = "00", minutePart = "00", secondPart = "00"] = rawTime
    .split(":")
    .map((segment) => segment.trim());

  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);
  const second = Number.parseInt(secondPart, 10);

  if ([hour, minute, second].some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    dateKey: datePart,
    hour,
    minute,
    second,
    minuteOfDay: hour * 60 + minute,
  };
};

const toTimeZoneDate = (
  timestamp: string,
  timeZone: string = TIME_ZONE
): Date => {
  const [datePart, timePart = "00:00:00"] = timestamp.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(":").map(Number);

  const baseUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const baseDate = new Date(baseUtc);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(baseDate);
  const mapped: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      mapped[part.type] = part.value;
    }
  }

  const actual = Date.UTC(
    Number(mapped.year),
    Number(mapped.month) - 1,
    Number(mapped.day),
    Number(mapped.hour),
    Number(mapped.minute),
    Number(mapped.second)
  );
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  const diff = desired - actual;

  return new Date(baseDate.getTime() + diff);
};

const toChartTime = (timestamp: string, interval: string): Time => {
  if (intradayIntervals.has(interval)) {
    return Math.floor(toTimeZoneDate(timestamp).getTime() / 1000) as Time;
  }
  return timestamp.split(" ")[0] as Time;
};

const formatBarLabel = (timestamp: string, interval: string): string => {
  const date = toTimeZoneDate(timestamp);
  if (intradayIntervals.has(interval)) {
    return utcFormatterCache.format(date);
  }
  return dateFormatter.format(date);
};

const aggregateIntradayBars = (
  bars: PriceBar[],
  minutes: number
): PriceBar[] => {
  if (bars.length === 0) {
    return [];
  }

  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time));

  const aggregated: PriceBar[] = [];
  let currentBucket: PriceBar | null = null;
  let currentBucketKey: string | null = null;
  let currentDayKey: string | null = null;
  let currentDayOffset = 0;
  for (const bar of sorted) {
    const parts = parseTimestampParts(bar.time);
    if (!parts) {
      continue;
    }
    const { dateKey, minuteOfDay } = parts;

    if (dateKey !== currentDayKey) {
      currentDayKey = dateKey;
      currentDayOffset = minuteOfDay % minutes;
      currentBucket = null;
      currentBucketKey = null;
    }

    const adjustedMinute = Math.max(0, minuteOfDay - currentDayOffset);
    const bucketIndex = Math.floor(adjustedMinute / minutes);
    const bucketMinute = bucketIndex * minutes + currentDayOffset;

    const bucketHour = Math.floor(bucketMinute / 60) % 24;
    const bucketMinuteOfHour = bucketMinute % 60;
    const bucketKey = `${dateKey} ${padNumber(bucketHour)}:${padNumber(
      bucketMinuteOfHour
    )}:00`;

    if (
      currentBucketKey === null ||
      bucketKey !== currentBucketKey ||
      !currentBucket
    ) {
      if (currentBucket) {
        aggregated.push(currentBucket);
      }

      currentBucket = {
        time: bucketKey,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      };
      currentBucketKey = bucketKey;
    } else if (currentBucket) {
      currentBucket.high = Math.max(currentBucket.high, bar.high);
      currentBucket.low = Math.min(currentBucket.low, bar.low);
      currentBucket.close = bar.close;
      currentBucket.volume += bar.volume;
    }
  }

  if (currentBucket) {
    aggregated.push(currentBucket);
  }

  return aggregated;
};

const aggregateDailyBars = (bars: PriceBar[], days: number): PriceBar[] => {
  if (bars.length === 0) {
    return [];
  }

  const sorted = [...bars].sort(
    (a, b) =>
      toTimeZoneDate(a.time).getTime() - toTimeZoneDate(b.time).getTime()
  );

  const aggregated: PriceBar[] = [];
  let groupStartBar: PriceBar | null = null;
  let groupStartDate: Date | null = null;
  let workingBar: PriceBar | null = null;

  for (const bar of sorted) {
    const barDate = toTimeZoneDate(bar.time);

    if (!groupStartBar || !groupStartDate || !workingBar) {
      groupStartBar = bar;
      groupStartDate = barDate;
      workingBar = { ...bar };
      continue;
    }

    const daysDiff =
      (barDate.getTime() - groupStartDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff >= days) {
      aggregated.push({ ...workingBar, time: groupStartBar.time });
      groupStartBar = bar;
      groupStartDate = barDate;
      workingBar = { ...bar };
      continue;
    }

    workingBar.high = Math.max(workingBar.high, bar.high);
    workingBar.low = Math.min(workingBar.low, bar.low);
    workingBar.close = bar.close;
    workingBar.volume += bar.volume;
  }

  if (workingBar && groupStartBar) {
    aggregated.push({ ...workingBar, time: groupStartBar.time });
  }

  return aggregated;
};

const validateAndCleanBars = (bars: PriceBar[]): PriceBar[] => {
  if (bars.length < 3) {
    return bars;
  }

  // Calculate median for outlier detection (use a copy to avoid mutating the original)
  const prices = bars.flatMap((b) => [b.high, b.low]);
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const median = sortedPrices[Math.floor(sortedPrices.length / 2)];

  // Calculate average true range for the dataset
  let totalRange = 0;
  let nonZeroRanges = 0;
  for (let i = 1; i < bars.length; i++) {
    const range = bars[i].high - bars[i].low;
    const prevClose = bars[i - 1].close;
    const trueRange = Math.max(
      range,
      Math.abs(bars[i].high - prevClose),
      Math.abs(bars[i].low - prevClose)
    );
    totalRange += trueRange;
    if (trueRange > 0) {
      nonZeroRanges++;
    }
  }
  const avgTrueRange = totalRange / (bars.length - 1);

  // For very low volatility data (like 1-minute bars), use a more lenient threshold
  // Increase from 10x to 50x to avoid filtering normal volatility spikes
  const maxReasonableRange = avgTrueRange * 50;

  const result = bars.filter((bar) => {
    // Skip bars with invalid OHLC relationships
    if (
      bar.high < bar.low ||
      bar.open < bar.low ||
      bar.open > bar.high ||
      bar.close < bar.low ||
      bar.close > bar.high
    ) {
      return false;
    }

    const barRange = bar.high - bar.low;
    // Only filter if avgTrueRange is significant (> 0.0001) to avoid divide-by-near-zero issues
    const isReasonable =
      avgTrueRange < 0.0001 || barRange <= maxReasonableRange;

    // More lenient bounds check: within 100% (2x) of median instead of 50%
    // This allows for normal intraday volatility
    const highDiff = Math.abs(bar.high - median) / median;
    const lowDiff = Math.abs(bar.low - median) / median;
    const withinBounds = highDiff < 1.0 && lowDiff < 1.0;

    return isReasonable && withinBounds;
  });

  // If we filtered out more than 80% of bars, something is wrong with the validation logic
  // Return all bars to avoid breaking the chart
  if (result.length < bars.length * 0.2 && bars.length > 10) {
    return bars;
  }

  return result;
};

const aggregatePriceBars = (
  bars: PriceBar[],
  aggregation?: AggregationConfig
): PriceBar[] => {
  if (!aggregation) {
    return bars;
  }

  if (aggregation.type === "intraday") {
    return aggregateIntradayBars(bars, aggregation.minutes);
  }

  return aggregateDailyBars(bars, aggregation.days);
};

const timeframeTickOptions: Record<TimeframeKey, Intl.DateTimeFormatOptions> = {
  "1m": { hour: "numeric", minute: "2-digit" },
  "5m": { hour: "numeric", minute: "2-digit" },
  "15m": { hour: "numeric", minute: "2-digit" },
  "1H": { month: "short", day: "numeric", hour: "numeric" },
  "4H": { month: "short", day: "numeric", hour: "numeric" },
  "1D": { month: "short", day: "numeric" },
  "3M": { month: "short", day: "numeric" },
  "6M": { month: "short", year: "numeric" },
  "1Y": { month: "short", year: "numeric" },
  Max: { year: "numeric" },
};

const tickFormatterCache = new Map<TimeframeKey, Intl.DateTimeFormat>();

const crosshairDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const crosshairDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const getTickFormatter = (timeframe: TimeframeKey): Intl.DateTimeFormat => {
  if (!tickFormatterCache.has(timeframe)) {
    tickFormatterCache.set(
      timeframe,
      new Intl.DateTimeFormat("en-US", {
        timeZone: TIME_ZONE,
        ...timeframeTickOptions[timeframe],
      })
    );
  }
  return tickFormatterCache.get(timeframe)!;
};

const timeToDate = (time: Time): Date => {
  if (typeof time === "number") {
    return new Date(time * 1000);
  }
  if (typeof time === "string") {
    return toTimeZoneDate(time);
  }
  if ("year" in time) {
    return toTimeZoneDate(
      `${time.year}-${padNumber(time.month)}-${padNumber(time.day)}`
    );
  }
  return new Date();
};

const formatTimeScaleTick = (time: Time, timeframe: TimeframeKey): string => {
  const formatter = getTickFormatter(timeframe);
  return formatter.format(timeToDate(time));
};

const formatCrosshairValue = (time: Time): string => {
  if (typeof time === "number") {
    return crosshairDateTimeFormatter.format(timeToDate(time));
  }
  return crosshairDateFormatter.format(timeToDate(time));
};

const formatIntervalDisplay = (interval: string): string => {
  if (interval.endsWith("min")) {
    const minutes = parseInt(interval, 10);
    if (!Number.isNaN(minutes)) {
      if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return `${hours}H`;
      }
      return `${minutes}m`;
    }
  }

  if (interval === "4h") {
    return "4H";
  }

  if (interval === "daily") {
    return "1D";
  }

  if (interval === "weekly") {
    return "Weekly";
  }

  if (interval === "monthly") {
    return "Monthly";
  }

  return interval;
};

const formatDisplayDate = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return dateFormatter.format(parsed);
};

const formatDisplayDateTime = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return utcFormatterCache.format(parsed);
};

const ChartView: React.FC = () => {
  const [symbol, setSymbol] = useState("AAPL");
  const [symbolInput, setSymbolInput] = useState("AAPL");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeKey>("5m");
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [chatWidth, setChatWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<"plan" | "chat">("plan");
  const [agentContext, setAgentContext] = useState<AgentContextState | null>(null);
  const [isAgentContextOpen, setIsAgentContextOpen] = useState(false);
  const [agentContextCopied, setAgentContextCopied] = useState(false);
  const [includeCurrentBar, setIncludeCurrentBar] = useState(false);
  const hydratingHistoryRef = useRef(false);
  const chatModeDetails = CHAT_MODE_DETAILS[chatMode];
  const activeTimeframeProfile = useMemo(
    () => getTimeframeProfile(activeTimeframe),
    [activeTimeframe]
  );
  const baseAgentContext = useMemo(
    () => ({
      symbol,
      timeframe: activeTimeframe,
      interval: activeTimeframeProfile?.interval ?? activeTimeframe,
      lookbackBars: activeTimeframeProfile?.lookbackBars ?? null,
      sourceInterval: activeTimeframeProfile?.sourceInterval ?? null,
      horizon: activeTimeframeProfile?.horizon ?? null,
      rangeLabel: activeTimeframeProfile?.rangeLabel ?? null,
    }),
    [symbol, activeTimeframe, activeTimeframeProfile]
  );
  const mergedAgentContext = useMemo(() => {
    if (!agentContext) {
      return baseAgentContext;
    }
    return {
      ...baseAgentContext,
      ...agentContext,
    };
  }, [agentContext, baseAgentContext]);
  const agentRangeDisplay = useMemo(() => {
    const start = formatDisplayDate(mergedAgentContext.range?.start);
    const end = formatDisplayDate(mergedAgentContext.range?.end);
    if (start && end) {
      return `${start} → ${end}`;
    }
    return mergedAgentContext.rangeLabel ?? "Pending range";
  }, [mergedAgentContext]);
  const agentIntervalLabel = formatIntervalDisplay(
    mergedAgentContext.interval ?? activeTimeframe
  );
  const agentSourceIntervalLabel = mergedAgentContext.sourceInterval
    ? formatIntervalDisplay(mergedAgentContext.sourceInterval)
    : null;
  const agentUsageLabel = mergedAgentContext.usage
    ? `${mergedAgentContext.usage.prompt_tokens ?? 0}/${
        mergedAgentContext.usage.completion_tokens ?? 0
      }/${mergedAgentContext.usage.total_tokens ?? 0}`
    : null;
  const lastClosedBarLabel = formatDisplayDateTime(
    mergedAgentContext.lastClosedBarTimeISO
  );
  const updatedLabel = formatDisplayDateTime(mergedAgentContext.updatedAt);
  const effectiveIncludeCurrentBar =
    mergedAgentContext.includesCurrentBar ?? includeCurrentBar;
  const currentBarModeClass = effectiveIncludeCurrentBar
    ? "text-warning"
    : "text-text-primary";
  const agentSummary = [
    `Using ${agentIntervalLabel}`,
    mergedAgentContext.lookbackBars
      ? `${mergedAgentContext.lookbackBars} bars`
      : null,
    agentRangeDisplay,
    effectiveIncludeCurrentBar ? "current bar included" : null,
  ]
    .filter(Boolean)
    .join(" • ");
  const includeToggleContainerClass = includeCurrentBar
    ? "rounded-lg border border-warning/40 bg-warning/5 px-3 py-2"
    : "rounded-lg border border-border bg-background px-3 py-2";
  const includeStatusText = includeCurrentBar
    ? "Including forming candle"
    : "Closed bars only";
  const includeStatusClass = includeCurrentBar
    ? "text-warning"
    : "text-text-tertiary";

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);
  const latestTimeframeRef = useRef<TimeframeKey>(activeTimeframe);
  const latestSymbolRef = useRef(symbol);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [hasChartData, setHasChartData] = useState(false);
  const [chartMeta, setChartMeta] = useState<{
    interval: string;
    lastBar?: string;
  } | null>(null);
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const [priceBars, setPriceBars] = useState<PriceBar[]>([]);
  const [ictToggles, setIctToggles] = useState<IctTogglesState>({
    eq: true,
    orderBlocks: true,
    fvg: false,
    structure: true,
    sessions: false,
  });
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<
    {
      id: string;
      title: string | null;
      updated_at: string;
      status: string;
      token_used: number;
      token_budget: number;
    }[]
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const activeConfig = timeframeConfig[activeTimeframe];
  const metaInterval =
    chartMeta?.interval ??
    activeConfig.aggregation?.resultInterval ??
    activeConfig.fetchInterval;
  const analysisInterval = chartMeta?.interval ?? metaInterval;

  const ictAnalysis = useMemo<ICTAnalysis | null>(() => {
    if (priceBars.length === 0) {
      return null;
    }

    try {
      return analyzeICT(priceBars, {
        symbol,
        interval: analysisInterval,
        lookbackBars: priceBars.length,
        session: "NY",
      });
    } catch (error) {
      console.error("ICT analysis failed:", error);
      return null;
    }
  }, [analysisInterval, priceBars, symbol]);

  const handleSymbolSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = symbolInput.trim().toUpperCase();
    if (!cleaned) {
      return;
    }
    setSymbol(cleaned);
    setChartMeta(null);
    setChartError(null);
  };

  const handlePresetSelect = (nextSymbol: string) => {
    setSymbolInput(nextSymbol);
    setSymbol(nextSymbol);
    setChartMeta(null);
    setChartError(null);
  };

  const handleToggleChange = (key: IctToggleKey, value: boolean) => {
    setIctToggles((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleChat = () => {
    setIsChatVisible(!isChatVisible);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      width: chatWidth,
    };
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;

      const deltaX = resizeStartRef.current.x - e.clientX;
      const newWidth = Math.max(
        300,
        Math.min(800, resizeStartRef.current.width + deltaX)
      );
      setChatWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, chatWidth]);

  const sendToAssistant = useCallback(
    async (conversation: ConversationMessage[]) => {
      if (conversation.length === 0) return;
      const requestTimeframe = activeTimeframe;
      const requestSymbol = symbol;
      const requestProfile = getTimeframeProfile(requestTimeframe);
      const agentDefaults: AgentContextState = {
        symbol: requestSymbol,
        timeframe: requestTimeframe,
        interval: requestProfile?.interval ?? requestTimeframe,
        lookbackBars: requestProfile?.lookbackBars ?? null,
        sourceInterval: requestProfile?.sourceInterval ?? null,
        horizon: requestProfile?.horizon ?? null,
        rangeLabel: requestProfile?.rangeLabel ?? null,
      };

      setIsSending(true);
      setChatError(null);

      const placeholderId = `assistant-${Date.now()}`;
      const placeholderTimestamp = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      setMessages((prev) => [
        ...prev,
        {
          id: placeholderId,
          role: "assistant",
          author: "GPT-5",
          content: "Thinking...",
          timestamp: placeholderTimestamp,
        },
      ]);

      try {
        // Send last 50 messages (increased from 12) for better context
        const trimmedHistory = conversation.slice(-50).map((entry) => ({
          role: entry.role,
          content: entry.content,
        }));

        console.log("=== SENDING TO GPT ===");
        console.log("Chat Parameters:", {
          symbol,
          timeframe: activeTimeframe,
          timeframeConfig: activeConfig,
          fetchInterval: activeConfig.fetchInterval,
          aggregation: activeConfig.aggregation,
          resultInterval:
            activeConfig.aggregation?.resultInterval ??
            activeConfig.fetchInterval,
          messageCount: trimmedHistory.length,
          conversationId,
          analysisMode: chatMode,
          includeCurrentBar,
        });
        console.log(
          "Last message:",
          trimmedHistory[trimmedHistory.length - 1]?.content
        );

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbol,
            timeframe: activeTimeframe,
            messages: trimmedHistory,
            conversationId,
            analysisMode: chatMode,
            includeCurrentBar,
          }),
        });

        const data = await response.json();

        console.log("Received from GPT:", {
          replyLength: data?.reply?.length || 0,
          usage: data?.usage,
          error: data?.error,
        });

        if (!response.ok) {
          throw new Error(data?.error || "Unable to reach GPT-5.");
        }

        const responseMeta = data?.ictMeta;
        if (
          latestTimeframeRef.current === requestTimeframe &&
          latestSymbolRef.current === requestSymbol
        ) {
          setAgentContext({
            ...agentDefaults,
            interval: responseMeta?.interval ?? agentDefaults.interval,
            lookbackBars:
              responseMeta?.lookbackBars ?? agentDefaults.lookbackBars ?? null,
            barsCount: responseMeta?.barsCount ?? null,
            sourceInterval:
              responseMeta?.sourceInterval ?? agentDefaults.sourceInterval ?? null,
            range: responseMeta?.range ?? null,
            tz: responseMeta?.tz ?? null,
            generatedAt: responseMeta?.generatedAt ?? null,
            lastClosedBarTimeISO: responseMeta?.lastClosedBarTimeISO ?? null,
            usage: data?.usage ?? null,
            updatedAt: responseMeta?.generatedAt ?? new Date().toISOString(),
            rangeLabel: agentDefaults.rangeLabel,
            horizon: agentDefaults.horizon,
            includesCurrentBar:
              responseMeta?.includesCurrentBar ?? includeCurrentBar ?? null,
          });
        }

        const replyText =
          (data?.reply as string | undefined)?.trim() ||
          "I wasn't able to generate a response. Please try again.";
        const replyTimestamp = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        setMessages((prev) =>
          prev.map((message) =>
            message.id === placeholderId
              ? {
                  ...message,
                  content: replyText,
                  timestamp: replyTimestamp,
                }
              : message
          )
        );
        setChatError(null);
      } catch (err: any) {
        const fallback =
          "⚠️ Unable to reach GPT-5. Please check your connection and try again.";
        setMessages((prev) =>
          prev.map((message) =>
            message.id === placeholderId
              ? { ...message, content: fallback }
              : message
          )
        );
        setChatError(err?.message || "Unknown error while contacting GPT-5.");
      } finally {
        setIsSending(false);
      }
    },
    [symbol, activeTimeframe, conversationId, chatMode, includeCurrentBar]
  );

  const handleCopyAgentContext = useCallback(async () => {
    const payload = {
      symbol: mergedAgentContext.symbol,
      timeframe: mergedAgentContext.timeframe,
      interval: mergedAgentContext.interval,
      lookbackBars: mergedAgentContext.lookbackBars,
      sourceInterval: mergedAgentContext.sourceInterval,
      start: mergedAgentContext.range?.start ?? null,
      end: mergedAgentContext.range?.end ?? null,
      barsCount: mergedAgentContext.barsCount ?? null,
      horizon: mergedAgentContext.horizon ?? null,
      usage: mergedAgentContext.usage ?? null,
      includesCurrentBar:
        mergedAgentContext.includesCurrentBar ?? includeCurrentBar ?? false,
    };
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setAgentContextCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setAgentContextCopied(false);
        copyTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error("Failed to copy agent context", error);
      setAgentContextCopied(false);
    }
  }, [mergedAgentContext, includeCurrentBar]);

  // Create or restore a conversation on mount
  useEffect(() => {
    const setupConversation = async () => {
      try {
        const existing =
          typeof window !== "undefined"
            ? window.localStorage.getItem("conversationId")
            : null;
        if (existing) {
          setConversationId(existing);
          return;
        }
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `${symbol} session` }),
        });
        const payload = await res.json();
        if (res.ok && payload?.conversation?.id) {
          setConversationId(payload.conversation.id);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              "conversationId",
              payload.conversation.id
            );
          }
        }
      } catch {
        // ignore
      }
    };
    setupConversation();
  }, []);

  useEffect(() => {
    latestTimeframeRef.current = activeTimeframe;
  }, [activeTimeframe]);

  useEffect(() => {
    latestSymbolRef.current = symbol;
  }, [symbol]);

  useEffect(() => {
    setAgentContext(null);
  }, [activeTimeframe, symbol]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const saved = window.localStorage.getItem("includeCurrentBar");
    if (saved !== null) {
      setIncludeCurrentBar(saved === "true");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("includeCurrentBar", String(includeCurrentBar));
  }, [includeCurrentBar]);

  const startNewConversation = async () => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `${symbol} session` }),
      });
      const payload = await res.json();
      if (res.ok && payload?.conversation?.id) {
        setConversationId(payload.conversation.id);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "conversationId",
            payload.conversation.id
          );
        }
        setMessages([]);
        setChatError(null);
        // refresh list
        void loadConversations();
      } else {
        setChatError(payload?.error || "Failed to start new conversation.");
      }
    } catch (e: any) {
      setChatError(e?.message || "Failed to start new conversation.");
    }
  };

  const loadConversations = async () => {
    try {
      setLoadingHistory(true);
      setHistoryError(null);
      const res = await fetch("/api/conversations", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok)
        throw new Error(payload?.error || "Failed to load conversations");
      setConversations(payload?.conversations || []);
    } catch (e: any) {
      setHistoryError(e?.message || "Failed to load conversations");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load conversation list on mount and whenever active conversation changes
  useEffect(() => {
    void loadConversations();
  }, [conversationId]);

  // Hydrate chat history from DB when conversationId becomes available
  useEffect(() => {
    const loadHistory = async () => {
      if (!conversationId) return;
      try {
        hydratingHistoryRef.current = true;
        const res = await fetch(
          `/api/conversations/${conversationId}/messages?limit=200`,
          { cache: "no-store" }
        );
        const payload = await res.json();
        if (!res.ok)
          throw new Error(payload?.error || "Failed to load chat history");
        const mapped: ConversationMessage[] = (payload?.messages || []).map(
          (m: any) => ({
            id: m.id || `db-${Math.random().toString(36).slice(2)}`,
            role: m.role,
            author: m.role === "user" ? "You" : "GPT-5",
            content: m.content,
            timestamp: new Date(m.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          })
        );
        setMessages(mapped);
        setChatError(null);
      } catch (e: any) {
        setChatError(e?.message || "Failed to load chat history");
      } finally {
        hydratingHistoryRef.current = false;
      }
    };
    loadHistory();
  }, [conversationId]);

  const handleMessageSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSending) {
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    const newMessage: ConversationMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      author: "You",
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, newMessage]);
    setDraft("");
  };

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage?.role === "user" &&
      !isSending &&
      !hydratingHistoryRef.current
    ) {
      sendToAssistant(messages);
    }
  }, [messages, isSending, sendToAssistant]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || chartRef.current) {
      return;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: "#0B0E11" },
        textColor: "#D1D4DC",
      },
      grid: {
        vertLines: {
          color: "#1B1F27",
          style: 0,
          visible: true,
        },
        horzLines: {
          color: "#1B1F27",
          style: 0,
          visible: true,
        },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: "#758696",
          width: 1,
          style: 3,
          labelBackgroundColor: "#363C4E",
        },
        horzLine: {
          color: "#758696",
          width: 1,
          style: 3,
          labelBackgroundColor: "#363C4E",
        },
      },
      localization: {
        locale: "en-US",
        timeFormatter: formatCrosshairValue,
      },
      rightPriceScale: {
        borderColor: "#2B2F3A",
        borderVisible: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: "#2B2F3A",
        borderVisible: true,
        secondsVisible: false,
        timeVisible: true,
        rightOffset: 5,
        barSpacing: 6,
        minBarSpacing: 3,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#26A69A",
      downColor: "#EF5350",
      borderVisible: false,
      wickUpColor: "#26A69A",
      wickDownColor: "#EF5350",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    setChartReady(true);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width && entry.contentRect.height) {
        chart.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
        chart.timeScale().fitContent();
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    if (!chartReady || !seriesRef.current) {
      return;
    }

    let isCancelled = false;
    const config = timeframeConfig[activeTimeframe];
    const now = new Date();
    const start = sub(now, config.subtract);
    const params = new URLSearchParams({
      symbol,
      startDate: start.toISOString(),
      endDate: now.toISOString(),
      interval: config.fetchInterval,
    });

    const cacheKey = `${symbol}-${activeTimeframe}-${config.fetchInterval}`;

    const loadData = async () => {
      setChartLoading(true);
      setChartError(null);

      try {
        let payload = priceDataCache.get(cacheKey);
        if (!payload) {
          const response = await fetch(
            `/api/price-history?${params.toString()}`
          );
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data?.error || "Failed to load price data.");
          }

          const receivedBars = (data?.bars ?? []) as PriceBar[];

          if (receivedBars.length === 0) {
            throw new Error("No price data available for this timeframe.");
          }

          // Clean anomalous data before aggregation
          const cleanedBars = validateAndCleanBars(receivedBars);

          const processedBars = aggregatePriceBars(
            cleanedBars,
            config.aggregation
          );

          const intervalLabel = config.aggregation
            ? config.aggregation.resultInterval
            : data.interval ?? config.fetchInterval;

          payload = {
            interval: intervalLabel,
            bars: processedBars,
          };
          priceDataCache.set(cacheKey, payload);
        }

        if (isCancelled || !seriesRef.current) {
          return;
        }

        let candlesticks: CandlestickData[] = payload.bars.map((bar) => ({
          time: toChartTime(bar.time, payload.interval),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }));

        // Check for and remove duplicate timestamps (lightweight-charts requirement)
        const timesSeen = new Set<Time>();
        const duplicates: Time[] = [];
        candlesticks = candlesticks.filter((candle) => {
          if (timesSeen.has(candle.time)) {
            duplicates.push(candle.time);
            return false;
          }
          timesSeen.add(candle.time);
          return true;
        });

        // Verify timestamps are in ascending order and sort if needed
        let outOfOrder = 0;
        for (let i = 1; i < candlesticks.length; i++) {
          if (candlesticks[i].time <= candlesticks[i - 1].time) {
            outOfOrder++;
          }
        }
        if (outOfOrder > 0) {
          candlesticks.sort((a, b) => {
            const aTime = typeof a.time === "number" ? a.time : 0;
            const bTime = typeof b.time === "number" ? b.time : 0;
            return aTime - bTime;
          });
        }

        if (candlesticks.length === 0) {
          seriesRef.current.setData([]);
          setHasChartData(false);
          setChartError("No price data available for this timeframe.");
          setChartMeta({ interval: payload.interval });
          setPriceBars([]);
          return;
        }

        seriesRef.current.setData(candlesticks);

        // For 1-minute timeframe, manually set visible range to ensure all data is shown
        // fitContent() sometimes doesn't work properly with large datasets
        const timeScale = chartRef.current?.timeScale();
        if (timeScale && activeTimeframe === "1m" && candlesticks.length > 0) {
          const firstTime =
            typeof candlesticks[0].time === "number" ? candlesticks[0].time : 0;
          const lastTimeRaw = candlesticks[candlesticks.length - 1].time;
          const lastTime = typeof lastTimeRaw === "number" ? lastTimeRaw : 0;

          if (firstTime && lastTime) {
            // Calculate a reasonable initial view: show the last 500 bars (approximately 8 hours for 1min)
            const barsToShow = Math.min(500, candlesticks.length);
            const startIndex = Math.max(0, candlesticks.length - barsToShow);
            const startTime =
              typeof candlesticks[startIndex].time === "number"
                ? candlesticks[startIndex].time
                : firstTime;

            try {
              timeScale.setVisibleRange({
                from: startTime as Time,
                to: lastTime as Time,
              });
            } catch (error) {
              // Fallback to fitContent on error
              chartRef.current?.timeScale().fitContent();
            }
          } else {
            chartRef.current?.timeScale().fitContent();
          }
        } else {
          chartRef.current?.timeScale().fitContent();
        }

        setHasChartData(true);
        setChartMeta({
          interval: payload.interval,
          lastBar: payload.bars[payload.bars.length - 1]?.time,
        });
        setPriceBars(payload.bars);
      } catch (err: any) {
        if (isCancelled) return;
        setHasChartData(false);
        setChartMeta(null);
        setChartError(err?.message || "Failed to load price data.");
        seriesRef.current?.setData([]);
        setPriceBars([]);
      } finally {
        if (!isCancelled) {
          setChartLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [symbol, activeTimeframe, chartReady]);

  // Lightweight intraday polling to keep candles moving during market hours
  useEffect(() => {
    if (!chartReady || !seriesRef.current) {
      return;
    }

    // Only poll on intraday views
    if (!intradayTimeframes.has(activeTimeframe)) {
      setIsLiveUpdating(false);
      return;
    }

    let isCancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Pick a sensible polling cadence per timeframe
    const pollingMs: Record<TimeframeKey, number> = {
      "1m": 15000, // 15 seconds keeps us under Alpha Vantage 5/minute cap
      "5m": 30000, // 30 seconds
      "15m": 60000, // 60 seconds
      "1H": 120000, // 2 minutes
      "4H": 180000, // 3 minutes
      "1D": 180000,
      "3M": 180000,
      "6M": 180000,
      "1Y": 180000,
      Max: 180000,
    };

    const tick = async () => {
      if (isCancelled || !seriesRef.current) return;

      try {
        const config = timeframeConfig[activeTimeframe];
        const now = new Date();
        const start = sub(now, config.subtract);
        const params = new URLSearchParams({
          symbol,
          startDate: start.toISOString(),
          endDate: now.toISOString(),
          interval: config.fetchInterval,
          // bust any intermediary caches
          nocache: String(Date.now()),
        });

        const response = await fetch(`/api/price-history?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Failed to refresh price data.");
        }

        const receivedBars = (data?.bars ?? []) as PriceBar[];
        if (receivedBars.length === 0) {
          throw new Error("No price data available for this timeframe.");
        }

        // Clean anomalous data before aggregation
        const cleanedBars = validateAndCleanBars(receivedBars);

        const processedBars = aggregatePriceBars(
          cleanedBars,
          config.aggregation
        );
        const intervalLabel = config.aggregation
          ? config.aggregation.resultInterval
          : data.interval ?? config.fetchInterval;

        let candlesticks: CandlestickData[] = processedBars.map((bar) => ({
          time: toChartTime(bar.time, intervalLabel),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }));

        // Check for and remove duplicate timestamps (lightweight-charts requirement)
        const timesSeen = new Set<Time>();
        candlesticks = candlesticks.filter((candle) => {
          if (timesSeen.has(candle.time)) {
            return false;
          }
          timesSeen.add(candle.time);
          return true;
        });

        // Verify timestamps are in ascending order and sort if needed
        let outOfOrder = 0;
        for (let i = 1; i < candlesticks.length; i++) {
          if (candlesticks[i].time <= candlesticks[i - 1].time) {
            outOfOrder++;
          }
        }
        if (outOfOrder > 0) {
          candlesticks.sort((a, b) => {
            const aTime = typeof a.time === "number" ? a.time : 0;
            const bTime = typeof b.time === "number" ? b.time : 0;
            return aTime - bTime;
          });
        }

        if (isCancelled || !seriesRef.current) return;

        // Update series
        seriesRef.current.setData(candlesticks);

        // For 1m timeframe, update visible range to show the latest data
        // while maintaining the current zoom level
        if (activeTimeframe === "1m" && candlesticks.length > 0) {
          const timeScale = chartRef.current?.timeScale();
          if (timeScale) {
            const currentRange = timeScale.getVisibleRange();
            const lastTime =
              typeof candlesticks[candlesticks.length - 1].time === "number"
                ? candlesticks[candlesticks.length - 1].time
                : 0;

            if (currentRange && lastTime) {
              // Calculate the current visible range width
              const fromTime =
                typeof currentRange.from === "number" ? currentRange.from : 0;
              const toTime =
                typeof currentRange.to === "number" ? currentRange.to : 0;
              const rangeWidth = toTime - fromTime;

              // Keep the same zoom level but scroll to show the latest data
              // Only update if we're already viewing near the end (within 10% of the range)
              const distanceFromEnd = lastTime - toTime;
              const shouldScroll = distanceFromEnd > rangeWidth * 0.1;

              if (shouldScroll) {
                try {
                  timeScale.setVisibleRange({
                    from: (lastTime - rangeWidth) as Time,
                    to: lastTime as Time,
                  });
                } catch (error) {
                  // Ignore errors in updating visible range
                }
              }
            }
          }
        }

        setHasChartData(true);
        setChartMeta({
          interval: intervalLabel,
          lastBar: processedBars[processedBars.length - 1]?.time,
        });
        setPriceBars(processedBars);
        // keep cache warm for future switches
        const cacheKey = `${symbol}-${activeTimeframe}-${config.fetchInterval}`;
        priceDataCache.set(cacheKey, {
          interval: intervalLabel,
          bars: processedBars,
        });
      } catch (err) {
        // Soft-fail: keep previous data and try again on next tick
        // Optionally we could backoff here on rate limits (HTTP 429)
      } finally {
        if (!isCancelled) {
          timer = setTimeout(tick, pollingMs[activeTimeframe]);
        }
      }
    };

    setIsLiveUpdating(true);
    timer = setTimeout(tick, pollingMs[activeTimeframe]);

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = null;
      } else {
        // restart loop on resume
        if (!timer) timer = setTimeout(tick, 250);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      setIsLiveUpdating(false);
    };
  }, [activeTimeframe, chartReady, symbol]);

  useEffect(() => {
    if (!chartReady || !chartRef.current) {
      return;
    }

    const tickMarkFormatter = (
      time: Time,
      _type: TickMarkType,
      _locale: string
    ) => formatTimeScaleTick(time, activeTimeframe);

    chartRef.current.applyOptions({
      timeScale: {
        timeVisible: intradayTimeframes.has(activeTimeframe),
        secondsVisible: activeTimeframe === "1m",
        tickMarkFormatter,
      },
    });

    // Don't call fitContent here for 1m timeframe - it's already handled in the data loading effect
    // Calling it again would reset the visible range we just set
    if (activeTimeframe !== "1m") {
      chartRef.current.timeScale().fitContent();
    }
  }, [activeTimeframe, chartReady]);

  return (
    <div
      className={`min-h-screen bg-background text-text-primary flex flex-col ${
        isResizing ? "cursor-col-resize select-none" : ""
      }`}
    >
      <div className="mx-auto flex w-full max-w-[2000px] flex-col px-6 flex-shrink-0">
        <header className="flex flex-col gap-3 mb-6 pt-6">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium uppercase tracking-[0.2em] text-text-secondary">
              Live Market Companion
            </span>
            <button
              onClick={toggleChat}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition bg-background-subtle text-text-secondary hover:text-text-primary border border-border hover:border-primary/50"
            >
              {isChatVisible ? "Hide Chat" : "Show Chat"}
            </button>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Chart Workspace &amp; GPT-5 Copilot
          </h1>
          <p className="max-w-3xl text-sm text-text-secondary">
            Enter a ticker to explore market context, then collaborate with the
            GPT-5 trading assistant for scenario planning, risk management, and
            execution prep.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-background-surface p-5 shadow-lg mb-6">
          <form
            className="flex flex-col gap-4 md:flex-row md:items-end"
            onSubmit={handleSymbolSubmit}
          >
            <div className="flex flex-1 flex-col gap-2">
              <label
                htmlFor="symbol"
                className="text-xs font-semibold uppercase tracking-wide text-text-secondary"
              >
                Ticker Symbol
              </label>
              <div className="relative">
                <input
                  id="symbol"
                  name="symbol"
                  value={symbolInput}
                  onChange={(event) => setSymbolInput(event.target.value)}
                  placeholder="e.g. AAPL, ES, BTC"
                  className="w-full rounded-xl border border-border bg-background-subtle px-4 py-3 text-lg font-semibold uppercase tracking-wide text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40"
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-medium text-text-tertiary">
                  US
                </span>
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold uppercase tracking-wide text-text-inverted transition hover:bg-primary-hover"
            >
              Load Chart
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {presetSymbols.map((preset) => {
              const isActive = preset === symbol;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? "border-primary text-primary-text bg-primary/10"
                      : "border-border text-text-secondary hover:border-primary/60 hover:text-text-primary"
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="mx-auto flex w-full max-w-[2000px] px-6 gap-4 pb-6 min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            <section className="flex flex-col h-full gap-4 rounded-2xl border border-border bg-background-surface p-5 shadow-lg ring-1 ring-border/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {symbol} Price Action
                  </h2>
                  <p className="text-sm text-text-secondary">
                    Live chart powered by Alpha Vantage data with adaptive
                    timeframes and execution overlays.
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-background-subtle px-3 py-1 text-xs text-text-secondary">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  Market data link healthy
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {timeframeOrder.map((option) => {
                  const selected = option === activeTimeframe;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setActiveTimeframe(option)}
                      className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                        selected
                          ? "bg-primary text-text-inverted shadow-lg ring-2 ring-primary/50"
                          : "bg-background-subtle text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                {isLiveUpdating && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-background-subtle px-3 py-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                    </span>
                    Live updating
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  ICT Overlays
                </span>
                <IctToggles
                  toggles={ictToggles}
                  onToggle={handleToggleChange}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                <span>{activeConfig.description}</span>
                <span>Interval: {formatIntervalDisplay(metaInterval)}</span>
                {chartMeta?.lastBar && (
                  <span>
                    Last bar: {formatBarLabel(chartMeta.lastBar, metaInterval)}
                  </span>
                )}
                {ictAnalysis?.structure.bias && (
                  <span>Bias: {ictAnalysis.structure.bias}</span>
                )}
                {ictAnalysis?.dealingRange && (
                  <span>
                    PD: {ictAnalysis.dealingRange.pdPercent.toFixed(1)}%
                  </span>
                )}
              </div>

              <div className="relative flex-1 overflow-hidden rounded-xl border border-border bg-background-subtle shadow-inner min-h-[500px]">
                <div
                  ref={chartContainerRef}
                  className="absolute inset-0 w-full h-full"
                />
                <IctOverlays
                  chart={chartReady ? chartRef.current : null}
                  series={chartReady ? seriesRef.current : null}
                  analysis={ictAnalysis}
                  bars={priceBars}
                  interval={analysisInterval}
                  toggles={ictToggles}
                />

                {chartLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 text-sm text-text-secondary backdrop-blur-xs">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>Loading market data...</span>
                  </div>
                )}

                {chartError && !chartLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 px-6 text-center text-sm text-error-text backdrop-blur-xs">
                    <span>⚠️ {chartError}</span>
                    <span className="text-text-secondary">
                      Adjust the timeframe or try again in a moment.
                    </span>
                  </div>
                )}

                {!chartError && !chartLoading && !hasChartData && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 px-6 text-center text-sm text-text-tertiary backdrop-blur-xs">
                    <span>No data yet for this selection.</span>
                    <span>
                      Try a different timeframe or confirm the symbol.
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>

          {isChatVisible && (
            <>
              <div
                className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors flex-shrink-0 relative group"
                onMouseDown={handleResizeStart}
                style={{ userSelect: "none" }}
              >
                <div className="absolute inset-y-0 -inset-x-2" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-12 rounded-full bg-border group-hover:bg-primary/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <svg
                    className="w-3 h-3 text-text-secondary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                    />
                  </svg>
                </div>
              </div>
              <div
                className="flex flex-col flex-shrink-0 overflow-hidden"
                style={{ width: `${chatWidth}px` }}
              >
                <div className="flex flex-col gap-4 h-full">
                  <aside className="flex flex-col gap-3 rounded-2xl border border-border bg-background-surface p-4 shadow-lg flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold tracking-tight">
                        GPT-5 Tactical Notes
                      </h2>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary-text">
                        Live
                      </span>
                    </div>
                    <div className="space-y-3 text-xs text-text-secondary">
                      <p>
                        GPT-5 will ingest this chart, macro context, and your
                        playbook to surface executable scenarios.
                      </p>
                      <ul className="space-y-1.5">
                        <li className="flex items-start gap-2">
                          <span className="mt-1 h-1 w-1 rounded-full bg-primary flex-shrink-0" />
                          <span>Streaming order flow and liquidity zones</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-1 h-1 w-1 rounded-full bg-primary flex-shrink-0" />
                          <span>Risk, execution, and review loops</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-1 h-1 w-1 rounded-full bg-primary flex-shrink-0" />
                          <span>Multi-scenario planning</span>
                        </li>
                      </ul>
                    </div>
                  </aside>

                  <section className="flex flex-col gap-4 rounded-2xl border border-border bg-background-surface p-5 shadow-lg flex-1 min-h-0">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold tracking-tight">
                          GPT-5 Trade Chat
                        </h2>
                        <p className="text-xs text-text-secondary truncate">
                          Context:{" "}
                          <span className="font-medium text-text-primary">
                            {symbol}
                          </span>
                        </p>
                        <p className="text-[11px] text-text-tertiary truncate">
                          Mode:{" "}
                          <span className="font-semibold text-text-primary">
                            {chatModeDetails.label}
                          </span>{" "}
                          · {chatModeDetails.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                            Mode
                          </span>
                          <div className="flex rounded-lg border border-border overflow-hidden">
                            {(["plan", "chat"] as const).map((mode) => {
                              const isActive = chatMode === mode;
                              return (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setChatMode(mode)}
                                  className={`px-3 py-1 text-xs font-semibold transition rounded-md ${
                                    isActive
                                      ? "bg-primary text-text-inverted shadow-lg border-2 border-primary-hover"
                                      : "bg-background-subtle text-text-secondary hover:text-text-primary"
                                  }`}
                                  aria-pressed={isActive}
                                >
                                  {mode === "plan" ? "Plan" : "Chat"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowHistory((v) => !v)}
                          className="rounded-lg px-3 py-1 text-xs font-medium transition bg-background-subtle text-text-secondary hover:text-text-primary border border-border hover:border-primary/50"
                        >
                          {showHistory ? "Hide History" : "History"}
                        </button>
                        <button
                          type="button"
                          onClick={startNewConversation}
                          className="rounded-lg px-3 py-1 text-xs font-semibold bg-primary text-text-inverted hover:bg-primary-hover"
                        >
                          New Chat
                        </button>
                      </div>
                    </div>

                    {showHistory && (
                      <div className="rounded-lg border border-border bg-background-subtle p-3 text-xs max-h-56 overflow-y-auto">
                        {loadingHistory ? (
                          <div className="text-text-tertiary">
                            Loading conversations…
                          </div>
                        ) : historyError ? (
                          <div className="text-error-text">{historyError}</div>
                        ) : conversations.length === 0 ? (
                          <div className="text-text-tertiary">
                            No conversations yet.
                          </div>
                        ) : (
                          conversations.map((c) => {
                            const active = c.id === conversationId;
                            const used = c.token_used || 0;
                            const budget = c.token_budget || 1;
                            const pct = Math.min(
                              100,
                              Math.round((used / budget) * 100)
                            );
                            const title = c.title || "Untitled chat";
                            const updated = new Date(
                              c.updated_at
                            ).toLocaleString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              month: "short",
                              day: "numeric",
                            });
                            return (
                              <button
                                key={c.id}
                                onClick={() => {
                                  setConversationId(c.id);
                                  if (typeof window !== "undefined") {
                                    window.localStorage.setItem(
                                      "conversationId",
                                      c.id
                                    );
                                  }
                                  setMessages([]);
                                  setShowHistory(false);
                                }}
                                className={`w-full text-left rounded-md px-2 py-2 border transition ${
                                  active
                                    ? "border-primary/60 bg-primary/5"
                                    : "border-border hover:border-primary/40 hover:bg-background"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium truncate mr-2">
                                    {title}
                                  </span>
                                  <span className="text-text-tertiary">
                                    {updated}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-text-tertiary">
                                  <div className="h-1.5 w-24 bg-border rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span>{pct}%</span>
                                  {c.status === "closed" && (
                                    <span className="ml-2 rounded-sm bg-border px-1 py-0.5 text-[10px] text-text-secondary">
                                      closed
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}

                    <div className="rounded-xl border border-border bg-background-subtle p-3 text-xs text-text-secondary">
                      <button
                        type="button"
                        onClick={() => setIsAgentContextOpen((prev) => !prev)}
                        className="flex w-full items-center justify-between gap-3"
                      >
                        <div className="text-left">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                            Agent Context
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-text-primary">
                            <span>{agentSummary}</span>
                            {effectiveIncludeCurrentBar && (
                              <span className="inline-flex items-center rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                                Current Bar
                              </span>
                            )}
                          </div>
                        </div>
                        <svg
                          className={`h-4 w-4 text-text-tertiary transition-transform ${
                            isAgentContextOpen ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      <div className={`mt-3 flex flex-col gap-2 ${includeToggleContainerClass}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-semibold text-text-primary">
                              Include current bar
                            </span>
                            <span className="text-[10px] text-text-secondary">
                              Gives GPT the still-forming candle (may change).
                            </span>
                          </div>
                          <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-full bg-background-subtle px-2 py-1 text-[11px] font-semibold text-text-secondary">
                            <input
                              type="checkbox"
                              className="peer sr-only"
                              checked={includeCurrentBar}
                              onChange={(event) =>
                                setIncludeCurrentBar(event.target.checked)
                              }
                              aria-label="Toggle include current bar"
                            />
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] ${
                                includeCurrentBar
                                  ? "bg-warning text-warning-text"
                                  : "bg-border text-text-secondary"
                              }`}
                            >
                              {includeCurrentBar ? "ON" : "OFF"}
                            </span>
                            <div className="relative h-5 w-9 rounded-full border border-border bg-background transition peer-checked:border-warning peer-checked:bg-warning">
                              <span className="absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-text-secondary transition peer-checked:translate-x-4 peer-checked:bg-white" />
                            </div>
                          </label>
                        </div>
                        <span className={`text-[10px] font-medium ${includeStatusClass}`}>
                          {includeStatusText}
                        </span>
                      </div>
                      {isAgentContextOpen && (
                        <div className="mt-3 space-y-3">
                          <dl className="grid grid-cols-2 gap-3 text-[11px]">
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
                                UI timeframe
                              </dt>
                              <dd className="font-semibold text-text-primary">
                                {mergedAgentContext.timeframe}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
                                Enforced interval
                              </dt>
                              <dd className="font-semibold text-text-primary">
                                {agentIntervalLabel}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
                                Lookback bars
                              </dt>
                              <dd className="font-semibold text-text-primary">
                                {mergedAgentContext.lookbackBars ?? "—"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
                                Bars analyzed
                              </dt>
                              <dd className="font-semibold text-text-primary">
                                {mergedAgentContext.barsCount ?? "—"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
                                Source interval
                              </dt>
                              <dd className="font-semibold text-text-primary">
                                {agentSourceIntervalLabel ?? "—"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
                                Horizon
                              </dt>
                              <dd className="font-semibold text-text-primary">
                                {mergedAgentContext.horizon ?? "—"}
                              </dd>
                            </div>
                            <div className="col-span-2">
                              <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
                                Range
                              </dt>
                              <dd className="font-semibold text-text-primary">
                                {agentRangeDisplay}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
                                Last closed bar (ET)
                              </dt>
                              <dd className="font-semibold text-text-primary">
                                {lastClosedBarLabel ? `${lastClosedBarLabel} ET` : "—"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
                                Updated (ET)
                              </dt>
                              <dd className="font-semibold text-text-primary">
                                {updatedLabel ? `${updatedLabel} ET` : "Waiting"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
                                Time zone
                              </dt>
                              <dd className="font-semibold text-text-primary">
                                {mergedAgentContext.tz ?? TIME_ZONE}
                              </dd>
                            </div>
                            <div className="col-span-2">
                              <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
                                Current bar mode
                              </dt>
                              <dd className={`font-semibold ${currentBarModeClass}`}>
                                {effectiveIncludeCurrentBar
                                  ? "Including current forming bar"
                                  : "Closed bars only"}
                              </dd>
                            </div>
                          </dl>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <span className="text-text-tertiary">
                              Usage (prompt/completion/total):{" "}
                              {agentUsageLabel
                                ? `${agentUsageLabel} tokens`
                                : "pending"}
                            </span>
                            <button
                              type="button"
                              onClick={handleCopyAgentContext}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-text-primary transition hover:border-primary/60 hover:text-primary-text"
                            >
                              {agentContextCopied ? "Copied" : "Copy JSON"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-background-subtle p-4 min-h-0 h-[60vh]">
                      {messages.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center text-xs text-text-tertiary text-center px-4">
                          No messages yet. Ask GPT-5 for order flow reads,
                          execution plans, or risk checks.
                        </div>
                      ) : (
                        messages.map((message) => {
                          const isUser = message.role === "user";
                          return (
                            <div
                              key={message.id}
                              className={`flex flex-col gap-1.5 ${
                                isUser
                                  ? "items-end text-right"
                                  : "items-start text-left"
                              }`}
                            >
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                                {message.author} • {message.timestamp}
                              </span>
                              <div
                                className={`max-w-[90%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                                  isUser
                                    ? "bg-primary text-text-inverted"
                                    : "border border-primary/30 bg-background-surface text-text-primary shadow-inner"
                                }`}
                              >
                                {message.content}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {chatError && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-xs text-error-text flex-shrink-0">
                        <span className="truncate">{chatError}</span>
                        {chatError.toLowerCase().includes("token limit") && (
                          <button
                            type="button"
                            onClick={startNewConversation}
                            className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-text-inverted hover:bg-primary-hover"
                          >
                            Start New Chat
                          </button>
                        )}
                      </div>
                    )}

                    <form
                      className="flex flex-col gap-2 rounded-xl border border-border bg-background-subtle p-3 flex-shrink-0"
                      onSubmit={handleMessageSubmit}
                    >
                      <label
                        htmlFor="chat-input"
                        className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary"
                      >
                        Message GPT-5
                      </label>
                      <textarea
                        id="chat-input"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Ask for execution plans, risk checks, or level-by-level guidance..."
                        rows={3}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-text-primary outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/30"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs font-medium text-text-secondary transition hover:text-text-primary hover:bg-background-subtle"
                            disabled={isSending}
                          >
                            Summarize
                          </button>
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs font-medium text-text-secondary transition hover:text-text-primary hover:bg-background-subtle"
                            disabled={isSending}
                          >
                            Flag Risk
                          </button>
                        </div>
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-text-inverted transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-border disabled:opacity-50"
                          disabled={isSending || !draft.trim()}
                        >
                          {isSending ? "Sending..." : "Send"}
                        </button>
                      </div>
                    </form>
                  </section>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChartView;
