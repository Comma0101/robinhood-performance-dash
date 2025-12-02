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
      className={`day-cell ${isTodayFlag ? "today" : ""} ${isFocused ? "focused" : ""
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

import { getMorningReport, type PreMarketReport } from "@/lib/api/reports";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MarkdownRenderer = ({ content }: { content: string }) => {
  return (
    <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-p:leading-relaxed prose-headings:text-white prose-strong:text-white prose-a:text-blue-400 prose-ul:list-disc prose-ul:pl-4 prose-ol:list-decimal prose-ol:pl-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
};

const DayDrawer: React.FC<{
  summary: DaySummary;
  onClose: () => void;
}> = ({ summary, onClose }) => {
  const [report, setReport] = useState<PreMarketReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"pre" | "post">("pre");

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

  // Fetch report when summary changes
  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        // summary.dateISO is YYYY-MM-DD
        const data = await getMorningReport(summary.dateISO, "QQQ");
        setReport(data);
        // Default to post-market if available, else pre-market
        if (data.post_market_summary) {
          setActiveTab("post");
        } else {
          setActiveTab("pre");
        }
      } catch (error) {
        console.log("No report found for date:", summary.dateISO);
        setReport(null);
      } finally {
        setLoading(false);
      }
    };

    if (summary.dateISO) {
      fetchReport();
    }
  }, [summary.dateISO]);

  // Correct for timezone offset when displaying
  const date = new Date(summary.dateISO);
  const userTimezoneOffset = date.getTimezoneOffset() * 60000;
  const correctedDate = new Date(date.getTime() + userTimezoneOffset);

  return (
    <div className="day-drawer-overlay" onClick={onClose}>
      <div
        className="day-drawer max-h-[85vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="drawer-close sticky top-0 right-0 z-10" onClick={onClose}>
          &times;
        </button>
        <h2>{format(correctedDate, "eeee, MMMM d")}</h2>
        <div className="drawer-stats">
          <span>Net P/L: ${summary.netPnL.toFixed(2)}</span>
          <span>{summary.tradesCount} trades</span>
          <span>{winRate}% win rate</span>
        </div>

        {/* AI Analysis Section */}
        <div className="drawer-notes-section">
          <div className="notes-header mb-4">
            <h3>🤖 AI Analysis</h3>
            {report && (
              <div className="flex gap-2 text-sm">
                <button
                  onClick={() => setActiveTab("pre")}
                  className={`px-3 py-1 rounded-full transition-colors ${activeTab === 'pre' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  Pre-Market
                </button>
                <button
                  onClick={() => setActiveTab("post")}
                  disabled={!report.post_market_summary}
                  className={`px-3 py-1 rounded-full transition-colors ${activeTab === 'post' ? 'bg-purple-500/20 text-purple-400' : !report.post_market_summary ? 'text-gray-700 cursor-not-allowed' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  Post-Market
                </button>
              </div>
            )}
          </div>

          <div className="note-display bg-gray-900/30 p-4 rounded-lg border border-gray-800 min-h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-500 gap-2">
                <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
                Loading analysis...
              </div>
            ) : report ? (
              <div className="animate-in fade-in duration-300">
                {activeTab === 'pre' ? (
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Bias</span>
                        <span className="text-sm text-gray-300">{report.htf_bias} ({Math.round(report.confidence * 100)}%)</span>
                      </div>
                      <MarkdownRenderer content={report.narrative} />
                    </div>

                    {/* Scenarios Summary */}
                    <div className="grid grid-cols-1 gap-4 mt-4">
                      {report.long_scenario && (
                        <div className="bg-gray-900/50 p-3 rounded border border-gray-800">
                          <div className="text-xs font-bold text-green-500 uppercase mb-1">Long Idea</div>
                          <div className="text-sm text-gray-400">
                            Zone: {report.long_scenario.entry_zone.low} - {report.long_scenario.entry_zone.high}
                          </div>
                        </div>
                      )}
                      {report.short_scenario && (
                        <div className="bg-gray-900/50 p-3 rounded border border-gray-800">
                          <div className="text-xs font-bold text-red-500 uppercase mb-1">Short Idea</div>
                          <div className="text-sm text-gray-400">
                            Zone: {report.short_scenario.entry_zone.low} - {report.short_scenario.entry_zone.high}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-2">Daily Review</div>
                    <MarkdownRenderer content={report.post_market_summary || "No post-market summary available."} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                <span>No AI analysis found for this date.</span>
              </div>
            )}
          </div>
        </div>

        <div className="trade-list mt-8">
          <h3>Trades</h3>
          {summary.detail &&
            summary.detail.trades.map((trade) => (
              <TradeListItem key={trade.id} trade={trade} />
            ))}
          {(!summary.detail || summary.detail.trades.length === 0) && (
            <p className="text-gray-500 text-sm italic">No trades recorded.</p>
          )}
        </div>
      </div>
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
        />
      )}
    </div>
  );
};

export default TradingCalendar;
