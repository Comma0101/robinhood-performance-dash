# Chart View Real-Time Data Notes

## Context

We were seeing the 1H and 4H candles (and any GPT analysis run against those timeframes) lag several hours behind the 1-minute stream. Daily views looked fine. The issue only surfaced in environments where the server process ran outside the New York time zone (e.g., PST).

## Root Cause

Alpha Vantage sends intraday timestamps as New York time strings (`YYYY-MM-DD HH:MM:SS`). In our `/api/price-history` route we converted those strings with `new Date(timestamp)`, which interprets them as *local* time. On a PST host, a bar like `2025-11-06 11:30:00` was treated as `2025-11-06T11:30:00-08:00`, effectively shifting the candle three hours into the future. When we filtered bars with `startDate/endDate`, any bar whose interpreted time exceeded `endDate` was dropped, so we always lost the latest few hours of data.

The 1H/4H views—and the `/api/ict` agent endpoint—aggregate that API payload. Because the freshest bars never arrived, those timeframes stayed stale.

## Fixes

1. **Timezone-safe parsing in `/api/price-history`**  
   File: `src/app/api/price-history/route.ts`  
   We now reuse utility helpers (`toTimeZoneDate`, `makeNyDateString`). Every timestamp coming from Alpha Vantage is explicitly converted as `America/New_York`, so filtering and sorting happens in the correct zone. Date-range filtering for intraday requests now snaps to New York midnight boundaries rather than the server’s local time, ensuring we keep the current trading session while still expanding to the full day. If the range filter ever produces zero bars (e.g., API hiccup, DST edge case), we fall back to the most recent 2,000 raw bars so the UI always has something to render. Invalid timestamps are skipped defensively.

2. **String based bucketing in `ChartView` aggregation**  
   File: `src/components/ChartView.tsx`  
   - Added `parseTimestampParts(...)` to extract `dateKey` and `minuteOfDay` without relying on host-local `Date` math.  
   - `aggregateIntradayBars(...)` sorts bars lexicographically by the timestamp string and builds bucket keys manually (`YYYY-MM-DD HH:MM:00`). This keeps the aggregation aligned to the New York session even when running on another timezone.
   - 1m/5m/15m/1H views now fetch 1-minute bars and aggregate client-side, ensuring consistent polling cadence and avoiding Alpha Vantage’s throttled 5/15/60 minute series unless absolutely necessary. (4H still fetches `60min` data and combines 4 candles at a time.)

3. **Consistent intraday polling**  
   The intraday polling loop in `ChartView` keeps fetching fresh data every 5–20 seconds (depending on timeframe) and uses the same aggregation pipeline, so the cache stays warm across timeframe switches.

## Data Flow Overview

```
ChartView (client) 
  └── fetch /api/price-history?symbol=...&interval=...&start=...&end=...
        └── Server route builds Alpha Vantage request
              └── Alpha Vantage returns raw OHLCV keyed by NY timestamps
        └── Server filters bars using NY dates, returns JSON
  └── Client caches payload per symbol/timeframe
  └── Client aggregates to the active timeframe (if needed) and renders

/api/chat (agent) 
  └── Model requests ICT analysis (ict_analyze tool)
        └── /api/ict fetches price history via the same route above
        └── Aggregates to requested interval and runs ICT detectors
```

Because `/api/ict` ultimately depends on `/api/price-history`, fixing the timezone handling there automatically refreshed the dataset the agent sees.

## Verification Checklist

1. **Manual chart check**  
   - Hard refresh the chart view (cache key bust).  
   - Confirm the 1H and 4H candles show timestamps matching the current NY session.  
   - Toggle between timeframes; the final candle should stay in sync with the 1m view.

2. **Agent sanity check**  
   - Ask the GPT assistant for an analysis on any intraday timeframe.  
   - Verify the `Latest Bar` timestamp in the response matches the chart’s final candle.

3. **Edge cases to watch**  
   - API quota exhaustion (`429` from Alpha Vantage) will still pause updates.  
   - If Alpha Vantage sends malformed timestamps, they are ignored—keep an eye on logs for repeated skips.

## Future Considerations

- Add automated tests that force `process.env.TZ` to a non-NY zone and assert the most recent candle survives the filter.
- Consider persisting Alpha Vantage responses server-side so we can smooth over short outages and reduce quota usage.
- Document the Alpha Vantage entitlement/frequency limits (currently real-time 1-minute updates; quota is 25k/day for our key) for anyone expanding the polling cadence.
