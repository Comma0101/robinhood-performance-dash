import type { IChartApi, Time } from "lightweight-charts";
import type { StructureEvent } from "@/lib/ict";
import { toTimeZoneDate } from "@/lib/ict/utils";

interface StructureLineData {
  type: "BOS" | "ChoCH";
  direction: "up" | "down";
  price: number;
  startTime: Time;
  endTime: Time;
  strength: "major" | "minor";
  color: string;
  style: "solid" | "dashed" | "dotted";
}

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

interface StructureLineColors {
  majorBosBullish: string;
  majorBosBearish: string;
  minorBosBullish: string;
  minorBosBearish: string;
  majorChoChBullish: string;
  majorChoChBearish: string;
  minorChoChBullish: string;
  minorChoChBearish: string;
}

const DEFAULT_COLORS: StructureLineColors = {
  majorBosBullish: "rgb(34, 197, 94)", // green-500
  majorBosBearish: "rgb(239, 68, 68)", // red-500
  minorBosBullish: "rgb(132, 204, 22)", // lime-500
  minorBosBearish: "rgb(251, 146, 60)", // orange-500
  majorChoChBullish: "rgb(59, 130, 246)", // blue-500
  majorChoChBearish: "rgb(168, 85, 247)", // purple-500
  minorChoChBullish: "rgb(6, 182, 212)", // cyan-600
  minorChoChBearish: "rgb(236, 72, 153)", // pink-500
};

export class StructureLinesPrimitive {
  private _events: StructureEvent[];
  private _interval: string;
  private _chart: IChartApi;
  private _series: any;
  private _colors: StructureLineColors;
  private _currentTime: string;

  constructor(
    events: StructureEvent[],
    interval: string,
    chart: IChartApi,
    series: any,
    currentTime: string,
    colors?: Partial<StructureLineColors>
  ) {
    this._events = events;
    this._interval = interval;
    this._chart = chart;
    this._series = series;
    this._currentTime = currentTime;
    this._colors = { ...DEFAULT_COLORS, ...colors };
  }

  updateData(events: StructureEvent[], interval: string, currentTime: string): void {
    this._events = events;
    this._interval = interval;
    this._currentTime = currentTime;
  }

  private getLineColor(event: StructureEvent, strength: "major" | "minor"): string {
    if (event.type === "BOS") {
      if (event.direction === "up") {
        return strength === "major" ? this._colors.majorBosBullish : this._colors.minorBosBullish;
      } else {
        return strength === "major" ? this._colors.majorBosBearish : this._colors.minorBosBearish;
      }
    } else {
      if (event.direction === "up") {
        return strength === "major" ? this._colors.majorChoChBullish : this._colors.minorChoChBullish;
      } else {
        return strength === "major" ? this._colors.majorChoChBearish : this._colors.minorChoChBearish;
      }
    }
  }

  private getLineStyle(strength: "major" | "minor"): "solid" | "dashed" | "dotted" {
    return strength === "major" ? "dashed" : "dotted";
  }

  paneViews() {
    // Convert events to line data with chart times
    const lines: StructureLineData[] = [];

    for (const event of this._events) {
      try {
        const startTime = toChartTime(event.time, this._interval);
        const endTime = toChartTime(this._currentTime, this._interval);
        const strength = event.referenceSwing.strength;

        lines.push({
          type: event.type,
          direction: event.direction,
          price: event.referenceSwing.price,
          startTime,
          endTime,
          strength,
          color: this.getLineColor(event, strength),
          style: this.getLineStyle(strength),
        });
      } catch (error) {
        console.error(
          "[StructureLinesPrimitive] Error converting event time:",
          event.type,
          error
        );
      }
    }

    const chart = this._chart;

    return [
      {
        zOrder: () => "normal" as const,
        renderer: () => ({
          draw: (target: any) => {
            target.useMediaCoordinateSpace((scope: any) => {
              const ctx = scope.context;
              const width = scope.mediaSize.width;
              const height = scope.mediaSize.height;

              const timeScale = chart.timeScale();
              if (!this._series) return;

              const visibleRange = timeScale.getVisibleLogicalRange();
              if (!visibleRange) return;

              for (const line of lines) {
                try {
                  // Get x coordinates for start and end times
                  const x1 = timeScale.timeToCoordinate(line.startTime);
                  const x2 = timeScale.timeToCoordinate(line.endTime);

                  if (x1 === null || x2 === null) {
                    continue;
                  }

                  // Get y coordinate for price
                  const y = this._series.priceToCoordinate(line.price);
                  if (y === null) {
                    continue;
                  }

                  // Check if line is visible
                  if (x2 < 0 || x1 > width || y < 0 || y > height) {
                    continue;
                  }

                  const visibleX1 = Math.max(0, x1);
                  const visibleX2 = Math.min(width, x2);

                  ctx.save();

                  // Set line style
                  ctx.strokeStyle = line.color;
                  ctx.lineWidth = line.strength === "major" ? 2 : 1;

                  if (line.style === "dashed") {
                    ctx.setLineDash([8, 4]);
                  } else if (line.style === "dotted") {
                    ctx.setLineDash([2, 3]);
                  }

                  // Draw horizontal line
                  ctx.beginPath();
                  ctx.moveTo(visibleX1, y);
                  ctx.lineTo(visibleX2, y);
                  ctx.stroke();

                  // Draw label if there's enough space
                  if (visibleX2 - visibleX1 > 80) {
                    ctx.setLineDash([]);
                    ctx.font =
                      "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
                    ctx.textBaseline = "middle";

                    const label = `${line.type} ${line.strength === "major" ? "Major" : "Minor"}`;
                    const textMetrics = ctx.measureText(label);
                    const textWidth = textMetrics.width;

                    const labelX = visibleX1 + 8;
                    const labelY = line.direction === "up" ? y - 12 : y + 12;

                    // Text background
                    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
                    ctx.fillRect(labelX - 3, labelY - 8, textWidth + 6, 16);

                    // Text
                    ctx.fillStyle = line.color;
                    ctx.fillText(label, labelX, labelY);
                  }

                  ctx.restore();
                } catch (error) {
                  console.error(
                    "[StructureLinesPrimitive] Error drawing line:",
                    line.type,
                    error
                  );
                }
              }
            });
          },
        }),
      },
    ];
  }

  requestUpdate(): void {
    // Request chart update when data changes
    if (this._chart) {
      this._chart.timeScale().fitContent();
    }
  }
}
