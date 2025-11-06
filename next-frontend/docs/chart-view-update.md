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
