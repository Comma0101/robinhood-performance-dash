"use client";

import React, { useState, useEffect } from "react";
import { format } from "date-fns";

// Enhanced type definitions
interface TradeNote {
  id: string;
  symbol: string;
  setup: string;
  entry: number;
  exit: number;
  stopLoss?: number;
  takeProfit?: number;
  position: number;
  pnl: number;
  riskRewardRatio?: number;
  executionQuality: "excellent" | "good" | "fair" | "poor";
  notes?: string;
}

interface AITradePlan {
  symbol: string;
  timeframe: string;
  horizon?: string;
  strategy?: string;
  entry?: string;
  stop?: string;
  targets?: Array<number | string>;
  confluence?: string[];
  risk?: string;
  createdAt: string;
  source?: "agent" | "manual";
}

interface DayNote {
  dateISO: string;
  preMarketPlan?: string;
  marketConditions?: string;
  keyLevels?: string;
  newsEvents?: string;
  postDaySummary?: string;
  trades?: TradeNote[];
  emotionalState?:
    | "disciplined"
    | "confident"
    | "anxious"
    | "revenge-trading"
    | "fomo"
    | "calm";
  adherenceToRules?: number;
  mistakesMade?: string;
  lessonsLearned?: string;
  dailyGoals?: string;
  goalsAchieved?: boolean;
  bestTrade?: string;
  worstTrade?: string;
  whatWorked?: string;
  whatDidntWork?: string;
  maxDrawdown?: number;
  riskManagement?: string;
  tags?: string[];
  rating?: number;
  lastUpdated: string;
  aiPlans?: AITradePlan[];
}

interface TradingJournalProps {
  dateISO: string;
  initialNote?: DayNote;
  onClose: () => void;
  onSave: (note: DayNote) => void;
  insideModal?: boolean; // When true, don't render own overlay
}

const TradingJournal: React.FC<TradingJournalProps> = ({
  dateISO,
  initialNote,
  onClose,
  onSave,
  insideModal = false,
}) => {
  const [activeTab, setActiveTab] = useState<
    "preparation" | "execution" | "review"
  >("preparation");
  const [note, setNote] = useState<DayNote>(
    initialNote || {
      dateISO,
      lastUpdated: new Date().toISOString(),
    }
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const updateField = <K extends keyof DayNote>(
    field: K,
    value: DayNote[K]
  ) => {
    setNote((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note),
      });

      if (response.ok) {
        const data = await response.json();
        onSave(data.note);
      }
    } catch (error) {
      console.error("Error saving journal:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Templates for quick entry
  const templates = {
    preMarket: {
      bullish:
        "📈 Market showing strength at key levels. Looking for pullback entries on momentum stocks. Planning to follow trend with tight stops.",
      bearish:
        "📉 Market weakness evident. Looking for breakdown plays and short opportunities. Will be cautious with longs.",
      choppy:
        "🌊 Range-bound market. Will trade support/resistance bounces. Smaller positions, tighter stops. No FOMO on breakouts.",
      earnings:
        "📊 Multiple earnings reports today. Volatility expected. Will wait for clear direction post-announcements. Smaller size on initial positions.",
    },
    postDay: {
      green:
        "✅ Solid trading day. Followed my rules and was disciplined. Good execution on setups. Will continue this approach tomorrow.",
      red: "❌ Challenging day. Took some losses but managed risk well. Need to review entries and be more patient. Will study tonight.",
      mixed:
        "🔄 Mixed results today. Some good trades, some mistakes. Need to focus on [specific area]. Overall satisfied with risk management.",
      overtraded:
        "⚠️ Overtraded today. Too many positions without clear setups. Need to be more selective tomorrow. Quality over quantity.",
    },
  };

  const applyTemplate = (category: string, template: string) => {
    if (category === "preMarket") {
      updateField("preMarketPlan", template);
    } else if (category === "postDay") {
      updateField("postDaySummary", template);
    }
    setShowTemplates(false);
  };

  const emotionalStateEmojis = {
    disciplined: "🎯",
    confident: "💪",
    anxious: "😰",
    "revenge-trading": "😤",
    fomo: "🤯",
    calm: "😌",
  };

  // If inside modal, don't render the overlay wrapper
  const content = (
    <>
      {/* Header */}
      <div className="journal-header">
        <div>
          <h2 className="journal-title">Trading Journal</h2>
          <p className="journal-date">
            {format(new Date(dateISO + "T12:00:00"), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <div className="journal-header-actions">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="journal-btn-secondary"
            title="Quick Templates"
          >
            📋 Templates
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="journal-btn-primary"
          >
            {isSaving ? "Saving..." : "💾 Save"}
          </button>
          <button onClick={onClose} className="journal-btn-close">
            ✕
          </button>
        </div>
      </div>

      {/* Quick Templates Dropdown */}
      {showTemplates && (
        <div className="journal-templates">
          <div className="templates-section">
            <h4>Pre-Market Templates</h4>
            <div className="template-buttons">
              {Object.entries(templates.preMarket).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => applyTemplate("preMarket", value)}
                  className="template-btn"
                >
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="templates-section">
            <h4>Post-Day Templates</h4>
            <div className="template-buttons">
              {Object.entries(templates.postDay).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => applyTemplate("postDay", value)}
                  className="template-btn"
                >
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="journal-tabs">
        <button
          className={`journal-tab ${
            activeTab === "preparation" ? "active" : ""
          }`}
          onClick={() => setActiveTab("preparation")}
        >
          📋 Preparation
        </button>
        <button
          className={`journal-tab ${activeTab === "execution" ? "active" : ""}`}
          onClick={() => setActiveTab("execution")}
        >
          ⚡ Execution
        </button>
        <button
          className={`journal-tab ${activeTab === "review" ? "active" : ""}`}
          onClick={() => setActiveTab("review")}
        >
          🔍 Review
        </button>
      </div>

      {/* Tab Content */}
      <div className="journal-content">
        {activeTab === "preparation" && (
          <div className="journal-section">
            <h3 className="section-title">Pre-Market Analysis</h3>

            {/* AI Trade Plans Section */}
            {note.aiPlans && note.aiPlans.length > 0 && (
              <div className="journal-field ai-plans-section">
                <label className="journal-label">
                  <span className="label-icon">🤖</span>
                  AI Trade Plans
                  <span className="label-hint">
                    Plans generated from multi-timeframe analysis
                  </span>
                </label>
                <div className="ai-plans-grid">
                  {note.aiPlans.map((plan, idx) => (
                    <div key={idx} className="ai-trade-plan-card">
                      <div className="plan-card-header">
                        <div className="plan-symbol">{plan.symbol}</div>
                        <div className="plan-badges">
                          <span className="plan-badge timeframe">{plan.timeframe}</span>
                          {plan.horizon && <span className="plan-badge horizon">{plan.horizon}</span>}
                        </div>
                        <div className="plan-time">
                          {new Date(plan.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>

                      <div className="plan-card-body">
                        {plan.strategy && (
                          <div className="plan-row">
                            <span className="plan-label">Strategy</span>
                            <span className="plan-value">{plan.strategy}</span>
                          </div>
                        )}

                        <div className="plan-row-group">
                          {plan.entry && (
                            <div className="plan-row compact">
                              <span className="plan-label">Entry</span>
                              <span className="plan-value entry">{plan.entry}</span>
                            </div>
                          )}

                          {plan.stop && (
                            <div className="plan-row compact">
                              <span className="plan-label">Stop</span>
                              <span className="plan-value stop">{plan.stop}</span>
                            </div>
                          )}

                          {plan.risk && (
                            <div className="plan-row compact">
                              <span className="plan-label">Risk</span>
                              <span className="plan-value">{plan.risk}</span>
                            </div>
                          )}
                        </div>

                        {plan.targets && plan.targets.length > 0 && (
                          <div className="plan-row">
                            <span className="plan-label">Targets</span>
                            <div className="plan-targets">
                              {plan.targets.map((target, i) => (
                                <span key={i} className="target-chip">
                                  T{i + 1}: {target}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {plan.confluence && plan.confluence.length > 0 && (
                          <div className="plan-row">
                            <span className="plan-label">Confluence</span>
                            <div className="plan-confluence">
                              {plan.confluence.map((conf, i) => (
                                <span key={i} className="confluence-chip">
                                  {conf}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="plan-card-footer">
                        <button
                          className="plan-copy-btn"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(JSON.stringify(plan, null, 2));
                            } catch {}
                          }}
                          title="Copy as JSON"
                        >
                          📋 Copy
                        </button>
                        <span className="plan-source">
                          {plan.source === 'agent' ? '🤖 Agent' : '✍️ Manual'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="journal-field">
              <label className="journal-label">
                <span className="label-icon">📝</span>
                Trading Plan
                <span className="label-hint">
                  What setups are you looking for?
                </span>
              </label>
              <textarea
                value={note.preMarketPlan || ""}
                onChange={(e) => updateField("preMarketPlan", e.target.value)}
                placeholder="Describe your trading plan for today: key levels, setups you're watching, position sizing strategy..."
                className="journal-textarea"
                rows={5}
              />
            </div>

            <div className="journal-row">
              <div className="journal-field">
                <label className="journal-label">
                  <span className="label-icon">📊</span>
                  Market Conditions
                </label>
                <select
                  value={note.marketConditions || ""}
                  onChange={(e) =>
                    updateField("marketConditions", e.target.value)
                  }
                  className="journal-select"
                >
                  <option value="">Select condition...</option>
                  <option value="Trending Up">📈 Trending Up</option>
                  <option value="Trending Down">📉 Trending Down</option>
                  <option value="Range-bound">↔️ Range-bound</option>
                  <option value="Choppy">🌊 Choppy</option>
                  <option value="High Volatility">⚡ High Volatility</option>
                  <option value="Low Volatility">😴 Low Volatility</option>
                </select>
              </div>

              <div className="journal-field">
                <label className="journal-label">
                  <span className="label-icon">🎯</span>
                  Daily Goals
                </label>
                <input
                  type="text"
                  value={note.dailyGoals || ""}
                  onChange={(e) => updateField("dailyGoals", e.target.value)}
                  placeholder="e.g., +$500, 3 wins"
                  className="journal-input"
                />
              </div>
            </div>

            <div className="journal-field">
              <label className="journal-label">
                <span className="label-icon">🎚️</span>
                Key Levels to Watch
                <span className="label-hint">
                  Support/resistance, pivot points
                </span>
              </label>
              <textarea
                value={note.keyLevels || ""}
                onChange={(e) => updateField("keyLevels", e.target.value)}
                placeholder="SPY: 450 support, 455 resistance | Key levels for your watchlist..."
                className="journal-textarea"
                rows={3}
              />
            </div>

            <div className="journal-field">
              <label className="journal-label">
                <span className="label-icon">📰</span>
                News & Events
                <span className="label-hint">
                  Earnings, economic data, Fed speeches
                </span>
              </label>
              <textarea
                value={note.newsEvents || ""}
                onChange={(e) => updateField("newsEvents", e.target.value)}
                placeholder="FOMC meeting at 2pm, AAPL earnings after close..."
                className="journal-textarea"
                rows={3}
              />
            </div>
          </div>
        )}

        {activeTab === "execution" && (
          <div className="journal-section">
            <h3 className="section-title">Trading Execution</h3>

            <div className="journal-row">
              <div className="journal-field">
                <label className="journal-label">
                  <span className="label-icon">🧠</span>
                  Emotional State
                </label>
                <select
                  value={note.emotionalState || ""}
                  onChange={(e) =>
                    updateField(
                      "emotionalState",
                      e.target.value as DayNote["emotionalState"]
                    )
                  }
                  className="journal-select"
                >
                  <option value="">Select state...</option>
                  <option value="disciplined">🎯 Disciplined & Focused</option>
                  <option value="confident">💪 Confident</option>
                  <option value="calm">😌 Calm & Patient</option>
                  <option value="anxious">😰 Anxious</option>
                  <option value="fomo">🤯 FOMO</option>
                  <option value="revenge-trading">😤 Revenge Trading</option>
                </select>
              </div>

              <div className="journal-field">
                <label className="journal-label">
                  <span className="label-icon">📏</span>
                  Rule Adherence (1-10)
                </label>
                <div className="adherence-input">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={note.adherenceToRules || 5}
                    onChange={(e) =>
                      updateField("adherenceToRules", Number(e.target.value))
                    }
                    className="journal-range"
                  />
                  <span className="adherence-value">
                    {note.adherenceToRules || 5}/10
                  </span>
                </div>
              </div>
            </div>

            <div className="journal-field">
              <label className="journal-label">
                <span className="label-icon">🎯</span>
                Best Trade
                <span className="label-hint">What went right?</span>
              </label>
              <textarea
                value={note.bestTrade || ""}
                onChange={(e) => updateField("bestTrade", e.target.value)}
                placeholder="Describe your best trade: setup, entry, exit, why it worked..."
                className="journal-textarea"
                rows={3}
              />
            </div>

            <div className="journal-field">
              <label className="journal-label">
                <span className="label-icon">⚠️</span>
                Worst Trade
                <span className="label-hint">What went wrong?</span>
              </label>
              <textarea
                value={note.worstTrade || ""}
                onChange={(e) => updateField("worstTrade", e.target.value)}
                placeholder="Describe what went wrong and what you could have done differently..."
                className="journal-textarea"
                rows={3}
              />
            </div>

            <div className="journal-field">
              <label className="journal-label">
                <span className="label-icon">🛡️</span>
                Risk Management
                <span className="label-hint">
                  Position sizing, stops, max loss
                </span>
              </label>
              <textarea
                value={note.riskManagement || ""}
                onChange={(e) => updateField("riskManagement", e.target.value)}
                placeholder="How well did you manage risk? Max loss per trade, total exposure..."
                className="journal-textarea"
                rows={3}
              />
            </div>
          </div>
        )}

        {activeTab === "review" && (
          <div className="journal-section">
            <h3 className="section-title">Post-Day Review</h3>

            <div className="journal-field">
              <label className="journal-label">
                <span className="label-icon">📝</span>
                Day Summary
                <span className="label-hint">
                  Overall thoughts on today's trading
                </span>
              </label>
              <textarea
                value={note.postDaySummary || ""}
                onChange={(e) => updateField("postDaySummary", e.target.value)}
                placeholder="Reflect on your trading day: what happened, how you felt, key takeaways..."
                className="journal-textarea"
                rows={5}
              />
            </div>

            <div className="journal-row">
              <div className="journal-field">
                <label className="journal-label">
                  <span className="label-icon">✅</span>
                  What Worked
                </label>
                <textarea
                  value={note.whatWorked || ""}
                  onChange={(e) => updateField("whatWorked", e.target.value)}
                  placeholder="Strategies, setups, or approaches that worked well..."
                  className="journal-textarea"
                  rows={3}
                />
              </div>

              <div className="journal-field">
                <label className="journal-label">
                  <span className="label-icon">❌</span>
                  What Didn't Work
                </label>
                <textarea
                  value={note.whatDidntWork || ""}
                  onChange={(e) => updateField("whatDidntWork", e.target.value)}
                  placeholder="Mistakes, bad setups, or approaches to avoid..."
                  className="journal-textarea"
                  rows={3}
                />
              </div>
            </div>

            <div className="journal-field">
              <label className="journal-label">
                <span className="label-icon">❗</span>
                Mistakes Made
                <span className="label-hint">Be honest with yourself</span>
              </label>
              <textarea
                value={note.mistakesMade || ""}
                onChange={(e) => updateField("mistakesMade", e.target.value)}
                placeholder="What mistakes did you make? Overtrading? FOMO entries? Poor risk management?"
                className="journal-textarea"
                rows={3}
              />
            </div>

            <div className="journal-field">
              <label className="journal-label">
                <span className="label-icon">💡</span>
                Lessons Learned
                <span className="label-hint">
                  Key takeaways for future trades
                </span>
              </label>
              <textarea
                value={note.lessonsLearned || ""}
                onChange={(e) => updateField("lessonsLearned", e.target.value)}
                placeholder="What did you learn today that will make you a better trader?"
                className="journal-textarea"
                rows={3}
              />
            </div>

            <div className="journal-row">
              <div className="journal-field">
                <label className="journal-label">
                  <span className="label-icon">⭐</span>
                  Day Rating
                </label>
                <div className="rating-stars">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => updateField("rating", star)}
                      className={`star-btn ${
                        (note.rating || 0) >= star ? "active" : ""
                      }`}
                    >
                      ⭐
                    </button>
                  ))}
                </div>
              </div>

              <div className="journal-field">
                <label className="journal-label">
                  <span className="label-icon">🎯</span>
                  Goals Achieved?
                </label>
                <div className="goals-toggle">
                  <button
                    onClick={() => updateField("goalsAchieved", true)}
                    className={`toggle-btn ${
                      note.goalsAchieved === true ? "active" : ""
                    }`}
                  >
                    ✅ Yes
                  </button>
                  <button
                    onClick={() => updateField("goalsAchieved", false)}
                    className={`toggle-btn ${
                      note.goalsAchieved === false ? "active" : ""
                    }`}
                  >
                    ❌ No
                  </button>
                </div>
              </div>
            </div>

            <div className="journal-field">
              <label className="journal-label">
                <span className="label-icon">🏷️</span>
                Tags
                <span className="label-hint">
                  Add keywords for easy searching
                </span>
              </label>
              <input
                type="text"
                value={(note.tags || []).join(", ")}
                onChange={(e) =>
                  updateField(
                    "tags",
                    e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="overtraded, green-day, revenge-trading, followed-plan..."
                className="journal-input"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="journal-footer">
        <button onClick={onClose} className="journal-btn-secondary">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="journal-btn-primary"
        >
          {isSaving ? "Saving..." : "💾 Save Journal Entry"}
        </button>
      </div>
    </>
  );

  // If inside a modal, return content without overlay
  if (insideModal) {
    return content;
  }

  // Otherwise, wrap in overlay for standalone use
  return (
    <div className="trading-journal-overlay" onClick={onClose}>
      <div
        className="trading-journal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
};

export default TradingJournal;
