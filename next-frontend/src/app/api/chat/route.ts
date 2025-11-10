import { NextResponse } from "next/server";
import type { ICTAnalysis } from "@/lib/ict";
import { getOrCreateAnonId } from "@/lib/session";
import {
  getSupabaseServerClient,
  type ConversationRow,
} from "@/lib/supabase/serverClient";
import { logger } from "@/lib/logger";
import {
  getTimeframeHorizon,
  getTimeframeProfile,
  lookbackBarsForTimeframe,
  mapUiTimeframeToInterval,
} from "@/lib/timeframes";

interface ClientMessage {
  role: "user" | "assistant";
  content: string;
}

type AnalysisMode = "plan" | "chat";

const PLAN_COMMAND_REGEX = /(^|\s)\/(plan|tradeplan|setup)\b/i;
const PLAN_KEYWORD_REGEXES = [
  /\btrade plan\b/i,
  /\bexecution plan\b/i,
  /\bplan (?:this|that|the|it|my)\b/i,
  /\bplan out\b/i,
  /\bcan you (?:build|create|draft|map) (?:a )?plan\b/i,
  /\bstructure (?:a )?setup\b/i,
  /\bturn this into (?:a )?plan\b/i,
];
const PLAN_COMBO_REGEXES = [
  /\bentry\b[^\n]*\b(stop|target|tp|sl|risk)\b/i,
  /\bstop\b[^\n]*\b(target|entry|tp)\b/i,
  /\btargets?\b[^\n]*\b(entry|stop)\b/i,
];

const inferAnalysisMode = (history: ClientMessage[]): AnalysisMode => {
  const lastUserMessage = [...history]
    .reverse()
    .find(
      (message) =>
        message.role === "user" && typeof message.content === "string"
    );

  if (!lastUserMessage?.content) {
    return "chat";
  }

  const content = lastUserMessage.content.trim();
  if (!content) {
    return "chat";
  }

  if (PLAN_COMMAND_REGEX.test(content)) {
    return "plan";
  }

  if (PLAN_KEYWORD_REGEXES.some((regex) => regex.test(content))) {
    return "plan";
  }

  if (PLAN_COMBO_REGEXES.some((regex) => regex.test(content))) {
    return "plan";
  }

  return "chat";
};

type AgentMetaSummary = {
  symbol?: string;
  interval?: string;
  lookbackBars?: number | null;
  barsCount?: number | null;
  sourceInterval?: string | null;
  range?: {
    start: string;
    end: string;
  } | null;
  generatedAt?: string | null;
  tz?: string;
  lastClosedBarTimeISO?: string | null;
  includesCurrentBar?: boolean | null;
};

// Default to a stable, fast model if env not set
// Honor OPENAI_GPT5_MODEL for backwards compatibility, but fall back to gpt-4o
const DEFAULT_MODEL = process.env.OPENAI_GPT5_MODEL ?? "gpt-4o";

const ictAnalyzeTool = {
  type: "function",
  function: {
    name: "ict_analyze",
    description:
      "Deterministic ICT (Smart Money Concepts) analyzer. Always call first to inspect BOS/ChoCH, order blocks, fair value gaps, dealing range, liquidity, and session kill zones.",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Ticker symbol to analyze (e.g. AAPL).",
        },
        interval: {
          type: "string",
          enum: [
            "1min",
            "5min",
            "15min",
            "30min",
            "60min",
            "4h",
            "daily",
            "weekly",
            "monthly",
          ],
          description: "Price bar interval to analyze.",
        },
        lookbackBars: {
          type: "integer",
          description:
            "Optional number of most recent bars to analyze. Defaults to sensible value per interval.",
          minimum: 50,
          maximum: 5000,
        },
        session: {
          type: "string",
          enum: ["NY", "LDN"],
          description:
            "Session template when computing kill zones (default NY).",
        },
      },
      required: ["symbol", "interval"],
    },
  },
};

interface SystemPromptOptions {
  symbol?: string;
  timeframe?: string;
  mode?: AnalysisMode;
  enforcedInterval?: string | null;
  horizon?: string | null;
  hasMtfContext?: boolean;
}

const buildSystemMessage = ({
  symbol,
  timeframe,
  mode = "plan",
  enforcedInterval,
  horizon,
  hasMtfContext = false,
}: SystemPromptOptions) => {
  const timeframeLabel = timeframe ?? enforcedInterval ?? "active";
  const intervalLabel = enforcedInterval ?? timeframeLabel;
  const descriptorParts = [];
  if (timeframe) descriptorParts.push(`${timeframe} selection`);
  if (enforcedInterval && enforcedInterval !== timeframe) {
    descriptorParts.push(`ICT interval ${enforcedInterval}`);
  }
  if (horizon) descriptorParts.push(horizon);
  const timeframeDescriptor = descriptorParts.join(" · ") || timeframeLabel;
  const horizonLabel = horizon ?? "selected timeframe window";
  const instructions: string[] = [
    "You are an ICT/SMC trading copilot with expertise in multi-timeframe top-down analysis.",
    `Timeframe discipline: The primary analysis timeframe is ${intervalLabel} (${horizonLabel}). Start your response with "Based on the ${intervalLabel} chart..." to anchor the user's context.`,
  ];

  if (hasMtfContext) {
    instructions.push(
      "Multi-timeframe context available: The tool response will include analyses for Daily, 4H, 15m, 5m, and 1m timeframes. You do NOT need to call ict_analyze multiple times - it will all be provided in a single tool response under the 'multiTimeframe' key.",
      "When you receive the tool data, use it for proper ICT top-down analysis:",
      "- Daily/4H: Identify higher timeframe draw (external liquidity targets, PDH/PDL, NDOG/NWOG). This sets the directional bias.",
      "- 15m: This is the ONLY timeframe that can flip intraday bias. Check for body-close BOS/ChoCH with displacement. Verify dealing range (premium/discount %) aligns with intended direction.",
      "- 5m: Refine entry zones - look for order blocks, FVG, or consequent encroachment that align with 15m bias.",
      "- 1m: Confirm MSS (market structure shift) inside the 5m entry zone before execution.",
      "- Session context: Preferred execution windows are NY AM (10:00-11:00 ET) and NY PM (14:00-15:00 ET). London (02:00-05:00 ET) is acceptable. Grade setups lower if outside preferred sessions.",
      "When building trade plans, ALWAYS reference the multi-timeframe stack to confirm alignment. Flag countertrend setups explicitly if 15m bias fights Daily/4H draw."
    );
  } else {
    instructions.push(
      "Single timeframe mode: You only have access to the current timeframe. If the user asks for a trade plan, recommend they use 'Auto-fill from ICT' in the Bias Stack Sandbox to load multi-timeframe context for proper top-down analysis."
    );
  }

  instructions.push(
    "Tool policy:",
    "- Do NOT mention BOS/ChoCH/MSS, order blocks, fair value gaps, liquidity, or OHLCV stats unless you have fresh ict_analyze data from this turn.",
    "- When you need structure, liquidity, PD%, PDH/PDL, or the latest OHLCV, call ict_analyze with the active symbol + interval and rely solely on its payload.",
    "Freshness: use the latest CLOSED bar only. If the tool payload appears older than the current closed bar for the active interval, ask the user to refresh instead of inferring.",
    "Session hygiene: use sessions.killZones from ict_analyze; if no kill zone is active, flag reduced setup quality unless the user explicitly overrides."
  );

  if (mode === "plan") {
    instructions.push(
      "After receiving tool data, respond with:",
      `1) A machine-readable plan JSON with keys: timeframe (must equal "${intervalLabel}"), horizon (describe ${horizonLabel}), strategy, entry, stop, targets (array), confluence (array), risk (string).`,
      "2) A concise rationale referencing BOS/ChoCH alignment, order blocks, dealing range premium/discount, liquidity, and session context while reaffirming the active timeframe."
    );
  } else {
    instructions.push(
      "Respond conversationally and do NOT emit plan JSON unless the user explicitly requests a trade plan.",
      "Reference BOS/ChoCH, order blocks, dealing range, liquidity, and sessions as supportive context while keeping the tone collaborative.",
      "Always cite the latest closed bar's timestamp plus OHLC and volume from the tool payload to ground your commentary."
    );
  }

  instructions.push(
    "If ict_analyze fails or returns missing fields, explain the gap and request a refresh instead of guessing.",
    symbol
      ? `Workspace symbol context: ${symbol}. Tailor bias observations to this instrument.`
      : "No active symbol provided; politely request the symbol before proceeding."
  );

  return {
    role: "system" as const,
    content: instructions.join(" "),
  };
};

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI credentials are not configured." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      messages,
      symbol,
      timeframe,
      conversationId,
      includeCurrentBar: includeCurrentBarInput,
      mtfAnalyses,
    } = body ?? {};
    const includeCurrentBar = includeCurrentBarInput === true;

    // Validate mtfAnalyses structure if present
    if (
      mtfAnalyses !== undefined &&
      mtfAnalyses !== null &&
      typeof mtfAnalyses !== "object"
    ) {
      logger.log(
        "WARNING: mtfAnalyses is not an object, ignoring",
        typeof mtfAnalyses
      );
    }
    let ictMetaSummary: AgentMetaSummary | null = null;
    const mappedInterval = mapUiTimeframeToInterval(timeframe);
    const timeframeProfile = getTimeframeProfile(timeframe);
    const desiredInterval =
      timeframeProfile?.interval ?? mappedInterval ?? null;
    const desiredLookbackBars =
      timeframeProfile?.lookbackBars ?? lookbackBarsForTimeframe(timeframe);
    const timeframeHorizon =
      getTimeframeHorizon(timeframe) ?? timeframeProfile?.horizon ?? null;
    const timeframeSourceInterval = timeframeProfile?.sourceInterval ?? null;
    const timeframeRangeLabel = timeframeProfile?.rangeLabel ?? null;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required." },
        { status: 400 }
      );
    }

    // Keep last 50 messages for better conversation context (was 12)
    const normalizedHistory: ClientMessage[] = messages
      .filter(
        (message: ClientMessage) =>
          message &&
          typeof message.content === "string" &&
          (message.role === "user" || message.role === "assistant")
      )
      .slice(-50);

    if (normalizedHistory.length === 0) {
      return NextResponse.json(
        { error: "At least one valid message is required." },
        { status: 400 }
      );
    }

    // If a conversationId is provided, load server-side history
    const userId = await getOrCreateAnonId();
    const supabase = getSupabaseServerClient();
    let serverHistory: ClientMessage[] = [];
    let conversation: ConversationRow | null = null;
    if (conversationId) {
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single();
      if (convErr) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }
      if (!conv || conv.user_id !== userId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      conversation = conv as ConversationRow;
      if (conversation.status === "closed") {
        return NextResponse.json(
          { error: "Conversation token limit reached. Start a new chat." },
          { status: 409 }
        );
      }
      const { data: msgs, error: msgErr } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (msgErr) {
        return NextResponse.json(
          { error: "Failed to load conversation messages" },
          { status: 500 }
        );
      }
      serverHistory = (msgs ?? []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    }

    const mergedHistory = [...serverHistory, ...normalizedHistory].slice(-50);
    const analysisMode = inferAnalysisMode(mergedHistory);
    const hasMtfContext = mtfAnalyses && Object.keys(mtfAnalyses).length > 0;
    const systemMessage = buildSystemMessage({
      symbol,
      timeframe,
      mode: analysisMode,
      enforcedInterval: desiredInterval,
      horizon: timeframeHorizon,
      hasMtfContext,
    });
    const openAiMessages = [systemMessage, ...mergedHistory];

    // Log conversation being sent
    logger.section("=== GPT API CALL 1: INITIAL REQUEST ===");
    logger.log("Model:", DEFAULT_MODEL);
    logger.log("Context:", {
      symbol,
      timeframe,
      enforcedInterval: desiredInterval,
      lookbackBars: desiredLookbackBars,
      horizon: timeframeHorizon,
      sourceInterval: timeframeSourceInterval,
      range: timeframeRangeLabel,
      messageCount: normalizedHistory.length,
      includeCurrentBar,
      analysisMode,
    });
    logger.log(
      "Last user message:",
      normalizedHistory[normalizedHistory.length - 1]?.content
    );
    logger.log(
      "System message preview:",
      systemMessage.content.substring(0, 150) + "..."
    );

    const firstPassPayload = {
      model: DEFAULT_MODEL,
      messages: openAiMessages,
      tools: [ictAnalyzeTool],
      tool_choice: "auto", // Changed from "required" - let model decide if it needs ICT data
      // Keep token cap modest to encourage quick tool calls
      max_tokens: 800,
      // Temperature omitted (defaults to 1 for most models)
    };

    logger.debug("Request payload:", firstPassPayload);

    const firstPassResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(firstPassPayload),
      }
    );

    if (!firstPassResponse.ok) {
      let errorMessage = "OpenAI request failed.";
      try {
        const errorPayload = await firstPassResponse.json();
        if (errorPayload?.error?.message) {
          errorMessage = errorPayload.error.message;
        }
      } catch {
        // Swallow JSON parse errors and use default message
      }
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    const firstPassData = await firstPassResponse.json();
    const firstChoice = firstPassData?.choices?.[0];
    const toolCalls = firstChoice?.message?.tool_calls ?? [];

    logger.section("=== GPT API RESPONSE 1 ===");
    logger.log("Response details:", {
      finishReason: firstChoice?.finish_reason,
      toolCallsRequested: toolCalls.length,
      usage: firstPassData?.usage,
    });

    // If model made multiple tool calls, warn and only process the first one
    if (toolCalls.length > 1) {
      logger.log(
        "WARNING: Model requested multiple tool calls, only processing first one",
        {
          toolCallIds: toolCalls.map((tc: any) => tc.id),
          toolCallCount: toolCalls.length,
        }
      );
    }

    // If model didn't request tool, return direct response (casual chat)
    if (toolCalls.length === 0) {
      const directContent =
        firstChoice?.message?.content?.trim() ??
        "The model did not provide a response.";

      logger.log(
        "Direct response (no tool call):",
        directContent.substring(0, 200)
      );
      logger.section("=== END REQUEST ===");

      // Persist if conversation is active
      if (conversationId && conversation) {
        // Store the last user message (from normalizedHistory) and assistant reply
        const lastUser = mergedHistory
          .filter((m) => m.role === "user")
          .slice(-1)[0];
        try {
          if (lastUser) {
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              role: "user",
              content: lastUser.content,
            });
          }
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: directContent,
          });
          await supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversationId);
        } catch {}
      }

      return NextResponse.json({
        reply: directContent,
        usage: firstPassData?.usage,
        ictMeta: ictMetaSummary,
      });
    }

    const toolCall = toolCalls[0];
    if (!toolCall?.function?.name || toolCall.function.name !== "ict_analyze") {
      return NextResponse.json(
        { error: "Unexpected tool call sequence from model." },
        { status: 500 }
      );
    }

    let toolArgs: Record<string, unknown> = {};
    try {
      toolArgs =
        typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments ?? {};
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to parse ict_analyze arguments." },
        { status: 500 }
      );
    }

    const toolSymbol = (toolArgs.symbol as string | undefined) ?? symbol;
    let interval = toolArgs.interval as string | undefined;
    // Enforce the interval derived from the UI timeframe when available
    if (desiredInterval && interval !== desiredInterval) {
      logger.log("Enforcing ICT interval from timeframe selection", {
        requested: interval,
        enforced: desiredInterval,
      });
      interval = desiredInterval;
    }
    const incomingLookbackBars =
      typeof toolArgs.lookbackBars === "number"
        ? (toolArgs.lookbackBars as number)
        : undefined;
    const fallbackLookback =
      interval === "1min"
        ? 60
        : interval === "5min"
        ? 72
        : interval === "15min"
        ? 288
        : interval === "30min"
        ? 336
        : interval === "60min"
        ? 336
        : interval === "4h"
        ? 180
        : interval === "weekly"
        ? 12
        : interval === "monthly"
        ? 6
        : 365;
    const lookbackBars =
      (typeof desiredLookbackBars === "number"
        ? desiredLookbackBars
        : undefined) ??
      incomingLookbackBars ??
      fallbackLookback;
    const sessionInput = toolArgs.session as "NY" | "LDN" | undefined;

    logger.section("=== TOOL CALL: ict_analyze ===");
    logger.log("Args:", {
      symbol: toolSymbol,
      interval,
      lookbackBars,
      session: sessionInput,
      includeCurrentBar,
    });

    if (!toolSymbol || !interval) {
      return NextResponse.json(
        { error: "ict_analyze requires symbol and interval arguments." },
        { status: 400 }
      );
    }

    const ictUrl = new URL(request.url);
    ictUrl.pathname = "/api/ict";
    ictUrl.search = "";
    ictUrl.searchParams.set("symbol", toolSymbol);
    ictUrl.searchParams.set("interval", interval);
    if (typeof lookbackBars === "number") {
      ictUrl.searchParams.set("lookbackBars", lookbackBars.toString());
    }
    if (sessionInput) {
      ictUrl.searchParams.set("session", sessionInput);
    }
    if (includeCurrentBar) {
      ictUrl.searchParams.set("includeCurrentBar", "true");
    }

    logger.section("=== ICT DATA REQUEST ===");
    logger.log("Fetching ICT data from:", ictUrl.pathname + ictUrl.search);
    logger.log("ICT Analysis Parameters:", {
      symbol: toolSymbol,
      interval,
      lookbackBars,
      session: sessionInput,
      timeframe: timeframe,
      desiredInterval,
      includeCurrentBar,
    });

    const ictResponse = await fetch(ictUrl.toString(), { cache: "no-store" });
    if (!ictResponse.ok) {
      const ictError = await ictResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: "ICT analysis request failed.",
          details: ictError?.error ?? ictResponse.statusText,
        },
        { status: ictResponse.status }
      );
    }

    const ictPayload = (await ictResponse.json()) as ICTAnalysis;
    ictMetaSummary = {
      symbol: ictPayload.meta?.symbol,
      interval: ictPayload.meta?.interval,
      lookbackBars: ictPayload.meta?.lookbackBars ?? null,
      barsCount: ictPayload.meta?.barsCount ?? null,
      sourceInterval: ictPayload.meta?.sourceInterval ?? null,
      range: ictPayload.meta?.range ?? null,
      generatedAt: ictPayload.meta?.generatedAt ?? null,
      tz: ictPayload.meta?.tz,
      lastClosedBarTimeISO: ictPayload.meta?.lastClosedBarTimeISO ?? null,
      includesCurrentBar:
        ictPayload.meta?.includesCurrentBar ?? includeCurrentBar,
    };

    logger.section("=== ICT DATA RECEIVED ===");
    logger.log("Data Metadata:", {
      symbol: ictPayload.meta?.symbol,
      interval: ictPayload.meta?.interval,
      sourceInterval: ictPayload.meta?.sourceInterval,
      dateRangeStart: ictPayload.meta?.range?.start,
      dateRangeEnd: ictPayload.meta?.range?.end,
      lastBarTime: ictPayload.meta?.lastBar?.time,
      lastClosedBarTime: ictPayload.meta?.lastClosedBarTimeISO,
      dateRangeSpan: ictPayload.meta?.range
        ? `${ictPayload.meta.range.start} to ${ictPayload.meta.range.end}`
        : "N/A",
      barsCount: ictPayload.meta?.barsCount,
      lookbackBars: ictPayload.meta?.lookbackBars,
    });
    logger.log("Structure:", {
      bias: ictPayload.structure?.bias,
      lastBosAt: ictPayload.structure?.lastBosAt,
      lastChoChAt: ictPayload.structure?.lastChoChAt,
      swingHighs: ictPayload.structure?.swings?.highs?.length || 0,
      swingLows: ictPayload.structure?.swings?.lows?.length || 0,
      events: ictPayload.structure?.events?.length || 0,
    });

    logger.log(
      "Order Blocks:",
      ictPayload.orderBlocks?.map((ob) => ({
        type: ob.type,
        origin: ob.origin,
        candleTime: ob.candleTime,
        rangeLow: ob.range.low,
        rangeHigh: ob.range.high,
        score: ob.score,
        isValid: ob.isValid,
      }))
    );

    logger.log("Dealing Range:", {
      high: ictPayload.dealingRange?.high,
      low: ictPayload.dealingRange?.low,
      eq: ictPayload.dealingRange?.eq,
      pdPercent: ictPayload.dealingRange?.pdPercent,
    });

    logger.log("Liquidity Zones:", {
      equalHighs: ictPayload.liquidity?.equalHighs?.length || 0,
      equalLows: ictPayload.liquidity?.equalLows?.length || 0,
      externalHighs: ictPayload.liquidity?.externalHighs?.length || 0,
      externalLows: ictPayload.liquidity?.externalLows?.length || 0,
    });

    logger.log("FVG Count:", ictPayload.fvg?.length || 0);
    logger.log("Sessions:", ictPayload.sessions ? "Yes" : "No");

    // Log the FULL ICT payload that's being sent to GPT
    logger.section("=== FULL ICT PAYLOAD (what GPT sees) ===");
    logger.debug("Complete ICT Analysis", ictPayload);

    // Build a trimmed primary payload to reduce token load in the second call
    const trimmedPrimary = {
      meta: {
        symbol: ictPayload.meta?.symbol,
        interval: ictPayload.meta?.interval,
        lookbackBars: ictPayload.meta?.lookbackBars,
        barsCount: ictPayload.meta?.barsCount,
        range: ictPayload.meta?.range,
        lastClosedBarTimeISO: ictPayload.meta?.lastClosedBarTimeISO,
        includesCurrentBar:
          ictPayload.meta?.includesCurrentBar ?? includeCurrentBar,
        lastBar: ictPayload.meta?.lastBar
          ? { time: ictPayload.meta.lastBar.time, close: ictPayload.meta.lastBar.close }
          : null,
      },
      structure: {
        bias: ictPayload.structure?.bias,
        lastBosAt: ictPayload.structure?.lastBosAt,
        lastChoChAt: ictPayload.structure?.lastChoChAt,
        // Only the last 3 events to keep context concise
        events: (ictPayload.structure?.events || []).slice(-3),
      },
      dealingRange: ictPayload.dealingRange
        ? {
            low: ictPayload.dealingRange.low,
            high: ictPayload.dealingRange.high,
            eq: ictPayload.dealingRange.eq,
            pdPercent: ictPayload.dealingRange.pdPercent,
          }
        : null,
      // Keep only top 3 OBs by order as produced (assumed already scored)
      orderBlocks: (ictPayload.orderBlocks || []).slice(0, 3).map((ob) => ({
        type: ob.type,
        origin: ob.origin,
        candleTime: ob.candleTime,
        range: ob.range,
        score: ob.score,
        isValid: ob.isValid,
        status: ob.status,
      })),
      // Keep small summary of FVGs
      fvg: (ictPayload.fvg || []).slice(0, 2).map((g) => ({
        type: g.type,
        startTime: g.startTime,
        endTime: g.endTime,
        bounds: g.bounds,
        ce: g.ce,
        filled: g.filled,
        filledRatio: g.filledRatio,
        potency: g.potency,
      })),
      liquidity: {
        externalHighs: (ictPayload.liquidity?.externalHighs || [])
          .slice(0, 3)
          .map((h) => ({ price: h.price })),
        externalLows: (ictPayload.liquidity?.externalLows || [])
          .slice(0, 3)
          .map((l) => ({ price: l.price })),
      },
      sessions: {
        // Include only currently active kill zones, if any
        killZones: (ictPayload.sessions?.killZones || [])
          .filter((k) => k.active)
          .map((k) => ({ name: k.name, start: k.start, end: k.end, active: k.active })),
      },
      levels: {
        prevDayHigh: ictPayload.levels?.prevDayHigh,
        prevDayLow: ictPayload.levels?.prevDayLow,
        weeklyHigh: ictPayload.levels?.weeklyHigh,
        weeklyLow: ictPayload.levels?.weeklyLow,
      },
      // Keep the last 2 SMT signals if available
      smtSignals: (ictPayload.smtSignals || []).slice(-2),
    };

    // Build the tool response with optional multi-timeframe context
    const toolResponse: any = {
      primary: trimmedPrimary,
    };

    if (hasMtfContext && mtfAnalyses) {
      logger.section("=== MULTI-TIMEFRAME CONTEXT (from Bias Stack) ===");
      logger.log("Available timeframes:", Object.keys(mtfAnalyses));

      // Trim multi-TF data to only essential fields to avoid token limit and timeout
      const trimmedMtf: Record<string, any> = {};
      for (const [tf, analysis] of Object.entries(mtfAnalyses)) {
        const ictAnalysis = analysis as ICTAnalysis;
        trimmedMtf[tf] = {
          meta: {
            interval: ictAnalysis.meta?.interval,
            lastBar: {
              time: ictAnalysis.meta?.lastBar?.time,
              close: ictAnalysis.meta?.lastBar?.close,
            },
          },
          structure: {
            bias: ictAnalysis.structure?.bias,
            lastBosAt: ictAnalysis.structure?.lastBosAt,
            lastChoChAt: ictAnalysis.structure?.lastChoChAt,
            // Only include last 2 events to minimize payload
            events: ictAnalysis.structure?.events?.slice(-2),
          },
          dealingRange: ictAnalysis.dealingRange,
          // Only include top 2 order blocks instead of 5
          orderBlocks: ictAnalysis.orderBlocks?.slice(0, 2).map((ob) => ({
            type: ob.type,
            origin: ob.origin,
            candleTime: ob.candleTime,
            range: ob.range,
            score: ob.score,
          })),
          // Only include top 2 liquidity levels instead of 3
          liquidity: {
            externalHighs: ictAnalysis.liquidity?.externalHighs?.slice(0, 2).map((h) => ({
              price: h.price,
            })),
            externalLows: ictAnalysis.liquidity?.externalLows?.slice(0, 2).map((l) => ({
              price: l.price,
            })),
          },
        };
      }

      toolResponse.multiTimeframe = trimmedMtf;
      toolResponse.note =
        "Multi-timeframe analyses are available from the bias stack. Use 'primary' for the current execution timeframe and 'multiTimeframe' for top-down analysis (daily, 4h, 15min, 5min, 1min).";
    }

    let toolResponseJson: string;
    try {
      toolResponseJson = JSON.stringify(toolResponse);
    } catch (jsonError) {
      logger.log("ERROR: Failed to stringify tool response", jsonError);
      // Fallback to just the primary payload if multi-TF causes issues
      toolResponseJson = JSON.stringify({ primary: ictPayload });
    }

    // Log payload size
    const payloadSizeKB = (toolResponseJson.length / 1024).toFixed(2);
    logger.log("Tool response payload size:", `${payloadSizeKB} KB`);

    // Create tool response messages for ALL tool calls (OpenAI requires this)
    const toolResponseMessages = toolCalls.map((tc: any) => ({
      role: "tool" as const,
      tool_call_id: tc.id,
      content: toolResponseJson, // Use the same response for all calls
    }));

    const followUpMessages = [
      ...openAiMessages,
      firstChoice.message,
      ...toolResponseMessages, // Respond to ALL tool calls
    ];

    logger.section("=== GPT API CALL 2: WITH ICT DATA ===");
    logger.log("Total messages in context:", followUpMessages.length);
    logger.log("Tool responses created:", toolResponseMessages.length);

    const secondPassPayload = {
      model: DEFAULT_MODEL,
      messages: followUpMessages,
      tools: [ictAnalyzeTool],
      // Cap completion length to keep latency reasonable
      max_tokens: 1200,
      // Temperature omitted (defaults to 1 for most models)
    };

    // Add timeout to prevent hanging for too long
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 60000); // 60 second timeout

    let secondPassResponse;
    try {
      secondPassResponse = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify(secondPassPayload),
          signal: abortController.signal,
        }
      );
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === "AbortError") {
        logger.log("ERROR: OpenAI request timed out after 60 seconds");
        return NextResponse.json(
          { error: "Request timed out. The payload might be too large or the model is taking too long to respond." },
          { status: 504 }
        );
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!secondPassResponse.ok) {
      let errorMessage = "OpenAI follow-up request failed.";
      try {
        const errorPayload = await secondPassResponse.json();
        if (errorPayload?.error?.message) {
          errorMessage = errorPayload.error.message;
        }
      } catch {
        // ignore parse failure
      }
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    const secondPassData = await secondPassResponse.json();

    // Check for refusal or empty content
    const secondChoice = secondPassData?.choices?.[0];
    const refusal = secondChoice?.message?.refusal;
    const content = secondChoice?.message?.content?.trim();

    logger.section("=== GPT API RESPONSE 2 ===");
    logger.debug("Full response from GPT:", secondPassData);
    logger.log("Response details:", {
      finishReason: secondChoice?.finish_reason,
      usage: secondPassData?.usage,
      hasRefusal: !!refusal,
      hasContent: !!content,
      contentLength: content?.length || 0,
    });

    if (refusal) {
      logger.log("ERROR: GPT refused to respond:", refusal);
      return NextResponse.json(
        { error: `GPT refused to respond: ${refusal}` },
        { status: 500 }
      );
    }

    const finalReply = content || "No response generated after ICT analysis.";

    logger.log("Reply preview:", finalReply.substring(0, 200) + "...");
    logger.section("=== END REQUEST ===");

    // Calculate combined token usage from both API calls
    const combinedUsage = {
      prompt_tokens:
        (firstPassData?.usage?.prompt_tokens || 0) +
        (secondPassData?.usage?.prompt_tokens || 0),
      completion_tokens:
        (firstPassData?.usage?.completion_tokens || 0) +
        (secondPassData?.usage?.completion_tokens || 0),
      total_tokens:
        (firstPassData?.usage?.total_tokens || 0) +
        (secondPassData?.usage?.total_tokens || 0),
    };

    logger.log("Combined usage for this conversation turn:", combinedUsage);

    // Enforce per-conversation token budget if applicable
    if (conversationId && conversation) {
      const turnTokens = combinedUsage.total_tokens || 0;
      const nextTotal = (conversation.token_used || 0) + turnTokens;
      if (nextTotal > conversation.token_budget) {
        // Mark closed; do not persist further messages
        await supabase
          .from("conversations")
          .update({
            status: "closed",
            token_used: nextTotal,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
        return NextResponse.json(
          {
            error: "Conversation token limit reached. Please start a new chat.",
            usage: combinedUsage,
          },
          { status: 409 }
        );
      }

      // Persist: last user message + assistant reply, and bump usage
      const lastUser = mergedHistory
        .filter((m) => m.role === "user")
        .slice(-1)[0];
      if (lastUser) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "user",
          content: lastUser.content,
        });
      }
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: finalReply,
        token_prompt: combinedUsage.prompt_tokens ?? null,
        token_completion: combinedUsage.completion_tokens ?? null,
      });
      await supabase
        .from("conversations")
        .update({ token_used: nextTotal, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    return NextResponse.json({
      reply: finalReply,
      usage: combinedUsage,
      ictMeta: ictMetaSummary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error occurred.";
    logger.section("=== ERROR IN CHAT API ===");
    logger.log("Error message:", message);
    if (error instanceof Error) {
      logger.log("Error stack:", error.stack);
    }
    logger.log("Error details:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
