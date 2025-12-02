"""
Main FastAPI application for ICT Trading Agent Backend.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import init_db, close_db
from app.api.endpoints import analysis, reports, setups, trades, coach, alerts, market
from app.services.scheduler import scheduler_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan events.
    Handles startup and shutdown tasks.
    """
    # Startup
    print(f"🚀 Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"📊 Environment: {settings.ENVIRONMENT}")

    # Initialize database
    await init_db()
    print("✅ Database initialized")

    # Start scheduler for pre-market routine
    scheduler_service.start()

    # TODO: Initialize Redis connection

    yield

    # Shutdown
    print("🛑 Shutting down...")

    # Stop scheduler
    scheduler_service.shutdown()

    # Close database
    await close_db()
    print("✅ Database connections closed")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Backend API for ICT trading agent system with LangChain integration",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "ICT Trading Agent Backend API",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/health",
    }


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    if settings.DEBUG:
        import traceback
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "detail": str(exc),
                "traceback": traceback.format_exc(),
            }
        )
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"}
    )


# Include routers
app.include_router(
    analysis.router,
    prefix=f"{settings.API_PREFIX}/analysis",
    tags=["ICT Analysis"]
)
app.include_router(
    reports.router,
    prefix=f"{settings.API_PREFIX}/reports",
    tags=["Pre-Market Reports"]
)
app.include_router(
    setups.router,
    prefix=f"{settings.API_PREFIX}/setups",
    tags=["Entry Setups"]
)
app.include_router(
    trades.router,
    prefix=f"{settings.API_PREFIX}/trades",
    tags=["Trades"]
)
app.include_router(
    coach.router,
    prefix=f"{settings.API_PREFIX}/coach",
    tags=["AI Coach"]
)
app.include_router(
    alerts.router,
    prefix=f"{settings.API_PREFIX}/alerts",
    tags=["Alerts"]
)
app.include_router(
    market.router,
    prefix=f"{settings.API_PREFIX}/market",
    tags=["Market Data"]
)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
