# LangChain Integration for ICT Agent System

## 🎯 Why LangChain?

LangChain provides sophisticated patterns for building AI agents that go beyond simple API calls:

### **Key Benefits:**

1. **Structured Output Parsing** - Parse trade plans into TypedDict/Pydantic models
2. **Memory Management** - Maintain conversation context across trading sessions
3. **Tool/Function Calling** - Better integration with ICT analysis functions
4. **Multi-Agent Systems** - Separate agents for different timeframes/strategies
5. **Prompt Templates** - Consistent, reusable prompts for different phases
6. **Chain-of-Thought** - Break complex analysis into steps
7. **Retrieval** - Query historical trades, patterns, notes

---

## 🏗️ Architecture with LangChain

```
┌─────────────────────────────────────────────────────────┐
│                  ICT Agent System                        │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────────────────────────────┐           │
│  │         FastAPI Backend                  │           │
│  └───────────────┬──────────────────────────┘           │
│                  │                                        │
│         ┌────────┴────────┐                              │
│         │                 │                              │
│  ┌──────▼──────┐   ┌──────▼──────┐                     │
│  │ LangChain   │   │ ICT Core    │                     │
│  │ Agents      │   │ Services    │                     │
│  └──────┬──────┘   └──────┬──────┘                     │
│         │                 │                              │
│         │    ┌────────────┴──────┐                      │
│         │    │                   │                      │
│  ┌──────▼────▼──┐         ┌──────▼──────┐             │
│  │  OpenAI API  │         │ PostgreSQL  │             │
│  └──────────────┘         └─────────────┘             │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Dependencies

```txt
# Add to requirements.txt

# LangChain Core
langchain==0.1.0
langchain-openai==0.0.2
langchain-community==0.0.10

# Vector Store (for historical analysis)
chromadb==0.4.22
sentence-transformers==2.3.1

# Additional utilities
tiktoken==0.5.2  # Token counting
```

---

## 🧠 LangChain Components

### 1. **Structured Output Parser** - Trade Plan Generation

**Problem:** Raw GPT responses are inconsistent JSON
**Solution:** Use LangChain's structured output parser

```python
# app/services/coach/structured_outputs.py

from langchain.output_parsers import PydanticOutputParser
from langchain.prompts import PromptTemplate
from pydantic import BaseModel, Field
from typing import List, Optional


class TradePlan(BaseModel):
    """Structured trade plan output"""
    timeframe: str = Field(description="Timeframe for analysis (e.g., '5min')")
    horizon: str = Field(description="Time horizon (e.g., 'Intraday swing 2-4 hours')")
    strategy: str = Field(description="Trading strategy description")
    entry: str = Field(description="Entry price or zone")
    stop: str = Field(description="Stop loss price")
    targets: List[str] = Field(description="List of target prices")
    confluence: List[str] = Field(description="List of confluence factors")
    risk: str = Field(description="Risk description")


class TradePlanParser:
    def __init__(self):
        self.parser = PydanticOutputParser(pydantic_object=TradePlan)

    def get_format_instructions(self) -> str:
        """Get formatting instructions for the prompt"""
        return self.parser.get_format_instructions()

    def parse(self, text: str) -> TradePlan:
        """Parse text into TradePlan"""
        return self.parser.parse(text)


# Usage in coach service
parser = TradePlanParser()

prompt = f"""
Based on the ICT analysis, generate a trade plan.

{parser.get_format_instructions()}

Analysis:
{ict_analysis_data}
"""

response = await llm.ainvoke(prompt)
trade_plan = parser.parse(response.content)

# Now trade_plan is a validated Pydantic model
print(trade_plan.entry)  # Type-safe access
```

---

### 2. **Conversation Memory** - Trading Session Context

**Problem:** Coach needs to remember what happened earlier in the day
**Solution:** Use LangChain memory

```python
# app/services/coach/memory.py

from langchain.memory import ConversationBufferWindowMemory
from langchain.schema import HumanMessage, AIMessage, SystemMessage
from typing import List
import redis
import json


class TradingSessionMemory:
    """Memory manager for trading sessions"""

    def __init__(self, redis_client: redis.Redis, user_id: str, date: str):
        self.redis = redis_client
        self.user_id = user_id
        self.date = date
        self.key = f"memory:{user_id}:{date}"

        # LangChain memory (keeps last 20 messages)
        self.memory = ConversationBufferWindowMemory(
            k=20,
            return_messages=True,
            memory_key="chat_history"
        )

        # Load from Redis if exists
        self._load_from_redis()

    def _load_from_redis(self):
        """Load memory from Redis"""
        data = self.redis.get(self.key)
        if data:
            messages = json.loads(data)
            for msg in messages:
                if msg["type"] == "human":
                    self.memory.chat_memory.add_user_message(msg["content"])
                elif msg["type"] == "ai":
                    self.memory.chat_memory.add_ai_message(msg["content"])

    def _save_to_redis(self):
        """Save memory to Redis"""
        messages = []
        for msg in self.memory.chat_memory.messages:
            if isinstance(msg, HumanMessage):
                messages.append({"type": "human", "content": msg.content})
            elif isinstance(msg, AIMessage):
                messages.append({"type": "ai", "content": msg.content})

        self.redis.setex(
            self.key,
            86400,  # 24 hours
            json.dumps(messages)
        )

    def add_user_message(self, message: str):
        """Add user message"""
        self.memory.chat_memory.add_user_message(message)
        self._save_to_redis()

    def add_ai_message(self, message: str):
        """Add AI message"""
        self.memory.chat_memory.add_ai_message(message)
        self._save_to_redis()

    def get_context(self) -> List[dict]:
        """Get conversation context"""
        return [
            {"role": "user" if isinstance(m, HumanMessage) else "assistant", "content": m.content}
            for m in self.memory.chat_memory.messages
        ]

    def clear(self):
        """Clear memory"""
        self.memory.clear()
        self.redis.delete(self.key)


# Usage
memory = TradingSessionMemory(redis_client, user_id="user123", date="2025-01-15")
memory.add_user_message("What's the bias for NQ today?")
memory.add_ai_message("Daily bias is bullish with 85% confidence...")

# Later in the day
context = memory.get_context()  # Full conversation history
```

---

### 3. **LangChain Tools** - ICT Analysis Functions

**Problem:** Coach needs to call ICT analysis functions dynamically
**Solution:** Use LangChain tools

```python
# app/services/coach/tools.py

from langchain.tools import Tool, StructuredTool
from langchain.agents import AgentType, initialize_agent
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from typing import Optional


class ICTAnalysisInput(BaseModel):
    """Input for ICT analysis tool"""
    symbol: str = Field(description="Trading symbol (e.g., 'NQ', 'ES')")
    interval: str = Field(description="Time interval (e.g., '5min', '15min', 'daily')")
    lookback_bars: Optional[int] = Field(default=72, description="Number of bars to analyze")


async def run_ict_analysis(symbol: str, interval: str, lookback_bars: int = 72) -> str:
    """Run ICT analysis and return summary"""
    from app.services.ict.analyzer import ICTAnalyzer

    analyzer = ICTAnalyzer()
    result = await analyzer.analyze(symbol, interval, lookback_bars)

    # Return formatted summary
    return f"""
    Symbol: {result.meta.symbol}
    Interval: {result.meta.interval}
    Bias: {result.structure.bias}
    Last BOS: {result.structure.lastBosAt}
    Dealing Range PD%: {result.dealingRange.pdPercent}%
    Top Order Blocks: {len(result.orderBlocks)}
    """


class PreMarketReportInput(BaseModel):
    """Input for pre-market report tool"""
    symbol: str = Field(description="Trading symbol")
    date: Optional[str] = Field(default=None, description="Date (YYYY-MM-DD), defaults to today")


async def get_pre_market_report(symbol: str, date: Optional[str] = None) -> str:
    """Get pre-market report"""
    from app.services.analysis.report_generator import get_report

    report = await get_report(symbol, date or "today")

    return f"""
    Pre-Market Report for {symbol}:

    Bias: {report.consensus.direction} ({report.consensus.confidence}% confidence)
    Key Levels: {', '.join([f'{l.type}: {l.price}' for l in report.consensus.keyLevels[:3]])}
    Entry Zones: {len(report.plan.entryZones)} identified
    Session Focus: {report.plan.sessionFocus}

    Scenario: {report.consensus.scenario}
    """


class TradingAgent:
    """LangChain agent with ICT tools"""

    def __init__(self, openai_api_key: str):
        self.llm = ChatOpenAI(
            model="gpt-4-turbo-preview",
            temperature=0,
            api_key=openai_api_key
        )

        # Define tools
        self.tools = [
            StructuredTool.from_function(
                func=run_ict_analysis,
                name="ict_analyze",
                description="Analyze market structure using ICT methodology. Use this to get BOS/ChoCH, order blocks, FVG, dealing range, and liquidity.",
                args_schema=ICTAnalysisInput,
                coroutine=run_ict_analysis
            ),
            StructuredTool.from_function(
                func=get_pre_market_report,
                name="pre_market_report",
                description="Get the pre-market analysis report with bias, key levels, and trading plan.",
                args_schema=PreMarketReportInput,
                coroutine=get_pre_market_report
            ),
        ]

        # Initialize agent
        self.agent = initialize_agent(
            tools=self.tools,
            llm=self.llm,
            agent=AgentType.OPENAI_FUNCTIONS,
            verbose=True,
            max_iterations=3
        )

    async def chat(self, message: str, context: dict = None) -> str:
        """Chat with the agent"""

        # Add context to prompt
        full_prompt = message
        if context:
            full_prompt = f"""
            Context:
            - Current Phase: {context.get('phase')}
            - Time: {context.get('current_time')}

            User Question: {message}
            """

        response = await self.agent.arun(full_prompt)
        return response


# Usage
agent = TradingAgent(openai_api_key="sk-...")

# User asks a question
response = await agent.chat(
    "What's the current bias for NQ on the 5-minute chart?",
    context={"phase": "kill_zone", "current_time": "10:30 AM ET"}
)

# Agent automatically calls ict_analyze tool and responds
print(response)
```

---

### 4. **Multi-Agent System** - Timeframe Specialists

**Problem:** Different timeframes need different analysis approaches
**Solution:** Separate agents for HTF vs LTF

```python
# app/services/coach/multi_agent.py

from langchain.agents import AgentExecutor
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from typing import Dict


class HTFAnalystAgent:
    """Higher timeframe analyst (Daily, 4H, 1H)"""

    def __init__(self, llm: ChatOpenAI):
        self.llm = llm
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a higher timeframe ICT analyst.

            Your focus:
            - Daily/4H/1H market structure
            - Identifying HTF draw (liquidity targets)
            - Premium/Discount zones
            - Weekly/Monthly levels
            - Macro trends

            Always start with: "HTF Analysis:"
            """),
            ("user", "{input}")
        ])

    async def analyze(self, data: dict) -> str:
        chain = self.prompt | self.llm
        response = await chain.ainvoke({"input": str(data)})
        return response.content


class LTFAnalystAgent:
    """Lower timeframe analyst (15m, 5m, 1m)"""

    def __init__(self, llm: ChatOpenAI):
        self.llm = llm
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a lower timeframe ICT analyst.

            Your focus:
            - 15m bias (ONLY TF that flips intraday)
            - 5m entry refinement (OB, FVG)
            - 1m MSS confirmation
            - Precise entry timing
            - Kill zone timing

            Always start with: "LTF Analysis:"
            """),
            ("user", "{input}")
        ])

    async def analyze(self, data: dict) -> str:
        chain = self.prompt | self.llm
        response = await chain.ainvoke({"input": str(data)})
        return response.content


class SupervisorAgent:
    """Supervisor that coordinates HTF and LTF agents"""

    def __init__(self, openai_api_key: str):
        self.llm = ChatOpenAI(
            model="gpt-4-turbo-preview",
            temperature=0,
            api_key=openai_api_key
        )

        self.htf_agent = HTFAnalystAgent(self.llm)
        self.ltf_agent = LTFAnalystAgent(self.llm)

        self.supervisor_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an ICT trading supervisor.

            You coordinate HTF and LTF analysis to produce a coherent trade plan.

            Process:
            1. Review HTF analysis for directional bias
            2. Review LTF analysis for entry execution
            3. Synthesize into actionable trade plan
            4. Ensure HTF and LTF alignment

            Output format:
            - Direction: [Long/Short/Wait]
            - Confidence: [0-100%]
            - Entry: [Price/Zone]
            - Stop: [Price]
            - Targets: [T1, T2, T3]
            - Confluence: [List factors]
            """),
            ("user", """
            HTF Analysis:
            {htf_analysis}

            LTF Analysis:
            {ltf_analysis}

            Synthesize these into a trade plan.
            """)
        ])

    async def generate_trade_plan(self, mtf_data: dict) -> str:
        """Generate trade plan using multi-agent system"""

        # HTF agent analyzes higher timeframes
        htf_analysis = await self.htf_agent.analyze({
            "daily": mtf_data.get("daily"),
            "4h": mtf_data.get("4h"),
            "1h": mtf_data.get("1h")
        })

        # LTF agent analyzes lower timeframes
        ltf_analysis = await self.ltf_agent.analyze({
            "15m": mtf_data.get("15m"),
            "5m": mtf_data.get("5m"),
            "1m": mtf_data.get("1m")
        })

        # Supervisor synthesizes
        chain = self.supervisor_prompt | self.llm
        response = await chain.ainvoke({
            "htf_analysis": htf_analysis,
            "ltf_analysis": ltf_analysis
        })

        return response.content


# Usage
supervisor = SupervisorAgent(openai_api_key="sk-...")

trade_plan = await supervisor.generate_trade_plan({
    "daily": daily_ict_analysis,
    "4h": four_hour_analysis,
    "15m": fifteen_min_analysis,
    "5m": five_min_analysis,
    "1m": one_min_analysis
})

print(trade_plan)
```

---

### 5. **RAG for Historical Trades** - Learn from Past

**Problem:** Coach should learn from your historical trades
**Solution:** Vector store + RAG

```python
# app/services/coach/rag.py

from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import Chroma
from langchain.schema import Document
from typing import List


class TradeHistoryRAG:
    """Retrieval-Augmented Generation for trade history"""

    def __init__(self, openai_api_key: str, persist_directory: str = "./chroma_db"):
        self.embeddings = OpenAIEmbeddings(api_key=openai_api_key)
        self.vectorstore = Chroma(
            persist_directory=persist_directory,
            embedding_function=self.embeddings
        )

    async def index_trade(self, trade: dict):
        """Index a trade for future retrieval"""

        # Create searchable document
        doc_text = f"""
        Date: {trade['date']}
        Symbol: {trade['symbol']}
        Setup: {trade['setup']['model']}
        Session: {trade['setup']['session']}
        Bias: {trade['preMarketBias']}
        Result: {'Win' if trade['execution']['rMultiple'] > 0 else 'Loss'}
        R Multiple: {trade['execution']['rMultiple']}
        Confluence: {', '.join(trade['setup']['confluence'])}
        What Worked: {trade['reflection'].get('whatWorked', 'N/A')}
        What Didn't Work: {trade['reflection'].get('whatDidntWork', 'N/A')}
        Mistakes: {', '.join(trade['reflection'].get('mistakes', []))}
        """

        document = Document(
            page_content=doc_text,
            metadata={
                "trade_id": trade["id"],
                "date": trade["date"],
                "symbol": trade["symbol"],
                "result": "win" if trade['execution']['rMultiple'] > 0 else "loss",
                "r_multiple": trade['execution']['rMultiple']
            }
        )

        self.vectorstore.add_documents([document])

    async def search_similar_trades(self, query: str, k: int = 5) -> List[dict]:
        """Search for similar trades"""
        results = self.vectorstore.similarity_search(query, k=k)
        return [
            {
                "content": doc.page_content,
                "metadata": doc.metadata
            }
            for doc in results
        ]

    async def get_insights_for_setup(self, setup_description: str) -> str:
        """Get insights from similar historical setups"""

        # Search for similar setups
        similar = await self.search_similar_trades(setup_description, k=3)

        if not similar:
            return "No similar historical trades found."

        # Format insights
        insights = ["Historical Analysis:"]
        for i, trade in enumerate(similar, 1):
            insights.append(f"\n{i}. {trade['metadata']['date']} - {trade['metadata']['result'].upper()}")
            insights.append(f"   R: {trade['metadata']['r_multiple']:.2f}")
            insights.append(f"   Context: {trade['content'][:200]}...")

        return "\n".join(insights)


# Usage in coach
rag = TradeHistoryRAG(openai_api_key="sk-...")

# When user asks about a setup
user_query = "I see a 5m FVG with HTF bias aligned. Should I enter?"

# Get historical context
historical_context = await rag.get_insights_for_setup(
    "5m FVG entry with HTF bias alignment"
)

# Include in coach response
coach_response = f"""
Based on current setup and your history:

{historical_context}

Current Setup Analysis:
...
"""
```

---

### 6. **Prompt Templates** - Phase-Based System Prompts

```python
# app/services/coach/prompts.py

from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder


class ICTCoachPrompts:
    """Prompt templates for different trading phases"""

    @staticmethod
    def pre_market_prompt() -> ChatPromptTemplate:
        return ChatPromptTemplate.from_messages([
            ("system", """You are an ICT trading coach. It's pre-market (6-9:30 AM ET).

Your role:
- Explain HTF bias clearly
- Identify key liquidity levels
- Suggest entry zones with confluence
- Set risk management expectations
- Remind about session discipline

Current Analysis:
Daily Bias: {daily_bias}
4H Bias: {four_hour_bias}
Key Levels: {key_levels}
Entry Zones: {entry_zones}

Be professional, concise, and focused on ICT concepts.
"""),
            MessagesPlaceholder(variable_name="chat_history"),
            ("user", "{input}")
        ])

    @staticmethod
    def kill_zone_prompt() -> ChatPromptTemplate:
        return ChatPromptTemplate.from_messages([
            ("system", """You are an ICT trading coach. Kill zone is ACTIVE. Trading mode.

Your role:
- Validate setups QUICKLY
- Check confluence (need 3+)
- Confirm risk management
- Flag deviations from plan
- Use DIRECT language

Setup Checklist:
✅ Liquidity grabbed?
✅ MSS confirmed?
✅ PD array (FVG/OB)?
✅ HTF alignment?
✅ Kill zone active?
✅ Stop placement valid?

Current Session: {session_name}
Active Setup: {active_setup}

BE CONCISE. Use bullets.
"""),
            MessagesPlaceholder(variable_name="chat_history"),
            ("user", "{input}")
        ])

    @staticmethod
    def post_market_prompt() -> ChatPromptTemplate:
        return ChatPromptTemplate.from_messages([
            ("system", """You are an ICT trading coach. Market closed. Reflection time.

Your role:
- Review trade execution
- Identify patterns
- Provide constructive feedback
- Suggest improvements
- Generate learning insights

Today's Performance:
Trades: {trades_count}
Win Rate: {win_rate}%
P/L: {pnl}
Bias Accuracy: {bias_accurate}

Analysis Framework:
1. Was bias correct?
2. Setup quality?
3. Execution discipline?
4. Emotional control?
5. Key lesson?

Be constructive and insightful. Focus on process over outcome.
"""),
            MessagesPlaceholder(variable_name="chat_history"),
            ("user", "{input}")
        ])


# Usage
prompts = ICTCoachPrompts()

# Pre-market chat
pre_market_chain = prompts.pre_market_prompt() | llm

response = await pre_market_chain.ainvoke({
    "daily_bias": "bullish",
    "four_hour_bias": "bullish",
    "key_levels": "19850, 19920",
    "entry_zones": "19785-19792 (5m OB + FVG)",
    "chat_history": [],
    "input": "What's the plan for NQ today?"
})
```

---

## 🚀 Implementation Phases

### Phase 1: Core Setup (Week 1)
```bash
pip install langchain langchain-openai
```

**Implement:**
- [ ] Structured output parser for trade plans
- [ ] Basic conversation memory
- [ ] Initial prompt templates

### Phase 2: Tools & Agents (Week 2-3)
**Implement:**
- [ ] ICT analysis tools
- [ ] Pre-market report tool
- [ ] Agent with tool calling

### Phase 3: Multi-Agent (Week 4)
**Implement:**
- [ ] HTF analyst agent
- [ ] LTF analyst agent
- [ ] Supervisor agent

### Phase 4: RAG (Week 5-6)
**Implement:**
- [ ] Trade history indexing
- [ ] Vector store search
- [ ] Historical insights retrieval

---

## 📊 Example: Complete Coach Service with LangChain

```python
# app/services/coach/coach_service.py

from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor
from app.services.coach.tools import TradingAgent
from app.services.coach.memory import TradingSessionMemory
from app.services.coach.rag import TradeHistoryRAG
from app.services.coach.prompts import ICTCoachPrompts
from app.services.coach.structured_outputs import TradePlanParser


class ICTCoachService:
    """Complete ICT trading coach with LangChain"""

    def __init__(
        self,
        openai_api_key: str,
        redis_client,
        user_id: str,
        date: str
    ):
        self.llm = ChatOpenAI(
            model="gpt-4-turbo-preview",
            temperature=0,
            api_key=openai_api_key
        )

        # Components
        self.agent = TradingAgent(openai_api_key)
        self.memory = TradingSessionMemory(redis_client, user_id, date)
        self.rag = TradeHistoryRAG(openai_api_key)
        self.prompts = ICTCoachPrompts()
        self.trade_plan_parser = TradePlanParser()

    async def chat(
        self,
        message: str,
        phase: str,
        context: dict
    ) -> str:
        """Main chat interface"""

        # Select appropriate prompt template
        if phase == "pre_market":
            prompt_template = self.prompts.pre_market_prompt()
        elif phase == "kill_zone":
            prompt_template = self.prompts.kill_zone_prompt()
        else:
            prompt_template = self.prompts.post_market_prompt()

        # Get conversation history
        chat_history = self.memory.get_context()

        # Get historical insights (RAG)
        historical_insights = await self.rag.get_insights_for_setup(message)

        # Build prompt with all context
        chain = prompt_template | self.llm

        response = await chain.ainvoke({
            **context,
            "chat_history": chat_history,
            "input": f"{message}\n\n{historical_insights}",
        })

        # Save to memory
        self.memory.add_user_message(message)
        self.memory.add_ai_message(response.content)

        return response.content

    async def generate_trade_plan(self, mtf_data: dict) -> dict:
        """Generate structured trade plan"""

        prompt = f"""
        Based on multi-timeframe ICT analysis, generate a trade plan.

        {self.trade_plan_parser.get_format_instructions()}

        Daily: {mtf_data['daily']}
        4H: {mtf_data['4h']}
        15m: {mtf_data['15m']}
        5m: {mtf_data['5m']}
        """

        response = await self.llm.ainvoke(prompt)
        trade_plan = self.trade_plan_parser.parse(response.content)

        return trade_plan.dict()


# FastAPI endpoint
@router.post("/coach/chat")
async def coach_chat(
    message: str,
    phase: str,
    context: dict,
    current_user: User = Depends(get_current_user)
):
    coach = ICTCoachService(
        openai_api_key=settings.OPENAI_API_KEY,
        redis_client=redis_client,
        user_id=current_user.id,
        date=datetime.now().strftime("%Y-%m-%d")
    )

    response = await coach.chat(message, phase, context)

    return {"reply": response}
```

---

## ✅ Benefits Summary

| Feature | Without LangChain | With LangChain |
|---------|-------------------|----------------|
| **Output Parsing** | Manual JSON parsing, error-prone | Pydantic validation, guaranteed structure |
| **Memory** | Manual Redis management | Built-in conversation memory |
| **Tools** | Hard-coded function calls | Dynamic tool selection by agent |
| **Multi-Agent** | Complex orchestration code | Clean agent coordination |
| **RAG** | Custom vector DB integration | Built-in vector store support |
| **Prompts** | String formatting | Reusable templates with variables |

---

## 🎯 Next Steps

1. **Start simple:** Add structured output parsing first
2. **Add memory:** Implement conversation history
3. **Add tools:** Let agent call ICT functions
4. **Scale up:** Multi-agent + RAG as needed

**Ready to integrate?** Let me know which component you want to start with!
