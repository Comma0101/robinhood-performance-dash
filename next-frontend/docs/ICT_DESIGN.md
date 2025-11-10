# ICT Analysis Design

This document explains how our ICT (Inner Circle Trader / Smart Money Concepts) analysis is designed and implemented. It is intended to be sufficient for a new engineer to understand the system without reading the code.

- Core modules: `src/lib/ict/analysis.ts`, `src/lib/ict/detectors.ts`, `src/lib/ict/types.ts`, `src/lib/ict/utils.ts`
- API entrypoint: `src/app/api/ict/route.ts`
- Consuming agent: `src/app/api/chat/route.ts` (calls `/api/ict` via the `ict_analyze` tool)

## Goals & Principles
- Deterministic feature extraction from OHLCV bars; no probabilistic ML inside ICT.
- Timezone-aware (America/New_York) to make session logic consistent.
- Consistent interval handling: support intraday and daily through explicit mapping and aggregation.
- Trim large outputs to recent, relevant items (e.g., last 20 events/zones) to keep payloads compact.

## Data Model
- Bar type (ICTBar): `{ time: string, open, high, low, close, volume }`
- Interval enum (ICTInterval): `"1min"|"5min"|"15min"|"30min"|"60min"|"4h"|"daily"|"weekly"|"monthly"`
- Analysis output (ICTAnalysis):
  - `meta`: symbol, interval, time zone, range start/end, `lastBar` (last closed candle after aggregation/trim), plus enrichments (`sourceInterval`, `generatedAt`, `currentBar`, summary string, `lastClosedBarTimeISO`, `exchangeTZ`, `pricePrecision`)
  - `structure`: market bias, last BOS/ChoCH timestamps, swing highs/lows, structure events
  - `dealingRange`: low/high, midpoint (EQ), and `pdPercent` (position of last close between low and high)
  - `orderBlocks[]`: zones with type (demand/supply), origin (BOS/ChoCH), refinement method (defensive/aggressive/mean threshold), classification (origin/mitigation/breaker), touch/invalidated metadata, scoring, validity
  - `fvg[]`: fair value gaps with bounds, consequent encroachment (CE), fill/touch metadata, potency
  - `liquidity`: equal highs/lows clusters, relative equal highs/lows, external extremes, and stack groupings with classification (internal/external/relative)
  - `sessions`: kill zones (London 02:00–05:00, NY AM 10:00–11:00, NY PM 14:00–15:00, Asian 20:00–23:59)
  - `levels`: previous day/week highs/lows
  - `smtSignals[]`: optional Smart Money Technique divergence signals across comparative symbols

## API: GET /api/ict
- Query parameters:
  - `symbol` (required)
- `interval` (required): one of `1min|5min|15min|30min|60min|4h|daily|weekly|monthly`
  - `lookbackBars` (optional): defaults by interval (`daily:500`, `4h:750`, `60min:1200`, else `1500`)
  - `session` (optional): `NY|LDN` (default `NY`)
  - `comparativeSymbols` (optional): comma-separated list of other symbols to use for SMT divergence (e.g., `ES,NQ` or `DXY`)
  - `includeCurrentBar` (optional boolean): when `true`, the newest (still-forming) candle is kept instead of being trimmed.
- Behavior:
  1. Compute `startDate` as `now - lookbackBars * intervalDuration * 1.5` (buffered) and `endDate = now`.
  2. Determine fetch source interval and optional aggregation:
     - `5min`/`15min`: fetch `1min`, aggregate 5/15-minute candles.
     - `4h`: fetch `60min`, aggregate 240 minutes.
     - `weekly`: fetch `daily`, group bars into ISO weeks (Monday-start) and aggregate OHLCV.
     - `monthly`: fetch `daily`, group by calendar month and aggregate OHLCV.
     - Other intervals: fetch as requested (no aggregation).
  3. Fetch price data from `/api/price-history?symbol&interval&startDate&endDate`.
 4. Aggregate if needed, trim to `lookbackBars`, then drop any still-open trailing bars unless `includeCurrentBar=true` (in which case the latest candle may be partially formed) before running ICT analysis.
 5. Enrich `meta` with `sourceInterval`, `lookbackBars`, `barsCount` (post-trim count), normalized `range.start/end`, `generatedAt`, `currentBar`, `includesCurrentBar`, and a compact `currentBarSummary` that references the closed bar time (`barTimeISO`) and `exchangeTZ`. The summary prices are rounded to the inferred tick precision (2–4 decimals).
  6. Return the `ICTAnalysis` JSON.

## Pipeline (analysis.ts)
1. Sort bars ascending and take recent `lookbackBars`.
2. Detect swings (major/minor) with pivot windows.
3. Detect structure events and bias from swings and closes with ATR-based displacement checks and sweep tagging.
4. Detect order blocks from structure events and impulse analysis, including classification (origin/mitigation/breaker) and lifecycle stats.
5. Detect fair value gaps with configurable filtering plus CE/touch/fill metadata.
6. Compute dealing range from major swings and last close.
7. Detect liquidity (equal/relative highs/lows, external extremes, stack strength).
8. Compute SMT divergence signals if comparative series provided.
9. Compute sessions (kill zones) and reference levels (prev day/week highs/lows).
10. Build `ICTAnalysis` and trim long arrays to recent items.

## Swing Detection (detectors.ts)
- Purpose: identify turning points at two granularities.
- Major swings: pivot period `P` (default `5`), index `i` is a swing high if its `high` is ≥ neighbors within `±P`; swing low analogously on `low`.
- Minor swings: pivot period `p` (default `3`) applied similarly; do not duplicate indices already classified as major.
- Result: two arrays sorted by index: `highs[]`, `lows[]`, each with `{ index, time, price, strength: "major"|"minor" }`.

## Structure & Bias
- Maintain last unconsumed swing high/low while walking bars forward.
- For each prospective break, measure displacement using ATR:
  - ATR period defaults to 14; displacement must exceed `close - swing >= multiplier * ATR` (multiplier defaults `0.25`).
  - Only candle bodies count (close must be beyond the swing by the threshold). Wick raids without body displacement are ignored.
- Event typing:
  - If displacement present: `BOS` when continuing bias, `ChoCH` when reversing (bias flips and swing is consumed).
  - If close exceeds the swing but displacement is insufficient: record a `Sweep` event and keep the swing available.
- Each `StructureEvent` now tracks `hasDisplacement`, actual displacement magnitude, ATR, and threshold used.
- Output: `{ bias, lastBosAt?, lastChoChAt?, swings, events[] }` where events may be `BOS|ChoCH|Sweep`.

## Order Blocks
- For each displacement event (BOS/ChoCH):
  1. Detect impulse leg into the break (same as before) and locate the last opposite candle (order block origin).
  2. Determine zone type: ChoCH → `main`, BOS defaults to `main` unless a recent ChoCH in the same direction suggests `sub`.
  3. Refinement modes:
     - `defensive`: candle body
     - `aggressive`: full wick
     - `mean_threshold`: highlight the 50% level (Mean Threshold). Stored as a thin line via `refined.mean`.
  4. Lifecycle evaluation:
     - Track touch count and timestamps by testing body overlaps with the refined range.
     - Invalidate when a close breaches >50% into the raw range (per ICT defensive invalidation). Record `invalidatedAt`.
  5. Classification & context:
     - `breaker`: detected when the displacement candle invalidates the most recent opposite block; that prior block is marked invalid and the new one is flagged `reclaimed`.
     - `mitigation`: continuation (`BOS`) zones that build on recent structure (sub-zones).
     - `origin`: default for new ChoCH-derived zones.
  6. Scoring weights recency, proximity to price, origin type (ChoCH > BOS), classification (breaker > origin > mitigation), refinement method, and touch penalties (first-touch preferred).
  7. Blocks include `{ type, origin, zoneType, classification, range, refined?, ageBars, touchCount, lastTouchAt, invalidatedAt, status, score, isValid, breakerParentTime?, reclaimed }`.
- Results are sorted by candle time and trimmed to the most recent ~20 entries.

## Fair Value Gaps (FVG)
- 3-candle pattern:
  - Bullish gap when `prev.high < next.low`.
  - Bearish gap when `prev.low > next.high`.
- Relative width filter by average price:
  - Mode thresholds: `very_aggressive` (no filter) → `aggressive` → `defensive` → `very_defensive` (strong filter).
- Mark metadata while scanning forward:
  - `filled`: true once body overlap covers the entire gap.
  - `touchCount`, `firstTouchAt`, `lastTouchAt` for monitoring first-touch potency.
  - `filledRatio` (0–1) using the maximum overlap width observed.
  - `ce`: Consequent Encroachment (gap midpoint) for entry focus.
  - `ageBars` and `potency` (decays with extra touches or partial fills).

## Dealing Range
- Use major swings only.
- Try to locate the most recent pair (low/high) such that the last close lies between their prices (low index ≤ high index).
- If none found, fallback to global min low and max high among major swings.
- Return `{ low, high, eq, pdPercent }`, where `eq` is midpoint and `pdPercent` is the last close’s position in the range as a percentage.

## Liquidity
- Equal highs/lows: cluster swing prices using a tolerance fraction (default ~0.1%) and combine occurrences (count ≥ 2). Each level tracks count, stack score, and whether it was sourced from major vs minor swings.
- Relative equal highs/lows: looser clustering (tolerance ×1.5) across all swings, labeled `relative`.
- External highs/lows: pick top-N extremes from major swings, flagged `external`.
- Classification: each liquidity level is tagged as `internal`, `external`, or `relative` using the current dealing range (top/bottom ~12%) to emphasize extremes.
- Stacks: aggregate nearby levels (equal + relative + external) into stack objects with combined strength scores, separate for highs vs lows.
- Modes still support `static`, `dynamic`, or `both` when building the base equal-high/low sets; dedupe and trim before returning.

## Sessions & Reference Levels
- Sessions: compute “kill zones” by session template (London 02:00–05:00, NY AM 10:00–11:00, NY PM 14:00–15:00, Asian 20:00–23:59) using timezone-aligned timestamps.
- Reference levels:
  - Previous day high/low by grouping bars by (NY) calendar day.
  - Previous week high/low by ISO week grouping.

## Timezone Handling
- All timestamps are interpreted in `America/New_York` when comparing sessions or building daily/weekly groups.
- Utility `toTimeZoneDate` converts a `YYYY-MM-DD HH:mm:ss` string into a Date in the target timezone to ensure day boundaries and session windows are correct.

## Configuration Options (ICTAnalysisOptions)
- `symbol: string`, `interval: string`, `lookbackBars?: number`
- Detection tuning (defaults):
  - `pivotPeriod` (major): ~5, `minorPivotPeriod`: ~3
  - `liquidityTolerancePct`: ~0.001 (0.1%)
  - `orderBlockRefinement`: `defensive|aggressive|mean_threshold` (default `defensive`)
  - `orderBlockValidityPeriod`: ~500 bars
  - `fvgFilterMode`: `very_aggressive|aggressive|defensive|very_defensive` (default `defensive`)
  - `liquidityMode`: `static|dynamic|both` (default `both`)
  - `staticLiquiditySensitivity`, `dynamicLiquiditySensitivity` scalars for tolerance
  - `session`: `NY|LDN|ASIAN` (default `NY`)
  - `structureAtrPeriod`, `structureDisplacementMultiplier`: tune displacement detection (defaults 14 & 0.25)
  - `comparativeSymbols`/`comparativeSeries`: optional map passed by the API layer to enable SMT divergence output

## Interval Handling & Aggregation
- Supported analysis intervals: `1min|5min|15min|30min|60min|4h|daily|weekly|monthly`.
- Aggregation rules in the API layer:
  - `5min`/`15min` aggregate `1min`.
  - `4h` aggregates `60min` into 240-minute candles.
  - `weekly` aggregates `daily` candles into Monday-start ISO weeks.
  - `monthly` aggregates `daily` candles into calendar months.
  - Daily (and other non-listed intervals) pass-through.
- Response `meta` now includes `sourceInterval`, `lookbackBars`, `barsCount`, normalized `range.start/end`, and `includesCurrentBar` so downstream consumers can inspect which data window (and whether the forming bar) the analysis actually used.

## Contracts (for consumers)
- Request: `GET /api/ict?symbol=QQQ&interval=4h[&lookbackBars=750][&session=NY]`
- Response shape (abridged):
```json
{
  "meta": {
    "symbol": "QQQ",
    "interval": "4h",
    "tz": "America/New_York",
    "lookbackBars": 180,
    "barsCount": 180,
    "range": { "start": "...", "end": "..." },
    "lastBar": { "time": "...", "open": 0, "high": 0, "low": 0, "close": 0, "volume": 0 },
    "sourceInterval": "60min",
    "generatedAt": "ISO",
    "currentBar": { ... },
    "currentBarSummary": "time=... O=... H=... L=... C=... V=...",
    "includesCurrentBar": false
  },
  "structure": {
    "bias": "bullish|bearish|neutral",
    "lastBosAt": "...",
    "lastChoChAt": "...",
    "swings": { "highs": [...], "lows": [...] },
    "events": [{ "type": "BOS|ChoCH", "direction": "up|down", "time": "...", "barIndex": 0, "referenceSwing": { ... } }]
  },
  "dealingRange": { "low": 0, "high": 0, "eq": 0, "pdPercent": 0 },
  "orderBlocks": [{
    "type": "demand|supply",
    "origin": "BOS|ChoCH",
    "zoneType": "main|sub",
    "candleTime": "...",
    "candleIndex": 0,
    "range": { "low": 0, "high": 0 },
    "refined": { "low": 0, "high": 0, "method": "defensive|aggressive" },
    "ageBars": 0,
    "score": 0,
    "isValid": true
  }],
  "fvg": [{ "type": "bullish|bearish", "startTime": "...", "endTime": "...", "bounds": { "low": 0, "high": 0 }, "filled": false }],
  "liquidity": { "equalHighs": [...], "equalLows": [...], "externalHighs": [...], "externalLows": [...] },
  "sessions": { "killZones": [{ "name": "NY AM Kill Zone", "start": "...", "end": "...", "active": false }] },
  "levels": { "prevDayHigh": 0, "prevDayLow": 0, "weeklyHigh": 0, "weeklyLow": 0 }
}
```

## Intraday Bias Stack Helper
- Utility module: `src/lib/ict/bias.ts` exports `selectBias` and `deriveSessionWindow`.
- Inputs: Daily + 4H liquidity draws, confirmed 15m BOS/ChoCH direction + PD%, 5m bias/zone readiness, 1m MSS confirmation, and the current kill-zone classification.
- Rules baked into `selectBias`:
  - Only 15m can flip bias, and only after a body-close BOS/ChoCH with displacement.
  - Daily/4H disagreement marks the setup `counterTrend` and subtracts from the score.
  - 5m structure must agree with 15m and flag whether the entry zone (OB/FVG/CE) is ready; disagreement downgrades the grade.
  - 1m MSS confirmation inside the 5m zone is required to move from `wait` → `ready` status.
  - Preferred execution windows are NY AM (10:00–11:00 NY) and NY PM (14:00–15:00 NY); London 02:00–05:00 is acceptable, anything else is `off` session fit.
- Output: `{ bias: "long|short|skip", grade: "A|B|C", counterTrend, score, sessionFit, needsOneMinuteConfirmation, rationale[], checklist, status }`.
- Consumers (chat agent, future tools) should call `deriveSessionWindow(analysis)` to classify the active window, then feed the stacked cues into `selectBias` before drafting trade plans.

## Determinism & Trimming
- All decisions are rule-based and reproducible for the same inputs.
- Arrays like swings/events/orderBlocks/FVG are trimmed to recent items (e.g., last 20–30) for readability and payload size.

## Example (QQQ, 4H)
- API may fetch `60min` bars and aggregate to 4-hour candles; `meta.sourceInterval` will read `60min`.
- A ChoCH down event after prior BOS up can flip `bias` to `bearish`.
- Order blocks originate from the last opposite candle prior to the impulse that caused the break; ChoCH-derived zones are typically marked `main`.

## Extending the System
- Add new intervals: introduce a new `AGGREGATION_CONFIG` mapping in `/api/ict` if an interval aggregates from a different source.
- Adjust sensitivity: expose or tune detector options (pivot periods, tolerance, validity window) via API params or internal defaults.
- Additional features: more liquidity heuristics, refined session templates, or alternate scoring functions can be added in `detectors.ts`.

## Notes for the Chat Agent
- The chat agent always enforces the selected chart timeframe by mapping UI timeframe → ICT interval and overriding any mismatched tool args.
- The entire ICT payload is attached to the model as tool output, and the agent’s prompt requires citing timeframe and latest OHLCV in responses.
## SMT Divergence (comparative symbols)
- Optional comparative series (via `comparativeSymbols`) allow the analyzer to emit `smtSignals[]`.
- We align bars by timestamp and look for 20-bar window divergences where one instrument breaks prior highs/lows while the other fails (or vice versa).
- Signals include direction (`bullish` when sell-side liquidity is taken without confirmation, `bearish` when buy-side is taken), the basis (`high` or `low`), strength (normalized by price distance), and a descriptive note.
- Payload shape: `{ timestamp, primarySymbol, comparativeSymbol, direction, basis, strength, primaryPrice, comparativePrice, note }` (trimmed to last ~20).
