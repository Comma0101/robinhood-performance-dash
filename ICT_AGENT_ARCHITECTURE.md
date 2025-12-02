# ICT Agent System Architecture

## 📋 Overview

This document outlines the complete architecture for an **ICT (Inner Circle Trader) Agent System** that automates the professional trading routine used by funded traders. The system provides:

- **Pre-Market Analysis** (6:00-9:30 AM ET) - Automated top-down bias generation
- **Live Kill Zone Monitoring** (During trading sessions) - Real-time entry detection
- **Post-Market Journaling** (After 4:00 PM ET) - Performance tracking and insights
- **AI Trading Coach** - Contextual guidance throughout the day

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ICT Agent System                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Pre-Market      │  │  Kill Zone       │  │  Post-Market │  │
│  │  Analyzer        │  │  Monitor         │  │  Journal     │  │
│  │  (6-9:30 AM)     │  │  (Live Trading)  │  │  (After 4PM) │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬──────┘  │
│           │                     │                      │          │
│           └─────────────────────┼──────────────────────┘          │
│                                 │                                  │
│                        ┌────────▼────────┐                        │
│                        │  ICT Knowledge   │                        │
│                        │     Engine       │                        │
│                        │  (Core Logic)    │                        │
│                        └────────┬─────────┘                        │
│                                 │                                  │
│         ┌───────────────────────┼───────────────────────┐         │
│         │                       │                       │         │
│  ┌──────▼──────┐         ┌─────▼──────┐         ┌─────▼──────┐  │
│  │ Market Data │         │ Pattern DB │         │ Trade Log  │  │
│  │   Service   │         │  (History) │         │ (Journal)  │  │
│  └─────────────┘         └────────────┘         └────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              AI Trading Coach (GPT Integration)            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Core Components

### 1. Pre-Market Analyzer (6:00-9:30 AM ET)

**Purpose:** Generate automated daily bias report using top-down ICT analysis

#### A. Higher Timeframe Bias Scanner

**Input:**
- Symbol (e.g., "NQ", "ES", "AAPL")
- Current date/time

**Process:**
1. Fetch multi-timeframe ICT analysis (Daily, 4H, 1H)
2. Determine bias from market structure (BOS/ChoCH)
3. Calculate dealing range and PD%
4. Identify PD Arrays (FVGs, Order Blocks)
5. Map liquidity targets
6. Synthesize directional consensus

**Output:**
```typescript
interface HTFBiasAnalysis {
  timestamp: string;
  symbol: string;

  daily: {
    bias: "bullish" | "bearish" | "neutral";
    lastMSS: { type: "bos" | "choch"; price: number; time: string };
    dealingRange: {
      high: number;
      low: number;
      eq: number;
      pdPercent: number; // Current price position
    };
    pdArrays: {
      fvgs: Array<{
        type: "bullish" | "bearish";
        bounds: [number, number];
        potency: number; // 0-100
      }>;
      orderBlocks: Array<{
        type: "bullish" | "bearish";
        price: number;
        origin: "breaker" | "mitigation" | "breakaway";
        score: number;
      }>;
    };
    liquidity: {
      high: number; // Previous day high
      low: number;  // Previous day low
      targets: Array<{
        type: "buy" | "sell";
        price: number;
        description: string; // "Weekly high", "Monthly high"
      }>;
    };
  };

  fourHour: {
    // Same structure as daily
  };

  oneHour: {
    // Same structure as daily
  };

  consensus: {
    direction: "bullish" | "bearish" | "neutral";
    confidence: number; // 0-100
    keyLevels: Array<{
      type: "support" | "resistance" | "liquidity";
      price: number;
      description: string;
    }>;
    scenario: string; // Natural language summary
    // e.g., "Daily bullish bias, 4H in discount seeking 1H FVG entry to 19850 target"
  };
}
```

#### B. Liquidity Mapper

**Purpose:** Identify key liquidity levels for the trading day

**Data Sources:**
- Asian session price action (previous 8 hours)
- Previous day high/low
- Weekly/monthly levels
- Internal liquidity (equal highs/lows)

**Output:**
```typescript
interface LiquidityMap {
  date: string;
  symbol: string;

  // Session-based liquidity
  asianSession: {
    high: number;
    low: number;
    range: number;
  };

  // Previous timeframe levels
  previousDay: {
    high: number;
    low: number;
    open: number;
    close: number;
  };

  previousWeek: {
    high: number;
    low: number;
  };

  // Dealing range for the day
  dealingRange: {
    high: number;      // Upper bound
    low: number;       // Lower bound
    premium: number;   // 61.8% level
    discount: number;  // 38.2% level
    eq: number;        // 50% equilibrium
  };

  // Internal liquidity pockets
  internalLiquidity: Array<{
    type: "equal_highs" | "equal_lows" | "swing_high" | "swing_low";
    price: number;
    count: number;        // How many times tested
    lastTested: string;   // ISO timestamp
  }>;

  // New York levels (if applicable)
  newYork: {
    midnight: { open: number };
    openingBell: { open: number };
  };
}
```

#### C. Pre-Market Report Generator

**Purpose:** Synthesize analysis into actionable trading plan

**Output:**
```typescript
interface PreMarketReport {
  id: string;
  generatedAt: string;
  symbol: string;
  date: string;

  // Analysis components
  bias: HTFBiasAnalysis;
  liquidity: LiquidityMap;

  // Trading plan
  plan: {
    direction: "long" | "short" | "wait";
    confidence: number; // 0-100

    entryZones: Array<{
      price: number;
      type: "fvg" | "order_block" | "breaker" | "consequent_encroachment";
      confluence: string[]; // List of supporting factors
      priority: number; // 1 = highest
    }>;

    invalidation: number; // Price level that invalidates bias

    targets: Array<{
      price: number;
      type: "liquidity" | "fvg_fill" | "dealing_range_eq";
      rMultiple: number; // Risk multiple
    }>;

    sessionFocus: "london" | "ny_am" | "ny_pm";

    riskManagement: {
      maxRiskPerTrade: number; // e.g., 1% of account
      suggestedStopDistance: number; // Points/pips
      suggestedPositionSize: number;
    };
  };

  // Market context
  macroContext: {
    news: Array<{
      time: string;
      event: string;
      impact: "high" | "medium" | "low";
      forecast?: string;
    }>;
    dxy: {
      trend: "bullish" | "bearish" | "neutral";
      level: number;
    };
    correlations: {
      spx: number; // Correlation coefficient
      vix: number;
    };
  };

  // Warnings/notes
  warnings: string[];
  notes: string;
}
```

**API Endpoint:**
```typescript
// GET /api/ict/pre-market-report?symbol=NQ&date=2025-01-15
async function generatePreMarketReport(
  symbol: string,
  date: string
): Promise<PreMarketReport>
```

---

### 2. Kill Zone Monitor (Live Trading)

**Purpose:** Real-time detection of ICT entry models during optimal trading windows

#### A. Session Manager

**Kill Zones:**
```typescript
interface KillZone {
  name: "london" | "ny_am" | "ny_pm";
  start: string; // "02:00" ET
  end: string;   // "05:00" ET
  active: boolean;
  priority: number; // 1 = highest (NY AM is priority 1)
  description: string;
}

const KILL_ZONES: KillZone[] = [
  {
    name: "london",
    start: "02:00",
    end: "05:00",
    active: false,
    priority: 2,
    description: "London session - sets liquidity traps"
  },
  {
    name: "ny_am",
    start: "08:30",
    end: "11:00",
    active: false,
    priority: 1,
    description: "New York AM - core execution window"
  },
  {
    name: "ny_pm",
    start: "13:30",
    end: "15:00",
    active: false,
    priority: 2,
    description: "New York PM - rebalancing/reversal window"
  }
];
```

**Dead Zones (No Trading):**
- 11:00 AM - 1:30 PM ET (Lunch consolidation)
- After 4:00 PM ET (After hours)
- Before 2:00 AM ET (Pre-London)

#### B. Entry Model Detector

**ICT Entry Models:**
1. **Liquidity Sweep + FVG Entry**
   - Price sweeps liquidity (PDH/PDL, Asian high/low)
   - MSS confirmed on 1m/5m
   - FVG forms in direction of bias
   - Entry at FVG 50% or CE (consequent encroachment)

2. **Order Block Mitigation**
   - Price returns to HTF order block
   - MSS confirmed
   - Entry at OB open price
   - Stop below OB

3. **Breaker Block**
   - Previous support becomes resistance (or vice versa)
   - Price returns to breaker
   - MSS confirmed
   - Entry at breaker mitigation

**Detection Process:**
```typescript
interface EntrySetup {
  id: string;
  timestamp: string;
  symbol: string;

  model: "liquidity_sweep_fvg" | "ob_mitigation" | "breaker" | "optimal_trade_entry";
  confidence: number; // 0-100

  trigger: {
    // Step 1: Liquidity grab
    liquidityGrabbed: {
      type: "pdh" | "pdl" | "asian_high" | "asian_low" | "equal_highs" | "equal_lows";
      price: number;
      time: string;
    } | null;

    // Step 2: Market Structure Shift
    mssConfirmed: {
      timeframe: "1min" | "5min" | "15min";
      type: "bos" | "choch";
      price: number;
      time: string;
    } | null;

    // Step 3: PD Array entry
    pdArray: {
      type: "fvg" | "order_block" | "breaker";
      price: number;
      bounds?: [number, number]; // For FVGs
      details: any;
    } | null;
  };

  // Trade parameters
  entry: {
    price: number;
    method: "limit" | "market" | "stop";
    notes: string;
  };

  stop: {
    price: number;
    reason: string; // "Below 5m OB", "Below MSS"
  };

  targets: Array<{
    price: number;
    rMultiple: number;
    type: "liquidity" | "fvg_fill" | "dealing_range_eq" | "ob";
    partialPercent?: number; // e.g., 50 for 50%
  }>;

  // Risk calculation
  risk: {
    points: number;      // Distance from entry to stop
    dollars: number;     // Based on position size
    riskPercent: number; // Percent of account
  };

  // Confluence factors
  confluence: string[];

  // Quality score
  setupQuality: number; // 1-10

  // Warnings
  warnings: string[];
}
```

**API Endpoint:**
```typescript
// GET /api/ict/detect-setup?symbol=NQ
// Returns current setup if detected, null otherwise
async function detectEntrySetup(
  symbol: string,
  bias: "bullish" | "bearish",
  liquidityMap: LiquidityMap
): Promise<EntrySetup | null>
```

#### C. Real-Time Alert System

**Alert Types:**
```typescript
interface Alert {
  id: string;
  timestamp: string;
  symbol: string;
  priority: "critical" | "high" | "medium" | "low";
  type:
    | "session_start"      // Kill zone opening
    | "session_end"        // Kill zone closing
    | "liquidity_sweep"    // Liquidity grabbed
    | "mss_detected"       // Structure shift
    | "setup_forming"      // Entry model developing
    | "setup_ready"        // Entry signal
    | "setup_invalidated"  // Setup no longer valid
    | "target_hit"         // Price reached target
    | "stop_approached";   // Price near stop

  message: string;
  data: any;

  // Notification channels
  channels: ("app" | "email" | "sms" | "discord")[];
}
```

**Alert Rules:**
- **Session Start:** 5 minutes before kill zone opens
- **Liquidity Sweep:** Immediately when detected
- **MSS Detected:** When 1m/5m structure shifts
- **Setup Forming:** When 2/3 conditions met
- **Setup Ready:** When all conditions met (CRITICAL priority)
- **Setup Invalidated:** When price breaks invalidation level

**WebSocket Stream:**
```typescript
// Real-time alert stream
ws://api/ict/alerts?symbol=NQ&session=user_id

// Message format:
{
  type: "alert",
  data: Alert
}
```

---

### 3. Post-Market Journal (After 4 PM ET)

**Purpose:** Automated performance tracking and insight generation

#### A. Trade Execution Logger

```typescript
interface TradeExecution {
  id: string;
  symbol: string;
  date: string;

  // Pre-trade planning
  preMarketBias: "bullish" | "bearish" | "neutral";
  plannedEntry: number;
  plannedStop: number;
  plannedTargets: number[];

  // Actual execution
  actualBias: "bullish" | "bearish" | "neutral"; // Market's actual behavior
  biasAccurate: boolean;

  setup: {
    model: string;
    session: "london" | "ny_am" | "ny_pm";
    killZoneActive: boolean;
    confluence: string[];
    setupQuality: number; // 1-10 (at entry)
  };

  execution: {
    entryTime: string;
    entryPrice: number;
    exitTime: string;
    exitPrice: number;

    // Partials
    partials: Array<{
      time: string;
      price: number;
      percent: number; // % of position closed
      pnl: number;
    }>;

    // Final metrics
    grossPnl: number;
    netPnl: number; // After fees
    rMultiple: number; // Actual R achieved
    holdTime: number; // Minutes
    maxAdverseExcursion: number; // MAE
    maxFavorableExcursion: number; // MFE
  };

  // Performance assessment
  performance: {
    executionQuality: "excellent" | "good" | "fair" | "poor";
    executionNotes: string;

    // Discipline metrics
    emotionalDeviation: number; // 0-5 (0 = perfect discipline)
    ruleViolations: string[]; // e.g., ["Entered outside kill zone", "Ignored invalidation"]

    // Trade grade
    overallGrade: "A+" | "A" | "B" | "C" | "D" | "F";
    gradeReason: string;
  };

  // Post-trade reflection
  reflection: {
    whatWorked: string;
    whatDidntWork: string;
    mistakes: string[];
    lessonsLearned: string;
    improvementAreas: string[];
  };

  // Media
  screenshots: Array<{
    type: "entry" | "exit" | "target" | "annotated_chart";
    url: string;
    timestamp: string;
  }>;

  // Tags for filtering
  tags: string[]; // e.g., ["fvg_entry", "ny_am", "high_quality", "emotional_entry"]
}
```

**API Endpoints:**
```typescript
// POST /api/ict/trades
async function logTrade(trade: TradeExecution): Promise<void>

// GET /api/ict/trades?date=2025-01-15
async function getTradesForDay(date: string): Promise<TradeExecution[]>

// GET /api/ict/trades?startDate=2025-01-01&endDate=2025-01-31
async function getTradesForRange(start: string, end: string): Promise<TradeExecution[]>
```

#### B. Daily Metrics Tracker

```typescript
interface DailyMetrics {
  date: string;

  // Bias accuracy
  biasAnalysis: {
    preMarketBias: "bullish" | "bearish" | "neutral";
    actualBias: "bullish" | "bearish" | "neutral";
    accurate: boolean;
    confidence: number; // Pre-market confidence level
  };

  // Trade statistics
  trades: {
    total: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number; // Percentage
  };

  // Financial metrics
  pnl: {
    gross: number;
    net: number;
    largest: number;
    smallest: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number; // Gross profit / Gross loss
  };

  // Setup quality
  setups: {
    avgQuality: number; // Average setup quality score (1-10)
    avgConfluence: number; // Average confluence factors per trade
    bestSetup: string; // ID of best setup
    worstSetup: string; // ID of worst setup
  };

  // Execution quality
  execution: {
    avgExecutionQuality: number; // 1-4 scale
    perfectExecutions: number; // Count of "excellent" trades
    ruleViolations: number; // Total violations
    commonViolations: string[];
  };

  // Discipline metrics
  discipline: {
    avgEmotionalDeviation: number; // 0-5
    tradesOutsideKillZone: number;
    overtraded: boolean; // More than planned trades
    tradingDays: number; // Days with trades
  };

  // Session breakdown
  sessions: {
    london: { trades: number; pnl: number; winRate: number };
    ny_am: { trades: number; pnl: number; winRate: number };
    ny_pm: { trades: number; pnl: number; winRate: number };
  };
}
```

#### C. Performance Analytics Engine

```typescript
interface PerformanceMetrics {
  period: {
    start: string;
    end: string;
    days: number;
  };

  // Bias accuracy analysis
  biasAccuracy: {
    total: number;        // Total days analyzed
    accurate: number;     // Days with correct bias
    percentage: number;   // Accuracy %

    breakdown: {
      bullishCorrect: number;
      bearishCorrect: number;
      neutralCorrect: number;
    };

    // Trend analysis
    recentAccuracy: number; // Last 10 days
    trend: "improving" | "declining" | "stable";
  };

  // Setup efficiency
  setupEfficiency: Array<{
    model: string; // "liquidity_sweep_fvg", "ob_mitigation", etc.
    count: number;
    winRate: number;
    avgRMultiple: number;
    avgRunup: number; // How far it ran (MFE)
    avgDrawdown: number; // How far against (MAE)
    profitFactor: number;
    bestTrade: string; // Trade ID
    worstTrade: string;
  }>;

  // Session performance
  sessionPerformance: {
    london: {
      trades: number;
      pnl: number;
      winRate: number;
      avgRMultiple: number;
      bestDay: string;
      worstDay: string;
    };
    ny_am: { ...same };
    ny_pm: { ...same };
  };

  // Emotional control
  emotionalControl: {
    avgDeviation: number;
    perfectDays: number; // Days with 0 deviation
    worstDay: {
      date: string;
      deviation: number;
      notes: string;
    };

    // Patterns
    commonTriggers: string[]; // "FOMO after miss", "Revenge trading after loss"
    improvementTrend: "improving" | "declining" | "stable";
  };

  // Common mistakes
  topMistakes: Array<{
    category: string; // "fomo_entry", "early_exit", "ignoring_bias", "overtrading"
    count: number;
    costInR: number; // Total R lost due to this mistake
    examples: string[]; // Trade IDs
  }>;

  // Confluence analysis
  confluenceAnalysis: Array<{
    factor: string; // "15m bias aligned", "HTF FVG", "Kill zone active"
    frequency: number; // How often present
    winRate: number; // Win rate when present
    avgRMultiple: number;
  }>;

  // Risk management
  riskManagement: {
    avgRiskPerTrade: number; // R units
    maxDrawdown: number; // Largest losing streak
    maxDrawdownDays: number;
    recoveryTime: number; // Days to recover from drawdown
    sharpeRatio: number;
    profitFactor: number;
  };

  // Time analysis
  timeAnalysis: {
    bestTimeframe: string; // "5min", "15min"
    bestSession: string; // "ny_am"
    avgHoldTime: number; // Minutes
    bestDayOfWeek: string;
    worstDayOfWeek: string;
  };
}
```

**API Endpoints:**
```typescript
// GET /api/ict/metrics/daily?date=2025-01-15
async function getDailyMetrics(date: string): Promise<DailyMetrics>

// GET /api/ict/metrics/performance?start=2025-01-01&end=2025-01-31
async function getPerformanceMetrics(start: string, end: string): Promise<PerformanceMetrics>

// GET /api/ict/insights?period=week
async function generateInsights(period: "week" | "month" | "quarter"): Promise<string[]>
```

---

### 4. AI Trading Coach

**Purpose:** Context-aware conversational assistant for ICT trading

#### A. Phase-Based System Prompts

```typescript
type CoachPhase = "pre_market" | "kill_zone" | "dead_zone" | "post_market" | "review";

interface CoachContext {
  currentPhase: CoachPhase;
  currentTime: string;

  // Phase-specific data
  preMarketReport?: PreMarketReport;
  activeSetup?: EntrySetup;
  activeTrades?: TradeExecution[];
  dailyMetrics?: DailyMetrics;
  performanceMetrics?: PerformanceMetrics;

  // User context
  userProfile: {
    experience: "beginner" | "intermediate" | "advanced";
    riskTolerance: "conservative" | "moderate" | "aggressive";
    tradingStyle: "scalper" | "day_trader" | "swing_trader";
    accountSize: number;
  };
}
```

**System Prompts:**

**Pre-Market (6:00-9:30 AM ET):**
```
You are an ICT trading coach. It's pre-market preparation time.

Current analysis:
- Bias: {bias.consensus.direction} ({bias.consensus.confidence}% confidence)
- Key levels: {liquidity.dealingRange}
- Entry zones: {plan.entryZones}
- Session focus: {plan.sessionFocus}

Your role:
- Help trader understand the HTF bias and why it's bullish/bearish
- Explain key liquidity levels and what they mean
- Identify best entry zones with confluence
- Remind about risk management (1% max risk per trade)
- Set expectations for the session

Communication style:
- Professional but encouraging
- Use ICT terminology correctly
- Be concise and actionable
- Reference specific price levels and confluence

If the trader asks about a setup, validate it against:
1. Does it align with HTF bias?
2. Is it in the right PD zone (premium for shorts, discount for longs)?
3. Does it have 3+ confluence factors?
4. Is it during a kill zone?
```

**Kill Zone (Active Trading):**
```
You are an ICT trading coach. A kill zone is ACTIVE. Trading mode.

Current session: {session.name} ({session.start}-{session.end})
Setup status: {setup.status}

Your role:
- Validate entry signals against ICT criteria
- Check confluence (need 3+ factors)
- Confirm risk management (stop placement, position size)
- Flag deviations from pre-market plan
- Provide quick yes/no on setup validity

Communication style:
- DIRECT and CONCISE
- Use bullet points
- Give clear yes/no answers
- Flag warnings in CAPS

Setup validation checklist:
✅ Liquidity grabbed?
✅ MSS confirmed?
✅ PD array present (FVG/OB)?
✅ Aligns with HTF bias?
✅ In kill zone?
✅ Stop placement valid?

If trader is emotional or deviating from plan:
- Remind them of their pre-market plan
- Ask "Does this align with your bias?"
- Suggest stepping away if needed
```

**Dead Zone (11:00 AM - 1:30 PM):**
```
You are an ICT trading coach. Market is in DEAD ZONE (lunch consolidation).

Your role:
- DISCOURAGE trading
- Remind that choppy price action is expected
- Suggest reviewing morning trades
- Encourage journaling
- Prepare for PM session if applicable

If trader asks about a setup:
"This is a dead zone. Price action is typically choppy and unreliable.
Unless this is an exceptional setup with 5+ confluence factors, wait
for NY PM session at 1:30 PM."
```

**Post-Market (After 4:00 PM):**
```
You are an ICT trading coach. Market is closed. Reflection time.

Today's performance:
- Trades: {dailyMetrics.trades.total}
- Win rate: {dailyMetrics.trades.winRate}%
- P/L: ${dailyMetrics.pnl.net}
- Bias accuracy: {dailyMetrics.biasAnalysis.accurate ? "✅" : "❌"}

Your role:
- Review trade execution quality
- Identify what worked and what didn't
- Highlight patterns (good and bad)
- Provide constructive feedback
- Suggest specific improvements
- Generate journaling prompts

Analysis framework:
1. Bias Accuracy: Was your morning bias correct?
2. Setup Quality: Did you trade high-quality setups?
3. Execution: Did you follow your plan?
4. Discipline: Any emotional trades or rule violations?
5. Learning: What's the key lesson from today?

Communication style:
- Constructive and insightful
- Celebrate wins but focus on process, not outcome
- Be honest about mistakes
- End with an actionable improvement for tomorrow
```

#### B. Conversational Interface

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;

  // Context at time of message
  context?: {
    phase: CoachPhase;
    setup?: EntrySetup;
    metrics?: any;
  };
}

interface CoachSession {
  id: string;
  userId: string;
  date: string;
  messages: ChatMessage[];

  // Session metadata
  startTime: string;
  lastActivity: string;
  phase: CoachPhase;
}
```

**API Endpoints:**
```typescript
// POST /api/ict/coach/chat
async function chat(
  message: string,
  context: CoachContext
): Promise<{ reply: string; suggestions?: string[] }>

// GET /api/ict/coach/session?date=2025-01-15
async function getCoachSession(date: string): Promise<CoachSession>

// POST /api/ict/coach/insights
async function generateInsights(
  metrics: PerformanceMetrics
): Promise<string[]>
```

---

## 🗄️ Database Schema

### Tables

#### 1. **pre_market_reports**
```sql
CREATE TABLE pre_market_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  symbol VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Analysis
  daily_bias JSONB NOT NULL,      -- HTFBiasAnalysis.daily
  four_hour_bias JSONB NOT NULL,  -- HTFBiasAnalysis.fourHour
  one_hour_bias JSONB NOT NULL,   -- HTFBiasAnalysis.oneHour
  consensus JSONB NOT NULL,        -- HTFBiasAnalysis.consensus

  -- Liquidity
  liquidity_map JSONB NOT NULL,   -- LiquidityMap

  -- Trading plan
  plan JSONB NOT NULL,            -- PreMarketReport.plan
  macro_context JSONB,            -- PreMarketReport.macroContext
  warnings TEXT[],
  notes TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, symbol, date)
);

CREATE INDEX idx_pre_market_date ON pre_market_reports(user_id, date DESC);
CREATE INDEX idx_pre_market_symbol ON pre_market_reports(user_id, symbol, date DESC);
```

#### 2. **entry_setups**
```sql
CREATE TABLE entry_setups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  symbol VARCHAR(10) NOT NULL,
  detected_at TIMESTAMP NOT NULL,

  -- Setup details
  model VARCHAR(50) NOT NULL, -- "liquidity_sweep_fvg", etc.
  confidence INTEGER NOT NULL, -- 0-100
  session VARCHAR(20) NOT NULL, -- "london", "ny_am", "ny_pm"

  -- Trigger conditions
  liquidity_grabbed JSONB,
  mss_confirmed JSONB,
  pd_array JSONB,

  -- Trade parameters
  entry_price DECIMAL(10, 2) NOT NULL,
  stop_price DECIMAL(10, 2) NOT NULL,
  targets JSONB NOT NULL, -- Array of targets
  risk JSONB NOT NULL,

  -- Quality metrics
  confluence TEXT[] NOT NULL,
  setup_quality INTEGER, -- 1-10
  warnings TEXT[],

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- active, executed, invalidated, expired
  executed_at TIMESTAMP,
  invalidated_at TIMESTAMP,

  -- Link to trade
  trade_id UUID REFERENCES trades(id),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_setups_symbol_date ON entry_setups(user_id, symbol, detected_at DESC);
CREATE INDEX idx_setups_status ON entry_setups(user_id, status, detected_at DESC);
```

#### 3. **trades**
```sql
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  symbol VARCHAR(10) NOT NULL,
  date DATE NOT NULL,

  -- Pre-trade
  pre_market_bias VARCHAR(20) NOT NULL,
  planned_entry DECIMAL(10, 2),
  planned_stop DECIMAL(10, 2),
  planned_targets JSONB,

  -- Setup
  setup_model VARCHAR(50) NOT NULL,
  session VARCHAR(20) NOT NULL,
  kill_zone_active BOOLEAN DEFAULT false,
  confluence TEXT[] NOT NULL,
  setup_quality INTEGER, -- 1-10

  -- Execution
  entry_time TIMESTAMP NOT NULL,
  entry_price DECIMAL(10, 2) NOT NULL,
  exit_time TIMESTAMP NOT NULL,
  exit_price DECIMAL(10, 2) NOT NULL,

  partials JSONB, -- Array of partial closes

  gross_pnl DECIMAL(10, 2) NOT NULL,
  net_pnl DECIMAL(10, 2) NOT NULL,
  r_multiple DECIMAL(5, 2) NOT NULL,
  hold_time INTEGER, -- Minutes
  mae DECIMAL(10, 2), -- Max Adverse Excursion
  mfe DECIMAL(10, 2), -- Max Favorable Excursion

  -- Performance
  execution_quality VARCHAR(20), -- excellent, good, fair, poor
  execution_notes TEXT,
  emotional_deviation INTEGER, -- 0-5
  rule_violations TEXT[],
  overall_grade VARCHAR(5), -- A+, A, B, C, D, F
  grade_reason TEXT,

  -- Reflection
  what_worked TEXT,
  what_didnt_work TEXT,
  mistakes TEXT[],
  lessons_learned TEXT,
  improvement_areas TEXT[],

  -- Media
  screenshots JSONB, -- Array of screenshot URLs

  -- Tags
  tags TEXT[],

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trades_date ON trades(user_id, date DESC);
CREATE INDEX idx_trades_symbol ON trades(user_id, symbol, date DESC);
CREATE INDEX idx_trades_pnl ON trades(user_id, net_pnl DESC);
CREATE INDEX idx_trades_tags ON trades USING GIN(tags);
```

#### 4. **daily_metrics**
```sql
CREATE TABLE daily_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,

  -- Bias analysis
  bias_analysis JSONB NOT NULL,

  -- Trade stats
  trades JSONB NOT NULL,

  -- Financial
  pnl JSONB NOT NULL,

  -- Setup quality
  setups JSONB NOT NULL,

  -- Execution
  execution JSONB NOT NULL,

  -- Discipline
  discipline JSONB NOT NULL,

  -- Sessions
  sessions JSONB NOT NULL,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_metrics_date ON daily_metrics(user_id, date DESC);
```

#### 5. **coach_sessions**
```sql
CREATE TABLE coach_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,

  phase VARCHAR(20) NOT NULL, -- pre_market, kill_zone, etc.

  messages JSONB NOT NULL, -- Array of ChatMessage

  start_time TIMESTAMP NOT NULL,
  last_activity TIMESTAMP NOT NULL,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, date)
);

CREATE INDEX idx_coach_date ON coach_sessions(user_id, date DESC);
```

#### 6. **alerts**
```sql
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  symbol VARCHAR(10) NOT NULL,

  priority VARCHAR(20) NOT NULL, -- critical, high, medium, low
  type VARCHAR(50) NOT NULL, -- session_start, setup_ready, etc.
  message TEXT NOT NULL,
  data JSONB,

  channels TEXT[] NOT NULL, -- app, email, sms, discord

  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP,
  dismissed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_time ON alerts(user_id, sent_at DESC);
CREATE INDEX idx_alerts_unread ON alerts(user_id, read_at) WHERE read_at IS NULL;
```

---

## 🔧 Backend Architecture

### Tech Stack Recommendations

**Option 1: Node.js + PostgreSQL (Current Stack)**
```
Frontend: Next.js
Backend: Next.js API Routes + Node.js Workers
Database: PostgreSQL (Supabase)
Real-time: WebSockets / Server-Sent Events
Cache: Redis (for real-time data)
Queue: Bull (for scheduled jobs)
```

**Option 2: Python Backend (For ML/Analytics)**
```
Frontend: Next.js
Backend: FastAPI (Python)
Database: PostgreSQL
ML/Analytics: Python (pandas, numpy, scikit-learn)
Real-time: WebSockets
Cache: Redis
Queue: Celery
```

### Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   API Gateway (Next.js)                  │
└───────────────────┬─────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
┌───────▼──────┐ ┌──▼──────┐ ┌─▼────────────┐
│ Analysis     │ │ Trading  │ │ Notification │
│ Service      │ │ Service  │ │ Service      │
└───────┬──────┘ └──┬──────┘ └─┬────────────┘
        │           │           │
        └───────────┼───────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
┌───────▼──────┐ ┌──▼──────┐ ┌─▼────────────┐
│ PostgreSQL   │ │ Redis    │ │ Job Queue    │
│ (Primary DB) │ │ (Cache)  │ │ (Scheduler)  │
└──────────────┘ └──────────┘ └──────────────┘
```

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Database schema setup
- [ ] Pre-market analyzer service
- [ ] HTF bias calculation
- [ ] Liquidity mapper
- [ ] Pre-market report generator API

### Phase 2: Live Monitoring (Weeks 3-4)
- [ ] Session manager
- [ ] Entry model detector
- [ ] Real-time alert system
- [ ] WebSocket integration

### Phase 3: Journaling (Weeks 5-6)
- [ ] Trade logger
- [ ] Daily metrics tracker
- [ ] Performance analytics engine
- [ ] Integration with existing calendar/journal

### Phase 4: AI Coach (Weeks 7-8)
- [ ] Phase-based system prompts
- [ ] Coach chat API
- [ ] Context management
- [ ] Insights generator

### Phase 5: Polish & Optimization (Weeks 9-10)
- [ ] Performance optimization
- [ ] Alert fine-tuning
- [ ] UI/UX improvements
- [ ] Testing & bug fixes

---

## 📊 Success Metrics

### Technical Metrics
- Pre-market report generation: < 10 seconds
- Entry setup detection latency: < 2 seconds
- Alert delivery time: < 1 second
- API response times: < 500ms (p95)

### Trading Metrics
- Bias accuracy target: > 70%
- Setup quality average: > 7/10
- Execution discipline: > 80% rule compliance
- False positive rate: < 20%

---

## 🔐 Security & Privacy

- All user data encrypted at rest
- Session-based authentication
- API rate limiting
- Trade data privacy (never shared)
- Alert preferences user-controlled

---

## 📚 Next Steps

**Immediate Actions:**
1. Review architecture and provide feedback
2. Decide on backend stack (Node.js vs Python)
3. Prioritize which component to build first
4. Set up database schema
5. Create API contract documentation

**Questions to Answer:**
- Real-time monitoring frequency (every 1 min? 5 min?)
- Alert notification preferences (push, email, SMS?)
- Historical data retention period (90 days? 1 year?)
- Multi-symbol support initially or single symbol?
- Integration with existing trading journal?

---

## 🤝 Collaboration

This system should be built iteratively with constant feedback from actual ICT traders. Each component should be tested independently before integration.

**Contact:** [Your contact info]
**Last Updated:** 2025-01-15
**Version:** 1.0
