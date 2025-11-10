# Chart View Enhancements

## Expanded Timeframes
- Added intraday presets (`1m`, `5m`, `15m`, `1H`, `4H`) alongside daily swing views.
- Implemented interval aggregation to build 4-hour candles from 60-minute data.
- Enhanced Alpha Vantage API handler to request additional intervals and normalize responses.

## Sticky Workspace Layout
- Reworked the chart workspace into a two-column grid with a sticky chart card.
- Added dedicated spacing so the chat pane breathes alongside the sticky chart.
- Keeps price action visible while interacting with GPT-5 notes and chat tools.

## Intraday Axis Improvements
- Normalised all timestamps to New York trading hours for crosshair and tick labels.
- Dynamically format the horizontal scale: sub-day frames show clock time, higher frames favour date granularity.

## Notes
- Interval labels now render with friendly casing (e.g. `60min` → `1H`).
- Unable to run local linting because both `pnpm` and `npm` are unavailable in the current shell.

## Bias Stack Sandbox (Read‑only)
- Added a sidebar card that summarizes the intraday bias stack: Daily → 4H → 15m → 5m → 1m + Session.
- Auto‑fill button fetches live ICT analyses for `daily`, `4h`, `15min`, `5min`, and `1min` (browser `no-store`) and populates badges:
  - Daily/4H draw direction
  - 15m bias + confirmation (displacement) and PD%
  - 5m zone status (aligned and ready or pending)
  - 1m MSS confirmation
  - Session window fit (London/NY AM/NY PM/Off)
- Status chips show per‑interval fetch state (loading/ok/error). The manual controls have been removed to keep the UI consistent—this card reflects live data only.

## Bias Grade & Rationale
- The sandbox displays an alignment score and grade (A/B/C) with rationale bullets, including the actual PD% number (e.g., “Bias fighting PD% location (PD% 62%)”).
- Preferred session windows are the canonical ICT timings: London 02:00–05:00, NY AM 10:00–11:00, NY PM 14:00–15:00.

## Agent Context Integration
- After Auto‑fill completes, the Agent Context card updates with the active timeframe’s ICT meta (interval, target lookback, bars analyzed, source interval, date range, timezone, timestamps, includesCurrentBar).
- Note: “Lookback bars” shows the target configured for the interval; “Bars analyzed” is the actual count from the fetched window. We may pass UI‑mapped lookbacks in a follow‑up so target and range always align.

## Timestamp Normalization
- ICT meta now returns true ISO timestamps for `lastClosedBarTimeISO` and `range.start/end`, preventing local‑timezone parsing drift in the Agent Context display.

## Chat Mode Behaviour
- Removed the Plan/Chat toggle. The chat route now infers intent each turn (plan vs conversational) from the latest user message and model guidance, while still using `tool_choice: "auto"` for data needs.
