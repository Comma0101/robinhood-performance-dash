"""
ICT Coach Service - LangChain-powered AI trading coach.

Provides context-aware coaching across different trading phases:
- Pre-Market: Discuss analysis and game plan
- Kill Zone: Real-time guidance during active trading
- Post-Market: Review performance and extract lessons

Uses LangChain with:
- Conversation memory (Redis-backed)
- Structured output generation
- Access to trade history and performance data
"""
from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any, List, Tuple
import json
import re
import pytz
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.output_parsers import PydanticOutputParser
from langchain.memory import ConversationBufferMemory

from app.models.trading import PreMarketReport, Trade, DailyMetrics, BiasType
from app.schemas.trading import TradePlan
from app.core.config import settings
from app.services.ict.analyzer import ICTAnalyzer
from app.utils.data_fetcher import fetch_ohlcv, fetch_news_sentiment


CONTEXT_CACHE_TTL_SECONDS = 60


@dataclass
class ContextSection:
    name: str
    text: str
    metadata: Dict[str, Any]
    source: str
    generated_at: datetime = field(default_factory=datetime.utcnow)
class ICTCoachService:
    """
    AI Coach service powered by LangChain.

    Manages coaching conversations with phase-aware context
    and access to trading data.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

        if not settings.GEMINI_API_KEY:
            raise ValueError(
                "GEMINI_API_KEY is not set. Add it to backend/.env to enable the AI coach."
            )

        self.llm = ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL,
            temperature=0.3,
            google_api_key=settings.GEMINI_API_KEY,
            convert_system_message_to_human=True
        )

        # TODO: Use Redis-backed memory in production
        self.memory_store: Dict[str, ConversationBufferMemory] = {}
        self.context_cache: Dict[str, ContextSection] = {}

    @staticmethod
    def get_current_phase() -> str:
        """Determine current market phase based on NY time."""
        import pytz
        ny_tz = pytz.timezone('America/New_York')
        now = datetime.now(ny_tz)
        
        # Define market hours
        market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
        
        if now < market_open:
            return "pre_market"
        elif market_open <= now <= market_close:
            return "kill_zone"
        else:
            return "post_market"

    def _get_memory(self, session_id: str, history: Optional[List[Dict[str, Any]]] = None) -> ConversationBufferMemory:
        """Get or create conversation memory for session."""
        if session_id not in self.memory_store:
            memory = ConversationBufferMemory(
                return_messages=True,
                memory_key="chat_history"
            )
            
            # Load existing history if provided
            if history:
                for msg in history:
                    role = msg.get("role")
                    content = msg.get("content")
                    if role == "user":
                        memory.chat_memory.add_user_message(content)
                    elif role == "assistant":
                        memory.chat_memory.add_ai_message(content)
            
            self.memory_store[session_id] = memory
            
        return self.memory_store[session_id]

    async def _get_pre_market_report(self, date_obj: date) -> Optional[PreMarketReport]:
        """Fetch pre-market report for a given date."""
        try:
            stmt = select(PreMarketReport).where(PreMarketReport.date == date_obj)
            result = await self.db.execute(stmt)
            return result.scalars().first()
        except Exception as e:
            print(f"Error fetching report: {e}")
            return None

    def _cache_key(self, session_id: str, identifier: str) -> str:
        return f"{session_id}:{identifier}"

    def _get_cached_section(self, session_id: str, identifier: str) -> Optional[ContextSection]:
        key = self._cache_key(session_id, identifier)
        entry = self.context_cache.get(key)
        if not entry:
            return None
        if datetime.utcnow() - entry.generated_at > timedelta(seconds=CONTEXT_CACHE_TTL_SECONDS):
            self.context_cache.pop(key, None)
            return None
        return entry

    def _store_section(self, session_id: str, identifier: str, section: ContextSection) -> None:
        key = self._cache_key(session_id, identifier)
        self.context_cache[key] = section

    async def _get_or_build_section(
        self,
        session_id: str,
        identifier: str,
        builder
    ) -> Optional[ContextSection]:
        cached = self._get_cached_section(session_id, identifier)
        if cached:
            return cached
        section = await builder()
        if section:
            self._store_section(session_id, identifier, section)
        return section

    async def _build_news_section(self, symbol: str) -> Optional[ContextSection]:
        """Fetch latest news sentiment for the symbol."""
        try:
            news_items = await fetch_news_sentiment(tickers=symbol, limit=3)
            if not news_items:
                return None
                
            lines = ["**📰 NEWS SENTIMENT:**"]
            for item in news_items:
                sentiment_score = item.get("overall_sentiment_score", 0)
                sentiment_label = item.get("overall_sentiment_label", "Neutral")
                title = item.get("title", "No Title")
                lines.append(f"- [{sentiment_label}] {title} (Score: {sentiment_score})")
                
            return ContextSection(
                name="news_sentiment",
                text="\n".join(lines),
                metadata={"count": len(news_items)},
                source="tool.fetch_news_sentiment"
            )
        except Exception as e:
            print(f"Failed to build news section: {e}")
            return None

    async def chat(
        self,
        session_id: str,
        user_message: str,
        phase: str,
        related_date: Optional[date] = None,
        related_trade_id: Optional[int] = None,
        history: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Send a message to the coach and get response.

        Args:
            session_id: Unique session identifier
            user_message: User's message
            phase: "pre_market", "kill_zone", or "post_market"
            related_date: Date for context (pre-market report, trades)
            related_trade_id: Specific trade being discussed

        Returns:
            Response dict with: {response, timestamp, insights}
        """
        print(f"\n{'='*60}")
        print(f"🤖 COACH SESSION: {session_id}")
        print(f"📅 Date: {related_date}")
        print(f"🎯 Phase: {phase}")
        print(f"💬 User: {user_message[:100]}...")
        print(f"{'='*60}\n")

        # Get conversation memory
        memory = self._get_memory(session_id, history)

        # Auto-generate missing data if user mentions a symbol
        await self._auto_generate_data(user_message, related_date)

        summary_requested = self._user_requested_summary(user_message)

        # [NEW] Summary Agent Routing
        # If in Post-Market and user asks for summary, use the specialized LLM agent
        print(f"DEBUG: Phase={phase}, SummaryRequested={summary_requested}")
        if phase == "post_market" and summary_requested:
            print("🚀 Routing to LLM Summary Agent...")
            
            # Fetch Report
            report = await self._get_pre_market_report(related_date or date.today())
            print(f"DEBUG: Report found? {report is not None}")
            
            # Fetch Data
            symbol = report.symbol if report else "QQQ"
            df = await fetch_ohlcv(symbol, timeframe="1m", limit=390) # Full day
            
            if report:
                summary_response = await self._generate_llm_summary(
                    session_id=session_id,
                    user_message=user_message,
                    report=report,
                    df=df,
                    history=history or []
                )
                
                # Update memory manually since we bypassed the chain
                memory.chat_memory.add_user_message(user_message)
                memory.chat_memory.add_ai_message(summary_response)
                
                return {
                    "response": summary_response,
                    "timestamp": datetime.utcnow().isoformat(),
                    "insights": []
                }
            else:
                print("DEBUG: No report found, cannot generate summary.")

        # Gather context sections + metadata
        context_text, context_sections = await self._gather_context(
            session_id=session_id,
            phase=phase,
            related_date=related_date,
            related_trade_id=related_trade_id,
            user_message=user_message,
            summary_requested=summary_requested
        )
        context_meta = [self._serialize_section(section) for section in context_sections]

        print(f"\n📊 CONTEXT PROVIDED TO {settings.GEMINI_MODEL}:")
        print(f"{'-'*60}")
        print(context_text if context_text else "❌ NO CONTEXT")
        print(f"{'-'*60}\n")

        system_prompt = self._get_system_prompt(phase)
        combined_system_prompt = self._build_system_message(
            base_prompt=system_prompt,
            context_text=context_text,
            summary_requested=summary_requested,
            context_meta=context_meta
        )

        prompt = ChatPromptTemplate.from_messages([
            ("system", "{system_message}"),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}")
        ])

        chain = prompt | self.llm

        response = await chain.ainvoke({
            "input": user_message,
            "chat_history": memory.chat_memory.messages,
            "system_message": combined_system_prompt
        })

        tool_request = self._parse_tool_request(response.content)
        if tool_request:
            tool_section = await self._execute_tool_request(
                session_id=session_id,
                tool_request=tool_request,
                phase=phase,
                related_date=related_date,
                related_trade_id=related_trade_id
            )
            if tool_section:
                context_sections.append(tool_section)
                context_meta.append(self._serialize_section(tool_section))
                context_text = self._compose_context_text(context_sections)
                combined_system_prompt = self._build_system_message(
                    base_prompt=system_prompt,
                    context_text=context_text,
                    summary_requested=summary_requested,
                    context_meta=context_meta
                )
                response = await chain.ainvoke({
                    "input": user_message,
                    "chat_history": memory.chat_memory.messages,
                    "system_message": combined_system_prompt
                })
            else:
                response = AIMessage(
                    content="I attempted to call an analysis tool but it was unavailable. "
                    "I'll continue with the existing context."
                )

        # Update memory
        memory.chat_memory.add_user_message(user_message)
        memory.chat_memory.add_ai_message(response.content)

        return {
            "response": response.content,
            "timestamp": datetime.utcnow().isoformat(),
            "phase": phase,
            "context_meta": context_meta
        }

    def _get_system_prompt(self, phase: str) -> str:
        """Get phase-specific system prompt."""
        base_prompt = """You are an elite ICT (Inner Circle Trader) Trading Coach.
Your goal is to help the user execute A+ setups based on the provided Pre-Market Report and Market Context.

CORE RESPONSIBILITIES:
1. Analyze the provided Pre-Market Report and Current Market Data.
2. Compare the "Current Price" with the "Trade Plan" levels (Entry, Stop, Targets).
3. CRITICAL: If the current price has ALREADY breached an entry zone or stop loss, you MUST warn the user.
   - If price is below a Long Entry Zone: "Price has broken below the buy zone. Wait for a reclaim of the level + MSS before entering."
   - If price is above a Short Entry Zone: "Price has broken above the sell zone. Wait for a reclaim of the level + MSS before entering."
4. Do NOT blindly repeat the trade plan if it is invalidated by current price action.
5. Answer user questions using ICT concepts (Order Blocks, FVGs, Liquidity Sweeps, Displacement).

TONE & STYLE:
- Professional, concise, and direct.
- No fluff. Focus on price action and levels.
- Use ICT terminology correctly.
- If the user asks about a specific price, reference the nearest PD Array (Premium/Discount array) from the report.
"""
        if phase == "pre_market":
            return base_prompt + """
PHASE: PRE-MARKET / OPENING
- Focus on the "Morning Report" plan.
- Identify key liquidity levels (Asian High/Low, London High/Low).
- Discuss the "Day Type" (Trend vs Reversal) and what that means for the session.
- If the user asks "what to do", guide them to the A+ setup that aligns with the current price action.
"""
        elif phase == "kill_zone":
            return base_prompt + """
PHASE: NY KILLZONE (08:30 - 11:00 EST)
- PRIME DIRECTIVE: Real-time Price Action TRUMPS the Pre-Market Plan.
- Check the "Plan Status" in the context first.
- If Plan Status is INVALIDATED:
  * Do NOT recommend the morning setup.
  * Explicitly state: "The morning plan is invalidated."
  * Analyze the "LIVE INTRADAY ANALYSIS" section for NEW opportunities (FVGs, Sweeps).
- If Plan Status is ACTIVE/WAITING:
  * Guide execution based on the plan.
- Has the setup formed? (Sweep + Displacement + RTO).
- Is price respecting the PD Arrays?
- Manage risk: suggest moving stops to breakeven if price hits TP1.
"""
        elif phase == "post_market":
            return base_prompt + """
PHASE: POST-MARKET
- Review the "Daily Report Card" in the context.
- Discuss the "Final Rating" and the outcome of the setups (WIN/LOSS/NO FILL).
- Analyze WHY the setup worked or failed based on the price action.
- Provide constructive feedback for tomorrow.
- Only provide a report card/summary if the user explicitly asks for it.
"""
        else:
            return base_prompt

    async def generate_trade_plan(
        self,
        symbol: str,
        analysis: Dict[str, Any],
        user_preferences: Optional[Dict[str, Any]] = None
    ) -> TradePlan:
        """
        Generate structured trade plan from analysis.

        Uses LangChain structured output with Pydantic.

        Args:
            symbol: Trading symbol
            analysis: ICT analysis results
            user_preferences: Optional user preferences (risk tolerance, session preference)

        Returns:
            Structured TradePlan object
        """
        # Create parser for structured output
        parser = PydanticOutputParser(pydantic_object=TradePlan)

        # Build prompt
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert ICT trader generating a structured trade plan.

Based on the analysis provided, create a complete trade plan with:
- Clear direction (long/short) based on bias
- Specific entry zone (high/low prices)
- Stop loss placement
- Multiple targets (1-3)
- Confluence factors supporting the setup
- Risk/reward calculation
- Session timing preference

Be specific with price levels and reasoning.
{format_instructions}"""),
            ("human", """Symbol: {symbol}

Analysis:
{analysis}

User Preferences: {preferences}

Generate a detailed trade plan.""")
        ])

        # Create chain with structured output
        chain = prompt | self.llm | parser

        # Generate plan
        plan = await chain.ainvoke({
            "symbol": symbol,
            "analysis": self._format_analysis(analysis),
            "preferences": user_preferences or {},
            "format_instructions": parser.get_format_instructions()
        })

        return plan

    def _extract_symbols(self, text: str) -> List[str]:
        """
        Extract trading symbols from user message.

        Looks for common patterns like:
        - "QQQ today"
        - "what's AAPL"
        - "SPY analysis"
        """
        # Common stock/ETF symbols pattern (2-5 uppercase letters)
        pattern = r'\b([A-Z]{2,5})\b'
        matches = re.findall(pattern, text)

        # Filter out common words that match the pattern
        excluded = {'AM', 'PM', 'US', 'OK', 'TRADE', 'LONG', 'SHORT', 'NEW', 'OPEN'}
        symbols = [s for s in matches if s not in excluded]

        print(f"🔍 Symbol extraction from: '{text}'")
        print(f"   Found matches: {matches}")
        print(f"   After filtering: {symbols}")

        return symbols

    async def _auto_generate_data(
        self,
        user_message: str,
        related_date: Optional[date]
    ) -> None:
        """
        Automatically generate missing data when user asks about a symbol.

        If user mentions a symbol (e.g., "what's QQQ today") and there's no
        pre-market report for that date, automatically:
        1. Run ICT analysis on the symbol
        2. Create a pre-market report
        3. Make it available for the coach
        """
        if not related_date:
            related_date = date.today()

        print(f"\n🔄 AUTO-GENERATION CHECK:")
        print(f"   Date: {related_date}")
        print(f"   Message: {user_message[:100]}")

        # Extract symbols from message
        symbols = self._extract_symbols(user_message)

        if not symbols:
            print(f"   ❌ No symbols found - skipping auto-generation\n")
            return

        print(f"   ✅ Symbols to check: {symbols}\n")

        # For each symbol, check if we have a report
        for symbol in symbols:
            # Check if report exists
            query = select(PreMarketReport).where(
                PreMarketReport.date == related_date,
                PreMarketReport.symbol == symbol
            )
            result = await self.db.execute(query)
            existing_report = result.scalar_one_or_none()

            if existing_report:
                # Report already exists, skip
                continue

            # No report found - generate one
            try:
                print(f"🤖 Coach: Auto-generating analysis for {symbol} on {related_date}...")

                # Run ICT analysis
                analyzer = ICTAnalyzer(self.db)
                analysis = await analyzer.analyze(
                    symbol=symbol,
                    timeframes=["1D"],
                    analysis_type="full"
                )

                # Create pre-market report from analysis
                report = PreMarketReport(
                    date=related_date,
                    symbol=symbol,
                    htf_bias=analysis.htf_bias,
                    htf_dealing_range_high=analysis.dealing_range.get('high') if analysis.dealing_range else None,
                    htf_dealing_range_low=analysis.dealing_range.get('low') if analysis.dealing_range else None,
                    htf_key_levels={
                        "order_blocks": [ob.model_dump() for ob in analysis.order_blocks[:3]],
                        "fvgs": [fvg.model_dump() for fvg in analysis.fvgs[:3]],
                        "liquidity": [lz.model_dump() for lz in analysis.liquidity_zones[:3]]
                    },
                    asian_session_high=analysis.asian_session_high,
                    asian_session_low=analysis.asian_session_low,
                    london_session_high=analysis.london_session_high,
                    london_session_low=analysis.london_session_low,
                    ltf_structure=analysis.market_structure,
                    ltf_entry_zones=[],
                    target_sessions=["LONDON_OPEN", "NY_OPEN"],
                    narrative=analysis.narrative,
                    trade_plan={
                        "direction": "long" if analysis.htf_bias == BiasType.BULLISH else "short",
                        "entry_zones": [],
                        "targets": []
                    },
                    confidence=analysis.confidence
                )

                self.db.add(report)
                await self.db.commit()
                await self.db.refresh(report)

                print(f"✅ Coach: Created pre-market report for {symbol} (ID: {report.id})")

            except Exception as e:
                print(f"⚠️ Coach: Failed to generate report for {symbol}: {e}")
                await self.db.rollback()

    async def _gather_context(
        self,
        session_id: str,
        phase: str,
        related_date: Optional[date],
        related_trade_id: Optional[int],
        user_message: Optional[str],
        summary_requested: bool
    ) -> Tuple[str, List[ContextSection]]:
        """
        Gather relevant context for the coaching session via dedicated providers.
        """
        sections: List[ContextSection] = []
        mentioned_symbols = self._extract_symbols(user_message or "")

        if related_date and phase in ["pre_market", "kill_zone", "post_market"]:
            identifier = f"premarket:{phase}:{related_date}:{','.join(sorted(mentioned_symbols)) or 'any'}"

            async def build_premarket():
                return await self._build_premarket_section(
                    phase=phase,
                    related_date=related_date,
                    mentioned_symbols=mentioned_symbols
                )

            premarket_section = await self._get_or_build_section(
                session_id=session_id,
                identifier=identifier,
                builder=build_premarket
            )
            if premarket_section:
                sections.append(premarket_section)

        if related_date and phase in ["kill_zone", "post_market"]:
            identifier = f"trades:{related_date}"

            async def build_trades():
                return await self._build_trades_section(related_date)

            trades_section = await self._get_or_build_section(
                session_id=session_id,
                identifier=identifier,
                builder=build_trades
            )
            if trades_section:
                sections.append(trades_section)

        if related_date and phase == "post_market":
            identifier = f"metrics:{related_date}"

            async def build_metrics():
                return await self._build_metrics_section(related_date)

            metrics_section = await self._get_or_build_section(
                session_id=session_id,
                identifier=identifier,
                builder=build_metrics
            )
            if metrics_section:
                sections.append(metrics_section)

        if related_trade_id:
            identifier = f"trade:{related_trade_id}"

            async def build_trade_focus():
                return await self._build_trade_focus_section(related_trade_id)

            trade_focus = await self._get_or_build_section(
                session_id=session_id,
                identifier=identifier,
                builder=build_trade_focus
            )
            if trade_focus:
                sections.append(trade_focus)



        if summary_requested:
            sections.append(ContextSection(
                name="user_preferences",
                text="User explicitly asked for a recap/report card. Tools may be required.",
                metadata={"summaryRequested": True},
                source="conversation"
            ))

        context_text = self._compose_context_text(sections)
        return context_text, sections

    async def _build_premarket_section(
        self,
        phase: str,
        related_date: date,
        mentioned_symbols: List[str]
    ) -> Optional[ContextSection]:
        report: Optional[PreMarketReport] = None
        used_symbol: Optional[str] = None

        if mentioned_symbols:
            for symbol in mentioned_symbols:
                report = await self._get_premarket_report_by_symbol(related_date, symbol)
                if report:
                    used_symbol = symbol
                    break

        if not report:
            report = await self._get_premarket_report(related_date)
            used_symbol = report.symbol if report else None

        if not report or not used_symbol:
            return None

        current_price = None
        price_timestamp = None
        try:
            df = await fetch_ohlcv(used_symbol, timeframe="1m", limit=1)
            if not df.empty:
                current_price = float(df.iloc[-1]["close"])
                price_timestamp = df.iloc[-1].get("timestamp")
        except Exception as e:
            print(f"⚠️ Failed to fetch current price for {used_symbol}: {e}")

        parts: List[str] = []
        if current_price is not None:
            ts_label = price_timestamp.isoformat() if hasattr(price_timestamp, "isoformat") else price_timestamp or "latest"
            parts.append(f"**Current Market Data for {used_symbol}:**")
            parts.append(f"- Price ({ts_label}): ${current_price:.2f}")

        parts.extend(self._format_report_context(report, used_symbol, related_date))

        if phase == "kill_zone" and current_price is not None:
            parts.append("\n**⚠️ PLAN STATUS:**")
            # Validate Long
            long_status, long_msg = self._validate_plan_status(report.long_scenario, current_price, "long")
            parts.append(f"- Long: {long_status} ({long_msg})")
            # Validate Short
            short_status, short_msg = self._validate_plan_status(report.short_scenario, current_price, "short")
            parts.append(f"- Short: {short_status} ({short_msg})")

        metadata = {
            "symbol": used_symbol,
            "relatedDate": str(related_date),
            "price": {
                "value": current_price,
                "timestamp": price_timestamp.isoformat() if hasattr(price_timestamp, "isoformat") else price_timestamp
            },
            "reportId": getattr(report, "id", None),
            "phase": phase
        }

        return ContextSection(
            name="pre_market_report",
            text="\n".join(parts),
            metadata=metadata,
            source="supabase.pre_market_reports"
        )

    async def _build_trades_section(self, trade_date: date) -> Optional[ContextSection]:
        trades = await self._get_trades_for_date(trade_date)
        if not trades:
            return None

        lines = [f"**Today's Trades ({len(trades)}):**"]
        trade_meta = []

        for trade in trades:
            pnl_str = f"${trade.pnl:.2f}" if trade.pnl is not None else "Open"
            lines.append(f"- {trade.symbol} {trade.direction} @ {trade.entry_price} → {pnl_str}")
            trade_meta.append({
                "id": trade.id,
                "symbol": trade.symbol,
                "direction": trade.direction,
                "status": trade.status.value,
                "pnl": trade.pnl
            })

        metadata = {
            "date": str(trade_date),
            "count": len(trades),
            "trades": trade_meta
        }

        return ContextSection(
            name="trades_digest",
            text="\n".join(lines),
            metadata=metadata,
            source="supabase.trades"
        )

    async def _build_trade_focus_section(self, trade_id: int) -> Optional[ContextSection]:
        trade = await self._get_trade(trade_id)
        if not trade:
            return None

        lines = [
            f"**Trade #{trade.id} Details:**",
            f"- Symbol: {trade.symbol}",
            f"- Direction: {trade.direction}",
            f"- Entry: {trade.entry_price}",
            f"- Stop: {trade.stop_loss}",
            f"- Targets: {trade.target_1}, {trade.target_2}, {trade.target_3}",
            f"- Status: {trade.status.value}"
        ]

        if trade.pnl is not None:
            lines.append(f"- P&L: ${trade.pnl:.2f} ({trade.pnl_percent:.1f}%)")
        if trade.mae is not None:
            lines.append(f"- MAE: ${trade.mae:.2f}")
        if trade.mfe is not None:
            lines.append(f"- MFE: ${trade.mfe:.2f}")

        metadata = {
            "tradeId": trade.id,
            "symbol": trade.symbol,
            "status": trade.status.value
        }

        return ContextSection(
            name="trade_focus",
            text="\n".join(lines),
            metadata=metadata,
            source="supabase.trades"
        )

    async def _build_metrics_section(self, metrics_date: date) -> Optional[ContextSection]:
        metrics = await self._get_daily_metrics(metrics_date)
        if not metrics:
            return None

        lines = [
            "**Daily Performance:**",
            f"- Trades: {metrics.total_trades} (W: {metrics.winning_trades}, L: {metrics.losing_trades})",
            f"- Win Rate: {metrics.win_rate:.0%}",
            f"- Net P&L: ${metrics.net_pnl:.2f}",
            f"- Profit Factor: {metrics.profit_factor:.2f}"
        ]

        metadata = {
            "date": str(metrics_date),
            "totalTrades": metrics.total_trades,
            "winRate": metrics.win_rate,
            "netPnL": metrics.net_pnl,
            "profitFactor": metrics.profit_factor
        }

        return ContextSection(
            name="daily_metrics",
            text="\n".join(lines),
            metadata=metadata,
            source="supabase.daily_metrics"
        )

    async def _build_intraday_section(self, symbol: str) -> Optional[ContextSection]:
        print(f"🛠️ Tool: fetch_intraday for {symbol}")
        df = await fetch_ohlcv(symbol, timeframe="1m", limit=120)
        if df is None or df.empty:
            return None

        analyzer = ICTAnalyzer(self.db)
        ict_analysis = await analyzer.analyze(symbol=symbol, timeframes=["1H"])
        
        # Fetch today's Pre-Market Report for Plan Validation
        today = datetime.utcnow().date()
        report = await self._get_premarket_report_by_symbol(today, symbol)
        
        plan_status_lines = []
        current_price = float(df['close'].iloc[-1])
        
        if report:
            # Validate Long Plan
            long_status, long_msg = self._validate_plan_status(report.long_scenario, current_price, "long")
            plan_status_lines.append(f"- Long Plan: {long_status} ({long_msg})")
            
            # Validate Short Plan
            short_status, short_msg = self._validate_plan_status(report.short_scenario, current_price, "short")
            plan_status_lines.append(f"- Short Plan: {short_status} ({short_msg})")
        else:
            plan_status_lines.append("- Pre-Market Plan: Not Found (Generating fresh analysis)")

        report_data = {
            'asian_session_high': ict_analysis.asian_session_high,
            'asian_session_low': ict_analysis.asian_session_low,
            'london_session_high': ict_analysis.london_session_high,
            'london_session_low': ict_analysis.london_session_low,
            'long_scenario': None,
            'short_scenario': None
        }
        observations = await self._analyze_intraday_action(
            symbol=symbol,
            report_data=report_data
        )

        last_ts = df.iloc[-1].get("timestamp")
        lines = [
            f"**🔴 LIVE INTRADAY ANALYSIS ({symbol}):**",
            f"- Last Bar: {last_ts.isoformat() if hasattr(last_ts, 'isoformat') else last_ts}",
            f"- Current Price: {current_price:.2f}",
            f"- Bias: {ict_analysis.htf_bias.value}",
            f"- Order Blocks: {len(ict_analysis.order_blocks)} | FVGs: {len(ict_analysis.fvgs)}",
            "**📋 PLAN STATUS:**",
            *plan_status_lines
        ]
        lines.extend(observations or ["No notable sweeps/FVG interactions in the last hour."])

        metadata = {
            "symbol": symbol,
            "barsAnalyzed": len(df),
            "lastBarTimestamp": last_ts.isoformat() if hasattr(last_ts, "isoformat") else last_ts,
            "bias": ict_analysis.htf_bias.value,
            "orderBlocks": [ob.direction for ob in ict_analysis.order_blocks[:3]],
            "fvgs": [
                {
                    "gap": fvg.gap_size,
                    "filled": fvg.filled
                } for fvg in ict_analysis.fvgs[:3]
            ]
        }

        return ContextSection(
            name="intraday_analysis",
            text="\n".join(lines),
            metadata=metadata,
            source="tool.fetch_intraday"
        )

    def _validate_plan_status(self, plan: Optional[Dict], current_price: float, direction: str) -> Tuple[str, str]:
        """
        Validate if a pre-market plan is still valid based on current price.
        Returns: (Status, Message)
        Status: WAITING, ACTIVE, INVALIDATED, MISSED, N/A
        """
        if not plan:
            return "N/A", "No plan"
            
        entry_zone = plan.get('entry_zone', {})
        entry_high = entry_zone.get('high')
        entry_low = entry_zone.get('low')
        stop_loss = plan.get('stop_loss')
        invalidation = plan.get('invalidation')
        targets = plan.get('targets', [])
        
        if not (entry_high and entry_low and stop_loss):
            return "N/A", "Incomplete plan data"
            
        # 1. Check Invalidation (Hard Breach)
        if direction == "long":
            if current_price <= invalidation:
                return "INVALIDATED", f"Price hit invalidation {invalidation}"
            if current_price <= stop_loss:
                return "INVALIDATED", f"Price hit stop loss {stop_loss}"
        else: # short
            if current_price >= invalidation:
                return "INVALIDATED", f"Price hit invalidation {invalidation}"
            if current_price >= stop_loss:
                return "INVALIDATED", f"Price hit stop loss {stop_loss}"
                
        # 2. Check Entry Zone (Active vs Waiting)
        if direction == "long":
            if entry_low <= current_price <= entry_high:
                return "ACTIVE", "Price is IN the entry zone!"
            elif current_price > entry_high:
                return "WAITING", f"Price above zone ({entry_high}), waiting for pullback"
            else:
                # Below zone but above stop?
                return "ACTIVE", "Price slightly below zone but holding stop"
        else: # short
            if entry_low <= current_price <= entry_high:
                return "ACTIVE", "Price is IN the entry zone!"
            elif current_price < entry_low:
                return "WAITING", f"Price below zone ({entry_low}), waiting for pullback"
            else:
                return "ACTIVE", "Price slightly above zone but holding stop"

    async def _build_grading_section(
        self,
        symbol: str,
        related_date: Optional[date]
    ) -> Optional[ContextSection]:
        if not related_date:
            return None

        report = await self._get_premarket_report_by_symbol(related_date, symbol)
        if not report:
            report = await self._get_premarket_report(related_date)
            if report and report.symbol != symbol:
                print(f"⚠️ Grading fallback: using report for {report.symbol} instead of requested {symbol}")

        if not report:
            return None

        print(f"🛠️ Tool: grade_session for {symbol} on {related_date}")
        grading_df = await fetch_ohlcv(symbol, timeframe="1m", limit=500)
        if grading_df.empty:
            return None

        grading_report = self._grade_session_performance(report, grading_df)
        if not grading_report:
            return None
        metadata = {
            "symbol": symbol,
            "relatedDate": str(related_date),
            "barsAnalyzed": len(grading_df),
            "includesReport": bool(report)
        }

        return ContextSection(
            name="daily_report_card",
            text="\n".join(["**📝 DAILY REPORT CARD:**", grading_report]),
            metadata=metadata,
            source="tool.grade_session"
        )

    def _compose_context_text(self, sections: List[ContextSection]) -> str:
        if not sections:
            return "No context available."
        return "\n\n".join([section.text for section in sections if section.text])

    def _build_system_message(
        self,
        base_prompt: str,
        context_text: str,
        summary_requested: bool,
        context_meta: List[Dict[str, Any]]
    ) -> str:
        diagnostics = []
        for meta in context_meta:
            diagnostics.append(
                f"- {meta['name']} (source: {meta['source']}, generated: {meta['generatedAt']})"
            )
        diagnostics_text = "\n".join(diagnostics) if diagnostics else "No diagnostics available."
        tool_instruction = self._get_tool_instruction_block(summary_requested)

        return (
            f"{base_prompt}\n\n"
            f"Context Snapshot:\n{context_text or 'No context available.'}\n\n"
            f"Context Diagnostics:\n{diagnostics_text}\n\n"
            f"{tool_instruction}"
        )

    def _get_tool_instruction_block(self, summary_requested: bool) -> str:
        summary_hint = "User requested a summary/report card." if summary_requested else "Only call grade_session when the user explicitly asks for a summary."
        return (
            "TOOL USAGE RULES:\n"
            "- If you need detailed live price action beyond what is provided, respond EXACTLY with "
            "`CALL_TOOL|{\"name\":\"fetch_intraday\",\"symbol\":\"<SYMBOL>\"}`.\n"
            "- If the user asks for a post-market summary/report card, respond EXACTLY with "
            "`CALL_TOOL|{\"name\":\"grade_session\",\"symbol\":\"<SYMBOL>\"}`.\n"
            f"- {summary_hint}\n"
            "- If you have sufficient information, answer directly without calling a tool."
        )

    def _parse_tool_request(self, content: Optional[str]) -> Optional[Dict[str, Any]]:
        if not content:
            return None
        marker = "CALL_TOOL|"
        stripped = content.strip()
        if not stripped.startswith(marker):
            return None
        payload = stripped[len(marker):]
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            print(f"⚠️ Unable to parse tool payload: {payload}")
            return None

    async def _execute_tool_request(
        self,
        session_id: str,
        tool_request: Dict[str, Any],
        phase: str,
        related_date: Optional[date],
        related_trade_id: Optional[int]
    ) -> Optional[ContextSection]:
        name = tool_request.get("name")
        if name == "fetch_intraday":
            symbol = tool_request.get("symbol")
            if not symbol:
                return None

            async def build_intraday():
                return await self._build_intraday_section(symbol)

            return await self._get_or_build_section(
                session_id=session_id,
                identifier=f"intraday:{symbol}",
                builder=build_intraday
            )

        if name == "grade_session":
            symbol = tool_request.get("symbol")
            if not symbol:
                return None

            async def build_grading():
                return await self._build_grading_section(symbol, related_date)

            return await self._get_or_build_section(
                session_id=session_id,
                identifier=f"grade:{symbol}:{related_date}",
                builder=build_grading
            )

        print(f"⚠️ Unknown tool requested: {name}")
        return None

    def _serialize_section(self, section: ContextSection) -> Dict[str, Any]:
        return {
            "name": section.name,
            "source": section.source,
            "generatedAt": section.generated_at.isoformat(),
            "metadata": section.metadata
        }

    def _user_requested_summary(self, user_message: Optional[str]) -> bool:
        if not user_message:
            return False
        normalized = user_message.lower()
        keywords = [
            "summary",
            "recap",
            "report card",
            "reportcard",
            "grade",
            "grading",
            "final rating",
            "rating",
            "score",
            "how did we do",
            "how did i do",
            "overall view",
            "daily review",
            "review the day",
            "wrap up",
            "wrap-up"
        ]
        return any(keyword in normalized for keyword in keywords)

    def _format_report_context(self, report: PreMarketReport, symbol: str, related_date: date) -> List[str]:
        """Render a rich, compact context block from PreMarketReport."""
        parts: List[str] = []
        parts.append(f"**Pre-Market Analysis for {symbol} ({related_date}):**")
        parts.append(f"- HTF Bias: {report.htf_bias.value}")
        # Dealing range source + levels
        dr_low = report.htf_dealing_range_low
        dr_high = report.htf_dealing_range_high
        source = getattr(report, 'dealing_range_source', None)
        if dr_low is not None and dr_high is not None:
            label = {
                'prev_day': 'Previous Day H/L',
                'htf': 'HTF Dealing Range',
                'recent_1D': 'Recent 1D Range'
            }.get(source, 'Dealing Range')
            parts.append(f"- {label}: {dr_low:.2f} - {dr_high:.2f}")
        if getattr(report, 'discount_zone', None) is not None and getattr(report, 'premium_zone', None) is not None:
            parts.append(f"- EQ/Disc/Prem: {getattr(report,'equilibrium',None):.2f} / {report.discount_zone:.2f} / {report.premium_zone:.2f}")
        # Day type
        if getattr(report, 'day_type', None):
            parts.append(f"- Day Type: {report.day_type} ({getattr(report,'day_type_reasoning','')})")
        # Sessions snapshot
        asian_hi = getattr(report, 'asian_session_high', None)
        asian_lo = getattr(report, 'asian_session_low', None)
        london_hi = getattr(report, 'london_session_high', None)
        london_lo = getattr(report, 'london_session_low', None)
        if asian_hi and asian_lo:
            parts.append(f"- Asian: {asian_lo:.2f}-{asian_hi:.2f}")
        if london_hi and london_lo:
            parts.append(f"- London: {london_lo:.2f}-{london_hi:.2f}")
        lm_high = getattr(report, 'london_made_high', None)
        lm_low = getattr(report, 'london_made_low', None)
        if lm_high:
            parts.append("- London holds current high of day")
        if lm_low:
            parts.append("- London holds current low of day")
        # Sweeps
        sweeps = getattr(report, 'session_liquidity_sweeps', None) or []
        if sweeps:
            kinds = ", ".join(sorted({s.get('type','') for s in sweeps if isinstance(s, dict)}))
            parts.append(f"- Sweeps: {kinds}")
        # Scenarios
        long_scn = getattr(report, 'long_scenario', None)
        short_scn = getattr(report, 'short_scenario', None)
        if long_scn:
            parts.append(
                f"- Long A+: {long_scn['entry_zone']['low']:.2f}-{long_scn['entry_zone']['high']:.2f}, SL {long_scn['stop_loss']:.2f}, RR {long_scn['risk_reward']:.1f}, TW {long_scn.get('valid_time_window','')}"
            )
        if short_scn:
            parts.append(
                f"- Short A+: {short_scn['entry_zone']['low']:.2f}-{short_scn['entry_zone']['high']:.2f}, SL {short_scn['stop_loss']:.2f}, RR {short_scn['risk_reward']:.1f}, TW {short_scn.get('valid_time_window','')}"
            )
        # Narrative + confidence at end
        parts.append(f"- Narrative: {report.narrative}")
        parts.append(f"- Confidence: {report.confidence:.0%}")
        return parts

    def _format_analysis(self, analysis: Dict[str, Any]) -> str:
        """Format analysis dict into readable text."""
        parts = []

        if "htf_bias" in analysis:
            parts.append(f"HTF Bias: {analysis['htf_bias']}")

        if "dealing_range" in analysis and analysis["dealing_range"]:
            dr = analysis["dealing_range"]
            parts.append(f"Dealing Range: {dr['low']} - {dr['high']}")

        if "order_blocks" in analysis:
            parts.append(f"Order Blocks: {len(analysis['order_blocks'])} identified")

        if "narrative" in analysis:
            parts.append(f"Narrative: {analysis['narrative']}")

        return "\n".join(parts)

    # Database query helpers
    async def _get_premarket_report(self, report_date: date) -> Optional[PreMarketReport]:
        """Get pre-market report for date (any symbol)."""
        query = select(PreMarketReport).where(PreMarketReport.date == report_date)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_premarket_report_by_symbol(self, report_date: date, symbol: str) -> Optional[PreMarketReport]:
        """Get pre-market report for specific symbol and date."""
        query = select(PreMarketReport).where(
            PreMarketReport.date == report_date,
            PreMarketReport.symbol == symbol
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_trades_for_date(self, trade_date: date) -> List[Trade]:
        """Get all trades for date."""
        query = select(Trade).where(Trade.date == trade_date)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _get_trade(self, trade_id: int) -> Optional[Trade]:
        """Get specific trade."""
        query = select(Trade).where(Trade.id == trade_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _analyze_intraday_action(
        self,
        symbol: str,
        report_data: Dict[str, Any]
    ) -> List[str]:
        """
        Analyze live intraday price action for kill_zone phase.
        
        Detects:
        - Liquidity sweeps (did we take session highs/lows?)
        - Displacement (strong directional moves)
        - Fair Value Gaps (FVGs)
        - Order Blocks forming
        - Setup validation against current price
        
        Returns list of observations for context.
        """
        try:
            # Fetch last 60 candles (1 hour of 1m data)
            df = await fetch_ohlcv(symbol, timeframe="1m", limit=60)
            
            if df.empty or len(df) < 10:
                return []
            
            observations = []
            current_price = df.iloc[-1]['close']
            
            # Get session levels from report data
            asian_high = report_data.get('asian_session_high')
            asian_low = report_data.get('asian_session_low')
            london_high = report_data.get('london_session_high')
            london_low = report_data.get('london_session_low')
            
            # 1. DETECT LIQUIDITY SWEEPS (last 30 candles)
            recent_df = df.tail(30)
            recent_high = recent_df['high'].max()
            recent_low = recent_df['low'].min()
            
            sweep_detected = []
            if asian_high and recent_high > asian_high and current_price < asian_high:
                sweep_detected.append(f"✅ Asian High swept at ${asian_high:.2f}, price reversed to ${current_price:.2f}")
            if asian_low and recent_low < asian_low and current_price > asian_low:
                sweep_detected.append(f"✅ Asian Low swept at ${asian_low:.2f}, price reversed to ${current_price:.2f}")
            if london_high and recent_high > london_high and current_price < london_high:
                sweep_detected.append(f"✅ London High swept at ${london_high:.2f}, price reversed to ${current_price:.2f}")
            if london_low and recent_low < london_low and current_price > london_low:
                sweep_detected.append(f"✅ London Low swept at ${london_low:.2f}, price reversed to ${current_price:.2f}")
            
            if sweep_detected:
                observations.extend(sweep_detected)
            
            # 2. DETECT DISPLACEMENT (last 10 candles)
            last_10 = df.tail(10)
            candle_ranges = (last_10['high'] - last_10['low']).abs()
            avg_range = candle_ranges.mean()
            
            # Find candles with displacement (2x+ average range)
            displacement_candles = last_10[candle_ranges > (avg_range * 2)]
            if not displacement_candles.empty:
                last_displacement = displacement_candles.iloc[-1]
                direction = "bullish" if last_displacement['close'] > last_displacement['open'] else "bearish"
                displacement_size = last_displacement['high'] - last_displacement['low']
                observations.append(
                    f"🚀 {direction.upper()} displacement detected: ${displacement_size:.2f} move "
                    f"({displacement_size/avg_range:.1f}x average range)"
                )
            
            # 3. DETECT FAIR VALUE GAPS (FVGs)
            fvg_found = []
            for i in range(len(df) - 3, max(len(df) - 20, 0), -1):
                if i < 2:
                    break
                
                # Bullish FVG: candle[i-1].high < candle[i+1].low
                if df.iloc[i-1]['high'] < df.iloc[i+1]['low']:
                    fvg_low = df.iloc[i-1]['high']
                    fvg_high = df.iloc[i+1]['low']
                    # Check if current price is in the FVG
                    if fvg_low <= current_price <= fvg_high:
                        fvg_found.append(f"📊 Price in BULLISH FVG: ${fvg_low:.2f} - ${fvg_high:.2f}")
                        break
                
                # Bearish FVG: candle[i-1].low > candle[i+1].high
                if df.iloc[i-1]['low'] > df.iloc[i+1]['high']:
                    fvg_high = df.iloc[i-1]['low']
                    fvg_low = df.iloc[i+1]['high']
                    # Check if current price is in the FVG
                    if fvg_low <= current_price <= fvg_high:
                        fvg_found.append(f"📊 Price in BEARISH FVG: ${fvg_low:.2f} - ${fvg_high:.2f}")
                        break
            
            if fvg_found:
                observations.extend(fvg_found)
            
            # 4. VALIDATE A+ SETUPS AGAINST CURRENT PRICE
            long_scenario = report_data.get('long_scenario')
            short_scenario = report_data.get('short_scenario')
            
            if long_scenario:
                entry_low = long_scenario.get('entry_zone', {}).get('low')
                entry_high = long_scenario.get('entry_zone', {}).get('high')
                stop_loss = long_scenario.get('stop_loss')
                
                if entry_low and entry_high and stop_loss:
                    if current_price < stop_loss:
                        observations.append(
                            f"⚠️ LONG SETUP INVALIDATED: Price ${current_price:.2f} below stop ${stop_loss:.2f}"
                        )
                    elif entry_low <= current_price <= entry_high:
                        observations.append(
                            f"🎯 Price IN LONG ENTRY ZONE: ${entry_low:.2f} - ${entry_high:.2f}"
                        )
                    elif current_price < entry_low:
                        distance = entry_low - current_price
                        observations.append(
                            f"⬆️ Price ${distance:.2f} BELOW long entry zone (${entry_low:.2f} - ${entry_high:.2f})"
                        )
            
            if short_scenario:
                entry_low = short_scenario.get('entry_zone', {}).get('low')
                entry_high = short_scenario.get('entry_zone', {}).get('high')
                stop_loss = short_scenario.get('stop_loss')
                
                if entry_low and entry_high and stop_loss:
                    if current_price > stop_loss:
                        observations.append(
                            f"⚠️ SHORT SETUP INVALIDATED: Price ${current_price:.2f} above stop ${stop_loss:.2f}"
                        )
                    elif entry_low <= current_price <= entry_high:
                        observations.append(
                            f"🎯 Price IN SHORT ENTRY ZONE: ${entry_low:.2f} - ${entry_high:.2f}"
                        )
                    elif current_price > entry_high:
                        distance = current_price - entry_high
                        observations.append(
                            f"⬇️ Price ${distance:.2f} ABOVE short entry zone (${entry_low:.2f} - ${entry_high:.2f})"
                        )
            
            # 5. TIME WINDOW CHECK
            from datetime import datetime
            now = datetime.utcnow()
            current_time_est = now.hour - 5  # Rough EST conversion (adjust for DST if needed)
            
            if long_scenario or short_scenario:
                # NY Kill Zone: 08:30 - 11:00 EST (13:30 - 16:00 UTC)
                if 13 <= now.hour < 16:
                    minutes_remaining = (16 - now.hour) * 60 - now.minute
                    observations.append(f"⏰ NY Kill Zone: {minutes_remaining} minutes remaining")
                elif now.hour >= 16:
                    observations.append("⏰ NY Kill Zone has CLOSED")
                else:
                    observations.append("⏰ Waiting for NY Kill Zone (08:30 EST / 13:30 UTC)")
            
            # 6. VOLUME ANALYSIS (if volume data available)
            if 'volume' in df.columns:
                avg_volume = df['volume'].tail(30).mean()
                recent_volume = df['volume'].tail(5).mean()
                
                if recent_volume > avg_volume * 1.5:
                    observations.append(
                        f"📈 Volume spike: {recent_volume/avg_volume:.1f}x average (bullish confirmation)"
                    )
                elif recent_volume < avg_volume * 0.5:
                    observations.append(
                        f"📉 Low volume: {recent_volume/avg_volume:.1f}x average (weak move)"
                    )
            
            return observations
            
        except Exception as e:
            print(f"⚠️ Intraday analysis failed for {symbol}: {e}")
            return []

    async def _get_daily_metrics(self, metrics_date: date) -> Optional[DailyMetrics]:
        """Get daily metrics."""
        query = select(DailyMetrics).where(DailyMetrics.date == metrics_date)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()



    def _format_market_data_for_llm(self, df: Any) -> str:
        """
        Format 1m OHLCV data for LLM consumption.
        Format: Time,Open,High,Low,Close
        """
        if df.empty:
            return "No market data available."
            
        lines = ["Time,Open,High,Low,Close"]
        
        # Filter for RTH (09:30 - 16:00) to save tokens
        # Assuming df is already sorted
        
        for index, row in df.iterrows():
            current_time = row.get('timestamp', index)
            
            # Convert to NY time
            if hasattr(current_time, 'tzinfo') and current_time.tzinfo is None:
                ny_tz = pytz.timezone('America/New_York')
                current_time = ny_tz.localize(current_time)
            
            if hasattr(current_time, 'astimezone'):
                current_time = current_time.astimezone(pytz.timezone('America/New_York'))
                
            # Filter RTH
            if current_time.hour < 9 or (current_time.hour == 9 and current_time.minute < 30):
                continue
            if current_time.hour >= 16:
                continue
                
            time_str = current_time.strftime("%H:%M")
            line = f"{time_str},{row['open']:.2f},{row['high']:.2f},{row['low']:.2f},{row['close']:.2f}"
            lines.append(line)
            
        return "\n".join(lines)

    async def _generate_llm_summary(
        self,
        session_id: str,
        user_message: str,
        report: PreMarketReport,
        df: Any,
        history: List[Dict[str, Any]]
    ) -> str:
        """
        Generate a comprehensive Daily Report Card using the LLM.
        Analyses Plan vs. Reality vs. Psychology.
        """
        # 1. Format Data
        market_data_csv = self._format_market_data_for_llm(df)
        
        # 2. Format Chat History
        chat_transcript = "\n".join([f"{msg['role'].upper()}: {msg['content']}" for msg in history])
        
        # 3. Construct Prompt
        system_prompt = f"""You are an elite ICT Trading Mentor. Your job is to grade the user's trading session and the accuracy of the Pre-Market Plan.

**INPUTS:**
1. **PRE-MARKET PLAN:**
   - Bias: {report.htf_bias}
   - Long Level: {report.long_scenario}
   - Short Level: {report.short_scenario}
   - Narrative: {report.narrative}

2. **MARKET DATA (1-Minute Candles, NY Time):**
   {market_data_csv}

3. **SESSION CHAT TRANSCRIPT:**
   {chat_transcript}

**YOUR TASK:**
Analyze the day step-by-step.
1. **Plan Accuracy:** Did the market respect the levels? Did the bias hold?
2. **Execution Review:** Look at the chat. Did the user take the trades? Did they hesitate? Were they disciplined?
3. **Grading:**
   - **Technical Grade (0-10):** How well did the levels work?
   - **Performance Grade (0-10):** How well did the user execute (based on chat)?

**OUTPUT FORMAT:**
Return a Markdown report.
- **Header:** 📝 DAILY REPORT CARD
- **Grades:** Technical & Performance
- **Plan vs. Reality:** A table comparing planned levels to actual reactions.
- **Psychology Check:** Comments on the user's mindset from the chat.
- **Coach's Verdict:** Final summary.

**CRITICAL INSTRUCTIONS:**
- **DO NOT CALL ANY TOOLS.** You have all the necessary market data in the "MARKET DATA" section above.
- **DO NOT** output `CALL_TOOL` or JSON. Output **ONLY** the Markdown report.
- Analyze the provided CSV data yourself to determine if levels were hit.
- Be specific. Quote times and prices from the data.
- If the user didn't trade, grade their patience/discipline.
- If the data shows the levels were hit, say so clearly.
"""

        # 4. Call LLM
        # Ensure we are using a model that won't try to force tool calls if we prompt it not to.
        # We use the existing self.llm but with a strict prompt.
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Generate the Daily Report Card based on the data provided."}
        ]
        
        response = await self.llm.ainvoke(messages)
        summary_content = response.content

        # Save to Database
        if report:
            try:
                report.post_market_summary = summary_content
                await self.db.commit()
                await self.db.refresh(report)
                print(f"✅ Saved Daily Summary to Report #{report.id}")
            except Exception as e:
                print(f"⚠️ Failed to save summary to DB: {e}")

        return summary_content

    def _grade_session_performance(self, report: PreMarketReport, df: Any) -> str:
        # Legacy method kept for fallback or specific metric calculation if needed.
        # The LLM method _generate_llm_summary is now preferred for the full report.
        return "Grading handled by LLM Summary Agent."
