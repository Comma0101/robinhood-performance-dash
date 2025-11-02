"use client";

import React from "react";
import { DashboardLayout, LAYOUT_PRESETS } from "@/hooks/useDashboardLayout";

interface DashboardCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  layout: DashboardLayout;
  onUpdateLayout: (field: keyof DashboardLayout, value: boolean) => void;
  onLoadPreset: (preset: keyof typeof LAYOUT_PRESETS) => void;
  onReset: () => void;
}

const DashboardCustomizer: React.FC<DashboardCustomizerProps> = ({
  isOpen,
  onClose,
  layout,
  onUpdateLayout,
  onLoadPreset,
  onReset,
}) => {
  if (!isOpen) return null;

  const presets = [
    {
      name: "default" as const,
      label: "Default",
      icon: "📊",
      description: "All widgets visible",
    },
    {
      name: "minimal" as const,
      label: "Minimal",
      icon: "📝",
      description: "Stats and trade log only",
    },
    {
      name: "analyst" as const,
      label: "Analyst",
      icon: "📈",
      description: "Focus on charts and insights",
    },
    {
      name: "compact" as const,
      label: "Compact",
      icon: "⚡",
      description: "Essential stats and trades",
    },
  ];

  const widgets = [
    {
      key: "showStats" as const,
      label: "Stat Cards",
      description: "Total P/L, Win Rate, Trades",
      icon: "📊",
    },
    {
      key: "showInsights" as const,
      label: "Insights Dashboard",
      description: "Streaks, top stocks, hourly data",
      icon: "💡",
    },
    {
      key: "showJournal" as const,
      label: "Trading Journal",
      description: "Journal entries with search and filters",
      icon: "📔",
    },
    {
      key: "showCharts" as const,
      label: "Charts",
      description: "P/L and cumulative charts",
      icon: "📈",
    },
    {
      key: "showTradeLog" as const,
      label: "Trade Log",
      description: "Detailed trade history table",
      icon: "📋",
    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "600px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: "1.5rem" }}>
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: "600",
              marginBottom: "0.5rem",
            }}
          >
            ⚙️ Dashboard Settings
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Customize your dashboard layout and widget visibility
          </p>
        </div>

        {/* Layout Presets */}
        <div style={{ marginBottom: "2rem" }}>
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-secondary)",
              marginBottom: "1rem",
            }}
          >
            Layout Presets
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {presets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => onLoadPreset(preset.name)}
                className="card"
                style={{
                  padding: "1rem",
                  cursor: "pointer",
                  border: "2px solid var(--border-default)",
                  transition: "all 0.2s",
                  textAlign: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--primary)";
                  e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-default)";
                  e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                }}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
                  {preset.icon}
                </div>
                <div
                  style={{
                    fontWeight: "600",
                    fontSize: "0.875rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  {preset.label}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Widget Toggles */}
        <div style={{ marginBottom: "2rem" }}>
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-secondary)",
              marginBottom: "1rem",
            }}
          >
            Widget Visibility
          </h3>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            {widgets.map((widget) => (
              <label
                key={widget.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "1rem",
                  backgroundColor: "var(--bg-elevated)",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                }}
              >
                <div style={{ fontSize: "1.5rem" }}>{widget.icon}</div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontWeight: "600",
                      fontSize: "0.875rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {widget.label}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {widget.description}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={layout[widget.key]}
                  onChange={(e) => onUpdateLayout(widget.key, e.target.checked)}
                  style={{
                    width: "20px",
                    height: "20px",
                    cursor: "pointer",
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-default)",
          }}
        >
          <button
            onClick={onReset}
            style={{
              flex: 1,
              padding: "0.75rem",
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: "0.5rem",
              fontWeight: "500",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-surface)";
              e.currentTarget.style.borderColor = "var(--border-strong)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
              e.currentTarget.style.borderColor = "var(--border-default)";
            }}
          >
            Reset to Default
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "0.75rem",
              backgroundColor: "var(--primary)",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              fontWeight: "500",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--primary-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--primary)";
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardCustomizer;
