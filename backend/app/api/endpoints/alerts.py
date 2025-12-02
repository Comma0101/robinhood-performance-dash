"""
Alert API endpoints.
Manages real-time alerts for trading opportunities and events.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.trading import Alert, AlertType
from app.schemas.trading import AlertCreate, AlertResponse

router = APIRouter()


@router.post("/", response_model=AlertResponse, status_code=201)
async def create_alert(
    alert: AlertCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new alert.

    Generated automatically by background monitors or manually by user.
    """
    try:
        db_alert = Alert(**alert.model_dump())
        db.add(db_alert)
        await db.commit()
        await db.refresh(db_alert)
        return db_alert
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[AlertResponse])
async def get_alerts(
    symbol: Optional[str] = Query(None),
    alert_type: Optional[AlertType] = Query(None),
    is_read: Optional[bool] = Query(None),
    is_dismissed: Optional[bool] = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db)
):
    """
    Get alerts with optional filtering.

    Filters:
    - symbol: Filter by trading symbol
    - alert_type: Filter by alert type
    - is_read: Filter by read status
    - is_dismissed: Filter by dismissed status
    - limit: Maximum number of alerts to return
    """
    try:
        query = select(Alert).order_by(Alert.triggered_at.desc())

        if symbol:
            query = query.where(Alert.symbol == symbol)
        if alert_type:
            query = query.where(Alert.alert_type == alert_type)
        if is_read is not None:
            query = query.where(Alert.is_read == is_read)
        if is_dismissed is not None:
            query = query.where(Alert.is_dismissed == is_dismissed)

        query = query.limit(limit)

        result = await db.execute(query)
        alerts = result.scalars().all()
        return alerts
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific alert by ID."""
    try:
        query = select(Alert).where(Alert.id == alert_id)
        result = await db.execute(query)
        alert = result.scalar_one_or_none()

        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        return alert
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{alert_id}/read", response_model=AlertResponse)
async def mark_alert_read(
    alert_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Mark an alert as read."""
    try:
        from datetime import datetime

        query = select(Alert).where(Alert.id == alert_id)
        result = await db.execute(query)
        alert = result.scalar_one_or_none()

        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        alert.is_read = True
        alert.read_at = datetime.utcnow()

        await db.commit()
        await db.refresh(alert)
        return alert
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{alert_id}/dismiss", response_model=AlertResponse)
async def dismiss_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Dismiss an alert."""
    try:
        query = select(Alert).where(Alert.id == alert_id)
        result = await db.execute(query)
        alert = result.scalar_one_or_none()

        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        alert.is_dismissed = True

        await db.commit()
        await db.refresh(alert)
        return alert
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{alert_id}", status_code=204)
async def delete_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete an alert."""
    try:
        query = select(Alert).where(Alert.id == alert_id)
        result = await db.execute(query)
        alert = result.scalar_one_or_none()

        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        await db.delete(alert)
        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
