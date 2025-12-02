"""
APScheduler service for automated pre-market routine.
Runs at 6:30 AM NY time every weekday.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime
import pytz
import asyncio
import uuid

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.services.ict.pre_market_routine import PreMarketRoutineService
from app.core.config import settings
from app.models.trading import CoachSession


class SchedulerService:
    """
    Manages scheduled tasks for the trading system.

    Primary responsibility: Run pre-market routine at 6:30 AM NY time
    every weekday (Monday-Friday).
    """

    def __init__(self):
        self.scheduler = AsyncIOScheduler(timezone=pytz.timezone('America/New_York'))
        self.ny_tz = pytz.timezone('America/New_York')

    async def run_pre_market_routine(self, pass_name: str = "prelim"):
        """Execute pre-market routine (scheduled task)."""
        print(f"\n{'='*70}")
        print(f"🔔 SCHEDULED TASK TRIGGERED: Pre-Market Routine ({pass_name.upper()})")
        print(f"⏰ NY Time: {datetime.now(self.ny_tz).strftime('%Y-%m-%d %H:%M:%S %Z')}")
        print(f"{'='*70}\n")

        async with AsyncSessionLocal() as db:
            routine = PreMarketRoutineService(db)
            try:
                report = await routine.run_routine(symbol="QQQ")
                await self._ensure_pre_market_session(db, report.date, report.id, pass_name)
                print(f"\n✅ Pre-market routine completed successfully!")
                print(f"📊 Report ID: {report.id}")
                print(f"🎯 Confidence: {report.confidence:.0%}\n")
            except Exception as e:
                print(f"\n❌ Pre-market routine failed: {str(e)}\n")
                import traceback
                traceback.print_exc()
                raise

    def start(self):
        """Start the scheduler."""
        if not settings.ENABLE_SCHEDULER:
            print("⚠️  Scheduler is disabled in settings (ENABLE_SCHEDULER=false)")
            return

        # Schedule preliminary pre-market routine: 6:30 AM NY time, Monday-Friday
        self.scheduler.add_job(
            self.run_pre_market_routine,
            trigger=CronTrigger(
                hour=6,
                minute=30,
                day_of_week='mon-fri',
                timezone=self.ny_tz
            ),
            id='pre_market_routine',
            name='Pre-Market Routine (6:30 AM NY)',
            replace_existing=True,
            kwargs={'pass_name': 'prelim'}
        )

        # Schedule final validation pass: 8:15 AM NY time, Monday-Friday
        self.scheduler.add_job(
            self.run_pre_market_routine,
            trigger=CronTrigger(
                hour=8,
                minute=15,
                day_of_week='mon-fri',
                timezone=self.ny_tz
            ),
            id='pre_market_routine_final',
            name='Pre-Market Routine (8:15 AM NY)',
            replace_existing=True,
            kwargs={'pass_name': 'final'}
        )

        self.scheduler.start()

        prelim_next = self.scheduler.get_job('pre_market_routine').next_run_time
        final_next = self.scheduler.get_job('pre_market_routine_final').next_run_time
        print(f"\n✅ Scheduler started")
        print(f"📅 Next preliminary run: {prelim_next.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        print(f"📅 Next final validation run: {final_next.strftime('%Y-%m-%d %H:%M:%S %Z')}\n")

    def shutdown(self):
        """Shutdown the scheduler."""
        if self.scheduler.running:
            self.scheduler.shutdown()
            print("\n🛑 Scheduler stopped\n")

    async def _ensure_pre_market_session(self, db, report_date, report_id, pass_name: str):
        """Create or update a pre-market coach session for the given date."""
        query = select(CoachSession).where(
            CoachSession.phase == 'pre_market',
            CoachSession.related_date == report_date
        ).order_by(CoachSession.started_at.desc())
        result = await db.execute(query)
        session = result.scalars().first()

        timestamp = datetime.utcnow().isoformat()
        system_note = {
            "role": "system",
            "content": f"Auto-generated pre-market report ({pass_name}) ready. Report ID: {report_id}.",
            "timestamp": timestamp
        }

        if session:
            session.messages = session.messages or []
            session.messages.append(system_note)
            session.updated_at = datetime.utcnow()
        else:
            session = CoachSession(
                session_id=f"coach_{uuid.uuid4().hex[:12]}",
                phase='pre_market',
                related_date=report_date,
                messages=[system_note]
            )
            db.add(session)

        await db.commit()


# Global scheduler instance
scheduler_service = SchedulerService()
