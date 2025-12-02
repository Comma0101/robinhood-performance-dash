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
import NewsFeed from "./NewsFeed";
import { getMorningReport, generateReport, type PreMarketReport } from "@/lib/api/reports";

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
    return {
      sessionDateISO: now.toISOString(),
      session: {
        phase: "Pre-Market",
        focusTickers: ["NVDA"],
        nextEvent: {
          label: "Market Open",
          timeISO: new Date(now.setHours(9, 30, 0, 0)).toISOString(),
        },
      },
      directional: {
        instrument: "QQQ",
        bias: "Bullish",
        confidence: 0.5,
        narrative: "Loading market data...",
        keyLevels: [],
        supportingSignals: [],
        lastUpdatedISO: now.toISOString(),
      },
      news: [],
      journal: {
        summary: "No journal data available.",
        highlights: [],
        actionItems: [],
      },
      models: [],
      checklist: [],
    };
  }, []);

const AICommandCenter: React.FC = () => {
  const snapshot = useMockSnapshot();
  const [newsTickers, setNewsTickers] = React.useState("NVDA");
  const [tempTickerInput, setTempTickerInput] = React.useState("NVDA");
  const [report, setReport] = React.useState<PreMarketReport | null>(null);
  const [loadingReport, setLoadingReport] = React.useState(true);
  const [selectedDate, setSelectedDate] = React.useState(new Date());

  React.useEffect(() => {
    const fetchReport = async () => {
      try {
        const dateStr = selectedDate.toISOString().split('T')[0];
        const data = await getMorningReport(dateStr, "QQQ");
        setReport(data);
      } catch (err) {
        console.error("Failed to fetch report:", err);
        setReport(null);
      } finally {
        setLoadingReport(false);
      }
    };
    setLoadingReport(true);
    fetchReport();
  }, [selectedDate]);

  const handleGenerateReport = async () => {
    try {
      setLoadingReport(true);
      const dateStr = selectedDate.toISOString().split('T')[0];
      await generateReport("QQQ", dateStr);
      // Wait a bit then refresh
      setTimeout(async () => {
        const data = await getMorningReport(dateStr, "QQQ");
        setReport(data);
        setLoadingReport(false);
      }, 5000);
    } catch (err) {
      console.error("Failed to generate:", err);
      setLoadingReport(false);
    }
  };

  const handlePreviousDay = () => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 1);
      return newDate;
    });
  };

  const handleNextDay = () => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 1);
      return newDate;
    });
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const isToday = selectedDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];

  const handleFeedback = useCallback(
    (context: { type: "directional" | "news" | "journal" | "models" | "checklist"; id?: string }) => {
      console.info("[AI Feedback stub]", context);
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
          <div className="cc-card-header flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl">
                  {biasToEmoji[report?.htf_bias as keyof typeof biasToEmoji] || "📊"}
                </span>
                <div>
                  <h2 className="text-xl font-bold text-gray-100">Pre-Market Report</h2>
                  <p className="text-sm text-gray-400">
                    {report?.symbol || "QQQ"} • {report?.htf_bias || "Loading..."} Bias
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePreviousDay}
                className="p-2 bg-gray-700/50 hover:bg-gray-600 rounded transition-colors"
                title="Previous Day"
              >
                <span className="text-lg">◀</span>
              </button>
              <div className="px-4 py-2 bg-gray-800/50 rounded">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Date</div>
                <div className="text-sm font-mono font-medium text-gray-200">
                  {format(selectedDate, "MMM d, yyyy")}
                </div>
              </div>
              <button
                onClick={handleNextDay}
                disabled={isToday}
                className="p-2 bg-gray-700/50 hover:bg-gray-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next Day"
              >
                <span className="text-lg">▶</span>
              </button>
              {!isToday && (
                <button
                  onClick={handleToday}
                  className="px-3 py-2 bg-blue-600/80 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          <div className="px-8 py-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1">
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                    style={{ width: `${Math.round((report?.confidence || 0.5) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="text-base font-semibold text-gray-300 min-w-[100px] text-right">
                {Math.round((report?.confidence || 0.5) * 100)}% Confidence
              </span>
            </div>

            {report ? (
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Morning Briefing</h3>
                  <div className="prose prose-invert prose-base max-w-none">
                    <p className="text-gray-300 text-base leading-loose whitespace-pre-wrap">
                      {report.narrative}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {report.long_scenario && (
                    <div className="bg-gradient-to-br from-green-900/20 to-green-800/10 border-2 border-green-700/40 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-5">
                        <h4 className="text-green-400 font-bold text-base flex items-center gap-2">
                          <span className="text-lg">📈</span> Long Setup
                        </h4>
                        <span className="text-xs text-green-500/80 bg-green-900/40 px-3 py-1.5 rounded-full font-medium">
                          {report.long_scenario.entry_type}
                        </span>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <div className="text-gray-500 text-xs uppercase tracking-wide mb-2">Entry Zone</div>
                          <div className="font-mono text-gray-100 font-semibold text-lg">
                            {report.long_scenario.entry_zone.low.toFixed(2)} - {report.long_scenario.entry_zone.high.toFixed(2)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div>
                            <div className="text-gray-500 text-xs uppercase tracking-wide mb-2">Stop Loss</div>
                            <div className="font-mono text-red-400 font-semibold text-base">
                              {report.long_scenario.stop_loss.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 text-xs uppercase tracking-wide mb-2">Targets</div>
                            <div className="font-mono text-green-400 font-semibold text-sm leading-relaxed">
                              {report.long_scenario.targets.map(t => t.toFixed(2)).join(', ')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {report.short_scenario && (
                    <div className="bg-gradient-to-br from-red-900/20 to-red-800/10 border-2 border-red-700/40 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-5">
                        <h4 className="text-red-400 font-bold text-base flex items-center gap-2">
                          <span className="text-lg">📉</span> Short Setup
                        </h4>
                        <span className="text-xs text-red-500/80 bg-red-900/40 px-3 py-1.5 rounded-full font-medium">
                          {report.short_scenario.entry_type}
                        </span>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <div className="text-gray-500 text-xs uppercase tracking-wide mb-2">Entry Zone</div>
                          <div className="font-mono text-gray-100 font-semibold text-lg">
                            {report.short_scenario.entry_zone.low.toFixed(2)} - {report.short_scenario.entry_zone.high.toFixed(2)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div>
                            <div className="text-gray-500 text-xs uppercase tracking-wide mb-2">Stop Loss</div>
                            <div className="font-mono text-red-400 font-semibold text-base">
                              {report.short_scenario.stop_loss.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 text-xs uppercase tracking-wide mb-2">Targets</div>
                            <div className="font-mono text-green-400 font-semibold text-sm leading-relaxed">
                              {report.short_scenario.targets.map(t => t.toFixed(2)).join(', ')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : loadingReport ? (
              <div className="text-center py-16">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-gray-400 text-base">Loading report...</p>
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-gray-400 mb-5 text-base">No pre-market report found for {format(selectedDate, "MMM d, yyyy")}.</p>
                <button
                  onClick={handleGenerateReport}
                  disabled={loadingReport}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-base font-medium disabled:opacity-50 transition-colors"
                >
                  {loadingReport ? "Generating..." : "Generate Report"}
                </button>
              </div>
            )}
          </div>

          <footer className="px-8 py-4 border-t border-gray-700/50">
            <span className="text-sm text-gray-500">
              {report ? `Generated ${format(new Date(report.created_at), "PPp")}` : "No data"}
            </span>
          </footer>
        </article>

        <article className="cc-card cc-news">
          <div className="cc-card-header">
            <span className="cc-card-title">News & Macro Radar</span>
            <span className="cc-card-subtitle">
              Prioritized by portfolio relevance
            </span>
          </div>

          <div className="px-6 pb-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setNewsTickers(tempTickerInput);
              }}
              className="relative group"
            >
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 group-focus-within:text-blue-400 transition-colors">🔍</span>
              </div>
              <input
                type="text"
                value={tempTickerInput}
                onChange={(e) => setTempTickerInput(e.target.value)}
                placeholder="Search tickers (e.g. NVDA, TSLA)..."
                className="w-full bg-gray-900/50 border-b-2 border-gray-700 text-gray-200 pl-10 pr-20 py-3 text-sm focus:border-blue-500 focus:bg-gray-900/80 outline-none transition-all placeholder-gray-600"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-blue-300 text-xs font-medium rounded-full transition-all opacity-0 group-focus-within:opacity-100"
              >
                Update
              </button>
            </form>
          </div>

          <div className="cc-news-list">
            <NewsFeed tickers={newsTickers} limit={15} />
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

