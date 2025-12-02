"""
Entry Setup API endpoints.
Manages real-time entry setups detected during kill zones.
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.trading import EntrySetup, SessionType
from app.schemas.trading import EntrySetupCreate, EntrySetupResponse

router = APIRouter()


@router.post("/", response_model=EntrySetupResponse, status_code=201)
async def create_setup(
    setup: EntrySetupCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new entry setup.

    Generated automatically by Kill Zone Monitor when valid setup is detected.
    """
    try:
        db_setup = EntrySetup(**setup.model_dump())
        db.add(db_setup)
        await db.commit()
        await db.refresh(db_setup)
        return db_setup
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[EntrySetupResponse])
async def get_setups(
    symbol: Optional[str] = Query(None),
    session: Optional[SessionType] = Query(None),
    executed: Optional[bool] = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db)
):
    """
    Get entry setups with optional filtering.

    Filters:
    - symbol: Filter by trading symbol
    - session: Filter by kill zone session
    - executed: Filter by execution status
    - limit: Maximum number of setups to return
    """
    try:
        query = select(EntrySetup).order_by(EntrySetup.detected_at.desc())

        if symbol:
            query = query.where(EntrySetup.symbol == symbol)
        if session:
            query = query.where(EntrySetup.session == session)
        if executed is not None:
            query = query.where(EntrySetup.executed == executed)

        query = query.limit(limit)

        result = await db.execute(query)
        setups = result.scalars().all()
        return setups
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{setup_id}", response_model=EntrySetupResponse)
async def get_setup(
    setup_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific entry setup by ID."""
    try:
        query = select(EntrySetup).where(EntrySetup.id == setup_id)
        result = await db.execute(query)
        setup = result.scalar_one_or_none()

        if not setup:
            raise HTTPException(status_code=404, detail="Setup not found")

        return setup
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{setup_id}/execute", response_model=EntrySetupResponse)
async def mark_setup_executed(
    setup_id: int,
    execution_notes: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Mark a setup as executed."""
    try:
        query = select(EntrySetup).where(EntrySetup.id == setup_id)
        result = await db.execute(query)
        setup = result.scalar_one_or_none()

        if not setup:
            raise HTTPException(status_code=404, detail="Setup not found")

        setup.executed = True
        setup.execution_notes = execution_notes

        await db.commit()
        await db.refresh(setup)
        return setup
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
