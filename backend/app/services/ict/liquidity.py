"""
Liquidity Zone Detection Module.

Liquidity zones are areas where stops are likely clustered:
- Above swing highs (buy-side liquidity)
- Below swing lows (sell-side liquidity)
- Equal highs/lows
"""
from typing import List
from datetime import datetime
import pandas as pd
import numpy as np

from app.schemas.trading import LiquidityZone


def detect_liquidity_zones(df: pd.DataFrame, lookback: int = 100) -> List[LiquidityZone]:
    """
    Detect liquidity zones (areas with clustered stops).

    Args:
        df: DataFrame with OHLCV data
        lookback: Number of candles to analyze

    Returns:
        List of LiquidityZone objects
    """
    if len(df) < 20:
        return []

    liquidity_zones = []
    df = df.tail(lookback).copy()

    # Find swing highs (buy-side liquidity)
    swing_highs = _find_swing_points(df['high'].values, mode='high')
    for idx, price in swing_highs:
        if idx < len(df):
            zone = LiquidityZone(
                price=float(price),
                zone_type="buy_side",
                strength=_calculate_liquidity_strength(df, idx, price, 'high')
            )
            liquidity_zones.append(zone)

    # Find swing lows (sell-side liquidity)
    swing_lows = _find_swing_points(df['low'].values, mode='low')
    for idx, price in swing_lows:
        if idx < len(df):
            zone = LiquidityZone(
                price=float(price),
                zone_type="sell_side",
                strength=_calculate_liquidity_strength(df, idx, price, 'low')
            )
            liquidity_zones.append(zone)

    # Find equal highs/lows (stronger liquidity)
    equal_highs = _find_equal_levels(df['high'].values)
    for idx, price in equal_highs:
        if idx < len(df):
            zone = LiquidityZone(
                price=float(price),
                zone_type="buy_side",
                strength=min(_calculate_liquidity_strength(df, idx, price, 'high') + 0.2, 1.0)
            )
            liquidity_zones.append(zone)

    equal_lows = _find_equal_levels(df['low'].values)
    for idx, price in equal_lows:
        if idx < len(df):
            zone = LiquidityZone(
                price=float(price),
                zone_type="sell_side",
                strength=min(_calculate_liquidity_strength(df, idx, price, 'low') + 0.2, 1.0)
            )
            liquidity_zones.append(zone)

    # Remove duplicates (similar price levels)
    liquidity_zones = _merge_nearby_zones(liquidity_zones)

    # Sort by strength
    liquidity_zones.sort(key=lambda x: x.strength, reverse=True)

    return liquidity_zones


def _find_swing_points(data: np.ndarray, mode: str = 'high', window: int = 5) -> List[tuple]:
    """
    Find swing highs or lows.

    Args:
        data: Price array
        mode: 'high' or 'low'
        window: Lookback/lookahead window

    Returns:
        List of (index, price) tuples
    """
    swings = []

    for i in range(window, len(data) - window):
        if mode == 'high':
            is_swing = all(data[i] >= data[i-window:i]) and all(data[i] >= data[i+1:i+window+1])
        else:
            is_swing = all(data[i] <= data[i-window:i]) and all(data[i] <= data[i+1:i+window+1])

        if is_swing:
            swings.append((i, data[i]))

    return swings


def _find_equal_levels(data: np.ndarray, tolerance: float = 0.001) -> List[tuple]:
    """
    Find equal highs or lows (within tolerance).

    Args:
        data: Price array
        tolerance: Price similarity tolerance (0.001 = 0.1%)

    Returns:
        List of (index, price) tuples
    """
    equal_levels = []

    for i in range(5, len(data) - 5):
        current_price = data[i]

        # Look for similar prices in nearby candles
        nearby = data[max(0, i-10):i]
        for j, prev_price in enumerate(nearby):
            if abs(current_price - prev_price) / prev_price <= tolerance:
                equal_levels.append((i, current_price))
                break

    return equal_levels


def _calculate_liquidity_strength(
    df: pd.DataFrame,
    idx: int,
    price: float,
    price_type: str
) -> float:
    """
    Calculate strength of liquidity zone.

    Factors:
    - Number of times price tested this level
    - Volume at the level (if available)
    - Recency of the level
    """
    strength = 0.3  # Base strength

    # Recency factor (more recent = stronger)
    recency = idx / len(df)
    strength += recency * 0.3

    # Test count factor
    if price_type == 'high':
        nearby_touches = ((df['high'] >= price * 0.999) & (df['high'] <= price * 1.001)).sum()
    else:
        nearby_touches = ((df['low'] >= price * 0.999) & (df['low'] <= price * 1.001)).sum()

    if nearby_touches >= 3:
        strength += 0.3
    elif nearby_touches == 2:
        strength += 0.2

    # Volume factor (if available)
    if 'volume' in df.columns and idx < len(df):
        avg_volume = df['volume'].mean()
        current_volume = df.iloc[idx]['volume']
        if current_volume > avg_volume * 1.5:
            strength += 0.1

    return min(strength, 1.0)


def _merge_nearby_zones(zones: List[LiquidityZone], tolerance: float = 0.002) -> List[LiquidityZone]:
    """
    Merge liquidity zones that are very close in price.

    Args:
        zones: List of liquidity zones
        tolerance: Price similarity tolerance (0.002 = 0.2%)

    Returns:
        Merged list of liquidity zones
    """
    if not zones:
        return []

    # Sort by price
    sorted_zones = sorted(zones, key=lambda x: x.price)

    merged = [sorted_zones[0]]

    for zone in sorted_zones[1:]:
        last_merged = merged[-1]

        # Check if this zone is close to the last merged zone
        if (abs(zone.price - last_merged.price) / last_merged.price <= tolerance and
            zone.zone_type == last_merged.zone_type):
            # Merge: keep the stronger one
            if zone.strength > last_merged.strength:
                merged[-1] = zone
        else:
            merged.append(zone)

    return merged
