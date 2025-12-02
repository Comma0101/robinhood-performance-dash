"""
Migration script to add new pre-market report fields.
Run this once to update the database schema.
"""
import asyncio
from sqlalchemy import text
from app.core.database import engine


async def migrate():
    """Add new columns to pre_market_reports table."""

    migrations = [
        # Step 2: Session Structure
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS asian_session_high FLOAT",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS asian_session_low FLOAT",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS london_session_high FLOAT",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS london_session_low FLOAT",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS session_liquidity_sweeps JSON",

        # Step 3: Dealing Range Zones
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS premium_zone FLOAT",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS discount_zone FLOAT",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS equilibrium FLOAT",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS dealing_range_source VARCHAR(20)",

        # Step 4: Liquidity Locations
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS inducement_liquidity JSON",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS target_liquidity JSON",

        # Step 5: Day Type Classification
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS day_type VARCHAR(20) DEFAULT 'unknown'",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS day_type_reasoning TEXT",

        # Step 6: Trade Scenarios
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS long_scenario JSON",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS short_scenario JSON",

        # Remove unique constraint from date column to allow multiple symbols per day
        "DROP INDEX IF EXISTS ix_pre_market_reports_date",

        # Add composite unique constraint on (date, symbol)
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_report_date_symbol ON pre_market_reports(date, symbol)",

        # Session completeness metadata
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS asian_bars_count INTEGER",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS london_bars_count INTEGER",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS sessions_last_ts TIMESTAMP",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS asian_complete BOOLEAN",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS london_complete BOOLEAN",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS london_made_high BOOLEAN",
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS london_made_low BOOLEAN",
    ]

    async with engine.begin() as conn:
        for migration in migrations:
            print(f"Executing: {migration}")
            try:
                await conn.execute(text(migration))
                print("  ✓ Success")
            except Exception as e:
                print(f"  ⚠️ {str(e)}")

    print("\n✅ Migration complete!")


if __name__ == "__main__":
    print("🔧 Starting database migration...\n")
    asyncio.run(migrate())
