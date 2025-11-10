import { ICTAnalysis } from "./types";
import { ICT_TIME_ZONE, toTimeZoneDate } from "./utils";

export type BiasDirection = "long" | "short";
export type BiasGrade = "A" | "B" | "C";

export type SessionWindow = "NY_AM" | "NY_PM" | "LONDON" | "ASIAN" | "OFF";

export interface BiasSelectorInput {
  dailyDraw?: BiasDirection | null;
  fourHourDraw?: BiasDirection | null;
  fifteenMinuteBias?: BiasDirection | null;
  fifteenMinuteConfirmed?: boolean;
  fifteenMinutePdPercent?: number | null;
  fiveMinuteBias?: BiasDirection | null;
  fiveMinuteZoneAligned?: boolean;
  oneMinuteMssConfirmed?: boolean;
  sessionWindow?: SessionWindow;
}

export interface BiasSelectorResult {
  bias: BiasDirection | "skip";
  counterTrend: boolean;
  grade: BiasGrade;
  score: number;
  sessionFit: "preferred" | "ok" | "off";
  needsOneMinuteConfirmation: boolean;
  rationale: string[];
  checklist: {
    dailyDraw?: BiasDirection | null;
    fourHourDraw?: BiasDirection | null;
    fifteenMinuteBias?: BiasDirection | null;
    fiveMinuteBias?: BiasDirection | null;
    sessionWindow: SessionWindow;
  };
  status: "ready" | "wait" | "skip";
}

const preferredSessions = new Set<SessionWindow>(["NY_AM", "NY_PM"]);

const toSessionFit = (session?: SessionWindow): "preferred" | "ok" | "off" => {
  if (!session) return "off";
  if (preferredSessions.has(session)) return "preferred";
  if (session === "LONDON") return "ok";
  return "off";
};

const gradeFromScore = (score: number): BiasGrade => {
  if (score >= 4) return "A";
  if (score >= 2) return "B";
  return "C";
};

const normalizeDraw = (value?: BiasDirection | null): BiasDirection | null => {
  if (value === "long" || value === "short") {
    return value;
  }
  return null;
};

const tallyHtfDraw = (daily?: BiasDirection | null, fourHour?: BiasDirection | null): BiasDirection | null => {
  const votes = [normalizeDraw(daily), normalizeDraw(fourHour)].filter(
    (value): value is BiasDirection => Boolean(value)
  );
  if (votes.length === 0) {
    return null;
  }
  const longVotes = votes.filter((vote) => vote === "long").length;
  const shortVotes = votes.length - longVotes;
  if (longVotes === shortVotes) {
    return null;
  }
  return longVotes > shortVotes ? "long" : "short";
};

export const selectBias = (input: BiasSelectorInput): BiasSelectorResult => {
  const sessionWindow = input.sessionWindow ?? "OFF";
  const sessionFit = toSessionFit(sessionWindow);
  const htfConsensus = tallyHtfDraw(input.dailyDraw, input.fourHourDraw);
  const fifteenBias = normalizeDraw(input.fifteenMinuteBias);
  const rationale: string[] = [];

  if (!fifteenBias || !input.fifteenMinuteConfirmed) {
    if (!fifteenBias) {
      rationale.push("15m bias unavailable — skip");
    } else {
      rationale.push("15m BOS/ChoCH without displacement — wait");
    }
    return {
      bias: "skip",
      counterTrend: false,
      grade: "C",
      score: 0,
      sessionFit,
      needsOneMinuteConfirmation: true,
      rationale,
      checklist: {
        dailyDraw: normalizeDraw(input.dailyDraw),
        fourHourDraw: normalizeDraw(input.fourHourDraw),
        fifteenMinuteBias: fifteenBias,
        fiveMinuteBias: normalizeDraw(input.fiveMinuteBias),
        sessionWindow,
      },
      status: "skip",
    };
  }

  let score = 0;
  let counterTrend = false;

  if (htfConsensus) {
    if (htfConsensus === fifteenBias) {
      score += 2;
      rationale.push("Daily/4H draw aligned with 15m bias");
    } else {
      counterTrend = true;
      score -= 1;
      rationale.push("Countertrend vs. Daily/4H draw");
    }
  } else if (input.dailyDraw || input.fourHourDraw) {
    rationale.push("HTF draw mixed — treat as reduced size");
  }

  if (typeof input.fifteenMinutePdPercent === "number") {
    const pd = input.fifteenMinutePdPercent;
    const pdRounded = Math.round(pd);
    const inDiscount = pd < 50;
    const inPremium = pd > 50;
    if (fifteenBias === "long" && inDiscount) {
      score += 1;
      rationale.push(`Long idea anchored in discount (PD% ${pdRounded}%)`);
    } else if (fifteenBias === "short" && inPremium) {
      score += 1;
      rationale.push(`Short idea anchored in premium (PD% ${pdRounded}%)`);
    } else if (pdRounded === 50) {
      rationale.push(`PD% at EQ (50%) — location neutral`);
    } else {
      score -= 1;
      rationale.push(`Bias fighting PD% location (PD% ${pdRounded}%)`);
    }
  }

  const fiveMinuteBias = normalizeDraw(input.fiveMinuteBias);
  if (fiveMinuteBias) {
    if (fiveMinuteBias === fifteenBias) {
      score += input.fiveMinuteZoneAligned ? 2 : 1;
      rationale.push(
        input.fiveMinuteZoneAligned
          ? "5m zone ready in direction of 15m bias"
          : "5m structure supportive but zone not tapped"
      );
    } else {
      score -= 1;
      rationale.push("5m disagrees with 15m — patience");
    }
  } else {
    rationale.push("5m structure unavailable");
  }

  const needsOneMinuteConfirmation = !input.oneMinuteMssConfirmed;
  if (input.oneMinuteMssConfirmed) {
    score += 1;
    rationale.push("1m MSS confirmed in zone");
  } else {
    rationale.push("Waiting for 1m MSS inside zone");
  }

  if (sessionFit === "preferred") {
    score += 1;
    rationale.push("Inside preferred kill zone");
  } else if (sessionFit === "off") {
    score -= 1;
    rationale.push("Outside preferred kill zones");
  } else {
    rationale.push("London session — OK if liquidity aligns");
  }

  const grade = gradeFromScore(score);
  const status = needsOneMinuteConfirmation ? "wait" : "ready";

  return {
    bias: fifteenBias,
    counterTrend,
    grade,
    score,
    sessionFit,
    needsOneMinuteConfirmation,
    rationale,
    checklist: {
      dailyDraw: normalizeDraw(input.dailyDraw),
      fourHourDraw: normalizeDraw(input.fourHourDraw),
      fifteenMinuteBias: fifteenBias,
      fiveMinuteBias,
      sessionWindow,
    },
    status,
  };
};

export const deriveSessionWindow = (
  analysis: ICTAnalysis,
  now = new Date()
): SessionWindow => {
  const killZones = analysis.sessions?.killZones ?? [];
  if (killZones.length === 0) {
    return "OFF";
  }

  const tz = analysis.meta.exchangeTZ ?? ICT_TIME_ZONE;
  const nowTime = now.getTime();
  for (const zone of killZones) {
    const start = toTimeZoneDate(zone.start, tz);
    const end = toTimeZoneDate(zone.end, tz);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      continue;
    }
    if (nowTime >= start.getTime() && nowTime <= end.getTime()) {
      if (zone.name.includes("NY AM")) return "NY_AM";
      if (zone.name.includes("NY PM")) return "NY_PM";
      if (zone.name.includes("London")) return "LONDON";
      if (zone.name.includes("Asian")) return "ASIAN";
    }
  }
  return "OFF";
};
