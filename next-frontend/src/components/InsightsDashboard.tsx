"use client";

import React, { useMemo } from "react";
import { startOfWeek, format, parseISO } from "date-fns";

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

interface InsightsDashboardProps {
  trades: Trade[];
}

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function InsightsDashboard({ trades }: InsightsDashboardProps) {
  // Calculate day-of-week performance
  const dayOfWeekStats = useMemo(() => {
    const stats: Record<
      string,
      { totalPnL: number; wins: number; losses: number; count: number }
    > = {};

    DAYS_OF_WEEK.forEach((day) => {
      stats[day] = { totalPnL: 0, wins: 0, losses: 0, count: 0 };
    });

    trades.forEach((trade) => {
      const closeDate = parseISO(trade.close_date);
      const dayName = format(closeDate, "EEEE");

      if (stats[dayName]) {
        stats[dayName].totalPnL += trade.pnl;
        stats[dayName].count += 1;
        if (trade.status === "Win") stats[dayName].wins += 1;
        if (trade.status === "Loss") stats[dayName].losses += 1;
      }
    });

    return Object.entries(stats)
      .map(([day, data]) => ({
        day,
        ...data,
        avgPnL: data.count > 0 ? data.totalPnL / data.count : 0,
        winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
      }))
      .sort((a, b) => b.totalPnL - a.totalPnL);
  }, [trades]);

  // Calculate top performing symbols
  const topSymbols = useMemo(() => {
    const symbolStats: Record<
      string,
      { totalPnL: number; wins: number; losses: number; count: number }
    > = {};

    trades.forEach((trade) => {
      if (!symbolStats[trade.symbol]) {
        symbolStats[trade.symbol] = {
          totalPnL: 0,
          wins: 0,
          losses: 0,
          count: 0,
        };
      }
      symbolStats[trade.symbol].totalPnL += trade.pnl;
      symbolStats[trade.symbol].count += 1;
      if (trade.status === "Win") symbolStats[trade.symbol].wins += 1;
      if (trade.status === "Loss") symbolStats[trade.symbol].losses += 1;
    });

    return Object.entries(symbolStats)
      .map(([symbol, data]) => ({
        symbol,
        ...data,
        winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
      }))
      .sort((a, b) => b.totalPnL - a.totalPnL)
      .slice(0, 5);
  }, [trades]);

  // Calculate trade type performance
  const tradeTypeStats = useMemo(() => {
    const stats: Record<
      string,
      { totalPnL: number; wins: number; losses: number; count: number }
    > = {
      Stock: { totalPnL: 0, wins: 0, losses: 0, count: 0 },
      Options: { totalPnL: 0, wins: 0, losses: 0, count: 0 },
    };

    trades.forEach((trade) => {
      const category =
        trade.type === "Stock"
          ? "Stock"
          : trade.type.includes("Option")
          ? "Options"
          : "Stock";

      stats[category].totalPnL += trade.pnl;
      stats[category].count += 1;
      if (trade.status === "Win") stats[category].wins += 1;
      if (trade.status === "Loss") stats[category].losses += 1;
    });

    return Object.entries(stats).map(([type, data]) => ({
      type,
      ...data,
      avgPnL: data.count > 0 ? data.totalPnL / data.count : 0,
      winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
    }));
  }, [trades]);

  // Calculate holding period analysis
  const holdingPeriodStats = useMemo(() => {
    const periods = {
      "< 1 day": { totalPnL: 0, wins: 0, count: 0 },
      "1-7 days": { totalPnL: 0, wins: 0, count: 0 },
      "1-4 weeks": { totalPnL: 0, wins: 0, count: 0 },
      "1-3 months": { totalPnL: 0, wins: 0, count: 0 },
      "> 3 months": { totalPnL: 0, wins: 0, count: 0 },
    };

    trades.forEach((trade) => {
      const days = trade.holding_period;
      let period: keyof typeof periods;

      if (days < 1) period = "< 1 day";
      else if (days <= 7) period = "1-7 days";
      else if (days <= 28) period = "1-4 weeks";
      else if (days <= 90) period = "1-3 months";
      else period = "> 3 months";

      periods[period].totalPnL += trade.pnl;
      periods[period].count += 1;
      if (trade.status === "Win") periods[period].wins += 1;
    });

    return Object.entries(periods).map(([period, data]) => ({
      period,
      ...data,
      avgPnL: data.count > 0 ? data.totalPnL / data.count : 0,
      winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
    }));
  }, [trades]);

  if (trades.length === 0) {
    return (
      <div className="card">
        <h2 className="card-title">Insights & Analytics</h2>
        <p className="text-text-secondary text-center py-8">
          No trade data available for analysis
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="card-title">Insights & Analytics</h2>

      <div className="insights-grid">
        {/* Day of Week Performance */}
        <div className="insight-section">
          <h3 className="insight-title">Best Trading Days</h3>
          <div className="day-stats">
            {dayOfWeekStats.slice(0, 3).map((stat, index) => (
              <div key={stat.day} className="day-stat-item">
                <div className="day-stat-rank">#{index + 1}</div>
                <div className="day-stat-content">
                  <div className="day-stat-name">{stat.day}</div>
                  <div className="day-stat-metrics">
                    <span
                      className={`day-stat-pnl ${
                        stat.totalPnL >= 0 ? "positive" : "negative"
                      }`}
                    >
                      $
                      {stat.totalPnL.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="day-stat-separator">•</span>
                    <span className="day-stat-winrate">
                      {stat.winRate.toFixed(0)}% win rate
                    </span>
                    <span className="day-stat-separator">•</span>
                    <span className="day-stat-count">{stat.count} trades</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Performing Symbols */}
        <div className="insight-section">
          <h3 className="insight-title">Top Performing Symbols</h3>
          <div className="symbol-leaderboard">
            {topSymbols.map((symbol, index) => (
              <div key={symbol.symbol} className="symbol-item">
                <div className="symbol-rank">#{index + 1}</div>
                <div className="symbol-content">
                  <div className="symbol-name">{symbol.symbol}</div>
                  <div className="symbol-metrics">
                    <span
                      className={`symbol-pnl ${
                        symbol.totalPnL >= 0 ? "positive" : "negative"
                      }`}
                    >
                      $
                      {symbol.totalPnL.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="symbol-separator">•</span>
                    <span className="symbol-trades">{symbol.count} trades</span>
                  </div>
                </div>
                <div className="symbol-winrate">
                  {symbol.winRate.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trade Type Performance */}
        <div className="insight-section">
          <h3 className="insight-title">Performance by Type</h3>
          <div className="type-stats">
            {tradeTypeStats.map((stat) => (
              <div key={stat.type} className="type-stat-card">
                <div className="type-stat-header">
                  <span className="type-stat-name">{stat.type}</span>
                  <span className="type-stat-count">{stat.count} trades</span>
                </div>
                <div
                  className={`type-stat-pnl ${
                    stat.totalPnL >= 0 ? "positive" : "negative"
                  }`}
                >
                  $
                  {stat.totalPnL.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="type-stat-metrics">
                  <div className="type-stat-metric">
                    <span className="type-stat-label">Win Rate</span>
                    <span className="type-stat-value">
                      {stat.winRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="type-stat-metric">
                    <span className="type-stat-label">Avg P/L</span>
                    <span
                      className={`type-stat-value ${
                        stat.avgPnL >= 0 ? "positive" : "negative"
                      }`}
                    >
                      $
                      {stat.avgPnL.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Holding Period Analysis */}
        <div className="insight-section">
          <h3 className="insight-title">Holding Period Analysis</h3>
          <div className="holding-stats">
            {holdingPeriodStats
              .filter((stat) => stat.count > 0)
              .map((stat) => (
                <div key={stat.period} className="holding-stat-item">
                  <div className="holding-stat-period">{stat.period}</div>
                  <div className="holding-stat-bar-container">
                    <div
                      className="holding-stat-bar"
                      style={{
                        width: `${(stat.count / trades.length) * 100}%`,
                        backgroundColor:
                          stat.avgPnL >= 0
                            ? "var(--success-subtle)"
                            : "var(--error-subtle)",
                      }}
                    />
                  </div>
                  <div className="holding-stat-details">
                    <span
                      className={`holding-stat-pnl ${
                        stat.avgPnL >= 0 ? "positive" : "negative"
                      }`}
                    >
                      $
                      {stat.avgPnL.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="holding-stat-count">
                      {stat.count} trades
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
