# Complete Testing Guide

## Overview

This guide will walk you through testing:
1. ✅ File logging system
2. ✅ Weekly (1W) and Monthly (1M) aggregations
3. ✅ Date range accuracy
4. ✅ GPT agent quality

## Prerequisites

```bash
cd /home/comma/Documents/robinhood-performance-dash
```

## Step 1: Start the Development Server

```bash
cd next-frontend
npm run dev
```

You should see:
```
▲ Next.js 15.5.6
- Local:        http://localhost:3000
- Network:      http://192.168.x.x:3000

✓ Ready in 2.3s
```

## Step 2: Open Log Monitor (New Terminal)

Open a **second terminal** and run:

```bash
cd /home/comma/Documents/robinhood-performance-dash/next-frontend
tail -f debug.log
```

This will show all logs in real-time. Keep this terminal visible while testing.

**Alternative**: Use the log analyzer script:

```bash
cd scripts
chmod +x analyze-logs.sh
./analyze-logs.sh
```

## Step 3: Open the Application

1. Open your browser: http://localhost:3000
2. Go to the chart page (click "Chart View" or navigate to `/chart-view`)
3. Open browser console (F12) for client-side logs

## Test Suite

### Test 1: Verify File Logging Works ✅

**Goal**: Confirm logs are being saved to file

1. In the app, select **SPY** symbol
2. Select **1m** timeframe
3. Type in chat: "hello"
4. Check the `tail -f debug.log` terminal

**Expected Output**:
```
================================================================================
=== GPT API CALL 1: INITIAL REQUEST ===
================================================================================
[2025-01-XX...] [INFO] Model:
"gpt-4o"
[2025-01-XX...] [INFO] Context:
{
  "symbol": "SPY",
  "timeframe": "1m",
  "messageCount": 1
}
```

**✓ Pass Criteria**: You see timestamped logs in the file
**✗ Fail**: No logs appear - check if `logger.ts` exists

---

### Test 2: Test 1W Timeframe (Weekly Candles) ✅

**Goal**: Verify weekly aggregation works correctly

1. Select **AAPL** symbol
2. Click **1W** button
3. Wait for chart to load
4. Type in chat: "What's the current market structure?"

**Check Browser Console**:
```javascript
Chat Parameters: {
  symbol: "AAPL",
  timeframe: "1W",
  fetchInterval: "daily",
  aggregation: { type: "daily", days: 7, resultInterval: "weekly" },
  resultInterval: "weekly"
}
```

**Check debug.log**:
```
ICT Analysis Parameters:
{
  "symbol": "AAPL",
  "interval": "daily",
  "timeframe": "1W"
}

Data Metadata:
{
  "symbol": "AAPL",
  "interval": "daily",
  "dateRangeStart": "2024-08-07 00:00:00",
  "dateRangeEnd": "2024-11-07 00:00:00",
  "dateRangeSpan": "2024-08-07 00:00:00 to 2024-11-07 00:00:00"
}
```

**✓ Pass Criteria**:
- Date range spans ~3 months
- Chart shows weekly candles (fewer, thicker bars)
- Interval display shows "1W"

**✗ Fail**: Still shows daily candles or wrong date range

---

### Test 3: Test 1M Timeframe (Monthly Candles) ✅

**Goal**: Verify monthly aggregation works correctly

1. Keep **AAPL** symbol
2. Click **1M** button
3. Wait for chart to load
4. Check the logs

**Check debug.log**:
```
Data Metadata:
{
  "dateRangeStart": "2024-05-07 00:00:00",
  "dateRangeEnd": "2024-11-07 00:00:00",
  "dateRangeSpan": "~6 months"
}
```

**✓ Pass Criteria**:
- Date range spans ~6 months
- Chart shows monthly candles (very few, very thick bars)
- Interval display shows "1M"

**✗ Fail**: Wrong timeframe or aggregation

---

### Test 4: Test 15m Intraday (Date Range Bug Check) 🚨

**Goal**: Verify we're NOT getting 22 days when we should get 3 days

1. Select **SPY** symbol
2. Click **15m** button
3. Chat: "Analyze current market"
4. Check debug.log for date range

**Check debug.log**:
```
ICT Analysis Parameters:
{
  "symbol": "SPY",
  "interval": "15min",
  "timeframe": "15m"
}

Data Metadata:
{
  "dateRangeStart": "2025-11-04 ..." // Should be 3 days ago
  "dateRangeEnd": "2025-11-07 ...",
  "dateRangeSpan": "..." // Should be 3 days, NOT 22 days!
}
```

**Calculate Days**:
```bash
# In the log, find the dates and calculate:
# dateRangeEnd - dateRangeStart = should be ~3 days
```

**✓ Pass Criteria**:
- Date range is **3 days** (not 22 days!)
- Token usage is **2-4k** tokens (not 16k!)

**✗ Fail**:
- Date range > 5 days
- Token usage > 10k
- This is the **BUG** we found!

---

### Test 5: Verify GPT Gets Correct Data ✅

**Goal**: Ensure GPT receives the right date range

1. Select **AAPL**, **1D** timeframe
2. Chat: "What's the market bias?"
3. Check full ICT payload in debug.log

**Check debug.log**:
```
================================================================================
=== FULL ICT PAYLOAD (what GPT sees) ===
================================================================================
[...] [DEBUG] Complete ICT Analysis:
{
  "meta": {
    "symbol": "AAPL",
    "interval": "daily",
    "range": {
      "start": "2024-11-07 00:00:00",
      "end": "2025-11-07 00:00:00"
    },
    ...
  },
  "structure": {
    "bias": "bullish",
    "swings": { ... },
    ...
  },
  "orderBlocks": [...],
  "liquidity": {...}
}
```

**✓ Pass Criteria**:
- Full JSON payload is logged
- Can see all structure, order blocks, liquidity
- Date range matches expectations

**✗ Fail**: Incomplete data or missing fields

---

### Test 6: Compare Token Usage Across Timeframes 💰

**Goal**: Verify token usage scales appropriately with data size

Run this test for each timeframe and record results:

| Timeframe | Expected Days | Expected Tokens | Actual Days | Actual Tokens | Status |
|-----------|---------------|-----------------|-------------|---------------|--------|
| 1m        | 1 day         | 1-2k           |             |               |        |
| 15m       | 3 days        | 2-4k           |             |               |        |
| 1H        | 14 days       | 4-6k           |             |               |        |
| 1D        | 1 year        | 8-12k          |             |               |        |
| 1W        | 3 months      | 4-6k           |             |               |        |
| 1M        | 6 months      | 6-8k           |             |               |        |

**How to Extract from Logs**:
```bash
# Get all token usages
grep "Combined usage" debug.log | tail -20

# Get corresponding date ranges
grep "dateRangeSpan" debug.log | tail -20
```

**✓ Pass Criteria**: Token usage matches expected ranges
**✗ Fail**: Token usage 2x or more than expected

---

## Helper Commands

### View Last Request
```bash
grep -A 30 "=== GPT API CALL 1" debug.log | tail -35
```

### View Last Response
```bash
grep -A 10 "=== GPT API RESPONSE 2" debug.log | tail -15
```

### Find All Date Ranges
```bash
grep dateRangeSpan debug.log
```

### Find All Token Usages
```bash
grep "total_tokens" debug.log
```

### Clear Log File
```bash
> debug.log
echo "Log cleared!"
```

### Search for Specific Symbol
```bash
grep -i "aapl" debug.log | head -20
```

### Extract Just the Metadata
```bash
grep -A 15 "Data Metadata" debug.log | tail -20
```

---

## Expected Results Summary

After running all tests, you should have:

✅ **debug.log file** exists and contains timestamped logs
✅ **1W timeframe** shows weekly candles, 3-month range
✅ **1M timeframe** shows monthly candles, 6-month range
✅ **Date ranges** match timeframe configurations
✅ **Token usage** is reasonable for each timeframe
✅ **Full ICT payload** is logged for debugging

---

## Debugging Failed Tests

### Problem: No logs in debug.log

**Solution**:
1. Check if file exists: `ls -la debug.log`
2. Check file permissions: `chmod 644 debug.log`
3. Restart dev server
4. Check for TypeScript errors: `npm run build`

### Problem: Wrong date range (too many days)

**Solution**:
1. Check `next-frontend/src/app/api/ict/route.ts` - lookback calculation
2. Check `next-frontend/src/app/api/price-history/route.ts` - date filtering
3. Add more logging to those routes

### Problem: Logs truncated in browser console

**Solution**:
- This is expected! Use `debug.log` file instead
- Browser console has character limits
- File logging has no limits

### Problem: Can't see real-time logs

**Solution**:
```bash
# Make sure tail is running:
tail -f debug.log

# If not working, try:
watch -n 1 tail -50 debug.log
```

---

## Quick Start (All Tests)

```bash
# Terminal 1: Start server
cd next-frontend
npm run dev

# Terminal 2: Watch logs
cd next-frontend
tail -f debug.log

# Terminal 3: Analyze logs (optional)
cd next-frontend/scripts
./analyze-logs.sh
```

Then in browser:
1. http://localhost:3000/chart-view
2. Test each timeframe (1m, 15m, 1H, 1D, 1W, 1M)
3. Chat with GPT for each
4. Record results in table above
5. Compare actual vs expected

---

## Next Steps After Testing

1. **If all tests pass**: Great! The system is working correctly
2. **If date range is wrong**: We need to fix the ICT/price-history routes
3. **If tokens too high**: Date range issue or too much data
4. **If aggregation wrong**: Check ChartView.tsx config

Report your findings and we'll fix any issues together!
