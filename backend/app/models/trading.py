"""
Database models for ICT trading system.
Based on ICT_AGENT_ARCHITECTURE.md schema.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Integer, Float, Boolean, Text, JSON,
    DateTime, Date, ForeignKey, Enum as SQLEnum, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.mutable import MutableList
import enum

from app.core.database import Base


class BiasType(str, enum.Enum):
    """Market bias types."""
    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"


class SessionType(str, enum.Enum):
    """Trading session/kill zone types."""
    ASIAN = "asian"
    LONDON = "london"
    NEW_YORK = "new_york"
    LONDON_OPEN = "london_open"
    NY_OPEN = "ny_open"


class TradeStatus(str, enum.Enum):
    """Trade execution status."""
    PENDING = "pending"
    ENTERED = "entered"
    STOPPED = "stopped"
    TARGET_1_HIT = "target_1_hit"
    TARGET_2_HIT = "target_2_hit"
    TARGET_3_HIT = "target_3_hit"
    CLOSED = "closed"


class AlertType(str, enum.Enum):
    """Alert types."""
    ENTRY = "entry"
    EXIT = "exit"
    LIQUIDITY = "liquidity"
    STRUCTURE_BREAK = "structure_break"
    ZONE_ENTRY = "zone_entry"


class PreMarketReport(Base):
    """Pre-market analysis reports generated daily."""
    __tablename__ = "pre_market_reports"
    __table_args__ = (
        UniqueConstraint('date', 'symbol', name='uq_report_date_symbol'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[datetime] = mapped_column(Date, index=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)

    # HTF Analysis
    htf_bias: Mapped[BiasType] = mapped_column(SQLEnum(BiasType))
    htf_dealing_range_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    htf_dealing_range_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    htf_key_levels: Mapped[dict] = mapped_column(JSON)  # {orderBlocks: [], fvgs: [], liquidity: []}

    # LTF Analysis
    ltf_structure: Mapped[str] = mapped_column(String(50))  # "higher_highs", "lower_lows", etc
    ltf_entry_zones: Mapped[list] = mapped_column(JSON)  # Array of potential entry zones

    # ========== STEP 2: Session Structure (NEW FIELDS) ==========
    asian_session_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    asian_session_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    london_session_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    london_session_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    session_liquidity_sweeps: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # [{type: "SSL", price: 123.45}]
    target_sessions: Mapped[list] = mapped_column(JSON)  # ["london_open", "ny_open"]
    # Session completeness metadata (optional)
    asian_bars_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    london_bars_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sessions_last_ts: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    asian_complete: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    london_complete: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    london_made_high: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    london_made_low: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    # ========== STEP 3: Dealing Range Zones (NEW FIELDS) ==========
    premium_zone: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 61.8% level
    discount_zone: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 38.2% level
    equilibrium: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 50% level
    dealing_range_source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # prev_day | htf | recent_1D

    # ========== STEP 4: Liquidity Locations (NEW FIELDS) ==========
    inducement_liquidity: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # Likely to be swept
    target_liquidity: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # Final targets

    # ========== STEP 5: Day Type Classification (NEW FIELDS) ==========
    day_type: Mapped[str] = mapped_column(String(20), default="unknown")  # "trend", "reversal", "consolidation"
    day_type_reasoning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ========== STEP 6: Trade Scenarios (NEW FIELDS) ==========
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
        "confluence_factors": ["Daily bias bullish", "Discount entry"],
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
        "confluence_factors": ["Daily bias bearish", "Premium entry"],
        "valid_time_window": "08:30-11:00 NY"
    }
    """

    # Narrative & Plan
    narrative: Mapped[str] = mapped_column(Text)
    trade_plan: Mapped[dict] = mapped_column(JSON)  # Structured trade plan
    confidence: Mapped[float] = mapped_column(Float)  # 0-1
    post_market_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # End of day summary from AI Coach

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    setups: Mapped[list["EntrySetup"]] = relationship("EntrySetup", back_populates="report")
    daily_metrics: Mapped[Optional["DailyMetrics"]] = relationship("DailyMetrics", back_populates="report", uselist=False)


class EntrySetup(Base):
    """Real-time entry setups detected during kill zones."""
    __tablename__ = "entry_setups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("pre_market_reports.id"), index=True)

    # Setup Details
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    session: Mapped[SessionType] = mapped_column(SQLEnum(SessionType))
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    timeframe: Mapped[str] = mapped_column(String(10))  # "5m", "15m", etc

    # Entry Parameters
    direction: Mapped[str] = mapped_column(String(10))  # "long", "short"
    entry_price: Mapped[float] = mapped_column(Float)
    stop_loss: Mapped[float] = mapped_column(Float)
    target_1: Mapped[float] = mapped_column(Float)
    target_2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Setup Context
    setup_type: Mapped[str] = mapped_column(String(50))  # "OB_retest", "FVG_fill", "liquidity_sweep"
    confluence_factors: Mapped[list] = mapped_column(JSON)  # Array of confluence reasons
    risk_reward: Mapped[float] = mapped_column(Float)

    # Status
    executed: Mapped[bool] = mapped_column(Boolean, default=False)
    execution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    report: Mapped["PreMarketReport"] = relationship("PreMarketReport", back_populates="setups")
    trade: Mapped[Optional["Trade"]] = relationship("Trade", back_populates="setup", uselist=False)


class Trade(Base):
    """Executed trades with full lifecycle tracking."""
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    setup_id: Mapped[Optional[int]] = mapped_column(ForeignKey("entry_setups.id"), nullable=True, index=True)

    # Trade Identification
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    date: Mapped[datetime] = mapped_column(Date, index=True)
    session: Mapped[SessionType] = mapped_column(SQLEnum(SessionType))

    # Entry
    entry_time: Mapped[datetime] = mapped_column(DateTime)
    entry_price: Mapped[float] = mapped_column(Float)
    position_size: Mapped[float] = mapped_column(Float)
    direction: Mapped[str] = mapped_column(String(10))  # "long", "short"

    # Exit
    exit_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    exit_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stop_loss: Mapped[float] = mapped_column(Float)

    # Targets
    target_1: Mapped[float] = mapped_column(Float)
    target_1_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    target_2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_2_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    target_3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_3_hit: Mapped[bool] = mapped_column(Boolean, default=False)

    # Performance
    pnl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pnl_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    mae: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Max Adverse Excursion
    mfe: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Max Favorable Excursion

    # Status
    status: Mapped[TradeStatus] = mapped_column(SQLEnum(TradeStatus), default=TradeStatus.PENDING)

    # Notes
    entry_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    exit_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    setup: Mapped[Optional["EntrySetup"]] = relationship("EntrySetup", back_populates="trade")


class DailyMetrics(Base):
    """Daily performance metrics and statistics."""
    __tablename__ = "daily_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("pre_market_reports.id"), unique=True, index=True)
    date: Mapped[datetime] = mapped_column(Date, unique=True, index=True)

    # Trade Statistics
    total_trades: Mapped[int] = mapped_column(Integer, default=0)
    winning_trades: Mapped[int] = mapped_column(Integer, default=0)
    losing_trades: Mapped[int] = mapped_column(Integer, default=0)
    win_rate: Mapped[float] = mapped_column(Float, default=0.0)

    # P&L
    gross_pnl: Mapped[float] = mapped_column(Float, default=0.0)
    net_pnl: Mapped[float] = mapped_column(Float, default=0.0)
    largest_win: Mapped[float] = mapped_column(Float, default=0.0)
    largest_loss: Mapped[float] = mapped_column(Float, default=0.0)

    # Performance Metrics
    avg_win: Mapped[float] = mapped_column(Float, default=0.0)
    avg_loss: Mapped[float] = mapped_column(Float, default=0.0)
    profit_factor: Mapped[float] = mapped_column(Float, default=0.0)
    sharpe_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Execution Quality
    avg_mae: Mapped[float] = mapped_column(Float, default=0.0)
    avg_mfe: Mapped[float] = mapped_column(Float, default=0.0)
    target_1_hit_rate: Mapped[float] = mapped_column(Float, default=0.0)
    target_2_hit_rate: Mapped[float] = mapped_column(Float, default=0.0)

    # Session Performance
    session_stats: Mapped[dict] = mapped_column(JSON)  # {asian: {...}, london: {...}, ny: {...}}

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    report: Mapped["PreMarketReport"] = relationship("PreMarketReport", back_populates="daily_metrics")


class CoachSession(Base):
    """AI coach chat sessions and feedback."""
    __tablename__ = "coach_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)

    # Session Details
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Context
    phase: Mapped[str] = mapped_column(String(50))  # "pre_market", "kill_zone", "post_market"
    related_date: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    related_trade_id: Mapped[Optional[int]] = mapped_column(ForeignKey("trades.id"), nullable=True)

    # Conversation
    messages: Mapped[list] = mapped_column(MutableList.as_mutable(JSON), default=list)  # Array of {role, content, timestamp}

    # Feedback & Insights
    key_insights: Mapped[Optional[list]] = mapped_column(MutableList.as_mutable(JSON), nullable=True)
    action_items: Mapped[Optional[list]] = mapped_column(MutableList.as_mutable(JSON), nullable=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Alert(Base):
    """Real-time alerts for trading opportunities and events."""
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Alert Details
    alert_type: Mapped[AlertType] = mapped_column(SQLEnum(AlertType), index=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    timeframe: Mapped[str] = mapped_column(String(10))

    # Alert Content
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(Integer, default=1)  # 1=low, 2=medium, 3=high

    # Context
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    related_setup_id: Mapped[Optional[int]] = mapped_column(ForeignKey("entry_setups.id"), nullable=True)
    extra_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Status
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Timestamps
    triggered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
