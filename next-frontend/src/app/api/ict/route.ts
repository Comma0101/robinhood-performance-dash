import { NextResponse } from "next/server";
import { analyzeICT } from "@/lib/ict";
import type { ICTAnalysisOptions, ICTBar, ICTInterval } from "@/lib/ict";
import { toTimeZoneDate } from "@/lib/ict/utils";

const INTRADAY_INTERVAL_MS: Record<string, number> = {
  "1min": 60 * 1000,
  "5min": 5 * 60 * 1000,
  "15min": 15 * 60 * 1000,
  "30min": 30 * 60 * 1000,
  "60min": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
};

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

const getIntervalDurationMs = (interval: string): number => {
  if (interval in INTRADAY_INTERVAL_MS) {
    return INTRADAY_INTERVAL_MS[interval];
  }
  if (interval === "daily") {
    return DAILY_INTERVAL_MS;
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

const defaultLookbackForInterval = (interval: string): number => {
  if (interval === "daily") {
    return 500;
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
  ["1min", "5min", "15min", "30min", "60min", "4h", "daily"].includes(interval);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") ?? "15min";
  const lookbackParam = searchParams.get("lookbackBars");
  const session = (searchParams.get("session") as "NY" | "LDN" | null) ?? "NY";

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
  const bufferMultiplier = 1.5;
  const lookbackDurationMs = Math.ceil(lookbackBars * intervalDurationMs * bufferMultiplier);
  const startDate = new Date(now.getTime() - lookbackDurationMs);

  const fetchInterval = interval === "4h" ? "60min" : interval;

  const priceHistoryUrl = new URL(request.url);
  priceHistoryUrl.pathname = "/api/price-history";
  priceHistoryUrl.search = "";
  priceHistoryUrl.searchParams.set("symbol", symbol);
  priceHistoryUrl.searchParams.set("interval", fetchInterval);
  priceHistoryUrl.searchParams.set("startDate", startDate.toISOString());
  priceHistoryUrl.searchParams.set("endDate", now.toISOString());

  let priceResponse: Response;
  try {
    priceResponse = await fetch(priceHistoryUrl.toString());
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

  if (interval === "4h") {
    workingBars = aggregateIntradayBars(workingBars, 240);
  }

  if (workingBars.length > lookbackBars) {
    workingBars = workingBars.slice(workingBars.length - lookbackBars);
  }

  const analysis = analyzeICT(workingBars, {
    symbol,
    interval,
    lookbackBars,
    session,
  } satisfies ICTAnalysisOptions);

  return NextResponse.json(analysis);
}
