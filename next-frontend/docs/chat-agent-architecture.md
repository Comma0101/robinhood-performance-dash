# Chat Agent Architecture (GPT-5 Trade Chat)

This document describes the chat agent that powers the "GPT-5 Trade Chat" panel. It explains the agent's flow, the ICT analysis tool, multi-timeframe support, data contracts, persistence, and how timeframe data is enforced. It is intended to be sufficient for a new engineer to work on the agent without reading source code.

## Overview
- Purpose: Provide precise, ICT-grounded trading guidance using multi-timeframe top-down analysis.
- Pattern: Two-pass Chat Completions with a single deterministic tool (`ict_analyze`) plus optional multi-timeframe context.
- Components:
  - Frontend: `ChartView` sends messages + UI context (symbol, timeframe) + optional multi-timeframe analyses from Bias Stack Sandbox.
  - Chat Orchestrator: `/api/chat` composes system prompt (with multi-TF awareness), enforces timeframe, calls the ICT tool, injects multi-TF context, then returns a final reply.
  - ICT Service: `/api/ict` aggregates price history and computes deterministic ICT features (structure, order blocks, FVG, liquidity, sessions, dealing range).
  - Bias Stack Sandbox: `BiasSelectorPlayground` component fetches all 5 timeframes (Daily, 4H, 15m, 5m, 1m) and evaluates ICT methodology compliance.
  - Conversations API: `/api/conversations` and `/api/conversations/[id]/messages` persist threads and messages in Supabase.

## Model
- Default: `gpt-4o` (override via `OPENAI_GPT5_MODEL`).
- Settings:
  - Pass 1: `tool_choice: auto`, `temperature: 0.7`, `max_tokens: 2000`.
  - Pass 2: `temperature: 0.7`, `max_tokens: 2000`.

## Tool: ict_analyze
- Type: OpenAI function tool (deterministic server-side call).
- Name: `ict_analyze`.
- Description: “Deterministic ICT analyzer. Always call first to inspect BOS/ChoCH, order blocks, fair value gaps, dealing range, liquidity, and session kill zones.”
- Parameters:
  - `symbol: string` (required)
- `interval: "1min"|"5min"|"15min"|"30min"|"60min"|"4h"|"daily"|"weekly"|"monthly"` (required)
  - `lookbackBars: integer` (optional, 50–5000)
  - `session: "NY"|"LDN"` (optional; default NY)
- Execution: The chat API calls internal `GET /api/ict` with the tool arguments and injects the full JSON result back into the model as a tool message before Pass 2.

## Timeframe Mapping and Enforcement
- `src/lib/timeframes.ts` is the single source of truth used by both the frontend and `/api/chat`. Each entry supplies the ICT interval, source interval (used for aggregation/fetching), default `lookbackBars`, and descriptive horizon:

| UI key | ICT interval | Source interval | lookbackBars | Horizon |
| --- | --- | --- | --- | --- |
| 1m | 1min | 1min | 60 | scalp (≈1 hour) |
| 5m | 5min | 1min | 72 | session (≈6 hours) |
| 15m | 15min | 1min | 288 | intraday (≈3 days) |
| 1H | 60min | 1min | 336 | short swing (≈14 days) |
| 4H | 4h | 60min | 180 | medium swing (≈30 days) |
| 1D | daily | daily | 365 | daily (≈1 year) |
| 3M | weekly | daily | 12 | weekly (≈3 months) |
| 6M | monthly | daily | 6 | monthly (≈6 months) |
| 1Y | daily | daily | 365 | daily (≈1 year) |
| Max | daily | daily | 1825 | position (≈5 years) |

- `POST /api/chat` loads this profile, enforces the mapped interval, and always forwards the configured `lookbackBars` to the ICT service. If the model requests a different interval or omits `lookbackBars`, the server overrides it and logs the enforced values.
- The system prompt now explicitly mentions the enforced interval + horizon and requires the plan JSON to echo that timeframe so the assistant cannot widen its context.

## Multi-Timeframe Support (Bias Stack Integration)

The agent supports **true ICT top-down analysis** by leveraging the Bias Stack Sandbox component to provide analyses across all relevant timeframes.

### How It Works

1. **User triggers Auto-fill**: In the Bias Stack Sandbox (visible in the chat panel), the user clicks "Auto-fill from ICT" which fetches ICT analyses for:
   - Daily (higher timeframe draw)
   - 4H (higher timeframe draw)
   - 15min (bias setter - only TF that can flip intraday bias)
   - 5min (entry zone refinement)
   - 1min (MSS confirmation)

2. **Frontend stores multi-TF data**: `ChartView` receives the callback from `BiasSelectorPlayground.onAutoFillComplete()` and stores all 5 analyses in `mtfAnalyses` state.

3. **Chat API receives multi-TF context**: When the user sends a message, the chat request includes:
   ```typescript
   {
     symbol: "AAPL",
     timeframe: "5m",
     messages: [...],
     mtfAnalyses: {
       "daily": ICTAnalysis,
       "4h": ICTAnalysis,
       "15min": ICTAnalysis,
       "5min": ICTAnalysis,
       "1min": ICTAnalysis
     }
   }
   ```

4. **System prompt adapts**: If `mtfAnalyses` is present, the system prompt includes multi-timeframe instructions:
   - Daily/4H: Identify HTF draw (external liquidity, PDH/PDL)
   - 15m: Only this TF can flip intraday bias (must have displaced BOS/ChoCH)
   - 5m: Refine entry zones (OB/FVG/CE aligned with 15m bias)
   - 1m: Confirm MSS inside the 5m entry zone
   - Session awareness: Grade setups based on NY AM/PM (preferred) vs London (ok) vs off-hours (reduced)

5. **Tool response includes multi-TF data**: When `ict_analyze` is called, the tool response includes:
   ```json
   {
     "primary": <ICTAnalysis for current timeframe>,
     "multiTimeframe": {
       "daily": <ICTAnalysis>,
       "4h": <ICTAnalysis>,
       "15min": <ICTAnalysis>,
       "5min": <ICTAnalysis>,
       "1min": <ICTAnalysis>
     },
     "note": "Multi-timeframe analyses available..."
   }
   ```

6. **Agent uses all timeframes**: The agent references the entire stack when building trade plans, ensuring proper ICT methodology compliance.

### UI Indicators

- **Agent Context badge**: Shows "Multi-TF" (green checkmark) when multi-timeframe data is available, or "Single-TF" (gray) otherwise.
- **Expanded context panel**: Displays a success message when multi-TF is active, or a warning prompting the user to click "Auto-fill" for better analysis.

### Benefits

- **Zero redundant API calls**: Leverages data already fetched by the Bias Stack Sandbox.
- **User visibility**: Users see what the agent sees (playground shows all TF biases).
- **User control**: Users trigger "Auto-fill" when they want fresh multi-TF data.
- **True ICT methodology**: Agent follows proper top-down analysis instead of single-timeframe guessing.
- **Opt-in**: Only used when playground data exists; gracefully degrades to single-TF mode.

## Frontend → Chat Request
- Endpoint: `POST /api/chat`
- Payload:
  - `symbol: string` (e.g., "AAPL", "QQQ")
  - `timeframe: "1m"|"5m"|"15m"|"1H"|"4H"|"1D"|"3M"|"6M"|"1Y"|"Max"`
  - `messages: { role: "user"|"assistant"; content: string }[]` (last 50)
  - `conversationId?: string`
  - `includeCurrentBar?: boolean` (default `false`). When `true`, the ICT request keeps the latest still-forming candle instead of trimming to the last fully closed bar.
  - `mtfAnalyses?: Record<string, ICTAnalysis>` (optional). Multi-timeframe analyses from Bias Stack Sandbox. When present, the agent receives all 5 timeframes and adapts its system prompt for top-down analysis.
  - Mode detection is server-side: the chat route inspects the latest user message each turn (commands like `/plan` or language mentioning trade plans/entry-stop-target combos). When a plan intent is detected the system prompt forces the structured JSON response; otherwise it stays conversational even though the ICT data pull is the same.
- Response (success):
  - `{ reply: string, usage: { prompt_tokens, completion_tokens, total_tokens }, ictMeta?: { symbol, interval, lookbackBars, barsCount, sourceInterval, range, tz, generatedAt, lastClosedBarTimeISO, includesCurrentBar } }`
- Error semantics:
  - 400 missing/invalid payload
  - 404 conversation not found/unauthorized
  - 409 conversation token limit reached (conversation marked closed)
  - 500 upstream/tool errors

### Agent Context Inspector
- Location: `ChartView` chat panel, directly above the message list.
- Default collapsed badge shows `Using {interval} • {lookbackBars} bars • {range|≈window}` (plus `current bar included` when the opt-in is active) using locally-computed defaults so the user immediately sees what will be enforced.
- Just below the badge is the toggle: “Include current bar (may be incomplete)”. When enabled, the next chat turn passes `includeCurrentBar=true`, letting the agent see the still-forming candle. It persists per browser via `localStorage`.
- When expanded the inspector surfaces ICT meta fields: UI timeframe, enforced interval, lookback vs analyzed bars, source interval, range, horizon, last closed bar (ET), updated time (ET), timezone, whether the current bar was included, usage metrics, plus a “Copy JSON” shortcut exporting `{ symbol, timeframe, interval, lookbackBars, sourceInterval, start, end, barsCount, horizon, usage, includesCurrentBar }`.
- The inspector refreshes automatically after each chat turn (only if the timeframe/symbol still match the request) so the UI always reflects what the agent actually consumed.

## Chat Orchestration (Two-Pass Flow)
1. Build system message (mode aware):
   - Core rules (applies to both modes): strictly cite the active timeframe, never discuss BOS/ChoCH, OB/FVG, liquidity, PD%, or OHLCV without fresh `ict_analyze` data, rely on the latest CLOSED bar only, and warn if no kill zone is active.
  - `plan` mode: append requirements for the JSON trade plan block (keys: `timeframe`, `horizon`, `strategy`, `entry`, `stop`, `targets[]`, `confluence[]`, `risk`) plus a concise rationale.
   - `chat` mode: instruct the model to stay conversational (no plan JSON unless asked) while still grounding commentary in ICT fields and citing the latest bar.
2. Merge context:
   - Server loads persisted messages for `conversationId` (if present), merges with last 50 client messages (deduped to 50 total).
3. Pass 1 (model call):
   - Inputs: system + merged history + tool definition.
   - If the model returns direct content without tool calls → return reply and persist last user + assistant.
   - If `ict_analyze` tool is called → proceed to tool execution.
4. Tool execution:
   - Enforce interval from UI timeframe mapping.
   - Call `GET /api/ict?symbol=...&interval=...&lookbackBars?=&session?=`.
   - Append tool result JSON as a `tool` message.
5. Pass 2 (model call):
   - Inputs: system + merged history + assistant tool call + tool JSON.
   - Return final reply.
6. Persistence & quotas:
   - Sum token usage from both passes; update `conversations.token_used`.
   - If next total > `token_budget`, mark conversation `closed` and return 409.
   - Persist last user + assistant messages.

## Conversations API (Persistence)
- `GET /api/conversations`: List last 50 conversations (user-scoped).
- `POST /api/conversations`: Create new conversation.
  - Body: `{ title?: string, tokenBudget?: number }` (default budget ~40k tokens).
- `GET /api/conversations/[id]/messages?limit=200`: List messages for a conversation.
- `POST /api/conversations/[id]/messages`: Append a message.
  - Body: `{ role: "user"|"assistant"|"system"|"tool", content: string, meta?: any }`.
- Authorization: Anonymous user sessions keyed via `getOrCreateAnonId()`; server verifies `user_id` for conversation access.

## ICT Service
- Endpoint: `GET /api/ict`
- Query params:
  - `symbol` (required)
  - `interval` (required; one of `1min|5min|15min|30min|60min|4h|daily|weekly|monthly`)
  - `lookbackBars` (optional; defaults by interval, e.g., `weekly:260`, `monthly:120`)
  - `session` (optional; `NY` default)
  - `includeCurrentBar` (optional boolean). When `true`, the route skips the "drop incomplete bar" guard and may return a partially formed last candle; meta includes `includesCurrentBar: true` so downstream consumers can caveat the output.
- Aggregation behavior:
  - `5min`/`15min` fetch `1min` data and aggregate.
  - `4h` fetches `60min` and aggregates 240-minute buckets.
  - `weekly` fetches `daily` and groups into ISO (Monday-start) weeks.
  - `monthly` fetches `daily` and groups by calendar month.
- Price data source: internal `GET /api/price-history?symbol&interval&startDate&endDate`, where `startDate` is derived from `lookbackBars × intervalDuration × 1.5`.
- Response: `ICTAnalysis` JSON with:
  - `meta`: `{ symbol, interval, tz, lookbackBars, barsCount, range:{start,end}, lastBar, sourceInterval, generatedAt, currentBar, currentBarSummary, tz/exchangeTZ, includesCurrentBar }`
  - `structure`, `dealingRange`, `orderBlocks`, `fvg`, `liquidity`, `sessions`, `levels`, `smtSignals` as before (see `docs/ICT_DESIGN.md`).

## ICT Deterministic Logic (Summary)
- Swings (major/minor): pivot-based detection scans highs/lows with different windows; returns sorted swing points.
- Structure & bias:
  - Close above last swing high → event: BOS (if already bullish) or ChoCH (if previously bearish) → set bias bullish.
  - Close below last swing low → event: BOS (if already bearish) or ChoCH (if previously bullish) → set bias bearish.
  - Tracks `lastBosAt` and `lastChoChAt` timestamps.
- Order Blocks:
  - Identify impulse leg into the break (range vs recent average, directional bars).
  - Origin candle = last opposite-colored candle before the impulse (fallback: scan back from break).
  - Zone type: ChoCH → main; BOS → main or sub based on nearby events.
  - Refinement: default “defensive” uses body (open/close); “aggressive” uses wicks.
  - Score combines recency, proximity to last price, origin weight (ChoCH slightly > BOS), zone weight, refinement, validity by age; flag `isValid` if within `validityPeriod`.
- Dealing Range: pick major swing low/high containing last close, compute EQ midpoint and `pdPercent` position.
- FVG: three-candle test with relative width filtering (mode: very_aggressive/aggressive/defensive/very_defensive); mark filled when candle bodies overlap gap bounds.
- Liquidity: equal highs/lows via tolerance-based clustering; external extremes selected from swings; supports static/dynamic modes.
- Sessions: kill zones generated by session template (London 02:00–05:00, NY AM 10:00–11:00, NY PM 14:00–15:00, Asian 20:00–23:59).

## Intraday Bias Stack (Daily → 4H → 15m → 5m → 1m)
- Helper: `selectBias` in `@/lib/ict/bias` (with `deriveSessionWindow` for classifying the active kill zone).
- Workflow enforced before drafting trade plans:
  1. **Daily / 4H draw**: identify the higher-timeframe liquidity target (PDH/PDL, NDOG/NWOG, weekly levels). If a proposed idea fights that draw we tag it `counterTrend` and cut the grade.
  2. **15m session bias**: only the 15-minute chart may flip the intraday bias, and only after a body-close BOS/ChoCH with displacement. Its dealing range (premium/discount) must align with the intended direction.
  3. **5m refiner**: map the 15m bias into execution zones (OB/FVG/CE). Disagreement or missing zones downgrades the score.
  4. **1m execution**: wait for MSS/shift inside the 5m zone. Without it the selector returns `status: "wait"` and surfaces “Waiting for 1m MSS inside zone”.
  5. **Session fit**: preferred kill zones are NY AM (10:00–11:00) and NY PM (14:00–15:00). London 02:00–05:00 is acceptable; anything else is `off` session fit and loses points.
- The selector outputs `{ bias, grade (A/B/C), score, counterTrend, sessionFit, needsOneMinuteConfirmation, rationale[], checklist, status }` so the chat agent can cite exactly why a plan is or isn’t “Grade A”.

## Logging & Observability
- Chat API logs:
  - Model, symbol, timeframe, message counts, first-pass tool calls, usage summaries.
  - Tool call args, ICT fetch URL, and the full ICT JSON payload.
  - Final reply preview and combined token usage.
- ICT API logs:
  - High-level structure summary (bias, last BOS/ChoCH, swing counts, event count), order block list, dealing range, liquidity counts.

## Error Handling
- Chat API:
  - Validates input messages; ensures conversation ownership; enforces interval presence.
  - Returns explicit messages for OpenAI failures, conversation closed, or missing tool args.
- ICT API:
  - Validates symbol/interval; returns specific errors for price-history failures and “no data available”.

## Security & Runtime
- Requires `OPENAI_API_KEY`.
- Next.js route runtime: `nodejs`, `dynamic = force-dynamic`.
- ICT fetches price history internally; chat tool fetch uses `cache: no-store` to avoid stale data.

## Extensibility
- Add tools: Register additional function tools in `/api/chat` and gate them with system instructions.
- Expand intervals: Add mappings in the chat route; add aggregation specs in `/api/ict` if needed.
- Customize ICT options: Expose `orderBlockRefinement`, `validityPeriod`, FVG filter mode, liquidity modes via tool parameters if desired.
- Persistence: Token budgets and status (`open|closed`) govern conversation lifecycle; tune per product needs.

## Example (QQQ, 4H)
- UI timeframe `4H` maps to interval `4h`.
- ICT fetch uses `sourceInterval: 60min` and aggregates to 4-hour candles.
- Structure example: bias `bearish` with last `ChoCH` down, prior `BOS` up events; order blocks include demand (from BOS) and supply (from ChoCH), each scored and validated.

---
For questions or changes, start with Chat Orchestrator (`/api/chat`) for control flow and enforcement, ICT Service (`/api/ict`) for data derivation, and Conversations API for persistence behavior.
