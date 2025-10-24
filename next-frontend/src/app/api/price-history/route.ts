import { NextResponse } from "next/server";

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
    if (interval && ["1min", "5min", "15min"].includes(interval)) {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&apikey=${apiKey}&outputsize=full`;
      timeKey = `Time Series (${interval})`;
      effectiveInterval = interval;
    } else if (holdingPeriodDays <= 5) {
      // Fallback for short trades: 15-minute intervals
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=15min&apikey=${apiKey}&outputsize=full`;
      timeKey = "Time Series (15min)";
      effectiveInterval = "15min";
    } else {
      // Fallback for long trades: daily data
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}&outputsize=full`;
      timeKey = "Time Series (Daily)";
      effectiveInterval = "daily";
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Alpha Vantage API request failed: ${response.status}`);
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
      // Intraday trade - expand to include full trading hours
      const tradeStartDate = new Date(start);
      const dayStart = new Date(
        tradeStartDate.getFullYear(),
        tradeStartDate.getMonth(),
        tradeStartDate.getDate()
      );

      const tradeEndDate = new Date(end);
      const dayEnd = new Date(
        tradeEndDate.getFullYear(),
        tradeEndDate.getMonth(),
        tradeEndDate.getDate() + 1
      );

      startTime = dayStart.getTime();
      endTime = dayEnd.getTime();
    } else {
      // Multi-day trade - use exact range
      startTime = start.getTime();
      endTime = end.getTime();
    }

    for (const [timestamp, values] of Object.entries(timeSeries)) {
      const barTime = new Date(timestamp).getTime();

      // Include bars within the date range
      if (barTime >= startTime && barTime < endTime) {
        const typedValues = values as {
          "1. open": string;
          "2. high": string;
          "3. low": string;
          "4. close": string;
          "5. volume": string;
        };

        bars.push({
          time: timestamp,
          open: parseFloat(typedValues["1. open"]),
          high: parseFloat(typedValues["2. high"]),
          low: parseFloat(typedValues["3. low"]),
          close: parseFloat(typedValues["4. close"]),
          volume: parseFloat(typedValues["5. volume"]),
        });
      }
    }

    // Sort by time (oldest first)
    bars.sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    return NextResponse.json({
      symbol,
      interval: effectiveInterval,
      bars,
    });
  } catch (error) {
    console.error("Error fetching price history:", error);
    return NextResponse.json(
      { error: "Failed to fetch price history" },
      { status: 500 }
    );
  }
}
