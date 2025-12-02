"""
Market Data API endpoints.
Provides access to general market data like news sentiment.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from app.utils.data_fetcher import fetch_news_sentiment

router = APIRouter()


@router.get("/news", response_model=List[dict])
async def get_market_news(
    tickers: str = Query(..., description="Comma-separated list of tickers (e.g. 'AAPL,TSLA')"),
    limit: int = Query(5, description="Number of news items to return")
):
    """
    Get market news sentiment for specified tickers.
    """
    try:
        news = await fetch_news_sentiment(tickers=tickers, limit=limit)
        return news
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
