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

## GPT-5 Chat Mode Indicator
- Added a Plan/Chat toggle badge directly in the GPT-5 Trade Chat header so users can immediately see whether structured trade plans or conversational commentary is active.
- Hover text and helper copy explain that Plan emits the JSON trade block while Chat keeps things free-form (still referencing ICT data).
- The selected mode is now displayed inline under the context line (`Mode: Plan · ...`), ensuring it’s obvious which behaviour is engaged before sending a prompt.
