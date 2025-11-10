"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  addDays,
  subDays,
  isSameDay,
} from "date-fns";
import TradingJournal from "./TradingJournal";

// This is the raw trade data structure from page.tsx
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
  postDaySummary?: string;
  tags?: string[];
  lastUpdated: string;
  aiPlans?: AITradePlan[];
}

// --- DATA MODELS from Spec ---
type TradeDetail = {
  id: string;
  time: string; // '09:43'
  symbol: string; // 'MES'
  pnl: number;
  setup: string; // 'Reversal FVG'
  entry: number;
  exit: number;
  quantity: number;
  type: string;
  strike_price: number | null;
  expiration_date: string | null;
};

type DaySummary = {
  dateISO: string; // '2025-10-23' (always local tz)
  tradesCount: number; // 0..n
  wins: number; // 0..tradesCount
  losses: number; // derived ok
  netPnL: number;
  detail?: {
    trades: Array<TradeDetail>;
  };
  note?: DayNote;
};

// --- LOGIC DETAILS from Spec ---

const colorClassByPnL = (pnl: number) => {
  if (pnl < 0) return "netR-neg-500";
  if (pnl > 0) return "netR-pos-500";
  return "netR-neutral-500";
};

const MonthSummary: React.FC<{
  totalPnl: number;
  activeDays: number;
  winRate: number;
  bestDay: number;
  worstDay: number;
}> = ({ totalPnl, activeDays, winRate, bestDay, worstDay }) => {
  return (
    <div className="month-summary-strip">
      <div className="summary-item">
        <span className="summary-label">Month P/L</span>
        <span
          className={`summary-value ${totalPnl >= 0 ? "positive" : "negative"}`}
        >
          ${totalPnl.toFixed(2)}
        </span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Active Days</span>
        <span className="summary-value">{activeDays}</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Win Rate</span>
        <span className="summary-value">{winRate.toFixed(0)}%</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Best Day</span>
        <span className="summary-value positive">${bestDay.toFixed(2)}</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Worst Day</span>
        <span className="summary-value negative">${worstDay.toFixed(2)}</span>
      </div>
    </div>
  );
};

// --- COMPONENT TREE from Spec ---

const CalendarHeader: React.FC<{
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
}> = ({ currentDate, setCurrentDate }) => {
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchEndX, setTouchEndX] = useState(0);

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX - touchEndX > 50) {
      // Swiped left
      nextMonth();
    }

    if (touchEndX - touchStartX > 50) {
      // Swiped right
      prevMonth();
    }
  };

  return (
    <div
      className="calendar-header"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <button onClick={prevMonth}>{"<"}</button>
      <h2>{format(currentDate, "MMMM yyyy")}</h2>
      <button onClick={nextMonth}>{">"}</button>
    </div>
  );
};

const DayCell: React.FC<{
  day: Date;
  isCurrentMonth: boolean;
  isFocused: boolean;
  summary?: DaySummary;
  maxPnl: number;
}> = ({ day, isCurrentMonth, isFocused, summary, maxPnl }) => {
  const opacity = isCurrentMonth ? 1 : 0.4;
  const colorClass = summary ? colorClassByPnL(summary.netPnL) : "";
  const isTodayFlag = isToday(day);
  const dayNumber = format(day, "d");

  const pnlHeight = summary
    ? Math.max(10, (Math.abs(summary.netPnL) / maxPnl) * 100)
    : 0;

  const hasNote =
    summary?.note &&
    (summary.note.preMarketPlan ||
      summary.note.postDaySummary ||
      (summary.note as any)?.aiPlans?.length > 0);

  return (
    <div
      className={`day-cell ${isTodayFlag ? "today" : ""} ${
        isFocused ? "focused" : ""
      }`}
      style={{ opacity }}
      aria-current={isTodayFlag ? "date" : undefined}
    >
      <div className="day-cell-content">
        <div className="day-header">
          <span className={`day-number${isTodayFlag ? " today" : ""}`}>
            {dayNumber}
          </span>
          {summary && (
            <span className="trade-count-tag">{summary.tradesCount}T</span>
          )}
          {hasNote && <span className="note-indicator">📝</span>}
        </div>
        {summary && (
          <div
            className={`pnl-bar ${colorClass}`}
            style={{ height: `${pnlHeight}%` }}
          >
            <span className="pnl-value">${summary.netPnL.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const CalendarGrid: React.FC<{
  days: Date[];
  currentDate: Date;
  summaries: Record<string, DaySummary>;
  setHoveredDay: (day: DaySummary | null) => void;
  setTooltipPosition: (pos: { x: number; y: number }) => void;
  setSelectedDay: (day: DaySummary | null) => void;
  focusedDate: Date;
  setFocusedDate: (date: Date) => void;
  notes: { [dateISO: string]: DayNote };
}> = ({
  days,
  currentDate,
  summaries,
  setHoveredDay,
  setTooltipPosition,
  setSelectedDay,
  focusedDate,
  setFocusedDate,
  notes,
}) => {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const maxPnl = useMemo(() => {
    return Object.values(summaries).reduce(
      (max, s) => Math.max(max, Math.abs(s.netPnL)),
      0
    );
  }, [summaries]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    switch (e.key) {
      case "ArrowRight":
        setFocusedDate(addDays(focusedDate, 1));
        break;
      case "ArrowLeft":
        setFocusedDate(subDays(focusedDate, 1));
        break;
      case "ArrowUp":
        setFocusedDate(subDays(focusedDate, 7));
        break;
      case "ArrowDown":
        setFocusedDate(addDays(focusedDate, 7));
        break;
      case "Enter":
        const dateISO = format(focusedDate, "yyyy-MM-dd");
        const summary = summaries[dateISO];
        if (summary) {
          setSelectedDay(summary);
        } else {
          // Allow opening drawer for days without trades
          const minimalSummary: DaySummary = {
            dateISO,
            tradesCount: 0,
            wins: 0,
            losses: 0,
            netPnL: 0,
            detail: { trades: [] },
            note: notes[dateISO],
          };
          setSelectedDay(minimalSummary);
        }
        break;
    }
  };

  return (
    <div className="calendar-grid" onKeyDown={handleKeyDown} tabIndex={0}>
      {weekdays.map((day) => (
        <div key={day} className="weekday-header">
          {day}
        </div>
      ))}
      {days.map((day) => {
        const dateISO = format(day, "yyyy-MM-dd");
        const summary = summaries[dateISO];

        const handleMouseEnter = (e: React.MouseEvent) => {
          if (summary) {
            setHoveredDay(summary);
            setTooltipPosition({ x: e.clientX, y: e.clientY });
          }
        };

        const handleMouseLeave = () => {
          setHoveredDay(null);
        };

        const handleClick = () => {
          // Allow clicking any day, create minimal summary if none exists
          if (summary) {
            setSelectedDay(summary);
          } else {
            // Create a minimal day summary for days without trades
            const minimalSummary: DaySummary = {
              dateISO,
              tradesCount: 0,
              wins: 0,
              losses: 0,
              netPnL: 0,
              detail: { trades: [] },
              note: notes[dateISO],
            };
            setSelectedDay(minimalSummary);
          }
        };

        return (
          <div
            key={day.toISOString()}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            onFocus={() => setFocusedDate(day)}
          >
            <DayCell
              day={day}
              isCurrentMonth={isSameMonth(day, currentDate)}
              summary={summary}
              isFocused={isSameDay(day, focusedDate)}
              maxPnl={maxPnl}
            />
          </div>
        );
      })}
    </div>
  );
};

const DayTooltip: React.FC<{
  summary: DaySummary;
  position: { x: number; y: number };
}> = ({ summary, position }) => {
  const winRate =
    summary.tradesCount > 0
      ? Math.round((summary.wins / summary.tradesCount) * 100)
      : 0;

  // Correct for timezone offset when displaying
  const date = new Date(summary.dateISO);
  const userTimezoneOffset = date.getTimezoneOffset() * 60000;
  const correctedDate = new Date(date.getTime() + userTimezoneOffset);

  return (
    <div
      className="day-tooltip"
      style={{
        position: "fixed",
        top: position.y + 15,
        left: position.x + 15,
        pointerEvents: "none",
      }}
    >
      <div className="tooltip-title">
        {format(correctedDate, "eee • MMM d")}
      </div>
      <div>
        {summary.tradesCount} trades • Win {winRate}%
      </div>
      <div className={colorClassByPnL(summary.netPnL)}>
        Net P/L: ${summary.netPnL.toFixed(2)}
      </div>
    </div>
  );
};

const TradeListItem: React.FC<{ trade: TradeDetail }> = ({ trade }) => {
  const pnlClass = trade.pnl > 0 ? "positive" : "negative";
  const optionTypeChar = trade.type.includes("Call") ? "C" : "P";

  return (
    <div className="trade-list-item">
      <div className="trade-item-header">
        <span>
          {trade.symbol} {trade.type !== "Stock" && trade.type}
        </span>
        <span className={pnlClass}>${trade.pnl.toFixed(2)}</span>
      </div>
      <div className="trade-item-body">
        <span>
          {trade.entry} → {trade.exit}
        </span>
        <span>Size: {trade.quantity}</span>
        {trade.type !== "Stock" &&
          trade.strike_price &&
          trade.expiration_date && (
            <span>
              {`$${trade.strike_price} ${optionTypeChar} ${trade.expiration_date}`}
            </span>
          )}
        <span>{trade.setup}</span>
      </div>
    </div>
  );
};

const DayDrawer: React.FC<{
  summary: DaySummary;
  onClose: () => void;
  onNoteUpdate: (dateISO: string, note: DayNote) => void;
}> = ({ summary, onClose, onNoteUpdate }) => {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [preMarketPlan, setPreMarketPlan] = useState(
    summary.note?.preMarketPlan || ""
  );
  const [postDaySummary, setPostDaySummary] = useState(
    summary.note?.postDaySummary || ""
  );
  const [isSaving, setIsSaving] = useState(false);

  const winRate =
    summary.tradesCount > 0
      ? Math.round((summary.wins / summary.tradesCount) * 100)
      : 0;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const handleSaveNote = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateISO: summary.dateISO,
          preMarketPlan,
          postDaySummary,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        onNoteUpdate(summary.dateISO, data.note);
        setIsEditingNote(false);
      }
    } catch (error) {
      console.error("Error saving note:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Correct for timezone offset when displaying
  const date = new Date(summary.dateISO);
  const userTimezoneOffset = date.getTimezoneOffset() * 60000;
  const correctedDate = new Date(date.getTime() + userTimezoneOffset);

  return (
    <div className="day-drawer-overlay" onClick={onClose}>
      <div className="day-drawer" onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose}>
          &times;
        </button>
        <h2>{format(correctedDate, "eeee, MMMM d")}</h2>
        <div className="drawer-stats">
          <span>Net P/L: ${summary.netPnL.toFixed(2)}</span>
          <span>{summary.tradesCount} trades</span>
          <span>{winRate}% win rate</span>
        </div>

        {/* Notes Section */}
        <div className="drawer-notes-section">
          <div className="notes-header">
            <h3>📝 Trading Notes</h3>
            <div className="note-actions">
              <button
                className="edit-note-btn"
                onClick={() => setShowJournal(true)}
                style={{ marginRight: "0.5rem" }}
              >
                📔 Full Journal
              </button>
              {!isEditingNote ? (
                <button
                  className="edit-note-btn"
                  onClick={() => setIsEditingNote(true)}
                >
                  {summary.note?.preMarketPlan || summary.note?.postDaySummary
                    ? "Quick Edit"
                    : "Quick Add"}
                </button>
              ) : (
                <>
                  <button
                    className="save-note-btn"
                    onClick={handleSaveNote}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="cancel-note-btn"
                    onClick={() => {
                      setIsEditingNote(false);
                      setPreMarketPlan(summary.note?.preMarketPlan || "");
                      setPostDaySummary(summary.note?.postDaySummary || "");
                    }}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {isEditingNote ? (
            <div className="note-edit-form">
              <div className="note-field">
                <label>Pre-Market Prep</label>
                <textarea
                  value={preMarketPlan}
                  onChange={(e) => setPreMarketPlan(e.target.value)}
                  placeholder="What's your plan before the market opens?"
                  rows={4}
                />
              </div>
              <div className="note-field">
                <label>Post-Market Summary</label>
                <textarea
                  value={postDaySummary}
                  onChange={(e) => setPostDaySummary(e.target.value)}
                  placeholder="Reflect on your trading day..."
                  rows={4}
                />
              </div>
            </div>
          ) : (
            <div className="note-display">
              {summary.note?.preMarketPlan && (
                <div className="note-section">
                  <h4>Pre-Market Prep</h4>
                  <p>{summary.note.preMarketPlan}</p>
                </div>
              )}
              {summary.note?.postDaySummary && (
                <div className="note-section">
                  <h4>Post-Market Summary</h4>
                  <p>{summary.note.postDaySummary}</p>
                </div>
              )}
              {!summary.note?.preMarketPlan &&
                !summary.note?.postDaySummary && (
                  <p className="no-notes">No notes for this day yet. Click "📔 Full Journal" to add detailed notes and view AI trade plans.</p>
                )}
            </div>
          )}
        </div>

        <div className="trade-list">
          <h3>Trades</h3>
          {summary.detail &&
            summary.detail.trades.map((trade) => (
              <TradeListItem key={trade.id} trade={trade} />
            ))}
        </div>
      </div>

      {/* Professional Trading Journal Modal */}
      {showJournal && (
        <TradingJournal
          dateISO={summary.dateISO}
          initialNote={summary.note}
          onClose={() => setShowJournal(false)}
          onSave={(updatedNote) => {
            onNoteUpdate(summary.dateISO, updatedNote);
            setShowJournal(false);
          }}
        />
      )}
    </div>
  );
};

const TradingCalendar: React.FC<{ trades: Trade[] }> = ({ trades }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [focusedDate, setFocusedDate] = useState(new Date());
  const [hoveredDay, setHoveredDay] = useState<DaySummary | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [selectedDay, setSelectedDay] = useState<DaySummary | null>(null);
  const [notes, setNotes] = useState<{ [dateISO: string]: DayNote }>({});

  useEffect(() => {
    setFocusedDate(currentDate);
  }, [currentDate]);

  // Load notes from API
  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const response = await fetch("/api/notes");
        if (response.ok) {
          const data = await response.json();
          setNotes(data);
        }
      } catch (error) {
        console.error("Error loading notes:", error);
      }
    };
    fetchNotes();
  }, []);

  const handleNoteUpdate = (dateISO: string, note: DayNote) => {
    setNotes((prev) => ({
      ...prev,
      [dateISO]: note,
    }));
  };

  const summariesByDate = useMemo(() => {
    const summaries = trades.reduce((acc, trade, index) => {
      // Correct for timezone offset to treat date as local
      const date = new Date(trade.close_date);
      const userTimezoneOffset = date.getTimezoneOffset() * 60000;
      const correctedDate = new Date(date.getTime() + userTimezoneOffset);
      const dateISO = format(correctedDate, "yyyy-MM-dd");

      if (!acc[dateISO]) {
        acc[dateISO] = {
          dateISO,
          tradesCount: 0,
          wins: 0,
          losses: 0,
          netPnL: 0,
          detail: { trades: [] },
          note: notes[dateISO],
        };
      }
      acc[dateISO].tradesCount++;
      acc[dateISO].netPnL += trade.pnl;
      acc[dateISO].note = notes[dateISO];
      acc[dateISO].detail!.trades.push({
        id: `${trade.symbol}-${trade.open_date}-${trade.close_date}-${trade.pnl}-${index}`, // even more unique key
        time: format(new Date(trade.close_date), "HH:mm"),
        symbol: trade.symbol,
        pnl: trade.pnl,
        setup: "Reversal FVG", // Placeholder
        entry: trade.buy_price,
        exit: trade.sell_price,
        quantity: trade.quantity,
        type: trade.type,
        strike_price: trade.strike_price,
        expiration_date: trade.expiration_date,
      });
      if (trade.status === "Win") {
        acc[dateISO].wins++;
      } else if (trade.status === "Loss") {
        acc[dateISO].losses++;
      }
      return acc;
    }, {} as Record<string, DaySummary>);

    // Add days with notes but no trades
    Object.keys(notes).forEach((dateISO) => {
      if (!summaries[dateISO]) {
        summaries[dateISO] = {
          dateISO,
          tradesCount: 0,
          wins: 0,
          losses: 0,
          netPnL: 0,
          detail: { trades: [] },
          note: notes[dateISO],
        };
      }
    });

    return summaries;
  }, [trades, notes]);

  const daysForGrid = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentDate]);

  const monthSummaries = useMemo(() => {
    const currentMonthStr = format(currentDate, "yyyy-MM");
    return Object.values(summariesByDate).filter((summary) =>
      summary.dateISO.startsWith(currentMonthStr)
    );
  }, [summariesByDate, currentDate]);

  const monthStats = useMemo(() => {
    if (monthSummaries.length === 0) {
      return {
        totalPnl: 0,
        activeDays: 0,
        winRate: 0,
        bestDay: 0,
        worstDay: 0,
      };
    }

    const totalPnl = monthSummaries.reduce((acc, s) => acc + s.netPnL, 0);
    const activeDays = monthSummaries.length;
    const totalWins = monthSummaries.reduce((acc, s) => acc + s.wins, 0);
    const totalTrades = monthSummaries.reduce(
      (acc, s) => acc + s.tradesCount,
      0
    );
    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    const bestDay = monthSummaries.reduce(
      (max, s) => Math.max(max, s.netPnL),
      -Infinity
    );
    const worstDay = monthSummaries.reduce(
      (min, s) => Math.min(min, s.netPnL),
      Infinity
    );

    return { totalPnl, activeDays, winRate, bestDay, worstDay };
  }, [monthSummaries]);

  return (
    <div className="trading-calendar-container">
      <MonthSummary {...monthStats} />
      <CalendarHeader
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
      />
      <CalendarGrid
        days={daysForGrid}
        currentDate={currentDate}
        summaries={summariesByDate}
        setHoveredDay={setHoveredDay}
        setTooltipPosition={setTooltipPosition}
        setSelectedDay={setSelectedDay}
        focusedDate={focusedDate}
        setFocusedDate={setFocusedDate}
        notes={notes}
      />
      {hoveredDay && (
        <DayTooltip summary={hoveredDay} position={tooltipPosition} />
      )}
      {selectedDay && (
        <DayDrawer
          summary={selectedDay}
          onClose={() => setSelectedDay(null)}
          onNoteUpdate={handleNoteUpdate}
        />
      )}
    </div>
  );
};

export default TradingCalendar;
