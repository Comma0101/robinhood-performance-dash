"""
Check latest report summary.
"""
import asyncio
from sqlalchemy import select
from app.core.database import engine, AsyncSessionLocal
from app.models.trading import PreMarketReport

async def check_summary():
    async with AsyncSessionLocal() as db:
        query = select(PreMarketReport).order_by(PreMarketReport.id.desc()).limit(1)
        result = await db.execute(query)
        report = result.scalar_one_or_none()
        
        if report:
            print(f"Report ID: {report.id}")
            print(f"Date: {report.date}")
            print(f"Symbol: {report.symbol}")
            print(f"Summary Length: {len(report.post_market_summary) if report.post_market_summary else 0}")
            print(f"Summary Content: {report.post_market_summary[:100] if report.post_market_summary else 'None'}...")
        else:
            print("No reports found.")

if __name__ == "__main__":
    asyncio.run(check_summary())
