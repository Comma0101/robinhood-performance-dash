"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  type BiasSelectorInput,
  type BiasDirection,
  type SessionWindow,
  selectBias,
  deriveSessionWindow,
} from "@/lib/ict/bias";
import type { ICTAnalysis, StructureEvent } from "@/lib/ict";

type FetchStatus = "idle" | "loading" | "ok" | "error";

const autoFillTargets = [
  { interval: "daily", label: "Daily" },
  { interval: "4h", label: "4H" },
  { interval: "15min", label: "15m" },
  { interval: "5min", label: "5m" },
  { interval: "1min", label: "1m" },
] as const;

interface Props {
  symbol: string;
  includeCurrentBar?: boolean;
  onAutoFillComplete?: (analyses: Record<string, ICTAnalysis>) => void;
}

const BiasSelectorPlayground: React.FC<Props> = ({
  symbol,
  includeCurrentBar = false,
  onAutoFillComplete,
}) => {
  const [input, setInput] = useState<{
    dailyDraw: BiasDirection | null;
    fourHourDraw: BiasDirection | null;
    fifteenMinuteBias: BiasDirection | null;
    fifteenMinuteConfirmed: boolean;
    fifteenMinutePdPercent: number;
    fiveMinuteBias: BiasDirection | null;
    fiveMinuteZoneAligned: boolean;
    oneMinuteMssConfirmed: boolean;
    sessionWindow: SessionWindow;
  }>({
    dailyDraw: null,
    fourHourDraw: null,
    fifteenMinuteBias: null,
    fifteenMinuteConfirmed: false,
    fifteenMinutePdPercent: 50,
    fiveMinuteBias: null,
    fiveMinuteZoneAligned: false,
    oneMinuteMssConfirmed: false,
    sessionWindow: "OFF",
  });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<Record<string, FetchStatus>>(() =>
    Object.fromEntries(autoFillTargets.map((target) => [target.interval, "idle"]))
  );
  const [autoContext, setAutoContext] = useState<{
    daily?: BiasDirection | null;
    h4?: BiasDirection | null;
    m15?: BiasDirection | null;
    m15Confirmed?: boolean;
    m15Pd?: number;
    m5?: BiasDirection | null;
    m5Ready?: boolean;
    m1?: boolean;
    session?: SessionWindow;
  }>({});

  const result = useMemo(() => {
    const payload: BiasSelectorInput = {
      dailyDraw: input.dailyDraw,
      fourHourDraw: input.fourHourDraw,
      fifteenMinuteBias: input.fifteenMinuteBias,
      fifteenMinuteConfirmed: input.fifteenMinuteConfirmed,
      fifteenMinutePdPercent: input.fifteenMinutePdPercent,
      fiveMinuteBias: input.fiveMinuteBias,
      fiveMinuteZoneAligned: input.fiveMinuteZoneAligned,
      oneMinuteMssConfirmed: input.oneMinuteMssConfirmed,
      sessionWindow: input.sessionWindow,
    };
    return selectBias(payload);
  }, [input]);

  const inferDirectionFromBias = (bias?: string | null): BiasDirection | null => {
    if (bias === "bullish") return "long";
    if (bias === "bearish") return "short";
    return null;
  };

  const nearestHtfDraw = (analysis: ICTAnalysis): BiasDirection | null => {
    const lastClose = analysis.meta.lastBar?.close ?? null;
    if (lastClose == null) return null;
    const highs = analysis.liquidity?.externalHighs ?? [];
    const lows = analysis.liquidity?.externalLows ?? [];
    let nearestHighDist = Infinity;
    let nearestLowDist = Infinity;
    for (const h of highs) {
      const d = Math.abs(h.price - lastClose);
      if (h.price >= lastClose && d < nearestHighDist) nearestHighDist = d;
    }
    for (const l of lows) {
      const d = Math.abs(lastClose - l.price);
      if (l.price <= lastClose && d < nearestLowDist) nearestLowDist = d;
    }
    if (nearestHighDist === Infinity && nearestLowDist === Infinity) return null;
    if (nearestHighDist <= nearestLowDist) return "long";
    return "short";
  };

  const hasRecentDisplacedEvent = (events: StructureEvent[] | undefined, barsCount?: number, maxRecentBars = 20): boolean => {
    if (!events || events.length === 0 || !barsCount) return false;
    const last = events[events.length - 1];
    if (!last?.hasDisplacement) return false;
    // Consider it recent if within the last N bars
    const idx = typeof last.barIndex === "number" ? last.barIndex : barsCount - 1;
    return barsCount - 1 - idx <= maxRecentBars;
  };

  const zoneReadyOn5m = (analysis: ICTAnalysis, fifteenDir: BiasDirection | null): { bias: BiasDirection | null; ready: boolean } => {
    if (!fifteenDir) return { bias: null, ready: false };
    const lastClose = analysis.meta.lastBar?.close ?? null;
    if (lastClose == null) return { bias: fifteenDir, ready: false };
    const wantObType = fifteenDir === "long" ? "demand" : "supply";
    const ob = (analysis.orderBlocks ?? []).find((z) => z.type === wantObType);
    const fvg = (analysis.fvg ?? []).find((g) => (fifteenDir === "long" ? g.type === "bullish" : g.type === "bearish"));
    // Basic proximity heuristic: zone exists ⇒ aligned; if refined bounds include/near price ⇒ ready
    let ready = false;
    if (ob) {
      const low = ob.refined?.low ?? ob.range.low;
      const high = ob.refined?.high ?? ob.range.high;
      ready = lastClose >= low && lastClose <= high;
    }
    if (!ready && fvg) {
      const low = fvg.bounds?.low ?? 0;
      const high = fvg.bounds?.high ?? 0;
      ready = lastClose >= low && lastClose <= high;
    }
    return { bias: fifteenDir, ready };
  };

  const onAutoFill = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setFetchStatus((prev) => {
      const next: Record<string, FetchStatus> = { ...prev };
      for (const target of autoFillTargets) {
        next[target.interval] = "loading";
      }
      return next;
    });
    try {
      const qs = (interval: string) =>
        `/api/ict?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}${includeCurrentBar ? "&includeCurrentBar=true" : ""}`;
      const responses: Record<string, ICTAnalysis> = {};
      for (const target of autoFillTargets) {
        const res = await fetch(qs(target.interval), { cache: "no-store" });
        if (!res.ok) {
          setFetchStatus((prev) => ({ ...prev, [target.interval]: "error" }));
          throw new Error(`Failed to fetch ${target.label} ICT data`);
        }
        const payload = (await res.json()) as ICTAnalysis;
        responses[target.interval] = payload;
        setFetchStatus((prev) => ({ ...prev, [target.interval]: "ok" }));
      }
      onAutoFillComplete?.(responses);

      const daily = responses["daily"];
      const h4 = responses["4h"];
      const m15 = responses["15min"];
      const m5 = responses["5min"];
      const m1 = responses["1min"];

      const dailyDraw = nearestHtfDraw(daily);
      const h4Draw = nearestHtfDraw(h4);
      const fifteenBias = inferDirectionFromBias(m15?.structure?.bias ?? null);
      const fifteenConfirmed = hasRecentDisplacedEvent(m15?.structure?.events, m15?.meta?.barsCount ?? undefined, 30);
      const fifteenPd = m15?.dealingRange?.pdPercent ?? 50;
      const fiveBias = inferDirectionFromBias(m5?.structure?.bias ?? null);
      const { ready: zoneAligned } = zoneReadyOn5m(m5, fifteenBias);
      const oneMss = hasRecentDisplacedEvent(m1?.structure?.events, m1?.meta?.barsCount ?? undefined, 30);
      const sessionWindow = deriveSessionWindow(m15);

      setInput((prev) => ({
        ...prev,
        dailyDraw,
        fourHourDraw: h4Draw,
        fifteenMinuteBias: fifteenBias,
        fifteenMinuteConfirmed: Boolean(fifteenConfirmed),
        fifteenMinutePdPercent: typeof fifteenPd === "number" ? fifteenPd : 50,
        fiveMinuteBias: fiveBias,
        fiveMinuteZoneAligned: Boolean(zoneAligned),
        oneMinuteMssConfirmed: Boolean(oneMss),
        sessionWindow,
      }));
      setAutoContext({
        daily: dailyDraw,
        h4: h4Draw,
        m15: fifteenBias,
        m15Confirmed: Boolean(fifteenConfirmed),
        m15Pd: typeof fifteenPd === "number" ? fifteenPd : undefined,
        m5: fiveBias,
        m5Ready: Boolean(zoneAligned),
        m1: Boolean(oneMss),
        session: sessionWindow,
      });
    } catch (e: any) {
      setLoadError(e?.message || "Auto-fill failed");
      setFetchStatus((prev) => {
        const next: Record<string, FetchStatus> = { ...prev };
        for (const target of autoFillTargets) {
          if (next[target.interval] === "loading") {
            next[target.interval] = "error";
          }
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [symbol, includeCurrentBar]);

  const sessionFitColor =
    result.sessionFit === "preferred"
      ? "text-success"
      : result.sessionFit === "ok"
      ? "text-warning"
      : "text-error-text";

  const badgeColor = (state: "good" | "warn" | "bad" | "neutral") => {
    switch (state) {
      case "good":
        return "bg-success/10 text-success border-success/30";
      case "warn":
        return "bg-warning/10 text-warning border-warning/30";
      case "bad":
        return "bg-error/10 text-error-text border-error/30";
      default:
        return "bg-border/30 text-text-secondary border-border";
    }
  };

  const renderBadge = (
    label: string,
    value: string,
    state: "good" | "warn" | "bad" | "neutral" = "neutral"
  ) => (
    <div className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${badgeColor(state)}`}>
      <div className="uppercase tracking-wide text-[9px] text-text-tertiary">{label}</div>
      <div>{value}</div>
    </div>
  );

  const directionLabel = (dir: BiasDirection | null): string => {
    if (dir === "long") return "Long";
    if (dir === "short") return "Short";
    return "Neutral";
  };

  const directionState = (
    dir: BiasDirection | null,
    target?: BiasDirection | null
  ): "good" | "warn" | "bad" | "neutral" => {
    if (!dir) return "neutral";
    if (!target) return "good";
    return dir === target ? "good" : "bad";
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background-subtle p-4 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
            Bias Stack Sandbox
          </p>
          <p className="text-[11px] text-text-tertiary">
            Quickly sanity-check Daily → 4H → 15m → 5m → 1m alignment.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-text-primary">
            {result.bias === "skip"
              ? "Skip"
              : result.bias === "long"
              ? "Long Bias"
              : "Short Bias"}
          </p>
          <p className="text-[11px] text-text-secondary">
            Grade {result.grade} · Score {result.score}
          </p>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onAutoFill}
              disabled={loading}
              className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-text-primary hover:border-primary/60 disabled:opacity-60"
              title={symbol ? `Auto-fill from ICT (${symbol})` : "Set a symbol to auto-fill"}
            >
              {loading ? "Filling…" : "Auto-fill from ICT"}
            </button>
          </div>
        </div>
      </div>
      {loadError && (
        <div className="rounded-md border border-error/40 bg-error/10 px-2 py-1 text-[11px] text-error-text">
          {loadError}
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-[10px] text-text-secondary">
        {autoFillTargets.map((target) => {
          const status = fetchStatus[target.interval];
          const color =
            status === "ok"
              ? "bg-success"
              : status === "error"
              ? "bg-error"
              : status === "loading"
              ? "bg-warning"
              : "bg-border";
          return (
            <span
              key={target.interval}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5"
            >
              <span className={`h-2 w-2 rounded-full ${color}`} />
              {target.label}
              <span className="capitalize">{status}</span>
            </span>
          );
        })}
      </div>

      <div className="grid gap-2 rounded-lg border border-border bg-background p-3 text-[10px] text-text-secondary md:grid-cols-3">
        {renderBadge(
          "Daily",
          directionLabel(autoContext.daily ?? input.dailyDraw),
          directionState(autoContext.daily ?? input.dailyDraw, input.fifteenMinuteBias)
        )}
        {renderBadge(
          "4H",
          directionLabel(autoContext.h4 ?? input.fourHourDraw),
          directionState(autoContext.h4 ?? input.fourHourDraw, input.fifteenMinuteBias)
        )}
        {renderBadge(
          "15m bias",
          `${directionLabel(autoContext.m15 ?? input.fifteenMinuteBias)} ${
            autoContext.m15Confirmed ?? input.fifteenMinuteConfirmed ? "(confirmed)" : "(pending)"
          }`,
          autoContext.m15Confirmed ?? input.fifteenMinuteConfirmed ? "good" : "warn"
        )}
        {renderBadge(
          "15m PD%",
          `${Math.round(autoContext.m15Pd ?? input.fifteenMinutePdPercent)}%`,
          "neutral"
        )}
        {renderBadge(
          "5m zone",
          `${directionLabel(autoContext.m5 ?? input.fiveMinuteBias)} ${
            autoContext.m5Ready ?? input.fiveMinuteZoneAligned ? "· ready" : ""
          }`,
          autoContext.m5Ready ?? input.fiveMinuteZoneAligned ? "good" : "warn"
        )}
        {renderBadge(
          "1m",
          autoContext.m1 ?? input.oneMinuteMssConfirmed ? "MSS confirmed" : "Waiting",
          autoContext.m1 ?? input.oneMinuteMssConfirmed ? "good" : "warn"
        )}
        {renderBadge(
          "Session",
          (autoContext.session ?? input.sessionWindow)?.replace("_", " ") || "OFF",
          autoContext.session ?? input.sessionWindow ? "good" : "warn"
        )}
      </div>

      <p className="text-[11px] text-text-tertiary">
        Values are sourced from live ICT analyses—use Auto-fill to refresh this stack.
      </p>

      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div className="flex flex-wrap items-center justify-between text-[11px] text-text-secondary">
          <span>
            Status: <span className="font-semibold text-text-primary">{result.status}</span>
          </span>
          <span className={sessionFitColor}>Session fit: {result.sessionFit}</span>
          <span>
            Countertrend: {result.counterTrend ? "Yes" : "No"}
          </span>
          <span>Needs 1m confirmation: {result.needsOneMinuteConfirmation ? "Yes" : "No"}</span>
        </div>
        {result.rationale.length > 0 && (
          <ul className="mt-2 space-y-1">
            {result.rationale.map((reason, index) => (
              <li key={`${reason}-${index}`} className="text-[11px] text-text-tertiary">
                • {reason}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default BiasSelectorPlayground;
