"""
Data Fetcher Utility - Alpha Vantage HTTP API.

Fetches OHLCV data from Alpha Vantage using HTTP requests.
Includes caching to reduce API calls.
"""
from typing import Optional
from datetime import datetime, timedelta
import pandas as pd
import httpx
from functools import lru_cache

from app.core.config import settings


# Alpha Vantage API configuration
ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"


class AlphaVantageError(Exception):
    """Custom exception for Alpha Vantage API errors."""
    pass


def _timeframe_to_alpha_vantage(timeframe: str) -> tuple[str, str]:
    """
    Convert timeframe string to Alpha Vantage function and interval.

    Args:
        timeframe: e.g., "1m", "5m", "15m", "1H", "4H", "1D"

    Returns:
        (function_name, interval)
    """
    timeframe_map = {
        "1m": ("TIME_SERIES_INTRADAY", "1min"),
        "5m": ("TIME_SERIES_INTRADAY", "5min"),
        "15m": ("TIME_SERIES_INTRADAY", "15min"),
        "30m": ("TIME_SERIES_INTRADAY", "30min"),
        "1H": ("TIME_SERIES_INTRADAY", "60min"),
        "4H": ("TIME_SERIES_INTRADAY", "60min"),  # Need to resample
        "1D": ("TIME_SERIES_DAILY_ADJUSTED", "daily"),  # Using ADJUSTED for realtime access
    }

    if timeframe not in timeframe_map:
        raise ValueError(f"Unsupported timeframe: {timeframe}")

    return timeframe_map[timeframe]


async def fetch_ohlcv(
    symbol: str,
    timeframe: str = "1D",
    limit: int = 100,
    use_cache: bool = True
) -> pd.DataFrame:
    """
    Fetch OHLCV data from Alpha Vantage HTTP API.

    Args:
        symbol: Trading symbol (e.g., "NQ", "ES", "AAPL")
        timeframe: Timeframe string (e.g., "1m", "5m", "1H", "1D")
        limit: Number of candles to fetch
        use_cache: Whether to use caching (default True)

    Returns:
        DataFrame with columns: timestamp, open, high, low, close, volume

    Raises:
        AlphaVantageError: If API request fails
    """
    # Map timeframe to Alpha Vantage parameters
    function, interval = _timeframe_to_alpha_vantage(timeframe)

    # Build request parameters
    params = {
        "function": function,
        "symbol": symbol,
        "apikey": settings.ALPHA_VANTAGE_API_KEY,
        "outputsize": "full" if limit > 100 else "compact",
        "datatype": "json",
        "entitlement": "realtime"  # For realtime US stock market data
    }

    import asyncio

    # ... (existing code)

    if function == "TIME_SERIES_INTRADAY":
        params["interval"] = interval

    max_retries = 3
    last_exception = None

    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(ALPHA_VANTAGE_BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()
                break # Success
        except httpx.HTTPStatusError as e:
            last_exception = e
            if e.response.status_code in [500, 502, 503, 504] and attempt < max_retries - 1:
                wait_time = 2 ** attempt
                print(f"⚠️ Alpha Vantage {e.response.status_code} error. Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
                continue
            raise AlphaVantageError(f"HTTP error fetching data: {str(e)}")
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RemoteProtocolError) as e:
            last_exception = e
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt
                print(f"⚠️ Alpha Vantage connection issue: {str(e)}. Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
                continue
            raise AlphaVantageError(f"Connection error fetching data: {str(e)}")
        except Exception as e:
            raise AlphaVantageError(f"Error fetching data: {str(e)}")
    else:
        # If loop finishes without break
        print(f"⚠️ Alpha Vantage API failed after {max_retries} retries. Last error: {last_exception}")
        print("⚠️ Switching to MOCK data.")
        return await fetch_ohlcv_mock(symbol, timeframe, limit)

    # Check for API errors
    if "Error Message" in data:
        raise AlphaVantageError(f"Alpha Vantage error: {data['Error Message']}")

    if "Note" in data:
        # Rate limit hit
        raise AlphaVantageError("Alpha Vantage rate limit exceeded")

    # Parse response based on function type
    if function == "TIME_SERIES_INTRADAY":
        time_series_key = f"Time Series ({interval})"
    elif function == "TIME_SERIES_DAILY_ADJUSTED":
        time_series_key = "Time Series (Daily)"
    else:
        time_series_key = "Time Series (Daily)"

    if time_series_key not in data:
        raise AlphaVantageError(f"Unexpected API response format: {list(data.keys())}")

    time_series = data[time_series_key]

    # Convert to DataFrame
    df = _parse_time_series(time_series, limit)

    # Resample if needed (e.g., 4H from 1H data)
    if timeframe == "4H":
        df = _resample_to_4h(df)

    return df


async def fetch_news_sentiment(
    tickers: str,
    limit: int = 5
) -> list[dict]:
    """
    Fetch news sentiment from Alpha Vantage (Premium Feature).
    
    Args:
        tickers: Comma-separated list of tickers (e.g., "CRYPTO:BTC,FOREX:USD")
        limit: Number of news items to return
        
    Returns:
        List of news items with sentiment
    """
    params = {
        "function": "NEWS_SENTIMENT",
        "tickers": tickers,
        "apikey": settings.ALPHA_VANTAGE_API_KEY,
        "limit": limit,
        "sort": "LATEST"
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(ALPHA_VANTAGE_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()
            
            if "feed" in data:
                return data["feed"]
            return []
    except Exception as e:
        print(f"⚠️ Failed to fetch news: {e}")
        return []


def _parse_time_series(time_series: dict, limit: int) -> pd.DataFrame:
    """
    Parse Alpha Vantage time series data into DataFrame.

    Args:
        time_series: Time series data from Alpha Vantage
        limit: Maximum number of rows to return

    Returns:
        DataFrame with OHLCV data
    """
    rows = []

    for timestamp_str, values in time_series.items():
        timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S") \
            if " " in timestamp_str else datetime.strptime(timestamp_str, "%Y-%m-%d")

        # Handle both regular and adjusted daily formats
        # Regular: "5. volume"
        # Adjusted: "5. adjusted close", "6. volume"
        volume_key = "6. volume" if "6. volume" in values else "5. volume"

        row = {
            "timestamp": timestamp,
            "open": float(values["1. open"]),
            "high": float(values["2. high"]),
            "low": float(values["3. low"]),
            "close": float(values["4. close"]),
            "volume": float(values[volume_key])
        }
        rows.append(row)

    # Create DataFrame and sort by timestamp
    df = pd.DataFrame(rows)
    df = df.sort_values("timestamp").reset_index(drop=True)

    # Limit to requested number of rows (most recent)
    if len(df) > limit:
        df = df.tail(limit).reset_index(drop=True)

    return df


def _resample_to_4h(df: pd.DataFrame) -> pd.DataFrame:
    """
    Resample 1H data to 4H timeframe.

    Args:
        df: DataFrame with 1H OHLCV data

    Returns:
        DataFrame with 4H OHLCV data
    """
    df = df.set_index("timestamp")

    resampled = df.resample("4H").agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum"
    }).dropna()

    return resampled.reset_index()


# Simple in-memory cache for development
# TODO: Replace with Redis in production
_cache = {}
_cache_ttl = timedelta(minutes=5)


async def fetch_ohlcv_cached(
    symbol: str,
    timeframe: str = "1D",
    limit: int = 100
) -> pd.DataFrame:
    """
    Fetch OHLCV data with caching.

    Cache key: {symbol}_{timeframe}_{limit}
    TTL: 5 minutes
    """
    cache_key = f"{symbol}_{timeframe}_{limit}"

    # Determine TTL based on timeframe
    # Premium API allows for near real-time data
    if "m" in timeframe:
        ttl = timedelta(seconds=10)  # 10s cache for intraday (Premium)
    else:
        ttl = timedelta(minutes=5)   # 5m cache for daily/hourly

    # Check cache
    if cache_key in _cache:
        cached_data, cached_time = _cache[cache_key]
        if datetime.utcnow() - cached_time < ttl:
            return cached_data.copy()

    # Fetch fresh data
    df = await fetch_ohlcv(symbol, timeframe, limit, use_cache=False)

    # Update cache
    _cache[cache_key] = (df, datetime.utcnow())

    return df


# Mock data for testing (when API key not available)
async def fetch_ohlcv_mock(
    symbol: str,
    timeframe: str = "1D",
    limit: int = 100
) -> pd.DataFrame:
    """
    Generate mock OHLCV data for testing.

    Returns realistic-looking price data with trends.
    """
    import numpy as np

    # Generate timestamps
    if "m" in timeframe or "H" in timeframe:
        # Intraday
        end_time = datetime.utcnow()
        if "m" in timeframe:
            minutes = int(timeframe.replace("m", ""))
            timestamps = [end_time - timedelta(minutes=minutes * i) for i in range(limit)]
        else:
            hours = int(timeframe.replace("H", ""))
            timestamps = [end_time - timedelta(hours=hours * i) for i in range(limit)]
    else:
        # Daily
        end_date = datetime.utcnow().date()
        timestamps = [datetime.combine(end_date - timedelta(days=i), datetime.min.time())
                     for i in range(limit)]

    timestamps.reverse()

    # Determine base price based on symbol
    symbol_upper = symbol.upper()
    if "NQ" in symbol_upper:
        base_price = 20000.0
        volatility = 50.0
    elif "ES" in symbol_upper:
        base_price = 5900.0
        volatility = 15.0
    elif "QQQ" in symbol_upper:
        base_price = 500.0
        volatility = 2.0
    elif "SPY" in symbol_upper:
        base_price = 590.0
        volatility = 2.0
    else:
        base_price = 100.0
        volatility = 1.0

    prices = []
    current_price = base_price

    for i in range(limit):
        # Add trend and randomness
        trend = np.sin(i / 20) * (base_price * 0.005)  # Cyclical trend
        noise = np.random.randn() * volatility
        current_price += trend / 10 + noise

        # Generate OHLC
        open_price = current_price
        high_price = open_price + abs(np.random.randn()) * volatility / 2
        low_price = open_price - abs(np.random.randn()) * volatility / 2
        close_price = low_price + (high_price - low_price) * np.random.random()

        prices.append({
            "timestamp": timestamps[i],
            "open": round(open_price, 2),
            "high": round(high_price, 2),
            "low": round(low_price, 2),
            "close": round(close_price, 2),
            "volume": int(np.random.randint(1000, 10000))
        })

        current_price = close_price

    return pd.DataFrame(prices)
