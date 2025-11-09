import { NextResponse } from "next/server";
import { analyzeICT } from "@/lib/ict";
import type { ICTAnalysisOptions, ICTBar, ICTInterval } from "@/lib/ict";
import { isBarFullyClosed, toTimeZoneDate } from "@/lib/ict/utils";

const INTRADAY_INTERVAL_MS: Record<string, number> = {
  "1min": 60 * 1000,
  "5min": 5 * 60 * 1000,
  "15min": 15 * 60 * 1000,
  "30min": 30 * 60 * 1000,
  "60min": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
};

type AggregationConfig =
  | { type: "intraday"; sourceInterval: ICTInterval; minutes: number }
  | { type: "daily"; sourceInterval: ICTInterval; period: "weekly" | "monthly" };

const AGGREGATION_CONFIG: Record<string, AggregationConfig> = {
  "5min": { type: "intraday", sourceInterval: "1min", minutes: 5 },
  "15min": { type: "intraday", sourceInterval: "1min", minutes: 15 },
  "4h": { type: "intraday", sourceInterval: "60min", minutes: 240 },
  weekly: { type: "daily", sourceInterval: "daily", period: "weekly" },
  monthly: { type: "daily", sourceInterval: "daily", period: "monthly" },
};

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WEEKLY_INTERVAL_MS = 7 * DAILY_INTERVAL_MS;
const MONTHLY_INTERVAL_MS = 30 * DAILY_INTERVAL_MS;

const getIntervalDurationMs = (interval: string): number => {
  if (interval in INTRADAY_INTERVAL_MS) {
    return INTRADAY_INTERVAL_MS[interval];
  }
  if (interval === "daily") {
    return DAILY_INTERVAL_MS;
  }
  if (interval === "weekly") {
    return WEEKLY_INTERVAL_MS;
  }
  if (interval === "monthly") {
    return MONTHLY_INTERVAL_MS;
  }
  // Default to daily granularity for unknown intervals.
  return DAILY_INTERVAL_MS;
};

const aggregateIntradayBars = (bars: ICTBar[], minutes: number): ICTBar[] => {
  if (bars.length === 0) {
    return [];
  }

  const sorted = [...bars].sort(
    (a, b) => toTimeZoneDate(a.time).getTime() - toTimeZoneDate(b.time).getTime()
  );

  const aggregated: ICTBar[] = [];
  let groupStartBar: ICTBar | null = null;
  let groupStartDate: Date | null = null;
  let workingBar: ICTBar | null = null;

  for (const bar of sorted) {
    const barDate = toTimeZoneDate(bar.time);

    if (!groupStartBar || !groupStartDate || !workingBar) {
      groupStartBar = bar;
      groupStartDate = barDate;
      workingBar = { ...bar };
      continue;
    }

    const minutesDiff = (barDate.getTime() - groupStartDate.getTime()) / (1000 * 60);
    const crossesNewDay = barDate.getDate() !== groupStartDate.getDate();

    if (minutesDiff >= minutes || crossesNewDay) {
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

const getWeekBucketKey = (date: Date): string => {
  const working = new Date(date.getTime());
  const day = working.getDay(); // 0 (Sun) -> 6 (Sat)
  const diffFromMonday = (day + 6) % 7;
  working.setDate(working.getDate() - diffFromMonday);
  return working.toISOString().split("T")[0];
};

const getMonthBucketKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
};

const aggregateDailyBars = (bars: ICTBar[], period: "weekly" | "monthly"): ICTBar[] => {
  if (bars.length === 0) {
    return [];
  }
  const sorted = [...bars].sort(
    (a, b) => toTimeZoneDate(a.time).getTime() - toTimeZoneDate(b.time).getTime()
  );
  const aggregated: ICTBar[] = [];
  let currentKey: string | null = null;
  let workingBar: ICTBar | null = null;

  for (const bar of sorted) {
    const barDate = toTimeZoneDate(bar.time);
    const bucketKey =
      period === "weekly" ? getWeekBucketKey(barDate) : getMonthBucketKey(barDate);

    if (!currentKey || bucketKey !== currentKey || !workingBar) {
      if (workingBar) {
        aggregated.push(workingBar);
      }
      currentKey = bucketKey;
      workingBar = { ...bar };
      continue;
    }

    workingBar.high = Math.max(workingBar.high, bar.high);
    workingBar.low = Math.min(workingBar.low, bar.low);
    workingBar.close = bar.close;
    workingBar.volume += bar.volume;
  }

  if (workingBar) {
    aggregated.push(workingBar);
  }

  return aggregated;
};

const defaultLookbackForInterval = (interval: string): number => {
  if (interval === "daily") {
    return 500;
  }
  if (interval === "weekly") {
    return 260;
  }
  if (interval === "monthly") {
    return 120;
  }
  if (interval === "4h") {
    return 750;
  }
  if (interval === "60min") {
    return 1200;
  }
  return 1500;
};

const isValidInterval = (interval: string): interval is ICTInterval | "4h" =>
  ["1min", "5min", "15min", "30min", "60min", "4h", "daily", "weekly", "monthly"].includes(interval);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") ?? "15min";
  const lookbackParam = searchParams.get("lookbackBars");
  const session = (searchParams.get("session") as "NY" | "LDN" | null) ?? "NY";
  const includeCurrentBar = searchParams.get("includeCurrentBar") === "true";
  const comparativeParam = searchParams.get("comparativeSymbols");
  const comparativeSymbols = comparativeParam
    ? comparativeParam
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value && value !== symbol?.toUpperCase())
    : [];

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  if (!isValidInterval(interval)) {
    return NextResponse.json(
      { error: `Unsupported interval: ${interval}` },
      { status: 400 }
    );
  }

  let lookbackBars = defaultLookbackForInterval(interval);
  if (lookbackParam) {
    const parsed = Number.parseInt(lookbackParam, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return NextResponse.json(
        { error: "lookbackBars must be a positive integer" },
        { status: 400 }
      );
    }
    lookbackBars = parsed;
  }

  const now = new Date();
  const intervalDurationMs = getIntervalDurationMs(interval);
  const dropIncompleteBars = (barsToFilter: ICTBar[]): ICTBar[] => {
    const filtered = [...barsToFilter];
    while (
      filtered.length > 0 &&
      !isBarFullyClosed(filtered[filtered.length - 1].time, now, intervalDurationMs)
    ) {
      filtered.pop();
    }
    return filtered;
  };
  const bufferMultiplier = 1.5;
  const lookbackDurationMs = Math.ceil(lookbackBars * intervalDurationMs * bufferMultiplier);
  const startDate = new Date(now.getTime() - lookbackDurationMs);

  const aggregationSpec = AGGREGATION_CONFIG[interval];
  const fetchInterval = aggregationSpec?.sourceInterval ?? interval;

  const priceHistoryUrl = new URL(request.url);
  priceHistoryUrl.pathname = "/api/price-history";
  priceHistoryUrl.search = "";
  priceHistoryUrl.searchParams.set("symbol", symbol);
  priceHistoryUrl.searchParams.set("interval", fetchInterval);
  priceHistoryUrl.searchParams.set("startDate", startDate.toISOString());
  priceHistoryUrl.searchParams.set("endDate", now.toISOString());
  priceHistoryUrl.searchParams.set("nocache", Date.now().toString());

  let priceResponse: Response;
  try {
    priceResponse = await fetch(priceHistoryUrl.toString(), { cache: "no-store" });
  } catch (error) {
    console.error("ICT analysis price history fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch price history for ICT analysis." },
      { status: 502 }
    );
  }

  if (!priceResponse.ok) {
    const errorPayload = await priceResponse.json().catch(() => ({}));
    return NextResponse.json(
      {
        error: "Price history request failed.",
        details: errorPayload?.error ?? priceResponse.statusText,
      },
      { status: priceResponse.status }
    );
  }

  const priceData = await priceResponse.json();
  const bars = (priceData?.bars ?? []) as ICTBar[];

  if (!Array.isArray(bars) || bars.length === 0) {
    return NextResponse.json(
      { error: "No price data available for ICT analysis." },
      { status: 404 }
    );
  }

  let workingBars = [...bars];

  if (aggregationSpec?.type === "intraday") {
    workingBars = aggregateIntradayBars(workingBars, aggregationSpec.minutes);
  } else if (aggregationSpec?.type === "daily") {
    workingBars = aggregateDailyBars(workingBars, aggregationSpec.period);
  }

  if (workingBars.length > lookbackBars) {
    workingBars = workingBars.slice(workingBars.length - lookbackBars);
  }

  let closedBars = includeCurrentBar ? workingBars : dropIncompleteBars(workingBars);
  if (!includeCurrentBar && closedBars.length === 0) {
    closedBars = workingBars;
  }

  const comparativeSeries: Record<string, ICTBar[]> = {};

  for (const compSymbol of comparativeSymbols) {
    const compUrl = new URL(priceHistoryUrl.toString());
    compUrl.searchParams.set("symbol", compSymbol);
    compUrl.searchParams.set("nocache", Date.now().toString());

    let compResponse: Response;
    try {
      compResponse = await fetch(compUrl.toString(), { cache: "no-store" });
    } catch (error) {
      console.warn(`[ICT] Failed to fetch comparative series for ${compSymbol}:`, error);
      continue;
    }

    if (!compResponse.ok) {
      console.warn(`[ICT] Comparative series request failed for ${compSymbol}:`, compResponse.statusText);
      continue;
    }

    const compPayload = await compResponse.json().catch(() => ({}));
    let compBars = (compPayload?.bars ?? []) as ICTBar[];
    if (!Array.isArray(compBars) || compBars.length === 0) {
      continue;
    }
    if (aggregationSpec?.type === "intraday") {
      compBars = aggregateIntradayBars(compBars, aggregationSpec.minutes);
    } else if (aggregationSpec?.type === "daily") {
      compBars = aggregateDailyBars(compBars, aggregationSpec.period);
    }
    if (compBars.length > lookbackBars) {
      compBars = compBars.slice(compBars.length - lookbackBars);
    }
    const closedComp = includeCurrentBar ? compBars : dropIncompleteBars(compBars);
    comparativeSeries[compSymbol] =
      includeCurrentBar || closedComp.length > 0 ? closedComp : compBars;
  }

  const analysis = analyzeICT(closedBars, {
    symbol,
    interval,
    lookbackBars,
    session,
    comparativeSymbols,
    comparativeSeries,
  } satisfies ICTAnalysisOptions);
  const barsCount = closedBars.length;
  const rangeStart = closedBars[0]?.time ?? analysis.meta.range?.start ?? "";
  const rangeEnd =
    closedBars[closedBars.length - 1]?.time ?? analysis.meta.range?.end ?? "";
  const lastBar = analysis.meta.lastBar;
  const pricePrecision = analysis.meta.pricePrecision ?? 4;
  const summaryTime = analysis.meta.lastClosedBarTimeISO ?? lastBar?.time ?? null;
  const summaryTz = analysis.meta.exchangeTZ ?? analysis.meta.tz;
  const formatPrice = (value: number) => value.toFixed(pricePrecision);
  const currentBarSummary = lastBar
    ? `barTimeISO=${summaryTime} exchangeTZ=${summaryTz} O=${formatPrice(lastBar.open)} H=${formatPrice(
        lastBar.high
      )} L=${formatPrice(lastBar.low)} C=${formatPrice(lastBar.close)} V=${Math.round(
        lastBar.volume
      )}`
    : null;
  const enrichedAnalysis = {
    ...analysis,
    meta: {
      ...analysis.meta,
      range: {
        start: rangeStart,
        end: rangeEnd,
      },
      lookbackBars,
      barsCount,
      sourceInterval: fetchInterval,
      generatedAt: now.toISOString(),
      currentBar: analysis.meta.lastBar,
      currentBarSummary,
      includesCurrentBar: includeCurrentBar,
    },
  };

  return NextResponse.json(enrichedAnalysis);
}
