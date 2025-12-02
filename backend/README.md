# ICT Trading Agent Backend

Python FastAPI backend for the ICT trading agent system. Provides:

- **ICT Technical Analysis**: Multi-timeframe analysis with order blocks, FVGs, liquidity zones
- **Pre-Market Reports**: Automated daily analysis at 6 AM
- **Entry Setup Detection**: Real-time setup identification during kill zones
- **Trade Management**: Full trade lifecycle tracking
- **AI Coach**: LangChain-powered coaching across all trading phases
- **Performance Analytics**: Comprehensive metrics and insights

## Architecture

- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL via Supabase (shared with Next.js frontend)
- **ORM**: SQLAlchemy 2.0 (async)
- **AI**: LangChain + Google Gemini 3 Pro Preview (coach)
- **Cache**: Redis
- **Scheduler**: APScheduler (background jobs)
- **Data**: Alpha Vantage HTTP API

## Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI application
│   ├── core/
│   │   ├── config.py          # Settings & configuration
│   │   └── database.py        # Database connection
│   ├── models/
│   │   └── trading.py         # SQLAlchemy models
│   ├── schemas/
│   │   └── trading.py         # Pydantic schemas
│   ├── api/
│   │   └── endpoints/         # API route handlers
│   │       ├── analysis.py    # ICT analysis endpoints
│   │       ├── reports.py     # Pre-market reports
│   │       ├── setups.py      # Entry setups
│   │       ├── trades.py      # Trade management
│   │       ├── coach.py       # AI coach
│   │       └── alerts.py      # Alert system
│   ├── services/
│   │   ├── ict/              # ICT analysis core
│   │   │   ├── analyzer.py   # Main analyzer
│   │   │   ├── order_blocks.py
│   │   │   ├── fvg.py
│   │   │   ├── liquidity.py
│   │   │   └── structure.py
│   │   └── langchain/        # LangChain services
│   │       └── coach.py      # AI coach service
│   └── utils/
│       └── data_fetcher.py   # Alpha Vantage HTTP client
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Setup

### 1. Prerequisites

- Python 3.11+
- PostgreSQL (Supabase)
- Redis (optional, for caching)
- Google Gemini API key (AI Studio)
- OpenAI API key (legacy flows / compatibility)
- Alpha Vantage API key (optional)

### 2. Install Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL`: Supabase PostgreSQL connection string
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Supabase anon key
- `OPENAI_API_KEY`: OpenAI API key for LangChain
- `GEMINI_API_KEY`: Google AI Studio key for Gemini 3 Pro Preview (default `gemini-3-pro-preview`)
- `SECRET_KEY`: Generate with `openssl rand -hex 32`

### 4. Initialize Database

```bash
# Create tables
python -c "from app.core.database import init_db; import asyncio; asyncio.run(init_db())"
```

### 5. Run Development Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API will be available at:
- **API**: http://localhost:8000
- **Docs**: http://localhost:8000/docs (Swagger UI)
- **ReDoc**: http://localhost:8000/redoc

## Docker Setup

### Development with Docker Compose

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### Production Docker Build

```bash
# Build image
docker build -t ict-backend .

# Run container
docker run -d \
  --name ict-backend \
  -p 8000:8000 \
  --env-file .env \
  ict-backend
```

## API Endpoints

### ICT Analysis
- `POST /api/v1/analysis/run` - Run full ICT analysis
- `GET /api/v1/analysis/bias/{symbol}` - Get current bias
- `GET /api/v1/analysis/levels/{symbol}` - Get key levels

### Pre-Market Reports
- `POST /api/v1/reports/` - Create report
- `GET /api/v1/reports/` - List reports
- `GET /api/v1/reports/{id}` - Get report
- `GET /api/v1/reports/date/{date}` - Get report by date

### Entry Setups
- `POST /api/v1/setups/` - Create setup
- `GET /api/v1/setups/` - List setups
- `PATCH /api/v1/setups/{id}/execute` - Mark executed

### Trades
- `POST /api/v1/trades/` - Create trade
- `GET /api/v1/trades/` - List trades
- `GET /api/v1/trades/{id}` - Get trade
- `PATCH /api/v1/trades/{id}` - Update trade

### AI Coach
- `POST /api/v1/coach/sessions` - Create session
- `POST /api/v1/coach/sessions/{id}/chat` - Send message
- `GET /api/v1/coach/sessions` - List sessions

### Alerts
- `POST /api/v1/alerts/` - Create alert
- `GET /api/v1/alerts/` - List alerts
- `PATCH /api/v1/alerts/{id}/read` - Mark read

## Usage Examples

### Run ICT Analysis

```python
import httpx

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8000/api/v1/analysis/run",
        json={
            "symbol": "NQ",
            "timeframes": ["1D", "4H", "1H", "15m"],
            "analysis_type": "full"
        }
    )
    analysis = response.json()
    print(f"Bias: {analysis['htf_bias']}")
    print(f"Narrative: {analysis['narrative']}")
```

### Chat with AI Coach

```python
# Create session
session_response = await client.post(
    "http://localhost:8000/api/v1/coach/sessions",
    json={
        "phase": "pre_market",
        "related_date": "2024-01-15"
    }
)
session = session_response.json()

# Send message
chat_response = await client.post(
    f"http://localhost:8000/api/v1/coach/sessions/{session['session_id']}/chat",
    json={
        "role": "user",
        "content": "What do you think about my analysis? Should I look for longs today?",
        "timestamp": "2024-01-15T06:30:00Z"
    }
)
coach_response = chat_response.json()
print(coach_response["response"])
```

## Integration with Frontend

The backend shares the Supabase database with the Next.js frontend:

**Frontend → Backend:**
- Frontend can call backend API endpoints for analysis
- Trade notes saved in frontend are accessible to backend

**Backend → Frontend:**
- Backend generates pre-market reports, frontend displays them
- Entry setups detected by backend appear in frontend alerts
- Coach conversations sync via database

## Background Jobs

The backend runs scheduled background jobs:

- **Pre-Market Analyzer**: Runs at 6 AM daily, generates analysis reports
- **Kill Zone Monitor**: Checks for entry setups every 60 seconds during kill zones
- **Performance Calculator**: Updates daily metrics after market close

Configure in `.env`:
```
ENABLE_SCHEDULER=True
PRE_MARKET_CRON=0 6 * * 1-5
KILL_ZONE_CHECK_INTERVAL=60
```

## Development

### Run Tests

```bash
pytest
```

### Code Formatting

```bash
black app/
isort app/
```

### Type Checking

```bash
mypy app/
```

## Deployment

See [BACKEND_MIGRATION_PLAN.md](../BACKEND_MIGRATION_PLAN.md) for detailed deployment guide.

Quick options:
- **Railway**: Connect GitHub repo, auto-deploy
- **Render**: Dockerfile deployment with PostgreSQL/Redis
- **Google Cloud Run**: Serverless container deployment
- **DigitalOcean App Platform**: Easy PaaS deployment

## Documentation

- [Backend Migration Plan](../BACKEND_MIGRATION_PLAN.md)
- [ICT Agent Architecture](../ICT_AGENT_ARCHITECTURE.md)
- [LangChain Integration](../LANGCHAIN_INTEGRATION.md)
- [Data Trimming Strategy](../MTF_DATA_TRIMMING.md)

## License

MIT
