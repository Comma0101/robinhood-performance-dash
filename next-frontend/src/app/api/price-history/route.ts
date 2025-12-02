import { NextResponse } from "next/server";
import { makeNyDateString, toTimeZoneDate } from "@/lib/ict/utils";

interface AlphaVantageBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const interval = searchParams.get("interval"); // New: get interval from query

  if (!symbol || !startDate || !endDate) {
    return NextResponse.json(
      { error: "Missing required parameters: symbol, startDate, endDate" },
      { status: 400 }
    );
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Alpha Vantage API key not configured" },
      { status: 500 }
    );
  }

  // Simple in-memory cache to soften API hiccups and rate limits
  type CacheEntry = {
    ts: number;
    interval: string;
    bars: AlphaVantageBar[];
  };
  const g = globalThis as unknown as { __priceCache?: Map<string, CacheEntry> };
  if (!g.__priceCache) g.__priceCache = new Map();
  const cache = g.__priceCache;

  const ttlFor = (i: string) => {
    if (i === "daily") return 10 * 60 * 1000; // 10m
    return 60 * 1000; // 1m for intraday
  };

  const fetchWithRetry = async (url: string, attempts = 3, timeoutMs = 10000) => {
    let lastError: any = null;
    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) return res;

        // Log error response body for debugging
        let errorBody = "";
        try {
          errorBody = await res.text();
          console.error(`Alpha Vantage error (${res.status}):`, errorBody.substring(0, 500));
        } catch {}

        // Retry on transient errors
        if ([429, 500, 502, 503, 504].includes(res.status)) {
          const backoff = Math.min(2000 * (i + 1), 5000) + Math.random() * 250;
          console.log(`Alpha Vantage ${res.status} error, retry ${i + 1}/${attempts} after ${Math.floor(backoff)}ms`);
          await new Promise((r) => setTimeout(r, backoff));
          lastError = new Error(`Alpha Vantage transient status: ${res.status} ${errorBody ? '- ' + errorBody.substring(0, 100) : ''}`);
          continue;
        }
        // Non-retryable
        throw new Error(`Alpha Vantage API request failed: ${res.status} ${errorBody ? '- ' + errorBody.substring(0, 100) : ''}`);
      } catch (err: any) {
        clearTimeout(timeout);
        if (err?.name === "AbortError") {
          lastError = new Error("Alpha Vantage request timeout");
        } else {
          lastError = err;
        }
        // small backoff before next attempt
        const backoff = Math.min(2000 * (i + 1), 5000) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw lastError ?? new Error("Alpha Vantage request failed");
  };

  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const holdingPeriodDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Determine which Alpha Vantage endpoint to use based on holding period
    let url: string;
    let timeKey: string;
    let effectiveInterval: string;

    // New logic: Prioritize the requested interval if valid
    if (
      interval &&
      ["1min", "5min", "15min", "30min", "60min"].includes(interval)
    ) {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&entitlement=realtime&apikey=${apiKey}&outputsize=full`;
      timeKey = `Time Series (${interval})`;
      effectiveInterval = interval;
    } else if (interval === "daily") {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&entitlement=realtime&apikey=${apiKey}&outputsize=full`;
      timeKey = "Time Series (Daily)";
      effectiveInterval = "daily";
    } else if (holdingPeriodDays <= 5) {
      // Fallback for short trades: 15-minute intervals
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=15min&entitlement=realtime&apikey=${apiKey}&outputsize=full`;
      timeKey = "Time Series (15min)";
      effectiveInterval = "15min";
    } else {
      // Fallback for long trades: daily data
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&entitlement=realtime&apikey=${apiKey}&outputsize=full`;
      timeKey = "Time Series (Daily)";
      effectiveInterval = "daily";
    }

    const cacheKey = `${symbol}:${effectiveInterval}`;

    // Try API with retries and timeout
    let response: Response | null = null;
    try {
      response = await fetchWithRetry(url, 3, 10000);
    } catch (apiErr: any) {
      console.log(`Alpha Vantage API failed for ${cacheKey}, attempting cache fallback...`);

      // Try to serve cached data for the requested interval (up to 24h old)
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 24 * 60 * 60 * 1000) {
        const bars = cached.bars
          .filter((b) => {
            const t = toTimeZoneDate(b.time).getTime();
            return t >= new Date(startDate).getTime() && t < new Date(endDate).getTime();
          })
          .sort((a, b) => toTimeZoneDate(a.time).getTime() - toTimeZoneDate(b.time).getTime());
        if (bars.length > 0) {
          console.log(`Serving stale cache for ${cacheKey} (${Math.floor((Date.now() - cached.ts) / 60000)} mins old)`);
          return NextResponse.json({ symbol, interval: cached.interval, bars, stale: true });
        }
      }

      // Try fallback intervals if requesting intraday data
      const fallbackIntervals = ["5min", "15min", "30min", "60min"];
      if (effectiveInterval !== "daily" && !fallbackIntervals.includes(effectiveInterval)) {
        fallbackIntervals.unshift(effectiveInterval);
      }

      for (const fallbackInterval of fallbackIntervals) {
        if (fallbackInterval === effectiveInterval) continue;
        const fallbackKey = `${symbol}:${fallbackInterval}`;
        const fallbackCached = cache.get(fallbackKey);
        if (fallbackCached && Date.now() - fallbackCached.ts < 24 * 60 * 60 * 1000) {
          const bars = fallbackCached.bars
            .filter((b) => {
              const t = toTimeZoneDate(b.time).getTime();
              return t >= new Date(startDate).getTime() && t < new Date(endDate).getTime();
            })
            .sort((a, b) => toTimeZoneDate(a.time).getTime() - toTimeZoneDate(b.time).getTime());
          if (bars.length > 0) {
            console.log(`Serving fallback cache ${fallbackKey} instead of ${cacheKey}`);
            return NextResponse.json({ symbol, interval: fallbackCached.interval, bars, stale: true, fallback: true });
          }
        }
      }

      // Last resort: try fetching a lower-resolution interval from the API
      if (effectiveInterval === "1min") {
        console.log(`Attempting live fallback to 5min interval...`);
        try {
          const fallbackUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=5min&entitlement=realtime&apikey=${apiKey}&outputsize=full`;
          response = await fetchWithRetry(fallbackUrl, 2, 10000);
          effectiveInterval = "5min";
          timeKey = "Time Series (5min)";
          console.log(`Successfully fetched 5min fallback data for ${symbol}`);
        } catch (fallbackErr) {
          console.error(`Fallback to 5min also failed:`, fallbackErr);
        }
      }

      // If still no response, propagate original error
      if (!response) {
        console.error(`No usable cache or fallback found for ${cacheKey}, propagating error`);
        throw apiErr;
      }
    }

    const data = await response.json();

    // Check for API error messages
    if (data["Error Message"]) {
      return NextResponse.json(
        { error: `Alpha Vantage error: ${data["Error Message"]}` },
        { status: 400 }
      );
    }

    if (data["Note"]) {
      return NextResponse.json(
        { error: "API rate limit reached. Please try again in a minute." },
        { status: 429 }
      );
    }

    // Check for daily rate limit (free tier: 25 requests/day)
    if (data["Information"] && data["Information"].includes("rate limit")) {
      return NextResponse.json(
        {
          error:
            "Alpha Vantage daily API limit reached (25 requests/day on free tier). The limit resets at midnight EST. Consider upgrading your API plan for more requests.",
          rateLimitInfo: data["Information"],
        },
        { status: 429 }
      );
    }

    const timeSeries = data[timeKey];
    if (!timeSeries) {
      // Log the response for debugging
      console.error("Alpha Vantage Response:", JSON.stringify(data, null, 2));
      console.error("Expected time key:", timeKey);
      console.error("Available keys:", Object.keys(data));

      return NextResponse.json(
        {
          error:
            "No time series data found in response. This could be due to API rate limits or invalid symbol.",
          details: Object.keys(data).join(", "),
        },
        { status: 404 }
      );
    }

    // Parse and filter data for the requested date range
    const bars: AlphaVantageBar[] = [];

    // For same-day trades, show the entire trading day
    let startTime: number;
    let endTime: number;

    if (holdingPeriodDays <= 5) {
      // Intraday trade - expand to include full New York trading days
      const nyStartMidnight = toTimeZoneDate(
        makeNyDateString(start, 0, 0, 0)
      ).getTime();
      const nyEndNextDayMidnight = toTimeZoneDate(
        makeNyDateString(new Date(end.getTime() + 24 * 60 * 60 * 1000), 0, 0, 0)
      ).getTime();

      startTime = nyStartMidnight;
      endTime = nyEndNextDayMidnight;
    } else {
      // Multi-day trade - use exact range
      startTime = start.getTime();
      endTime = end.getTime();
    }

    const allBars: AlphaVantageBar[] = [];

    for (const [timestamp, values] of Object.entries(timeSeries)) {
      const nyDate = toTimeZoneDate(timestamp);
      const barTime = nyDate.getTime();

      if (Number.isNaN(barTime)) {
        continue;
      }

      const typedValues = values as {
        "1. open": string;
        "2. high": string;
        "3. low": string;
        "4. close": string;
        "5. volume": string;
      };

      const parsedBar: AlphaVantageBar = {
        time: timestamp,
        open: parseFloat(typedValues["1. open"]),
        high: parseFloat(typedValues["2. high"]),
        low: parseFloat(typedValues["3. low"]),
        close: parseFloat(typedValues["4. close"]),
        volume: parseFloat(typedValues["5. volume"]),
      };

      allBars.push(parsedBar);

      // Include bars within the date range
      if (barTime >= startTime && barTime < endTime) {
        bars.push(parsedBar);
      }
    }

    // Fallback: if range filter produced no data (e.g., due to timezone drift or API quirks),
    // return the most recent bars so the chart has something to render.
    if (bars.length === 0 && allBars.length > 0) {
      allBars.sort(
        (a, b) =>
          toTimeZoneDate(a.time).getTime() - toTimeZoneDate(b.time).getTime()
      );
      const fallbackSample = allBars.slice(-2000);
      bars.push(...fallbackSample);
    }

    // Sort by time (oldest first)
    bars.sort(
      (a, b) =>
        toTimeZoneDate(a.time).getTime() - toTimeZoneDate(b.time).getTime()
    );

    // Update cache with the full set we fetched for this interval
    try {
      const now = Date.now();
      const existing = cache.get(cacheKey);
      const isFresh = existing && now - existing.ts < ttlFor(effectiveInterval);
      if (!isFresh) {
        cache.set(cacheKey, { ts: now, interval: effectiveInterval, bars: allBars });
      }
    } catch {}

    return NextResponse.json({
      symbol,
      interval: effectiveInterval,
      bars,
    });
  } catch (error) {
    console.error("Error fetching price history:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch price history";
    const isRateOrService = /rate limit|timeout|transient status|503|502|504/i.test(message);
    const status = isRateOrService ? 503 : 500;

    // Enhanced error message for the frontend
    let enhancedMessage = message;
    if (isRateOrService) {
      enhancedMessage = `Alpha Vantage API is temporarily unavailable (${message}). Data may be outdated or unavailable. Please try again in a few moments.`;
    }

    return NextResponse.json({
      error: enhancedMessage,
      details: message,
      retryable: isRateOrService
    }, { status });
  }
}
