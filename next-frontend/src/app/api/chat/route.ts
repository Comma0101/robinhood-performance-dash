import { NextResponse } from "next/server";
import type { ICTAnalysis } from "@/lib/ict";
import { getOrCreateAnonId } from "@/lib/session";
import { getSupabaseServerClient, type ConversationRow } from "@/lib/supabase/serverClient";
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

// Using GPT-4o (best available model from OpenAI as of 2024)
// GPT-5 doesn't exist yet - this is the most capable model
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
          enum: ["1min", "5min", "15min", "30min", "60min", "4h", "daily", "weekly", "monthly"],
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
}

const buildSystemMessage = ({
  symbol,
  timeframe,
  mode = "plan",
  enforcedInterval,
  horizon,
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
    "You are GPT-5, an ICT/SMC trading copilot.",
    `Timeframe discipline: Keep every observation inside the ${timeframeDescriptor} window. The first sentence MUST read "Based on the ${intervalLabel} chart..." and you may not widen context beyond this horizon.`,
    "Tool policy:",
    "- Do NOT mention BOS/ChoCH/MSS, order blocks, fair value gaps, liquidity, or OHLCV stats unless you have fresh ict_analyze data from this turn.",
    "- When you need structure, liquidity, PD%, PDH/PDL, or the latest OHLCV, call ict_analyze with the active symbol + interval and rely solely on its payload.",
    "Freshness: use the latest CLOSED bar only. If the tool payload appears older than the current closed bar for the active interval, ask the user to refresh instead of inferring.",
    "Session hygiene: use sessions.killZones from ict_analyze; if no kill zone is active, flag reduced setup quality unless the user explicitly overrides.",
  ];

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
      analysisMode: requestedMode,
      includeCurrentBar: includeCurrentBarInput,
    } = body ?? {};
    const analysisMode: AnalysisMode = requestedMode === "chat" ? "chat" : "plan";
    const includeCurrentBar = includeCurrentBarInput === true;
    let ictMetaSummary: AgentMetaSummary | null = null;
    const mappedInterval = mapUiTimeframeToInterval(timeframe);
    const timeframeProfile = getTimeframeProfile(timeframe);
    const desiredInterval = timeframeProfile?.interval ?? mappedInterval ?? null;
    const desiredLookbackBars =
      timeframeProfile?.lookbackBars ?? lookbackBarsForTimeframe(timeframe);
    const timeframeHorizon = getTimeframeHorizon(timeframe) ?? timeframeProfile?.horizon ?? null;
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
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();
      if (convErr) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
      if (!conv || conv.user_id !== userId) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      conversation = conv as ConversationRow;
      if (conversation.status === 'closed') {
        return NextResponse.json({ error: 'Conversation token limit reached. Start a new chat.' }, { status: 409 });
      }
      const { data: msgs, error: msgErr } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (msgErr) {
        return NextResponse.json({ error: 'Failed to load conversation messages' }, { status: 500 });
      }
      serverHistory = (msgs ?? []).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    }

    const mergedHistory = [...serverHistory, ...normalizedHistory].slice(-50);
    const systemMessage = buildSystemMessage({
      symbol,
      timeframe,
      mode: analysisMode,
      enforcedInterval: desiredInterval,
      horizon: timeframeHorizon,
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
    });
    logger.log("Last user message:", normalizedHistory[normalizedHistory.length - 1]?.content);
    logger.log("System message preview:", systemMessage.content.substring(0, 150) + "...");

    const firstPassPayload = {
      model: DEFAULT_MODEL,
      messages: openAiMessages,
      tools: [ictAnalyzeTool],
      tool_choice: "auto", // Changed from "required" - let model decide if it needs ICT data
      temperature: 0.7, // Increased from 0.25 for more varied responses
      max_tokens: 2000, // Increased from 900 for longer responses
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
      usage: firstPassData?.usage
    });

    // If model didn't request tool, return direct response (casual chat)
    if (toolCalls.length === 0) {
      const directContent =
        firstChoice?.message?.content?.trim() ??
        "The model did not provide a response.";

      logger.log("Direct response (no tool call):", directContent.substring(0, 200));
      logger.section("=== END REQUEST ===");

      // Persist if conversation is active
      if (conversationId && conversation) {
        // Store the last user message (from normalizedHistory) and assistant reply
        const lastUser = mergedHistory.filter(m => m.role === 'user').slice(-1)[0];
        try {
          if (lastUser) {
            await supabase.from('messages').insert({ conversation_id: conversationId, role: 'user', content: lastUser.content });
          }
          await supabase.from('messages').insert({ conversation_id: conversationId, role: 'assistant', content: directContent });
          await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
        } catch {}
      }

      return NextResponse.json({ reply: directContent, usage: firstPassData?.usage, ictMeta: ictMetaSummary });
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
      (typeof desiredLookbackBars === "number" ? desiredLookbackBars : undefined) ??
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
      includesCurrentBar: ictPayload.meta?.includesCurrentBar ?? includeCurrentBar,
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
        : 'N/A',
      barsCount: ictPayload.meta?.barsCount,
      lookbackBars: ictPayload.meta?.lookbackBars
    });
    logger.log("Structure:", {
      bias: ictPayload.structure?.bias,
      lastBosAt: ictPayload.structure?.lastBosAt,
      lastChoChAt: ictPayload.structure?.lastChoChAt,
      swingHighs: ictPayload.structure?.swings?.highs?.length || 0,
      swingLows: ictPayload.structure?.swings?.lows?.length || 0,
      events: ictPayload.structure?.events?.length || 0
    });

    logger.log("Order Blocks:", ictPayload.orderBlocks?.map(ob => ({
      type: ob.type,
      origin: ob.origin,
      candleTime: ob.candleTime,
      rangeLow: ob.range.low,
      rangeHigh: ob.range.high,
      score: ob.score,
      isValid: ob.isValid
    })));

    logger.log("Dealing Range:", {
      high: ictPayload.dealingRange?.high,
      low: ictPayload.dealingRange?.low,
      eq: ictPayload.dealingRange?.eq,
      pdPercent: ictPayload.dealingRange?.pdPercent
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

    const followUpMessages = [
      ...openAiMessages,
      firstChoice.message,
      {
        role: "tool" as const,
        tool_call_id: toolCall.id,
        content: JSON.stringify(ictPayload),
      },
    ];

    logger.section("=== GPT API CALL 2: WITH ICT DATA ===");
    logger.log("Total messages in context:", followUpMessages.length);

    const secondPassPayload = {
      model: DEFAULT_MODEL,
      messages: followUpMessages,
      tools: [ictAnalyzeTool],
      temperature: 0.7, // Increased from 0.2 for more variation
      max_tokens: 2000, // Increased from 900 for longer responses
    };

    const secondPassResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(secondPassPayload),
      }
    );

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
    const finalReply =
      secondPassData?.choices?.[0]?.message?.content?.trim() ??
      "No response generated after ICT analysis.";

    logger.section("=== GPT API RESPONSE 2 ===");
    logger.log("Response details:", {
      finishReason: secondPassData?.choices?.[0]?.finish_reason,
      usage: secondPassData?.usage,
      replyPreview: finalReply.substring(0, 200) + "..."
    });
    logger.section("=== END REQUEST ===");

    // Calculate combined token usage from both API calls
    const combinedUsage = {
      prompt_tokens: (firstPassData?.usage?.prompt_tokens || 0) + (secondPassData?.usage?.prompt_tokens || 0),
      completion_tokens: (firstPassData?.usage?.completion_tokens || 0) + (secondPassData?.usage?.completion_tokens || 0),
      total_tokens: (firstPassData?.usage?.total_tokens || 0) + (secondPassData?.usage?.total_tokens || 0),
    };

    logger.log("Combined usage for this conversation turn:", combinedUsage);

    // Enforce per-conversation token budget if applicable
    if (conversationId && conversation) {
      const turnTokens = combinedUsage.total_tokens || 0;
      const nextTotal = (conversation.token_used || 0) + turnTokens;
      if (nextTotal > conversation.token_budget) {
        // Mark closed; do not persist further messages
        await supabase
          .from('conversations')
          .update({ status: 'closed', token_used: nextTotal, updated_at: new Date().toISOString() })
          .eq('id', conversationId);
        return NextResponse.json(
          { error: 'Conversation token limit reached. Please start a new chat.', usage: combinedUsage },
          { status: 409 }
        );
      }

      // Persist: last user message + assistant reply, and bump usage
      const lastUser = mergedHistory.filter(m => m.role === 'user').slice(-1)[0];
      if (lastUser) {
        await supabase.from('messages').insert({ conversation_id: conversationId, role: 'user', content: lastUser.content });
      }
      await supabase.from('messages').insert({ conversation_id: conversationId, role: 'assistant', content: finalReply, token_prompt: combinedUsage.prompt_tokens ?? null, token_completion: combinedUsage.completion_tokens ?? null });
      await supabase
        .from('conversations')
        .update({ token_used: nextTotal, updated_at: new Date().toISOString() })
        .eq('id', conversationId);
    }

    return NextResponse.json({ reply: finalReply, usage: combinedUsage, ictMeta: ictMetaSummary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
