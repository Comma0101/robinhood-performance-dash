"""
Pydantic schemas for API request/response validation.
These provide type safety and automatic documentation.
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

from app.models.trading import BiasType, SessionType, TradeStatus, AlertType


# ============================================================================
# Pre-Market Report Schemas
# ============================================================================

class HTFAnalysis(BaseModel):
    """Higher timeframe analysis."""
    bias: BiasType
    dealing_range_high: Optional[float] = None
    dealing_range_low: Optional[float] = None
    key_levels: Dict[str, List[Any]] = Field(
        default_factory=dict,
        description="Order blocks, FVGs, liquidity zones"
    )


class LTFAnalysis(BaseModel):
    """Lower timeframe analysis."""
    structure: str = Field(..., description="Market structure: higher_highs, lower_lows, etc")
    entry_zones: List[Dict[str, Any]] = Field(default_factory=list)


class PreMarketReportCreate(BaseModel):
    """Create pre-market report."""
    date: date
    symbol: str = Field(..., min_length=1, max_length=20)
    htf_bias: BiasType
    htf_dealing_range_high: Optional[float] = None
    htf_dealing_range_low: Optional[float] = None
    htf_key_levels: Dict[str, List[Any]]
    ltf_structure: str
    ltf_entry_zones: List[Dict[str, Any]]
    target_sessions: List[str]
    narrative: str
    trade_plan: Dict[str, Any]
    confidence: float = Field(..., ge=0, le=1)


class PreMarketReportResponse(BaseModel):
    """Pre-market report response."""
    id: int
    date: date
    symbol: str

    # HTF Analysis
    htf_bias: BiasType
    htf_dealing_range_high: Optional[float]
    htf_dealing_range_low: Optional[float]
    htf_key_levels: Dict[str, List[Any]]

    # LTF Structure
    ltf_structure: str
    ltf_entry_zones: List[Dict[str, Any]]

    # Session Structure (NEW FIELDS)
    asian_session_high: Optional[float] = None
    asian_session_low: Optional[float] = None
    london_session_high: Optional[float] = None
    london_session_low: Optional[float] = None
    session_liquidity_sweeps: Optional[List[Dict[str, Any]]] = None
    # Session completeness metadata
    asian_bars_count: Optional[int] = None
    london_bars_count: Optional[int] = None
    sessions_last_ts: Optional[datetime] = None
    asian_complete: Optional[bool] = None
    london_complete: Optional[bool] = None
    london_made_high: Optional[bool] = None
    london_made_low: Optional[bool] = None

    # Dealing Range Zones (NEW FIELDS)
    premium_zone: Optional[float] = None
    discount_zone: Optional[float] = None
    equilibrium: Optional[float] = None
    dealing_range_source: Optional[str] = None

    # Liquidity Locations (NEW FIELDS)
    inducement_liquidity: Optional[List[Dict[str, Any]]] = None
    target_liquidity: Optional[List[Dict[str, Any]]] = None

    # Day Type Classification (NEW FIELDS)
    day_type: str = "unknown"
    day_type_reasoning: Optional[str] = None

    # Trade Scenarios (NEW FIELDS)
    long_scenario: Optional[Dict[str, Any]] = None
    short_scenario: Optional[Dict[str, Any]] = None

    # Target sessions and narrative
    target_sessions: List[str]
    narrative: str
    trade_plan: Dict[str, Any]
    confidence: float
    post_market_summary: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Entry Setup Schemas
# ============================================================================

class EntrySetupCreate(BaseModel):
    """Create entry setup."""
    report_id: int
    session: SessionType
    symbol: str = Field(..., min_length=1, max_length=20)
    timeframe: str
    direction: str = Field(..., pattern="^(long|short)$")
    entry_price: float = Field(..., gt=0)
    stop_loss: float = Field(..., gt=0)
    target_1: float = Field(..., gt=0)
    target_2: Optional[float] = Field(None, gt=0)
    target_3: Optional[float] = Field(None, gt=0)
    setup_type: str
    confluence_factors: List[str]
    risk_reward: float = Field(..., gt=0)


class EntrySetupResponse(BaseModel):
    """Entry setup response."""
    id: int
    report_id: int
    detected_at: datetime
    session: SessionType
    symbol: str
    timeframe: str
    direction: str
    entry_price: float
    stop_loss: float
    target_1: float
    target_2: Optional[float]
    target_3: Optional[float]
    setup_type: str
    confluence_factors: List[str]
    risk_reward: float
    executed: bool
    execution_notes: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Trade Schemas
# ============================================================================

class TradeCreate(BaseModel):
    """Create trade."""
    setup_id: Optional[int] = None
    symbol: str = Field(..., min_length=1, max_length=20)
    date: date
    session: SessionType
    entry_time: datetime
    entry_price: float = Field(..., gt=0)
    position_size: float = Field(..., gt=0)
    direction: str = Field(..., pattern="^(long|short)$")
    stop_loss: float = Field(..., gt=0)
    target_1: float = Field(..., gt=0)
    target_2: Optional[float] = Field(None, gt=0)
    target_3: Optional[float] = Field(None, gt=0)
    entry_notes: Optional[str] = None


class TradeUpdate(BaseModel):
    """Update trade (partial)."""
    exit_time: Optional[datetime] = None
    exit_price: Optional[float] = Field(None, gt=0)
    target_1_hit: Optional[bool] = None
    target_2_hit: Optional[bool] = None
    target_3_hit: Optional[bool] = None
    pnl: Optional[float] = None
    pnl_percent: Optional[float] = None
    mae: Optional[float] = None
    mfe: Optional[float] = None
    status: Optional[TradeStatus] = None
    exit_notes: Optional[str] = None


class TradeResponse(BaseModel):
    """Trade response."""
    id: int
    setup_id: Optional[int]
    symbol: str
    date: date
    session: SessionType
    entry_time: datetime
    entry_price: float
    position_size: float
    direction: str
    exit_time: Optional[datetime]
    exit_price: Optional[float]
    stop_loss: float
    target_1: float
    target_1_hit: bool
    target_2: Optional[float]
    target_2_hit: bool
    target_3: Optional[float]
    target_3_hit: bool
    pnl: Optional[float]
    pnl_percent: Optional[float]
    mae: Optional[float]
    mfe: Optional[float]
    status: TradeStatus
    entry_notes: Optional[str]
    exit_notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Daily Metrics Schemas
# ============================================================================

class DailyMetricsResponse(BaseModel):
    """Daily metrics response."""
    id: int
    report_id: int
    date: date
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    gross_pnl: float
    net_pnl: float
    largest_win: float
    largest_loss: float
    avg_win: float
    avg_loss: float
    profit_factor: float
    sharpe_ratio: Optional[float]
    avg_mae: float
    avg_mfe: float
    target_1_hit_rate: float
    target_2_hit_rate: float
    session_stats: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Coach Session Schemas
# ============================================================================

class ChatMessage(BaseModel):
    """Single chat message."""
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class CoachSessionCreate(BaseModel):
    """Create coach session."""
    phase: Optional[str] = Field(None, description="pre_market, kill_zone, or post_market")
    related_date: Optional[date] = None
    related_trade_id: Optional[int] = None


class CoachSessionUpdate(BaseModel):
    """Update coach session."""
    messages: Optional[List[ChatMessage]] = None
    key_insights: Optional[List[str]] = None
    action_items: Optional[List[str]] = None
    ended_at: Optional[datetime] = None


class CoachSessionResponse(BaseModel):
    """Coach session response."""
    id: int
    session_id: str
    started_at: datetime
    ended_at: Optional[datetime]
    phase: str
    related_date: Optional[date]
    related_trade_id: Optional[int]
    messages: List[Dict[str, Any]]
    key_insights: Optional[List[str]]
    action_items: Optional[List[str]]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Alert Schemas
# ============================================================================

class AlertCreate(BaseModel):
    """Create alert."""
    alert_type: AlertType
    symbol: str = Field(..., min_length=1, max_length=20)
    timeframe: str
    title: str = Field(..., max_length=200)
    message: str
    priority: int = Field(default=1, ge=1, le=3)
    price: Optional[float] = Field(None, gt=0)
    related_setup_id: Optional[int] = None
    extra_data: Optional[Dict[str, Any]] = None


class AlertResponse(BaseModel):
    """Alert response."""
    id: int
    alert_type: AlertType
    symbol: str
    timeframe: str
    title: str
    message: str
    priority: int
    price: Optional[float]
    related_setup_id: Optional[int]
    extra_data: Optional[Dict[str, Any]]
    is_read: bool
    is_dismissed: bool
    triggered_at: datetime
    read_at: Optional[datetime]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# ICT Analysis Request/Response Schemas
# ============================================================================

class OHLCVData(BaseModel):
    """OHLCV candlestick data."""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class ICTAnalysisRequest(BaseModel):
    """Request for ICT analysis."""
    symbol: str = Field(..., min_length=1, max_length=20)
    timeframes: List[str] = Field(
        default=["1D", "4H", "1H", "15m", "5m"],
        description="Timeframes to analyze"
    )
    analysis_type: str = Field(
        default="full",
        pattern="^(full|bias_only|structure_only)$"
    )


class OrderBlock(BaseModel):
    """Order block structure."""
    high: float
    low: float
    timestamp: datetime
    direction: str  # "bullish" or "bearish"
    strength: float = Field(..., ge=0, le=1)


class FVG(BaseModel):
    """Fair Value Gap."""
    high: float
    low: float
    timestamp: datetime
    gap_size: float
    direction: str = "neutral"  # "bullish" or "bearish"
    filled: bool = False
    mitigated: bool = False
    invalidated: bool = False


class LiquidityZone(BaseModel):
    """Liquidity zone."""
    price: float
    zone_type: str  # "buy_side" or "sell_side"
    strength: float = Field(..., ge=0, le=1)


class ICTAnalysisResponse(BaseModel):
    """ICT analysis response."""
    symbol: str
    analyzed_at: datetime
    htf_bias: BiasType
    dealing_range: Optional[Dict[str, float]] = None
    order_blocks: List[OrderBlock]
    fvgs: List[FVG]
    liquidity_zones: List[LiquidityZone]
    market_structure: str
    narrative: str
    confidence: float = Field(..., ge=0, le=1)
    
    # Session Data
    asian_session_high: Optional[float] = None
    asian_session_low: Optional[float] = None
    london_session_high: Optional[float] = None
    london_session_low: Optional[float] = None


# ============================================================================
# Trade Plan Schema (from LangChain structured output)
# ============================================================================

class TradePlan(BaseModel):
    """Structured trade plan output from AI agent."""
    symbol: str
    timeframe: str
    direction: str = Field(..., pattern="^(long|short)$")
    bias: BiasType
    entry_zone: Dict[str, float]  # {high, low}
    stop_loss: float
    targets: List[float] = Field(..., min_length=1, max_length=3)
    confluence_factors: List[str]
    risk_reward_ratio: float
    narrative: str
    session_preference: List[SessionType]
    confidence: float = Field(..., ge=0, le=1)
