"""
Market Structure Analysis Module.

Analyzes market structure to identify:
- Higher highs / higher lows (bullish structure)
- Lower highs / lower lows (bearish structure)
- Range-bound / choppy conditions
- Break of structure (BOS)
- Change of character (CHoCH)
"""
from typing import Tuple, List
import pandas as pd
import numpy as np


def analyze_market_structure(df: pd.DataFrame) -> str:
    """
    Analyze current market structure.

    Returns:
        String description of market structure
    """
    if len(df) < 30:
        return "insufficient_data"

    # Identify swing points
    swing_highs = _identify_swings(df['high'].values, mode='high')
    swing_lows = _identify_swings(df['low'].values, mode='low')

    # Analyze recent structure (last 5 swings)
    recent_highs = swing_highs[-5:] if len(swing_highs) >= 5 else swing_highs
    recent_lows = swing_lows[-5:] if len(swing_lows) >= 5 else swing_lows

    # Check for higher highs and higher lows
    if len(recent_highs) >= 2 and len(recent_lows) >= 2:
        higher_highs = all(recent_highs[i] < recent_highs[i+1]
                          for i in range(len(recent_highs)-1))
        higher_lows = all(recent_lows[i] < recent_lows[i+1]
                         for i in range(len(recent_lows)-1))

        if higher_highs and higher_lows:
            return "higher_highs_higher_lows"
        elif higher_highs:
            return "higher_highs"

    # Check for lower highs and lower lows
    if len(recent_highs) >= 2 and len(recent_lows) >= 2:
        lower_highs = all(recent_highs[i] > recent_highs[i+1]
                         for i in range(len(recent_highs)-1))
        lower_lows = all(recent_lows[i] > recent_lows[i+1]
                        for i in range(len(recent_lows)-1))

        if lower_highs and lower_lows:
            return "lower_highs_lower_lows"
        elif lower_lows:
            return "lower_lows"

    # Check for ranging
    if _is_ranging(df):
        return "ranging"

    return "choppy"


def _identify_swings(data: np.ndarray, mode: str = 'high', window: int = 5) -> List[float]:
    """Identify swing highs or lows."""
    swings = []

    for i in range(window, len(data) - window):
        if mode == 'high':
            is_swing = all(data[i] >= data[i-window:i]) and all(data[i] >= data[i+1:i+window+1])
        else:
            is_swing = all(data[i] <= data[i-window:i]) and all(data[i] <= data[i+1:i+window+1])

        if is_swing:
            swings.append(data[i])

    return swings


def _is_ranging(df: pd.DataFrame, threshold: float = 0.03) -> bool:
    """
    Check if market is ranging (moving within a tight range).

    Args:
        df: DataFrame with OHLCV data
        threshold: Maximum range as percentage (0.03 = 3%)

    Returns:
        True if market is ranging
    """
    recent = df.tail(30)
    range_high = recent['high'].max()
    range_low = recent['low'].min()
    range_size = (range_high - range_low) / range_low

    return range_size <= threshold


def detect_break_of_structure(df: pd.DataFrame) -> Tuple[bool, str]:
    """
    Detect Break of Structure (BOS).

    BOS occurs when price breaks the most recent swing high (bullish)
    or swing low (bearish).

    Returns:
        (has_bos, direction)
    """
    if len(df) < 20:
        return False, "none"

    swing_highs = _identify_swings(df['high'].values, mode='high')
    swing_lows = _identify_swings(df['low'].values, mode='low')

    if not swing_highs or not swing_lows:
        return False, "none"

    current_price = df['close'].iloc[-1]
    recent_swing_high = swing_highs[-1]
    recent_swing_low = swing_lows[-1]

    # Bullish BOS: price breaks above recent swing high
    if current_price > recent_swing_high:
        return True, "bullish"

    # Bearish BOS: price breaks below recent swing low
    if current_price < recent_swing_low:
        return True, "bearish"

    return False, "none"
