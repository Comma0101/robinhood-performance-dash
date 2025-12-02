"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import PnLChart from "@/components/PnLChart";
import CumulativePnLChart from "@/components/CumulativePnLChart";
import Modal from "@/components/Modal";
import TradeChart from "@/components/TradeChart";
import TradingCalendar from "@/components/CalendarView";
import LoadingState from "@/components/LoadingState";
import DateRangePicker from "@/components/DateRangePicker";
import FilterPills from "@/components/FilterPills";
import InsightsDashboard from "@/components/InsightsDashboard";
import CommandPalette from "@/components/CommandPalette";
import ExportMenu from "@/components/ExportMenu";
import { useSwipe } from "@/hooks/useSwipe";
import { useCountUp } from "@/hooks/useCountUp";
import { triggerConfetti, triggerBurst } from "@/utils/confetti";
import {
  loadUnlockedAchievements,
  saveUnlockedAchievements,
  getNewlyUnlocked,
  Trade as AchievementTrade,
} from "@/utils/achievements";
import AchievementsPanel from "@/components/AchievementsPanel";
import DashboardCustomizer from "@/components/DashboardCustomizer";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import JournalEntries from "@/components/JournalEntries";
import CsvUploader from "@/components/CsvUploader";
import DataVerification from "@/components/DataVerification";
import { startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { useGlobalUI } from "@/context/GlobalUIContext";

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

const calculateSummary = (trades: Trade[]) => {
  if (!trades || trades.length === 0) {
    return {
      total_pl: 0,
      total_trades: 0,
      wins: 0,
      losses: 0,
      win_rate: "N/A",
      avg_win: 0,
      avg_loss: 0,
    };
  }

  // Ensure we're working with valid trades with P/L values
  const validTrades = trades.filter((t) => t && typeof t.pnl === "number" && !isNaN(t.pnl));

  // Calculate total P/L from filtered trades (this is what's currently visible)
  const total_pl = validTrades.reduce((acc, t) => {
    const pnl = typeof t.pnl === "number" && !isNaN(t.pnl) ? t.pnl : 0;
    return acc + pnl;
  }, 0);

  // Count wins and losses from the filtered trades
  const wins = validTrades.filter((t) => t.status === "Win").length;
  const losses = validTrades.filter((t) => t.status === "Loss").length;
  const breakevens = validTrades.filter((t) => t.status === "Breakeven").length;
  const total_win_loss_trades = wins + losses;
  const win_rate =
    total_win_loss_trades > 0 ? (wins / total_win_loss_trades) * 100 : 0;

  // Calculate averages from filtered trades
  const winning_trades = validTrades
    .filter((t) => t.status === "Win")
    .map((t) => {
      const pnl = typeof t.pnl === "number" && !isNaN(t.pnl) ? t.pnl : 0;
      return pnl;
    });
  const losing_trades = validTrades
    .filter((t) => t.status === "Loss")
    .map((t) => {
      const pnl = typeof t.pnl === "number" && !isNaN(t.pnl) ? t.pnl : 0;
      return pnl;
    });

  const avg_win =
    winning_trades.length > 0
      ? winning_trades.reduce((a, b) => a + b, 0) / winning_trades.length
      : 0;
  const avg_loss =
    losing_trades.length > 0
      ? losing_trades.reduce((a, b) => a + b, 0) / losing_trades.length
      : 0;

  // Debug: Log calculation details (can be removed in production)
  if (process.env.NODE_ENV === "development") {
    console.log("Summary Calculation:", {
      totalTrades: validTrades.length,
      wins,
      losses,
      breakevens,
      total_pl,
      total_pl_from_wins: winning_trades.reduce((a, b) => a + b, 0),
      total_pl_from_losses: losing_trades.reduce((a, b) => a + b, 0),
      avg_win,
      avg_loss,
    });
  }

  return {
    total_pl,
    total_trades: validTrades.length,
    wins,
    losses,
    win_rate: total_win_loss_trades > 0 ? `${win_rate.toFixed(2)}%` : "N/A",
    avg_win,
    avg_loss,
  };
};

const TRADES_PER_PAGE = 15;

export default function Home() {
  const router = useRouter();
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSymbol, setFilterSymbol] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all"); // "all", "Win", or "Loss"
  const [sortConfig, setSortConfig] = useState({
    key: "close_date",
    direction: "descending",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [activeView, setActiveView] = useState("Dashboard"); // "Dashboard" or "Calendar"
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dateRangeStart, setDateRangeStart] = useState<Date | null>(null);
  const [dateRangeEnd, setDateRangeEnd] = useState<Date | null>(null);

  const {
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
    isUploaderOpen,
    openUploader,
    closeUploader,
    isVerificationOpen,
    openVerification,
    closeVerification,
    isAchievementsOpen,
    openAchievements,
    closeAchievements,
    isSettingsOpen,
    openSettings,
    closeSettings,
  } = useGlobalUI();

  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>(
    []
  );
  const [newAchievement, setNewAchievement] = useState<string | null>(null);

  // Dashboard layout customization
  const { layout, updateLayout, loadPreset, resetLayout } =
    useDashboardLayout();

  // Track previous P/L for milestone detection
  const prevTotalPL = useRef<number>(0);
  const hasTriggeredInitialConfetti = useRef(false);

  // Load unlocked achievements on mount
  useEffect(() => {
    const loaded = loadUnlockedAchievements();
    setUnlockedAchievements(loaded);
  }, []);

  // Mobile swipe gestures
  useSwipe({
    onSwipeLeft: () => {
      if (activeView === "Dashboard") {
        setActiveView("Calendar");
      }
    },
    onSwipeRight: () => {
      if (activeView === "Calendar") {
        setActiveView("Dashboard");
      }
    },
    preventDefaultTouchMove: false,
  });

  const handleRowClick = (trade: Trade) => {
    setSelectedTrade(trade);
  };

  const handleDateRangeChange = (start: Date | null, end: Date | null) => {
    setDateRangeStart(start);
    setDateRangeEnd(end);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const closeModal = () => {
    setSelectedTrade(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command Palette: Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openCommandPalette();
      }

      // Focus search: Cmd/Ctrl + /
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        const searchInput = document.querySelector(
          '.filters input[type="text"]'
        ) as HTMLInputElement;
        searchInput?.focus();
      }

      // Switch to Dashboard: D
      if (
        e.key === "d" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        setActiveView("Dashboard");
      }

      // Switch to Calendar: C
      if (
        e.key === "c" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        setActiveView("Calendar");
      }

      // Open Achievements: A
      if (
        e.key === "a" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        openAchievements();
      }

      // Open Settings: S
      if (
        e.key === "s" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        openSettings();
      }

      // Close modals/palette: Escape
      if (e.key === "Escape") {
        if (isCommandPaletteOpen) {
          closeCommandPalette();
        } else if (isAchievementsOpen) {
          closeAchievements();
        } else if (isSettingsOpen) {
          closeSettings();
        } else if (isUploaderOpen) {
          closeUploader();
        } else if (isVerificationOpen) {
          closeVerification();
        } else if (selectedTrade) {
          closeModal();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isCommandPaletteOpen,
    selectedTrade,
    isAchievementsOpen,
    isSettingsOpen,
    isUploaderOpen,
    isVerificationOpen,
    openCommandPalette,
    closeCommandPalette,
    openAchievements,
    closeAchievements,
    openSettings,
    closeSettings,
    closeUploader,
    closeVerification,
  ]);

  const fetchTrades = async () => {
    try {
      setLoading(true);
      const tradesResponse = await fetch("/api/trades");
      if (!tradesResponse.ok) {
        throw new Error(`HTTP error! status: ${tradesResponse.status}`);
      }
      const tradesData = await tradesResponse.json();
      // Handle both old format (array) and new format (object with trades property)
      if (Array.isArray(tradesData)) {
        setAllTrades(tradesData);
      } else if (tradesData.trades && Array.isArray(tradesData.trades)) {
        setAllTrades(tradesData.trades);
      } else {
        setAllTrades([]);
      }
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  // Handler for successful CSV upload
  const handleUploadSuccess = () => {
    fetchTrades();
  };

  const filteredAndSortedTrades = useMemo(() => {
    let sortedTrades = [...allTrades];

    if (sortConfig.key) {
      sortedTrades.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof Trade];
        const bValue = b[sortConfig.key as keyof Trade];

        if (typeof aValue === "number" && typeof bValue === "number") {
          if (aValue < bValue)
            return sortConfig.direction === "ascending" ? -1 : 1;
          if (aValue > bValue)
            return sortConfig.direction === "ascending" ? 1 : -1;
          return 0;
        }

        if (String(aValue).localeCompare(String(bValue)) < 0)
          return sortConfig.direction === "ascending" ? -1 : 1;
        if (String(aValue).localeCompare(String(bValue)) > 0)
          return sortConfig.direction === "ascending" ? 1 : -1;
        return 0;
      });
    }

    return sortedTrades.filter((trade) => {
      const symbolMatch = trade.symbol
        .toLowerCase()
        .includes(filterSymbol.toLowerCase());
      const typeMatch = filterType === "all" || trade.type === filterType;
      const statusMatch =
        filterStatus === "all" || trade.status === filterStatus;

      // Date range filter
      let dateRangeMatch = true;
      if (dateRangeStart && dateRangeEnd) {
        const tradeDate = new Date(trade.close_date);
        dateRangeMatch = isWithinInterval(tradeDate, {
          start: startOfDay(dateRangeStart),
          end: endOfDay(dateRangeEnd),
        });
      }

      const dateMatch =
        !selectedDate ||
        isWithinInterval(new Date(trade.close_date), {
          start: startOfDay(selectedDate),
          end: endOfDay(selectedDate),
        });
      return (
        symbolMatch && typeMatch && statusMatch && dateMatch && dateRangeMatch
      );
    });
  }, [
    allTrades,
    filterSymbol,
    filterType,
    filterStatus,
    sortConfig,
    selectedDate,
    dateRangeStart,
    dateRangeEnd,
  ]);

  const paginatedTrades = useMemo(() => {
    const startIndex = (currentPage - 1) * TRADES_PER_PAGE;
    return filteredAndSortedTrades.slice(
      startIndex,
      startIndex + TRADES_PER_PAGE
    );
  }, [filteredAndSortedTrades, currentPage]);

  const totalPages = Math.ceil(
    filteredAndSortedTrades.length / TRADES_PER_PAGE
  );

  const summary = calculateSummary(filteredAndSortedTrades);

  // Animated stat values
  const animatedTotalPL = useCountUp(summary.total_pl, {
    decimals: 2,
    duration: 800,
  });
  const animatedTotalTrades = useCountUp(summary.total_trades, {
    duration: 600,
  });
  const animatedWins = useCountUp(summary.wins, { duration: 600 });
  const animatedLosses = useCountUp(summary.losses, { duration: 600 });
  const animatedAvgWin = useCountUp(summary.avg_win, {
    decimals: 2,
    duration: 800,
  });
  const animatedAvgLoss = useCountUp(summary.avg_loss, {
    decimals: 2,
    duration: 800,
  });

  // Parse win rate percentage
  const winRateValue = parseFloat(summary.win_rate) || 0;

  // Confetti triggers for milestones
  useEffect(() => {
    if (!hasTriggeredInitialConfetti.current && summary.total_pl > 0) {
      hasTriggeredInitialConfetti.current = true;
      return; // Skip initial load
    }

    // Check for new all-time high P/L
    if (summary.total_pl > prevTotalPL.current && summary.total_pl > 0) {
      // Check if it's a significant milestone ($1000, $5000, $10000, etc.)
      const milestones = [1000, 5000, 10000, 25000, 50000, 100000];
      const crossedMilestone = milestones.find(
        (m) => prevTotalPL.current < m && summary.total_pl >= m
      );

      if (crossedMilestone) {
        triggerBurst();
      } else if (summary.total_pl - prevTotalPL.current > 500) {
        // Big win
        triggerConfetti("celebration");
      }
    }

    // Check for win rate milestones
    if (summary.total_trades >= 10) {
      const milestones = [60, 70, 80];
      milestones.forEach((milestone) => {
        const prevWinRate = prevTotalPL.current > 0 ? winRateValue : 0;
        if (prevWinRate < milestone && winRateValue >= milestone) {
          triggerConfetti("success");
        }
      });
    }

    prevTotalPL.current = summary.total_pl;
  }, [summary.total_pl, summary.total_trades, winRateValue]);

  // Check for newly unlocked achievements
  useEffect(() => {
    if (allTrades.length === 0) return;

    const newlyUnlocked = getNewlyUnlocked(
      allTrades as AchievementTrade[],
      summary,
      unlockedAchievements
    );

    if (newlyUnlocked.length > 0) {
      const newIds = newlyUnlocked.map((a) => a.id);
      const updatedUnlocked = [...unlockedAchievements, ...newIds];
      setUnlockedAchievements(updatedUnlocked);
      saveUnlockedAchievements(updatedUnlocked);

      // Show notification for first achievement
      setNewAchievement(newlyUnlocked[0].title);
      triggerConfetti("celebration");

      // Clear notification after 5 seconds
      setTimeout(() => setNewAchievement(null), 5000);
    }
  }, [allTrades, summary, unlockedAchievements]);

  const requestSort = (key: keyof Trade) => {
    let direction = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: keyof Trade) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === "ascending" ? " ▲" : " ▼";
  };

  // Command palette commands
  const commands = [
    {
      id: "dashboard",
      label: "Switch to Dashboard",
      description: "View your trading dashboard",
      shortcut: "D",
      action: () => setActiveView("Dashboard"),
      category: "Navigation",
    },
    {
      id: "calendar",
      label: "Switch to Calendar",
      description: "View your trading calendar",
      shortcut: "C",
      action: () => setActiveView("Calendar"),
      category: "Navigation",
    },
    {
      id: "chart-workspace",
      label: "Open Chart Workspace",
      description: "Launch the advanced chart with GPT-5 copilot",
      action: () => router.push("/chart-view"),
      category: "Navigation",
    },
    {
      id: "search",
      label: "Focus Symbol Search",
      description: "Quickly search for a symbol",
      shortcut: "⌘/",
      action: () => {
        const searchInput = document.querySelector(
          '.filters input[type="text"]'
        ) as HTMLInputElement;
        searchInput?.focus();
      },
      category: "Actions",
    },
    {
      id: "filter-wins",
      label: "Show Only Wins",
      description: "Filter trades to show only winning trades",
      action: () => setFilterStatus("Win"),
      category: "Filters",
    },
    {
      id: "filter-losses",
      label: "Show Only Losses",
      description: "Filter trades to show only losing trades",
      action: () => setFilterStatus("Loss"),
      category: "Filters",
    },
    {
      id: "filter-stocks",
      label: "Show Only Stocks",
      description: "Filter trades to show only stock trades",
      action: () => setFilterType("Stock"),
      category: "Filters",
    },
    {
      id: "filter-options",
      label: "Show Only Options",
      description: "Filter trades to show only option trades",
      action: () => {
        // Show both call and put options by setting to first option type found
        setFilterType("Call Option");
      },
      category: "Filters",
    },
    {
      id: "clear-filters",
      label: "Clear All Filters",
      description: "Reset all applied filters",
      action: () => {
        setFilterSymbol("");
        setFilterType("all");
        setFilterStatus("all");
        setDateRangeStart(null);
        setDateRangeEnd(null);
      },
      category: "Filters",
    },
    {
      id: "sort-pnl",
      label: "Sort by P/L",
      description: "Sort trades by profit/loss",
      action: () => requestSort("pnl"),
      category: "Sorting",
    },
    {
      id: "sort-date",
      label: "Sort by Date",
      description: "Sort trades by close date",
      action: () => requestSort("close_date"),
      category: "Sorting",
    },
    {
      id: "sort-symbol",
      label: "Sort by Symbol",
      description: "Sort trades alphabetically by symbol",
      action: () => requestSort("symbol"),
      category: "Sorting",
    },
    {
      id: "achievements",
      label: "View Achievements",
      description: "See your unlocked achievements",
      shortcut: "A",
      action: () => openAchievements(),
      category: "Navigation",
    },
    {
      id: "settings",
      label: "Dashboard Settings",
      description: "Customize dashboard layout and widgets",
      shortcut: "S",
      action: () => openSettings(),
      category: "Navigation",
    },
    {
      id: "upload-csv",
      label: "Upload CSV File",
      description: "Upload a new Robinhood CSV export",
      action: () => openUploader(),
      category: "Actions",
    },
    {
      id: "verify-data",
      label: "Verify Data Processing",
      description: "Check data processing integrity and statistics",
      action: () => openVerification(),
      category: "Actions",
    },
  ];

  if (loading) {
    return (
      <div className="container">
        <LoadingState text="Loading your trading data..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="card max-w-md text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold mb-2 text-text-primary">
              Unable to Load Data
            </h2>
            <p className="text-text-secondary mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="pagination-controls button px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header removed - using global Header in layout */}

      {/* Global Sticky Filter Bar */}
      {activeView === "Dashboard" && (
        <div className="global-filter-bar">
          <div className="filter-bar-content">
            <div className="filter-row">
              <DateRangePicker
                startDate={dateRangeStart}
                endDate={dateRangeEnd}
                onChange={handleDateRangeChange}
              />
              <div className="filter-input-wrapper">
                <span className="filter-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search by symbol..."
                  value={filterSymbol}
                  onChange={(e) => setFilterSymbol(e.target.value)}
                  className="filter-input"
                />
                {filterSymbol && (
                  <button
                    onClick={() => setFilterSymbol("")}
                    className="filter-clear-btn"
                    aria-label="Clear symbol filter"
                  >
                    ×
                  </button>
                )}
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Types</option>
                <option value="Stock">Stock</option>
                <option value="Call Option">Call Option</option>
                <option value="Put Option">Put Option</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Status</option>
                <option value="Win">Wins</option>
                <option value="Loss">Losses</option>
              </select>
              <button
                onClick={() => {
                  setFilterSymbol("");
                  setFilterType("all");
                  setFilterStatus("all");
                  setDateRangeStart(null);
                  setDateRangeEnd(null);
                }}
                className="filter-reset-btn"
                title="Reset all filters"
              >
                Reset
              </button>
            </div>
            <FilterPills
              pills={[
                ...(filterSymbol
                  ? [
                    {
                      id: "symbol",
                      label: "Symbol",
                      value: filterSymbol,
                    },
                  ]
                  : []),
                ...(filterType !== "all"
                  ? [
                    {
                      id: "type",
                      label: "Type",
                      value: filterType,
                    },
                  ]
                  : []),
                ...(filterStatus !== "all"
                  ? [
                    {
                      id: "status",
                      label: "Status",
                      value: filterStatus,
                    },
                  ]
                  : []),
                ...(dateRangeStart && dateRangeEnd
                  ? [
                    {
                      id: "dateRange",
                      label: "Date Range",
                      value: `${dateRangeStart.toLocaleDateString()} - ${dateRangeEnd.toLocaleDateString()}`,
                    },
                  ]
                  : []),
              ]}
              onRemove={(id) => {
                if (id === "symbol") setFilterSymbol("");
                if (id === "type") setFilterType("all");
                if (id === "status") setFilterStatus("all");
                if (id === "dateRange") {
                  setDateRangeStart(null);
                  setDateRangeEnd(null);
                }
              }}
            />
          </div>
        </div>
      )}

      {activeView === "Calendar" ? (
        <div className="view-transition">
          <TradingCalendar trades={allTrades} />
        </div>
      ) : (
        <div className="view-transition">
          {layout.showStats && (
            <div className="stats-container">
              <div className="stat-card stagger-item">
                <div className="stat-label">
                  Total P/L
                  {(filterStatus !== "all" || filterSymbol || filterType !== "all" || dateRangeStart || dateRangeEnd) && (
                    <span className="text-xs text-text-tertiary ml-2">(filtered)</span>
                  )}
                </div>
                <div
                  className={`stat-value count-up ${summary.total_pl >= 0 ? "positive" : "negative"
                    }`}
                >
                  $
                  {animatedTotalPL.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                {filterStatus !== "all" && (
                  <div className="text-xs text-text-tertiary mt-1">
                    Showing {filterStatus === "Win" ? "only winning" : filterStatus === "Loss" ? "only losing" : "breakeven"} trades
                  </div>
                )}
              </div>
              <div className="stat-card stagger-item">
                <div className="stat-label">Win Rate</div>
                <div className="stat-value count-up">{summary.win_rate}</div>
              </div>
              <div className="stat-card stagger-item">
                <div className="stat-label">Total Trades</div>
                <div className="stat-value count-up">{animatedTotalTrades}</div>
              </div>
              <div className="stat-card stagger-item clickable">
                <div className="stat-label">Wins / Losses</div>
                <div className="stat-value">
                  <span
                    className="positive count-up"
                    onClick={() => setFilterStatus("Win")}
                    style={{ cursor: "pointer" }}
                  >
                    {animatedWins}
                  </span>{" "}
                  /{" "}
                  <span
                    className="negative count-up"
                    onClick={() => setFilterStatus("Loss")}
                    style={{ cursor: "pointer" }}
                  >
                    {animatedLosses}
                  </span>
                </div>
              </div>
              <div className="stat-card stagger-item">
                <div className="stat-label">Avg Win / Loss</div>
                <div className="stat-value">
                  <span className="positive count-up">
                    $
                    {animatedAvgWin.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>{" "}
                  /{" "}
                  <span className="negative count-up">
                    $
                    {animatedAvgLoss.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {layout.showInsights && (
            <>
              <InsightsDashboard trades={filteredAndSortedTrades} />
              {(layout.showJournal ||
                layout.showCharts ||
                layout.showTradeLog) && (
                  <div
                    style={{
                      height: "1px",
                      background:
                        "linear-gradient(to right, transparent, var(--border-default), transparent)",
                      margin: "2rem 0",
                    }}
                  />
                )}
            </>
          )}

          {layout.showJournal && (
            <>
              <JournalEntries trades={allTrades} />
              {(layout.showCharts || layout.showTradeLog) && (
                <div
                  style={{
                    height: "1px",
                    background:
                      "linear-gradient(to right, transparent, var(--border-default), transparent)",
                    margin: "2rem 0",
                  }}
                />
              )}
            </>
          )}

          {layout.showCharts && (
            <>
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h2 className="card-title">P/L Over Time</h2>
                <div className="chart-container">
                  <PnLChart data={filteredAndSortedTrades} />
                </div>
                <h2 className="card-title" style={{ marginTop: "2rem" }}>
                  Cumulative P/L
                </h2>
                <div className="chart-container">
                  <CumulativePnLChart data={filteredAndSortedTrades} />
                </div>
              </div>
              {layout.showTradeLog && (
                <div
                  style={{
                    height: "1px",
                    background:
                      "linear-gradient(to right, transparent, var(--border-default), transparent)",
                    margin: "2rem 0",
                  }}
                />
              )}
            </>
          )}

          {layout.showTradeLog && (
            <div className="card trade-log-full-width">
              <div className="trade-log-header">
                <h2 className="card-title">
                  Trade Log
                  <span className="trade-count-badge">
                    {filteredAndSortedTrades.length} trades
                  </span>
                </h2>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th onClick={() => requestSort("symbol")}>
                        Symbol{getSortIndicator("symbol")}
                      </th>
                      <th onClick={() => requestSort("type")}>
                        Type{getSortIndicator("type")}
                      </th>
                      <th onClick={() => requestSort("pnl")}>
                        P/L{getSortIndicator("pnl")}
                      </th>
                      <th onClick={() => requestSort("close_date")}>
                        Close Date{getSortIndicator("close_date")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTrades.map((trade, index) => (
                      <tr
                        key={index}
                        className="stagger-item"
                        onClick={() => handleRowClick(trade)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>{trade.symbol}</td>
                        <td>{trade.type}</td>
                        <td
                          className={
                            trade.status === "Win"
                              ? "positive"
                              : trade.status === "Loss"
                                ? "negative"
                                : "breakeven"
                          }
                        >
                          $
                          {trade.pnl.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td>
                          {new Date(trade.close_date).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination-controls">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={selectedTrade !== null} onClose={closeModal}>
        {selectedTrade && (
          <div>
            <h2>
              {selectedTrade.symbol} - {selectedTrade.type}
            </h2>

            <TradeChart
              symbol={selectedTrade.symbol}
              openDate={selectedTrade.open_date}
              closeDate={selectedTrade.close_date}
              buyPrice={selectedTrade.buy_price}
              sellPrice={selectedTrade.sell_price}
              type={selectedTrade.type}
            />

            <div className="trade-details-grid">
              <div>
                <strong>Status:</strong>{" "}
                <span
                  className={
                    selectedTrade.status === "Win"
                      ? "positive"
                      : selectedTrade.status === "Loss"
                        ? "negative"
                        : "breakeven"
                  }
                >
                  {selectedTrade.status}
                </span>
              </div>
              <div>
                <strong>P/L:</strong>{" "}
                <span
                  className={
                    selectedTrade.status === "Win"
                      ? "positive"
                      : selectedTrade.status === "Loss"
                        ? "negative"
                        : "breakeven"
                  }
                >
                  $
                  {selectedTrade.pnl.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div>
                <strong>Open Date:</strong>{" "}
                {new Date(selectedTrade.open_date).toLocaleDateString()}
              </div>
              <div>
                <strong>Close Date:</strong>{" "}
                {new Date(selectedTrade.close_date).toLocaleDateString()}
              </div>
              <div>
                <strong>Buy Price:</strong> $
                {selectedTrade.buy_price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div>
                <strong>Sell Price:</strong> $
                {selectedTrade.sell_price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div>
                <strong>Quantity:</strong> {selectedTrade.quantity}
              </div>
              <div>
                <strong>Holding Period:</strong> {selectedTrade.holding_period}{" "}
                days
              </div>
            </div>
          </div>
        )}
      </Modal>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closeCommandPalette}
        commands={commands}
      />

      <AchievementsPanel
        isOpen={isAchievementsOpen}
        onClose={closeAchievements}
        trades={allTrades}
        summary={summary}
        unlockedIds={unlockedAchievements}
      />

      <DashboardCustomizer
        isOpen={isSettingsOpen}
        onClose={closeSettings}
        layout={layout}
        onUpdateLayout={updateLayout}
        onLoadPreset={loadPreset}
        onReset={resetLayout}
      />

      {/* CSV Uploader Modal */}
      <Modal isOpen={isUploaderOpen} onClose={closeUploader}>
        <div>
          <h2 className="text-2xl font-bold mb-4 text-text-primary">
            Upload CSV File
          </h2>
          <p className="text-text-secondary mb-6">
            Upload your Robinhood CSV export. Duplicate transactions will be
            automatically deduplicated.
          </p>
          <CsvUploader onUploadSuccess={handleUploadSuccess} />
        </div>
      </Modal>

      {/* Data Verification Modal */}
      <Modal isOpen={isVerificationOpen} onClose={closeVerification}>
        <div>
          <h2 className="text-2xl font-bold mb-4 text-text-primary">
            Data Processing Verification
          </h2>
          <p className="text-text-secondary mb-6">
            Verify that your data has been processed correctly. Check for errors,
            warnings, and processing statistics.
          </p>
          <DataVerification />
        </div>
      </Modal>

      {/* Achievement Unlock Notification */}
      {newAchievement && (
        <div className="fixed top-20 right-4 bg-gradient-to-r from-primary to-success text-white px-6 py-4 rounded-lg shadow-2xl z-50 animate-slideInRight max-w-sm">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🎉</div>
            <div>
              <div className="font-bold text-sm">Achievement Unlocked!</div>
              <div className="text-sm opacity-90">{newAchievement}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
