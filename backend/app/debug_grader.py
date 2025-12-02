import asyncio
import sys
import os
from datetime import date
from unittest.mock import MagicMock
from app.models.trading import PreMarketReport, BiasType

# Add backend directory to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.services.langchain.coach import ICTCoachService

async def debug_grading_execution():
    print("Debugging Post-Market Grading Execution...")
    
    service = ICTCoachService(None)
    
    # Mock DB session
    service.db = MagicMock()
    service.db.execute = MagicMock(return_value=asyncio.Future())
    # Mock result for trades query (empty list)
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_result.scalar_one_or_none.return_value = None
    service.db.execute.return_value.set_result(mock_result)
    
    # Mock Report
    report = MagicMock(spec=PreMarketReport)
    report.symbol = "QQQ"
    report.htf_bias = BiasType.NEUTRAL
    report.long_scenario = None
    report.short_scenario = None
    report.date = date.today()
    report.htf_dealing_range_low = 100.0
    report.htf_dealing_range_high = 200.0
    report.asian_session_high = 150.0
    report.asian_session_low = 140.0
    report.london_session_high = 160.0
    report.london_session_low = 145.0
    report.confidence = 0.8
    report.narrative = "Test narrative"
    report.discount_zone = 120.0
    report.premium_zone = 180.0
    report.equilibrium = 150.0
    report.day_type = "trend"
    report.day_type_reasoning = "Test reasoning"
    report.session_liquidity_sweeps = []
    
    # Mock _get_premarket_report to return our mock report
    service._get_premarket_report = MagicMock(return_value=asyncio.Future())
    service._get_premarket_report.return_value.set_result(report)
    
    # Mock _get_premarket_report_by_symbol
    service._get_premarket_report_by_symbol = MagicMock(return_value=asyncio.Future())
    service._get_premarket_report_by_symbol.return_value.set_result(report)

    # Mock fetch_ohlcv (we need to patch it where it's imported in coach.py)
    # Since we can't easily patch the imported function in this script without more complex setup,
    # we'll rely on the fact that the real fetch_ohlcv might be called if we don't patch it.
    # However, running this outside docker might fail if it can't hit Alpha Vantage.
    # Let's just run this inside docker.
    
    print("Calling _gather_context with post_market phase...")
    context = await service._gather_context(
        phase="post_market",
        related_date=date.today(),
        related_trade_id=None,
        user_message="How was QQQ today?"
    )
    
    print("\n--- Context Result ---")
    print(context)
    
    if "DAILY REPORT CARD" in context:
        print("\n✅ SUCCESS: Report Card found in context.")
    else:
        print("\n❌ FAILURE: Report Card NOT found in context.")

if __name__ == "__main__":
    asyncio.run(debug_grading_execution())
