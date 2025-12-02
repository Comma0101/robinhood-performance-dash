# ICT Trading Agent Backend - API Testing Guide

## Table of Contents
- [Overview](#overview)
- [Getting Started](#getting-started)
- [API Structure](#api-structure)
- [Testing Workflow](#testing-workflow)
- [Endpoints Reference](#endpoints-reference)
  - [1. Health & Root](#1-health--root)
  - [2. ICT Analysis](#2-ict-analysis)
  - [3. Pre-Market Reports](#3-pre-market-reports)
  - [4. Entry Setups](#4-entry-setups)
  - [5. Trades](#5-trades)
  - [6. AI Coach](#6-ai-coach)
  - [7. Alerts](#7-alerts)
- [Common Errors](#common-errors)
- [curl Examples](#curl-examples)

---

## Overview

The ICT Trading Agent Backend is a FastAPI-based REST API that manages:
- Pre-market analysis and planning
- Real-time entry setup detection
- Trade lifecycle tracking
- AI coaching sessions
- Trading alerts and notifications

**Base URL**: `http://localhost:8000`
**API Prefix**: `/api/v1`
**Interactive Documentation**: `http://localhost:8000/docs` (Swagger UI)
**Alternative Docs**: `http://localhost:8000/redoc` (ReDoc)

---

## Getting Started

### 1. Start the Backend

```bash
cd /home/comma/Documents/robinhood-performance-dash/backend
docker-compose up -d
```

### 2. Check Health

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "app": "ICT Trading Agent Backend",
  "version": "1.0.0",
  "environment": "development"
}
```

### 3. Access Interactive Documentation

Open your browser: `http://localhost:8000/docs`

The Swagger UI provides:
- Interactive API testing
- Request/response schemas
- Try-it-out functionality
- Automatic validation

---

## API Structure

### Database Schema
The API manages 6 main entities with relationships:

```
PreMarketReport (1) ──> (many) EntrySetup
       │
       └──> (many) DailyMetrics

EntrySetup (1) ──> (0 or 1) Trade

Trade (1) ──> (many) CoachSession

EntrySetup (1) ──> (many) Alert
```

### Enums Used Across API

**BiasType**: `BULLISH`, `BEARISH`, `NEUTRAL`

**SessionType**: `ASIAN`, `LONDON`, `NEW_YORK`, `LONDON_OPEN`, `NY_OPEN`

**TradeStatus**: `PENDING`, `ENTERED`, `STOPPED`, `TARGET_1_HIT`, `TARGET_2_HIT`, `TARGET_3_HIT`, `CLOSED_WIN`, `CLOSED_LOSS`

**AlertType**: `ENTRY`, `EXIT`, `LIQUIDITY`, `STRUCTURE_BREAK`, `ZONE_ENTRY`

---

## Testing Workflow

### Recommended Order for Testing

Since entities have foreign key relationships, follow this order:

1. **Create a Pre-Market Report** (required for setups)
2. **Create Entry Setups** (using the report_id from step 1)
3. **Create Trades** (optionally linked to setup_id)
4. **Create Coach Sessions** (optionally linked to trade_id)
5. **Create Alerts** (optionally linked to setup_id)

### Example Flow

```bash
# Step 1: Create report
POST /api/v1/reports/ → returns report_id: 1

# Step 2: Create setup using report_id
POST /api/v1/setups/ (with report_id: 1) → returns setup_id: 1

# Step 3: Create trade linked to setup
POST /api/v1/trades/ (with setup_id: 1) → returns trade_id: 1

# Step 4: Create coach session for trade
POST /api/v1/coach/sessions (with related_trade_id: 1)

# Step 5: Create alert for setup
POST /api/v1/alerts/ (with related_setup_id: 1)
```

---

## Endpoints Reference

### 1. Health & Root

#### GET `/health`
Check if the API is running.

**Response**:
```json
{
  "status": "healthy",
  "app": "ICT Trading Agent Backend",
  "version": "1.0.0",
  "environment": "development"
}
```

#### GET `/`
Root endpoint with API information.

**Response**:
```json
{
  "message": "ICT Trading Agent Backend API",
  "version": "1.0.0",
  "docs": "/docs",
  "health": "/health"
}
```

---

### 2. ICT Analysis

Real-time ICT technical analysis endpoints.

#### POST `/api/v1/analysis/run`
Run full ICT analysis on a symbol with multiple timeframes.

**Purpose**: Perform comprehensive ICT analysis including order blocks, FVGs, liquidity zones, and market structure.

**Request Body**:
```json
{
  "symbol": "EURUSD",
  "timeframes": ["1D", "4H", "1H", "15m", "5m"],
  "analysis_type": "full"
}
```

**Parameters**:
- `symbol` (required): Trading pair (e.g., "EURUSD", "GBPUSD")
- `timeframes` (optional): Array of timeframes to analyze. Default: ["1D", "4H", "1H", "15m", "5m"]
- `analysis_type` (optional): "full", "bias_only", or "structure_only". Default: "full"

**Response**: `ICTAnalysisResponse` with market structure, order blocks, FVGs, etc.

**Defined in**: [app/api/endpoints/analysis.py:15-39](backend/app/api/endpoints/analysis.py#L15-L39)

---

#### GET `/api/v1/analysis/bias/{symbol}`
Get current market bias for a symbol (quick check).

**Purpose**: Quick endpoint to check market direction without running full analysis.

**Path Parameters**:
- `symbol`: Trading symbol (e.g., "EURUSD")

**Query Parameters**:
- `timeframe` (optional): Timeframe to check. Default: "1D"

**Example**: `GET /api/v1/analysis/bias/EURUSD?timeframe=4H`

**Response**:
```json
{
  "symbol": "EURUSD",
  "timeframe": "4H",
  "bias": "BULLISH"
}
```

**Defined in**: [app/api/endpoints/analysis.py:42-62](backend/app/api/endpoints/analysis.py#L42-L62)

---

#### GET `/api/v1/analysis/levels/{symbol}`
Get key levels (order blocks, FVGs, liquidity zones).

**Purpose**: Returns the most important price levels traders should watch.

**Path Parameters**:
- `symbol`: Trading symbol

**Query Parameters**:
- `timeframe` (optional): Default: "1D"

**Example**: `GET /api/v1/analysis/levels/GBPUSD?timeframe=1H`

**Response**:
```json
{
  "symbol": "GBPUSD",
  "timeframe": "1H",
  "levels": {
    "order_blocks": [...],
    "fvgs": [...],
    "liquidity_zones": [...]
  }
}
```

**Defined in**: [app/api/endpoints/analysis.py:65-85](backend/app/api/endpoints/analysis.py#L65-L85)

---

### 3. Pre-Market Reports

Daily pre-market analysis reports generated by the AI agent.

#### POST `/api/v1/reports/`
Create a new pre-market report.

**Purpose**: Store daily HTF/LTF analysis with trade plan. Usually generated automatically at 6 AM by the Pre-Market Analyzer agent.

**Request Body**:
```json
{
  "date": "2025-11-11",
  "symbol": "EURUSD",
  "htf_bias": "BULLISH",
  "htf_dealing_range_high": 1.0950,
  "htf_dealing_range_low": 1.0850,
  "htf_key_levels": {
    "order_blocks": [
      {"high": 1.0920, "low": 1.0910, "type": "bullish"}
    ],
    "fvgs": [
      {"high": 1.0900, "low": 1.0890}
    ],
    "liquidity": [
      {"price": 1.0950, "type": "buy_side"}
    ]
  },
  "ltf_structure": "higher_highs_higher_lows",
  "ltf_entry_zones": [
    {
      "high": 1.0885,
      "low": 1.0875,
      "type": "demand_zone"
    }
  ],
  "target_sessions": ["LONDON_OPEN", "NY_OPEN"],
  "narrative": "HTF bullish bias. Looking for retracement to 1.0875 demand zone for long entries during London/NY open.",
  "trade_plan": {
    "direction": "long",
    "entry_zone": {"high": 1.0885, "low": 1.0875},
    "stop_loss": 1.0865,
    "targets": [1.0920, 1.0950]
  },
  "confidence": 0.85
}
```

**Required Fields**:
- `date`: Report date (YYYY-MM-DD format)
- `symbol`: Trading pair
- `htf_bias`: Higher timeframe bias (BULLISH/BEARISH/NEUTRAL)
- `htf_key_levels`: Key price levels from HTF analysis
- `ltf_structure`: Lower timeframe market structure description
- `ltf_entry_zones`: Potential entry zones on LTF
- `target_sessions`: Kill zone sessions to target
- `narrative`: Market analysis narrative
- `trade_plan`: Structured trade plan
- `confidence`: Confidence score (0.0 to 1.0)

**Response**: `201 Created` with `PreMarketReportResponse`

**Defined in**: [app/api/endpoints/reports.py:18-36](backend/app/api/endpoints/reports.py#L18-L36)

---

#### GET `/api/v1/reports/`
Get pre-market reports with optional filtering.

**Purpose**: Retrieve historical or recent reports with filters.

**Query Parameters**:
- `symbol` (optional): Filter by trading symbol
- `start_date` (optional): Reports from this date onwards (YYYY-MM-DD)
- `end_date` (optional): Reports up to this date (YYYY-MM-DD)
- `limit` (optional): Maximum reports to return. Default: 30, Max: 100

**Examples**:
```bash
# Get last 30 reports for EURUSD
GET /api/v1/reports/?symbol=EURUSD

# Get reports for date range
GET /api/v1/reports/?start_date=2025-11-01&end_date=2025-11-11

# Get last 10 reports
GET /api/v1/reports/?limit=10
```

**Response**: Array of `PreMarketReportResponse`

**Defined in**: [app/api/endpoints/reports.py:39-72](backend/app/api/endpoints/reports.py#L39-L72)

---

#### GET `/api/v1/reports/{report_id}`
Get a specific pre-market report by ID.

**Path Parameters**:
- `report_id`: Report ID (integer)

**Example**: `GET /api/v1/reports/1`

**Response**: `200 OK` with `PreMarketReportResponse` or `404 Not Found`

**Defined in**: [app/api/endpoints/reports.py:75-93](backend/app/api/endpoints/reports.py#L75-L93)

---

#### GET `/api/v1/reports/date/{report_date}`
Get report for a specific date and symbol.

**Purpose**: Retrieve the report for a specific trading day.

**Path Parameters**:
- `report_date`: Date in YYYY-MM-DD format

**Query Parameters**:
- `symbol` (required): Trading symbol

**Example**: `GET /api/v1/reports/date/2025-11-11?symbol=EURUSD`

**Response**: `200 OK` with `PreMarketReportResponse` or `404 Not Found`

**Defined in**: [app/api/endpoints/reports.py:96-121](backend/app/api/endpoints/reports.py#L96-L121)

---

#### DELETE `/api/v1/reports/{report_id}`
Delete a pre-market report.

**Path Parameters**:
- `report_id`: Report ID to delete

**Response**: `204 No Content` on success, `404 Not Found` if report doesn't exist

**Defined in**: [app/api/endpoints/reports.py:124-144](backend/app/api/endpoints/reports.py#L124-L144)

---

### 4. Entry Setups

Real-time entry setups detected during kill zones.

#### POST `/api/v1/setups/`
Create a new entry setup.

**Purpose**: Record a trading setup detected during kill zone monitoring. Usually created automatically by the Kill Zone Monitor agent.

**Request Body**:
```json
{
  "report_id": 1,
  "session": "LONDON_OPEN",
  "symbol": "EURUSD",
  "timeframe": "5m",
  "direction": "long",
  "entry_price": 1.0880,
  "stop_loss": 1.0865,
  "target_1": 1.0920,
  "target_2": 1.0950,
  "target_3": 1.0980,
  "setup_type": "fvg_retracement",
  "confluence_factors": [
    "FVG filled",
    "Order block reaction",
    "Liquidity sweep",
    "Higher timeframe alignment"
  ],
  "risk_reward": 2.67
}
```

**Required Fields**:
- `report_id`: ID of related pre-market report (foreign key)
- `session`: Kill zone session (ASIAN/LONDON/NEW_YORK/LONDON_OPEN/NY_OPEN)
- `symbol`: Trading pair
- `timeframe`: Chart timeframe (e.g., "5m", "15m")
- `direction`: "long" or "short"
- `entry_price`: Entry price level
- `stop_loss`: Stop loss price
- `target_1`: First target price
- `setup_type`: Type of setup (e.g., "fvg_retracement", "order_block", "liquidity_grab")
- `confluence_factors`: Array of supporting factors
- `risk_reward`: Risk to reward ratio

**Response**: `201 Created` with `EntrySetupResponse`

**Important**: The `report_id` must exist in the `pre_market_reports` table, or you'll get a foreign key constraint error.

**Defined in**: [app/api/endpoints/setups.py:18-36](backend/app/api/endpoints/setups.py#L18-L36)

---

#### GET `/api/v1/setups/`
Get entry setups with optional filtering.

**Purpose**: Retrieve recent or filtered setups.

**Query Parameters**:
- `symbol` (optional): Filter by trading symbol
- `session` (optional): Filter by kill zone session
- `executed` (optional): Filter by execution status (true/false)
- `limit` (optional): Maximum setups to return. Default: 50, Max: 200

**Examples**:
```bash
# Get all unexecuted setups
GET /api/v1/setups/?executed=false

# Get London Open setups for EURUSD
GET /api/v1/setups/?symbol=EURUSD&session=LONDON_OPEN

# Get last 20 setups
GET /api/v1/setups/?limit=20
```

**Response**: Array of `EntrySetupResponse`

**Defined in**: [app/api/endpoints/setups.py:39-72](backend/app/api/endpoints/setups.py#L39-L72)

---

#### GET `/api/v1/setups/{setup_id}`
Get a specific entry setup by ID.

**Path Parameters**:
- `setup_id`: Setup ID (integer)

**Example**: `GET /api/v1/setups/1`

**Response**: `200 OK` with `EntrySetupResponse` or `404 Not Found`

**Defined in**: [app/api/endpoints/setups.py:75-93](backend/app/api/endpoints/setups.py#L75-L93)

---

#### PATCH `/api/v1/setups/{setup_id}/execute`
Mark a setup as executed.

**Purpose**: Update setup status when trader takes the trade.

**Path Parameters**:
- `setup_id`: Setup ID to mark as executed

**Query Parameters**:
- `execution_notes` (optional): Notes about execution

**Example**: `PATCH /api/v1/setups/1/execute?execution_notes=Entered%20at%201.0880`

**Response**: `200 OK` with updated `EntrySetupResponse`

**Defined in**: [app/api/endpoints/setups.py:96-121](backend/app/api/endpoints/setups.py#L96-L121)

---

### 5. Trades

Full lifecycle tracking of executed trades.

#### POST `/api/v1/trades/`
Create a new trade.

**Purpose**: Record a trade that was executed. Can be linked to an entry setup or created manually.

**Request Body**:
```json
{
  "setup_id": 1,
  "symbol": "EURUSD",
  "date": "2025-11-11",
  "session": "LONDON_OPEN",
  "entry_time": "2025-11-11T08:15:00Z",
  "entry_price": 1.0880,
  "position_size": 1.0,
  "direction": "long",
  "stop_loss": 1.0865,
  "target_1": 1.0920,
  "target_2": 1.0950,
  "target_3": 1.0980,
  "entry_notes": "Entered after FVG fill and order block reaction"
}
```

**Required Fields**:
- `symbol`: Trading pair
- `date`: Trade date (YYYY-MM-DD)
- `session`: Kill zone session
- `entry_time`: Entry timestamp (ISO 8601 format)
- `entry_price`: Entry price
- `position_size`: Position size (lots/contracts)
- `direction`: "long" or "short"
- `stop_loss`: Stop loss price
- `target_1`: First target price

**Optional Fields**:
- `setup_id`: Link to entry setup (can be null for manual trades)
- `target_2`, `target_3`: Additional targets
- `entry_notes`: Entry notes

**Response**: `201 Created` with `TradeResponse`

**Defined in**: [app/api/endpoints/trades.py:18-36](backend/app/api/endpoints/trades.py#L18-L36)

---

#### GET `/api/v1/trades/`
Get trades with optional filtering.

**Purpose**: Retrieve trade history with filters.

**Query Parameters**:
- `symbol` (optional): Filter by trading symbol
- `status` (optional): Filter by trade status (PENDING/ENTERED/STOPPED/TARGET_1_HIT/etc.)
- `start_date` (optional): Trades from this date onwards (YYYY-MM-DD)
- `end_date` (optional): Trades up to this date (YYYY-MM-DD)
- `limit` (optional): Maximum trades to return. Default: 100, Max: 500

**Examples**:
```bash
# Get all winning trades
GET /api/v1/trades/?status=CLOSED_WIN

# Get EURUSD trades for November
GET /api/v1/trades/?symbol=EURUSD&start_date=2025-11-01&end_date=2025-11-30

# Get last 50 trades
GET /api/v1/trades/?limit=50
```

**Response**: Array of `TradeResponse`

**Defined in**: [app/api/endpoints/trades.py:39-76](backend/app/api/endpoints/trades.py#L39-L76)

---

#### GET `/api/v1/trades/{trade_id}`
Get a specific trade by ID.

**Path Parameters**:
- `trade_id`: Trade ID (integer)

**Example**: `GET /api/v1/trades/1`

**Response**: `200 OK` with `TradeResponse` or `404 Not Found`

**Defined in**: [app/api/endpoints/trades.py:79-97](backend/app/api/endpoints/trades.py#L79-L97)

---

#### PATCH `/api/v1/trades/{trade_id}`
Update a trade (partial update).

**Purpose**: Update trade details as the trade progresses or closes. Typically used to record exits, P&L, and target hits.

**Path Parameters**:
- `trade_id`: Trade ID to update

**Request Body** (all fields optional):
```json
{
  "exit_time": "2025-11-11T10:30:00Z",
  "exit_price": 1.0925,
  "target_1_hit": true,
  "target_2_hit": false,
  "target_3_hit": false,
  "pnl": 45.0,
  "pnl_percent": 0.41,
  "mae": -5.0,
  "mfe": 50.0,
  "status": "CLOSED_WIN",
  "exit_notes": "Closed at target 1, market showing signs of reversal"
}
```

**Fields**:
- `exit_time`: Exit timestamp
- `exit_price`: Exit price
- `target_1_hit`, `target_2_hit`, `target_3_hit`: Boolean flags
- `pnl`: Profit/loss in currency
- `pnl_percent`: P&L as percentage
- `mae`: Maximum Adverse Excursion (worst drawdown during trade)
- `mfe`: Maximum Favorable Excursion (best profit during trade)
- `status`: Updated trade status
- `exit_notes`: Exit notes

**Response**: `200 OK` with updated `TradeResponse`

**Defined in**: [app/api/endpoints/trades.py:100-131](backend/app/api/endpoints/trades.py#L100-L131)

---

#### DELETE `/api/v1/trades/{trade_id}`
Delete a trade.

**Path Parameters**:
- `trade_id`: Trade ID to delete

**Response**: `204 No Content` on success, `404 Not Found` if trade doesn't exist

**Defined in**: [app/api/endpoints/trades.py:134-154](backend/app/api/endpoints/trades.py#L134-L154)

---

### 6. AI Coach

AI coaching sessions with LangChain-powered conversational coach.

#### POST `/api/v1/coach/sessions`
Create a new coaching session.

**Purpose**: Start a new conversation with the AI coach. Sessions are context-aware based on phase (pre_market, kill_zone, post_market).

**Request Body**:
```json
{
  "phase": "kill_zone",
  "related_date": "2025-11-11",
  "related_trade_id": 1
}
```

**Required Fields**:
- `phase`: Session phase - "pre_market", "kill_zone", or "post_market"

**Optional Fields**:
- `related_date`: Date context for the session
- `related_trade_id`: Trade ID if discussing a specific trade

**Response**: `201 Created` with `CoachSessionResponse` including generated `session_id`

**Defined in**: [app/api/endpoints/coach.py:23-52](backend/app/api/endpoints/coach.py#L23-L52)

---

#### POST `/api/v1/coach/sessions/{session_id}/chat`
Send a message to the AI coach.

**Purpose**: Chat with the AI coach within a session. The coach uses LangChain with memory and will remember previous messages in the session.

**Path Parameters**:
- `session_id`: Session ID (e.g., "coach_abc123def456")

**Request Body**:
```json
{
  "role": "user",
  "content": "I'm feeling hesitant about this setup. The confluence looks good but I'm worried about the spread during London open.",
  "timestamp": "2025-11-11T08:00:00Z"
}
```

**Required Fields**:
- `role`: "user" (assistant/system are used internally)
- `content`: Message content

**Optional Fields**:
- `timestamp`: Message timestamp (defaults to current time)

**Response**:
```json
{
  "response": "I understand your concern about the spread during London open...",
  "timestamp": "2025-11-11T08:00:05.123Z",
  "session_id": "coach_abc123def456"
}
```

**Defined in**: [app/api/endpoints/coach.py:55-106](backend/app/api/endpoints/coach.py#L55-L106)

---

#### GET `/api/v1/coach/sessions`
Get coaching sessions with optional filtering.

**Purpose**: Retrieve past coaching sessions.

**Query Parameters**:
- `phase` (optional): Filter by phase (pre_market/kill_zone/post_market)
- `limit` (optional): Maximum sessions to return. Default: 20

**Example**: `GET /api/v1/coach/sessions?phase=post_market&limit=10`

**Response**: Array of `CoachSessionResponse`

**Defined in**: [app/api/endpoints/coach.py:109-134](backend/app/api/endpoints/coach.py#L109-L134)

---

#### GET `/api/v1/coach/sessions/{session_id}`
Get a specific coaching session.

**Path Parameters**:
- `session_id`: Session ID

**Example**: `GET /api/v1/coach/sessions/coach_abc123def456`

**Response**: `200 OK` with `CoachSessionResponse` including full message history

**Defined in**: [app/api/endpoints/coach.py:137-155](backend/app/api/endpoints/coach.py#L137-L155)

---

#### PATCH `/api/v1/coach/sessions/{session_id}`
Update a coaching session.

**Purpose**: Update session metadata like key insights, action items, or mark as ended.

**Path Parameters**:
- `session_id`: Session ID to update

**Request Body** (all fields optional):
```json
{
  "key_insights": [
    "Need to work on patience during consolidation",
    "Entry timing improved - good wait for confirmation"
  ],
  "action_items": [
    "Practice 15m structure breaks on demo account",
    "Review MAE on last 5 losing trades"
  ],
  "ended_at": "2025-11-11T10:00:00Z"
}
```

**Response**: `200 OK` with updated `CoachSessionResponse`

**Defined in**: [app/api/endpoints/coach.py:158-185](backend/app/api/endpoints/coach.py#L158-L185)

---

### 7. Alerts

Real-time trading alerts and notifications.

#### POST `/api/v1/alerts/`
Create a new alert.

**Purpose**: Create an alert for trading opportunities or events. Can be generated automatically by background monitors or created manually.

**Request Body**:
```json
{
  "alert_type": "ZONE_ENTRY",
  "symbol": "EURUSD",
  "timeframe": "5m",
  "title": "Price entering demand zone",
  "message": "EURUSD is now trading at 1.0878, entering the identified demand zone (1.0875-1.0885). Watch for confirmation before entry.",
  "priority": 2,
  "price": 1.0878,
  "related_setup_id": 1,
  "extra_data": {
    "zone_type": "demand",
    "zone_high": 1.0885,
    "zone_low": 1.0875
  }
}
```

**Required Fields**:
- `alert_type`: Alert type (ENTRY/EXIT/LIQUIDITY/STRUCTURE_BREAK/ZONE_ENTRY)
- `symbol`: Trading pair
- `timeframe`: Chart timeframe
- `title`: Alert title (max 200 characters)
- `message`: Alert message

**Optional Fields**:
- `priority`: Priority level (1=low, 2=medium, 3=high). Default: 1
- `price`: Current price at alert trigger
- `related_setup_id`: Link to entry setup
- `extra_data`: Additional data as JSON object

**Response**: `201 Created` with `AlertResponse`

**Defined in**: [app/api/endpoints/alerts.py:17-35](backend/app/api/endpoints/alerts.py#L17-L35)

---

#### GET `/api/v1/alerts/`
Get alerts with optional filtering.

**Purpose**: Retrieve alerts with various filters.

**Query Parameters**:
- `symbol` (optional): Filter by trading symbol
- `alert_type` (optional): Filter by alert type
- `is_read` (optional): Filter by read status (true/false)
- `is_dismissed` (optional): Filter by dismissed status (true/false)
- `limit` (optional): Maximum alerts to return. Default: 50, Max: 200

**Examples**:
```bash
# Get unread alerts
GET /api/v1/alerts/?is_read=false

# Get high priority entry alerts for EURUSD
GET /api/v1/alerts/?symbol=EURUSD&alert_type=ENTRY

# Get last 20 alerts
GET /api/v1/alerts/?limit=20
```

**Response**: Array of `AlertResponse`

**Defined in**: [app/api/endpoints/alerts.py:38-75](backend/app/api/endpoints/alerts.py#L38-L75)

---

#### GET `/api/v1/alerts/{alert_id}`
Get a specific alert by ID.

**Path Parameters**:
- `alert_id`: Alert ID (integer)

**Example**: `GET /api/v1/alerts/1`

**Response**: `200 OK` with `AlertResponse` or `404 Not Found`

**Defined in**: [app/api/endpoints/alerts.py:78-96](backend/app/api/endpoints/alerts.py#L78-L96)

---

#### PATCH `/api/v1/alerts/{alert_id}/read`
Mark an alert as read.

**Path Parameters**:
- `alert_id`: Alert ID to mark as read

**Example**: `PATCH /api/v1/alerts/1/read`

**Response**: `200 OK` with updated `AlertResponse` (sets `is_read=true` and `read_at` timestamp)

**Defined in**: [app/api/endpoints/alerts.py:99-125](backend/app/api/endpoints/alerts.py#L99-L125)

---

#### PATCH `/api/v1/alerts/{alert_id}/dismiss`
Dismiss an alert.

**Path Parameters**:
- `alert_id`: Alert ID to dismiss

**Example**: `PATCH /api/v1/alerts/1/dismiss`

**Response**: `200 OK` with updated `AlertResponse` (sets `is_dismissed=true`)

**Defined in**: [app/api/endpoints/alerts.py:128-151](backend/app/api/endpoints/alerts.py#L128-L151)

---

#### DELETE `/api/v1/alerts/{alert_id}`
Delete an alert.

**Path Parameters**:
- `alert_id`: Alert ID to delete

**Response**: `204 No Content` on success, `404 Not Found` if alert doesn't exist

**Defined in**: [app/api/endpoints/alerts.py:154-174](backend/app/api/endpoints/alerts.py#L154-L174)

---

## Alpha Vantage API Limitations

The `/api/v1/analysis/*` endpoints use Alpha Vantage API for market data. **Important limitations**:

### Free Tier Limits
- **5 API calls per minute**
- **500 API calls per day**

### Impact on Analysis Endpoints

**Problem**: The default `/api/v1/analysis/run` request analyzes 5 timeframes:
```json
{
  "timeframes": ["1D", "4H", "1H", "15m", "5m"]  // 5 API calls at once!
}
```

This will **hit the rate limit immediately** and return:
```json
{
  "detail": "Error fetching data: Unexpected API response format: ['Information']"
}
```

### Solutions

**Option 1: Use Single Timeframe** (Recommended for testing)
```bash
curl -X POST "$BASE_URL/analysis/run" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "IBM",
    "timeframes": ["1D"],
    "analysis_type": "full"
  }'
```

**Option 2: Use Quick Endpoints**
```bash
# Get bias only (1 API call)
GET /api/v1/analysis/bias/IBM?timeframe=1D

# Get key levels only (1 API call)
GET /api/v1/analysis/levels/IBM?timeframe=1D
```

**Option 3: Wait Between Requests**
```bash
# Make request, then wait 60 seconds before next request
curl -X POST "$BASE_URL/analysis/run" -d '{"symbol": "IBM", "timeframes": ["1D"]}'
sleep 60
curl -X POST "$BASE_URL/analysis/run" -d '{"symbol": "IBM", "timeframes": ["1H"]}'
```

**Option 4: Use Mock Data for Development**
The backend includes a `fetch_ohlcv_mock()` function for testing without API limits. To use it, modify the analyzer temporarily to use mock data.

### Recommended Test Symbols

Use **stock symbols** (not forex) for Alpha Vantage:
- IBM
- AAPL
- MSFT
- GOOGL
- TSLA

**Don't use**: EURUSD, GBPUSD (forex requires different Alpha Vantage endpoints)

---

## Common Errors

### 1. Foreign Key Constraint Violation (500 Error)

**Error Message**: `"FOREIGN KEY constraint failed"` or `"violates foreign key constraint"`

**Cause**: Trying to create an entity with a reference to a non-existent parent record.

**Examples**:
- Creating an `EntrySetup` with `report_id: 0` when no report with ID 0 exists
- Creating a `Trade` with `setup_id: 999` when no setup with ID 999 exists

**Solution**: Create parent records first, then use their returned IDs.

```bash
# Wrong order
POST /api/v1/setups/ with report_id: 0  # Error! Report doesn't exist

# Correct order
POST /api/v1/reports/  # Returns: {"id": 1, ...}
POST /api/v1/setups/ with report_id: 1  # Success!
```

---

### 2. Validation Error (422 Error)

**Error Message**: `"Validation error"` with details about which field failed

**Common Causes**:
- Missing required fields
- Invalid field types (string instead of number)
- Values outside allowed range (confidence > 1.0)
- Invalid enum values (direction: "buy" instead of "long")
- Pattern mismatch (direction must be "long" or "short")

**Example Error**:
```json
{
  "detail": [
    {
      "loc": ["body", "direction"],
      "msg": "string does not match regex pattern",
      "type": "value_error.str.regex"
    }
  ]
}
```

**Solution**: Check the schema and ensure all fields match the required format.

---

### 3. Not Found (404 Error)

**Error Message**: `"Report not found"`, `"Setup not found"`, etc.

**Cause**: Trying to access/update/delete a resource that doesn't exist.

**Solution**: Verify the ID exists by listing resources first.

```bash
# Check if report exists
GET /api/v1/reports/1

# If 404, the report doesn't exist
```

---

### 4. Database Connection Error (500 Error)

**Error Message**: `"Could not connect to database"` or timeout errors

**Cause**: Database (Supabase) is unreachable or credentials are wrong.

**Solution**:
1. Check `.env` file has correct `DATABASE_URL`
2. Verify Supabase is accessible: `ping db.vpezoirvcclpnbibeoes.supabase.co`
3. Check docker-compose uses `network_mode: host`

---

## curl Examples

### Complete Testing Workflow

```bash
BASE_URL="http://localhost:8000/api/v1"

# 1. Health check
curl -X GET http://localhost:8000/health

# 2. Create a pre-market report
curl -X POST "$BASE_URL/reports/" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-11",
    "symbol": "EURUSD",
    "htf_bias": "BULLISH",
    "htf_dealing_range_high": 1.0950,
    "htf_dealing_range_low": 1.0850,
    "htf_key_levels": {
      "order_blocks": [{"high": 1.0920, "low": 1.0910, "type": "bullish"}],
      "fvgs": [{"high": 1.0900, "low": 1.0890}]
    },
    "ltf_structure": "higher_highs_higher_lows",
    "ltf_entry_zones": [{"high": 1.0885, "low": 1.0875}],
    "target_sessions": ["LONDON_OPEN"],
    "narrative": "Bullish setup",
    "trade_plan": {
      "direction": "long",
      "entry_zone": {"high": 1.0885, "low": 1.0875},
      "targets": [1.0920]
    },
    "confidence": 0.85
  }'
# Save the returned "id" value (e.g., 1)

# 3. Create an entry setup (using report_id from step 2)
curl -X POST "$BASE_URL/setups/" \
  -H "Content-Type: application/json" \
  -d '{
    "report_id": 1,
    "session": "LONDON_OPEN",
    "symbol": "EURUSD",
    "timeframe": "5m",
    "direction": "long",
    "entry_price": 1.0880,
    "stop_loss": 1.0865,
    "target_1": 1.0920,
    "setup_type": "fvg_retracement",
    "confluence_factors": ["FVG filled", "Order block"],
    "risk_reward": 2.67
  }'
# Save the returned "id" value (e.g., 1)

# 4. Create a trade (using setup_id from step 3)
curl -X POST "$BASE_URL/trades/" \
  -H "Content-Type: application/json" \
  -d '{
    "setup_id": 1,
    "symbol": "EURUSD",
    "date": "2025-11-11",
    "session": "LONDON_OPEN",
    "entry_time": "2025-11-11T08:15:00Z",
    "entry_price": 1.0880,
    "position_size": 1.0,
    "direction": "long",
    "stop_loss": 1.0865,
    "target_1": 1.0920
  }'
# Save the returned "id" value (e.g., 1)

# 5. Update the trade with exit details
curl -X PATCH "$BASE_URL/trades/1" \
  -H "Content-Type: application/json" \
  -d '{
    "exit_time": "2025-11-11T10:30:00Z",
    "exit_price": 1.0920,
    "target_1_hit": true,
    "pnl": 40.0,
    "status": "CLOSED_WIN"
  }'

# 6. Create a coach session
curl -X POST "$BASE_URL/coach/sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "phase": "post_market",
    "related_date": "2025-11-11",
    "related_trade_id": 1
  }'
# Save the returned "session_id" (e.g., "coach_abc123")

# 7. Chat with the coach
curl -X POST "$BASE_URL/coach/sessions/coach_abc123/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "user",
    "content": "Can you analyze my trade from today?"
  }'

# 8. Create an alert
curl -X POST "$BASE_URL/alerts/" \
  -H "Content-Type: application/json" \
  -d '{
    "alert_type": "ENTRY",
    "symbol": "EURUSD",
    "timeframe": "5m",
    "title": "Setup triggered",
    "message": "Entry setup has been triggered",
    "priority": 2,
    "related_setup_id": 1
  }'

# 9. Get all unread alerts
curl -X GET "$BASE_URL/alerts/?is_read=false"

# 10. Mark alert as read
curl -X PATCH "$BASE_URL/alerts/1/read"
```

---

## Testing with Swagger UI

The easiest way to test the API is through Swagger UI at `http://localhost:8000/docs`:

### Steps:

1. **Open Swagger UI**: Navigate to `http://localhost:8000/docs` in your browser

2. **Expand an endpoint**: Click on any endpoint to see details

3. **Click "Try it out"**: This enables the request form

4. **Fill in the request body**:
   - Swagger shows the schema with examples
   - Required fields are marked with `*`
   - You can use the example values as a starting point

5. **Execute**: Click the "Execute" button

6. **View response**:
   - Response body shows the returned data
   - Response headers and status code are displayed
   - Any errors will be shown with details

### Tips:

- Start with `/health` to verify the API is running
- Follow the [Testing Workflow](#testing-workflow) order to avoid foreign key errors
- Copy IDs from responses to use in subsequent requests
- Use the "Models" section at the bottom to see all schemas

---

## Architecture Notes

### How Endpoints are Defined

All endpoints follow this structure:

1. **Router files** ([app/api/endpoints/](backend/app/api/endpoints/)) define the HTTP endpoints
2. **Schema files** ([app/schemas/trading.py](backend/app/schemas/trading.py)) define request/response models using Pydantic
3. **Model files** ([app/models/trading.py](backend/app/models/trading.py)) define database tables using SQLAlchemy
4. **Service files** ([app/services/](backend/app/services/)) contain business logic

**Example flow for creating a report:**

```
Client Request
  ↓
POST /api/v1/reports/  (reports.py router)
  ↓
Validates against PreMarketReportCreate schema
  ↓
Creates PreMarketReport database model
  ↓
Commits to PostgreSQL (Supabase)
  ↓
Returns PreMarketReportResponse schema
  ↓
Client receives JSON response
```

### Database Tables Created

On startup, the backend automatically creates these tables:
- `pre_market_reports`
- `entry_setups`
- `trades`
- `daily_metrics`
- `coach_sessions`
- `alerts`

You can verify table creation in the logs:
```
✅ Database initialized
INFO: Created table: pre_market_reports
INFO: Created table: entry_setups
...
```

---

## Next Steps

1. **Test each endpoint** following the recommended workflow
2. **Check logs** for any errors: `docker-compose logs -f backend`
3. **Integrate with frontend** using these endpoints
4. **Implement background services** (Pre-Market Analyzer, Kill Zone Monitor)
5. **Add authentication** using Supabase JWT

---

## Support

- **API Documentation**: `http://localhost:8000/docs`
- **Environment Config**: [backend/.env](backend/.env)
- **Main Application**: [backend/app/main.py](backend/app/main.py)
- **Schemas**: [backend/app/schemas/trading.py](backend/app/schemas/trading.py)
- **Models**: [backend/app/models/trading.py](backend/app/models/trading.py)
