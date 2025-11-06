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

const presetSymbols = ["AAPL", "TSLA", "NVDA", "SPY", "MSFT"];
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
    fetchInterval: "5min",
    subtract: { days: 5 },
    description: "Intraday structure (5-minute candles)",
  },
  "15m": {
    fetchInterval: "15min",
    subtract: { weeks: 2 },
    description: "Tactical flow (15-minute candles)",
  },
  "1H": {
    fetchInterval: "60min",
    subtract: { months: 1 },
    description: "Hourly rhythm (60-minute candles)",
  },
  "4H": {
    fetchInterval: "60min",
    subtract: { months: 3 },
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
    description: "Quarterly performance (daily candles)",
  },
  "6M": {
    fetchInterval: "daily",
    subtract: { months: 6 },
    description: "Half-year structure (daily candles)",
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

const intradayIntervals = new Set([
  "1min",
  "5min",
  "15min",
  "30min",
  "60min",
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

  const sorted = [...bars].sort(
    (a, b) =>
      toTimeZoneDate(a.time).getTime() - toTimeZoneDate(b.time).getTime()
  );

  const aggregated: PriceBar[] = [];
  let currentBucket: PriceBar | null = null;
  let bucketStartTime: number | null = null;

  for (const bar of sorted) {
    const barDate = toTimeZoneDate(bar.time);

    // Calculate which bucket this bar belongs to
    // Align to minute intervals (e.g., for 4H = 240min, align to midnight + N*240min)
    const minuteOfDay = barDate.getHours() * 60 + barDate.getMinutes();
    const bucketIndex = Math.floor(minuteOfDay / minutes);
    const bucketMinute = bucketIndex * minutes;

    // Create bucket start time aligned to the interval
    const alignedBucketStart = new Date(barDate);
    alignedBucketStart.setHours(Math.floor(bucketMinute / 60));
    alignedBucketStart.setMinutes(bucketMinute % 60);
    alignedBucketStart.setSeconds(0);
    alignedBucketStart.setMilliseconds(0);

    const alignedBucketTime = alignedBucketStart.getTime();

    // Start new bucket if needed
    if (bucketStartTime === null || alignedBucketTime !== bucketStartTime) {
      if (currentBucket) {
        aggregated.push(currentBucket);
      }

      // Format the aligned time back to string format
      const year = alignedBucketStart.getFullYear();
      const month = String(alignedBucketStart.getMonth() + 1).padStart(2, '0');
      const day = String(alignedBucketStart.getDate()).padStart(2, '0');
      const hour = String(alignedBucketStart.getHours()).padStart(2, '0');
      const minute = String(alignedBucketStart.getMinutes()).padStart(2, '0');
      const second = String(alignedBucketStart.getSeconds()).padStart(2, '0');
      const alignedTimeString = `${year}-${month}-${day} ${hour}:${minute}:${second}`;

      currentBucket = {
        time: alignedTimeString,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      };
      bucketStartTime = alignedBucketTime;
    } else if (currentBucket) {
      // Update existing bucket
      currentBucket.high = Math.max(currentBucket.high, bar.high);
      currentBucket.low = Math.min(currentBucket.low, bar.low);
      currentBucket.close = bar.close;
      currentBucket.volume += bar.volume;
    }
  }

  // Don't forget the last bucket
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

  // Calculate median absolute deviation for outlier detection
  const prices = bars.flatMap(b => [b.high, b.low]);
  const median = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];

  // Calculate average true range for the dataset
  let totalRange = 0;
  for (let i = 1; i < bars.length; i++) {
    const range = bars[i].high - bars[i].low;
    const prevClose = bars[i - 1].close;
    const trueRange = Math.max(
      range,
      Math.abs(bars[i].high - prevClose),
      Math.abs(bars[i].low - prevClose)
    );
    totalRange += trueRange;
  }
  const avgTrueRange = totalRange / (bars.length - 1);

  // Filter out bars with extreme ranges (likely data errors)
  // Keep bars where the range is less than 10x the average true range
  const maxReasonableRange = avgTrueRange * 10;

  return bars.filter((bar) => {
    const barRange = bar.high - bar.low;
    const isReasonable = barRange <= maxReasonableRange;

    // Also check if prices are wildly different from median (likely errors)
    const highDiff = Math.abs(bar.high - median) / median;
    const lowDiff = Math.abs(bar.low - median) / median;
    const withinBounds = highDiff < 0.5 && lowDiff < 0.5; // Within 50% of median

    return isReasonable && withinBounds;
  });
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
    return "1W";
  }

  return interval;
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
  const hydratingHistoryRef = useRef(false);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);
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
  const [conversations, setConversations] = useState<{
    id: string;
    title: string | null;
    updated_at: string;
    status: string;
    token_used: number;
    token_budget: number;
  }[]>([]);
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
      const newWidth = Math.max(300, Math.min(800, resizeStartRef.current.width + deltaX));
      setChatWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, chatWidth]);

  const sendToAssistant = useCallback(
    async (conversation: ConversationMessage[]) => {
      if (conversation.length === 0) return;

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

        console.log("Sending to GPT:", {
          symbol,
          timeframe: activeTimeframe,
          messageCount: trimmedHistory.length,
          lastMessage: trimmedHistory[trimmedHistory.length - 1]?.content
        });

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
          }),
        });

        const data = await response.json();

        console.log("Received from GPT:", {
          replyLength: data?.reply?.length || 0,
          usage: data?.usage,
          error: data?.error
        });

        if (!response.ok) {
          throw new Error(data?.error || "Unable to reach GPT-5.");
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
    [symbol, activeTimeframe, conversationId]
  );

  // Create or restore a conversation on mount
  useEffect(() => {
    const setupConversation = async () => {
      try {
        const existing = typeof window !== 'undefined' ? window.localStorage.getItem('conversationId') : null;
        if (existing) {
          setConversationId(existing);
          return;
        }
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `${symbol} session` })
        });
        const payload = await res.json();
        if (res.ok && payload?.conversation?.id) {
          setConversationId(payload.conversation.id);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('conversationId', payload.conversation.id);
          }
        }
      } catch {
        // ignore
      }
    };
    setupConversation();
  }, []);

  const startNewConversation = async () => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${symbol} session` })
      });
      const payload = await res.json();
      if (res.ok && payload?.conversation?.id) {
        setConversationId(payload.conversation.id);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('conversationId', payload.conversation.id);
        }
        setMessages([]);
        setChatError(null);
        // refresh list
        void loadConversations();
      } else {
        setChatError(payload?.error || 'Failed to start new conversation.');
      }
    } catch (e: any) {
      setChatError(e?.message || 'Failed to start new conversation.');
    }
  };

  const loadConversations = async () => {
    try {
      setLoadingHistory(true);
      setHistoryError(null);
      const res = await fetch('/api/conversations', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to load conversations');
      setConversations(payload?.conversations || []);
    } catch (e: any) {
      setHistoryError(e?.message || 'Failed to load conversations');
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
        const res = await fetch(`/api/conversations/${conversationId}/messages?limit=200`, { cache: 'no-store' });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || 'Failed to load chat history');
        const mapped: ConversationMessage[] = (payload?.messages || []).map((m: any) => ({
          id: m.id || `db-${Math.random().toString(36).slice(2)}`,
          role: m.role,
          author: m.role === 'user' ? 'You' : 'GPT-5',
          content: m.content,
          timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
        setMessages(mapped);
        setChatError(null);
      } catch (e: any) {
        setChatError(e?.message || 'Failed to load chat history');
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
    if (lastMessage?.role === "user" && !isSending && !hydratingHistoryRef.current) {
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
          height: entry.contentRect.height
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

        const candlesticks: CandlestickData[] = payload.bars.map((bar) => ({
          time: toChartTime(bar.time, payload.interval),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }));

        if (candlesticks.length === 0) {
          seriesRef.current.setData([]);
          setHasChartData(false);
          setChartError("No price data available for this timeframe.");
          setChartMeta({ interval: payload.interval });
          setPriceBars([]);
          return;
        }

        seriesRef.current.setData(candlesticks);
        chartRef.current?.timeScale().fitContent();

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
      "1m": 5000,
      "5m": 15000,
      "15m": 30000,
      "1H": 60000,
      "4H": 120000,
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

        const processedBars = aggregatePriceBars(cleanedBars, config.aggregation);
        const intervalLabel = config.aggregation
          ? config.aggregation.resultInterval
          : data.interval ?? config.fetchInterval;

        const candlesticks: CandlestickData[] = processedBars.map((bar) => ({
          time: toChartTime(bar.time, intervalLabel),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }));

        if (isCancelled || !seriesRef.current) return;

        // Update series without refitting view
        seriesRef.current.setData(candlesticks);

        setHasChartData(true);
        setChartMeta({
          interval: intervalLabel,
          lastBar: processedBars[processedBars.length - 1]?.time,
        });
        setPriceBars(processedBars);
        // keep cache warm for future switches
        const cacheKey = `${symbol}-${activeTimeframe}-${config.fetchInterval}`;
        priceDataCache.set(cacheKey, { interval: intervalLabel, bars: processedBars });
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
  }, [activeTimeframe, chartReady]);

  return (
    <div className={`min-h-screen bg-background text-text-primary flex flex-col ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      <div className="mx-auto flex w-full max-w-[2000px] flex-col px-6 flex-shrink-0">
        <header className="flex flex-col gap-3 mb-6 pt-6">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium uppercase tracking-[0.2em] text-text-secondary">
              Live Market Companion
            </span>
            <button onClick={toggleChat} className="rounded-lg px-3 py-1.5 text-sm font-medium transition bg-background-subtle text-text-secondary hover:text-text-primary border border-border hover:border-primary/50">
              {isChatVisible ? 'Hide Chat' : 'Show Chat'}
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
                <div ref={chartContainerRef} className="absolute inset-0 w-full h-full" />
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
                style={{ userSelect: 'none' }}
              >
                <div className="absolute inset-y-0 -inset-x-2" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-12 rounded-full bg-border group-hover:bg-primary/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <svg className="w-3 h-3 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
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
                        GPT-5 will ingest this chart, macro context, and your playbook to surface executable scenarios.
                      </p>
                      <ul className="space-y-1.5">
                        <li className="flex items-start gap-2">
                          <span className="mt-1 h-1 w-1 rounded-full bg-primary flex-shrink-0" />
                          <span>
                            Streaming order flow and liquidity zones
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-1 h-1 w-1 rounded-full bg-primary flex-shrink-0" />
                          <span>
                            Risk, execution, and review loops
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-1 h-1 w-1 rounded-full bg-primary flex-shrink-0" />
                          <span>
                            Multi-scenario planning
                          </span>
                        </li>
                      </ul>
                    </div>
                  </aside>

                  <section className="flex flex-col gap-4 rounded-2xl border border-border bg-background-surface p-5 shadow-lg flex-1 min-h-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold tracking-tight">
                          GPT-5 Trade Chat
                        </h2>
                        <p className="text-xs text-text-secondary truncate">
                          Context: <span className="font-medium text-text-primary">{symbol}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowHistory((v) => !v)}
                          className="rounded-lg px-3 py-1 text-xs font-medium transition bg-background-subtle text-text-secondary hover:text-text-primary border border-border hover:border-primary/50"
                        >
                          {showHistory ? 'Hide History' : 'History'}
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
                          <div className="text-text-tertiary">Loading conversations…</div>
                        ) : historyError ? (
                          <div className="text-error-text">{historyError}</div>
                        ) : conversations.length === 0 ? (
                          <div className="text-text-tertiary">No conversations yet.</div>
                        ) : (
                          conversations.map((c) => {
                            const active = c.id === conversationId;
                            const used = c.token_used || 0;
                            const budget = c.token_budget || 1;
                            const pct = Math.min(100, Math.round((used / budget) * 100));
                            const title = c.title || 'Untitled chat';
                            const updated = new Date(c.updated_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
                            return (
                              <button
                                key={c.id}
                                onClick={() => {
                                  setConversationId(c.id);
                                  if (typeof window !== 'undefined') {
                                    window.localStorage.setItem('conversationId', c.id);
                                  }
                                  setMessages([]);
                                  setShowHistory(false);
                                }}
                                className={`w-full text-left rounded-md px-2 py-2 border transition ${active ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-background'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium truncate mr-2">{title}</span>
                                  <span className="text-text-tertiary">{updated}</span>
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-text-tertiary">
                                  <div className="h-1.5 w-24 bg-border rounded-full overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span>{pct}%</span>
                                  {c.status === 'closed' && (
                                    <span className="ml-2 rounded-sm bg-border px-1 py-0.5 text-[10px] text-text-secondary">closed</span>
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}

                    <div className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-background-subtle p-4 min-h-0">
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
                        {chatError.toLowerCase().includes('token limit') && (
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
