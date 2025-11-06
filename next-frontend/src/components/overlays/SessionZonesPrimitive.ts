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

              console.log(
                "[SessionZonesPrimitive] Draw called with zones:",
                zones.length
              );
              console.log("[SessionZonesPrimitive] Using dimensions:", {
                width,
                height,
              });

              const timeScale = chart.timeScale();
              const visibleRange = timeScale.getVisibleLogicalRange();
              if (!visibleRange) {
                console.log("[SessionZonesPrimitive] No visible range");
                return;
              }

              for (const zone of zones) {
                try {
                  // Get x coordinates for start and end times
                  const x1 = timeScale.timeToCoordinate(zone.startTime);
                  const x2 = timeScale.timeToCoordinate(zone.endTime);

                  console.log("[SessionZonesPrimitive] Zone coordinates:", {
                    name: zone.name,
                    startTime: zone.startTime,
                    endTime: zone.endTime,
                    x1,
                    x2,
                  });

                  if (x1 === null || x2 === null) {
                    console.log(
                      "[SessionZonesPrimitive] Null coordinates for:",
                      zone.name
                    );
                    continue;
                  }
                  if (x2 <= 0 || x1 >= width) {
                    console.log(
                      "[SessionZonesPrimitive] Zone outside visible area:",
                      zone.name
                    );
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

                  console.log("[SessionZonesPrimitive] Drawing rectangle:", {
                    name: zone.name,
                    x: visibleX1,
                    y: 0,
                    width: zoneWidth,
                    height,
                    fillStyle: ctx.fillStyle,
                  });

                  ctx.fillRect(visibleX1, 0, zoneWidth, height);

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
