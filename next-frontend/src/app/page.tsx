"use client";

import React, { useState, useEffect, useMemo } from "react";
import PnLChart from "@/components/PnLChart";
import CumulativePnLChart from "@/components/CumulativePnLChart";
import Modal from "@/components/Modal";
import TradeChart from "@/components/TradeChart";
import TradingCalendar from "@/components/CalendarView";
import LoadingState from "@/components/LoadingState";
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

  const total_pl = trades.reduce((acc, t) => acc + t.pnl, 0);
  const wins = trades.filter((t) => t.status === "Win").length;
  const losses = trades.filter((t) => t.status === "Loss").length;
  const total_win_loss_trades = wins + losses;
  const win_rate =
    total_win_loss_trades > 0 ? (wins / total_win_loss_trades) * 100 : 0;

  const winning_trades = trades
    .filter((t) => t.status === "Win")
    .map((t) => t.pnl);
  const losing_trades = trades
    .filter((t) => t.status === "Loss")
    .map((t) => t.pnl);

  const avg_win =
    winning_trades.length > 0
      ? winning_trades.reduce((a, b) => a + b, 0) / winning_trades.length
      : 0;
  const avg_loss =
    losing_trades.length > 0
      ? losing_trades.reduce((a, b) => a + b, 0) / losing_trades.length
      : 0;

  return {
    total_pl,
    total_trades: trades.length,
    wins,
    losses,
    win_rate: `${win_rate.toFixed(2)}%`,
    avg_win,
    avg_loss,
  };
};

const TRADES_PER_PAGE = 15;

export default function Home() {
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

  const handleRowClick = (trade: Trade) => {
    setSelectedTrade(trade);
  };

  const closeModal = () => {
    setSelectedTrade(null);
  };

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const tradesResponse = await fetch("/api/trades");
        if (!tradesResponse.ok) {
          throw new Error(`HTTP error! status: ${tradesResponse.status}`);
        }
        const tradesData = await tradesResponse.json();
        setAllTrades(tradesData);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTrades();
  }, []);

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
      const dateMatch =
        !selectedDate ||
        isWithinInterval(new Date(trade.close_date), {
          start: startOfDay(selectedDate),
          end: endOfDay(selectedDate),
        });
      return symbolMatch && typeMatch && statusMatch && dateMatch;
    });
  }, [
    allTrades,
    filterSymbol,
    filterType,
    filterStatus,
    sortConfig,
    selectedDate,
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
      <header className="header">
        <h1>Trading Dashboard</h1>
        <nav>
          <button
            onClick={() => setActiveView("Dashboard")}
            className={activeView === "Dashboard" ? "active" : ""}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveView("Calendar")}
            className={activeView === "Calendar" ? "active" : ""}
          >
            Calendar
          </button>
        </nav>
      </header>

      {activeView === "Calendar" ? (
        <TradingCalendar trades={allTrades} />
      ) : (
        <>
          <div className="stats-container">
            <div className="stat-card">
              <div className="stat-label">Total P/L</div>
              <div
                className={`stat-value ${
                  summary.total_pl >= 0 ? "positive" : "negative"
                }`}
              >
                $
                {summary.total_pl?.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Win Rate</div>
              <div className="stat-value">{summary.win_rate}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Trades</div>
              <div className="stat-value">{summary.total_trades}</div>
            </div>
            <div className="stat-card clickable">
              <div className="stat-label">Wins / Losses</div>
              <div className="stat-value">
                <span
                  className="positive"
                  onClick={() => setFilterStatus("Win")}
                  style={{ cursor: "pointer" }}
                >
                  {summary.wins}
                </span>{" "}
                /{" "}
                <span
                  className="negative"
                  onClick={() => setFilterStatus("Loss")}
                  style={{ cursor: "pointer" }}
                >
                  {summary.losses}
                </span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Win / Loss</div>
              <div className="stat-value">
                <span className="positive">
                  $
                  {summary.avg_win?.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>{" "}
                /{" "}
                <span className="negative">
                  $
                  {summary.avg_loss?.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>

          <div className="main-grid">
            <div className="charts-container card">
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

            <div className="trades-container card">
              <h2 className="card-title">Trade Log</h2>
              <div className="filters">
                <input
                  type="text"
                  placeholder="Filter by Symbol..."
                  value={filterSymbol}
                  onChange={(e) => setFilterSymbol(e.target.value)}
                />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="all">All Types</option>
                  <option value="Stock">Stock</option>
                  <option value="Call Option">Call Option</option>
                  <option value="Put Option">Put Option</option>
                </select>
                {filterStatus !== "all" && (
                  <button
                    onClick={() => setFilterStatus("all")}
                    className="clear-filter-btn"
                  >
                    Clear Status Filter
                  </button>
                )}
                {selectedDate && (
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="clear-filter-btn"
                  >
                    Clear Date Filter
                  </button>
                )}
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
          </div>
        </>
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
    </div>
  );
}
