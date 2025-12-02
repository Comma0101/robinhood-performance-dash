"""
ICT Analysis API endpoints.
Provides real-time ICT technical analysis on market data.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.trading import ICTAnalysisRequest, ICTAnalysisResponse
from app.services.ict.analyzer import ICTAnalyzer

router = APIRouter()


@router.post("/run", response_model=ICTAnalysisResponse)
async def run_analysis(
    request: ICTAnalysisRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Run ICT analysis on specified symbol and timeframes.

    This performs multi-timeframe ICT analysis including:
    - Market bias determination
    - Order block identification
    - Fair Value Gap detection
    - Liquidity zone mapping
    - Market structure analysis
    """
    try:
        analyzer = ICTAnalyzer(db)
        result = await analyzer.analyze(
            symbol=request.symbol,
            timeframes=request.timeframes,
            analysis_type=request.analysis_type
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bias/{symbol}", response_model=dict)
async def get_current_bias(
    symbol: str,
    timeframe: str = "1D",
    db: AsyncSession = Depends(get_db)
):
    """
    Get current market bias for a symbol.

    Quick endpoint for checking bias without full analysis.
    """
    try:
        analyzer = ICTAnalyzer(db)
        bias = await analyzer.get_bias(symbol, timeframe)
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "bias": bias
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/levels/{symbol}", response_model=dict)
async def get_key_levels(
    symbol: str,
    timeframe: str = "1D",
    db: AsyncSession = Depends(get_db)
):
    """
    Get key levels (OBs, FVGs, liquidity) for a symbol.

    Returns the most important levels traders should watch.
    """
    try:
        analyzer = ICTAnalyzer(db)
        levels = await analyzer.get_key_levels(symbol, timeframe)
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "levels": levels
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
