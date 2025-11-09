# Agent Onboarding & Project Context

Welcome. This repository contains a Next.js (App Router) frontend with a trading dashboard, a deterministic ICT analysis service, and a chat agent that orchestrates GPT calls plus tool execution. This file gives you enough context to work quickly without reading all the code.

## Top-Level Layout
- `next-frontend/`
  - `src/app/`
    - `chart-view/` → Chart workspace UI (entry in `page.tsx`).
    - `api/` → Next.js API routes:
      - `chat/route.ts` → Chat agent orchestrator (two-pass with tool).
      - `ict/route.ts` → ICT analysis endpoint.
      - `price-history/route.ts` → Market data fetcher used by ICT.
      - `conversations/` → Conversation CRUD and messages.
      - other feature APIs (notes, trades, twitter, etc.).
  - `src/components/` → UI components; `ChartView.tsx` contains the chat panel UI.
  - `src/lib/ict/` → Deterministic ICT logic (analysis, detectors, types, utils).
  - `docs/` → Design docs (see below).
  - `tailwind.config.ts`, `postcss.config.mjs` → Styling infra.
  - `package.json` → scripts, deps.

## Runbook
- Dev: `cd next-frontend && npm run dev` (Next 15, TS 5, Tailwind).
- Build: `npm run build`; Start: `npm start`.
- Required env (create `next-frontend/.env.local`):
  - `OPENAI_API_KEY` (chat agent)
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (conversation persistence)
  - Market/news keys as applicable (Alpha Vantage, X/Twitter).
- Do not commit secrets. Use `.env.local` locally.

## Chat Agent (Quick)
- Route: `next-frontend/src/app/api/chat/route.ts`.
- Model: `OPENAI_GPT5_MODEL` or default `gpt-4o`.
- Two-pass flow:
  1) System + history + `ict_analyze` tool definition → model (tool_choice auto).
  2) If tool called: server calls `/api/ict`, injects full JSON as tool message, calls model again for final reply.
- Timeframe enforcement:
  - `src/lib/timeframes.ts` maps UI keys → ICT intervals, source intervals, default `lookbackBars`, and horizon labels (e.g., `3M → weekly (12 bars)`, `6M → monthly (6 bars)`).
  - `/api/chat` loads that profile, enforces the mapped interval and lookback, and logs `{symbol,timeframe,enforcedInterval,lookbackBars}` on every turn. Any tool call that drifts from the selected timeframe is overridden server-side.
- Metadata surfacing:
  - When ICT runs, the chat response now includes `ictMeta` (interval, lookback, barsCount, sourceInterval, range, tz, timestamps, token usage, `includesCurrentBar`). `ChartView` projects this into the “Agent Context” inspector so users (and devs) can verify exactly which window the agent saw, whether the forming candle was included, and copy the JSON snapshot for debugging.
- Persistence & quotas:
  - Conversations and messages in Supabase; token budget tracked per conversation; closed when exceeded (409 returned).

## ICT Service (Quick)
- Route: `next-frontend/src/app/api/ict/route.ts`.
- Input: `symbol`, `interval` (`1min|5min|15min|30min|60min|4h|daily|weekly|monthly`), optional `lookbackBars`, `session`.
- Aggregation:
  - `5min/15min` fetch `1min` then aggregate; `4h` fetch `60min`; `weekly`/`monthly` fetch `daily` and group into ISO weeks / calendar months; others pass-through.
- Output: deterministic `ICTAnalysis` JSON with:
  - `structure` (bias, BOS/ChoCH, swings, events),
  - `orderBlocks` (refined ranges, scoring, validity),
  - `dealingRange`, `fvg`, `liquidity`, `sessions`, `levels`.
- Meta now exposes `lookbackBars`, `barsCount`, normalized `range.start/end`, `sourceInterval`, timestamps, and `includesCurrentBar` so downstream consumers can audit the window.
- Source data: `/api/price-history` (internal).

## Frontend Chart + Chat
- Main view: `next-frontend/src/components/ChartView.tsx`.
  - Chart + ICT overlays.
  - Right sidebar is the Chat UI (resizable); sends `symbol`, `timeframe`, last 50 messages, and `conversationId` to `/api/chat`.
  - Message list uses a fixed height (`h-[60vh]`) with internal scroll.
  - The Agent Context card (above the message list) now includes an opt-in toggle (“Include current bar (may be incomplete)”) that persists via `localStorage` and sets `includeCurrentBar=true` on the next chat turn.
  - The collapsible inspector echoes the enforced interval, lookback vs analyzed bars, source interval, date range, horizon, timezone, usage, and whether the current bar was included; it also offers a one-click JSON copy for debugging.

## Design Docs
- Chat agent architecture: `next-frontend/docs/chat-agent-architecture.md`
- ICT design and algorithms: `next-frontend/docs/ICT_DESIGN.md`
- General AI approach: `next-frontend/AI_DESIGN.md`

## Conventions for Future Changes
- Make minimal, targeted changes; preserve Next.js App Router patterns.
- Keep ICT logic deterministic; avoid probabilistic code inside `src/lib/ict`.
- If you change chat or ICT contracts, update the docs above and the mapping between UI timeframe and ICT interval.
- Prefer Tailwind utility classes for UI; align with existing design tokens.
- Don’t log or print secrets; use env vars via Next runtime.

## Common Tasks
- Adjust timeframe behavior: edit `src/lib/timeframes.ts` (single mapping for interval + lookback + horizon), update `/api/chat` if new metadata is needed, and, if required, extend `AGGREGATION_CONFIG` in `/api/ict`.
- Tune order block/FVG sensitivity: see `src/lib/ict/detectors.ts` options and `ICTAnalysisOptions`.
- Add a tool: extend the tools array in `/api/chat`, add a route, and document schema under `docs/`.

## Debug Checklist
1. **Confirm mapping** — pick a timeframe, send a chat turn, and expand the Agent Context inspector. It should show the enforced interval, default lookback bars, and (after ICT runs) the actual bars analyzed and date range. If something looks off, use the “Copy JSON” button to grab the exact payload the agent saw.
2. **Check server logs** — `/api/chat` logs `symbol`, UI timeframe, `enforcedInterval`, `lookbackBars`, and `includeCurrentBar` before calling OpenAI, plus the same fields from the ICT meta after the tool returns. Logs live in the Next.js console output.
3. **Verify ICT aggregation** — `/api/ict` now aggregates `weekly` (daily→weekly) and `monthly` (daily→monthly); its logs include `sourceInterval`, `range`, `barsCount`, `lookbackBars`, and `includesCurrentBar`. Use these when debugging range mismatches or performance.
4. **Token usage** — the inspector mirrors the combined prompt/completion/total tokens for each chat turn; compare against Supabase `conversations.token_used` when investigating quota closures.

If you need deeper details, start with the docs listed above; they’re written to be code-independent.
