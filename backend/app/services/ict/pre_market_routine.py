"""
Pre-Market Routine Service
Executes the complete 6-step ICT pre-market analysis routine.

This service runs every morning at 6:30 AM NY time and generates
a comprehensive trading plan following ICT methodology.
"""
from datetime import datetime, date, time, timedelta
from typing import Dict, Any, List, Optional, Tuple, Union
from sqlalchemy.ext.asyncio import AsyncSession
import pandas as pd
import pytz
import json

from app.services.ict.analyzer import ICTAnalyzer
from app.utils.data_fetcher import fetch_ohlcv
from app.models.trading import PreMarketReport, BiasType
from app.schemas.trading import PreMarketReportCreate
from app.core.config import settings

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser


def find_timestamp_objects(data: Any, path: str = "root") -> List[str]:
    """
    Recursively find pandas Timestamp objects in a data structure.
    Returns a list of paths to Timestamp objects.
    """
    timestamps = []

    if isinstance(data, pd.Timestamp):
        timestamps.append(f"{path} = Timestamp({data})")
    elif isinstance(data, dict):
        for key, value in data.items():
            timestamps.extend(find_timestamp_objects(value, f"{path}.{key}"))
    elif isinstance(data, (list, tuple)):
        for i, item in enumerate(data):
            timestamps.extend(find_timestamp_objects(item, f"{path}[{i}]"))

    return timestamps


def ensure_json_serializable(data: Any) -> Any:
    """
    Ensure data is fully JSON serializable by doing a round-trip conversion.
    This handles pandas Timestamp objects and other non-JSON-serializable types.
    """
    def default_converter(obj):
        """Convert non-serializable objects to strings."""
        if isinstance(obj, (pd.Timestamp, datetime, date)):
            return obj.isoformat()
        return str(obj)

    # Round-trip through JSON to ensure everything is serializable
    return json.loads(json.dumps(data, default=default_converter))


class PreMarketRoutineService:
    """
    Comprehensive pre-market routine following ICT methodology.

    Executes 6 steps:
    1. HTF Bias Analysis (Daily/4H)
    2. Session Structure Analysis (Asian/London)
    3. Dealing Range Construction (Premium/Discount)
    4. Liquidity Identification
    5. Day Type Classification (Trend/Reversal/Consolidation)
    6. Trade Plan Generation (Long/Short A+ scenarios)
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.analyzer = ICTAnalyzer(db)
        self.ny_tz = pytz.timezone('America/New_York')
        
        # Initialize Gemini
        self.llm = ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL,
            temperature=0.7,
            google_api_key=settings.GEMINI_API_KEY,
            convert_system_message_to_human=True
        )

    async def run_routine(
        self,
        symbol: str = "QQQ",
        target_date: Optional[date] = None,
        cutoff_ny: Optional[datetime] = None,
        persist: bool = True
    ) -> Union[PreMarketReport, Dict[str, Any]]:
        """
        Execute the complete pre-market routine.

        Args:
            symbol: Trading symbol (default: QQQ)
            target_date: Date for analysis (default: today)

        Returns:
            PreMarketReport object saved to database
        """
        current_time_ny = cutoff_ny.astimezone(self.ny_tz) if cutoff_ny else datetime.now(self.ny_tz)

        if target_date is None:
            target_date = current_time_ny.date()

        print(f"\n{'='*60}")
        print(f"🌅 PRE-MARKET ROUTINE - {target_date}")
        print(f"📊 Symbol: {symbol}")
        print(f"⏰ NY Time: {current_time_ny.strftime('%H:%M:%S')}")
        print(f"{'='*60}\n")

        # Step 1: HTF Bias
        htf_bias, htf_data = await self._step1_htf_bias(symbol)

        # Step 2: Session Structure
        session_data = await self._step2_session_structure(symbol, current_time_ny, cutoff_ny)

        # Step 3: Dealing Range
        dealing_range_data = await self._step3_dealing_range(symbol, htf_data, current_time_ny)

        # Step 4: Liquidity Identification
        liquidity_data = await self._step4_liquidity(symbol, session_data, htf_data)

        # Step 5: Day Type Classification
        day_type, day_type_reasoning = await self._step5_day_type(
            htf_bias, session_data, htf_data
        )

        # Step 6: Trade Plan Generation
        long_scenario, short_scenario = await self._step6_trade_plan(
            symbol, htf_bias, dealing_range_data, liquidity_data, day_type, htf_data, cutoff_ny
        )

        # Step 6.5: AI Evaluation of Scenarios
        long_scenario, short_scenario = await self._evaluate_scenarios_with_llm(
            symbol, htf_bias, day_type, long_scenario, short_scenario, htf_data
        )

        # Generate narrative (now async with LLM)
        narrative = await self._generate_narrative(
            symbol, htf_bias, session_data, day_type, htf_data, long_scenario, short_scenario
        )

        # Calculate confidence
        confidence = self._calculate_confidence(
            htf_bias, day_type, htf_data, session_data
        )

        # DEBUG: Find any Timestamp objects in JSON fields before insertion
        print("\n🔍 Checking for Timestamp objects in JSON fields...")
        json_fields_to_check = {
            'htf_key_levels': htf_data['key_levels'],
            'ltf_entry_zones': [],
            'session_liquidity_sweeps': session_data['sweeps'],
            'target_sessions': ["LONDON_OPEN", "NY_OPEN"],
            'inducement_liquidity': liquidity_data['inducement'],
            'target_liquidity': liquidity_data['targets'],
            'long_scenario': long_scenario,
            'short_scenario': short_scenario,
            'trade_plan': {
                "direction": "long" if htf_bias == BiasType.BULLISH else "short",
                "primary_scenario": "long" if htf_bias == BiasType.BULLISH else "short"
            }
        }

        for field_name, field_data in json_fields_to_check.items():
            timestamps = find_timestamp_objects(field_data, field_name)
            if timestamps:
                print(f"❌ Found Timestamps in {field_name}:")
                for ts_path in timestamps:
                    print(f"   {ts_path}")
            else:
                print(f"✅ {field_name}: OK")

        report_payload = {
            'date': target_date,
            'symbol': symbol,
            'htf_bias': htf_bias,
            'htf_dealing_range_high': dealing_range_data['high'],
            'htf_dealing_range_low': dealing_range_data['low'],
            'htf_key_levels': ensure_json_serializable(htf_data['key_levels']),
            'ltf_structure': htf_data['market_structure'],
            'ltf_entry_zones': [],
            'asian_session_high': session_data['asian']['high'],
            'asian_session_low': session_data['asian']['low'],
            'london_session_high': session_data['london']['high'],
            'london_session_low': session_data['london']['low'],
            'session_liquidity_sweeps': ensure_json_serializable(session_data['sweeps']),
            'asian_bars_count': session_data['meta']['asian_bars'],
            'london_bars_count': session_data['meta']['london_bars'],
            # Parse datetime from ISO string (already naive since we stripped timezone at source)
            'sessions_last_ts': datetime.fromisoformat(session_data['meta']['last_ts']) if session_data['meta']['last_ts'] else None,
            'asian_complete': session_data['meta']['asian_complete'],
            'london_complete': session_data['meta']['london_complete'],
            'london_made_high': session_data['meta']['london_made_high'],
            'london_made_low': session_data['meta']['london_made_low'],
            'premium_zone': dealing_range_data['premium'],
            'discount_zone': dealing_range_data['discount'],
            'equilibrium': dealing_range_data['equilibrium'],
            'dealing_range_source': dealing_range_data.get('source'),
            'inducement_liquidity': ensure_json_serializable(liquidity_data['inducement']),
            'target_liquidity': ensure_json_serializable(liquidity_data['targets']),
            'day_type': day_type,
            'day_type_reasoning': day_type_reasoning,
            'long_scenario': ensure_json_serializable(long_scenario),
            'short_scenario': ensure_json_serializable(short_scenario),
            'target_sessions': ["LONDON_OPEN", "NY_OPEN"],
            'narrative': narrative,
            'trade_plan': {
                "direction": "long" if htf_bias == BiasType.BULLISH else "short",
                "primary_scenario": "long" if htf_bias == BiasType.BULLISH else "short"
            },
            'confidence': confidence
        }

        if not persist:
            return report_payload

        # Check if report already exists for this date+symbol (upsert logic)
        from sqlalchemy import select
        existing_query = select(PreMarketReport).where(
            PreMarketReport.date == target_date,
            PreMarketReport.symbol == symbol
        )
        result = await self.db.execute(existing_query)
        existing_report = result.scalars().first()

        if existing_report:
            print(f"   ℹ️ Updating existing report (ID: {existing_report.id})")
            self._assign_report_fields(existing_report, report_payload)
            report = existing_report
        else:
            report = PreMarketReport(**report_payload)
            self.db.add(report)

        # Save to database
        await self.db.commit()
        await self.db.refresh(report)

        print(f"\n✅ Pre-market report generated (ID: {report.id})")
        print(f"📊 HTF Bias: {htf_bias.value}")
        print(f"📈 Day Type: {day_type}")
        print(f"🎯 Confidence: {confidence:.0%}\n")

        return report

    def _assign_report_fields(self, report: PreMarketReport, payload: Dict[str, Any]) -> None:
        """Assign payload fields onto an existing report."""
        for key, value in payload.items():
            setattr(report, key, value)

    async def _step1_htf_bias(self, symbol: str) -> Tuple[BiasType, Dict[str, Any]]:
        """
        Step 1: Determine HTF bias (Daily/4H).

        Analyzes:
        - Market bias (bullish/bearish/neutral)
        - Previous day/week high/low
        - HTF order blocks and FVGs
        - Draw on Liquidity targets
        """
        print("📊 Step 1: HTF Bias Analysis...")

        # Run ICT analysis on Daily timeframe
        analysis = await self.analyzer.analyze(
            symbol=symbol,
            timeframes=["1D"],
            analysis_type="full"
        )

        htf_data = {
            'bias': analysis.htf_bias,
            'dealing_range': analysis.dealing_range,
            'order_blocks': analysis.order_blocks,
            'fvgs': analysis.fvgs,
            'liquidity_zones': analysis.liquidity_zones,
            'market_structure': analysis.market_structure,
            'key_levels': {
                'order_blocks': [ob.model_dump(mode='json') for ob in analysis.order_blocks[:3]],
                'fvgs': [fvg.model_dump(mode='json') for fvg in analysis.fvgs[:3]],
                'liquidity': [lz.model_dump(mode='json') for lz in analysis.liquidity_zones[:3]]
            }
        }

        print(f"   ✓ HTF Bias: {analysis.htf_bias.value}")
        if analysis.dealing_range:
            print(f"   ✓ Dealing Range: {analysis.dealing_range['low']:.2f} - {analysis.dealing_range['high']:.2f}")

        return analysis.htf_bias, htf_data

    async def _step2_session_structure(
        self,
        symbol: str,
        current_time_ny: datetime,
        cutoff_ny: Optional[datetime]
    ) -> Dict[str, Any]:
        """
        Step 2: Analyze overnight/London session structure.

        Analyzes:
        - Asian session range (00:00-05:00 NY)
        - London High/Low (02:00-08:00 NY)
        - Session liquidity sweeps
        - Determines if London made the high or low of day
        """
        print("🌙 Step 2: Session Structure Analysis...")

        # Fetch intraday data (15m for session analysis)
        df = await fetch_ohlcv(symbol, timeframe="15m", limit=200)

        # Reference NY time/date
        now_ny = current_time_ny
        today_start = datetime.combine(now_ny.date(), time(0, 0))

        # Make timezone aware
        if today_start.tzinfo is None:
            today_start = self.ny_tz.localize(today_start)

        # Asian session: 00:00 - 05:00 NY
        asian_start = today_start
        asian_end = today_start + timedelta(hours=5)

        # London session: 02:00 - 08:00 NY
        london_start = today_start + timedelta(hours=2)
        london_end = today_start + timedelta(hours=8)

        # Make df timestamps timezone aware for comparison (Alpha Vantage intraday is US/Eastern)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        if df['timestamp'].dt.tz is None:
            df['timestamp'] = df['timestamp'].dt.tz_localize('America/New_York')
        else:
            df['timestamp'] = df['timestamp'].dt.tz_convert(self.ny_tz)

        if cutoff_ny is not None:
            cutoff_local = cutoff_ny.astimezone(self.ny_tz)
            df = df[df['timestamp'] <= cutoff_local]

        # Filter data for sessions
        asian_data = df[(df['timestamp'] >= asian_start) & (df['timestamp'] < asian_end)]
        london_data = df[(df['timestamp'] >= london_start) & (df['timestamp'] < london_end)]

        # Overall range up to now (used to detect if London set HOD/LOD)
        overall_high = float(df['high'].max()) if len(df) > 0 else None
        overall_low = float(df['low'].min()) if len(df) > 0 else None

        # Calculate session highs/lows
        asian_high = float(asian_data['high'].max()) if len(asian_data) > 0 else None
        asian_low = float(asian_data['low'].min()) if len(asian_data) > 0 else None
        london_high = float(london_data['high'].max()) if len(london_data) > 0 else None
        london_low = float(london_data['low'].min()) if len(london_data) > 0 else None

        # Detect liquidity sweeps
        sweeps = self._detect_liquidity_sweeps(df, asian_high, asian_low, london_high, london_low)

        # Session completeness metadata
        asian_bars = int(len(asian_data)) if len(asian_data) > 0 else 0
        london_bars = int(len(london_data)) if len(london_data) > 0 else 0
        last_ts = None
        if len(df) > 0:
            try:
                # Last timestamp included (NY time) - convert to naive datetime for DB storage
                ts = df['timestamp'].max().to_pydatetime()
                # Remove timezone info since DB column is TIMESTAMP WITHOUT TIME ZONE
                last_ts = ts.replace(tzinfo=None) if ts.tzinfo else ts
            except Exception:
                last_ts = None

        asian_complete = now_ny >= asian_end
        london_complete = now_ny >= london_end

        tolerance = 1e-6
        london_made_high = bool(
            london_high is not None and overall_high is not None and abs(london_high - overall_high) <= tolerance
        )
        london_made_low = bool(
            london_low is not None and overall_low is not None and abs(london_low - overall_low) <= tolerance
        )

        session_data = {
            'asian': {'high': asian_high, 'low': asian_low},
            'london': {'high': london_high, 'low': london_low},
            'sweeps': sweeps,
            'meta': {
                'asian_bars': asian_bars,
                'london_bars': london_bars,
                'last_ts': last_ts.isoformat() if last_ts else None,
                'asian_complete': asian_complete,
                'london_complete': london_complete,
                'overall_high': overall_high,
                'overall_low': overall_low,
                'london_made_high': london_made_high,
                'london_made_low': london_made_low,
            }
        }

        if asian_high and asian_low:
            print(f"   ✓ Asian: {asian_low:.2f} - {asian_high:.2f}")
        if london_high and london_low:
            print(f"   ✓ London: {london_low:.2f} - {london_high:.2f}")
        print(f"   ✓ Sweeps detected: {len(sweeps)}")
        print(f"   ✓ Bars: Asian={asian_bars} (complete={asian_complete}), London={london_bars} (complete={london_complete})")
        if london_made_high:
            print("   • London currently holds the session high")
        if london_made_low:
            print("   • London currently holds the session low")

        return session_data

    async def _step3_dealing_range(
        self,
        symbol: str,
        htf_data: Dict[str, Any],
        current_time_ny: datetime
    ) -> Dict[str, Any]:
        """
        Step 3: Build ICT day trading range with Premium/Discount zones.

        Calculates:
        - Previous day high/low (preferred ICT day range)
        - If unavailable, fall back to HTF dealing range from analysis
        - If still unavailable, use recent 1D price range
        - Premium zone (61.8% - above equilibrium)
        - Discount zone (38.2% - below equilibrium)
        - Equilibrium (50%)
        """
        print("📏 Step 3: Dealing Range Construction...")

        range_source = "prev_day"

        # Preferred: previous day high/low (ICT day trading range)
        high = None
        low = None
        try:
            dfd = await fetch_ohlcv(symbol, timeframe="1D", limit=5)
            # Determine previous trading day row
            dfd['timestamp'] = pd.to_datetime(dfd['timestamp'])
            
            # Sort by date just in case
            dfd = dfd.sort_values('timestamp')
            
            # Get the last completed candle. 
            # If the last candle is today (incomplete), take the one before it.
            # If the last candle is yesterday (completed), take it.
            
            # Current date in NY (use passed current_time_ny, not real-time)
            today_ny = current_time_ny.date()
            
            # Check last row date
            last_row = dfd.iloc[-1]
            last_date = last_row['timestamp'].date()
            
            if last_date >= today_ny:
                # Last row is today (or future?), so take previous
                if len(dfd) > 1:
                    prev_row = dfd.iloc[-2]
                    high = float(prev_row['high'])
                    low = float(prev_row['low'])
                    print(f"   • Using previous day candle: {prev_row['timestamp'].date()}")
                else:
                    # Not enough data
                    high = None
                    low = None
            else:
                # Last row is in the past (completed), so use it
                high = float(last_row['high'])
                low = float(last_row['low'])
                print(f"   • Using last completed candle: {last_date}")
                
        except Exception as e:
            print(f"   ⚠️ Error fetching daily data: {e}")
            high = None
            low = None

        # Fallback: HTF dealing range from analysis
        if high is None or low is None:
            dealing_range = htf_data.get('dealing_range')
            if dealing_range and 'high' in dealing_range and 'low' in dealing_range:
                high = dealing_range['high']
                low = dealing_range['low']
                range_source = "htf"
                print("   ⚠️ Falling back to HTF dealing range (may be too wide for intraday)")

        # Fallback: recent 1D price range
        if high is None or low is None:
            dfd = await fetch_ohlcv(symbol, timeframe="1D", limit=50)
            high = float(dfd['high'].max())
            low = float(dfd['low'].min())
            range_source = "recent_1D"

        # Calculate zones
        range_size = high - low
        equilibrium = low + (range_size * 0.50)  # 50%
        premium = low + (range_size * 0.618)      # 61.8% (Golden ratio)
        discount = low + (range_size * 0.382)     # 38.2%

        zones = {
            'high': high,
            'low': low,
            'equilibrium': equilibrium,
            'premium': premium,
            'discount': discount,
            'source': range_source
        }

        print(f"   ✓ Range: {low:.2f} - {high:.2f} (source={range_source})")
        print(f"   ✓ Premium: {premium:.2f} (61.8%)")
        print(f"   ✓ EQ: {equilibrium:.2f} (50%)")
        print(f"   ✓ Discount: {discount:.2f} (38.2%)")

        return zones

    async def _step4_liquidity(
        self,
        symbol: str,
        session_data: Dict[str, Any],
        htf_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Step 4: Identify pre-market liquidity locations.

        Identifies:
        - Equal highs/lows
        - Small consolidation tops/bottoms
        - Pre-market high/low
        - Previous day unmitigated OB/FVG
        - Classifies as inducement vs. target liquidity
        """
        print("💧 Step 4: Liquidity Identification...")

        inducement = []
        targets = []

        # Asian/London levels as potential inducement
        if session_data['asian']['high']:
            inducement.append({
                'type': 'BSL',
                'price': float(session_data['asian']['high']),
                'description': 'Asian Session High'
            })
        if session_data['asian']['low']:
            inducement.append({
                'type': 'SSL',
                'price': float(session_data['asian']['low']),
                'description': 'Asian Session Low'
            })

        # HTF liquidity zones as targets
        for lz in htf_data['liquidity_zones'][:3]:
            targets.append({
                'type': lz.zone_type,
                'price': float(lz.price),
                'description': f"HTF {lz.zone_type} liquidity (strength: {lz.strength:.1f})"
            })

        liquidity_data = {
            'inducement': inducement,
            'targets': targets
        }

        print(f"   ✓ Inducement levels: {len(inducement)}")
        print(f"   ✓ Target levels: {len(targets)}")

        return liquidity_data

    async def _step5_day_type(
        self,
        htf_bias: BiasType,
        session_data: Dict[str, Any],
        htf_data: Dict[str, Any]
    ) -> Tuple[str, str]:
        """
        Step 5: Classify day type (Trend/Reversal/Consolidation).

        Trend Day:
        - Strong HTF bias
        - Clean London sweep + displacement
        - Unfilled imbalance (FVG)

        Reversal Day:
        - London swept both sides
        - Deep HTF OB/FVG zone
        - CHoCH present

        Consolidation Day:
        - No clean sweep
        - No HTF draw nearby
        - Price in middle of range
        """
        print("🎯 Step 5: Day Type Classification...")

        # Scoring system
        trend_score = 0
        reversal_score = 0
        consolidation_score = 0

        # HTF bias check
        if htf_bias != BiasType.NEUTRAL:
            trend_score += 2
        else:
            consolidation_score += 2

        # London session behavior
        sweeps = session_data.get('sweeps', [])
        bsl_swept = any(s['type'] == 'BSL' for s in sweeps)
        ssl_swept = any(s['type'] == 'SSL' for s in sweeps)

        if bsl_swept and ssl_swept:
            # Both sides swept - reversal signal
            reversal_score += 3
        elif bsl_swept or ssl_swept:
            # One side swept - trend signal
            trend_score += 2
        else:
            # No sweeps - consolidation
            consolidation_score += 2

        # Order blocks (strong OB = potential reversal zone)
        strong_obs = [ob for ob in htf_data['order_blocks'] if ob.strength > 0.7]
        if len(strong_obs) > 0:
            reversal_score += 1

        # FVGs (unfilled FVGs = trend continuation)
        unfilled_fvgs = [fvg for fvg in htf_data['fvgs'] if not fvg.filled]
        if len(unfilled_fvgs) > 2:
            trend_score += 1

        # Determine day type
        if trend_score >= max(reversal_score, consolidation_score) + 1:
            day_type = "trend"
            reasoning = f"Strong HTF bias ({htf_bias.value}), clean London sweep, {len(unfilled_fvgs)} unfilled FVGs. Expect continuation."
        elif reversal_score >= max(trend_score, consolidation_score) + 1:
            day_type = "reversal"
            reasoning = f"London swept both sides, {len(strong_obs)} strong OBs present. Watch for reversal from HTF zone."
        else:
            day_type = "consolidation"
            reasoning = "No clear directional bias, minimal London activity. Reduce size or avoid trading."

        print(f"   ✓ Day Type: {day_type.upper()}")
        print(f"   ✓ Reasoning: {reasoning}")

        return day_type, reasoning

    async def _step6_trade_plan(
        self,
        symbol: str,
        htf_bias: BiasType,
        dealing_range: Dict[str, Any],
        liquidity_data: Dict[str, Any],
        day_type: str,
        htf_data: Dict[str, Any],
        cutoff_ny: Optional[datetime]
    ) -> Tuple[Dict, Dict]:
        """
        Step 6: Generate Long and Short A+ scenarios.

        Long A+ Scenario:
        - Sweep of SSL
        - Bullish displacement
        - Bullish FVG/OB in discount
        - Entry at OTE 62-79%
        - Stop below entry zone
        - Targets at next BSL

        Short A+ Scenario:
        - Sweep of BSL
        - Bearish displacement
        - Bearish FVG/OB in premium
        - Entry at OTE 62-79%
        - Stop above entry zone
        - Targets at next SSL
        """
        print("📋 Step 6: Trade Plan Generation...")

        # Get current price
        df = await fetch_ohlcv(symbol, timeframe="5m", limit=500)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        if df['timestamp'].dt.tz is None:
            df['timestamp'] = df['timestamp'].dt.tz_localize('America/New_York')
        else:
            df['timestamp'] = df['timestamp'].dt.tz_convert(self.ny_tz)

        if cutoff_ny is not None:
            cutoff_local = cutoff_ny.astimezone(self.ny_tz)
            df = df[df['timestamp'] <= cutoff_local]

        current_price = float(df['close'].iloc[-1]) if len(df) > 0 else 0.0

        # Extract FVGs from HTF data
        htf_fvgs = htf_data.get('fvgs', [])

        # Fetch Intraday FVGs (15m) for better precision
        print("   🔍 Fetching Intraday (15m) FVGs...")
        intraday_analysis = await self.analyzer.analyze(
            symbol=symbol,
            timeframes=["15m"],
            analysis_type="structure_only"
        )
        intraday_fvgs = intraday_analysis.fvgs
        print(f"   ✓ Found {len(intraday_fvgs)} Intraday FVGs")

        # Combine FVGs (prioritize Intraday)
        all_fvgs = intraday_fvgs + htf_fvgs

        # Long scenario
        long_scenario = self._build_long_scenario(
            current_price, htf_bias, dealing_range, liquidity_data, day_type, all_fvgs, intraday_fvgs
        )

        # Short scenario
        short_scenario = self._build_short_scenario(
            current_price, htf_bias, dealing_range, liquidity_data, day_type, all_fvgs, intraday_fvgs
        )

        print(f"   ✓ Long scenario: Entry {long_scenario['entry_zone']['low']:.2f}-{long_scenario['entry_zone']['high']:.2f}")
        print(f"   ✓ Short scenario: Entry {short_scenario['entry_zone']['low']:.2f}-{short_scenario['entry_zone']['high']:.2f}")

        return long_scenario, short_scenario

    # ========== HELPER METHODS ==========

    def _get_intraday_anchor(self, df: pd.DataFrame, current_time_ny: datetime) -> float:
        """
        Find the opening price at Midnight (00:00 NY) or 09:30 NY.
        Returns the most relevant anchor price for the current session.
        """
        # Default to first available price if no anchor found
        anchor_price = df['open'].iloc[0] if len(df) > 0 else 0.0
        
        # Convert current time to date for filtering
        current_date = current_time_ny.date()
        
        # Look for Midnight Open (00:00 NY)
        midnight_candle = df[
            (df['timestamp'].dt.date == current_date) & 
            (df['timestamp'].dt.hour == 0) & 
            (df['timestamp'].dt.minute == 0)
        ]
        
        if not midnight_candle.empty:
            anchor_price = float(midnight_candle.iloc[0]['open'])
            
        # If we are past 09:30, check if 09:30 Open is better (e.g. for NY Session trades)
        # For now, we stick to Midnight Open as the primary "True Day" anchor, 
        # but could switch to 09:30 for specific strategies.
        
        return anchor_price

    def _calculate_intraday_range(
        self, 
        anchor_price: float, 
        current_high: float, 
        current_low: float, 
        direction: str
    ) -> Dict[str, float]:
        """
        Calculate the Intraday Dealing Range from Anchor to Current High/Low.
        
        Args:
            anchor_price: The opening price (Midnight or 09:30)
            current_high: The high of the day so far
            current_low: The low of the day so far
            direction: "long" (expecting higher prices) or "short" (expecting lower prices)
            
        Returns:
            Dict with 'high', 'low', 'equilibrium', 'premium', 'discount'
        """
        if direction == "long":
            # For longs, we look at the range from Low to High? 
            # Actually, for a continuation long, the range is usually the impulse leg.
            # Standard ICT: Range is defined by the swing high and swing low.
            # If we are trending up, the range is Low of Day (or Anchor) to High of Day.
            range_low = min(anchor_price, current_low)
            range_high = current_high
        else:
            # For shorts, range is High of Day (or Anchor) to Low of Day.
            range_high = max(anchor_price, current_high)
            range_low = current_low
            
        range_size = range_high - range_low
        equilibrium = range_low + (range_size * 0.5)
        
        return {
            "high": range_high,
            "low": range_low,
            "equilibrium": equilibrium,
            "premium": range_low + (range_size * 0.618),
            "discount": range_low + (range_size * 0.382)
        }

    def _calculate_adr(self, df_daily: pd.DataFrame, period: int = 10) -> float:
        """Calculate 10-day Average Daily Range (ADR)."""
        if len(df_daily) < period:
            return 0.0
            
        df = df_daily.tail(period).copy()
        df['range'] = df['high'] - df['low']
        return float(df['range'].mean())

    def _is_statistically_reachable(self, target_price: float, current_price: float, adr: float) -> bool:
        """
        Returns False if the target is further than 50% of ADR from current price.
        Why 50%? Because we usually capture the 'remaining' expansion, not the whole day.
        """
        if adr <= 0: return True # Safety fallback
        
        max_reach = adr * 0.5
        distance = abs(target_price - current_price)
        
        if distance > max_reach:
            return False
        return True

    def _detect_liquidity_sweeps(
        self,
        df: pd.DataFrame,
        asian_high: Optional[float],
        asian_low: Optional[float],
        london_high: Optional[float],
        london_low: Optional[float]
    ) -> List[Dict[str, Any]]:
        """Detect if key levels were swept."""
        sweeps = []

        # Check if Asian highs/lows were swept during London
        if asian_high and len(df) > 0 and df['high'].max() > asian_high:
            sweeps.append({
                'type': 'BSL',
                'level': 'Asian High',
                'price': float(asian_high)  # Ensure native Python float
            })

        if asian_low and len(df) > 0 and df['low'].min() < asian_low:
            sweeps.append({
                'type': 'SSL',
                'level': 'Asian Low',
            })

        return sweeps

    async def _generate_narrative(
        self,
        symbol: str,
        htf_bias: BiasType,
        session_data: Dict[str, Any],
        day_type: str,
        htf_data: Dict[str, Any],
        long_scenario: Dict[str, Any],
        short_scenario: Dict[str, Any]
    ) -> str:
        """Generate human-readable narrative using Gemini."""
        print("📝 Generating AI Narrative...")
        
        # Prepare context for the LLM
        context = {
            "symbol": symbol,
            "bias": htf_bias.value,
            "day_type": day_type,
            "london_sweeps": [s['level'] for s in session_data.get('sweeps', [])],
            "london_status": session_data.get('meta', {}),
            "key_levels": htf_data.get('key_levels', {}),
            "long_plan": long_scenario,
            "short_plan": short_scenario
        }

        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an elite ICT (Inner Circle Trader) Analyst writing a Morning Briefing.
            
            Your Goal: Synthesize the technical data into a concise, professional, and actionable 3-paragraph memo.
            
            Tone: Professional, Direct, Institutional. No fluff.
            
            Structure:
            1. **Market Context**: Summarize the HTF Bias and Day Type. Explain WHY (e.g., "We are Bullish due to respecting the Daily Order Block...").
            2. **Session Recap**: Briefly mention what London did (Sweeps, High/Low formation).
            3. **Strategic Focus**: Discuss the best approach for the session based on the AI ratings. Explain the logic behind the preferred direction.
            
            IMPORTANT: Do NOT list specific Entry, Stop Loss, or Target prices in this narrative. Simply refer the trader to the "Trade Plan" cards below for the exact execution levels.
            
            Data Provided:
            {context}
            
            Write the narrative now."""),
            ("human", "Generate the Morning Report narrative.")
        ])

        chain = prompt | self.llm | StrOutputParser()

        try:
            response = await chain.ainvoke({"context": json.dumps(context, default=str)})
            return response
        except Exception as e:
            print(f"⚠️ LLM Narrative Generation Failed: {e}")
            return f"Analysis Complete. Bias: {htf_bias.value}. Day Type: {day_type}. See trade plan for details."

    async def _evaluate_scenarios_with_llm(
        self,
        symbol: str,
        htf_bias: BiasType,
        day_type: str,
        long_scenario: Dict[str, Any],
        short_scenario: Dict[str, Any],
        htf_data: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Step 6.5: Have the LLM judge the quality of the generated scenarios.
        """
        print("⚖️  Step 6.5: AI Scenario Evaluation...")

        # Prepare context
        context = {
            "symbol": symbol,
            "bias": htf_bias.value,
            "day_type": day_type,
            "key_levels": htf_data.get('key_levels', {}),
            "long_scenario": long_scenario,
            "short_scenario": short_scenario
        }

        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a Senior ICT Mentor. Your job is to CRITIQUE the algorithmic trade setups provided.

            Analyze the Long and Short scenarios against the Market Context (Bias, Day Type, Key Levels).
            
            For EACH scenario, provide:
            1. Rating: "A+" (High Probability), "B" (Decent), "C" (Weak), or "INVALID" (Do not take).
            2. Reasoning: Why? (e.g., "Aligned with Daily Bias and FVG", or "Counter-trend and low R:R").

            Strictly output JSON in this format:
            {{
                "long_evaluation": {{
                    "rating": "...",
                    "reasoning": "..."
                }},
                "short_evaluation": {{
                    "rating": "...",
                    "reasoning": "..."
                }}
            }}
            """),
            ("human", "Evaluate these scenarios:\n{context}")
        ])

        chain = prompt | self.llm | StrOutputParser()

        try:
            response_str = await chain.ainvoke({"context": json.dumps(context, default=str)})
            # Clean up markdown code blocks if present
            response_str = response_str.replace("```json", "").replace("```", "").strip()
            evaluation = json.loads(response_str)

            # Update scenarios with AI judgment
            long_eval = evaluation.get("long_evaluation", {})
            short_eval = evaluation.get("short_evaluation", {})

            long_scenario["ai_rating"] = long_eval.get("rating", "N/A")
            long_scenario["ai_reasoning"] = long_eval.get("reasoning", "No evaluation")
            # Add to entry conditions for visibility
            long_scenario["entry_conditions"].insert(0, f"AI Rating: {long_scenario['ai_rating']}")
            
            short_scenario["ai_rating"] = short_eval.get("rating", "N/A")
            short_scenario["ai_reasoning"] = short_eval.get("reasoning", "No evaluation")
            # Add to entry conditions for visibility
            short_scenario["entry_conditions"].insert(0, f"AI Rating: {short_scenario['ai_rating']}")

            print(f"   ✓ Long Rating: {long_scenario['ai_rating']}")
            print(f"   ✓ Short Rating: {short_scenario['ai_rating']}")

        except Exception as e:
            print(f"   ⚠️ AI Evaluation Failed: {e}")
            long_scenario["ai_rating"] = "N/A"
            short_scenario["ai_rating"] = "N/A"

        return long_scenario, short_scenario

    def _build_long_scenario(
        self,
        current_price: float,
        htf_bias: BiasType,
        dealing_range: Dict[str, Any],
        liquidity_data: Dict[str, Any],
        day_type: str,
        fvgs: List[Any],
        intraday_fvgs: List[Any] = None
    ) -> Dict[str, Any]:
        """Build A+ long setup scenario using FVG entry."""
        # Initialize variables
        entry_high = 0.0
        entry_low = 0.0
        entry_type = "Discount Level (Math)"
        stop_loss = 0.0
        setup_quality = "C" # Default
        
        # Calculate ADR for Reachability Check
        # We need daily data... assuming we can get it or estimate it.
        # For now, we'll assume a standard ADR for QQQ (~5.0) if not available, 
        # or better, fetch it properly in Step 1 and pass it down.
        # TODO: Pass 'adr' from Step 1. For now, using a safe default or skipping if 0.
        adr = 5.0 # Placeholder for QQQ ADR
        
        # 1. Try to find "Ideal" Setup (Deep Discount of HTF Range)
        # Filter for bullish, UN-INVALIDATED FVGs that are below Equilibrium
        # AND are statistically reachable
        ideal_fvgs = [
            f for f in fvgs 
            if f.direction == "bullish" and not f.invalidated and f.high < dealing_range['equilibrium']
            and self._is_statistically_reachable(f.high, current_price, adr)
        ]
        
        selected_fvg = None
        is_continuation = False
        market_execution_mode = False
        
        if ideal_fvgs:
            # Pick the highest one in discount (nearest to price dropping down)
            # Prefer MITIGATED ones (retests) if available?
            # User instruction: "Keep mitigated arrays at the top"
            mitigated_fvgs = [f for f in ideal_fvgs if f.mitigated]
            if mitigated_fvgs:
                selected_fvg = max(mitigated_fvgs, key=lambda x: x.high)
                entry_type = f"Bullish HTF FVG (Retest) ({selected_fvg.gap_size:.2f} pts)"
            else:
                selected_fvg = max(ideal_fvgs, key=lambda x: x.high)
                entry_type = f"Bullish HTF FVG ({selected_fvg.gap_size:.2f} pts)"
            
            setup_quality = "A"
            print(f"   Found Ideal Bullish FVG: {selected_fvg.low:.2f}-{selected_fvg.high:.2f}")
            
        # 2. If no Ideal Setup, look for "Continuation" Setup (Intraday)
        elif intraday_fvgs:
            print("   No Ideal HTF FVG found (or unreachable). Looking for Intraday Continuation...")
            
            # Filter for Intraday Bullish FVGs below current price
            continuation_fvgs = [
                f for f in intraday_fvgs
                if f.direction == "bullish" and not f.invalidated and f.high < current_price
            ]
            
            if continuation_fvgs:
                # Sort by proximity to current price (highest low)
                nearest_fvg = max(continuation_fvgs, key=lambda x: x.high)
                
                selected_fvg = nearest_fvg
                is_continuation = True
                entry_type = f"Intraday Continuation FVG ({selected_fvg.gap_size:.2f} pts)"
                setup_quality = "B"
                print(f"   Found Continuation Bullish FVG: {selected_fvg.low:.2f}-{selected_fvg.high:.2f}")

        # 3. TRIGGER SWITCH: If still no valid FVG found, check for "Far Away" Arrays
        if not selected_fvg:
            # Find the best "Far Away" array to use as TARGET
            far_fvgs = [
                f for f in fvgs 
                if f.direction == "bullish" and not f.invalidated and f.high < dealing_range['equilibrium']
            ]
            if far_fvgs:
                target_fvg = max(far_fvgs, key=lambda x: x.high)
                print(f"   ⚠️ Best FVG is too far ({target_fvg.high}). Switching to Market Execution.")
                market_execution_mode = True
                # Target is the FVG we wanted to buy at (wait, if we are long, we want to buy LOW).
                # If the buy zone is too far down, we can't "target" it for a long.
                # We can only target it for a SHORT.
                # So for a LONG scenario, if the buy zone is too far, we just wait.
                # Unless... user meant "If the best PD Array is > 0.5 * ADR away... Set that array as Target".
                # This logic applies if we are trading TOWARDS it.
                # If we are looking for a LONG entry, and the support is far away, we can't trade towards it (that would be shorting).
                # So for Longs, this Trigger Switch logic implies we might be looking for a REVERSAL from a far level?
                # No, "Switch to Market Execution logic -> Wait for MSS in direction of that target".
                # This implies the target is ABOVE us for a long.
                # So we look for a Bearish FVG above us to target?
                pass

        # 4. Finalize Entry Parameters
        if selected_fvg:
            entry_high = selected_fvg.high
            entry_low = selected_fvg.low
            stop_loss = selected_fvg.low - 1.0
        elif market_execution_mode:
             # Market Execution Logic
             entry_type = "Market Execution (Wait for MSS)"
             entry_high = current_price
             entry_low = current_price
             stop_loss = current_price - 2.0 # Dynamic
             setup_quality = "C+" # Aggressive
        else:
            # Fallback to Math
            entry_level = dealing_range['discount']
            entry_high = entry_level + 1.0
            entry_low = entry_level - 1.0
            stop_loss = entry_low - 2.5
            print("   No suitable Bullish FVG found, using math level.")

        # Check if price is already below entry (invalidation/reclaim needed)
        condition_note = ""
        if current_price < entry_low and not market_execution_mode:
            condition_note = " (PRICE BELOW ZONE - WAIT FOR RECLAIM)"
            entry_type += " [RECLAIM]"
        
        # Targets: Equilibrium, Premium, Range High
        # FIX: Ensure targets are ABOVE entry for Longs
        potential_targets = [
            dealing_range['equilibrium'],
            dealing_range['premium'],
            dealing_range['high']
        ]
        # Filter targets > entry
        valid_targets = [t for t in potential_targets if t > entry_high]
        
        # If no valid targets from standard range, look for HTF liquidity/levels
        if not valid_targets:
             # Try to find overhead liquidity or resistance
             # For now, just use a fixed R:R target as fallback or mark invalid
             valid_targets = [entry_high + (entry_high - stop_loss) * 2.0]
             print("   ⚠️ Standard targets below entry. Using projected 2R target.")

        targets = sorted(valid_targets)
        
        # Ensure we have at least 3 targets (duplicate last if needed)
        while len(targets) < 3:
            targets.append(targets[-1] + 1.0) # Project higher

        # Invalidation below dealing range low
        invalidation = dealing_range['low'] - 1.0

        # Risk/Reward & Room to Run Check
        risk = entry_high - stop_loss
        reward = targets[0] - entry_high
        
        # If R:R is too low (< 1.0), INVALIDATE
        rr = reward / risk if risk > 0 else 0
        
        if risk > 0 and rr < 1.0:
            print(f"   ⚠️ R:R is too low ({rr:.2f}). Invalidating setup.")
            setup_quality = "INVALID"
        elif risk > 0 and rr < 2.0:
             # Try targeting higher
             if len(targets) > 1:
                 reward = targets[1] - entry_high
                 rr = reward / risk
                 if rr < 1.5:
                     setup_quality = "C-"
        
        # SAFETY CHECK: If Continuation, ensure Room to Run to next resistance
        if is_continuation and risk > 0 and setup_quality != "INVALID":
             if (targets[0] - entry_high) / risk < 1.5: 
                 print("   ⚠️ Continuation setup has poor R:R to first target. Downgrading.")
                 setup_quality = "C-"
        
        rr = reward / risk if risk > 0 else 0

        # Confluence factors
        confluence = []
        if htf_bias == BiasType.BULLISH:
            confluence.append("HTF bias bullish")
        if current_price < dealing_range['equilibrium']:
            confluence.append("Price in discount")
        if selected_fvg:
            confluence.append(f"Aligned with {entry_type}")
        confluence.append("NY killzone 8:30-11:00 AM")

        return {
            "entry_conditions": [
                "Sweep of Sell-Side Liquidity (SSL)",
                "Bullish displacement confirmed",
                f"Entry at {entry_type}{condition_note}"
            ],
            "entry_zone": {"high": round(entry_high, 2), "low": round(entry_low, 2)},
            "entry_type": entry_type,
            "stop_loss": round(stop_loss, 2),
            "targets": [round(t, 2) for t in targets],
            "invalidation": round(invalidation, 2),
            "risk_reward": round(rr, 2),
            "confluence_factors": confluence,
            "valid_time_window": "08:30-11:00 NY",
            "setup_quality": setup_quality
        }

    def _build_short_scenario(
        self,
        current_price: float,
        htf_bias: BiasType,
        dealing_range: Dict[str, Any],
        liquidity_data: Dict[str, Any],
        day_type: str,
        fvgs: List[Any],
        intraday_fvgs: List[Any] = None
    ) -> Dict[str, Any]:
        """Build A+ short setup scenario using FVG entry."""
        # Initialize variables
        entry_high = 0.0
        entry_low = 0.0
        entry_type = "Premium Level (Math)"
        stop_loss = 0.0
        setup_quality = "C" # Default
        
        # Calculate ADR (Placeholder or passed)
        adr = 5.0 
        
        # 1. Try to find "Ideal" Setup (Deep Premium of HTF Range)
        # Filter for bearish, UN-INVALIDATED FVGs that are above Equilibrium
        # AND are statistically reachable
        ideal_fvgs = [
            f for f in fvgs 
            if f.direction == "bearish" and not f.invalidated and f.low > dealing_range['equilibrium']
            and self._is_statistically_reachable(f.low, current_price, adr)
        ]
        
        selected_fvg = None
        is_continuation = False
        market_execution_mode = False
        
        if ideal_fvgs:
            # Pick the lowest one in premium (nearest to price rallying up)
            # Prefer MITIGATED ones
            mitigated_fvgs = [f for f in ideal_fvgs if f.mitigated]
            if mitigated_fvgs:
                selected_fvg = min(mitigated_fvgs, key=lambda x: x.low)
                entry_type = f"Bearish HTF FVG (Retest) ({selected_fvg.gap_size:.2f} pts)"
            else:
                selected_fvg = min(ideal_fvgs, key=lambda x: x.low)
                entry_type = f"Bearish HTF FVG ({selected_fvg.gap_size:.2f} pts)"
            
            setup_quality = "A"
            print(f"   Found Ideal Bearish FVG: {selected_fvg.low:.2f}-{selected_fvg.high:.2f}")
            
        # 2. If no Ideal Setup, look for "Continuation" Setup (Intraday)
        elif intraday_fvgs:
            print("   No Ideal HTF FVG found (or unreachable). Looking for Intraday Continuation...")
            
            # Filter for Intraday Bearish FVGs above current price
            continuation_fvgs = [
                f for f in intraday_fvgs
                if f.direction == "bearish" and not f.invalidated and f.low > current_price
            ]
            
            if continuation_fvgs:
                # Sort by proximity to current price (lowest high)
                nearest_fvg = min(continuation_fvgs, key=lambda x: x.low)
                
                selected_fvg = nearest_fvg
                is_continuation = True
                entry_type = f"Intraday Continuation FVG ({selected_fvg.gap_size:.2f} pts)"
                setup_quality = "B"
                print(f"   Found Continuation Bearish FVG: {selected_fvg.low:.2f}-{selected_fvg.high:.2f}")

        # 3. TRIGGER SWITCH: If still no valid FVG found, check for "Far Away" Arrays
        if not selected_fvg:
            # Find the best "Far Away" array to use as TARGET
            far_fvgs = [
                f for f in fvgs 
                if f.direction == "bearish" and not f.invalidated and f.low > dealing_range['equilibrium']
            ]
            if far_fvgs:
                target_fvg = min(far_fvgs, key=lambda x: x.low)
                print(f"   ⚠️ Best FVG is too far ({target_fvg.low}). Switching to Market Execution.")
                market_execution_mode = True
                # Here, we assume we are looking for a SHORT.
                # If the resistance is too far above, we can't short from it.
                # But we can short targeting the NEXT support?
                # Or wait for MSS.
                pass

        # 4. Finalize Entry Parameters
        if selected_fvg:
            entry_high = selected_fvg.high
            entry_low = selected_fvg.low
            stop_loss = selected_fvg.high + 1.0
        elif market_execution_mode:
             # Market Execution Logic
             entry_type = "Market Execution (Wait for MSS)"
             entry_high = current_price
             entry_low = current_price
             stop_loss = current_price + 2.0 # Dynamic
             setup_quality = "C+" # Aggressive
        else:
            # Fallback to Math
            entry_level = dealing_range['premium']
            entry_high = entry_level + 1.0
            entry_low = entry_level - 1.0
            stop_loss = entry_high + 2.5
            print("   No suitable Bearish FVG found, using math level.")

        # Check if price is already above entry
        condition_note = ""
        if current_price > entry_high and not market_execution_mode:
            condition_note = " (PRICE ABOVE ZONE - WAIT FOR RECLAIM)"
            entry_type += " [RECLAIM]"

        # Targets: Equilibrium, Discount, Range Low
        # FIX: Ensure targets are BELOW entry for Shorts
        potential_targets = [
            dealing_range['equilibrium'],
            dealing_range['discount'],
            dealing_range['low']
        ]
        # Filter targets < entry
        valid_targets = [t for t in potential_targets if t < entry_low]
        
        # If no valid targets, project
        if not valid_targets:
             valid_targets = [entry_low - (stop_loss - entry_low) * 2.0]
             print("   ⚠️ Standard targets above entry. Using projected 2R target.")
             
        targets = sorted(valid_targets, reverse=True)
        
        while len(targets) < 3:
            targets.append(targets[-1] - 1.0)

        # Invalidation above dealing range high
        invalidation = dealing_range['high'] + 1.0

        # Risk/Reward & Room to Run Check
        risk = stop_loss - entry_low
        reward = entry_low - targets[0]
        
        # If R:R is too low (< 1.0), INVALIDATE
        rr = reward / risk if risk > 0 else 0
        
        if risk > 0 and rr < 1.0:
            print(f"   ⚠️ R:R is too low ({rr:.2f}). Invalidating setup.")
            setup_quality = "INVALID"
        elif risk > 0 and rr < 2.0:
            # Try targeting Discount instead
            if len(targets) > 1:
                reward = entry_low - targets[1]
                rr = reward / risk
                if rr < 1.5:
                    setup_quality = "C-"
            
        # SAFETY CHECK: If Continuation, ensure Room to Run
        if is_continuation and risk > 0 and setup_quality != "INVALID":
             if (entry_low - targets[0]) / risk < 1.5:
                 print("   ⚠️ Continuation setup has poor R:R to first target. Downgrading.")
                 setup_quality = "C-"
            
        rr = reward / risk if risk > 0 else 0

        # Confluence factors
        confluence = []
        if htf_bias == BiasType.BEARISH:
            confluence.append("HTF bias bearish")
        if current_price > dealing_range['equilibrium']:
            confluence.append("Price in premium")
        if selected_fvg:
            confluence.append(f"Aligned with {entry_type}")
        confluence.append("NY killzone 8:30-11:00 AM")

        return {
            "entry_conditions": [
                "Sweep of Buy-Side Liquidity (BSL)",
                "Bearish displacement confirmed",
                f"Entry at {entry_type}{condition_note}"
            ],
            "entry_zone": {"high": round(entry_high, 2), "low": round(entry_low, 2)},
            "entry_type": entry_type,
            "stop_loss": round(stop_loss, 2),
            "targets": [round(t, 2) for t in targets],
            "invalidation": round(invalidation, 2),
            "risk_reward": round(rr, 2),
            "confluence_factors": confluence,
            "valid_time_window": "08:30-11:00 NY",
            "setup_quality": setup_quality
        }

    def _calculate_confidence(
        self,
        htf_bias: BiasType,
        day_type: str,
        htf_data: Dict[str, Any],
        session_data: Dict[str, Any]
    ) -> float:
        """Calculate confidence score (0-1)."""
        confidence = 0.5

        # HTF bias clarity
        if htf_bias != BiasType.NEUTRAL:
            confidence += 0.2

        # Day type impact
        if day_type == "trend":
            confidence += 0.15
        elif day_type == "consolidation":
            confidence -= 0.15

        # Order block quality
        if len(htf_data['order_blocks']) > 2:
            confidence += 0.1

        # Session activity
        if len(session_data.get('sweeps', [])) > 0:
            confidence += 0.05

        return min(max(confidence, 0.0), 1.0)
