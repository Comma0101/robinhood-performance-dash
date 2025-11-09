import {
  DealingRange,
  FairValueGap,
  ICTAnalysisStructure,
  ICTBar,
  KillZone,
  LiquidityLevel,
  LiquidityStack,
  MarketBias,
  OrderBlock,
  StructureEvent,
  StructureEventType,
  SwingPoint,
  SMTSignal,
} from "./types";
import {
  ICT_TIME_ZONE,
  computeAverageTrueRange,
  distancePct,
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

interface StructureDetectionOptions {
  displacementAtrPeriod?: number;
  displacementMultiplier?: number;
}

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
  swings: { highs: SwingPoint[]; lows: SwingPoint[] },
  options?: StructureDetectionOptions
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

  const atrPeriod = Math.max(5, options?.displacementAtrPeriod ?? 14);
  const displacementMultiplier = Math.max(0.05, options?.displacementMultiplier ?? 0.25);
  const atrSeries = computeAverageTrueRange(bars, atrPeriod);

  const evaluateDisplacement = (
    bar: ICTBar,
    swing: SwingPoint,
    direction: "up" | "down",
    index: number
  ): { hasDisplacement: boolean; displacement: number; threshold: number; atr: number } => {
    const atr = atrSeries[index] ?? atrSeries[index - 1] ?? atrSeries[atrSeries.length - 1] ?? 0;
    const displacement =
      direction === "up" ? bar.close - swing.price : swing.price - bar.close;
    const threshold = atr * displacementMultiplier;
    const hasDisplacement = displacement >= threshold && displacement > 0;
    return {
      hasDisplacement,
      displacement,
      threshold,
      atr,
    };
  };

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    let recordedEvent = false;

    if (
      lastSwingHigh &&
      !consumedSwingHighs.has(lastSwingHigh.index) &&
      lastSwingHigh.index < index &&
      bar.close > lastSwingHigh.price
    ) {
      const { hasDisplacement, displacement, threshold, atr } = evaluateDisplacement(
        bar,
        lastSwingHigh,
        "up",
        index
      );
      const type: StructureEventType = hasDisplacement
        ? bias === "bearish"
          ? "ChoCH"
          : "BOS"
        : "Sweep";
      const event: StructureEvent = {
        type,
        direction: "up",
        time: bar.time,
        barIndex: index,
        referenceSwing: lastSwingHigh,
        displacement,
        threshold,
        atr,
        hasDisplacement,
      };
      events.push(event);
      if (hasDisplacement) {
        if (type === "BOS") {
          lastBosAt = bar.time;
        } else if (type === "ChoCH") {
          lastChoChAt = bar.time;
        }
        bias = "bullish";
        consumedSwingHighs.add(lastSwingHigh.index);
        recordedEvent = true;
        lastSwingHigh = null;
      }
    }

    if (
      !recordedEvent &&
      lastSwingLow &&
      !consumedSwingLows.has(lastSwingLow.index) &&
      lastSwingLow.index < index &&
      bar.close < lastSwingLow.price
    ) {
      const { hasDisplacement, displacement, threshold, atr } = evaluateDisplacement(
        bar,
        lastSwingLow,
        "down",
        index
      );
      const type: StructureEventType = hasDisplacement
        ? bias === "bullish"
          ? "ChoCH"
          : "BOS"
        : "Sweep";
      const event: StructureEvent = {
        type,
        direction: "down",
        time: bar.time,
        barIndex: index,
        referenceSwing: lastSwingLow,
        displacement,
        threshold,
        atr,
        hasDisplacement,
      };
      events.push(event);
      if (hasDisplacement) {
        if (type === "BOS") {
          lastBosAt = bar.time;
        } else if (type === "ChoCH") {
          lastChoChAt = bar.time;
        }
        bias = "bearish";
        consumedSwingLows.add(lastSwingLow.index);
        lastSwingLow = null;
      }
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
  method: "defensive" | "aggressive" | "mean_threshold"
): { low: number; high: number; mean?: number } => {
  const bodyLow = Math.min(candle.open, candle.close);
  const bodyHigh = Math.max(candle.open, candle.close);

  if (method === "aggressive") {
    const mean = midpoint(candle.low, candle.high);
    return {
      low: candle.low,
      high: candle.high,
      mean,
    };
  }

  const baseLow = bodyLow;
  const baseHigh = bodyHigh;
  const mean = midpoint(baseLow, baseHigh);

  if (method === "mean_threshold") {
    return {
      low: mean,
      high: mean,
      mean,
    };
  }

  return {
    low: baseLow,
    high: baseHigh,
    mean,
  };
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

interface OrderBlockLifecycle {
  touchCount: number;
  lastTouchAt?: string;
  invalidatedAt?: string;
  status: "active" | "mitigated" | "invalidated";
}

const rangesOverlap = (
  a: { low: number; high: number },
  b: { low: number; high: number }
): boolean => !(a.high < b.low || a.low > b.high);

const evaluateOrderBlockLifecycle = (
  bars: ICTBar[],
  blockRange: { low: number; high: number },
  refined: { low: number; high: number } | undefined,
  startIndex: number,
  type: OrderBlockType
): OrderBlockLifecycle => {
  const observationRange = refined ?? blockRange;
  const invalidationLine = midpoint(blockRange.low, blockRange.high);
  let touchCount = 0;
  let lastTouchAt: string | undefined;
  let invalidatedAt: string | undefined;
  let status: OrderBlockLifecycle["status"] = "active";

  for (let i = startIndex + 1; i < bars.length; i += 1) {
    const bar = bars[i];
    const body = getBarBody(bar);
    const didTouch =
      body.low <= observationRange.high && body.high >= observationRange.low;
    if (didTouch) {
      touchCount += 1;
      lastTouchAt = bar.time;
      if (status === "active") {
        status = "mitigated";
      }
    }

    const invalidated =
      type === "demand" ? bar.close < invalidationLine : bar.close > invalidationLine;

    if (invalidated) {
      invalidatedAt = bar.time;
      status = "invalidated";
      break;
    }
  }

  return {
    touchCount,
    lastTouchAt,
    invalidatedAt,
    status,
  };
};

const determineOrderBlockClassification = (
  event: StructureEvent,
  type: OrderBlockType,
  zoneType: OrderBlockZone,
  existingBlocks: OrderBlock[],
  bars: ICTBar[]
): { classification: "origin" | "breaker" | "mitigation"; breakerParentTime?: string } => {
  let classification: "origin" | "breaker" | "mitigation" = "origin";
  let breakerParentTime: string | undefined;
  const eventBar = bars[event.barIndex];

  const lastOpposite = [...existingBlocks].reverse().find((block) => block.type !== type);
  if (eventBar && lastOpposite) {
    const baseLow = lastOpposite.refined?.low ?? lastOpposite.range.low;
    const baseHigh = lastOpposite.refined?.high ?? lastOpposite.range.high;
    const invalidationLine = midpoint(baseLow, baseHigh);
    const invalidatesOpposite =
      type === "demand"
        ? eventBar.close > invalidationLine
        : eventBar.close < invalidationLine;
    if (invalidatesOpposite) {
      classification = "breaker";
      breakerParentTime = lastOpposite.candleTime;
      lastOpposite.status = "invalidated";
      lastOpposite.invalidatedAt = eventBar.time;
      lastOpposite.isValid = false;
    }
  }

  if (classification === "origin") {
    if (event.type === "BOS" && zoneType === "sub") {
      classification = "mitigation";
    }
  }

  return { classification, breakerParentTime };
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
    if (!event.hasDisplacement || event.type === "Sweep") {
      continue;
    }
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
    const refinedRange = applyOrderBlockRefinement(candle, refinementMethod);

    const ageBars = Math.max(0, currentBarIndex - candleIndex);

    // Check validity based on age
    const { touchCount, lastTouchAt, invalidatedAt, status } = evaluateOrderBlockLifecycle(
      bars,
      { low: rangeLow, high: rangeHigh },
      refinedRange,
      candleIndex,
      type
    );
    const isValid = ageBars <= validityPeriod && status !== "invalidated";

    const { classification, breakerParentTime } = determineOrderBlockClassification(
      event,
      type,
      zoneType,
      results,
      bars
    );

    // Calculate score
    const recency = severityClamp(1 - ageBars / Math.max(25, bars.length));
    const proximity = severityClamp(1 - Math.abs(rangeMid - lastPrice) / Math.max(lastPrice, 1));
    const originWeight = event.type === "ChoCH" ? 1.15 : 0.95;
    const zoneWeight = zoneType === "main" ? 1.1 : 0.9;
    const refinedWeight =
      refinementMethod === "defensive"
        ? 1.05
        : refinementMethod === "mean_threshold"
          ? 1.1
          : 1.0;
    const validityWeight = isValid ? 1.0 : 0.5;
    const touchWeight = touchCount === 0 ? 1 : touchCount === 1 ? 0.85 : 0.65;
    const classificationWeight =
      classification === "breaker" ? 1.2 : classification === "mitigation" ? 0.85 : 1.0;

    const score =
      Math.round(
        (recency * 35 + proximity * 25 + originWeight * 25) *
          zoneWeight *
          refinedWeight *
          validityWeight *
          touchWeight *
          classificationWeight *
          100
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
        mean: refinedRange.mean,
      },
      ageBars,
      score,
      isValid,
      touchCount,
      lastTouchAt,
      invalidatedAt,
      status,
      classification,
      reclaimed: classification === "breaker",
      breakerParentTime,
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
      const gapWidth = Math.max(boundsHigh - boundsLow, 0);
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
        ce: midpoint(boundsLow, boundsHigh),
        touchCount: 0,
        filledRatio: 0,
        ageBars: Math.max(0, bars.length - (index + 1)),
        potency: 1,
      };

      let maxOverlap = 0;

      for (let j = index + 1; j < bars.length; j += 1) {
        const body = getBarBody(bars[j]);
        const overlapLow = Math.max(body.low, gap.bounds.low);
        const overlapHigh = Math.min(body.high, gap.bounds.high);
        const overlaps = overlapHigh > overlapLow;
        if (overlaps) {
          gap.touchCount += 1;
          gap.lastTouchAt = bars[j].time;
          if (!gap.firstTouchAt) {
            gap.firstTouchAt = bars[j].time;
          }
          const overlapWidth = overlapHigh - overlapLow;
          maxOverlap = Math.max(maxOverlap, overlapWidth);
          if (overlapWidth >= gapWidth) {
            gap.filled = true;
            break;
          }
        }
      }

      gap.filledRatio = gapWidth === 0 ? 1 : Math.min(1, maxOverlap / gapWidth);
      gap.potency = severityClamp(
        1 - gap.filledRatio - Math.max(0, gap.touchCount - 1) * 0.35
      );

      gaps.push(gap);
    }

    // Bearish gap
    if (prev.low > next.high) {
      const boundsLow = next.high;
      const boundsHigh = prev.low;
      const lowBound = Math.min(boundsLow, boundsHigh);
      const highBound = Math.max(boundsLow, boundsHigh);
      const gapWidth = Math.max(highBound - lowBound, 0);
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
          low: lowBound,
          high: highBound,
        },
        filled: false,
        ce: midpoint(lowBound, highBound),
        touchCount: 0,
        filledRatio: 0,
        ageBars: Math.max(0, bars.length - (index + 1)),
        potency: 1,
      };

      let maxOverlap = 0;

      for (let j = index + 1; j < bars.length; j += 1) {
        const body = getBarBody(bars[j]);
        const overlapLow = Math.max(body.low, gap.bounds.low);
        const overlapHigh = Math.min(body.high, gap.bounds.high);
        const overlaps = overlapHigh > overlapLow;
        if (overlaps) {
          gap.touchCount += 1;
          gap.lastTouchAt = bars[j].time;
          if (!gap.firstTouchAt) {
            gap.firstTouchAt = bars[j].time;
          }
          const overlapWidth = overlapHigh - overlapLow;
          maxOverlap = Math.max(maxOverlap, overlapWidth);
          if (overlapWidth >= gapWidth) {
            gap.filled = true;
            break;
          }
        }
      }

      gap.filledRatio = gapWidth === 0 ? 1 : Math.min(1, maxOverlap / gapWidth);
      gap.potency = severityClamp(
        1 - gap.filledRatio - Math.max(0, gap.touchCount - 1) * 0.35
      );

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
    majorCount: number;
    minorCount: number;
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
        majorCount: 0,
        minorCount: 0,
      };
      clusters.push(match);
    }

    match.count += 1;
    match.price = (match.price * (match.count - 1) + swing.price) / match.count;
    match.lastTime = swing.time;
    match.indices.push(swing.index);
    if (swing.strength === "major") {
      match.majorCount += 1;
    } else {
      match.minorCount += 1;
    }
  }

  return clusters
    .filter((cluster) => cluster.count >= 2)
    .sort((a, b) => a.indices[a.indices.length - 1] - b.indices[b.indices.length - 1])
    .map((cluster) => ({
      time: cluster.lastTime,
      price: Number(cluster.price.toFixed(4)),
      count: cluster.count,
      stackScore: cluster.count,
      source: cluster.majorCount >= cluster.minorCount ? "major" : "minor",
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
    stackScore: 1,
    classification: "external",
    source: swing.strength,
  }));
};

const buildLiquidityStacks = (
  levels: LiquidityLevel[],
  direction: "high" | "low",
  toleranceFraction: number
): LiquidityStack[] => {
  if (levels.length === 0) {
    return [];
  }

  const stacks: LiquidityStack[] = [];

  for (const level of levels) {
    let stack = stacks.find((candidate) =>
      withinTolerance(candidate.price, level.price, toleranceFraction)
    );
    if (!stack) {
      stack = {
        direction,
        price: level.price,
        strength: 0,
        members: [],
      };
      stacks.push(stack);
    }
    stack.members.push(level);
    stack.strength += level.stackScore ?? level.count ?? 1;
    stack.price =
      (stack.price * (stack.members.length - 1) + level.price) / stack.members.length;
  }

  return stacks;
};

interface LiquidityDetectionOptions {
  mode?: "static" | "dynamic" | "both";
  staticSensitivity?: number;
  dynamicSensitivity?: number;
  dealingRange?: DealingRange | null;
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
  relativeEqualHighs: LiquidityLevel[];
  relativeEqualLows: LiquidityLevel[];
  stacks: LiquidityStack[];
} => {
  const mode = options?.mode ?? "both";
  const staticSensitivity = options?.staticSensitivity ?? 0.3;
  const dynamicSensitivity = options?.dynamicSensitivity ?? 1.0;
  const dealingRange = options?.dealingRange;

  let equalHighs: LiquidityLevel[] = [];
  let equalLows: LiquidityLevel[] = [];

  const classifyLevel = (
    price: number,
    direction: "high" | "low",
    defaultClassification: LiquidityLevel["classification"] = "internal"
  ): LiquidityLevel["classification"] => {
    if (defaultClassification === "relative") {
      return defaultClassification;
    }
    if (!dealingRange) {
      return defaultClassification ?? "internal";
    }
    const span = dealingRange.high - dealingRange.low;
    if (span <= 0) {
      return defaultClassification ?? "internal";
    }
    const margin = span * 0.12;
    if (direction === "high" && price >= dealingRange.high - margin) {
      return "external";
    }
    if (direction === "low" && price <= dealingRange.low + margin) {
      return "external";
    }
    return defaultClassification ?? "internal";
  };

  const annotateLevels = (
    raw: LiquidityLevel[],
    direction: "high" | "low",
    classificationHint?: LiquidityLevel["classification"]
  ): LiquidityLevel[] =>
    raw.map((level) => ({
      ...level,
      classification: classifyLevel(level.price, direction, classificationHint ?? level.classification),
    }));

  // Static liquidity: Uses major swings with static tolerance
  if (mode === "static" || mode === "both") {
    const majorHighs = swings.highs.filter((swing) => swing.strength === "major");
    const majorLows = swings.lows.filter((swing) => swing.strength === "major");

    const staticHighs = annotateLevels(
      buildLiquidityClusters(majorHighs, toleranceFraction * staticSensitivity),
      "high"
    );
    const staticLows = annotateLevels(
      buildLiquidityClusters(majorLows, toleranceFraction * staticSensitivity),
      "low"
    );

    equalHighs = [...equalHighs, ...staticHighs];
    equalLows = [...equalLows, ...staticLows];
  }

  // Dynamic liquidity: Uses minor swings with adaptive tolerance
  if (mode === "dynamic" || mode === "both") {
    const minorHighs = swings.highs.filter((swing) => swing.strength === "minor");
    const minorLows = swings.lows.filter((swing) => swing.strength === "minor");

    const dynamicHighs = annotateLevels(
      buildLiquidityClusters(minorHighs, toleranceFraction * dynamicSensitivity),
      "high"
    );
    const dynamicLows = annotateLevels(
      buildLiquidityClusters(minorLows, toleranceFraction * dynamicSensitivity),
      "low"
    );

    equalHighs = [...equalHighs, ...dynamicHighs];
    equalLows = [...equalLows, ...dynamicLows];
  }

  // Remove duplicates and sort
  const deduplicateLevels = (
    levels: LiquidityLevel[],
    direction: "high" | "low"
  ): LiquidityLevel[] => {
    const map = new Map<string, LiquidityLevel>();
    levels.forEach((level) => {
      const key = level.price.toFixed(4);
      const existing = map.get(key);
      if (!existing || level.count > existing.count) {
        map.set(key, {
          ...level,
          classification: classifyLevel(level.price, direction, level.classification),
        });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      toTimeZoneDate(a.time).getTime() - toTimeZoneDate(b.time).getTime()
    );
  };

  equalHighs = deduplicateLevels(equalHighs, "high");
  equalLows = deduplicateLevels(equalLows, "low");

  const majorHighs = swings.highs.filter((swing) => swing.strength === "major");
  const majorLows = swings.lows.filter((swing) => swing.strength === "major");

  const externalHighs = annotateLevels(
    buildExternalLiquidity(majorHighs, 3, "high"),
    "high",
    "external"
  );
  const externalLows = annotateLevels(
    buildExternalLiquidity(majorLows, 3, "low"),
    "low",
    "external"
  );

  const trim = (levels: LiquidityLevel[], limit: number) =>
    levels.slice(Math.max(0, levels.length - limit));

  const relativeHighs = annotateLevels(
    buildLiquidityClusters(swings.highs, toleranceFraction * 1.5),
    "high",
    "relative"
  );
  const relativeLows = annotateLevels(
    buildLiquidityClusters(swings.lows, toleranceFraction * 1.5),
    "low",
    "relative"
  );

  const relativeEqualHighs = trim(deduplicateLevels(relativeHighs, "high"), 15);
  const relativeEqualLows = trim(deduplicateLevels(relativeLows, "low"), 15);

  const stackInputsHigh = [
    ...equalHighs,
    ...relativeEqualHighs,
    ...externalHighs,
  ];
  const stackInputsLow = [
    ...equalLows,
    ...relativeEqualLows,
    ...externalLows,
  ];

  const stacks = [
    ...buildLiquidityStacks(stackInputsHigh, "high", toleranceFraction * 0.8),
    ...buildLiquidityStacks(stackInputsLow, "low", toleranceFraction * 0.8),
  ]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10);

  return {
    equalHighs: trim(equalHighs, 15),
    equalLows: trim(equalLows, 15),
    externalHighs,
    externalLows,
    relativeEqualHighs,
    relativeEqualLows,
    stacks,
  };
};

interface SMTDetectionOptions {
  window?: number;
  tolerancePct?: number;
  primarySymbol: string;
}

export const detectSMTSignals = (
  primary: ICTBar[],
  comparativeSeries: Record<string, ICTBar[]>,
  options?: SMTDetectionOptions
): SMTSignal[] => {
  if (primary.length === 0 || Object.keys(comparativeSeries).length === 0) {
    return [];
  }

  const window = Math.max(5, options?.window ?? 20);
  const tolerancePct = options?.tolerancePct ?? 0.0005;
  const signals: SMTSignal[] = [];

  for (const [symbol, series] of Object.entries(comparativeSeries)) {
    if (!Array.isArray(series) || series.length === 0) {
      continue;
    }
    const comparativeByTime = new Map(series.map((bar) => [bar.time, bar]));
    const aligned = primary
      .map((bar) => {
        const comparative = comparativeByTime.get(bar.time);
        return comparative ? { primary: bar, comparative } : null;
      })
      .filter((entry): entry is { primary: ICTBar; comparative: ICTBar } => Boolean(entry));

    for (let i = window; i < aligned.length; i += 1) {
      const lookbackStart = Math.max(0, i - window);
      const history = aligned.slice(lookbackStart, i);
      if (history.length === 0) {
        continue;
      }

      const primaryPrevHigh = Math.max(...history.map((item) => item.primary.high));
      const primaryPrevLow = Math.min(...history.map((item) => item.primary.low));
      const comparativePrevHigh = Math.max(...history.map((item) => item.comparative.high));
      const comparativePrevLow = Math.min(...history.map((item) => item.comparative.low));

      const latest = aligned[i];
      const primaryHighBreak = latest.primary.high > primaryPrevHigh * (1 + tolerancePct);
      const comparativeHighBreak =
        latest.comparative.high > comparativePrevHigh * (1 + tolerancePct);
      const primaryLowBreak = latest.primary.low < primaryPrevLow * (1 - tolerancePct);
      const comparativeLowBreak =
        latest.comparative.low < comparativePrevLow * (1 - tolerancePct);

      const addSignal = (
        direction: "bullish" | "bearish",
        basis: "high" | "low",
        note: string
      ) => {
        const primaryPrice = basis === "high" ? latest.primary.high : latest.primary.low;
        const comparativePrice =
          basis === "high" ? latest.comparative.high : latest.comparative.low;
        const strength = severityClamp(distancePct(primaryPrice, comparativePrice) * 50, 0, 3);
        signals.push({
          timestamp: latest.primary.time,
          primarySymbol: options?.primarySymbol ?? "",
          comparativeSymbol: symbol,
          direction,
          basis,
          strength,
          primaryPrice,
          comparativePrice,
          note,
        });
      };

      if (primaryHighBreak && !comparativeHighBreak) {
        addSignal(
          "bearish",
          "high",
          `${options?.primarySymbol ?? "primary"} ran buy-side while ${symbol} withheld.`
        );
      } else if (!primaryHighBreak && comparativeHighBreak) {
        addSignal(
          "bearish",
          "high",
          `${symbol} broke highs without ${options?.primarySymbol ?? "primary"} confirmation.`
        );
      }

      if (primaryLowBreak && !comparativeLowBreak) {
        addSignal(
          "bullish",
          "low",
          `${options?.primarySymbol ?? "primary"} swept sell-side alone versus ${symbol}.`
        );
      } else if (!primaryLowBreak && comparativeLowBreak) {
        addSignal(
          "bullish",
          "low",
          `${symbol} broke lows while ${options?.primarySymbol ?? "primary"} held higher.`
        );
      }
    }
  }

  return signals.slice(-20);
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

  const activeZones = sessionKillZones[session] ?? sessionKillZones.NY;
  const allKillZones: KillZone[] = [];

  // Find all unique trading days in the data
  const uniqueDays = new Set<string>();
  for (const bar of bars) {
    const barDate = toTimeZoneDate(bar.time, ICT_TIME_ZONE);
    const dateKey = `${barDate.getFullYear()}-${String(barDate.getMonth() + 1).padStart(2, '0')}-${String(barDate.getDate()).padStart(2, '0')}`;
    uniqueDays.add(dateKey);
  }

  // Get current time for active status
  const lastBar = bars[bars.length - 1];
  const currentBarDate = toTimeZoneDate(lastBar.time, ICT_TIME_ZONE);

  // Always include today's kill zones even if we don't have data for today yet
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  uniqueDays.add(todayKey);

  // Also include the last bar's day to ensure we always show recent zones
  const lastBarDate = toTimeZoneDate(lastBar.time, ICT_TIME_ZONE);
  const lastBarKey = `${lastBarDate.getFullYear()}-${String(lastBarDate.getMonth() + 1).padStart(2, '0')}-${String(lastBarDate.getDate()).padStart(2, '0')}`;
  uniqueDays.add(lastBarKey);

  // Sort days and only keep the most recent 5 trading days to avoid overwhelming overlap
  const sortedDays = Array.from(uniqueDays).sort();
  const recentDays = sortedDays.slice(-5);

  // Generate kill zones for each of the recent days
  for (const dateKey of recentDays) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const dateForDay = new Date(year, month - 1, day);

    for (const zone of activeZones) {
      const startString = makeNyDateString(dateForDay, zone.startHour, zone.startMinute);
      const endString = makeNyDateString(dateForDay, zone.endHour, zone.endMinute);

      const startDate = toTimeZoneDate(startString, ICT_TIME_ZONE);
      const endDate = toTimeZoneDate(endString, ICT_TIME_ZONE);

      // Check if current time is within this kill zone
      const active = currentBarDate >= startDate && currentBarDate <= endDate;

      allKillZones.push({
        name: zone.name,
        start: startString,
        end: endString,
        active,
      });
    }
  }

  return { killZones: allKillZones };
};
