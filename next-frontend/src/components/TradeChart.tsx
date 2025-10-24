"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  IChartApi,
  CandlestickData,
  Time,
  CandlestickSeries,
  createSeriesMarkers,
} from "lightweight-charts";

interface TradeChartProps {
  symbol: string;
  openDate: string;
  closeDate: string;
  buyPrice: number;
  sellPrice: number;
  type: string;
}

interface PriceBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Cache for price data to avoid redundant API calls
const priceDataCache = new Map<string, any>();

const TradeChart: React.FC<TradeChartProps> = ({
  symbol,
  openDate,
  closeDate,
  buyPrice,
  sellPrice,
  type,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState("15min"); // Default interval

  useEffect(() => {
    const fetchDataAndRenderChart = async () => {
      if (!chartContainerRef.current) {
        return;
      }
      setLoading(true);
      setError(null);

      // Clear previous chart instance if it exists
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      try {
        // Create a dynamic cache key including the interval
        const cacheKey = `${symbol}-${openDate}-${closeDate}-${interval}`;

        let data;
        if (priceDataCache.has(cacheKey)) {
          data = priceDataCache.get(cacheKey);
        } else {
          // Fetch price history data with the selected interval
          const response = await fetch(
            `/api/price-history?symbol=${symbol}&startDate=${openDate}&endDate=${closeDate}&interval=${interval}`
          );

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to fetch price data");
          }

          data = await response.json();
          // Cache the result for future use
          priceDataCache.set(cacheKey, data);
        }

        const bars: PriceBar[] = data.bars;

        if (!bars || bars.length === 0) {
          throw new Error("No price data available for this date range");
        }

        // Initialize chart
        const chart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height: 400,
          layout: {
            background: { color: "#1a1a1a" },
            textColor: "#d1d4dc",
          },
          grid: {
            vertLines: { color: "#2b2b43" },
            horzLines: { color: "#2b2b43" },
          },
          crosshair: {
            mode: 1,
          },
          rightPriceScale: {
            borderColor: "#2b2b43",
          },
          timeScale: {
            borderColor: "#2b2b43",
            timeVisible: data.interval === "15min",
            secondsVisible: false,
          },
        });

        chartRef.current = chart;

        // Add candlestick series using v5 API
        const series = chart.addSeries(CandlestickSeries, {
          upColor: "#26a69a",
          downColor: "#ef5350",
          borderVisible: false,
          wickUpColor: "#26a69a",
          wickDownColor: "#ef5350",
        });

        // Convert data to lightweight-charts format
        const chartData: CandlestickData[] = bars.map((bar) => {
          let timeValue: Time;

          if (["1min", "5min", "15min"].includes(data.interval)) {
            // For intraday data, Alpha Vantage returns Eastern Time
            // Parse as Eastern Time and convert to Unix timestamp
            // Format: "2025-10-02 16:00:00" in ET

            // Determine if EDT (-04:00) or EST (-05:00) based on date
            // DST rules: Second Sunday in March to First Sunday in November
            const barDate = new Date(bar.time);
            const year = barDate.getFullYear();
            const month = barDate.getMonth();

            // Simple DST check: EDT is roughly March-November, EST is December-February
            const isDST = month >= 2 && month <= 9; // March (2) through October (9)
            const offset = isDST ? "-04:00" : "-05:00";

            const dateStr = bar.time.replace(" ", "T");
            const date = new Date(dateStr + offset);
            timeValue = Math.floor(date.getTime() / 1000) as Time;
          } else {
            // For daily data, use YYYY-MM-DD format
            const date = new Date(bar.time);
            timeValue = date.toISOString().split("T")[0] as Time;
          }

          return {
            time: timeValue,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          };
        });

        series.setData(chartData);

        // Add markers for exact buy and sell times using the plugin
        const markers = [];

        // Convert dates to the appropriate time format
        const openDateTime = new Date(openDate);
        const closeDateTime = new Date(closeDate);

        // Find the closest data points to the open and close times
        let openTimeValue: Time;
        let closeTimeValue: Time;

        if (["1min", "5min", "15min"].includes(data.interval)) {
          // For intraday data, use Unix timestamp
          const openTimestamp = Math.floor(openDateTime.getTime() / 1000);
          const closeTimestamp = Math.floor(closeDateTime.getTime() / 1000);

          // Find the candle that contains the open time
          const openDataPoint =
            chartData
              .slice()
              .reverse()
              .find((bar) => {
                const barTime = typeof bar.time === "number" ? bar.time : 0;
                return barTime <= openTimestamp;
              }) || chartData[0];
          openTimeValue = openDataPoint.time;

          // Find the candle that contains the close time
          const closeDataPoint =
            chartData
              .slice()
              .reverse()
              .find((bar) => {
                const barTime = typeof bar.time === "number" ? bar.time : 0;
                return barTime <= closeTimestamp;
              }) || chartData[chartData.length - 1];
          closeTimeValue = closeDataPoint.time;
        } else {
          // For daily data, use YYYY-MM-DD format
          const openDate = openDateTime.toISOString().split("T")[0];
          const closeDate = closeDateTime.toISOString().split("T")[0];

          // Find exact match or closest for open
          const openDataPoint =
            chartData.find((bar) => bar.time === openDate) || chartData[0];
          openTimeValue = openDataPoint.time;

          // Find exact match or closest for close
          const closeDataPoint =
            chartData.find((bar) => bar.time === closeDate) ||
            chartData[chartData.length - 1];
          closeTimeValue = closeDataPoint.time;
        }

        // Add buy marker (green triangle up)
        markers.push({
          time: openTimeValue,
          position: "belowBar" as const,
          color: "#26a69a",
          shape: "arrowUp" as const,
        });

        // Add sell marker (red triangle down)
        if (sellPrice > 0) {
          markers.push({
            time: closeTimeValue,
            position: "aboveBar" as const,
            color: "#ef5350",
            shape: "arrowDown" as const,
          });
        }

        // Create markers using the v5 plugin API
        createSeriesMarkers(series, markers);

        // Fit content to show all data
        chart.timeScale().fitContent();

        setLoading(false);
      } catch (err) {
        console.error("Error rendering chart:", err);
        setError(err instanceof Error ? err.message : "Failed to load chart");
        setLoading(false);
      }
    };

    fetchDataAndRenderChart();

    // Cleanup function
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [symbol, openDate, closeDate, buyPrice, sellPrice, interval]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div style={{ marginBottom: "1rem" }}>
      <h3 style={{ marginBottom: "0.5rem", fontSize: "0.9rem", color: "#888" }}>
        {symbol} Price Chart
        {type.includes("Option") && (
          <span style={{ fontSize: "0.8rem", marginLeft: "0.5rem" }}>
            (Underlying Stock)
          </span>
        )}
      </h3>

      {/* Interval selection buttons */}
      <div style={{ marginBottom: "0.5rem" }}>
        {["1min", "5min", "15min"].map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval(iv)}
            style={{
              background: interval === iv ? "#2962ff" : "#333",
              color: "white",
              border: "none",
              padding: "4px 8px",
              marginRight: "4px",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            {iv}
          </button>
        ))}
      </div>

      <div style={{ position: "relative", height: "400px" }}>
        {/* Always render the chart container so ref can attach */}
        <div
          ref={chartContainerRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: "8px",
            overflow: "hidden",
            visibility: loading || error ? "hidden" : "visible",
          }}
        />

        {/* Loading overlay */}
        {loading && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#1a1a1a",
              borderRadius: "8px",
            }}
          >
            <div style={{ color: "#888" }}>Loading chart data...</div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#1a1a1a",
              borderRadius: "8px",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div style={{ color: "#ef5350" }}>Error: {error}</div>
            <div style={{ color: "#888", fontSize: "0.85rem" }}>
              This could be due to API rate limits or missing data for this date
              range.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TradeChart;
