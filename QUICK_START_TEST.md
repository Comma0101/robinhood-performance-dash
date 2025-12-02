# Quick Start Testing Guide

## 🚀 Get the Pre-Market Agent Running in 5 Minutes

Follow these steps to test the implementation immediately.

---

## Step 1: Install Backend Dependencies (30 seconds)

```bash
cd /home/comma/Documents/robinhood-performance-dash/backend
pip install pytz  # Only new dependency needed
```

**Note:** APScheduler should already be installed from previous requirements.

---

## Step 2: Start the Backend (1 minute)

```bash
cd /home/comma/Documents/robinhood-performance-dash/backend

# Make sure ENABLE_SCHEDULER is set
export ENABLE_SCHEDULER=true

# Start the backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Expected output:**
```
🚀 Starting ICT Trading Agent Backend API v1.0.0
📊 Environment: production
✅ Database initialized
✅ Scheduler started
📅 Next pre-market routine: 2025-01-16 06:30:00 EST

INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

## Step 3: Generate Your First Report (30 seconds)

Open a new terminal and test the API:

```bash
# Generate a morning report for QQQ
curl -X POST "http://localhost:8000/api/v1/reports/generate?symbol=QQQ"
```

**Expected response:**
```json
{
  "status": "completed",
  "report_id": 1,
  "date": "2025-01-15",
  "symbol": "QQQ",
  "htf_bias": "bullish",  # or "bearish" or "neutral"
  "day_type": "trend",    # or "reversal" or "consolidation"
  "confidence": 0.75,
  "message": "Pre-market report generated successfully"
}
```

**Look for in backend logs:**
```
============================================================
🌅 PRE-MARKET ROUTINE - 2025-01-15
📊 Symbol: QQQ
⏰ NY Time: 09:45:23
============================================================

📊 Step 1: HTF Bias Analysis...
   ✓ HTF Bias: bullish
   ✓ Dealing Range: 438.20 - 450.50

🌙 Step 2: Session Structure Analysis...
   ✓ Asian: 442.10 - 445.30
   ✓ London: 443.50 - 447.80
   ✓ Sweeps detected: 2

📏 Step 3: Dealing Range Construction...
   ✓ Range: 438.20 - 450.50
   ✓ Premium: 445.90 (61.8%)
   ✓ EQ: 444.35 (50%)
   ✓ Discount: 442.80 (38.2%)

💧 Step 4: Liquidity Identification...
   ✓ Inducement levels: 4
   ✓ Target levels: 3

🎯 Step 5: Day Type Classification...
   ✓ Day Type: TREND
   ✓ Reasoning: Strong HTF bias (bullish), clean London sweep...

📋 Step 6: Trade Plan Generation...
   ✓ Long scenario: Entry 437.80-447.80
   ✓ Short scenario: Entry 440.90-450.90

✅ Pre-market report generated (ID: 1)
📊 HTF Bias: bullish
📈 Day Type: trend
🎯 Confidence: 75%
```

---

## Step 4: View the Report (API)

```bash
# Fetch the generated report
curl "http://localhost:8000/api/v1/reports/morning/2025-01-15?symbol=QQQ"
```

This should return the full JSON report with all fields populated.

---

## Step 5: Start the Frontend (1 minute)

```bash
cd /home/comma/Documents/robinhood-performance-dash/next-frontend
npm run dev
```

**Expected output:**
```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
✓ Ready in 2.3s
```

---

## Step 6: View in UI (2 minutes)

1. **Open browser:** http://localhost:3000/ai-coach

2. **Create new session:**
   - Click "+ New Session"
   - Select "Pre-Market"
   - Choose today's date
   - Click "Create"

3. **View the morning report:**
   - Report should load automatically
   - If "No morning report found", click "Generate Morning Report"
   - Wait ~10-20 seconds for generation

4. **Verify the display shows:**
   - ✅ HTF Bias badge (BULLISH/BEARISH/NEUTRAL) in color
   - ✅ Day Type badge (TREND/REVERSAL/CONSOLIDATION)
   - ✅ Market Narrative text
   - ✅ Asian Session card (high/low)
   - ✅ London Session card (high/low)
   - ✅ Dealing Range table (Premium/EQ/Discount levels)
   - ✅ Long A+ Scenario (green card with entry, stop, targets)
   - ✅ Short A+ Scenario (red card with entry, stop, targets)
   - ✅ Liquidity Sweeps list (if any detected)

---

## Step 7: Test the AI Coach Integration (1 minute)

With the report displayed, try chatting with the coach:

**Example questions:**
```
"What's today's bias?"
"Explain the long scenario"
"Should I take a long or short?"
"What are the key levels to watch?"
"When is the best time to enter?"
```

The AI coach has access to the morning report and will reference it in responses.

---

## 🎉 Success Checklist

- [ ] Backend starts without errors
- [ ] Scheduler shows next run time
- [ ] Manual report generation works (API)
- [ ] Report can be fetched (API)
- [ ] Frontend displays the report correctly
- [ ] All 6 sections show data (HTF, Sessions, Range, Day Type, Scenarios, Sweeps)
- [ ] AI coach can answer questions about the report

---

## 🔧 Quick Fixes

### "Connection refused" error
```bash
# Make sure backend is running on port 8000
lsof -i :8000
```

### "No data" in Asian/London sessions
This is **normal** if running outside of trading hours. The routine tries to fetch real session data which may not be available yet.

**Solutions:**
1. If your plan includes extended hours, you should see bars starting ~04:00 NY. Before 04:00, Asian will be empty for QQQ.
2. Wait until after 08:05 NY when London completes for the most reliable session levels.
3. Even early, dealing range and scenarios still work (HTF data doesn’t depend on pre‑market).
4. If you still see no pre‑market bars by 06:30–07:00, your data plan likely excludes extended hours.

Tip for maintainers: Alpha Vantage intraday timestamps are US/Eastern. If sessions look shifted, update `pre_market_routine.py` to localize naïve timestamps to `America/New_York` instead of `UTC` (see DATA_TIMING_INVESTIGATION.md).

### When should I click Regenerate?
- 06:30 NY: First pass (preliminary). Good for early planning.
- 08:05–08:15 NY: Second pass (recommended). London complete; levels stable.
- 09:35–10:00 NY: Optional refresh aligned to NY open.

### Alpha Vantage rate limit
If you see "rate limit exceeded":
```bash
# Wait 1 minute between generations, or
# Use a different symbol
curl -X POST "http://localhost:8000/api/v1/reports/generate?symbol=SPY"
```

### "Database error"
```bash
# Re-initialize the database
cd backend
python -c "from app.core.database import init_db; import asyncio; asyncio.run(init_db())"
```

---

## 📅 Testing the Scheduler (Tomorrow Morning)

The scheduler will automatically run at **6:30 AM NY time** every weekday.

**To verify it works:**

1. Leave the backend running overnight
2. Check the logs at 6:30 AM tomorrow
3. Should see: `🔔 SCHEDULED TASK TRIGGERED: Pre-Market Routine`
4. A new report will be created automatically
5. Refresh the AI Coach page to see it

**Or test now with a modified schedule:**

Edit `backend/app/services/scheduler.py` line 36:
```python
# Change from 6:30 AM to run every 2 minutes for testing
from apscheduler.triggers.interval import IntervalTrigger

self.scheduler.add_job(
    self.run_pre_market_routine,
    trigger=IntervalTrigger(minutes=2),  # Test every 2 minutes
    id='pre_market_routine_test',
    name='Pre-Market Routine (Test)',
    replace_existing=True
)
```

Restart backend and watch logs.

---

## 📊 API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/reports/generate?symbol=QQQ` | POST | Generate new morning report |
| `/api/v1/reports/morning/{date}?symbol=QQQ` | GET | Fetch existing report |
| `/api/v1/reports/` | GET | List all reports |
| `/health` | GET | Check backend status |

---

## 🎯 What to Look For

### Good Signs ✅
- HTF Bias is not "neutral" (bullish or bearish)
- Day type is "trend" or "reversal" (consolidation is rare)
- Confidence score > 0.6 (60%)
- Long and Short scenarios both have valid entry zones
- Dealing range shows clear Premium/EQ/Discount levels

### Warning Signs ⚠️
- Confidence < 0.5 (uncertain market conditions)
- Day type "consolidation" (avoid trading)
- Asian/London sessions show null (data not available yet)
- Entry zones overlap (conflicting signals)

---

## 🚀 Next: Production Deployment

Once testing is complete, see [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) for:
- Production environment setup
- Monitoring and logging
- Performance optimization
- Multi-symbol configuration

---

**Happy Testing! 🎉**

If everything works, you should have a fully automated morning report system that:
- ✅ Runs automatically at 6:30 AM NY time
- ✅ Analyzes QQQ using ICT methodology
- ✅ Generates actionable trade plans
- ✅ Displays beautifully in the AI Coach UI

---

**Last Updated:** 2025-01-15
**Estimated Time:** 5-7 minutes for full test

---

## Early-Generation Behavior (HTTP 425)

If you trigger generation before ~04:00 NY, or your provider hasn’t returned any pre‑market bars yet, the backend responds with HTTP 425 Too Early and a descriptive message. Try again after 04:00 NY or when your pre‑market bars appear.

## Scheduler Two-Pass Verification

1. Start the backend with `ENABLE_SCHEDULER=true`.
2. On startup you should see two jobs registered:
   - `Pre-Market Routine (6:30 AM NY)` for the preliminary pass
   - `Pre-Market Routine (8:15 AM NY)` for the final validation pass
3. Watch logs around those times; each banner now shows `(PRELIM)` or `(FINAL)` plus whether London currently holds the HOD/LOD.
4. After each automated run, a pre-market coach session for that date is created (or updated) with a system note so the UI immediately lists it.
5. Open the session in AI Coach and verify:
   - Morning Report reflects the latest run (upserted ID)
   - Session Diagnostics card shows Asian/London bar counts, completeness, last timestamp, and whether London holds the high/low
   - Dealing Range card displays `Source: Previous Day H/L` (or fallback) once the DB column is migrated
