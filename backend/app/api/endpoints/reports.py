"""
Pre-Market Report API endpoints.
Manages daily pre-market analysis reports.
"""
from datetime import date, datetime, time, timedelta
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import pandas as pd
import pytz

from app.core.database import get_db
from app.models.trading import PreMarketReport
from app.schemas.trading import PreMarketReportCreate, PreMarketReportResponse
from app.services.ict.pre_market_routine import PreMarketRoutineService
from app.utils.data_fetcher import fetch_ohlcv

router = APIRouter()


@router.post("/", response_model=PreMarketReportResponse, status_code=201)
async def create_report(
    report: PreMarketReportCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new pre-market report.

    Generated automatically by the Pre-Market Analyzer agent at 6 AM.
    """
    try:
        db_report = PreMarketReport(**report.model_dump())
        db.add(db_report)
        await db.commit()
        await db.refresh(db_report)
        return db_report
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[PreMarketReportResponse])
async def get_reports(
    symbol: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(30, le=100),
    db: AsyncSession = Depends(get_db)
):
    """
    Get pre-market reports with optional filtering.

    Filters:
    - symbol: Filter by trading symbol
    - start_date: Reports from this date onwards
    - end_date: Reports up to this date
    - limit: Maximum number of reports to return
    """
    try:
        query = select(PreMarketReport).order_by(PreMarketReport.date.desc())

        if symbol:
            query = query.where(PreMarketReport.symbol == symbol)
        if start_date:
            query = query.where(PreMarketReport.date >= start_date)
        if end_date:
            query = query.where(PreMarketReport.date <= end_date)

        query = query.limit(limit)

        result = await db.execute(query)
        reports = result.scalars().all()
        return reports
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{report_id}", response_model=PreMarketReportResponse)
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific pre-market report by ID."""
    try:
        query = select(PreMarketReport).where(PreMarketReport.id == report_id)
        result = await db.execute(query)
        report = result.scalar_one_or_none()

        if not report:
            raise HTTPException(status_code=404, detail="Report not found")

        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/date/{report_date}", response_model=PreMarketReportResponse)
async def get_report_by_date(
    report_date: date,
    symbol: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Get pre-market report for a specific date and symbol."""
    try:
        query = select(PreMarketReport).where(
            PreMarketReport.date == report_date,
            PreMarketReport.symbol == symbol
        )
        result = await db.execute(query)
        report = result.scalar_one_or_none()

        if not report:
            raise HTTPException(
                status_code=404,
                detail=f"No report found for {symbol} on {report_date}"
            )

        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{report_id}", status_code=204)
async def delete_report(
    report_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a pre-market report."""
    try:
        query = select(PreMarketReport).where(PreMarketReport.id == report_id)
        result = await db.execute(query)
        report = result.scalar_one_or_none()

        if not report:
            raise HTTPException(status_code=404, detail="Report not found")

        await db.delete(report)
        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ========== NEW ENDPOINTS FOR MORNING ROUTINE ==========

@router.post("/generate", status_code=202)
async def generate_morning_report(
    symbol: str = Query(default="QQQ", description="Trading symbol"),
    target_date: Optional[date] = Query(None, description="Date for analysis (default: today)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Manually trigger pre-market report generation.

    Useful for:
    - Testing the routine
    - Generating historical reports
    - On-demand analysis

    Returns immediately with status 202 Accepted.
    """
    try:
        # Preflight: ensure we have pre-market bars if it's early
        ny_tz = pytz.timezone('America/New_York')
        now_ny = datetime.now(ny_tz)
        today_start = datetime.combine(now_ny.date(), time(0, 0))
        if today_start.tzinfo is None:
            today_start = ny_tz.localize(today_start)

        premarket_start = today_start + timedelta(hours=4)  # ~04:00 NY extended hours

        # If before 04:00 NY, return Too Early
        if now_ny < premarket_start:
            raise HTTPException(
                status_code=425,
                detail="Too early to generate: pre-market begins ~04:00 NY; try again after 04:00."
            )

        # Check for any pre-market bars since 04:00 NY using 5m data
        # TEMPORARILY DISABLED: Alpha Vantage free tier may not provide pre-market data for QQQ
        # TODO: Re-enable when using premium API key or testing with stocks that have extended hours data
        # try:
        #     df5 = await fetch_ohlcv(symbol, timeframe="5m", limit=300)
        #     df5['timestamp'] = pd.to_datetime(df5['timestamp'])
        #     # Alpha Vantage intraday timestamps are US/Eastern; localize naïve timestamps accordingly
        #     if df5['timestamp'].dt.tz is None:
        #         df5['timestamp'] = df5['timestamp'].dt.tz_localize('America/New_York')
        #     else:
        #         df5['timestamp'] = df5['timestamp'].dt.tz_convert(ny_tz)
        #
        #     pre_df = df5[(df5['timestamp'] >= premarket_start) & (df5['timestamp'] < now_ny)]
        #
        #     if len(pre_df) == 0:
        #         raise HTTPException(
        #             status_code=425,
        #             detail="Too early to generate: no pre-market bars received yet from data provider."
        #         )
        # except HTTPException:
        #     # Bubble up 425 Too Early
        #     raise
        # except Exception:
        #     # If data check fails unexpectedly, proceed (do not block generation)
        #     pass

        routine = PreMarketRoutineService(db)
        report = await routine.run_routine(symbol=symbol, target_date=target_date)

        return {
            "status": "completed",
            "report_id": report.id,
            "date": report.date.isoformat(),
            "symbol": report.symbol,
            "htf_bias": report.htf_bias.value,
            "day_type": report.day_type,
            "confidence": report.confidence,
            "message": "Pre-market report generated successfully"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")


@router.get("/morning/{report_date}", response_model=PreMarketReportResponse)
async def get_morning_report(
    report_date: date,
    symbol: str = Query(default="QQQ", description="Trading symbol"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get the morning pre-market report for a specific date.

    This is the primary endpoint for the AI Coach frontend to fetch
    the daily morning report.
    """
    try:
        query = select(PreMarketReport).where(
            PreMarketReport.date == report_date,
            PreMarketReport.symbol == symbol
        ).order_by(PreMarketReport.id.desc())  # Order by ID descending to get most recent

        result = await db.execute(query)
        report = result.scalars().first()  # Get first result (most recent) or None

        if not report:
            raise HTTPException(
                status_code=404,
                detail=f"No morning report found for {symbol} on {report_date}"
            )

        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
