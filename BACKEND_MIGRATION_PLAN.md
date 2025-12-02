# ICT Backend Migration Plan
## Python FastAPI Backend + Next.js Frontend (Gradual Transition)

---

## 🎯 Strategy Overview

**Approach:** Build a separate Python FastAPI backend that runs independently alongside the existing Next.js app. Gradually migrate features from Next.js API routes to FastAPI backend.

```
┌─────────────────────────────────────────────────────────┐
│                    Current State                         │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────────────────────────┐               │
│  │         Next.js (Frontend)           │               │
│  │  • UI Components                     │               │
│  │  • API Routes (chat, notes, ict)     │               │
│  │  • Direct DB access (Supabase)       │               │
│  └─────────────┬────────────────────────┘               │
│                │                                          │
│                ▼                                          │
│  ┌──────────────────────────────────────┐               │
│  │      Supabase PostgreSQL             │               │
│  └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────┐
│                    Target State                          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────────────────────────┐               │
│  │      Next.js Frontend                │               │
│  │  • UI Components                     │               │
│  │  • Thin API Proxy Layer              │               │
│  └─────────────┬────────────────────────┘               │
│                │                                          │
│                ▼                                          │
│  ┌──────────────────────────────────────┐               │
│  │      FastAPI Backend (Python)        │               │
│  │  • ICT Analysis Engine               │               │
│  │  • Pre-Market Reports                │               │
│  │  • Kill Zone Monitor                 │               │
│  │  • Trade Journal + Analytics         │               │
│  │  • AI Coach                          │               │
│  └─────────────┬────────────────────────┘               │
│                │                                          │
│                ▼                                          │
│  ┌──────────────────────────────────────┐               │
│  │      PostgreSQL + Redis              │               │
│  └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Backend Project Structure

```
ict-backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app entry
│   ├── config.py                  # Configuration
│   ├── database.py                # Database connection
│   │
│   ├── models/                    # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── trade.py
│   │   ├── pre_market_report.py
│   │   ├── entry_setup.py
│   │   ├── daily_metrics.py
│   │   └── alert.py
│   │
│   ├── schemas/                   # Pydantic schemas (API contracts)
│   │   ├── __init__.py
│   │   ├── ict_analysis.py
│   │   ├── trade.py
│   │   ├── report.py
│   │   └── alert.py
│   │
│   ├── services/                  # Business logic
│   │   ├── __init__.py
│   │   ├── ict/                   # ICT analysis core
│   │   │   ├── __init__.py
│   │   │   ├── structure.py       # Market structure (BOS/ChoCH)
│   │   │   ├── liquidity.py       # Liquidity detection
│   │   │   ├── order_blocks.py    # Order block detection
│   │   │   ├── fvg.py             # Fair value gaps
│   │   │   └── dealing_range.py   # Premium/Discount calculations
│   │   │
│   │   ├── analysis/              # Pre-market analysis
│   │   │   ├── __init__.py
│   │   │   ├── htf_bias.py        # Higher timeframe bias
│   │   │   ├── liquidity_mapper.py
│   │   │   └── report_generator.py
│   │   │
│   │   ├── monitoring/            # Live session monitoring
│   │   │   ├── __init__.py
│   │   │   ├── session_manager.py
│   │   │   ├── entry_detector.py
│   │   │   └── alert_manager.py
│   │   │
│   │   ├── journal/               # Trade journaling
│   │   │   ├── __init__.py
│   │   │   ├── trade_logger.py
│   │   │   ├── metrics_calculator.py
│   │   │   └── analytics_engine.py
│   │   │
│   │   └── coach/                 # AI trading coach
│   │       ├── __init__.py
│   │       └── coach_service.py
│   │
│   ├── api/                       # API routes
│   │   ├── __init__.py
│   │   ├── deps.py                # Dependencies (auth, etc.)
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── ict.py             # ICT analysis endpoints
│   │   │   ├── pre_market.py      # Pre-market reports
│   │   │   ├── monitoring.py      # Live monitoring
│   │   │   ├── trades.py          # Trade journal
│   │   │   ├── analytics.py       # Performance analytics
│   │   │   └── coach.py           # AI coach chat
│   │   └── router.py              # Main router
│   │
│   ├── workers/                   # Background tasks
│   │   ├── __init__.py
│   │   ├── pre_market.py          # 6 AM daily job
│   │   ├── session_monitor.py     # Kill zone monitoring
│   │   └── daily_metrics.py       # End of day calculations
│   │
│   └── utils/                     # Utilities
│       ├── __init__.py
│       ├── timeframes.py          # Timeframe helpers
│       ├── market_data.py         # Market data fetching
│       └── calculations.py        # Technical calculations
│
├── tests/
│   ├── __init__.py
│   ├── test_ict/
│   ├── test_analysis/
│   └── test_api/
│
├── alembic/                       # Database migrations
│   ├── versions/
│   └── env.py
│
├── requirements.txt
├── requirements-dev.txt
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## 🛠️ Tech Stack

### Core
- **FastAPI** - Modern async web framework
- **SQLAlchemy 2.0** - ORM with async support
- **Pydantic** - Data validation
- **Uvicorn** - ASGI server

### Data & Analysis
- **pandas** - Data manipulation
- **numpy** - Numerical computations
- **TA-Lib** - Technical analysis (optional)

### Background Jobs
- **APScheduler** - Cron-like scheduler
- **Celery** (optional) - For heavier distributed jobs
- **Redis** - Task queue + caching

### AI/ML
- **openai** - GPT integration (AI coach)
- **langchain** (optional) - For advanced AI features

### Database
- **asyncpg** - Async PostgreSQL driver
- **alembic** - Database migrations

### Monitoring
- **prometheus-client** - Metrics
- **structlog** - Structured logging

---

## 📦 Installation & Setup

### 1. Create Project

```bash
cd /home/comma/Documents/robinhood-performance-dash
mkdir ict-backend
cd ict-backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn sqlalchemy asyncpg alembic
pip install pandas numpy python-dotenv
pip install redis apscheduler
pip install openai pydantic-settings
```

### 2. `requirements.txt`

```txt
# Web Framework
fastapi==0.109.0
uvicorn[standard]==0.27.0
python-multipart==0.0.6

# Database
sqlalchemy==2.0.25
asyncpg==0.29.0
alembic==1.13.1
psycopg2-binary==2.9.9

# Data Processing
pandas==2.1.4
numpy==1.26.3
python-dateutil==2.8.2

# Background Jobs
apscheduler==3.10.4
redis==5.0.1

# AI/ML
openai==1.10.0

# Validation
pydantic==2.5.3
pydantic-settings==2.1.0
email-validator==2.1.0

# Utilities
python-dotenv==1.0.0
httpx==0.26.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4

# Monitoring
structlog==24.1.0
prometheus-client==0.19.0

# Development
pytest==7.4.4
pytest-asyncio==0.23.3
black==24.1.1
ruff==0.1.14
```

### 3. `.env.example`

```env
# Application
ENV=development
DEBUG=True
API_HOST=0.0.0.0
API_PORT=8000

# Database (use existing Supabase)
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/dbname
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=0

# Redis
REDIS_URL=redis://localhost:6379/0

# OpenAI
OPENAI_API_KEY=sk-...

# CORS
CORS_ORIGINS=["http://localhost:3000","https://your-frontend.vercel.app"]

# Authentication (JWT)
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Market Data
POLYGON_API_KEY=your-polygon-key  # If using Polygon.io
ALPACA_API_KEY=your-alpaca-key    # If using Alpaca

# Timezone
TIMEZONE=America/New_York

# Logging
LOG_LEVEL=INFO
```

---

## 🚀 FastAPI Application Setup

### `app/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import structlog

from app.config import settings
from app.database import engine, init_db
from app.api.router import api_router
from app.workers.scheduler import start_scheduler, shutdown_scheduler

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    logger.info("Starting ICT Backend...")

    # Initialize database
    await init_db()

    # Start background scheduler
    start_scheduler()

    logger.info("ICT Backend started successfully")

    yield

    # Shutdown
    logger.info("Shutting down ICT Backend...")
    shutdown_scheduler()
    await engine.dispose()
    logger.info("ICT Backend shutdown complete")


app = FastAPI(
    title="ICT Trading Backend",
    description="Backend API for ICT trading system",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "message": "ICT Trading Backend API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database": "connected",
        "scheduler": "running"
    }
```

### `app/config.py`

```python
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Application
    ENV: str = "development"
    DEBUG: bool = True
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # Database
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 0

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # OpenAI
    OPENAI_API_KEY: str

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Auth
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Market Data
    POLYGON_API_KEY: str = ""
    ALPACA_API_KEY: str = ""

    # Timezone
    TIMEZONE: str = "America/New_York"

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
```

### `app/database.py`

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.config import settings

# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
)

# Create session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Base class for models
Base = declarative_base()


async def init_db():
    """Initialize database (create tables if needed)"""
    async with engine.begin() as conn:
        # Import all models here
        from app.models import (
            pre_market_report,
            entry_setup,
            trade,
            daily_metrics,
            alert
        )

        # Create tables
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """Dependency for getting database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

---

## 🔌 Integration with Next.js Frontend

### Strategy: Proxy Pattern

Your Next.js frontend will have thin API routes that proxy to the FastAPI backend.

### Next.js API Proxy

```typescript
// next-frontend/src/app/api/ict/pre-market/route.ts

export async function GET(request: Request) {
  try {
    // Get auth token from request
    const token = request.headers.get('authorization');

    // Get query params
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const date = searchParams.get('date');

    // Proxy to FastAPI backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const response = await fetch(
      `${backendUrl}/api/v1/pre-market/report?symbol=${symbol}&date=${date}`,
      {
        headers: {
          'Authorization': token || '',
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from backend' },
      { status: 500 }
    );
  }
}
```

### Or: Direct Frontend → Backend

For new features, call the FastAPI backend directly from React components:

```typescript
// next-frontend/src/lib/api/ict.ts

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function getPreMarketReport(symbol: string, date: string) {
  const response = await fetch(
    `${BACKEND_URL}/api/v1/pre-market/report?symbol=${symbol}&date=${date}`,
    {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch pre-market report');
  }

  return response.json();
}

// Usage in component
const report = await getPreMarketReport('NQ', '2025-01-15');
```

---

## 📋 Migration Phases

### Phase 1: Foundation (Week 1)
**Goal:** Set up backend, database, basic API

- [ ] Create FastAPI project structure
- [ ] Set up database models (SQLAlchemy)
- [ ] Database migrations (Alembic)
- [ ] Basic health check endpoint
- [ ] Authentication (JWT compatible with Supabase)

**Deliverable:** Backend running on `localhost:8000` with health check

---

### Phase 2: ICT Analysis Core (Week 2-3)
**Goal:** Build core ICT analysis functionality

- [ ] Market structure detection (BOS/ChoCH/MSS)
- [ ] Dealing range calculator (PD%)
- [ ] Order block detection
- [ ] FVG detection
- [ ] Liquidity identification
- [ ] API endpoint: `GET /api/v1/ict/analyze`

**Deliverable:** ICT analysis endpoint that matches current `/api/ict` functionality

**Test:** Compare outputs with existing Next.js ICT analysis

---

### Phase 3: Pre-Market Analysis (Week 4)
**Goal:** Automated morning reports

- [ ] HTF bias scanner (Daily, 4H, 1H)
- [ ] Liquidity mapper
- [ ] Report generator
- [ ] Background job (runs at 6 AM daily)
- [ ] API endpoint: `GET /api/v1/pre-market/report`

**Deliverable:** Automated pre-market reports stored in database

**Integration:** Add "View Pre-Market Report" to frontend

---

### Phase 4: Trade Journal Migration (Week 5)
**Goal:** Migrate journal from Supabase to backend

- [ ] Trade logger service
- [ ] Daily metrics calculator
- [ ] Performance analytics engine
- [ ] API endpoints:
  - `POST /api/v1/trades`
  - `GET /api/v1/trades`
  - `GET /api/v1/metrics/daily`
  - `GET /api/v1/metrics/performance`

**Deliverable:** Full trade journal functionality via backend

**Migration:** Update frontend to call backend instead of Supabase directly

---

### Phase 5: Live Monitoring (Week 6-7)
**Goal:** Real-time kill zone monitoring

- [ ] Session manager
- [ ] Entry setup detector
- [ ] Alert system
- [ ] WebSocket server for real-time updates
- [ ] API endpoints:
  - `GET /api/v1/monitoring/session`
  - `GET /api/v1/monitoring/setup`
  - `WS /api/v1/ws/alerts`

**Deliverable:** Real-time setup detection with alerts

**Integration:** Add real-time alerts to frontend

---

### Phase 6: AI Coach (Week 8)
**Goal:** Context-aware trading coach

- [ ] Coach service with phase detection
- [ ] Context builder
- [ ] Insight generator
- [ ] API endpoints:
  - `POST /api/v1/coach/chat`
  - `GET /api/v1/coach/insights`

**Deliverable:** AI coach integrated into existing chat interface

**Migration:** Replace GPT integration in Next.js with backend coach

---

## 🗃️ Database Migration Strategy

### Option 1: Share Existing Supabase (Recommended)

**Pros:**
- No data migration needed
- Gradual transition
- Frontend can still access Supabase directly during migration

**Setup:**
```python
# app/config.py
DATABASE_URL = "postgresql+asyncpg://[YOUR_SUPABASE_URL]"
```

### Option 2: Separate Database

**Pros:**
- Full control
- Better for production separation

**Cons:**
- Need to migrate existing data
- More complex

---

## 🏃 Running the Backend

### Development

```bash
# Terminal 1: Redis
docker run -p 6379:6379 redis:alpine

# Terminal 2: FastAPI
cd ict-backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 3: Background workers (optional)
celery -A app.workers worker --loglevel=info
```

### With Docker

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

# Expose port
EXPOSE 8000

# Run app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379/0
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - redis
    volumes:
      - ./app:/app/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"

  # Optional: PostgreSQL if not using Supabase
  # postgres:
  #   image: postgres:16-alpine
  #   environment:
  #     POSTGRES_USER: ict_user
  #     POSTGRES_PASSWORD: ict_password
  #     POSTGRES_DB: ict_trading
  #   ports:
  #     - "5432:5432"
  #   volumes:
  #     - postgres_data:/var/lib/postgresql/data

# volumes:
#   postgres_data:
```

**Run:**
```bash
docker-compose up
```

---

## 🎯 Development Workflow

### Day-to-Day

1. **Backend Development:**
   ```bash
   cd ict-backend
   source venv/bin/activate
   uvicorn app.main:app --reload
   ```

2. **Frontend Development (unchanged):**
   ```bash
   cd next-frontend
   npm run dev
   ```

3. **Test integration:**
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:8000`
   - API Docs: `http://localhost:8000/docs` (auto-generated by FastAPI)

### Environment Variables

```bash
# next-frontend/.env.local
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
BACKEND_URL=http://localhost:8000  # For server-side

# ict-backend/.env
DATABASE_URL=postgresql+asyncpg://...
OPENAI_API_KEY=sk-...
```

---

## 📊 Testing Strategy

### Backend Tests

```python
# tests/test_api/test_ict.py
import pytest
from httpx import AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_ict_analyze():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/ict/analyze",
            params={"symbol": "NQ", "interval": "5min", "lookbackBars": 72}
        )
        assert response.status_code == 200
        data = response.json()
        assert "structure" in data
        assert "dealingRange" in data
```

**Run tests:**
```bash
pytest
```

---

## 🚀 Deployment

### Option 1: Railway (Recommended)

**Steps:**
1. Create `railway.toml`:
   ```toml
   [build]
   builder = "DOCKERFILE"

   [deploy]
   startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
   healthcheckPath = "/health"
   ```

2. Deploy:
   ```bash
   railway up
   ```

**Cost:** ~$5-20/month

### Option 2: Render

**Steps:**
1. Connect GitHub repo
2. Select "Web Service"
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

**Cost:** Free tier available, $7/month for paid

### Option 3: Google Cloud Run

**Steps:**
1. Build Docker image
2. Push to Google Container Registry
3. Deploy to Cloud Run

**Cost:** Pay per use, ~$5-30/month

---

## 🔄 Gradual Cutover Plan

### Week 1-4: Coexistence
- Next.js handles all frontend + existing features
- FastAPI runs alongside, handles new features only

### Week 5-6: Migration Begins
- Migrate trade journal to backend
- Frontend calls backend for new journal entries
- Old entries stay in Supabase (read-only)

### Week 7-8: Full Migration
- All ICT analysis goes through backend
- Pre-market reports automated
- Live monitoring active

### Week 9+: Optimization
- Remove old Next.js API routes
- Optimize backend performance
- Scale as needed

---

## ✅ Success Criteria

- [ ] Backend handles 95% of trading logic
- [ ] Response times < 500ms (p95)
- [ ] Zero downtime during migration
- [ ] All features work identically
- [ ] Frontend code minimally changed

---

## 🎬 Next Steps

1. **Create backend project structure** (I can help generate files)
2. **Set up database connection** (test with existing Supabase)
3. **Build first endpoint** (`/api/v1/ict/analyze`)
4. **Test from frontend** (verify it works)
5. **Gradually add more features**

**Ready to start building?** Let me know and I can:
- Generate the initial project files
- Create the database models
- Build the first ICT analysis endpoint
- Set up the development environment

What would you like to tackle first?
