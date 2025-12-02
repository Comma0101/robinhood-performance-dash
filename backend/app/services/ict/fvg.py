"""
Fair Value Gap (FVG) Detection Module.

FVGs are price inefficiencies where price moves so quickly
that it leaves gaps in fair value. Identified by three candles where
the middle candle creates a gap between candles 1 and 3.
"""
from typing import List
from datetime import datetime
import pandas as pd

from app.schemas.trading import FVG


def detect_fvgs(df: pd.DataFrame, lookback: int = 100) -> List[FVG]:
    """
    Detect Fair Value Gaps in price data.

    A FVG occurs when:
    - Candle 1 high < Candle 3 low (bullish FVG)
    - Candle 1 low > Candle 3 high (bearish FVG)

    Args:
        df: DataFrame with OHLCV data
        lookback: Number of candles to analyze

    Returns:
        List of FVG objects
    """
    if len(df) < 10:
        return []

    fvgs = []
    df = df.tail(lookback).copy()

    # Need at least 3 candles to detect FVG
    for i in range(2, len(df)):
        candle_1 = df.iloc[i-2]
        candle_2 = df.iloc[i-1]
        candle_3 = df.iloc[i]

        # Bullish FVG: gap up
        if candle_1['high'] < candle_3['low']:
            gap_high = float(candle_3['low'])
            gap_low = float(candle_1['high'])
            gap_size = gap_high - gap_low

            # Check status based on subsequent price action
            mitigated = False
            invalidated = False
            
            if i < len(df) - 1:
                subsequent_candles = df.iloc[i+1:]
                
                # Mitigated: Price touched the zone (Low <= Gap High)
                if (subsequent_candles['low'] <= gap_high).any():
                    mitigated = True
                    
                # Invalidated: Candle CLOSED below the zone (Close < Gap Low)
                if (subsequent_candles['close'] < gap_low).any():
                    invalidated = True

            fvg = FVG(
                high=gap_high,
                low=gap_low,
                timestamp=candle_3['timestamp'] if 'timestamp' in df.columns else datetime.utcnow(),
                gap_size=float(gap_size),
                direction="bullish",
                filled=invalidated, # Map filled to invalidated for backward compatibility
                mitigated=mitigated,
                invalidated=invalidated
            )
            fvgs.append(fvg)

        # Bearish FVG: gap down
        elif candle_1['low'] > candle_3['high']:
            gap_high = float(candle_1['low'])
            gap_low = float(candle_3['high'])
            gap_size = gap_high - gap_low

            # Check status based on subsequent price action
            mitigated = False
            invalidated = False
            
            if i < len(df) - 1:
                subsequent_candles = df.iloc[i+1:]
                
                # Mitigated: Price touched the zone (High >= Gap Low)
                if (subsequent_candles['high'] >= gap_low).any():
                    mitigated = True
                    
                # Invalidated: Candle CLOSED above the zone (Close > Gap High)
                if (subsequent_candles['close'] > gap_high).any():
                    invalidated = True

            fvg = FVG(
                high=gap_high,
                low=gap_low,
                timestamp=candle_3['timestamp'] if 'timestamp' in df.columns else datetime.utcnow(),
                gap_size=float(gap_size),
                direction="bearish",
                filled=invalidated, # Map filled to invalidated for backward compatibility
                mitigated=mitigated,
                invalidated=invalidated
            )
            fvgs.append(fvg)

    return fvgs


def filter_significant_fvgs(fvgs: List[FVG], min_size: float = 0.001) -> List[FVG]:
    """
    Filter FVGs by minimum size to remove noise.

    Args:
        fvgs: List of FVG objects
        min_size: Minimum gap size as percentage (0.001 = 0.1%)

    Returns:
        Filtered list of significant FVGs
    """
    return [fvg for fvg in fvgs if (fvg.gap_size / fvg.low) >= min_size]
