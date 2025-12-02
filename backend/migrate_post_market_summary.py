"""
Migration script to add post_market_summary to pre_market_reports table.
"""
import asyncio
from sqlalchemy import text
from app.core.database import engine


async def migrate():
    """Add post_market_summary column to pre_market_reports table."""

    migrations = [
        "ALTER TABLE pre_market_reports ADD COLUMN IF NOT EXISTS post_market_summary TEXT",
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
