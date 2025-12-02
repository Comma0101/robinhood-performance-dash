# Deep Investigation: Pre‑Market Data Timing & Regeneration Guidance

Last Updated: 2025-11-13

---

## Summary

This document explains why Asian/London sessions can show “No data” early in the morning, what data is realistically available at each time, and when it’s best to click Regenerate. It also highlights a likely timezone handling issue that can hide valid intraday candles.

---

## How Session Analysis Works

- Session windows in NY time (America/New_York):
  - Asian: 00:00–05:00 NY
  - London: 02:00–08:00 NY
- Code path: `backend/app/services/ict/pre_market_routine.py:297` `_step2_session_structure`
  - Fetches intraday data at 15m: `fetch_ohlcv(symbol, timeframe="15m", limit=200)`
  - Filters candles within the fixed windows above
  - Computes per-session high/low and detects sweeps

---

## Data Provider Behavior (Alpha Vantage)

- Intraday timestamps returned by Alpha Vantage are documented as US/Eastern (EST/EDT). Our fetcher (`backend/app/utils/data_fetcher.py`) parses timestamps as naïve datetimes.
- Extended/pre‑market coverage depends on plan and the `entitlement` parameter. The code requests `entitlement=realtime`, but some accounts may still only receive regular‑hours bars (09:30–16:00 NY). If extended hours are not included, the 00:00–08:00 NY window will be empty for ETFs like QQQ.

Implication: At 04:30 NY, you may see no candles if your Alpha Vantage plan does not provide extended hours; otherwise you’ll have 1–3 fifteen‑minute bars from 04:00 onward.

---

## Likely Timezone Bug Hiding Valid Candles

File: `backend/app/services/ict/pre_market_routine.py:329-333`

```python
df['timestamp'] = pd.to_datetime(df['timestamp'])
if df['timestamp'].dt.tz is None:
    df['timestamp'] = df['timestamp'].dt.tz_localize('UTC').dt.tz_convert(self.ny_tz)
```

- Alpha Vantage intraday timestamps are in US/Eastern, not UTC.
- Localizing as UTC and then converting to NY shifts timestamps by −4/−5 hours, pushing bars outside the intended session windows.

Recommended fix:

```python
df['timestamp'] = pd.to_datetime(df['timestamp'])
if df['timestamp'].dt.tz is None:
    # Alpha Vantage intraday timestamps are US/Eastern by convention
    df['timestamp'] = df['timestamp'].dt.tz_localize('America/New_York')
```

Result: Session filters will see the correct candles for 00:00–08:00 NY when extended hours are returned.

---

## Early Morning Expectations (QQQ)

- 00:00–03:59 NY: QQQ typically has little to no activity; many data providers do not include prints for this window. Expect Asian session to be empty.
- 04:00–05:00 NY: If extended hours are delivered, you’ll have 1–4 bars at 15m granularity (04:00, 04:15, 04:30, 04:45). Asian session begins to populate, but it’s still incomplete by 05:00.
- 05:00–06:30 NY: Asian ends; London continues. If your provider lacks extended hours, both sessions may still appear empty until 09:30.
- 06:30 NY (current schedule): London is still in progress (ends 08:00). Results are valid but provisional; highs/lows can evolve.
- 08:05–08:15 NY: London session is complete and stable; this is the best time to lock in overnight session levels.

---

## Guidance: When To Click Regenerate

- 04:00–06:00 NY: Optional. Use only if you need a very early read; expect partial or empty session data depending on plan coverage. Dealing range and HTF bias still work.
- 06:30 NY (scheduled): Recommended as a first pass for the morning plan. London is mid‑session; treat session conclusions as provisional.
- 08:05–08:15 NY: Strongly recommended second pass. London complete; overnight levels fixed. Best for final validation before NY killzone.
- 09:35–10:00 NY: Optional refresh to align scenarios with NY open prints.

---

## Current-Price Caveat in Trade Scenarios

File: `backend/app/services/ict/pre_market_routine.py:566-573`

```python
df = await fetch_ohlcv(symbol, timeframe="5m", limit=1)
current_price = float(df['close'].iloc[-1])
```

If extended hours are not returned, this will use the last bar from the previous regular session, not the true pre‑market price. Scenarios may be anchored to a stale close. Consider switching to a quote endpoint with extended hours or fetching 1m/5m extended bars if your plan supports it.

---

## Recommended Improvements

1) Fix timezone handling
- Localize Alpha Vantage intraday timestamps to `America/New_York` (not `UTC`).

2) Add session completeness metadata
- Add counts and flags to the report: `asian_bars`, `london_bars`, `asian_complete`, `london_complete`, `data_window_start`, `data_window_end`.
- Surface these in the UI next to session cards (“Partial: 3 bars as of 04:30”).

3) Improve early‑morning price source
- Use extended‑hours intraday bars or a real‑time quote feed for `current_price`.

4) Consider a two‑pass schedule
- Keep 06:30 NY for the preliminary plan; add an 08:05 NY refinement pass to finalize session levels.

---

## How To Verify

- Backend logs already print session ranges from `_step2_session_structure`. After applying the timezone fix, check that the timestamps fall within the expected windows and that Asian/London highs/lows populate earlier.
- API endpoint used by the UI: `GET /api/v1/reports/morning/{date}?symbol=QQQ` returns the latest report for that date (`backend/app/api/endpoints/reports.py:193-218`), so the UI should always display the newest generated report.

---

## TL;DR

- The code is correct in structure but likely localizes intraday timestamps incorrectly. Fixing the tz handling will show available pre‑market candles earlier.
- If your data plan doesn’t include extended hours, expect empty sessions before 09:30 regardless of code fixes.
- Best practice: Generate at 06:30 as a first pass and again shortly after 08:00 NY to lock overnight levels.

