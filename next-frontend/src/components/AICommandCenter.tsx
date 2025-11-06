"use client";

import React, { useCallback, useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  ChecklistItem,
  CommandCenterSnapshot,
  DirectionalBias,
  ModelStatus,
  NewsInsight,
} from "@/types/ai";

const biasToEmoji: Record<DirectionalBias, string> = {
  Bullish: "📈",
  Bearish: "📉",
  Sideways: "🔄",
};

const impactLabel = (impact: number) => {
  if (impact >= 0.75) return "High impact";
  if (impact >= 0.45) return "Medium impact";
  return "Low impact";
};

const statusTone: Record<ModelStatus["status"], "operational" | "degraded" | "offline"> = {
  Operational: "operational",
  Degraded: "degraded",
  Offline: "offline",
};

const pillarTone: Record<ChecklistItem["pillar"], "preparation" | "execution" | "review"> = {
  Preparation: "preparation",
  Execution: "execution",
  Review: "review",
};

const useMockSnapshot = (): CommandCenterSnapshot =>
  useMemo(() => {
    const now = new Date();
    const nextEvent = new Date(now.getTime() + 45 * 60 * 1000);
    const modelRefresh = new Date(now.getTime() - 15 * 60 * 1000);
    const journalRefresh = new Date(now.getTime() - 45 * 60 * 1000);

    return {
      sessionDateISO: now.toISOString(),
      session: {
        phase: "Pre-Market",
        focusTickers: ["ES", "NQ", "CL"],
        nextEvent: {
          label: "CPI Release",
          timeISO: nextEvent.toISOString(),
        },
      },
      directional: {
        instrument: "ES (E-mini S&P 500)",
        bias: "Bullish",
        confidence: 0.68,
        narrative:
          "Liquidity hunt cleared the overnight low, triggering buy-side imbalance. Expect continuation toward weekly high if 5005 holds as support.",
        keyLevels: [
          {
            label: "Liquidity Pool",
            price: 4988.5,
            type: "liquidity",
          },
          {
            label: "NY Open FVG",
            price: 5005.25,
            type: "fvg",
          },
          {
            label: "Weekly High",
            price: 5023.75,
            type: "liquidity",
          },
        ],
        supportingSignals: [
          "Sessions SMT divergence confirmed at 5:15 ET",
          "Premium/discount array flipped bullish on 30m",
          "Dollar index printing lower highs",
        ],
        lastUpdatedISO: now.toISOString(),
      },
      news: [
        {
          id: "news-1",
          headline:
            "Fed speakers hint at patient stance, citing improving inflation data",
          summary:
            "Comments from Fed officials suggest rate cuts remain on the table for Q3 if labor softens further. Treasuries rallied modestly, easing financial conditions.",
          source: "Bloomberg",
          impactScore: 0.74,
          impactNarrative:
            "Supports risk-on appetite; watch for confirmation during cash open.",
          relatedTickers: ["ES", "NQ", "ZN"],
          publishedAtISO: now.toISOString(),
        },
        {
          id: "news-2",
          headline:
            "Apple supplier guidance downgraded, highlighting consumer demand risks",
          summary:
            "Key Asia-based supplier cut shipment outlook by ~4%, citing weaker smartphone demand. Tech futures dipped pre-market but recovered on liquidity sweep.",
          source: "Reuters",
          impactScore: 0.41,
          impactNarrative:
            "Keep an eye on NQ leadership; watch breadth for confirmation before leaning on tech strength.",
          relatedTickers: ["AAPL", "NQ", "SMH"],
          publishedAtISO: now.toISOString(),
        },
      ],
      journal: {
        summary:
          "Yesterday's session delivered +$1,450 after scaling out on the lunchtime reversal. Biggest takeaway: adherence to time-based kill switch prevented overtrading into the close.",
        highlights: [
          {
            id: "highlight-1",
            dateISO: format(now, "yyyy-MM-dd"),
            outcome: "Win",
            pnl: 850,
            takeaway:
              "NY open FVG entry respected kill zone timing; partials managed per plan.",
            recommendedAction:
              "Repeat staggered take-profit ladder on similar setups.",
          },
          {
            id: "highlight-2",
            dateISO: format(now, "yyyy-MM-dd"),
            outcome: "Loss",
            pnl: -320,
            takeaway:
              "Over-anticipated liquidity grab during VWAP retest; stop placement too tight.",
            recommendedAction:
              "Require displacement candle close before engaging VWAP fades.",
          },
        ],
        actionItems: [
          "Pre-market: mark 5005.25 and 4988.5 on primary chart with alerts.",
          "Journal prompt: note emotional state after first trade closes.",
        ],
      },
      models: [
        {
          id: "directional-model",
          name: "Directional Bias Engine",
          version: "v2.1",
          status: "Operational",
          latencyMs: 82,
          lastUpdatedISO: now.toISOString(),
          notes: "Retrained on last quarter data; monitoring CPI sensitivity.",
        },
        {
          id: "news-summarizer",
          name: "Macro Relevance Model",
          version: "v0.9",
          status: "Operational",
          latencyMs: 118,
          lastUpdatedISO: modelRefresh.toISOString(),
          notes: "Executes every 5 min during NY session.",
        },
        {
          id: "journal-agent",
          name: "Journal Insight Agent",
          version: "v0.8-beta",
          status: "Degraded",
          latencyMs: 245,
          lastUpdatedISO: journalRefresh.toISOString(),
          notes: "Processing backlog from manual uploads.",
        },
      ],
      checklist: [
        {
          id: "prep-key-levels",
          label: "Mark key liquidity pools & FVGs",
          description: "Focus on 4988.5 liquidity and 5005.25 NY FVG.",
          completed: true,
          pillar: "Preparation",
        },
        {
          id: "execution-plan",
          label: "Confirm execution bias with macro context",
          description:
            "Align CPI narrative with directional model before open.",
          completed: false,
          pillar: "Execution",
        },
        {
          id: "journal-memo",
          label: "Set journal prompts for emotional checkpoints",
          description: "Capture feelings after first trade and lunch hour.",
          completed: false,
          pillar: "Review",
        },
      ],
    };
  }, []);

const AICommandCenter: React.FC = () => {
  const snapshot = useMockSnapshot();

  const handleFeedback = useCallback(
    (context: { type: "directional" | "news" | "journal" | "models" | "checklist"; id?: string }) => {
      console.info("[AI Feedback stub]", context);
      // TODO: Replace with feedback-service integration.
    },
    []
  );

  const formatImpact = (insight: NewsInsight) =>
    `${impactLabel(insight.impactScore)} • ${insight.source}`;

  const phaseClass = snapshot.session.phase.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="command-center container">
      <header className="command-center-header">
        <div>
          <p className="command-center-label">AI Command Center</p>
          <h1>
            Session Brief • {format(new Date(snapshot.sessionDateISO), "PPP")}
          </h1>
          <p className="command-center-subtitle">
            Curated bias, narrative, and action items for today’s session. Built
            from market structure, ICT heuristics, and your journal data.
          </p>
        </div>
        <div className="command-center-actions">
          <button className="cc-action primary">Start Journal Prep</button>
          <button className="cc-action ghost">Share Brief</button>
        </div>
      </header>

      <section className="cc-session-meta">
        <div className="cc-phase">
          <span className="cc-meta-label">Session</span>
          <span className={`cc-phase-chip phase-${phaseClass}`}>
            {snapshot.session.phase}
          </span>
        </div>
        <div className="cc-meta-stack">
          <div className="cc-focus">
            <span className="cc-meta-label">Focus tickers</span>
            <div className="cc-chip-row">
              {snapshot.session.focusTickers.map((ticker) => (
                <span key={ticker} className="cc-chip">
                  {ticker}
                </span>
              ))}
            </div>
          </div>
          <div className="cc-next-event">
            <span className="cc-meta-label">Next event</span>
            <div className="cc-next-event-detail">
              <span>{snapshot.session.nextEvent.label}</span>
              <span>{format(new Date(snapshot.session.nextEvent.timeISO), "p")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="command-center-grid">
        <article className="cc-card cc-directional cc-span-2">
          <div className="cc-card-header">
            <span className="cc-card-title">Directional Outlook</span>
            <div className="cc-card-meta">
              <span className="cc-card-subtitle">{snapshot.directional.instrument}</span>
              <span className={`cc-bias ${snapshot.directional.bias.toLowerCase()}`}>
                {biasToEmoji[snapshot.directional.bias]}{" "}
                {snapshot.directional.bias}
              </span>
            </div>
          </div>

          <div className="cc-confidence">
            <div className="cc-confidence-bar">
              <span
                className="cc-confidence-fill"
                style={{ width: `${Math.round(snapshot.directional.confidence * 100)}%` }}
              />
            </div>
            <span className="cc-confidence-label">
              Confidence {Math.round(snapshot.directional.confidence * 100)}%
            </span>
          </div>

          <p className="cc-narrative">{snapshot.directional.narrative}</p>

          <div className="cc-key-levels">
            {snapshot.directional.keyLevels.map((level) => (
              <div key={level.label} className="cc-key-level">
                <div className="cc-key-meta">
                  <span className={`cc-level-type type-${level.type}`}>
                    {level.label}
                  </span>
                  <span className="cc-level-price">{level.price.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          <ul className="cc-supporting-signals">
            {snapshot.directional.supportingSignals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>

          <footer className="cc-card-footer">
            <span>
              Updated{" "}
              {format(new Date(snapshot.directional.lastUpdatedISO), "p")}
            </span>
            <button
              className="cc-feedback-btn"
              onClick={() => handleFeedback({ type: "directional" })}
            >
              Needs adjustment?
            </button>
          </footer>
        </article>

        <article className="cc-card cc-news">
          <div className="cc-card-header">
            <span className="cc-card-title">News & Macro Radar</span>
            <span className="cc-card-subtitle">
              Prioritized by portfolio relevance
            </span>
          </div>

          <div className="cc-news-list">
            {snapshot.news.map((item) => (
              <div key={item.id} className="cc-news-item">
                <div className="cc-news-meta">
                  <span className="cc-impact">{formatImpact(item)}</span>
                  <span className="cc-time">
                    {format(new Date(item.publishedAtISO), "p")}
                  </span>
                </div>
                <h3>{item.headline}</h3>
                <p>{item.summary}</p>
                <p className="cc-impact-narrative">{item.impactNarrative}</p>
                <div className="cc-news-tags">
                  {item.relatedTickers.map((ticker) => (
                    <span key={ticker} className="cc-tag">
                      {ticker}
                    </span>
                  ))}
                </div>
                <button
                  className="cc-feedback-inline"
                  onClick={() =>
                    handleFeedback({ type: "news", id: item.id })
                  }
                >
                  Mark as helpful
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="cc-card cc-journal cc-span-2">
          <div className="cc-card-header">
            <span className="cc-card-title">Journal Playback</span>
            <span className="cc-card-subtitle">
              Synthesized from yesterday’s trades
            </span>
          </div>
          <p className="cc-narrative">{snapshot.journal.summary}</p>

          <div className="cc-highlights">
            {snapshot.journal.highlights.map((highlight) => (
              <div key={highlight.id} className="cc-highlight">
                <div className={`cc-badge outcome-${highlight.outcome.toLowerCase()}`}>
                  {highlight.outcome === "Win"
                    ? "✅"
                    : highlight.outcome === "Loss"
                    ? "⚠️"
                    : "ℹ️"}
                  <span>{highlight.outcome}</span>
                </div>
                <span className="cc-highlight-pnl">
                  {highlight.pnl >= 0 ? "+" : "-"}${Math.abs(highlight.pnl)}
                </span>
                <p>{highlight.takeaway}</p>
                <div className="cc-recommendation">
                  <span>Next:</span>
                  <p>{highlight.recommendedAction}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="cc-action-items">
            <span className="cc-section-label">Action items</span>
            <ul>
              {snapshot.journal.actionItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <button
            className="cc-feedback-btn"
            onClick={() => handleFeedback({ type: "journal" })}
          >
            Improve this summary
          </button>
        </article>

        <article className="cc-card cc-models">
          <div className="cc-card-header">
            <span className="cc-card-title">Model Health</span>
            <span className="cc-card-subtitle">Latency & freshness</span>
          </div>
          <div className="cc-models-list">
            {snapshot.models.map((model) => (
              <div key={model.id} className="cc-model-item">
                <div className="cc-model-item-head">
                  <div className="cc-model-name">
                    <span>{model.name}</span>
                    <span className="cc-model-version">{model.version}</span>
                  </div>
                  <span
                    className={`cc-model-status-pill status-${statusTone[model.status]}`}
                  >
                    {model.status}
                  </span>
                </div>
                {model.notes && <p className="cc-model-notes">{model.notes}</p>}
                <div className="cc-model-meta">
                  <span>Latency {model.latencyMs}ms</span>
                  <span>
                    Updated{" "}
                    {formatDistanceToNow(new Date(model.lastUpdatedISO), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <button
            className="cc-feedback-inline"
            onClick={() => handleFeedback({ type: "models" })}
          >
            View run logs
          </button>
        </article>

        <article className="cc-card cc-checklist">
          <div className="cc-card-header">
            <span className="cc-card-title">Session Checklist</span>
            <span className="cc-card-subtitle">
              Keep the plan front and center
            </span>
          </div>
          <ul className="cc-checklist-list">
            {snapshot.checklist.map((item) => (
              <li
                key={item.id}
                className={`cc-checklist-item ${item.completed ? "completed" : ""}`}
              >
                <span
                  className={`cc-check-icon ${item.completed ? "done" : ""}`}
                  aria-hidden
                >
                  {item.completed ? "✓" : ""}
                </span>
                <div className="cc-check-body">
                  <div className="cc-check-header">
                    <span className="cc-check-title">{item.label}</span>
                    <span
                      className={`cc-pill pillar-${pillarTone[item.pillar]}`}
                    >
                      {item.pillar}
                    </span>
                  </div>
                  {item.description && (
                    <p className="cc-check-description">{item.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <button
            className="cc-feedback-inline"
            onClick={() => handleFeedback({ type: "checklist" })}
          >
            Sync with playbook
          </button>
        </article>
      </section>
    </div>
  );
};

export default AICommandCenter;

