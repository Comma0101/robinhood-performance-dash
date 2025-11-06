import { ICTBar } from "./types";

export const ICT_TIME_ZONE = "America/New_York";

const pad = (value: number): string => value.toString().padStart(2, "0");
export const padNumber = (value: number): string => pad(value);

export const toTimeZoneDate = (
  timestamp: string,
  timeZone: string = ICT_TIME_ZONE
): Date => {
  if (!timestamp) {
    return new Date(NaN);
  }

  const [datePart, timePart = "00:00:00"] = timestamp.trim().split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(":").map(Number);

  const baseUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const baseDate = new Date(baseUtc);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(baseDate);
  const mapped: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      mapped[part.type] = part.value;
    }
  }

  const actual = Date.UTC(
    Number(mapped.year),
    Number(mapped.month) - 1,
    Number(mapped.day),
    Number(mapped.hour),
    Number(mapped.minute),
    Number(mapped.second)
  );

  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = desired - actual;

  return new Date(baseDate.getTime() + offset);
};

export const formatAsNyString = (date: Date): string => {
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  const second = pad(date.getUTCSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

const nyDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ICT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface NyDateParts {
  year: number;
  month: number;
  day: number;
}

export const getNyDateParts = (date: Date): NyDateParts => {
  const parts = nyDateFormatter.formatToParts(date);
  const mapped: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      mapped[part.type] = part.value;
    }
  }
  return {
    year: Number(mapped.year),
    month: Number(mapped.month),
    day: Number(mapped.day),
  };
};

export const makeNyDateString = (
  reference: Date,
  hour: number,
  minute: number,
  second = 0
): string => {
  const { year, month, day } = getNyDateParts(reference);
  return [
    `${year}-${padNumber(month)}-${padNumber(day)}`,
    `${padNumber(hour)}:${padNumber(minute)}:${padNumber(second)}`,
  ].join(" ");
};

export const cloneBars = (bars: ICTBar[]): ICTBar[] =>
  bars.map((bar) => ({ ...bar }));

export const sortBarsAscending = (bars: ICTBar[]): ICTBar[] =>
  cloneBars(bars).sort(
    (a, b) => toTimeZoneDate(a.time).getTime() - toTimeZoneDate(b.time).getTime()
  );

export const takeRecentBars = (bars: ICTBar[], lookback?: number): ICTBar[] => {
  if (!lookback || lookback <= 0) {
    return sortBarsAscending(bars);
  }
  const sorted = sortBarsAscending(bars);
  return sorted.slice(Math.max(0, sorted.length - lookback));
};

export const getBarBody = (bar: ICTBar): { low: number; high: number } => {
  const low = Math.min(bar.open, bar.close);
  const high = Math.max(bar.open, bar.close);
  return { low, high };
};

export const midpoint = (low: number, high: number): number => (low + high) / 2;

export const safeDivide = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

export const distancePct = (a: number, b: number): number =>
  Math.abs(a - b) / ((Math.abs(a) + Math.abs(b)) / 2 || 1);

export const withinTolerance = (
  a: number,
  b: number,
  toleranceFraction: number
): boolean => distancePct(a, b) <= toleranceFraction;

export const maxBy = <T>(
  items: T[],
  selector: (item: T) => number
): T | null => {
  if (items.length === 0) {
    return null;
  }
  let best = items[0];
  let bestValue = selector(best);
  for (let i = 1; i < items.length; i += 1) {
    const value = selector(items[i]);
    if (value > bestValue) {
      bestValue = value;
      best = items[i];
    }
  }
  return best;
};

export const minBy = <T>(
  items: T[],
  selector: (item: T) => number
): T | null => {
  if (items.length === 0) {
    return null;
  }
  let best = items[0];
  let bestValue = selector(best);
  for (let i = 1; i < items.length; i += 1) {
    const value = selector(items[i]);
    if (value < bestValue) {
      bestValue = value;
      best = items[i];
    }
  }
  return best;
};

export const severityClamp = (value: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, value));
