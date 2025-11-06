import { ICTAnalysis, ICTAnalysisOptions, ICTBar } from "./types";
import {
  ICT_TIME_ZONE,
  getNyDateParts,
  padNumber,
  sortBarsAscending,
  takeRecentBars,
  toTimeZoneDate,
} from "./utils";
import {
  computeDealingRange,
  computeSessions,
  detectFairValueGaps,
  detectLiquidity,
  detectOrderBlocks,
  detectStructure,
  detectSwings,
} from "./detectors";

const DEFAULT_LOOKBACK = 1500;
const DEFAULT_PIVOT_PERIOD = 5;
const DEFAULT_MINOR_PIVOT_PERIOD = 3;
const DEFAULT_LIQUIDITY_TOLERANCE = 0.001; // 0.1%

const trimEnd = <T>(items: T[], limit: number): T[] => {
  if (!Number.isFinite(limit) || limit <= 0) {
    return items;
  }
  return items.slice(Math.max(0, items.length - limit));
};

const getDateKey = (timestamp: string): string => {
  const date = toTimeZoneDate(timestamp, ICT_TIME_ZONE);
  const { year, month, day } = getNyDateParts(date);
  return `${year}-${padNumber(month)}-${padNumber(day)}`;
};

const getISOWeek = (timestamp: string): { year: number; week: number } => {
  const date = toTimeZoneDate(timestamp, ICT_TIME_ZONE);
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNumber = utcDate.getUTCDay() === 0 ? 7 : utcDate.getUTCDay();
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000) + 1) / 7
  );
  return { year: utcDate.getUTCFullYear(), week };
};

const computeReferenceLevels = (bars: ICTBar[]): {
  prevDayHigh?: number;
  prevDayLow?: number;
  weeklyHigh?: number;
  weeklyLow?: number;
} => {
  if (bars.length === 0) {
    return {};
  }

  const dayMap = new Map<
    string,
    { high: number; low: number }
  >();

  const weekMap = new Map<
    string,
    { high: number; low: number }
  >();

  for (const bar of bars) {
    const dayKey = getDateKey(bar.time);
    const existingDay = dayMap.get(dayKey);
    if (existingDay) {
      existingDay.high = Math.max(existingDay.high, bar.high);
      existingDay.low = Math.min(existingDay.low, bar.low);
    } else {
      dayMap.set(dayKey, { high: bar.high, low: bar.low });
    }

    const { year, week } = getISOWeek(bar.time);
    const weekKey = `${year}-W${padNumber(week)}`;
    const existingWeek = weekMap.get(weekKey);
    if (existingWeek) {
      existingWeek.high = Math.max(existingWeek.high, bar.high);
      existingWeek.low = Math.min(existingWeek.low, bar.low);
    } else {
      weekMap.set(weekKey, { high: bar.high, low: bar.low });
    }
  }

  const dayKeys = Array.from(dayMap.keys()).sort();
  const weekKeys = Array.from(weekMap.keys()).sort();

  const prevDayKey = dayKeys.length > 1 ? dayKeys[dayKeys.length - 2] : undefined;
  const prevWeekKey = weekKeys.length > 1 ? weekKeys[weekKeys.length - 2] : undefined;

  return {
    prevDayHigh: prevDayKey ? dayMap.get(prevDayKey)?.high : undefined,
    prevDayLow: prevDayKey ? dayMap.get(prevDayKey)?.low : undefined,
    weeklyHigh: prevWeekKey ? weekMap.get(prevWeekKey)?.high : undefined,
    weeklyLow: prevWeekKey ? weekMap.get(prevWeekKey)?.low : undefined,
  };
};

export const analyzeICT = (
  bars: ICTBar[],
  options: ICTAnalysisOptions
): ICTAnalysis => {
  const lookback = options.lookbackBars ?? DEFAULT_LOOKBACK;
  const pivotPeriod = options.pivotPeriod ?? DEFAULT_PIVOT_PERIOD;
  const minorPivotPeriod = options.minorPivotPeriod ?? DEFAULT_MINOR_PIVOT_PERIOD;
  const liquidityTolerance =
    options.liquidityTolerancePct ?? DEFAULT_LIQUIDITY_TOLERANCE;
  const session = options.session ?? "NY";

  // New options with defaults
  const orderBlockRefinement = options.orderBlockRefinement ?? "defensive";
  const orderBlockValidityPeriod = options.orderBlockValidityPeriod ?? 500;
  const fvgFilterMode = options.fvgFilterMode ?? "defensive";
  const liquidityMode = options.liquidityMode ?? "both";
  const staticLiquiditySensitivity = options.staticLiquiditySensitivity ?? 0.3;
  const dynamicLiquiditySensitivity = options.dynamicLiquiditySensitivity ?? 1.0;

  const sorted = sortBarsAscending(bars);
  const scopedBars = takeRecentBars(sorted, lookback);

  if (scopedBars.length === 0) {
    return {
      meta: {
        symbol: options.symbol,
        interval: options.interval,
        tz: ICT_TIME_ZONE,
        range: { start: "", end: "" },
        lastBar: null,
      },
      structure: {
        bias: "neutral",
        swings: { highs: [], lows: [] },
        events: [],
      },
      dealingRange: null,
      orderBlocks: [],
      fvg: [],
      liquidity: {
        equalHighs: [],
        equalLows: [],
        externalHighs: [],
        externalLows: [],
      },
      sessions: { killZones: [] },
      levels: {},
    };
  }

  const swings = detectSwings(scopedBars, {
    pivotPeriod,
    minorPivotPeriod,
  });

  const structure = detectStructure(scopedBars, swings);

  const trimmedStructure = {
    ...structure,
    swings: {
      highs: trimEnd(structure.swings.highs, 20),
      lows: trimEnd(structure.swings.lows, 20),
    },
    events: trimEnd(structure.events, 20),
  };

  const orderBlocks = trimEnd(
    detectOrderBlocks(scopedBars, structure, {
      refinementMethod: orderBlockRefinement,
      validityPeriod: orderBlockValidityPeriod,
    }).sort(
      (a, b) =>
        toTimeZoneDate(a.candleTime).getTime() -
        toTimeZoneDate(b.candleTime).getTime()
    ),
    20
  );

  const fvg = trimEnd(
    detectFairValueGaps(scopedBars, {
      filterMode: fvgFilterMode,
    }),
    30
  );

  const dealingRange = computeDealingRange(scopedBars, structure.swings);

  const liquidity = detectLiquidity(structure.swings, liquidityTolerance, {
    mode: liquidityMode,
    staticSensitivity: staticLiquiditySensitivity,
    dynamicSensitivity: dynamicLiquiditySensitivity,
  });

  const sessions = computeSessions(scopedBars, session);
  const levels = computeReferenceLevels(scopedBars);

  const rangeStart = scopedBars[0]?.time ?? "";
  const rangeEnd = scopedBars[scopedBars.length - 1]?.time ?? "";
  const lastBar = scopedBars[scopedBars.length - 1] ?? null;

  return {
    meta: {
      symbol: options.symbol,
      interval: options.interval,
      tz: ICT_TIME_ZONE,
      range: {
        start: rangeStart,
        end: rangeEnd,
      },
      lastBar,
    },
    structure: trimmedStructure,
    dealingRange,
    orderBlocks,
    fvg,
    liquidity,
    sessions,
    levels,
  };
};
