# Backend Setup Guide

## Quick Start - Get Missing Supabase Keys

You need 2 keys from Supabase Dashboard to complete the setup:

### 1. Get SUPABASE_KEY (Anon Public Key)

**Steps:**
1. Go to https://supabase.com/dashboard
2. Select your project: **vpezoirvcclpnbibeoes**
3. Click **Settings** (gear icon) → **API**
4. Copy the **"anon public"** key (starts with `eyJhbGciOiJIUzI1NiIs...`)

**Screenshot location:**
```
Settings → API → Project API keys → anon public
```

### 2. Get DATABASE_URL (Database Password)

**Steps:**
1. In Supabase Dashboard → **Settings** → **Database**
2. Scroll to **Connection string**
3. Select **URI** tab
4. Copy the connection string
5. **Important**: Replace `[YOUR-PASSWORD]` with your actual database password

**Format will be:**
```
postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**Convert to asyncpg format:**
```
postgresql+asyncpg://postgres:[password]@db.vpezoirvcclpnbibeoes.supabase.co:5432/postgres
```

---

## Complete Setup Steps

### 1. Copy Environment File

```bash
cd backend
cp .env.example .env
```

### 2. Edit .env File

Open `backend/.env` and update these values:

```bash
# Already filled from frontend:
SUPABASE_URL=https://vpezoirvcclpnbibeoes.supabase.co ✅
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs... ✅
OPENAI_API_KEY=sk-proj-aKki7CnC... ✅
GEMINI_API_KEY=<your-gemini-api-key>

# GET FROM SUPABASE DASHBOARD:
SUPABASE_KEY=<paste-anon-public-key-here>
DATABASE_URL=postgresql+asyncpg://postgres:<your-password>@db.vpezoirvcclpnbibeoes.supabase.co:5432/postgres

# GENERATE NEW SECRET:
SECRET_KEY=<run: openssl rand -hex 32>
```

### 3. Generate SECRET_KEY

```bash
# On Mac/Linux:
openssl rand -hex 32

# Copy the output and paste into .env as SECRET_KEY
```

### 4. Install Dependencies

```bash
# Create virtual environment
python -m venv venv

# Activate it
source venv/bin/activate  # Mac/Linux
# OR
venv\Scripts\activate  # Windows

# Install packages
pip install -r requirements.txt
```

### 5. Initialize Database

The backend will use your **existing Supabase database** from the frontend. It will create additional tables:
- `pre_market_reports`
- `entry_setups`
- `trades`
- `daily_metrics`
- `coach_sessions`
- `alerts`

Your existing frontend tables (`trades_data`, `trade_notes`) will remain unchanged.

### 6. Start Backend

**Option A: Direct Python (Development)**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Option B: Docker (Recommended)**
```bash
docker-compose up -d
```

### 7. Verify It's Running

Open browser:
- **Health Check**: http://localhost:8000/health
- **API Docs**: http://localhost:8000/docs
- **API Root**: http://localhost:8000/

You should see:
```json
{
  "status": "healthy",
  "app": "ICT Trading Agent Backend",
  "version": "1.0.0",
  "environment": "development"
}
```

---

## Troubleshooting

### Error: "Could not connect to database"

**Check:**
1. DATABASE_URL is correct
2. Password has no special characters that need escaping
3. Your IP is allowed in Supabase (Settings → Database → Connection pooling)

**Solution:**
```bash
# Test connection
psql "postgresql://postgres:[password]@db.vpezoirvcclpnbibeoes.supabase.co:5432/postgres"
```

### Error: "SUPABASE_KEY validation error"

**Check:**
1. You copied the **anon** key, not the service_role key
2. The key is complete (no truncation)

### Error: "OpenAI API error"

**Check:**
1. OPENAI_API_KEY is valid
2. You have API credits
3. Key has proper permissions

---

## What's Already Configured

✅ **From Frontend .env.local:**
- Alpha Vantage API key
- OpenAI API key
- Supabase URL
- Supabase Service Role Key

✅ **Backend-Specific:**
- CORS origins (allows localhost:3000)
- API prefix (/api/v1)
- Feature flags enabled
- Debug mode on

---

## Next Steps After Setup

1. **Test API**: http://localhost:8000/docs
2. **Run Analysis**: Try the `/api/v1/analysis/run` endpoint
3. **Integrate with Frontend**: Update frontend to call backend endpoints
4. **Enable Background Jobs**: Pre-market analyzer runs at 6 AM

---

## Environment Variables Reference

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `SUPABASE_URL` | Your Supabase project URL | Dashboard → Settings → API |
| `SUPABASE_KEY` | Public anon key | Dashboard → Settings → API (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key | Dashboard → Settings → API (service_role) |
| `DATABASE_URL` | Direct PostgreSQL connection | Dashboard → Settings → Database |
| `OPENAI_API_KEY` | OpenAI API key | platform.openai.com/api-keys |
| `GEMINI_API_KEY` | Google AI Studio key (`gemini-3-pro-preview`) | ai.google.dev/gemini-api |
| `SECRET_KEY` | JWT signing key | Generate: `openssl rand -hex 32` |

---

## Support

- Backend API Docs: http://localhost:8000/docs
- Supabase Docs: https://supabase.com/docs
- FastAPI Docs: https://fastapi.tiangolo.com/
