# Pre-Market Agent Implementation Plan

## 📋 Executive Summary

**Goal:** Build an automated pre-market analysis agent that runs every morning at 6:30 AM NY time, executes a comprehensive 6-step ICT routine, and delivers a detailed trading plan to the AI Coach frontend.

**Default Symbol:** QQQ
**Data Source:** Alpha Vantage (already integrated)
**Timezone:** America/New_York (scheduled for 6:30 AM ET)
**Report Delivery:** AI Coach page (frontend display)

---

## 🎯 Core Requirements

### The 6-Step Pre-Market Routine

1. **HTF Bias Analysis** (Daily/4H)
   - Determine market bias (bullish/bearish/neutral)
   - Identify previous day/week high/low
   - Mark HTF order blocks and FVGs
   - Identify Draw on Liquidity targets

2. **Overnight/London Session Structure**
   - Asian session range (00:00-05:00 NY)
   - London High/Low
   - Session liquidity sweeps
   - Determine if London made the high or low of day

3. **Dealing Range Construction**
   - Calculate Swing A → Swing B
   - Mark Premium zone (above 50%)
   - Mark Discount zone (below 50%)
   - Calculate equilibrium (50%)

4. **Pre-Market Liquidity Identification**
   - Equal highs/lows
   - Small consolidation tops/bottoms
   - Pre-market high/low
   - Previous day unmitigated OB/FVG
   - Classify inducement vs. target liquidity

5. **Day Type Classification**
   - **Trend Day** - Strong HTF bias, clean London sweep, unfilled imbalance
   - **Reversal Day** - London swept both sides, deep HTF OB/FVG, CHoCH
   - **Consolidation Day** - No clean sweep, no HTF draw, avoid trading

6. **Trade Plan Generation**
   - **Long A+ Scenario:**
     - Entry conditions (SSL sweep + bullish displacement + FVG/OB)
     - Entry zone (Discount/OTE 62-79%)
     - Stop loss placement
     - Target levels (next BSL)
     - Invalidation level
   - **Short A+ Scenario:**
     - Entry conditions (BSL sweep + bearish displacement + FVG/OB)
     - Entry zone (Premium/OTE 62-79%)
     - Stop loss placement
     - Target levels (next SSL)
     - Invalidation level
   - Valid time window (8:30-11:00 AM NY for indices)

### Final Report Format

The report should include:
- **Timestamp** - When analysis was run
- **Symbol** - QQQ
- **HTF Bias** - Bullish/Bearish/Neutral with confidence %
- **Session Analysis** - Asian range, London H/L, liquidity sweeps
- **Dealing Range** - High, Low, Premium (61.8%), Discount (38.2%), EQ (50%)
- **Day Type** - Trend/Reversal/Consolidation with reasoning
- **Long Scenario** - Full A+ setup checklist
- **Short Scenario** - Full A+ setup checklist
- **Key Levels** - Top 3 order blocks, FVGs, liquidity zones
- **Narrative** - Human-readable market story
- **Confidence Score** - 0-100%

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Pre-Market Agent System                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          APScheduler (6:30 AM NY Time)               │   │
│  │              Triggers Daily Routine                   │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                       │
│  ┌────────────────────▼─────────────────────────────────┐   │
│  │      PreMarketRoutineService                         │   │
│  │  - Step 1: HTF Bias (Daily/4H)                       │   │
│  │  - Step 2: Session Structure (Asian/London)          │   │
│  │  - Step 3: Dealing Range (Premium/Discount)          │   │
│  │  - Step 4: Liquidity Identification                  │   │
│  │  - Step 5: Day Type Classification                   │   │
│  │  - Step 6: Trade Plan (Long/Short scenarios)         │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                       │
│         ┌─────────────┼─────────────┐                        │
│         │             │             │                        │
│  ┌──────▼──────┐ ┌───▼────────┐ ┌──▼──────────┐            │
│  │ ICTAnalyzer │ │ Data       │ │ Database    │            │
│  │ (existing)  │ │ Fetcher    │ │ (Reports)   │            │
│  └─────────────┘ └────────────┘ └─────────────┘            │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │        FastAPI Endpoints (Reports)                   │    │
│  │  - POST /api/v1/reports/generate (manual trigger)   │    │
│  │  - GET  /api/v1/reports/morning/{date}              │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                       │
│  ┌────────────────────▼────────────────────────────────┐    │
│  │          Next.js Frontend (AI Coach)                 │    │
│  │  - Morning Report Display Component                  │    │
│  │  - "Generate Report" Manual Trigger Button          │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema Changes

### Extend `PreMarketReport` Model

**File:** `backend/app/models/trading.py`

```python
class PreMarketReport(Base):
    """Pre-market analysis reports generated daily."""
    __tablename__ = "pre_market_reports"

    # ... existing fields ...

    # ========== NEW FIELDS FOR ENHANCED ROUTINE ==========

    # Step 2: Session Structure
    asian_session_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    asian_session_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    london_session_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    london_session_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    session_liquidity_sweeps: Mapped[list] = mapped_column(JSON, default=list)  # [{type: "SSL", price: 123.45, time: "..."}]

    # Step 3: Dealing Range (with Premium/Discount zones)
    premium_zone: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 61.8% level
    discount_zone: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 38.2% level
    equilibrium: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 50% level

    # Step 4: Liquidity Locations
    inducement_liquidity: Mapped[list] = mapped_column(JSON, default=list)  # Likely to be swept
    target_liquidity: Mapped[list] = mapped_column(JSON, default=list)  # Final targets

    # Step 5: Day Type Classification
    day_type: Mapped[str] = mapped_column(String(20), default="unknown")  # "trend", "reversal", "consolidation"
    day_type_reasoning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Step 6: Trade Scenarios
    long_scenario: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    """
    {
        "entry_conditions": ["SSL sweep", "Bullish displacement", "Bullish FVG"],
        "entry_zone": {"high": 123.45, "low": 123.00},
        "entry_type": "FVG/OB",
        "stop_loss": 122.50,
        "targets": [124.00, 125.50, 127.00],
        "invalidation": 122.00,
        "risk_reward": 3.5,
        "confluence_factors": ["Daily bias bullish", "Discount entry", "NY killzone"],
        "valid_time_window": "08:30-11:00 NY"
    }
    """

    short_scenario: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    """
    {
        "entry_conditions": ["BSL sweep", "Bearish displacement", "Bearish FVG"],
        "entry_zone": {"high": 126.00, "low": 125.50},
        "entry_type": "FVG/OB",
        "stop_loss": 126.50,
        "targets": [124.00, 122.50, 121.00],
        "invalidation": 127.00,
        "risk_reward": 3.2,
        "confluence_factors": ["Daily bias bearish", "Premium entry", "NY killzone"],
        "valid_time_window": "08:30-11:00 NY"
    }
    """
```

**Migration Required:** Yes - Add new columns to `pre_market_reports` table.

### Database Migration Script

**File:** `backend/alembic/versions/XXXX_add_enhanced_premarket_fields.py`

```python
"""Add enhanced pre-market routine fields

Revision ID: XXXX
Revises: previous_revision
Create Date: 2025-01-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade():
    # Session structure
    op.add_column('pre_market_reports', sa.Column('asian_session_high', sa.Float(), nullable=True))
    op.add_column('pre_market_reports', sa.Column('asian_session_low', sa.Float(), nullable=True))
    op.add_column('pre_market_reports', sa.Column('london_session_high', sa.Float(), nullable=True))
    op.add_column('pre_market_reports', sa.Column('london_session_low', sa.Float(), nullable=True))
    op.add_column('pre_market_reports', sa.Column('session_liquidity_sweeps', postgresql.JSON(astext_type=sa.Text()), nullable=True))

    # Dealing range zones
    op.add_column('pre_market_reports', sa.Column('premium_zone', sa.Float(), nullable=True))
    op.add_column('pre_market_reports', sa.Column('discount_zone', sa.Float(), nullable=True))
    op.add_column('pre_market_reports', sa.Column('equilibrium', sa.Float(), nullable=True))

    # Liquidity
    op.add_column('pre_market_reports', sa.Column('inducement_liquidity', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('pre_market_reports', sa.Column('target_liquidity', postgresql.JSON(astext_type=sa.Text()), nullable=True))

    # Day type
    op.add_column('pre_market_reports', sa.Column('day_type', sa.String(20), nullable=True, server_default='unknown'))
    op.add_column('pre_market_reports', sa.Column('day_type_reasoning', sa.Text(), nullable=True))

    # Trade scenarios
    op.add_column('pre_market_reports', sa.Column('long_scenario', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('pre_market_reports', sa.Column('short_scenario', postgresql.JSON(astext_type=sa.Text()), nullable=True))

def downgrade():
    op.drop_column('pre_market_reports', 'short_scenario')
    op.drop_column('pre_market_reports', 'long_scenario')
    op.drop_column('pre_market_reports', 'day_type_reasoning')
    op.drop_column('pre_market_reports', 'day_type')
    op.drop_column('pre_market_reports', 'target_liquidity')
    op.drop_column('pre_market_reports', 'inducement_liquidity')
    op.drop_column('pre_market_reports', 'equilibrium')
    op.add_column('pre_market_reports', 'discount_zone')
    op.drop_column('pre_market_reports', 'premium_zone')
    op.drop_column('pre_market_reports', 'session_liquidity_sweeps')
    op.drop_column('pre_market_reports', 'london_session_low')
    op.drop_column('pre_market_reports', 'london_session_high')
    op.drop_column('pre_market_reports', 'asian_session_low')
    op.drop_column('pre_market_reports', 'asian_session_high')
```

---

## 🔧 Backend Implementation

### 1. Pre-Market Routine Service

**File:** `backend/app/services/ict/pre_market_routine.py`

```python
"""
Pre-Market Routine Service
Executes the complete 6-step ICT pre-market analysis routine.
"""
from datetime import datetime, date, time, timedelta
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
import pandas as pd
import pytz

from app.services.ict.analyzer import ICTAnalyzer
from app.utils.data_fetcher import fetch_ohlcv
from app.models.trading import PreMarketReport, BiasType
from app.schemas.trading import PreMarketReportCreate


class PreMarketRoutineService:
    """
    Comprehensive pre-market routine following ICT methodology.

    Executes 6 steps:
    1. HTF Bias Analysis
    2. Session Structure Analysis
    3. Dealing Range Construction
    4. Liquidity Identification
    5. Day Type Classification
    6. Trade Plan Generation
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.analyzer = ICTAnalyzer(db)
        self.ny_tz = pytz.timezone('America/New_York')

    async def run_routine(
        self,
        symbol: str = "QQQ",
        target_date: Optional[date] = None
    ) -> PreMarketReport:
        """
        Execute the complete pre-market routine.

        Args:
            symbol: Trading symbol (default: QQQ)
            target_date: Date for analysis (default: today)

        Returns:
            PreMarketReport object saved to database
        """
        if target_date is None:
            target_date = datetime.now(self.ny_tz).date()

        print(f"\n{'='*60}")
        print(f"🌅 PRE-MARKET ROUTINE - {target_date}")
        print(f"📊 Symbol: {symbol}")
        print(f"⏰ NY Time: {datetime.now(self.ny_tz).strftime('%H:%M:%S')}")
        print(f"{'='*60}\n")

        # Step 1: HTF Bias
        htf_bias, htf_data = await self._step1_htf_bias(symbol)

        # Step 2: Session Structure
        session_data = await self._step2_session_structure(symbol)

        # Step 3: Dealing Range
        dealing_range_data = await self._step3_dealing_range(symbol, htf_data)

        # Step 4: Liquidity Identification
        liquidity_data = await self._step4_liquidity(symbol, session_data, htf_data)

        # Step 5: Day Type Classification
        day_type, day_type_reasoning = await self._step5_day_type(
            htf_bias, session_data, htf_data
        )

        # Step 6: Trade Plan Generation
        long_scenario, short_scenario = await self._step6_trade_plan(
            symbol, htf_bias, dealing_range_data, liquidity_data, day_type
        )

        # Generate narrative
        narrative = self._generate_narrative(
            symbol, htf_bias, session_data, day_type, htf_data
        )

        # Calculate confidence
        confidence = self._calculate_confidence(
            htf_bias, day_type, htf_data, session_data
        )

        # Create report
        report = PreMarketReport(
            date=target_date,
            symbol=symbol,

            # HTF Analysis
            htf_bias=htf_bias,
            htf_dealing_range_high=htf_data['dealing_range']['high'],
            htf_dealing_range_low=htf_data['dealing_range']['low'],
            htf_key_levels=htf_data['key_levels'],

            # LTF Structure (placeholder for now)
            ltf_structure=htf_data['market_structure'],
            ltf_entry_zones=[],

            # Session data
            asian_session_high=session_data['asian']['high'],
            asian_session_low=session_data['asian']['low'],
            london_session_high=session_data['london']['high'],
            london_session_low=session_data['london']['low'],
            session_liquidity_sweeps=session_data['sweeps'],

            # Dealing range zones
            premium_zone=dealing_range_data['premium'],
            discount_zone=dealing_range_data['discount'],
            equilibrium=dealing_range_data['equilibrium'],

            # Liquidity
            inducement_liquidity=liquidity_data['inducement'],
            target_liquidity=liquidity_data['targets'],

            # Day type
            day_type=day_type,
            day_type_reasoning=day_type_reasoning,

            # Trade scenarios
            long_scenario=long_scenario,
            short_scenario=short_scenario,

            # Target sessions
            target_sessions=["london_open", "ny_open"],

            # Narrative and confidence
            narrative=narrative,
            trade_plan={
                "direction": "long" if htf_bias == BiasType.BULLISH else "short",
                "primary_scenario": "long" if htf_bias == BiasType.BULLISH else "short"
            },
            confidence=confidence
        )

        # Save to database
        self.db.add(report)
        await self.db.commit()
        await self.db.refresh(report)

        print(f"\n✅ Pre-market report generated (ID: {report.id})")
        print(f"📊 HTF Bias: {htf_bias.value}")
        print(f"📈 Day Type: {day_type}")
        print(f"🎯 Confidence: {confidence:.0%}\n")

        return report

    async def _step1_htf_bias(self, symbol: str) -> Tuple[BiasType, Dict[str, Any]]:
        """Step 1: Determine HTF bias (Daily/4H)."""
        print("📊 Step 1: HTF Bias Analysis...")

        # Run ICT analysis on Daily timeframe
        analysis = await self.analyzer.analyze(
            symbol=symbol,
            timeframes=["1D"],
            analysis_type="full"
        )

        htf_data = {
            'bias': analysis.htf_bias,
            'dealing_range': analysis.dealing_range,
            'order_blocks': analysis.order_blocks,
            'fvgs': analysis.fvgs,
            'liquidity_zones': analysis.liquidity_zones,
            'market_structure': analysis.market_structure,
            'key_levels': {
                'order_blocks': [ob.model_dump() for ob in analysis.order_blocks[:3]],
                'fvgs': [fvg.model_dump() for fvg in analysis.fvgs[:3]],
                'liquidity': [lz.model_dump() for lz in analysis.liquidity_zones[:3]]
            }
        }

        print(f"   ✓ HTF Bias: {analysis.htf_bias.value}")
        print(f"   ✓ Dealing Range: {analysis.dealing_range['low']:.2f} - {analysis.dealing_range['high']:.2f}")

        return analysis.htf_bias, htf_data

    async def _step2_session_structure(self, symbol: str) -> Dict[str, Any]:
        """Step 2: Analyze overnight/London session structure."""
        print("🌙 Step 2: Session Structure Analysis...")

        # Fetch intraday data (15m for session analysis)
        df = await fetch_ohlcv(symbol, timeframe="15m", limit=200)

        # Get current NY time
        now_ny = datetime.now(self.ny_tz)
        today_start = datetime.combine(now_ny.date(), time(0, 0)).astimezone(self.ny_tz)

        # Asian session: 00:00 - 05:00 NY
        asian_start = today_start
        asian_end = today_start + timedelta(hours=5)

        # London session: 02:00 - 08:00 NY
        london_start = today_start + timedelta(hours=2)
        london_end = today_start + timedelta(hours=8)

        # Filter data for sessions
        asian_data = df[(df['timestamp'] >= asian_start) & (df['timestamp'] < asian_end)]
        london_data = df[(df['timestamp'] >= london_start) & (df['timestamp'] < london_end)]

        # Calculate session highs/lows
        asian_high = float(asian_data['high'].max()) if len(asian_data) > 0 else None
        asian_low = float(asian_data['low'].min()) if len(asian_data) > 0 else None
        london_high = float(london_data['high'].max()) if len(london_data) > 0 else None
        london_low = float(london_data['low'].min()) if len(london_data) > 0 else None

        # Detect liquidity sweeps
        sweeps = self._detect_liquidity_sweeps(df, asian_high, asian_low, london_high, london_low)

        session_data = {
            'asian': {'high': asian_high, 'low': asian_low},
            'london': {'high': london_high, 'low': london_low},
            'sweeps': sweeps
        }

        print(f"   ✓ Asian: {asian_low:.2f} - {asian_high:.2f}")
        print(f"   ✓ London: {london_low:.2f} - {london_high:.2f}")
        print(f"   ✓ Sweeps detected: {len(sweeps)}")

        return session_data

    async def _step3_dealing_range(
        self,
        symbol: str,
        htf_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Step 3: Build dealing range with Premium/Discount zones."""
        print("📏 Step 3: Dealing Range Construction...")

        dealing_range = htf_data['dealing_range']
        high = dealing_range['high']
        low = dealing_range['low']

        # Calculate zones
        range_size = high - low
        equilibrium = low + (range_size * 0.50)  # 50%
        premium = low + (range_size * 0.618)      # 61.8% (Golden ratio)
        discount = low + (range_size * 0.382)     # 38.2%

        zones = {
            'high': high,
            'low': low,
            'equilibrium': equilibrium,
            'premium': premium,
            'discount': discount
        }

        print(f"   ✓ Range: {low:.2f} - {high:.2f}")
        print(f"   ✓ Premium: {premium:.2f} (61.8%)")
        print(f"   ✓ EQ: {equilibrium:.2f} (50%)")
        print(f"   ✓ Discount: {discount:.2f} (38.2%)")

        return zones

    async def _step4_liquidity(
        self,
        symbol: str,
        session_data: Dict[str, Any],
        htf_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Step 4: Identify pre-market liquidity locations."""
        print("💧 Step 4: Liquidity Identification...")

        # Fetch recent data for equal highs/lows
        df = await fetch_ohlcv(symbol, timeframe="1H", limit=100)

        inducement = []
        targets = []

        # Asian/London levels as inducement
        if session_data['asian']['high']:
            inducement.append({
                'type': 'BSL',
                'price': session_data['asian']['high'],
                'description': 'Asian Session High'
            })
        if session_data['asian']['low']:
            inducement.append({
                'type': 'SSL',
                'price': session_data['asian']['low'],
                'description': 'Asian Session Low'
            })

        # HTF liquidity zones as targets
        for lz in htf_data['liquidity_zones'][:3]:
            targets.append({
                'type': lz.zone_type,
                'price': lz.price,
                'description': f"HTF {lz.zone_type} - {lz.description}"
            })

        liquidity_data = {
            'inducement': inducement,
            'targets': targets
        }

        print(f"   ✓ Inducement levels: {len(inducement)}")
        print(f"   ✓ Target levels: {len(targets)}")

        return liquidity_data

    async def _step5_day_type(
        self,
        htf_bias: BiasType,
        session_data: Dict[str, Any],
        htf_data: Dict[str, Any]
    ) -> Tuple[str, str]:
        """Step 5: Classify day type (Trend/Reversal/Consolidation)."""
        print("🎯 Step 5: Day Type Classification...")

        # Scoring system
        trend_score = 0
        reversal_score = 0
        consolidation_score = 0

        # HTF bias check
        if htf_bias != BiasType.NEUTRAL:
            trend_score += 2
        else:
            consolidation_score += 2

        # London session behavior
        sweeps = session_data.get('sweeps', [])
        bsl_swept = any(s['type'] == 'BSL' for s in sweeps)
        ssl_swept = any(s['type'] == 'SSL' for s in sweeps)

        if bsl_swept and ssl_swept:
            # Both sides swept - reversal signal
            reversal_score += 3
        elif bsl_swept or ssl_swept:
            # One side swept - trend signal
            trend_score += 2
        else:
            # No sweeps - consolidation
            consolidation_score += 2

        # Order blocks (strong OB = potential reversal zone)
        strong_obs = [ob for ob in htf_data['order_blocks'] if ob.strength > 0.7]
        if len(strong_obs) > 0:
            reversal_score += 1

        # FVGs (unfilled FVGs = trend continuation)
        unfilled_fvgs = [fvg for fvg in htf_data['fvgs'] if not fvg.filled]
        if len(unfilled_fvgs) > 2:
            trend_score += 1

        # Determine day type
        if trend_score >= max(reversal_score, consolidation_score) + 1:
            day_type = "trend"
            reasoning = f"Strong HTF bias ({htf_bias.value}), clean London sweep, {len(unfilled_fvgs)} unfilled FVGs. Expect continuation."
        elif reversal_score >= max(trend_score, consolidation_score) + 1:
            day_type = "reversal"
            reasoning = f"London swept both sides, {len(strong_obs)} strong OBs present. Watch for reversal from HTF zone."
        else:
            day_type = "consolidation"
            reasoning = "No clear directional bias, minimal London activity. Reduce size or avoid trading."

        print(f"   ✓ Day Type: {day_type.upper()}")
        print(f"   ✓ Reasoning: {reasoning}")

        return day_type, reasoning

    async def _step6_trade_plan(
        self,
        symbol: str,
        htf_bias: BiasType,
        dealing_range: Dict[str, Any],
        liquidity_data: Dict[str, Any],
        day_type: str
    ) -> Tuple[Optional[Dict], Optional[Dict]]:
        """Step 6: Generate Long and Short A+ scenarios."""
        print("📋 Step 6: Trade Plan Generation...")

        # Get current price
        df = await fetch_ohlcv(symbol, timeframe="5m", limit=1)
        current_price = float(df['close'].iloc[-1])

        # Long scenario
        long_scenario = self._build_long_scenario(
            current_price, htf_bias, dealing_range, liquidity_data, day_type
        )

        # Short scenario
        short_scenario = self._build_short_scenario(
            current_price, htf_bias, dealing_range, liquidity_data, day_type
        )

        print(f"   ✓ Long scenario: Entry {long_scenario['entry_zone']['low']:.2f}-{long_scenario['entry_zone']['high']:.2f}")
        print(f"   ✓ Short scenario: Entry {short_scenario['entry_zone']['low']:.2f}-{short_scenario['entry_zone']['high']:.2f}")

        return long_scenario, short_scenario

    # ========== HELPER METHODS ==========

    def _detect_liquidity_sweeps(
        self,
        df: pd.DataFrame,
        asian_high: Optional[float],
        asian_low: Optional[float],
        london_high: Optional[float],
        london_low: Optional[float]
    ) -> List[Dict[str, Any]]:
        """Detect if key levels were swept."""
        sweeps = []

        # Check if Asian highs/lows were swept during London
        if asian_high and df['high'].max() > asian_high:
            sweeps.append({'type': 'BSL', 'level': 'Asian High', 'price': asian_high})

        if asian_low and df['low'].min() < asian_low:
            sweeps.append({'type': 'SSL', 'level': 'Asian Low', 'price': asian_low})

        return sweeps

    def _build_long_scenario(self, current_price, htf_bias, dealing_range, liquidity_data, day_type):
        """Build A+ long setup scenario."""
        # Entry zone in discount (38.2%)
        entry_high = dealing_range['discount'] + 5  # Buffer
        entry_low = dealing_range['discount'] - 5

        # Stop below entry zone
        stop_loss = entry_low - 10

        # Targets: Next BSL levels
        targets = [
            dealing_range['equilibrium'],
            dealing_range['premium'],
            dealing_range['high']
        ]

        # Invalidation
        invalidation = dealing_range['low'] - 5

        # Risk/Reward
        risk = entry_low - stop_loss
        reward = targets[0] - entry_low
        rr = reward / risk if risk > 0 else 0

        confluence = []
        if htf_bias == BiasType.BULLISH:
            confluence.append("HTF bias bullish")
        if current_price < dealing_range['equilibrium']:
            confluence.append("Price in discount")
        if day_type == "trend":
            confluence.append("Trend day expected")
        confluence.append("NY killzone 8:30-11:00 AM")

        return {
            "entry_conditions": [
                "Sweep of Sell-Side Liquidity (SSL)",
                "Bullish displacement confirmed",
                "Bullish FVG or Order Block present"
            ],
            "entry_zone": {"high": round(entry_high, 2), "low": round(entry_low, 2)},
            "entry_type": "Discount FVG/OB (OTE 62-79%)",
            "stop_loss": round(stop_loss, 2),
            "targets": [round(t, 2) for t in targets],
            "invalidation": round(invalidation, 2),
            "risk_reward": round(rr, 2),
            "confluence_factors": confluence,
            "valid_time_window": "08:30-11:00 NY"
        }

    def _build_short_scenario(self, current_price, htf_bias, dealing_range, liquidity_data, day_type):
        """Build A+ short setup scenario."""
        # Entry zone in premium (61.8%)
        entry_high = dealing_range['premium'] + 5
        entry_low = dealing_range['premium'] - 5

        # Stop above entry zone
        stop_loss = entry_high + 10

        # Targets: Next SSL levels
        targets = [
            dealing_range['equilibrium'],
            dealing_range['discount'],
            dealing_range['low']
        ]

        # Invalidation
        invalidation = dealing_range['high'] + 5

        # Risk/Reward
        risk = stop_loss - entry_high
        reward = entry_high - targets[0]
        rr = reward / risk if risk > 0 else 0

        confluence = []
        if htf_bias == BiasType.BEARISH:
            confluence.append("HTF bias bearish")
        if current_price > dealing_range['equilibrium']:
            confluence.append("Price in premium")
        if day_type == "trend":
            confluence.append("Trend day expected")
        confluence.append("NY killzone 8:30-11:00 AM")

        return {
            "entry_conditions": [
                "Sweep of Buy-Side Liquidity (BSL)",
                "Bearish displacement confirmed",
                "Bearish FVG or Order Block present"
            ],
            "entry_zone": {"high": round(entry_high, 2), "low": round(entry_low, 2)},
            "entry_type": "Premium FVG/OB (OTE 62-79%)",
            "stop_loss": round(stop_loss, 2),
            "targets": [round(t, 2) for t in targets],
            "invalidation": round(invalidation, 2),
            "risk_reward": round(rr, 2),
            "confluence_factors": confluence,
            "valid_time_window": "08:30-11:00 NY"
        }

    def _generate_narrative(self, symbol, htf_bias, session_data, day_type, htf_data):
        """Generate human-readable narrative."""
        narrative_parts = []

        narrative_parts.append(f"{symbol} shows {htf_bias.value} bias on HTF.")

        if day_type == "trend":
            narrative_parts.append(f"Trend day expected - trade in direction of bias only.")
        elif day_type == "reversal":
            narrative_parts.append(f"Reversal day potential - watch HTF zones for turning points.")
        else:
            narrative_parts.append(f"Consolidation day - reduce size or avoid.")

        sweeps = session_data.get('sweeps', [])
        if sweeps:
            sweep_desc = ", ".join([f"{s['level']}" for s in sweeps])
            narrative_parts.append(f"London session swept: {sweep_desc}.")

        return " ".join(narrative_parts)

    def _calculate_confidence(self, htf_bias, day_type, htf_data, session_data):
        """Calculate confidence score (0-1)."""
        confidence = 0.5

        if htf_bias != BiasType.NEUTRAL:
            confidence += 0.2

        if day_type == "trend":
            confidence += 0.15
        elif day_type == "consolidation":
            confidence -= 0.15

        if len(htf_data['order_blocks']) > 2:
            confidence += 0.1

        if len(session_data.get('sweeps', [])) > 0:
            confidence += 0.05

        return min(max(confidence, 0.0), 1.0)
```

### 2. Scheduler Service

**File:** `backend/app/services/scheduler.py`

```python
"""
APScheduler service for automated pre-market routine.
Runs at 6:30 AM NY time every weekday.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime
import pytz
import asyncio

from app.core.database import SessionLocal
from app.services.ict.pre_market_routine import PreMarketRoutineService
from app.core.config import settings


class SchedulerService:
    """
    Manages scheduled tasks for the trading system.
    """

    def __init__(self):
        self.scheduler = AsyncIOScheduler(timezone=pytz.timezone('America/New_York'))
        self.ny_tz = pytz.timezone('America/New_York')

    async def run_pre_market_routine(self):
        """Execute pre-market routine (scheduled task)."""
        print(f"\n{'='*70}")
        print(f"🔔 SCHEDULED TASK TRIGGERED: Pre-Market Routine")
        print(f"⏰ NY Time: {datetime.now(self.ny_tz).strftime('%Y-%m-%d %H:%M:%S %Z')}")
        print(f"{'='*70}\n")

        async with SessionLocal() as db:
            routine = PreMarketRoutineService(db)
            try:
                report = await routine.run_routine(symbol="QQQ")
                print(f"\n✅ Pre-market routine completed successfully!")
                print(f"📊 Report ID: {report.id}")
                print(f"🎯 Confidence: {report.confidence:.0%}\n")
            except Exception as e:
                print(f"\n❌ Pre-market routine failed: {str(e)}\n")
                raise

    def start(self):
        """Start the scheduler."""
        if not settings.ENABLE_SCHEDULER:
            print("⚠️ Scheduler is disabled in settings")
            return

        # Schedule pre-market routine: 6:30 AM NY time, Monday-Friday
        self.scheduler.add_job(
            self.run_pre_market_routine,
            trigger=CronTrigger(
                hour=6,
                minute=30,
                day_of_week='mon-fri',
                timezone=self.ny_tz
            ),
            id='pre_market_routine',
            name='Pre-Market Routine (6:30 AM NY)',
            replace_existing=True
        )

        self.scheduler.start()

        next_run = self.scheduler.get_job('pre_market_routine').next_run_time
        print(f"\n✅ Scheduler started")
        print(f"📅 Next pre-market routine: {next_run.strftime('%Y-%m-%d %H:%M:%S %Z')}\n")

    def shutdown(self):
        """Shutdown the scheduler."""
        self.scheduler.shutdown()
        print("\n🛑 Scheduler stopped\n")


# Global scheduler instance
scheduler_service = SchedulerService()
```

### 3. Enhanced Reports API

**File:** `backend/app/api/endpoints/reports.py` (add new endpoints)

```python
# Add to existing reports.py

@router.post("/generate", status_code=202)
async def generate_morning_report(
    symbol: str = "QQQ",
    target_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually trigger pre-market report generation.

    Useful for:
    - Testing the routine
    - Generating historical reports
    - On-demand analysis
    """
    try:
        from app.services.ict.pre_market_routine import PreMarketRoutineService

        routine = PreMarketRoutineService(db)
        report = await routine.run_routine(symbol=symbol, target_date=target_date)

        return {
            "status": "completed",
            "report_id": report.id,
            "date": report.date.isoformat(),
            "symbol": report.symbol,
            "message": "Pre-market report generated successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")


@router.get("/morning/{report_date}", response_model=PreMarketReportResponse)
async def get_morning_report(
    report_date: date,
    symbol: str = "QQQ",
    db: AsyncSession = Depends(get_db)
):
    """
    Get the morning pre-market report for a specific date.

    This is the primary endpoint for the AI Coach frontend.
    """
    try:
        query = select(PreMarketReport).where(
            PreMarketReport.date == report_date,
            PreMarketReport.symbol == symbol
        ).order_by(PreMarketReport.created_at.desc())

        result = await db.execute(query)
        report = result.scalar_one_or_none()

        if not report:
            raise HTTPException(
                status_code=404,
                detail=f"No morning report found for {symbol} on {report_date}"
            )

        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### 4. Main App Integration

**File:** `backend/app/main.py` (add scheduler startup)

```python
from app.services.scheduler import scheduler_service

@app.on_event("startup")
async def startup_event():
    """Run on application startup."""
    # ... existing startup code ...

    # Start scheduler
    scheduler_service.start()


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown."""
    # ... existing shutdown code ...

    # Stop scheduler
    scheduler_service.shutdown()
```

---

## 🎨 Frontend Implementation

### 1. Morning Report API Client

**File:** `next-frontend/src/lib/api/reports.ts`

```typescript
/**
 * Morning Report API Client
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_PREFIX = '/api/v1';

export interface MorningReport {
  id: number;
  date: string;
  symbol: string;

  // HTF Analysis
  htf_bias: 'bullish' | 'bearish' | 'neutral';
  htf_dealing_range_high: number;
  htf_dealing_range_low: number;
  htf_key_levels: {
    order_blocks: any[];
    fvgs: any[];
    liquidity: any[];
  };

  // Session Structure
  asian_session_high: number;
  asian_session_low: number;
  london_session_high: number;
  london_session_low: number;
  session_liquidity_sweeps: Array<{
    type: 'BSL' | 'SSL';
    level: string;
    price: number;
  }>;

  // Dealing Range Zones
  premium_zone: number;
  discount_zone: number;
  equilibrium: number;

  // Liquidity
  inducement_liquidity: Array<{
    type: string;
    price: number;
    description: string;
  }>;
  target_liquidity: Array<{
    type: string;
    price: number;
    description: string;
  }>;

  // Day Type
  day_type: 'trend' | 'reversal' | 'consolidation';
  day_type_reasoning: string;

  // Trade Scenarios
  long_scenario: TradeScenario;
  short_scenario: TradeScenario;

  // Narrative
  narrative: string;
  confidence: number;

  created_at: string;
}

export interface TradeScenario {
  entry_conditions: string[];
  entry_zone: { high: number; low: number };
  entry_type: string;
  stop_loss: number;
  targets: number[];
  invalidation: number;
  risk_reward: number;
  confluence_factors: string[];
  valid_time_window: string;
}

/**
 * Get morning report for a specific date
 */
export async function getMorningReport(
  date: string,
  symbol: string = 'QQQ'
): Promise<MorningReport> {
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/reports/morning/${date}?symbol=${symbol}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('No morning report found for this date');
    }
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch morning report');
  }

  return response.json();
}

/**
 * Manually generate morning report
 */
export async function generateMorningReport(
  symbol: string = 'QQQ',
  date?: string
): Promise<{ report_id: number; status: string; message: string }> {
  const params = new URLSearchParams({ symbol });
  if (date) params.append('target_date', date);

  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/reports/generate?${params}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to generate report');
  }

  return response.json();
}
```

### 2. Morning Report Display Component

**File:** `next-frontend/src/components/MorningReportCard.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getMorningReport, generateMorningReport, type MorningReport } from '@/lib/api/reports';

interface MorningReportCardProps {
  date?: string;
}

export default function MorningReportCard({ date }: MorningReportCardProps) {
  const [report, setReport] = useState<MorningReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const reportDate = date || new Date().toISOString().split('T')[0];

  useEffect(() => {
    loadReport();
  }, [reportDate]);

  const loadReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMorningReport(reportDate);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    try {
      setGenerating(true);
      setError(null);
      await generateMorningReport('QQQ', reportDate);
      await loadReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={handleGenerateReport}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg"
          >
            {generating ? 'Generating...' : 'Generate Morning Report'}
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const biasColor = {
    bullish: 'text-green-400',
    bearish: 'text-red-400',
    neutral: 'text-gray-400',
  }[report.htf_bias];

  const dayTypeColor = {
    trend: 'bg-green-600',
    reversal: 'bg-yellow-600',
    consolidation: 'bg-gray-600',
  }[report.day_type];

  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Morning Report - {report.symbol}</h2>
          <p className="text-sm text-gray-400">{report.date}</p>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold ${biasColor}`}>
            {report.htf_bias.toUpperCase()}
          </div>
          <div className="text-sm text-gray-400">
            Confidence: {(report.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Day Type */}
      <div>
        <span className={`px-3 py-1 rounded-lg text-sm font-medium ${dayTypeColor}`}>
          {report.day_type.toUpperCase()} DAY
        </span>
        <p className="text-sm text-gray-400 mt-2">{report.day_type_reasoning}</p>
      </div>

      {/* Narrative */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="font-medium mb-2">Market Narrative</h3>
        <p className="text-gray-300">{report.narrative}</p>
      </div>

      {/* Session Structure */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="font-medium mb-2 text-blue-400">Asian Session</h3>
          <div className="text-sm space-y-1">
            <div>High: {report.asian_session_high?.toFixed(2)}</div>
            <div>Low: {report.asian_session_low?.toFixed(2)}</div>
          </div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="font-medium mb-2 text-orange-400">London Session</h3>
          <div className="text-sm space-y-1">
            <div>High: {report.london_session_high?.toFixed(2)}</div>
            <div>Low: {report.london_session_low?.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Dealing Range */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="font-medium mb-2">Dealing Range</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">High:</span>
            <span>{report.htf_dealing_range_high?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-yellow-400">
            <span>Premium (61.8%):</span>
            <span>{report.premium_zone?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-300">
            <span>EQ (50%):</span>
            <span>{report.equilibrium?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-blue-400">
            <span>Discount (38.2%):</span>
            <span>{report.discount_zone?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Low:</span>
            <span>{report.htf_dealing_range_low?.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Trade Scenarios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Long Scenario */}
        <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
          <h3 className="font-medium mb-3 text-green-400">Long A+ Scenario</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-400">Entry Zone:</span>{' '}
              {report.long_scenario?.entry_zone.low.toFixed(2)} -{' '}
              {report.long_scenario?.entry_zone.high.toFixed(2)}
            </div>
            <div>
              <span className="text-gray-400">Stop:</span>{' '}
              {report.long_scenario?.stop_loss.toFixed(2)}
            </div>
            <div>
              <span className="text-gray-400">Targets:</span>{' '}
              {report.long_scenario?.targets.map((t) => t.toFixed(2)).join(', ')}
            </div>
            <div>
              <span className="text-gray-400">R:R:</span>{' '}
              {report.long_scenario?.risk_reward.toFixed(1)}
            </div>
            <div className="pt-2 border-t border-green-700/50">
              <div className="text-gray-400 mb-1">Conditions:</div>
              <ul className="list-disc list-inside text-xs space-y-1">
                {report.long_scenario?.entry_conditions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Short Scenario */}
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <h3 className="font-medium mb-3 text-red-400">Short A+ Scenario</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-400">Entry Zone:</span>{' '}
              {report.short_scenario?.entry_zone.low.toFixed(2)} -{' '}
              {report.short_scenario?.entry_zone.high.toFixed(2)}
            </div>
            <div>
              <span className="text-gray-400">Stop:</span>{' '}
              {report.short_scenario?.stop_loss.toFixed(2)}
            </div>
            <div>
              <span className="text-gray-400">Targets:</span>{' '}
              {report.short_scenario?.targets.map((t) => t.toFixed(2)).join(', ')}
            </div>
            <div>
              <span className="text-gray-400">R:R:</span>{' '}
              {report.short_scenario?.risk_reward.toFixed(1)}
            </div>
            <div className="pt-2 border-t border-red-700/50">
              <div className="text-gray-400 mb-1">Conditions:</div>
              <ul className="list-disc list-inside text-xs space-y-1">
                {report.short_scenario?.entry_conditions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Liquidity Sweeps */}
      {report.session_liquidity_sweeps && report.session_liquidity_sweeps.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="font-medium mb-2">Liquidity Sweeps</h3>
          <div className="space-y-1 text-sm">
            {report.session_liquidity_sweeps.map((sweep, i) => (
              <div key={i} className="flex justify-between">
                <span className={sweep.type === 'BSL' ? 'text-red-400' : 'text-green-400'}>
                  {sweep.type}: {sweep.level}
                </span>
                <span>{sweep.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### 3. Update AI Coach Page

**File:** `next-frontend/src/app/ai-coach/page.tsx` (add morning report section)

```typescript
// Add import
import MorningReportCard from '@/components/MorningReportCard';

// Inside the main chat area, add before messages section:
{currentSession && (
  <>
    {/* Morning Report Section */}
    <div className="p-4 border-b border-gray-700">
      <MorningReportCard date={currentSession.related_date || undefined} />
    </div>

    {/* Messages Section (existing code) */}
    ...
  </>
)}
```

---

## 📦 Dependencies

### Backend

**File:** `backend/requirements.txt` (add)

```
APScheduler==3.10.4
pytz==2023.3
```

### Frontend

No new dependencies needed (using existing fetch API).

---

## 🧪 Testing Strategy

### Unit Tests

**File:** `backend/tests/test_pre_market_routine.py`

```python
import pytest
from datetime import date
from app.services.ict.pre_market_routine import PreMarketRoutineService

@pytest.mark.asyncio
async def test_routine_execution(db_session):
    """Test full routine execution."""
    routine = PreMarketRoutineService(db_session)
    report = await routine.run_routine(symbol="QQQ")

    assert report is not None
    assert report.symbol == "QQQ"
    assert report.htf_bias is not None
    assert report.day_type in ["trend", "reversal", "consolidation"]
    assert report.long_scenario is not None
    assert report.short_scenario is not None

@pytest.mark.asyncio
async def test_step1_htf_bias(db_session):
    """Test HTF bias step."""
    routine = PreMarketRoutineService(db_session)
    bias, htf_data = await routine._step1_htf_bias("QQQ")

    assert bias in [BiasType.BULLISH, BiasType.BEARISH, BiasType.NEUTRAL]
    assert 'dealing_range' in htf_data
    assert 'order_blocks' in htf_data
```

### Integration Tests

**File:** `backend/tests/test_scheduler.py`

```python
import pytest
from app.services.scheduler import SchedulerService

def test_scheduler_initialization():
    """Test scheduler can be initialized."""
    scheduler = SchedulerService()
    assert scheduler is not None
    assert scheduler.scheduler is not None
```

### Manual Testing Checklist

- [ ] Run routine manually via API endpoint
- [ ] Verify report saved to database
- [ ] Check all 6 steps execute correctly
- [ ] Validate long/short scenarios have valid prices
- [ ] Test frontend report display
- [ ] Test report generation button
- [ ] Verify error handling for missing data
- [ ] Test with different symbols

---

## 🚀 Deployment Checklist

### Environment Variables

**File:** `backend/.env` (add)

```bash
# Scheduler Settings
ENABLE_SCHEDULER=true
PRE_MARKET_CRON="0 6 * * 1-5"  # 6:00 AM weekdays (will run routine at 6:30 AM)

# Alpha Vantage
ALPHA_VANTAGE_API_KEY=your_key_here

# Database
DATABASE_URL=your_database_url
```

### Database Migration

```bash
# Generate migration
cd backend
alembic revision --autogenerate -m "Add enhanced pre-market fields"

# Review migration file
# Edit if necessary

# Run migration
alembic upgrade head
```

### Scheduler Setup

**For Production (PM2 or systemd):**
```bash
# Ensure backend stays running for scheduler
pm2 start "uvicorn app.main:app --host 0.0.0.0 --port 8000" --name ict-backend
pm2 save
pm2 startup
```

**For Development:**
```bash
# Run backend with scheduler enabled
cd backend
ENABLE_SCHEDULER=true uvicorn app.main:app --reload
```

---

## 📅 Implementation Timeline

### Phase 1: Database & Core Logic (Week 1)
- **Day 1-2:** Database schema changes & migration
- **Day 3-5:** Implement PreMarketRoutineService (all 6 steps)
- **Day 6-7:** Unit tests for routine service

### Phase 2: Scheduling & API (Week 2)
- **Day 1-2:** Implement SchedulerService
- **Day 3:** Add API endpoints for reports
- **Day 4-5:** Integration testing
- **Day 6-7:** Frontend API client & MorningReportCard component

### Phase 3: Frontend Integration (Week 3)
- **Day 1-2:** Integrate MorningReportCard into AI Coach page
- **Day 3:** Add manual trigger button
- **Day 4:** Styling & UX improvements
- **Day 5-7:** End-to-end testing & bug fixes

### Phase 4: Production Deployment (Week 4)
- **Day 1:** Deploy database migration
- **Day 2:** Deploy backend with scheduler
- **Day 3:** Deploy frontend
- **Day 4:** Monitor first automated run
- **Day 5-7:** Performance tuning & documentation

---

## 📊 Success Metrics

### Technical Metrics
- ✅ Routine executes successfully every weekday at 6:30 AM NY
- ✅ Report generation time < 30 seconds
- ✅ API response time < 500ms
- ✅ Zero crashes or errors for 1 week
- ✅ All 6 steps complete successfully

### Business Metrics
- ✅ HTF bias accuracy > 70% over 30 days
- ✅ Day type classification accuracy > 65%
- ✅ User engagement with morning reports > 80%
- ✅ Trade plan scenarios align with market movement

---

## 🔐 Security & Best Practices

### API Security
- Rate limit report generation endpoint (max 10/hour per IP)
- Require authentication for manual trigger
- Validate date inputs to prevent injection

### Data Privacy
- Reports are user-specific (add user_id when auth implemented)
- No PII stored in reports
- Market data only

### Error Handling
- Graceful degradation if Alpha Vantage API fails
- Fallback to mock data in development
- Alert admin if routine fails
- Retry logic for transient failures

---

## 📚 Next Steps After Implementation

### Immediate (Week 5-6)
- Add email notifications for morning reports
- Implement report comparison (today vs yesterday)
- Add historical report archive view

### Short-term (Month 2-3)
- Multi-symbol support (ES, SPY, AAPL)
- Real-time price tracking vs. planned scenarios
- Performance tracking (actual vs. predicted)

### Long-term (Month 4+)
- Machine learning for bias prediction improvement
- Automated trade execution integration
- Mobile app notifications

---

## 🤝 Support & Documentation

### Code Documentation
- All functions have docstrings
- Type hints for all parameters
- Inline comments for complex logic

### User Documentation
- How to read morning reports
- Understanding day types
- How to use A+ scenarios

### Developer Documentation
- Architecture diagrams
- API contracts
- Database schema

---

## 📝 Appendix

### Glossary
- **HTF:** Higher Timeframe (Daily, 4H)
- **LTF:** Lower Timeframe (1H, 15m, 5m)
- **BSL:** Buy-Side Liquidity (stops above highs)
- **SSL:** Sell-Side Liquidity (stops below lows)
- **FVG:** Fair Value Gap (imbalance in price)
- **OB:** Order Block (institutional footprint)
- **EQ:** Equilibrium (50% of range)
- **OTE:** Optimal Trade Entry (62-79% retracement)
- **PD Array:** Premium/Discount Array (FVG, OB, Breaker)

### References
- ICT Concepts Documentation
- Alpha Vantage API Docs
- APScheduler Documentation

---

**Last Updated:** 2025-01-15
**Version:** 1.0
**Status:** Ready for Implementation 🚀
