import {
  DealingRange,
  FairValueGap,
  ICTAnalysisStructure,
  ICTBar,
  KillZone,
  LiquidityLevel,
  MarketBias,
  OrderBlock,
  StructureEvent,
  StructureEventType,
  SwingPoint,
} from "./types";
import {
  ICT_TIME_ZONE,
  getBarBody,
  makeNyDateString,
  maxBy,
  midpoint,
  minBy,
  safeDivide,
  severityClamp,
  toTimeZoneDate,
  withinTolerance,
} from "./utils";

interface DetectSwingsOptions {
  pivotPeriod: number;
  minorPivotPeriod: number;
}

interface StructureDetectionResult extends ICTAnalysisStructure {}

export interface OrderBlockDetectionContext {
  structure: StructureDetectionResult;
  bars: ICTBar[];
}

export interface OrderBlockDetectionOptions {
  refinementMethod?: "defensive" | "aggressive";
  validityPeriod?: number;
}

const defaultPivotPeriod = 5;
const defaultMinorPivotPeriod = 3;

const isSwingHigh = (bars: ICTBar[], index: number, period: number): boolean => {
  const { high } = bars[index];
  for (let offset = 1; offset <= period; offset += 1) {
    const before = bars[index - offset];
    const after = bars[index + offset];
    if (!before || !after) {
      return false;
    }
    if (before.high > high || after.high > high) {
      return false;
    }
  }
  return true;
};

const isSwingLow = (bars: ICTBar[], index: number, period: number): boolean => {
  const { low } = bars[index];
  for (let offset = 1; offset <= period; offset += 1) {
    const before = bars[index - offset];
    const after = bars[index + offset];
    if (!before || !after) {
      return false;
    }
    if (before.low < low || after.low < low) {
      return false;
    }
  }
  return true;
};

export const detectSwings = (
  bars: ICTBar[],
  options?: Partial<DetectSwingsOptions>
): { highs: SwingPoint[]; lows: SwingPoint[] } => {
  const pivotPeriod = Math.max(2, Math.round(options?.pivotPeriod ?? defaultPivotPeriod));
  const minorPivotPeriod = Math.max(
    1,
    Math.round(options?.minorPivotPeriod ?? defaultMinorPivotPeriod)
  );

  const highMap = new Map<number, SwingPoint>();
  const lowMap = new Map<number, SwingPoint>();

  const recordSwing = (
    container: Map<number, SwingPoint>,
    index: number,
    strength: "major" | "minor"
  ) => {
    const existing = container.get(index);
    if (!existing || existing.strength === "minor") {
      container.set(index, {
        index,
        time: bars[index].time,
        price: bars[index].high,
        strength,
      });
    }
  };

  const recordLowSwing = (
    container: Map<number, SwingPoint>,
    index: number,
    strength: "major" | "minor"
  ) => {
    const existing = container.get(index);
    if (!existing || existing.strength === "minor") {
      container.set(index, {
        index,
        time: bars[index].time,
        price: bars[index].low,
        strength,
      });
    }
  };

  for (let i = pivotPeriod; i < bars.length - pivotPeriod; i += 1) {
    if (isSwingHigh(bars, i, pivotPeriod)) {
      recordSwing(highMap, i, "major");
    }
    if (isSwingLow(bars, i, pivotPeriod)) {
      recordLowSwing(lowMap, i, "major");
    }
  }

  for (let i = minorPivotPeriod; i < bars.length - minorPivotPeriod; i += 1) {
    if (isSwingHigh(bars, i, minorPivotPeriod) && !highMap.has(i)) {
      recordSwing(highMap, i, "minor");
    }
    if (isSwingLow(bars, i, minorPivotPeriod) && !lowMap.has(i)) {
      recordLowSwing(lowMap, i, "minor");
    }
  }

  const highs = Array.from(highMap.values()).sort((a, b) => a.index - b.index);
  const lows = Array.from(lowMap.values()).sort((a, b) => a.index - b.index);

  return { highs, lows };
};

export const detectStructure = (
  bars: ICTBar[],
  swings: { highs: SwingPoint[]; lows: SwingPoint[] }
): StructureDetectionResult => {
  const swingHighByIndex = new Map<number, SwingPoint>();
  const swingLowByIndex = new Map<number, SwingPoint>();

  swings.highs.forEach((swing) => swingHighByIndex.set(swing.index, swing));
  swings.lows.forEach((swing) => swingLowByIndex.set(swing.index, swing));

  const consumedSwingHighs = new Set<number>();
  const consumedSwingLows = new Set<number>();

  let lastSwingHigh: SwingPoint | null = null;
  let lastSwingLow: SwingPoint | null = null;

  let bias: MarketBias = "neutral";
  let lastBosAt: string | undefined;
  let lastChoChAt: string | undefined;

  const events: StructureEvent[] = [];

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    let recordedEvent = false;

    if (
      lastSwingHigh &&
      !consumedSwingHighs.has(lastSwingHigh.index) &&
      lastSwingHigh.index < index &&
      bar.close > lastSwingHigh.price
    ) {
      const type: StructureEventType = bias === "bearish" ? "ChoCH" : "BOS";
      const event: StructureEvent = {
        type,
        direction: "up",
        time: bar.time,
        barIndex: index,
        referenceSwing: lastSwingHigh,
      };
      events.push(event);
      if (type === "BOS") {
        lastBosAt = bar.time;
      } else {
        lastChoChAt = bar.time;
      }
      bias = "bullish";
      consumedSwingHighs.add(lastSwingHigh.index);
      recordedEvent = true;
      lastSwingHigh = null;
    }

    if (
      !recordedEvent &&
      lastSwingLow &&
      !consumedSwingLows.has(lastSwingLow.index) &&
      lastSwingLow.index < index &&
      bar.close < lastSwingLow.price
    ) {
      const type: StructureEventType = bias === "bullish" ? "ChoCH" : "BOS";
      const event: StructureEvent = {
        type,
        direction: "down",
        time: bar.time,
        barIndex: index,
        referenceSwing: lastSwingLow,
      };
      events.push(event);
      if (type === "BOS") {
        lastBosAt = bar.time;
      } else {
        lastChoChAt = bar.time;
      }
      bias = "bearish";
      consumedSwingLows.add(lastSwingLow.index);
      lastSwingLow = null;
    }

    if (swingHighByIndex.has(index)) {
      const swing = swingHighByIndex.get(index)!;
      lastSwingHigh = swing;
    }

    if (swingLowByIndex.has(index)) {
      const swing = swingLowByIndex.get(index)!;
      lastSwingLow = swing;
    }
  }

  return {
    bias,
    lastBosAt,
    lastChoChAt,
    swings,
    events,
  };
};

/**
 * Detects impulse move leading to structure break
 * Returns the start index of the impulse leg
 */
const detectImpulseLeg = (
  bars: ICTBar[],
  breakIndex: number,
  direction: "up" | "down",
  minImpulseStrength: number = 1.5
): number => {
  // Look back up to 10 bars to find start of impulse
  const lookbackLimit = Math.min(10, breakIndex);
  let impulseStart = breakIndex;

  // Calculate average candle range for recent bars
  let totalRange = 0;
  let count = 0;
  for (let i = Math.max(0, breakIndex - 20); i < breakIndex; i++) {
    const bar = bars[i];
    totalRange += bar.high - bar.low;
    count++;
  }
  const avgRange = count > 0 ? totalRange / count : 0;

  if (avgRange === 0) {
    return breakIndex - 1; // Fallback if no average
  }

  // Walk backward to find where impulse started (strong directional movement)
  for (let i = breakIndex - 1; i >= breakIndex - lookbackLimit && i >= 0; i--) {
    const bar = bars[i];
    const barRange = bar.high - bar.low;

    // Check if this bar is part of the impulse
    const isStrongBar = barRange > avgRange * minImpulseStrength;
    const isDirectional = direction === "up" ? bar.close > bar.open : bar.close < bar.open;

    if (isStrongBar && isDirectional) {
      impulseStart = i; // Continue backward, this is part of impulse
    } else {
      // Found a weak bar, impulse likely started after this
      break;
    }
  }

  return impulseStart;
};

/**
 * Finds the order block origin candle (last opposite candle before impulse)
 * Improved ICT methodology: finds the LAST opposite candle immediately before
 * the impulse move that led to the structure break
 */
const findOrderBlockOrigin = (
  bars: ICTBar[],
  event: StructureEvent
): { candleIndex: number; candle: ICTBar } | null => {
  const breakIndex = event.barIndex;
  if (breakIndex <= 0) {
    return null;
  }

  // First, detect where the impulse leg started
  const impulseStartIndex = detectImpulseLeg(bars, breakIndex, event.direction);

  // Now search backward from impulse start to find last opposite candle
  // This is the order block - last opposite action before the smart money impulse
  let orderBlockIndex: number | null = null;

  for (let index = impulseStartIndex - 1; index >= 0 && index >= impulseStartIndex - 5; index -= 1) {
    const bar = bars[index];
    const isOppositeCandle = event.direction === "up"
      ? bar.close < bar.open  // For bullish break, find bearish candle
      : bar.close > bar.open; // For bearish break, find bullish candle

    if (isOppositeCandle) {
      orderBlockIndex = index;
      break; // Found the last opposite candle before impulse
    }
  }

  // Fallback: if no opposite candle found near impulse, use old logic
  if (orderBlockIndex === null) {
    for (let index = breakIndex - 1; index >= 0; index -= 1) {
      const bar = bars[index];
      if (event.direction === "up") {
        if (bar.close < bar.open) {
          orderBlockIndex = index;
          break;
        }
      } else if (bar.close > bar.open) {
        orderBlockIndex = index;
        break;
      }
    }
  }

  if (orderBlockIndex === null) {
    return null;
  }

  return { candleIndex: orderBlockIndex, candle: bars[orderBlockIndex] };
};

const applyOrderBlockRefinement = (
  candle: ICTBar,
  type: "demand" | "supply",
  method: "defensive" | "aggressive"
): { low: number; high: number } => {
  if (method === "aggressive") {
    // Aggressive: Use full candle range (wicks included)
    return {
      low: candle.low,
      high: candle.high,
    };
  } else {
    // Defensive: Use candle body only (close/open)
    if (type === "demand") {
      // For demand blocks, use the body range
      return {
        low: Math.min(candle.open, candle.close),
        high: Math.max(candle.open, candle.close),
      };
    } else {
      // For supply blocks, use the body range
      return {
        low: Math.min(candle.open, candle.close),
        high: Math.max(candle.open, candle.close),
      };
    }
  }
};

const classifyOrderBlockZone = (
  event: StructureEvent,
  previousEvents: StructureEvent[],
  eventIndex: number
): "main" | "sub" => {
  // Main zone: ChoCh events are typically main zones (trend reversal)
  // Sub zone: Additional blocks near main zones or BoS-derived blocks

  if (event.type === "ChoCH") {
    // ChoCh events create main zones by default
    return "main";
  }

  // For BoS events, check if there's a recent ChoCh
  // If there's a ChoCh in the same direction recently, this is a sub zone
  const lookback = 5;
  for (let i = Math.max(0, eventIndex - lookback); i < eventIndex; i++) {
    const prevEvent = previousEvents[i];
    if (prevEvent.type === "ChoCH" && prevEvent.direction === event.direction) {
      // Found a recent ChoCh in same direction, this BoS creates a sub zone
      return "sub";
    }
  }

  // Default to main for isolated BoS
  return "main";
};

export const detectOrderBlocks = (
  bars: ICTBar[],
  structure: StructureDetectionResult,
  options?: OrderBlockDetectionOptions
): OrderBlock[] => {
  if (bars.length === 0) {
    return [];
  }

  const refinementMethod = options?.refinementMethod ?? "defensive";
  const validityPeriod = options?.validityPeriod ?? 500;

  const lastBar = bars[bars.length - 1];
  const lastPrice = lastBar.close;
  const currentBarIndex = bars.length - 1;
  const results: OrderBlock[] = [];

  for (let eventIdx = 0; eventIdx < structure.events.length; eventIdx++) {
    const event = structure.events[eventIdx];
    const origin = findOrderBlockOrigin(bars, event);
    if (!origin) {
      continue;
    }

    const { candleIndex, candle } = origin;
    const rangeLow = candle.low;
    const rangeHigh = candle.high;
    const rangeMid = midpoint(rangeLow, rangeHigh);

    const type = event.direction === "up" ? "demand" : "supply";
    const zoneType = classifyOrderBlockZone(event, structure.events, eventIdx);

    // Apply refinement based on method
    const refinedRange = applyOrderBlockRefinement(candle, type, refinementMethod);

    const ageBars = Math.max(0, currentBarIndex - candleIndex);

    // Check validity based on age
    const isValid = ageBars <= validityPeriod;

    // Calculate score
    const recency = severityClamp(1 - ageBars / Math.max(25, bars.length));
    const proximity = severityClamp(1 - Math.abs(rangeMid - lastPrice) / Math.max(lastPrice, 1));
    const originWeight = event.type === "BOS" ? 0.95 : 1.0; // ChoCh slightly more important
    const zoneWeight = zoneType === "main" ? 1.1 : 0.9;
    const refinedWeight = refinementMethod === "defensive" ? 1.05 : 1.0;
    const validityWeight = isValid ? 1.0 : 0.5;

    const score =
      Math.round(
        (recency * 40 + proximity * 30 + originWeight * 30) *
        zoneWeight * refinedWeight * validityWeight * 100
      ) / 100;

    results.push({
      type,
      origin: event.type,
      zoneType,
      candleTime: candle.time,
      candleIndex,
      range: { low: rangeLow, high: rangeHigh },
      refined: {
        low: refinedRange.low,
        high: refinedRange.high,
        method: refinementMethod,
      },
      ageBars,
      score,
      isValid,
    });
  }

  results.sort((a, b) => toTimeZoneDate(a.candleTime).getTime() - toTimeZoneDate(b.candleTime).getTime());

  return results;
};

interface FVGDetectionOptions {
  filterMode?: "very_aggressive" | "aggressive" | "defensive" | "very_defensive";
}

const getFVGMinWidthMultiplier = (mode: string): number => {
  switch (mode) {
    case "very_aggressive":
      return 0.0; // No filtering
    case "aggressive":
      return 0.0001; // Minimal filtering
    case "defensive":
      return 0.0005; // Moderate filtering
    case "very_defensive":
      return 0.001; // Strong filtering
    default:
      return 0.0;
  }
};

export const detectFairValueGaps = (
  bars: ICTBar[],
  options?: FVGDetectionOptions
): FairValueGap[] => {
  if (bars.length < 3) {
    return [];
  }

  const filterMode = options?.filterMode ?? "defensive";
  const minWidthMultiplier = getFVGMinWidthMultiplier(filterMode);

  const gaps: FairValueGap[] = [];

  // Calculate average price for relative width filtering
  const avgPrice = bars.reduce((sum, bar) => sum + (bar.high + bar.low) / 2, 0) / bars.length;

  for (let index = 1; index < bars.length - 1; index += 1) {
    const prev = bars[index - 1];
    const next = bars[index + 1];

    // Bullish gap
    if (prev.high < next.low) {
      const boundsLow = prev.high;
      const boundsHigh = next.low;
      const gapWidth = boundsHigh - boundsLow;
      const relativeWidth = gapWidth / avgPrice;

      // Apply filter
      if (relativeWidth < minWidthMultiplier) {
        continue;
      }

      const gap: FairValueGap = {
        type: "bullish",
        startTime: prev.time,
        endTime: next.time,
        bounds: {
          low: boundsLow,
          high: boundsHigh,
        },
        filled: false,
      };

      for (let j = index + 1; j < bars.length; j += 1) {
        const body = getBarBody(bars[j]);
        if (body.low <= gap.bounds.high && body.high >= gap.bounds.low) {
          gap.filled = true;
          break;
        }
      }

      gaps.push(gap);
    }

    // Bearish gap
    if (prev.low > next.high) {
      const boundsLow = next.high;
      const boundsHigh = prev.low;
      const gapWidth = boundsHigh - boundsLow;
      const relativeWidth = gapWidth / avgPrice;

      // Apply filter
      if (relativeWidth < minWidthMultiplier) {
        continue;
      }

      const gap: FairValueGap = {
        type: "bearish",
        startTime: prev.time,
        endTime: next.time,
        bounds: {
          low: Math.min(boundsLow, boundsHigh),
          high: Math.max(boundsLow, boundsHigh),
        },
        filled: false,
      };

      for (let j = index + 1; j < bars.length; j += 1) {
        const body = getBarBody(bars[j]);
        if (body.low <= gap.bounds.high && body.high >= gap.bounds.low) {
          gap.filled = true;
          break;
        }
      }

      gaps.push(gap);
    }
  }

  return gaps;
};

export const computeDealingRange = (
  bars: ICTBar[],
  swings: { highs: SwingPoint[]; lows: SwingPoint[] }
): DealingRange | null => {
  if (bars.length === 0) {
    return null;
  }

  const majorHighs = swings.highs.filter((swing) => swing.strength === "major");
  const majorLows = swings.lows.filter((swing) => swing.strength === "major");

  if (majorHighs.length === 0 || majorLows.length === 0) {
    return null;
  }

  const lastClose = bars[bars.length - 1].close;
  let rangeLow: SwingPoint | null = null;
  let rangeHigh: SwingPoint | null = null;

  for (let i = majorHighs.length - 1; i >= 0; i -= 1) {
    const high = majorHighs[i];
    for (let j = majorLows.length - 1; j >= 0; j -= 1) {
      const low = majorLows[j];
      if (low.index <= high.index) {
        const minPrice = Math.min(low.price, high.price);
        const maxPrice = Math.max(low.price, high.price);
        if (lastClose >= minPrice && lastClose <= maxPrice) {
          rangeLow = low;
          rangeHigh = high;
          break;
        }
      }
    }
    if (rangeLow && rangeHigh) {
      break;
    }
  }

  if (!rangeLow || !rangeHigh) {
    rangeLow = minBy(majorLows, (s) => s.price);
    rangeHigh = maxBy(majorHighs, (s) => s.price);
  }

  if (!rangeLow || !rangeHigh) {
    return null;
  }

  const lowPrice = Math.min(rangeLow.price, rangeHigh.price);
  const highPrice = Math.max(rangeLow.price, rangeHigh.price);
  if (highPrice <= lowPrice) {
    return null;
  }

  const eq = midpoint(lowPrice, highPrice);
  const pdPercent = safeDivide(lastClose - lowPrice, highPrice - lowPrice) * 100;

  return {
    low: lowPrice,
    high: highPrice,
    eq,
    pdPercent,
  };
};

const buildLiquidityClusters = (
  swings: SwingPoint[],
  toleranceFraction: number
): LiquidityLevel[] => {
  if (swings.length === 0) {
    return [];
  }

  const clusters: {
    price: number;
    count: number;
    lastTime: string;
    indices: number[];
  }[] = [];

  for (const swing of swings) {
    let match = clusters.find((cluster) =>
      withinTolerance(cluster.price, swing.price, toleranceFraction)
    );

    if (!match) {
      match = {
        price: swing.price,
        count: 0,
        lastTime: swing.time,
        indices: [swing.index],
      };
      clusters.push(match);
    }

    match.count += 1;
    match.price = (match.price * (match.count - 1) + swing.price) / match.count;
    match.lastTime = swing.time;
    match.indices.push(swing.index);
  }

  return clusters
    .filter((cluster) => cluster.count >= 2)
    .sort((a, b) => a.indices[a.indices.length - 1] - b.indices[b.indices.length - 1])
    .map((cluster) => ({
      time: cluster.lastTime,
      price: Number(cluster.price.toFixed(4)),
      count: cluster.count,
    }));
};

const buildExternalLiquidity = (
  swings: SwingPoint[],
  take: number,
  direction: "high" | "low"
): LiquidityLevel[] => {
  if (swings.length === 0) {
    return [];
  }
  const sorted = [...swings].sort((a, b) =>
    direction === "high" ? b.price - a.price : a.price - b.price
  );
  return sorted.slice(0, take).map((swing) => ({
    time: swing.time,
    price: swing.price,
    count: 1,
  }));
};

interface LiquidityDetectionOptions {
  mode?: "static" | "dynamic" | "both";
  staticSensitivity?: number;
  dynamicSensitivity?: number;
}

export const detectLiquidity = (
  swings: { highs: SwingPoint[]; lows: SwingPoint[] },
  toleranceFraction: number,
  options?: LiquidityDetectionOptions
): {
  equalHighs: LiquidityLevel[];
  equalLows: LiquidityLevel[];
  externalHighs: LiquidityLevel[];
  externalLows: LiquidityLevel[];
} => {
  const mode = options?.mode ?? "both";
  const staticSensitivity = options?.staticSensitivity ?? 0.3;
  const dynamicSensitivity = options?.dynamicSensitivity ?? 1.0;

  let equalHighs: LiquidityLevel[] = [];
  let equalLows: LiquidityLevel[] = [];

  // Static liquidity: Uses major swings with static tolerance
  if (mode === "static" || mode === "both") {
    const majorHighs = swings.highs.filter((swing) => swing.strength === "major");
    const majorLows = swings.lows.filter((swing) => swing.strength === "major");

    const staticHighs = buildLiquidityClusters(majorHighs, toleranceFraction * staticSensitivity);
    const staticLows = buildLiquidityClusters(majorLows, toleranceFraction * staticSensitivity);

    equalHighs = [...equalHighs, ...staticHighs];
    equalLows = [...equalLows, ...staticLows];
  }

  // Dynamic liquidity: Uses minor swings with adaptive tolerance
  if (mode === "dynamic" || mode === "both") {
    const minorHighs = swings.highs.filter((swing) => swing.strength === "minor");
    const minorLows = swings.lows.filter((swing) => swing.strength === "minor");

    const dynamicHighs = buildLiquidityClusters(minorHighs, toleranceFraction * dynamicSensitivity);
    const dynamicLows = buildLiquidityClusters(minorLows, toleranceFraction * dynamicSensitivity);

    equalHighs = [...equalHighs, ...dynamicHighs];
    equalLows = [...equalLows, ...dynamicLows];
  }

  // Remove duplicates and sort
  const deduplicateLevels = (levels: LiquidityLevel[]): LiquidityLevel[] => {
    const map = new Map<string, LiquidityLevel>();
    levels.forEach((level) => {
      const key = level.price.toFixed(4);
      const existing = map.get(key);
      if (!existing || level.count > existing.count) {
        map.set(key, level);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      toTimeZoneDate(a.time).getTime() - toTimeZoneDate(b.time).getTime()
    );
  };

  equalHighs = deduplicateLevels(equalHighs);
  equalLows = deduplicateLevels(equalLows);

  const majorHighs = swings.highs.filter((swing) => swing.strength === "major");
  const majorLows = swings.lows.filter((swing) => swing.strength === "major");

  const externalHighs = buildExternalLiquidity(majorHighs, 3, "high");
  const externalLows = buildExternalLiquidity(majorLows, 3, "low");

  const trim = (levels: LiquidityLevel[], limit: number) =>
    levels.slice(Math.max(0, levels.length - limit));

  return {
    equalHighs: trim(equalHighs, 15),
    equalLows: trim(equalLows, 15),
    externalHighs,
    externalLows,
  };
};

const sessionKillZones: Record<
  "NY" | "LDN" | "ASIAN",
  { name: string; startHour: number; startMinute: number; endHour: number; endMinute: number }[]
> = {
  NY: [
    // Fixed ICT timing: AM Kill Zone includes pre-market (8:30-11:00 ET)
    { name: "NY AM Kill Zone", startHour: 8, startMinute: 30, endHour: 11, endMinute: 0 },
    { name: "NY Lunch", startHour: 11, startMinute: 30, endHour: 13, endMinute: 30 },
    { name: "NY PM Kill Zone", startHour: 13, startMinute: 30, endHour: 15, endMinute: 0 },
  ],
  LDN: [
    // London Kill Zone: 2:00-5:00 AM ET (prime hour 3:00-4:00)
    { name: "London Kill Zone", startHour: 2, startMinute: 0, endHour: 5, endMinute: 0 },
    { name: "London Lunch", startHour: 7, startMinute: 0, endHour: 8, endMinute: 30 },
  ],
  ASIAN: [
    // Asian Kill Zone: 20:00-00:00 ET (8 PM to midnight)
    { name: "Asian Kill Zone", startHour: 20, startMinute: 0, endHour: 23, endMinute: 59 },
  ],
};

export const computeSessions = (
  bars: ICTBar[],
  session: "NY" | "LDN" | "ASIAN" = "NY"
): { killZones: KillZone[] } => {
  if (bars.length === 0) {
    return { killZones: [] };
  }

  const lastBar = bars[bars.length - 1];
  const lastDate = toTimeZoneDate(lastBar.time, ICT_TIME_ZONE);
  const activeZones = sessionKillZones[session] ?? sessionKillZones.NY;

  const killZones = activeZones.map((zone) => {
    const startString = makeNyDateString(lastDate, zone.startHour, zone.startMinute);
    const endString = makeNyDateString(lastDate, zone.endHour, zone.endMinute);

    const startDate = toTimeZoneDate(startString, ICT_TIME_ZONE);
    const endDate = toTimeZoneDate(endString, ICT_TIME_ZONE);
    const barDate = toTimeZoneDate(lastBar.time, ICT_TIME_ZONE);
    const active = barDate >= startDate && barDate <= endDate;

    return {
      name: zone.name,
      start: `${startString}`,
      end: `${endString}`,
      active,
    };
  });

  return { killZones };
};
