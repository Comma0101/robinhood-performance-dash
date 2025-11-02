import { useState, useEffect } from "react";

export interface DashboardLayout {
  showStats: boolean;
  showInsights: boolean;
  showJournal: boolean;
  showCharts: boolean;
  showTradeLog: boolean;
}

const DEFAULT_LAYOUT: DashboardLayout = {
  showStats: true,
  showInsights: true,
  showJournal: true,
  showCharts: true,
  showTradeLog: true,
};

const STORAGE_KEY = "dashboardLayout";

export const LAYOUT_PRESETS: Record<string, DashboardLayout> = {
  default: DEFAULT_LAYOUT,
  minimal: {
    showStats: true,
    showInsights: false,
    showJournal: false,
    showCharts: false,
    showTradeLog: true,
  },
  analyst: {
    showStats: true,
    showInsights: true,
    showJournal: true,
    showCharts: true,
    showTradeLog: false,
  },
  compact: {
    showStats: true,
    showInsights: false,
    showJournal: false,
    showCharts: false,
    showTradeLog: true,
  },
};

export const useDashboardLayout = () => {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);

  // Load layout from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Merge with default layout to ensure all properties exist
          setLayout({ ...DEFAULT_LAYOUT, ...parsed });
        } catch (e) {
          console.error("Failed to parse dashboard layout:", e);
        }
      }
    }
  }, []);

  // Save layout to localStorage whenever it changes
  const saveLayout = (newLayout: DashboardLayout) => {
    setLayout(newLayout);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayout));
    }
  };

  // Update a single field
  const updateLayout = (field: keyof DashboardLayout, value: boolean) => {
    const newLayout = { ...layout, [field]: value };
    saveLayout(newLayout);
  };

  // Load a preset
  const loadPreset = (presetName: keyof typeof LAYOUT_PRESETS) => {
    const preset = LAYOUT_PRESETS[presetName];
    if (preset) {
      saveLayout(preset);
    }
  };

  // Reset to default
  const resetLayout = () => {
    saveLayout(DEFAULT_LAYOUT);
  };

  return {
    layout,
    updateLayout,
    loadPreset,
    resetLayout,
  };
};
