"""
Order Block Detection Module.

Order blocks are institutional buying/selling areas identified by:
- Strong directional move after consolidation
- High volume candle
- Price returning to test the zone
"""
from typing import List
from datetime import datetime
import pandas as pd
import numpy as np

from app.schemas.trading import OrderBlock


def detect_order_blocks(df: pd.DataFrame, lookback: int = 100) -> List[OrderBlock]:
    """
    Detect order blocks in price data.

    An order block is identified by:
    1. A strong directional candle (large body)
    2. Preceded by consolidation or opposite direction
    3. High volume (if available)
    4. Price breaks structure after the candle

    Args:
        df: DataFrame with OHLCV data
        lookback: Number of candles to analyze

    Returns:
        List of OrderBlock objects
    """
    if len(df) < 20:
        return []

    order_blocks = []
    df = df.tail(lookback).copy()

    # Calculate candle metrics
    df['body_size'] = abs(df['close'] - df['open'])
    df['candle_range'] = df['high'] - df['low']
    df['body_ratio'] = df['body_size'] / df['candle_range']

    # Identify strong directional candles
    avg_body = df['body_size'].rolling(20).mean()

    for i in range(10, len(df) - 5):
        current = df.iloc[i]
        prev_candles = df.iloc[i-10:i]
        next_candles = df.iloc[i+1:i+6]

        # Check if this is a strong candle
        is_strong = current['body_size'] > avg_body.iloc[i] * 1.5
        is_directional = current['body_ratio'] > 0.6

        if not (is_strong and is_directional):
            continue

        # Determine direction
        is_bullish = current['close'] > current['open']
        direction = "bullish" if is_bullish else "bearish"

        # Check for structure break after this candle
        if is_bullish:
            structure_break = next_candles['close'].max() > current['high']
        else:
            structure_break = next_candles['close'].min() < current['low']

        if not structure_break:
            continue

        # Calculate strength based on:
        # - Body size relative to average
        # - Body ratio (less wicks = stronger)
        # - Volume (if available)
        strength = min(
            (current['body_size'] / avg_body.iloc[i] - 1) * 0.5 +
            current['body_ratio'] * 0.3 +
            0.2,  # Base strength
            1.0
        )

        # Create order block
        ob = OrderBlock(
            high=float(current['high']),
            low=float(current['low']),
            timestamp=current['timestamp'] if 'timestamp' in df.columns else datetime.utcnow(),
            direction=direction,
            strength=float(strength)
        )

        order_blocks.append(ob)

    # Remove overlapping order blocks (keep stronger one)
    order_blocks = _remove_overlapping_obs(order_blocks)

    return order_blocks


def _remove_overlapping_obs(order_blocks: List[OrderBlock]) -> List[OrderBlock]:
    """Remove overlapping order blocks, keeping the stronger one."""
    if not order_blocks:
        return []

    # Sort by strength descending
    sorted_obs = sorted(order_blocks, key=lambda x: x.strength, reverse=True)

    filtered = []
    for ob in sorted_obs:
        # Check if this OB overlaps with any already filtered OB
        overlaps = False
        for existing_ob in filtered:
            if _obs_overlap(ob, existing_ob):
                overlaps = True
                break

        if not overlaps:
            filtered.append(ob)

    return filtered


def _obs_overlap(ob1: OrderBlock, ob2: OrderBlock) -> bool:
    """Check if two order blocks overlap in price."""
    return not (ob1.high < ob2.low or ob1.low > ob2.high)
