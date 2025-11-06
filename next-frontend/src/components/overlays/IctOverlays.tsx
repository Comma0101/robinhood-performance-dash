import { useEffect, useMemo, useRef } from "react";
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  SeriesMarker,
  Time,
} from "lightweight-charts";
import { LineStyle } from "lightweight-charts";
import type { ICTAnalysis, ICTBar } from "@/lib/ict";
import { toTimeZoneDate } from "@/lib/ict/utils";
import type { IctTogglesState } from "./IctToggles";
import { SessionZonesPrimitive } from "./SessionZonesPrimitive";
import { StructureLinesPrimitive } from "./StructureLinesPrimitive";

const INTRADAY_INTERVALS = new Set([
  "1min",
  "5min",
  "15min",
  "30min",
  "60min",
  "4h",
]);

const toChartTime = (timestamp: string, interval: string): Time => {
  if (INTRADAY_INTERVALS.has(interval)) {
    return Math.floor(toTimeZoneDate(timestamp).getTime() / 1000) as Time;
  }
  return timestamp.split(" ")[0] as Time;
};

const colorPalette = {
  eq: "#7c3aed",
  eqBoundary: "#a855f7",
  demand: "#22c55e",
  supply: "#ef4444",
  bullishGap: "#2563eb",
  bearishGap: "#f97316",
  bos: "#0ea5e9",
  choch: "#f59e0b",
  sessionActive: "#14b8a6",
  sessionInactive: "#94a3b8",
};

interface IctOverlaysProps {
  chart?: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  analysis: ICTAnalysis | null;
  bars: ICTBar[];
  interval: string;
  toggles: IctTogglesState;
}

const IctOverlays: React.FC<IctOverlaysProps> = ({
  chart,
  series,
  analysis,
  bars,
  interval,
  toggles,
}) => {
  const sessionPrimitiveRef = useRef<SessionZonesPrimitive | null>(null);
  const structurePrimitiveRef = useRef<StructureLinesPrimitive | null>(null);
  const timeLookup = useMemo(() => {
    const map = new Map<string, Time>();
    for (const bar of bars) {
      map.set(bar.time, toChartTime(bar.time, interval));
    }
    return map;
  }, [bars, interval]);

  // Separate useEffect for structure events (using custom primitive)
  useEffect(() => {
    if (!chart || !series || !analysis || !toggles.structure) {
      // Clean up existing primitive if toggle is off
      if (structurePrimitiveRef.current && chart) {
        try {
          const pane = chart.panes()[0];
          if (pane) {
            pane.detachPrimitive(structurePrimitiveRef.current);
          }
        } catch (e) {
          console.log("[IctOverlays] Error detaching structure primitive:", e);
        }
        structurePrimitiveRef.current = null;
      }
      return;
    }

    if (analysis.structure.events.length === 0) {
      console.log("[IctOverlays] No structure events to display");
      return;
    }

    console.log("[IctOverlays] Processing structure events:", {
      eventsCount: analysis.structure.events.length,
    });

    try {
      const pane = chart.panes()[0];
      if (!pane) {
        console.error("[IctOverlays] No pane available");
        return;
      }

      const currentTime = bars[bars.length - 1]?.time || analysis.meta.range.end;

      // Create or update primitive
      if (structurePrimitiveRef.current) {
        structurePrimitiveRef.current.updateData(
          analysis.structure.events,
          interval,
          currentTime
        );
      } else {
        structurePrimitiveRef.current = new StructureLinesPrimitive(
          analysis.structure.events,
          interval,
          chart,
          series,
          currentTime
        );
        pane.attachPrimitive(structurePrimitiveRef.current);
        console.log("[IctOverlays] ✓ Attached structure lines primitive");

        // Force chart to update/redraw
        chart.timeScale().applyOptions({});
      }
    } catch (error) {
      console.error("[IctOverlays] Error managing structure primitive:", error);
    }

    return () => {
      if (structurePrimitiveRef.current && chart) {
        try {
          const pane = chart.panes()[0];
          if (pane) {
            pane.detachPrimitive(structurePrimitiveRef.current);
          }
        } catch (e) {
          console.log("[IctOverlays] Error detaching structure primitive:", e);
        }
        structurePrimitiveRef.current = null;
      }
    };
  }, [analysis, bars, chart, interval, series, toggles.structure]);

  // Separate useEffect for sessions (vertical time zones)
  useEffect(() => {
    if (!chart || !analysis || !toggles.sessions) {
      // Clean up existing primitive if toggle is off
      if (sessionPrimitiveRef.current && chart) {
        try {
          const pane = chart.panes()[0];
          if (pane) {
            pane.detachPrimitive(sessionPrimitiveRef.current);
          }
        } catch (e) {
          console.log("[IctOverlays] Error detaching session primitive:", e);
        }
        sessionPrimitiveRef.current = null;
      }
      return;
    }

    // Only show sessions on intraday timeframes
    if (!INTRADAY_INTERVALS.has(interval)) {
      console.log(
        "[IctOverlays] Skipping sessions - not an intraday timeframe:",
        interval
      );
      return;
    }

    console.log(
      "[IctOverlays] Processing session kill zones:",
      analysis.sessions.killZones
    );

    try {
      const pane = chart.panes()[0];
      if (!pane) {
        console.error("[IctOverlays] No pane available");
        return;
      }

      // Create or update primitive
      if (sessionPrimitiveRef.current) {
        sessionPrimitiveRef.current.updateData(
          analysis.sessions.killZones,
          interval
        );
      } else {
        sessionPrimitiveRef.current = new SessionZonesPrimitive(
          analysis.sessions.killZones,
          interval,
          chart,
          "rgb(20, 184, 166)",
          "rgb(148, 163, 184)"
        );
        pane.attachPrimitive(sessionPrimitiveRef.current);
        console.log("[IctOverlays] ✓ Attached session zones primitive");

        // Force chart to update/redraw
        chart.timeScale().applyOptions({});
      }
    } catch (error) {
      console.error("[IctOverlays] Error managing session primitive:", error);
    }

    return () => {
      if (sessionPrimitiveRef.current && chart) {
        try {
          const pane = chart.panes()[0];
          if (pane) {
            pane.detachPrimitive(sessionPrimitiveRef.current);
          }
        } catch (e) {
          console.log("[IctOverlays] Error detaching session primitive:", e);
        }
        sessionPrimitiveRef.current = null;
      }
    };
  }, [analysis, chart, interval, toggles.sessions]);

  useEffect(() => {
    if (!series || !analysis) {
      return;
    }

    const priceLines: IPriceLine[] = [];

    if (toggles.eq && analysis.dealingRange) {
      const { eq, low, high } = analysis.dealingRange;
      priceLines.push(
        series.createPriceLine({
          price: eq,
          color: colorPalette.eq,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          title: "EQ 50%",
        })
      );
      priceLines.push(
        series.createPriceLine({
          price: low,
          color: colorPalette.eqBoundary,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          title: "Dealing Range Low",
        })
      );
      priceLines.push(
        series.createPriceLine({
          price: high,
          color: colorPalette.eqBoundary,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          title: "Dealing Range High",
        })
      );
    }

    if (toggles.orderBlocks) {
      // Filter for valid blocks only and take recent ones
      const validBlocks = analysis.orderBlocks.filter((block) => block.isValid);
      const recentBlocks = validBlocks.slice(-8);

      for (const block of recentBlocks) {
        const baseColor =
          block.type === "demand" ? colorPalette.demand : colorPalette.supply;

        const blockType = block.type === "demand" ? "Demand" : "Supply";
        const zoneLabel = block.zoneType === "main" ? "Main" : "Sub";
        const label = `${blockType} ${zoneLabel} (${block.origin})`;

        // Use refined range if available, otherwise use full range
        const displayRange = block.refined || block.range;
        const rangeToShow = block.refined ? displayRange : block.range;

        priceLines.push(
          series.createPriceLine({
            price: rangeToShow.low,
            color: baseColor,
            lineWidth: block.zoneType === "main" ? 2 : 1,
            lineStyle: block.refined ? LineStyle.Solid : LineStyle.Dashed,
            title: `${label} Low`,
          })
        );
        priceLines.push(
          series.createPriceLine({
            price: rangeToShow.high,
            color: baseColor,
            lineWidth: block.zoneType === "main" ? 2 : 1,
            lineStyle: block.refined ? LineStyle.Solid : LineStyle.Dashed,
            title: `${label} High`,
          })
        );
      }
    }

    if (toggles.fvg) {
      const recentFvgs = analysis.fvg.slice(-6);
      for (const fvg of recentFvgs) {
        const color =
          fvg.type === "bullish"
            ? colorPalette.bullishGap
            : colorPalette.bearishGap;
        const label = `${fvg.type === "bullish" ? "Bullish" : "Bearish"} FVG`;
        priceLines.push(
          series.createPriceLine({
            price: fvg.bounds.low,
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            title: `${label} Low`,
          })
        );
        priceLines.push(
          series.createPriceLine({
            price: fvg.bounds.high,
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            title: `${label} High`,
          })
        );
      }
    }

    return () => {
      for (const line of priceLines) {
        series.removePriceLine(line);
      }
    };
  }, [analysis, series, toggles.eq, toggles.fvg, toggles.orderBlocks]);

  return null;
};

export default IctOverlays;
