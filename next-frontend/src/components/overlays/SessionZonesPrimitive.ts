import type { IChartApi, Time } from "lightweight-charts";
import type { KillZone } from "@/lib/ict";
import { toTimeZoneDate } from "@/lib/ict/utils";

interface SessionZoneData {
  name: string;
  startTime: Time;
  endTime: Time;
  active: boolean;
  color: string;
}

const INTRADAY_INTERVALS = new Set([
  "1m",
  "1min",
  "5m",
  "5min",
  "15m",
  "15min",
  "30m",
  "30min",
  "60min",
  "1h",
  "4h",
]);

const toChartTime = (timestamp: string, interval: string): Time => {
  if (INTRADAY_INTERVALS.has(interval)) {
    return Math.floor(toTimeZoneDate(timestamp).getTime() / 1000) as Time;
  }
  return timestamp.split(" ")[0] as Time;
};

export class SessionZonesPrimitive {
  private _sessions: KillZone[];
  private _interval: string;
  private _chart: IChartApi;
  private _activeColor: string;
  private _inactiveColor: string;

  constructor(
    sessions: KillZone[],
    interval: string,
    chart: IChartApi,
    activeColor: string = "rgb(20, 184, 166)",
    inactiveColor: string = "rgb(148, 163, 184)"
  ) {
    this._sessions = sessions;
    this._interval = interval;
    this._chart = chart;
    this._activeColor = activeColor;
    this._inactiveColor = inactiveColor;
  }

  updateData(sessions: KillZone[], interval: string): void {
    this._sessions = sessions;
    this._interval = interval;
  }

  paneViews() {
    // Convert sessions to zone data with chart times
    const zones: SessionZoneData[] = [];

    console.log(`[SessionZonesPrimitive] paneViews called with ${this._sessions.length} sessions, interval: ${this._interval}`);

    for (const session of this._sessions) {
      try {
        const startTime = toChartTime(session.start, this._interval);
        const endTime = toChartTime(session.end, this._interval);

        zones.push({
          name: session.name,
          startTime,
          endTime,
          active: session.active,
          color: session.active ? this._activeColor : this._inactiveColor,
        });
      } catch (error) {
        console.error(
          "[SessionZonesPrimitive] Error converting session time:",
          session.name,
          error
        );
      }
    }

    console.log(`[SessionZonesPrimitive] Converted to ${zones.length} zones`);
    if (zones.length > 0) {
      console.log(`[SessionZonesPrimitive] Sample zone:`, zones[0]);
    }

    const chart = this._chart;

    return [
      {
        zOrder: () => "bottom" as const,
        renderer: () => ({
          draw: (target: any) => {
            target.useMediaCoordinateSpace((scope: any) => {
              const ctx = scope.context;
              const width = scope.mediaSize.width;
              const height = scope.mediaSize.height;

              const timeScale = chart.timeScale();
              const visibleRange = timeScale.getVisibleLogicalRange();
              if (!visibleRange) {
                console.log(`[SessionZonesPrimitive] No visible range, skipping draw`);
                return;
              }

              console.log(`[SessionZonesPrimitive] Drawing ${zones.length} zones`);
              let drawnCount = 0;

              for (const zone of zones) {
                try {
                  // Get x coordinates for start and end times
                  const x1Raw = timeScale.timeToCoordinate(zone.startTime);
                  const x2Raw = timeScale.timeToCoordinate(zone.endTime);

                  // Handle zones that extend beyond the chart data
                  // If start is null (before chart data), use left edge
                  // If end is null (after chart data), use right edge
                  let x1 = x1Raw !== null ? x1Raw : 0;
                  let x2 = x2Raw !== null ? x2Raw : width;

                  // Skip zones that are completely outside visible area
                  if (x2 <= 0 || x1 >= width) {
                    continue;
                  }

                  // Calculate visible portion
                  const visibleX1 = Math.max(0, x1);
                  const visibleX2 = Math.min(width, x2);
                  const zoneWidth = visibleX2 - visibleX1;

                  if (zoneWidth <= 0) continue;

                  ctx.save();

                  // Draw zone background with transparency
                  const opacity = zone.active ? 0.15 : 0.08;
                  ctx.fillStyle = zone.color
                    .replace(")", `, ${opacity})`)
                    .replace("rgb", "rgba");

                  ctx.fillRect(visibleX1, 0, zoneWidth, height);
                  drawnCount++;

                  // Draw label
                  ctx.fillStyle = zone.color;
                  ctx.font =
                    "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
                  ctx.textBaseline = "top";

                  const labelX = visibleX1 + 5;
                  const labelY = 5;

                  // Text background
                  const textMetrics = ctx.measureText(zone.name);
                  const textWidth = textMetrics.width;
                  const textHeight = 16;

                  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                  ctx.fillRect(
                    labelX - 3,
                    labelY - 2,
                    textWidth + 6,
                    textHeight + 4
                  );

                  // Text
                  ctx.fillStyle = zone.active ? "#14b8a6" : "#94a3b8";
                  ctx.fillText(zone.name, labelX, labelY);

                  ctx.restore();
                } catch (error) {
                  console.error(
                    "[SessionZonesPrimitive] Error drawing zone:",
                    zone.name,
                    error
                  );
                }
              }

              console.log(`[SessionZonesPrimitive] Actually drew ${drawnCount} zones out of ${zones.length}`);
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
