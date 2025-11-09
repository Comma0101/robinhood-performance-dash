# Quick Start Guide

## 🚀 Start Testing in 3 Steps

### Step 1: Start the Server
```bash
cd next-frontend
npm run dev
```

### Step 2: Watch Logs (New Terminal)
```bash
cd next-frontend
tail -f debug.log
```

### Step 3: Test the App
1. Open: http://localhost:3000/chart-view
2. Select a symbol (e.g., **AAPL**)
3. Select a timeframe (e.g., **1W**)
4. Chat with GPT: "What's the market structure?"
5. Watch the log terminal for output!

## 📊 What You'll See

In the **log terminal**, you'll see real-time output like:

```
================================================================================
=== ICT DATA REQUEST ===
================================================================================
[2025-01-07T12:34:56.789Z] [INFO] ICT Analysis Parameters:
{
  "symbol": "AAPL",
  "interval": "daily",
  "timeframe": "1W"
}

================================================================================
=== ICT DATA RECEIVED ===
================================================================================
[2025-01-07T12:34:57.123Z] [INFO] Data Metadata:
{
  "symbol": "AAPL",
  "interval": "daily",
  "dateRangeStart": "2024-08-07 00:00:00",
  "dateRangeEnd": "2024-11-07 00:00:00",
  "dateRangeSpan": "2024-08-07 00:00:00 to 2024-11-07 00:00:00"
}
```

## 🔍 Key Things to Check

1. **Date Range**: Does it match the timeframe?
   - 1W should show ~3 months
   - 1M should show ~6 months
   - 15m should show ~3 days (NOT 22 days!)

2. **Token Usage**: Look for "Combined usage"
   - Should be reasonable (2-12k tokens)
   - If > 15k, something's wrong

3. **Chart Display**:
   - 1W should show weekly bars
   - 1M should show monthly bars

## 🛠️ Helper Scripts

### Analyze Logs
```bash
cd next-frontend/scripts
./analyze-logs.sh
```

### Watch Logs (with colors)
```bash
cd next-frontend/scripts
./watch-logs.sh
```

### Clear Logs
```bash
> next-frontend/debug.log
```

## 📝 Full Testing Guide

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for comprehensive testing instructions.

## 🐛 Found a Bug?

Check the logs for:
- Date range mismatches
- High token usage (> 15k)
- Wrong interval aggregations

Document your findings and we'll fix it!
