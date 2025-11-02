"use client";

import React, { useState, useEffect, useMemo } from "react";
import Modal from "./Modal";
import TradingJournal from "./TradingJournal";
import { startOfDay, endOfDay, isWithinInterval } from "date-fns";

interface Trade {
  symbol: string;
  type: string;
  strike_price: number | null;
  expiration_date: string | null;
  quantity: number;
  open_date: string;
  close_date: string;
  buy_price: number;
  sell_price: number;
  holding_period: number;
  pnl: number;
  status: "Win" | "Loss" | "Breakeven";
}

interface DayNote {
  dateISO: string;
  preMarketPlan?: string;
  marketConditions?: string;
  keyLevels?: string;
  newsEvents?: string;
  postDaySummary?: string;
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
}

interface NotesData {
  [dateISO: string]: DayNote;
}

const EMOTIONAL_STATE_EMOJI: Record<string, string> = {
  disciplined: "🎯",
  confident: "💪",
  anxious: "😰",
  "revenge-trading": "😤",
  fomo: "😱",
  calm: "😌",
};

const EMOTIONAL_STATE_COLOR: Record<string, string> = {
  disciplined: "text-success",
  confident: "text-primary",
  anxious: "text-warning",
  "revenge-trading": "text-danger",
  fomo: "text-danger",
  calm: "text-success",
};

interface JournalEntriesProps {
  trades: Trade[];
}

export default function JournalEntries({ trades }: JournalEntriesProps) {
  const [notes, setNotes] = useState<NotesData>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRating, setFilterRating] = useState<number | "all">("all");
  const [filterEmotion, setFilterEmotion] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "rating">("date");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      const response = await fetch("/api/notes");
      if (response.ok) {
        const data = await response.json();
        setNotes(data);
      }
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    Object.values(notes).forEach((note) => {
      note.tags?.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  // Filter and sort notes
  const filteredNotes = useMemo(() => {
    const entries = Object.entries(notes).filter(([date, note]) => {
      // Search query
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
          note.preMarketPlan?.toLowerCase().includes(searchLower) ||
          note.postDaySummary?.toLowerCase().includes(searchLower) ||
          note.lessonsLearned?.toLowerCase().includes(searchLower) ||
          note.dailyGoals?.toLowerCase().includes(searchLower) ||
          note.tags?.some((tag) => tag.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }

      // Rating filter
      if (filterRating !== "all" && note.rating !== filterRating) {
        return false;
      }

      // Emotion filter
      if (filterEmotion !== "all" && note.emotionalState !== filterEmotion) {
        return false;
      }

      // Tag filter
      if (filterTag !== "all" && !note.tags?.includes(filterTag)) {
        return false;
      }

      return true;
    });

    // Sort
    entries.sort((a, b) => {
      if (sortBy === "rating") {
        const ratingA = a[1].rating || 0;
        const ratingB = b[1].rating || 0;
        return ratingB - ratingA;
      }
      // Default: sort by date (newest first)
      return new Date(b[0]).getTime() - new Date(a[0]).getTime();
    });

    return entries;
  }, [notes, searchQuery, filterRating, filterEmotion, filterTag, sortBy]);

  const handleEntryClick = (date: string) => {
    setSelectedDate(date);
  };

  const handleCloseModal = () => {
    setSelectedDate(null);
    fetchNotes(); // Refresh notes after closing
  };

  const handleSaveNote = (savedNote: DayNote) => {
    setNotes((prev) => ({
      ...prev,
      [savedNote.dateISO]: savedNote,
    }));
  };

  // Get trades for a specific date
  const getTradesForDate = (dateISO: string): Trade[] => {
    const date = new Date(dateISO);
    return trades.filter((trade) =>
      isWithinInterval(new Date(trade.close_date), {
        start: startOfDay(date),
        end: endOfDay(date),
      })
    );
  };

  const renderStars = (rating?: number) => {
    if (!rating)
      return <span className="text-text-tertiary text-sm">Not rated</span>;
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={star <= rating ? "text-warning" : "text-text-tertiary"}
          >
            ⭐
          </span>
        ))}
      </div>
    );
  };

  const getPreviewText = (note: DayNote): string => {
    return (
      note.postDaySummary ||
      note.preMarketPlan ||
      note.lessonsLearned ||
      note.dailyGoals ||
      "No content"
    );
  };

  const truncateText = (text: string, maxLength: number = 150): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-12">
          <div className="text-text-secondary">Loading journal entries...</div>
        </div>
      </div>
    );
  }

  const entriesCount = filteredNotes.length;
  const totalEntries = Object.keys(notes).length;

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="card-title">📔 Trading Journal</h2>
            <p className="text-text-secondary text-sm mt-1">
              {entriesCount} {entriesCount === 1 ? "entry" : "entries"}
              {entriesCount !== totalEntries && ` (${totalEntries} total)`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-2 rounded-lg transition-all ${
                viewMode === "grid"
                  ? "bg-primary text-white"
                  : "bg-bg-elevated text-text-secondary hover:bg-bg-surface"
              }`}
              title="Grid view"
            >
              ▦
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 rounded-lg transition-all ${
                viewMode === "list"
                  ? "bg-primary text-white"
                  : "bg-bg-elevated text-text-secondary hover:bg-bg-surface"
              }`}
              title="List view"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-6">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search journal entries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-bg-elevated border border-border-default rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
              >
                ×
              </button>
            )}
          </div>

          {/* Filter controls */}
          <div className="flex flex-wrap gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "rating")}
              className="px-3 py-2 bg-bg-elevated border border-border-default rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="date">Sort by Date</option>
              <option value="rating">Sort by Rating</option>
            </select>

            <select
              value={filterRating}
              onChange={(e) =>
                setFilterRating(
                  e.target.value === "all" ? "all" : parseInt(e.target.value)
                )
              }
              className="px-3 py-2 bg-bg-elevated border border-border-default rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Ratings</option>
              <option value="5">⭐⭐⭐⭐⭐</option>
              <option value="4">⭐⭐⭐⭐</option>
              <option value="3">⭐⭐⭐</option>
              <option value="2">⭐⭐</option>
              <option value="1">⭐</option>
            </select>

            <select
              value={filterEmotion}
              onChange={(e) => setFilterEmotion(e.target.value)}
              className="px-3 py-2 bg-bg-elevated border border-border-default rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Emotions</option>
              <option value="disciplined">🎯 Disciplined</option>
              <option value="confident">💪 Confident</option>
              <option value="calm">😌 Calm</option>
              <option value="anxious">😰 Anxious</option>
              <option value="fomo">😱 FOMO</option>
              <option value="revenge-trading">😤 Revenge Trading</option>
            </select>

            {allTags.length > 0 && (
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="px-3 py-2 bg-bg-elevated border border-border-default rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            )}

            {(searchQuery ||
              filterRating !== "all" ||
              filterEmotion !== "all" ||
              filterTag !== "all") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterRating("all");
                  setFilterEmotion("all");
                  setFilterTag("all");
                }}
                className="px-3 py-2 bg-bg-elevated text-text-secondary border border-border-default rounded-lg hover:bg-bg-surface hover:text-text-primary transition-all"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Entries */}
        {entriesCount === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📝</div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              {totalEntries === 0
                ? "No journal entries yet"
                : "No entries match your filters"}
            </h3>
            <p className="text-text-secondary mb-4">
              {totalEntries === 0
                ? "Start documenting your trading journey from the Calendar view"
                : "Try adjusting your filters to see more entries"}
            </p>
            {totalEntries === 0 ? (
              <button
                onClick={() =>
                  document
                    .querySelector("nav button:last-child")
                    ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
                }
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
              >
                Go to Calendar
              </button>
            ) : (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterRating("all");
                  setFilterEmotion("all");
                  setFilterTag("all");
                }}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredNotes.map(([date, note]) => (
              <div
                key={date}
                onClick={() => handleEntryClick(date)}
                className="group cursor-pointer bg-bg-elevated border border-border-default rounded-lg p-4 hover:border-primary hover:shadow-lg transition-all duration-200"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-lg font-semibold text-text-primary mb-1">
                      {new Date(date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    {renderStars(note.rating)}
                  </div>
                  {note.emotionalState && (
                    <div
                      className={`text-2xl ${
                        EMOTIONAL_STATE_COLOR[note.emotionalState]
                      }`}
                      title={note.emotionalState}
                    >
                      {EMOTIONAL_STATE_EMOJI[note.emotionalState]}
                    </div>
                  )}
                </div>

                {/* Preview */}
                <p className="text-text-secondary text-sm mb-3 line-clamp-3">
                  {truncateText(getPreviewText(note))}
                </p>

                {/* Tags */}
                {note.tags && note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {note.tags.slice(0, 3).map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-bg-surface text-text-secondary text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                    {note.tags.length > 3 && (
                      <span className="px-2 py-1 text-text-tertiary text-xs">
                        +{note.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-text-tertiary pt-3 border-t border-border-default">
                  <div className="flex items-center gap-3">
                    {note.goalsAchieved !== undefined && (
                      <span
                        className={
                          note.goalsAchieved ? "text-success" : "text-warning"
                        }
                      >
                        {note.goalsAchieved ? "✓" : "○"} Goals
                      </span>
                    )}
                    {note.adherenceToRules !== undefined && (
                      <span>📊 {note.adherenceToRules}/10</span>
                    )}
                  </div>
                  <span className="group-hover:text-primary transition-colors">
                    View →
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="space-y-3">
            {filteredNotes.map(([date, note]) => (
              <div
                key={date}
                onClick={() => handleEntryClick(date)}
                className="group cursor-pointer bg-bg-elevated border border-border-default rounded-lg p-4 hover:border-primary hover:shadow-lg transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  {/* Date & Rating */}
                  <div className="flex-shrink-0 w-32">
                    <div className="text-sm font-semibold text-text-primary mb-1">
                      {new Date(date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <div className="scale-75 origin-left">
                      {renderStars(note.rating)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-text-secondary text-sm mb-2 line-clamp-2">
                      {truncateText(getPreviewText(note), 200)}
                    </p>
                    {note.tags && note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {note.tags.slice(0, 5).map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-bg-surface text-text-secondary text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                        {note.tags.length > 5 && (
                          <span className="px-2 py-1 text-text-tertiary text-xs">
                            +{note.tags.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-2">
                    {note.emotionalState && (
                      <div
                        className={`text-xl ${
                          EMOTIONAL_STATE_COLOR[note.emotionalState]
                        }`}
                        title={note.emotionalState}
                      >
                        {EMOTIONAL_STATE_EMOJI[note.emotionalState]}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-text-tertiary">
                      {note.goalsAchieved !== undefined && (
                        <span
                          className={
                            note.goalsAchieved ? "text-success" : "text-warning"
                          }
                        >
                          {note.goalsAchieved ? "✓" : "○"}
                        </span>
                      )}
                      {note.adherenceToRules !== undefined && (
                        <span>📊 {note.adherenceToRules}/10</span>
                      )}
                      <span className="group-hover:text-primary transition-colors">
                        →
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full Journal Modal */}
      {selectedDate && (
        <Modal isOpen={true} onClose={handleCloseModal}>
          <div style={{ maxWidth: "100%", width: "100%" }}>
            <TradingJournal
              dateISO={selectedDate}
              initialNote={notes[selectedDate]}
              onClose={handleCloseModal}
              onSave={handleSaveNote}
              insideModal={true}
            />

            {/* Trades for this day */}
            {getTradesForDate(selectedDate).length > 0 && (
              <div
                style={{
                  marginTop: "2rem",
                  paddingTop: "2rem",
                  borderTop: "1px solid var(--border-default)",
                }}
              >
                <h3
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: "600",
                    marginBottom: "1rem",
                    color: "var(--text-primary)",
                  }}
                >
                  📊 Trades on{" "}
                  {new Date(selectedDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h3>
                <div className="table-wrapper">
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Type</th>
                        <th>Quantity</th>
                        <th>Entry</th>
                        <th>Exit</th>
                        <th>P/L</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getTradesForDate(selectedDate).map((trade, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: "600" }}>{trade.symbol}</td>
                          <td>
                            <span
                              style={{
                                fontSize: "0.875rem",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {trade.type}
                            </span>
                          </td>
                          <td>{trade.quantity}</td>
                          <td>
                            $
                            {trade.buy_price.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td>
                            $
                            {trade.sell_price.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td
                            className={
                              trade.status === "Win"
                                ? "positive"
                                : trade.status === "Loss"
                                ? "negative"
                                : ""
                            }
                            style={{ fontWeight: "600" }}
                          >
                            $
                            {trade.pnl.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td>
                            <span
                              className={
                                trade.status === "Win"
                                  ? "positive"
                                  : trade.status === "Loss"
                                  ? "negative"
                                  : ""
                              }
                              style={{
                                fontSize: "0.875rem",
                                fontWeight: "500",
                              }}
                            >
                              {trade.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Summary for the day */}
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "1rem",
                    backgroundColor: "var(--bg-elevated)",
                    borderRadius: "0.5rem",
                    display: "flex",
                    gap: "2rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Total P/L
                    </div>
                    <div
                      className={
                        getTradesForDate(selectedDate).reduce(
                          (sum, t) => sum + t.pnl,
                          0
                        ) >= 0
                          ? "positive"
                          : "negative"
                      }
                      style={{ fontSize: "1.25rem", fontWeight: "600" }}
                    >
                      $
                      {getTradesForDate(selectedDate)
                        .reduce((sum, t) => sum + t.pnl, 0)
                        .toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Trades
                    </div>
                    <div style={{ fontSize: "1.25rem", fontWeight: "600" }}>
                      {getTradesForDate(selectedDate).length}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Win Rate
                    </div>
                    <div style={{ fontSize: "1.25rem", fontWeight: "600" }}>
                      {getTradesForDate(selectedDate).length > 0
                        ? (
                            (getTradesForDate(selectedDate).filter(
                              (t) => t.status === "Win"
                            ).length /
                              getTradesForDate(selectedDate).filter(
                                (t) => t.status === "Win" || t.status === "Loss"
                              ).length) *
                            100
                          ).toFixed(0)
                        : "0"}
                      %
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
