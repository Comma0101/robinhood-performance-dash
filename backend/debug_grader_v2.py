import asyncio
import pandas as pd
from datetime import date, datetime
import pytz
from app.utils.data_fetcher import fetch_ohlcv
from app.services.langchain.coach import ICTCoachService
from app.models.trading import PreMarketReport, BiasType

# Mock Report Data (based on user logs)
mock_report = PreMarketReport(
    symbol="QQQ",
    date=date(2025, 12, 1),
    htf_bias=BiasType.NEUTRAL,
    long_scenario={
        "entry_zone": {"low": 614.38, "high": 614.38},
        "stop_loss": 612.38,
        "targets": [616.0, 618.0] # Guessing targets based on context
    },
    short_scenario={
        "entry_zone": {"low": 615.46, "high": 619.01},
        "stop_loss": 620.01,
        "targets": [613.0]
    },
    target_sessions=["NY_AM"] # Implies RTH
)

async def debug_grading():
    print("🔍 Fetching data for QQQ...")
    # Fetch 1m data
    df = await fetch_ohlcv("QQQ", timeframe="1m", limit=500)
    
    if df.empty:
        print("❌ No data returned!")
        return

    print(f"📊 Data fetched: {len(df)} rows")
    print("First 5 rows:")
    print(df.head())
    print("\nLast 5 rows:")
    print(df.tail())
    
    # Check 09:30 candle
    print("\n🕒 Checking around 09:30 NY time...")
    ny_tz = pytz.timezone('America/New_York')
    
    found_open = False
    for i, row in df.iterrows():
        ts = row['timestamp']
        # Localize if naive
        if ts.tzinfo is None:
            # Try assuming it's ALREADY NY time (as per my latest fix)
            # But wait, data_fetcher returns naive. 
            # If Alpha Vantage gives EST, then naive 09:30 IS 09:30 EST.
            pass
            
        # Let's print the raw timestamp and what we think it is
        # If we assume it's EST:
        ts_ny = ts # It's already naive EST
        
        if ts_ny.hour == 9 and ts_ny.minute >= 30 and ts_ny.minute < 35:
            print(f"  Row {i}: {ts} | Open: {row['open']} High: {row['high']} Low: {row['low']} Close: {row['close']}")
            found_open = True
            
    if not found_open:
        print("❌ Could not find 09:30-09:35 candles!")

    print("\n🏃 Running Simulation...")
    coach = ICTCoachService(None) # DB not needed for this method
    
    # We need to patch the method to print what it's doing
    # Or just copy the logic here for debugging
    
    # ... (Copying logic from coach.py for debugging)
    report = mock_report
    direction = "long"
    scenario = report.long_scenario
    entry_low = scenario.get('entry_zone', {}).get('low')
    entry_high = scenario.get('entry_zone', {}).get('high')
    stop = scenario.get('stop_loss')
    targets = scenario.get('targets', [])
    
    print(f"\n📈 Simulating LONG: Entry {entry_low}-{entry_high}, SL {stop}")
    
    entry_triggered = False
    
    for index, row in df.iterrows():
        current_time = row['timestamp']
        current_hour = current_time.hour
        current_minute = current_time.minute
        
        # RTH Filter
        if current_hour < 9 or (current_hour == 9 and current_minute < 30):
            continue
            
        if not entry_triggered:
            # Check Zone
            # Long: Low <= Entry High (and High >= Entry Low)
            if row['low'] <= entry_high and row['high'] >= entry_low:
                print(f"  ✅ Trigger candidate at {current_time}: Low {row['low']} <= {entry_high}")
                
                # Check SL in same candle
                if row['low'] <= stop:
                    print(f"    ❌ Stopped out immediately in same candle! Low {row['low']} <= {stop}")
                    continue
                    
                entry_triggered = True
                print(f"    🚀 ENTERED LONG at {current_time}")
                continue
        
        if entry_triggered:
            if row['low'] <= stop:
                print(f"    💀 STOPPED OUT at {current_time}: Low {row['low']} <= {stop}")
                break
            if row['high'] >= targets[0]:
                print(f"    🏆 TARGET HIT at {current_time}: High {row['high']} >= {targets[0]}")
                # Don't break, check for more targets
                
if __name__ == "__main__":
    asyncio.run(debug_grading())
