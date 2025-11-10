# ICT Analysis Toolkit

This module exposes a deterministic ICT (Smart Money Concepts) pipeline that the server, client UI, and GPT chat tool share.

## Library

- Entry point: `analyzeICT(bars, options)` from `@/lib/ict`.
- Options: `{ symbol, interval, lookbackBars?, pivotPeriod?, minorPivotPeriod?, liquidityTolerancePct?, session? }`.
  - `session` can be `"NY"`, `"LDN"`, or `"ASIAN"`.
- Bars: `{ time: string; open: number; high: number; low: number; close: number; volume: number }` in America/New_York time.
- Output (`ICTAnalysis`):
  - `meta`: symbol, interval, timezone (`America/New_York`), range start/end, last bar.
  - `structure`: `bias`, `lastBosAt`, `lastChoChAt`, swing highs/lows (major/minor), trimmed structure events (BOS / ChoCH).
  - `dealingRange`: low, high, equilibrium, premium/discount percent.
  - `orderBlocks`: demand/supply zones identified at the last opposite candle before impulse move, origin (`BOS` | `ChoCH`), refined (defensive body), age, heuristic score.
  - `fvg`: bullish/bearish gaps with bounds and filled flag.
  - `liquidity`: equal highs/lows clusters and external highs/lows.
  - `sessions`: kill zone windows (London 02:00–05:00, NY AM 10:00–11:00, NY PM 14:00–15:00, Asian 20:00–23:59) with `active` flag.
  - `levels`: previous day high/low and prior week high/low when available.

Trimming: swings (last 20), structure events (last 20), order blocks (last 20), fair value gaps (last 30), liquidity clusters (last 10).

## REST API

- Endpoint: `GET /api/ict/analyze`.
- Query params:
  - `symbol` (required) – ticker symbol.
  - `interval` (required) – `1min|5min|15min|30min|60min|4h|daily`.
  - `lookbackBars` (optional) – integer (default varies by interval).
  - `session` (optional) – `NY` (default) or `LDN`.
- Flow: fetches bars via `/api/price-history`, aggregates to 4H when requested, slices to lookback bars, runs `analyzeICT`, returns `ICTAnalysis`.
- Errors: 400 invalid params, 404 no data, 5xx for upstream/API errors.

## Chat Tool

- Tool definition `ict_analyze` (function call).
- Parameters: `{ symbol: string; interval: "1min"|"5min"|"15min"|"30min"|"60min"|"4h"|"daily"; lookbackBars?: number; session?: "NY"|"LDN" }`.
- Return: full `ICTAnalysis` payload.
- System prompt enforces: call tool before replying, respond with:
  1. Machine-readable `plan` JSON (`strategy`, `entry`, `stop`, `targets[]`, `confluence[]`, `risk`).
  2. Short rationale referencing BOS/ChoCH, order blocks, PD alignment, liquidity, sessions.

## UI Integration

- `ChartView` memoizes `analyzeICT` for current bars and renders overlays via:
  - `IctToggles`: user controls for Dealing Range, Order Blocks, FVG, Structure markers, Session markers.
  - `IctOverlays`: lightweight-charts price lines (EQ, range, OB, FVG) and markers (BOS/ChoCH, kill zones).
- Bias + PD% are surfaced alongside chart meta info.

## Defaults & Heuristics

- Pivot periods: major `P=5`, minor `P=3`.
- Liquidity clustering tolerance: `0.1%`.
- Lookback: intraday defaults to 1,500 bars (4H uses 750, daily 500).
- Sessions: London 02:00–05:00 (3–4 “Silver Bullet” window inside), NY AM 10:00–11:00, NY PM 14:00–15:00, Asian 20:00–23:59 (America/New_York timezone).
- Order block scoring weights recency, proximity to last price, and origin (`BOS` > `ChoCH`).
- Fair value gap fill detection uses candle bodies overlapping the gap bounds.

## Timezone

- All detectors operate in `America/New_York`. Bar timestamps are normalized using `Intl.DateTimeFormat` for DST safety.
