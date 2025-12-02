"""
ICT Analysis Service - Core technical analysis implementation.

This module provides comprehensive ICT (Inner Circle Trader) analysis including:
- Market bias determination (bullish/bearish/neutral)
- Order block identification and ranking
- Fair Value Gap (FVG) detection
- Liquidity zone mapping
- Market structure analysis
- Dealing range identification
"""
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
import pandas as pd
import numpy as np

from app.schemas.trading import (
    ICTAnalysisResponse,
    OrderBlock,
    FVG,
    LiquidityZone,
    BiasType
)
from app.services.ict.order_blocks import detect_order_blocks
from app.services.ict.fvg import detect_fvgs
from app.services.ict.liquidity import detect_liquidity_zones
from app.services.ict.structure import analyze_market_structure
from app.utils.data_fetcher import fetch_ohlcv


class ICTAnalyzer:
    """
    Main ICT analysis service.

    Coordinates all ICT analysis components and provides
    multi-timeframe analysis capabilities.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def analyze(
        self,
        symbol: str,
        timeframes: List[str],
        analysis_type: str = "full"
    ) -> ICTAnalysisResponse:
        """
        Perform complete ICT analysis on symbol across multiple timeframes.

        Args:
            symbol: Trading symbol (e.g., "NQ", "ES", "AAPL")
            timeframes: List of timeframes to analyze (e.g., ["1D", "4H", "1H"])
            analysis_type: "full", "bias_only", or "structure_only"

        Returns:
            ICTAnalysisResponse with complete analysis results
        """
        # Fetch primary timeframe data (typically highest timeframe)
        primary_tf = timeframes[0]
        df = await fetch_ohlcv(symbol, primary_tf, limit=500)
        
        # Fetch 1H data for session analysis
        df_1h = await fetch_ohlcv(symbol, "1H", limit=48)

        # Validate data
        if not isinstance(df, pd.DataFrame) or df.empty:
            print(f"⚠️ Analysis aborted: Invalid or empty data for {symbol}")
            return ICTAnalysisResponse(
                symbol=symbol,
                analyzed_at=datetime.utcnow(),
                htf_bias=BiasType.NEUTRAL,
                dealing_range=None,
                order_blocks=[],
                fvgs=[],
                liquidity_zones=[],
                market_structure="Unknown",
                narrative="Analysis unavailable due to data fetching error.",
                confidence=0.0
            )

        # Determine market bias
        bias = self._determine_bias(df)

        # Identify dealing range (HTF high/low)
        dealing_range = self._find_dealing_range(df)

        # Detect order blocks
        order_blocks = []
        if analysis_type in ["full", "structure_only"]:
            order_blocks = detect_order_blocks(df)
            # Rank and filter top order blocks
            order_blocks = self._rank_order_blocks(order_blocks, bias)[:5]

        # Detect FVGs
        fvgs = []
        if analysis_type in ["full", "structure_only"]:
            fvgs = detect_fvgs(df)
            # Filter unfilled FVGs
            fvgs = [fvg for fvg in fvgs if not fvg.filled][:5]

        # Detect liquidity zones
        liquidity_zones = []
        if analysis_type == "full":
            liquidity_zones = detect_liquidity_zones(df)
            liquidity_zones = liquidity_zones[:5]

        # Analyze market structure
        market_structure = analyze_market_structure(df)

        # Analyze sessions (Asian/London)
        session_levels = self._analyze_sessions(df_1h)

        # Generate narrative
        narrative = self._generate_narrative(
            symbol=symbol,
            bias=bias,
            dealing_range=dealing_range,
            order_blocks=order_blocks,
            fvgs=fvgs,
            market_structure=market_structure
        )

        # Calculate confidence score
        confidence = self._calculate_confidence(
            bias=bias,
            order_blocks=order_blocks,
            fvgs=fvgs,
            market_structure=market_structure
        )

        return ICTAnalysisResponse(
            symbol=symbol,
            analyzed_at=datetime.utcnow(),
            htf_bias=bias,
            dealing_range=dealing_range,
            order_blocks=order_blocks,
            fvgs=fvgs,
            liquidity_zones=liquidity_zones,
            market_structure=market_structure,
            narrative=narrative,
            confidence=confidence,
            asian_session_high=session_levels.get('asian_session_high'),
            asian_session_low=session_levels.get('asian_session_low'),
            london_session_high=session_levels.get('london_session_high'),
            london_session_low=session_levels.get('london_session_low')
        )

    def _determine_bias(self, df: pd.DataFrame) -> BiasType:
        """
        Determine market bias based on price action.

        Uses:
        - Recent price direction
        - Moving average position
        - Higher highs / lower lows
        """
        if df is None or len(df) < 20:
            return BiasType.NEUTRAL

        # Calculate simple moving averages
        df['sma_20'] = df['close'].rolling(20).mean()
        df['sma_50'] = df['close'].rolling(50).mean()

        current_price = df['close'].iloc[-1]
        sma_20 = df['sma_20'].iloc[-1]
        sma_50 = df['sma_50'].iloc[-1]

        # Check recent swing highs/lows
        recent_high = df['high'].iloc[-20:].max()
        recent_low = df['low'].iloc[-20:].min()
        prev_high = df['high'].iloc[-40:-20].max()
        prev_low = df['low'].iloc[-40:-20].min()

        # Scoring system
        bullish_score = 0
        bearish_score = 0

        # Price above/below MAs
        if current_price > sma_20 > sma_50:
            bullish_score += 2
        elif current_price < sma_20 < sma_50:
            bearish_score += 2

        # Higher highs / lower lows
        if recent_high > prev_high and recent_low > prev_low:
            bullish_score += 2  # Higher highs and higher lows
        elif recent_high < prev_high and recent_low < prev_low:
            bearish_score += 2  # Lower highs and lower lows

        # Recent momentum
        price_change = (current_price - df['close'].iloc[-10]) / df['close'].iloc[-10]
        if price_change > 0.02:  # 2% up
            bullish_score += 1
        elif price_change < -0.02:  # 2% down
            bearish_score += 1

        # Determine bias
        if bullish_score >= bearish_score + 2:
            return BiasType.BULLISH
        elif bearish_score >= bullish_score + 2:
            return BiasType.BEARISH
        else:
            return BiasType.NEUTRAL

    def _find_dealing_range(self, df: pd.DataFrame) -> Optional[Dict[str, float]]:
        """
        Identify the dealing range (consolidation area).

        Returns the high and low of the recent ranging period.
        """
        if len(df) < 50:
            return None

        # Look at recent 50 candles
        recent = df.tail(50)

        # Find range high and low
        range_high = recent['high'].max()
        range_low = recent['low'].min()

        return {
            "high": float(range_high),
            "low": float(range_low)
        }

    def _rank_order_blocks(
        self,
        order_blocks: List[OrderBlock],
        bias: BiasType
    ) -> List[OrderBlock]:
        """
        Rank order blocks by relevance to current bias.

        Priority:
        - Direction aligned with bias
        - Strength score
        - Recency
        """
        if not order_blocks:
            return []

        # Filter by bias direction
        if bias == BiasType.BULLISH:
            relevant_obs = [ob for ob in order_blocks if ob.direction == "bullish"]
        elif bias == BiasType.BEARISH:
            relevant_obs = [ob for ob in order_blocks if ob.direction == "bearish"]
        else:
            relevant_obs = order_blocks

        # Sort by strength (descending)
        relevant_obs.sort(key=lambda x: x.strength, reverse=True)

        return relevant_obs

    def _generate_narrative(
        self,
        symbol: str,
        bias: BiasType,
        dealing_range: Optional[Dict[str, float]],
        order_blocks: List[OrderBlock],
        fvgs: List[FVG],
        market_structure: str
    ) -> str:
        """Generate human-readable narrative of market conditions."""
        parts = []

        # Bias statement
        parts.append(f"{symbol} shows a {bias.value} bias.")

        # Market structure
        parts.append(f"Market structure: {market_structure}.")

        # Dealing range
        if dealing_range:
            parts.append(
                f"Dealing range: {dealing_range['low']:.2f} - {dealing_range['high']:.2f}."
            )

        # Key order blocks
        if order_blocks:
            top_ob = order_blocks[0]
            parts.append(
                f"Key {top_ob.direction} order block at {top_ob.low:.2f}-{top_ob.high:.2f} "
                f"(strength: {top_ob.strength:.2f})."
            )

        # Open FVGs
        if fvgs:
            parts.append(f"{len(fvgs)} unfilled FVGs present.")

        return " ".join(parts)

    def _calculate_confidence(
        self,
        bias: BiasType,
        order_blocks: List[OrderBlock],
        fvgs: List[FVG],
        market_structure: str
    ) -> float:
        """
        Calculate confidence score (0-1) based on analysis clarity.

        Higher confidence when:
        - Clear bias (not neutral)
        - Strong order blocks present
        - Clear market structure
        - Multiple confluence factors
        """
        confidence = 0.5  # Base confidence

        # Bias clarity
        if bias != BiasType.NEUTRAL:
            confidence += 0.15

        # Order block quality
        if order_blocks:
            avg_strength = sum(ob.strength for ob in order_blocks[:3]) / min(len(order_blocks), 3)
            confidence += avg_strength * 0.2

        # Market structure clarity
        if "higher" in market_structure.lower() or "lower" in market_structure.lower():
            confidence += 0.1

        # FVG presence (confluence)
        if fvgs:
            confidence += 0.05

        return min(confidence, 1.0)

    async def get_bias(self, symbol: str, timeframe: str) -> BiasType:
        """Quick method to get just the bias."""
        df = await fetch_ohlcv(symbol, timeframe, limit=100)
        return self._determine_bias(df)

    async def get_key_levels(self, symbol: str, timeframe: str) -> Dict[str, Any]:
        """Quick method to get key levels only."""
        df = await fetch_ohlcv(symbol, timeframe, limit=200)

        order_blocks = detect_order_blocks(df)[:3]
        fvgs = detect_fvgs(df)[:3]
        liquidity_zones = detect_liquidity_zones(df)[:3]

        return {
            "order_blocks": [ob.model_dump() for ob in order_blocks],
            "fvgs": [fvg.model_dump() for fvg in fvgs],
            "liquidity_zones": [lz.model_dump() for lz in liquidity_zones]
        }

    def _analyze_sessions(self, df_1h: pd.DataFrame) -> Dict[str, float]:
        """
        Analyze session highs/lows from 1H data.
        Assumes timestamps are in EST (Alpha Vantage default).
        
        Asian: ~18:00 - 02:00 EST
        London: ~02:00 - 07:00 EST
        """
        if df_1h is None or df_1h.empty:
            return {}
            
        # Convert to datetime if not already
        if not pd.api.types.is_datetime64_any_dtype(df_1h['timestamp']):
            df_1h['timestamp'] = pd.to_datetime(df_1h['timestamp'])
            
        # Get the last 24 hours
        last_time = df_1h['timestamp'].max()
        start_time = last_time - pd.Timedelta(hours=24)
        recent_df = df_1h[df_1h['timestamp'] >= start_time].copy()
        
        if recent_df.empty:
            return {}

        # Filter by hour
        recent_df['hour'] = recent_df['timestamp'].dt.hour
        
        # Asian (18-23 or 0-2)
        asian_mask = (recent_df['hour'] >= 18) | (recent_df['hour'] < 2)
        asian_df = recent_df[asian_mask]
        
        # London (2-7)
        london_mask = (recent_df['hour'] >= 2) & (recent_df['hour'] < 7)
        london_df = recent_df[london_mask]
        
        result = {}
        
        if not asian_df.empty:
            result['asian_session_high'] = float(asian_df['high'].max())
            result['asian_session_low'] = float(asian_df['low'].min())
            
        if not london_df.empty:
            result['london_session_high'] = float(london_df['high'].max())
            result['london_session_low'] = float(london_df['low'].min())
            
        return result
