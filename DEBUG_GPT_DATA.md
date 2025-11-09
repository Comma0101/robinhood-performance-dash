# Debugging GPT Data & Interval Fixes

## Summary of Changes

### 1. Fixed Weekly (1W) and Monthly (1M) Intervals
**Problem**: These timeframes were previously labeled as 3M and 6M, and showed daily candles instead of weekly/monthly aggregations.

**Solution**:
- **1W timeframe**: Now aggregates daily data into **weekly candles** (7-day periods) over 3 months
- **1M timeframe**: Now aggregates daily data into **monthly candles** (30-day periods) over 6 months

**Files Modified**:
- `next-frontend/src/components/ChartView.tsx`
  - Renamed "3M" to "1W" and "6M" to "1M" in timeframeOrder (line 56-57)
  - Updated timeframeConfig keys from "3M"/"6M" to "1W"/"1M" (lines 109-120)
  - Added `aggregation: { type: "daily", days: 7, resultInterval: "weekly" }` for 1W
  - Added `aggregation: { type: "daily", days: 30, resultInterval: "monthly" }` for 1M
  - Updated descriptions to reflect weekly/monthly candles
  - Added monthly display format
  - Updated pollingMs and timeframeTickOptions to use "1W" and "1M"

### 2. Enhanced Logging for GPT Data Debugging

Added comprehensive console logging to track exactly what data is sent to ChatGPT/GPT-5.

**Chat Route Logging** (`next-frontend/src/app/api/chat/route.ts`):

```javascript
// Line ~352: ICT Analysis Parameters
console.log("ICT Analysis Parameters:", {
  symbol: toolSymbol,
  interval,
  lookbackBars,
  session: sessionInput,
  timeframe: timeframe,
  desiredInterval
});

// Line ~375: ICT Data Received
console.log("Data Metadata:", {
  symbol: ictPayload.meta?.symbol,
  interval: ictPayload.meta?.interval,
  sourceInterval: ictPayload.meta?.sourceInterval,
  dateRangeStart: ictPayload.meta?.range?.start,
  dateRangeEnd: ictPayload.meta?.range?.end,
  lastBarTime: ictPayload.meta?.lastBar?.time,
  lastClosedBarTime: ictPayload.meta?.lastClosedBarTimeISO,
  dateRangeSpan: "start to end range"
});
```

**ChartView Logging** (`next-frontend/src/components/ChartView.tsx`):

```javascript
// Line ~748: Chat Parameters
console.log("=== SENDING TO GPT ===");
console.log("Chat Parameters:", {
  symbol,
  timeframe: activeTimeframe,
  timeframeConfig: activeConfig,
  fetchInterval: activeConfig.fetchInterval,
  aggregation: activeConfig.aggregation,
  resultInterval: activeConfig.aggregation?.resultInterval ?? activeConfig.fetchInterval,
  messageCount: trimmedHistory.length,
  conversationId,
  analysisMode: chatMode
});
```

### 3. Enhanced File Logging System

Created a new logging utility that saves all server-side logs to a file:

**New File**: `next-frontend/src/lib/logger.ts`
- Automatically logs all ICT requests/responses to `debug.log`
- Includes timestamps and structured JSON data
- No more truncated terminal output
- Full ICT payload saved for analysis

**Usage in code**:
```typescript
import { logger } from "@/lib/logger";

logger.section("=== My Section ===");
logger.log("Message", { data: "value" });
logger.debug("Debug info", complexObject);
logger.error("Error message", errorDetails);
```

### 4. Updated Interval Mapping
Updated the `mapTimeframeToInterval` function to properly handle weekly and monthly intervals:

```javascript
case "3m":
case "weekly":
  return "daily"; // Will be aggregated to weekly

case "6m":
case "monthly":
  return "daily"; // Will be aggregated to monthly
```

## How to Test

### 1. Start the Development Server
```bash
cd next-frontend
npm run dev
```

### 2. View Debug Logs

**Option A: Debug Log File (Recommended)**
All server-side logs are automatically saved to `next-frontend/debug.log`. This file contains the complete logs without terminal length limits.

```bash
# Watch the log file in real-time
tail -f next-frontend/debug.log

# View the complete log
cat next-frontend/debug.log

# Clear the log file
> next-frontend/debug.log
```

**Option B: Browser Console**
Open your browser's developer console (F12) to see client-side and some server logs (may be truncated).

### 3. Test 1W Timeframe (Weekly Candles)
1. Go to the chart page
2. Select **AAPL** (or any symbol)
3. Click the **1W** timeframe button
4. Check console logs for:
   ```
   Chat Parameters: {
     timeframe: "1W",
     fetchInterval: "daily",
     aggregation: { type: "daily", days: 7, resultInterval: "weekly" },
     resultInterval: "weekly"
   }
   ```
5. Verify chart shows weekly candles (check the interval display shows "1W")

### 4. Test 1M Timeframe (Monthly Candles)
1. Click the **1M** timeframe button
2. Check console logs for:
   ```
   Chat Parameters: {
     timeframe: "1M",
     fetchInterval: "daily",
     aggregation: { type: "daily", days: 30, resultInterval: "monthly" },
     resultInterval: "monthly"
   }
   ```
3. Verify chart shows monthly candles (check the interval display shows "1M")

### 5. Test GPT Agent with Chat
1. Open the chat panel
2. Ask GPT a question like: "What's the current market structure?"
3. Check console logs for:
   ```
   === SENDING TO GPT ===
   ICT Analysis Parameters: {
     symbol: "AAPL",
     interval: "daily",
     timeframe: "3M",
     desiredInterval: "daily"
   }

   === ICT DATA RECEIVED ===
   Data Metadata: {
     symbol: "AAPL",
     interval: "daily",
     sourceInterval: "daily",
     dateRangeStart: "2024-08-07 00:00:00",
     dateRangeEnd: "2024-11-06 00:00:00",
     lastBarTime: "2024-11-06 00:00:00",
     dateRangeSpan: "2024-08-07 00:00:00 to 2024-11-06 00:00:00"
   }

   === FULL ICT PAYLOAD (what GPT sees) ===
   {
     "meta": { ... full metadata ... },
     "structure": { ... market structure ... },
     "orderBlocks": [ ... order blocks ... ],
     ...
   }
   ```

### 6. Verify Date Range Sent to GPT

The console logs will show:
- **dateRangeStart**: The earliest bar timestamp
- **dateRangeEnd**: The latest bar timestamp
- **dateRangeSpan**: Human-readable range

For **1W timeframe** (Weekly):
- Should show ~3 months of data (e.g., "2024-08-07 to 2024-11-07")
- Data aggregated into weekly candles

For **1M timeframe** (Monthly):
- Should show ~6 months of data (e.g., "2024-05-07 to 2024-11-07")
- Data aggregated into monthly candles

### 7. Check GPT Response Quality

After GPT responds, verify:
- Does GPT reference the correct timeframe in its analysis?
- Does it mention the correct date range?
- Are the price levels and structure analysis accurate for the visible chart?

## Expected Console Output Example

When you select 1W and chat with GPT, you should see:

```
=== SENDING TO GPT ===
Chat Parameters: {
  symbol: "AAPL",
  timeframe: "1W",
  fetchInterval: "daily",
  aggregation: { type: "daily", days: 7, resultInterval: "weekly" },
  resultInterval: "weekly",
  messageCount: 1,
  analysisMode: "plan"
}

=== GPT API CALL 1: INITIAL REQUEST ===
Model: gpt-4o
Symbol: AAPL | Timeframe: 1W
Message count: 1

=== TOOL CALL: ict_analyze ===
Args: { symbol: "AAPL", interval: "daily", lookbackBars: undefined, session: "NY" }

ICT Analysis Parameters: {
  symbol: "AAPL",
  interval: "daily",
  lookbackBars: undefined,
  session: "NY",
  timeframe: "1W",
  desiredInterval: "daily"
}

=== ICT DATA RECEIVED ===
Data Metadata: {
  symbol: "AAPL",
  interval: "daily",
  sourceInterval: "daily",
  dateRangeStart: "2024-08-07 00:00:00",
  dateRangeEnd: "2024-11-06 00:00:00",
  lastBarTime: "2024-11-06 00:00:00",
  lastClosedBarTime: "2024-11-06T05:00:00.000Z",
  dateRangeSpan: "2024-08-07 00:00:00 to 2024-11-06 00:00:00"
}

Structure: {
  bias: "bullish",
  lastBosAt: "2024-10-15 00:00:00",
  swingHighs: 12,
  swingLows: 15,
  events: 8
}

=== FULL ICT PAYLOAD (what GPT sees) ===
{
  "meta": {
    "symbol": "AAPL",
    "interval": "daily",
    "range": {
      "start": "2024-08-07 00:00:00",
      "end": "2024-11-06 00:00:00"
    },
    ...
  },
  "structure": {
    "bias": "bullish",
    ...
  },
  "orderBlocks": [...],
  "fvg": [...],
  "liquidity": {...},
  "sessions": {...}
}
```

## Troubleshooting

### Issue: Chart still shows daily candles on 1W/1M
- **Check**: Look for TypeScript compilation errors
- **Fix**: Run `npm run build` to check for errors
- **Verify**: Console should show aggregation config in logs

### Issue: GPT doesn't see the correct date range
- **Check**: Console logs for "Data Metadata"
- **Verify**: dateRangeStart and dateRangeEnd match your expectations
- **Check**: Alpha Vantage API response (look for rate limits)

### Issue: Console logs not appearing
- **Check**: Browser console is open (F12)
- **Check**: Console filter is not hiding logs
- **Try**: Hard refresh (Ctrl+Shift+R)

## What GPT Receives

The GPT agent receives a complete ICT analysis payload including:

1. **Metadata**: Symbol, interval, date range, last bar info
2. **Market Structure**: Bias, BOS/ChoCH events, swing highs/lows
3. **Order Blocks**: Demand/supply zones with validity status
4. **Fair Value Gaps**: Bullish/bearish gaps with fill status
5. **Liquidity**: Equal highs/lows, external liquidity levels
6. **Sessions**: Kill zone information (NY/London)
7. **Key Levels**: Previous day high/low, weekly levels

All of this data is aggregated according to the timeframe:
- **1W**: Weekly aggregation (7-day candles) over 3 months
- **1M**: Monthly aggregation (30-day candles) over 6 months

This ensures GPT analyzes the correct time period at the correct granularity.
