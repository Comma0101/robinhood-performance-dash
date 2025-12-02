"""
Trade API endpoints.
Manages executed trades with full lifecycle tracking.
"""
from typing import List, Optional
from datetime import date
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.trading import Trade, TradeStatus
from app.schemas.trading import TradeCreate, TradeUpdate, TradeResponse

router = APIRouter()


@router.post("/", response_model=TradeResponse, status_code=201)
async def create_trade(
    trade: TradeCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new trade.

    Can be created from an entry setup or manually.
    """
    try:
        db_trade = Trade(**trade.model_dump())
        db.add(db_trade)
        await db.commit()
        await db.refresh(db_trade)
        return db_trade
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[TradeResponse])
async def get_trades(
    symbol: Optional[str] = Query(None),
    status: Optional[TradeStatus] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db)
):
    """
    Get trades with optional filtering.

    Filters:
    - symbol: Filter by trading symbol
    - status: Filter by trade status
    - start_date: Trades from this date onwards
    - end_date: Trades up to this date
    - limit: Maximum number of trades to return
    """
    try:
        query = select(Trade).order_by(Trade.entry_time.desc())

        if symbol:
            query = query.where(Trade.symbol == symbol)
        if status:
            query = query.where(Trade.status == status)
        if start_date:
            query = query.where(Trade.date >= start_date)
        if end_date:
            query = query.where(Trade.date <= end_date)

        query = query.limit(limit)

        result = await db.execute(query)
        trades = result.scalars().all()
        return trades
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{trade_id}", response_model=TradeResponse)
async def get_trade(
    trade_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific trade by ID."""
    try:
        query = select(Trade).where(Trade.id == trade_id)
        result = await db.execute(query)
        trade = result.scalar_one_or_none()

        if not trade:
            raise HTTPException(status_code=404, detail="Trade not found")

        return trade
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{trade_id}", response_model=TradeResponse)
async def update_trade(
    trade_id: int,
    trade_update: TradeUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Update a trade.

    Use this to update exit details, P&L, target hits, etc.
    """
    try:
        query = select(Trade).where(Trade.id == trade_id)
        result = await db.execute(query)
        trade = result.scalar_one_or_none()

        if not trade:
            raise HTTPException(status_code=404, detail="Trade not found")

        # Update fields
        update_data = trade_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(trade, field, value)

        await db.commit()
        await db.refresh(trade)
        return trade
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{trade_id}", status_code=204)
async def delete_trade(
    trade_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a trade."""
    try:
        query = select(Trade).where(Trade.id == trade_id)
        result = await db.execute(query)
        trade = result.scalar_one_or_none()

        if not trade:
            raise HTTPException(status_code=404, detail="Trade not found")

        await db.delete(trade)
        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
