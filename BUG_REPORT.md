# Bug Report: Excessive Data in ICT Analysis

## Summary

The ICT analysis is fetching **22+ days** of data for the **15m timeframe** when it should only fetch **3 days**. This causes high token usage (~16k instead of ~2-4k) and slower responses.

## Evidence from debug.log

```json
{
  "symbol": "QQQ",
  "interval": "15min",
  "timeframe": "15m",
  "dateRangeStart": "2025-10-16 04:00:00",
  "dateRangeEnd": "2025-11-07 11:45:00",
  "dateRangeSpan": "22 days",
  "total_tokens": 16241
}
```

**Expected**:
- Date range: 3 days
- Tokens: ~2-4k

**Actual**:
- Date range: 22 days
- Tokens: 16,241

## Root Cause

### Location: `next-frontend/src/app/api/ict/route.ts`

**Line 85-96**: Default lookback is 1500 bars for 15min
```typescript
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
  return 1500; // ❌ WAY TOO HIGH for 15min!
};
```

**Line 150-152**: Calculation with 1.5x buffer
```typescript
const bufferMultiplier = 1.5;
const lookbackDurationMs = Math.ceil(lookbackBars * intervalDurationMs * bufferMultiplier);
const startDate = new Date(now.getTime() - lookbackDurationMs);
```

**Math**:
```
1500 bars × 15 min × 1.5 buffer = 33,750 minutes
= 562.5 hours
= 23.4 days
```

## Impact

| Timeframe | Expected Bars | Default Bars | Expected Days | Actual Days | Token Waste |
|-----------|---------------|--------------|---------------|-------------|-------------|
| 15m       | 288 (3 days)  | 1500         | 3             | 23          | 4x higher   |
| 1H        | 336 (14 days) | 1200         | 14            | 30          | 2x higher   |
| 4H        | 180 (30 days) | 750          | 30            | 47          | 1.5x higher |

## Solution

### Option 1: Pass lookbackBars from Frontend (Recommended)

The ChartView already knows the desired timeframe. We should calculate the proper lookback and pass it to the ICT route.

**In `chat/route.ts`**, add a function:

```typescript
const calculateLookbackBars = (timeframe: string, interval: string): number => {
  const timeframeConfig: Record<string, number> = {
    '1m': 60,      // 1 hour of 1-min bars
    '5m': 72,      // 6 hours of 5-min bars
    '15m': 288,    // 3 days of 15-min bars (4 bars/hour × 24 hours × 3 days)
    '1h': 336,     // 14 days of 1-hour bars
    '4h': 180,     // 30 days of 4-hour bars
    '1d': 365,     // 1 year of daily bars
    '1w': 52,      // 1 year of weekly bars
    '1m': 24,      // 2 years of monthly bars
  };

  return timeframeConfig[timeframe.toLowerCase()] || 500;
};
```

Then pass it to the ICT URL:
```typescript
const lookbackBars = calculateLookbackBars(timeframe, interval);
ictUrl.searchParams.set("lookbackBars", lookbackBars.toString());
```

### Option 2: Smarter Defaults in ICT Route

Update `defaultLookbackForInterval`:

```typescript
const defaultLookbackForInterval = (interval: string): number => {
  if (interval === "daily") {
    return 365;   // 1 year
  }
  if (interval === "4h") {
    return 180;   // 30 days
  }
  if (interval === "60min") {
    return 336;   // 14 days
  }
  if (interval === "15min") {
    return 288;   // 3 days
  }
  if (interval === "5min") {
    return 72;    // 6 hours
  }
  if (interval === "1min") {
    return 60;    // 1 hour
  }
  return 500;
};
```

## Recommendation

Implement **Option 1** (pass from frontend) because:
1. ✅ Frontend knows the user's intent (timeframe)
2. ✅ More control over data scope
3. ✅ Can optimize per timeframe easily
4. ✅ Keeps ICT route generic

## Testing After Fix

After implementing, verify:

1. **15m timeframe** should show ~3 days:
   ```bash
   grep "dateRangeSpan.*15m" debug.log
   # Should show 3-4 days, not 22 days
   ```

2. **Token usage** should drop to 2-4k:
   ```bash
   grep "total_tokens" debug.log | tail -1
   # Should show ~2000-4000, not 16000
   ```

3. **All timeframes** should match expectations:
   | Timeframe | Expected Days | Command to Verify |
   |-----------|---------------|-------------------|
   | 1m        | 0.04 (1 hour) | `grep "1m.*dateRange" debug.log` |
   | 15m       | 3 days        | `grep "15m.*dateRange" debug.log` |
   | 1H        | 14 days       | `grep "1H.*dateRange" debug.log` |
   | 1D        | 1 year        | `grep "1D.*dateRange" debug.log` |
