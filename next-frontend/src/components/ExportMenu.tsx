"use client";

import React, { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

interface Summary {
  total_pl: number;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: string;
  avg_win: number;
  avg_loss: number;
}

interface ExportMenuProps {
  trades: Trade[];
  summary: Summary;
}

export default function ExportMenu({ trades, summary }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportToCSV = () => {
    setExporting(true);

    // Create CSV content
    const headers = [
      "Symbol",
      "Type",
      "Status",
      "P/L",
      "Open Date",
      "Close Date",
      "Buy Price",
      "Sell Price",
      "Quantity",
      "Holding Period (days)",
      "Strike Price",
      "Expiration Date",
    ];

    const rows = trades.map((trade) => [
      trade.symbol,
      trade.type,
      trade.status,
      trade.pnl.toFixed(2),
      trade.open_date,
      trade.close_date,
      trade.buy_price.toFixed(2),
      trade.sell_price.toFixed(2),
      trade.quantity,
      trade.holding_period,
      trade.strike_price || "N/A",
      trade.expiration_date || "N/A",
    ]);

    // Add summary at the top
    const summaryRows = [
      ["SUMMARY"],
      ["Total P/L", `$${summary.total_pl.toFixed(2)}`],
      ["Total Trades", summary.total_trades],
      ["Win Rate", summary.win_rate],
      ["Wins", summary.wins],
      ["Losses", summary.losses],
      ["Avg Win", `$${summary.avg_win.toFixed(2)}`],
      ["Avg Loss", `$${summary.avg_loss.toFixed(2)}`],
      [],
      ["TRADES"],
    ];

    const csv = [
      ...summaryRows.map((row) => row.join(",")),
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    // Download
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trades_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    setExporting(false);
    setIsOpen(false);
  };

  const exportToJSON = () => {
    setExporting(true);

    const data = {
      exported_at: new Date().toISOString(),
      summary,
      trades,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trades_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);

    setExporting(false);
    setIsOpen(false);
  };

  const exportToPDF = () => {
    setExporting(true);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(20);
    doc.text("Trading Report", pageWidth / 2, 20, { align: "center" });

    // Date
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
      `Generated: ${new Date().toLocaleDateString()}`,
      pageWidth / 2,
      28,
      { align: "center" }
    );

    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Summary", 14, 40);

    autoTable(doc, {
      startY: 45,
      head: [["Metric", "Value"]],
      body: [
        ["Total P/L", `$${summary.total_pl.toFixed(2)}`],
        ["Total Trades", summary.total_trades.toString()],
        ["Win Rate", summary.win_rate],
        ["Wins", summary.wins.toString()],
        ["Losses", summary.losses.toString()],
        ["Avg Win", `$${summary.avg_win.toFixed(2)}`],
        ["Avg Loss", `$${summary.avg_loss.toFixed(2)}`],
      ],
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
    });

    // Trades Section
    const finalY = (doc as any).lastAutoTable.finalY || 100;
    doc.setFontSize(14);
    doc.text("Trades", 14, finalY + 15);

    autoTable(doc, {
      startY: finalY + 20,
      head: [
        ["Symbol", "Type", "Status", "P/L", "Open Date", "Close Date", "Days"],
      ],
      body: trades.map((trade) => [
        trade.symbol,
        trade.type,
        trade.status,
        `$${trade.pnl.toFixed(2)}`,
        new Date(trade.open_date).toLocaleDateString(),
        new Date(trade.close_date).toLocaleDateString(),
        trade.holding_period.toString(),
      ]),
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8 },
      columnStyles: {
        3: {
          cellWidth: 20,
          halign: "right",
        },
      },
    });

    doc.save(`trades_${new Date().toISOString().split("T")[0]}.pdf`);

    setExporting(false);
    setIsOpen(false);
  };

  return (
    <div className="export-menu">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={exporting}
        className="header-btn"
        title="Export Data"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 5V13M8 13L11 10M8 13L5 10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 3H13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="header-btn-text">Export</span>
      </button>

      {isOpen && (
        <>
          <div
            className="export-overlay"
            onClick={() => setIsOpen(false)}
          ></div>
          <div className="export-dropdown">
            <button
              onClick={exportToCSV}
              disabled={exporting}
              className="export-option"
            >
              <span className="export-icon">📊</span>
              <div>
                <div className="export-title">Export as CSV</div>
                <div className="export-description">
                  Spreadsheet format for Excel
                </div>
              </div>
            </button>
            <button
              onClick={exportToJSON}
              disabled={exporting}
              className="export-option"
            >
              <span className="export-icon">📋</span>
              <div>
                <div className="export-title">Export as JSON</div>
                <div className="export-description">
                  Machine-readable data format
                </div>
              </div>
            </button>
            <button
              onClick={exportToPDF}
              disabled={exporting}
              className="export-option"
            >
              <span className="export-icon">📄</span>
              <div>
                <div className="export-title">Export as PDF</div>
                <div className="export-description">
                  Professional report format
                </div>
              </div>
            </button>
            {exporting && (
              <div className="export-status">
                <div className="spinner"></div>
                <span>Exporting...</span>
              </div>
            )}
          </div>
        </>
      )}

      <style jsx>{`
        .export-menu {
          position: relative;
        }

        .export-menu .header-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .export-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 40;
        }

        .export-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          min-width: 280px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 0.75rem;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3),
            0 4px 6px -2px rgba(0, 0, 0, 0.2);
          z-index: 50;
          padding: 0.5rem;
          animation: slideDown 0.2s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .export-option {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.75rem;
          background: transparent;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s ease;
        }

        .export-option:hover:not(:disabled) {
          background: var(--bg-elevated);
        }

        .export-option:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .export-icon {
          font-size: 1.5rem;
          line-height: 1;
        }

        .export-title {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 0.125rem;
        }

        .export-description {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .export-status {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem;
          color: var(--text-secondary);
          font-size: 0.875rem;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid var(--border-default);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
