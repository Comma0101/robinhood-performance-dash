"""
AI Coach API endpoints.
Manages coaching sessions and chat interactions.
"""
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.trading import CoachSession
from app.schemas.trading import (
    CoachSessionCreate,
    CoachSessionUpdate,
    CoachSessionResponse,
    ChatMessage
)
from app.services.langchain.coach import ICTCoachService

router = APIRouter()


@router.post("/sessions", response_model=CoachSessionResponse, status_code=201)
async def create_session(
    session_data: CoachSessionCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new coaching session.

    Sessions are context-aware based on phase (pre_market, kill_zone, post_market).
    """
    try:
        # Determine phase if not provided
        phase = session_data.phase
        if not phase:
            phase = "general"

        # Generate unique session ID
        import uuid
        session_id = f"coach_{uuid.uuid4().hex[:12]}"

        db_session = CoachSession(
            session_id=session_id,
            phase=phase,
            related_date=session_data.related_date,
            related_trade_id=session_data.related_trade_id,
            messages=[]
        )

        db.add(db_session)
        await db.commit()
        await db.refresh(db_session)
        return _process_session_response(db_session)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/chat", response_model=dict)
async def chat(
    session_id: str,
    message: ChatMessage,
    db: AsyncSession = Depends(get_db)
):
    """
    Send a message to the AI coach and get a response.

    The coach uses LangChain with memory and context from the session.
    """
    try:
        # Get session
        query = select(CoachSession).where(CoachSession.session_id == session_id)
        result = await db.execute(query)
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get current phase for context, but don't update the session's stored phase
        current_phase = ICTCoachService.get_current_phase()

        # Initialize coach service
        coach = ICTCoachService(db)

        # Get response from coach
        response = await coach.chat(
            session_id=session_id,
            user_message=message.content,
            phase=current_phase,
            related_date=session.related_date,
            related_trade_id=session.related_trade_id,
            history=session.messages
        )

        # Update session messages
        session.messages.append({
            "role": "user",
            "content": message.content,
            "timestamp": message.timestamp.isoformat()
        })
        session.messages.append({
            "role": "assistant",
            "content": response["response"],
            "timestamp": response["timestamp"]
        })

        await db.commit()

        # Convert response timestamp to NY time for return
        response_ts = _convert_to_ny_time(response["timestamp"])
        response["timestamp"] = response_ts.isoformat()

        return response
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


def _convert_to_ny_time(dt_val):
    """Helper to convert datetime or ISO string to NY time."""
    import pytz
    from datetime import datetime
    
    ny_tz = pytz.timezone('America/New_York')
    
    if isinstance(dt_val, str):
        try:
            dt_val = datetime.fromisoformat(dt_val)
        except ValueError:
            return dt_val
            
    if dt_val.tzinfo is None:
        dt_val = pytz.utc.localize(dt_val)
        
    return dt_val.astimezone(ny_tz)


def _process_session_response(session) -> CoachSessionResponse:
    """Process session object to convert all timestamps to NY time."""
    # Convert session timestamps
    started_at = _convert_to_ny_time(session.started_at)
    ended_at = _convert_to_ny_time(session.ended_at) if session.ended_at else None
    
    # Convert message timestamps
    messages = []
    if session.messages:
        # Deep copy to avoid modifying DB object
        import copy
        msgs_copy = copy.deepcopy(session.messages)
        for msg in msgs_copy:
            if "timestamp" in msg:
                dt = _convert_to_ny_time(msg["timestamp"])
                msg["timestamp"] = dt.isoformat()
        messages = msgs_copy
        
    return CoachSessionResponse(
        id=session.id,
        session_id=session.session_id,
        started_at=started_at,
        ended_at=ended_at,
        phase=session.phase,
        related_date=session.related_date,
        related_trade_id=session.related_trade_id,
        messages=messages,
        key_insights=session.key_insights,
        action_items=session.action_items,
        created_at=session.created_at,
        updated_at=session.updated_at
    )


@router.get("/sessions", response_model=List[CoachSessionResponse])
async def get_sessions(
    phase: str = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """
    Get coaching sessions with optional filtering.

    Filters:
    - phase: Filter by session phase
    - limit: Maximum number of sessions to return
    """
    try:
        query = select(CoachSession).order_by(CoachSession.started_at.desc())

        if phase:
            query = query.where(CoachSession.phase == phase)

        query = query.limit(limit)

        result = await db.execute(query)
        sessions = result.scalars().all()
        
        return [_process_session_response(s) for s in sessions]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}", response_model=CoachSessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific coaching session by ID."""
    try:
        query = select(CoachSession).where(CoachSession.session_id == session_id)
        result = await db.execute(query)
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        return _process_session_response(session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/sessions/{session_id}", response_model=CoachSessionResponse)
async def update_session(
    session_id: str,
    session_update: CoachSessionUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a coaching session (e.g., add insights, action items, end session)."""
    try:
        query = select(CoachSession).where(CoachSession.session_id == session_id)
        result = await db.execute(query)
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Update fields
        update_data = session_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(session, field, value)

        await db.commit()
        await db.refresh(session)
        
        return _process_session_response(session)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a coaching session."""
    try:
        query = select(CoachSession).where(CoachSession.session_id == session_id)
        result = await db.execute(query)
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        await db.delete(session)
        await db.commit()
        return None
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
