from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.session import SessionLocal
from app.db.init_db import init_db
from app.api.v1 import api_v1_router
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("microservice_erp")


import asyncio
from app.services.b2_storage import b2_storage
from app.services.archiver import archive_all_daily_data

async def _periodic_b2_archiver():
    """Background task that runs daily archiving periodically (every 4 hours and on startup)."""
    while True:
        try:
            logger.info("Running automated Backblaze B2 daily archiving check...")
            archive_all_daily_data()
            logger.info("Automated Backblaze B2 daily archiving completed.")
        except Exception as e:
            logger.warning(f"Error in periodic B2 archiving task: {e}")
        # Sleep for 4 hours (14,400 seconds)
        await asyncio.sleep(14400)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database tables and seed .env admin
    logger.info("Initializing MicroService ERP Database & Admin Credentials...")
    db = SessionLocal()
    try:
        init_db(db)
        logger.info("Database and Admin sync complete.")
    finally:
        db.close()

    # Check Backblaze connection
    b2_stat = b2_storage.check_connection()
    logger.info(f"Backblaze B2 Status: {b2_stat.get('message')} (Bucket: {b2_stat.get('bucket')})")

    # Start periodic background archiver task
    archiver_task = asyncio.create_task(_periodic_b2_archiver())

    yield

    # Shutdown
    archiver_task.cancel()
    logger.info("Shutting down MicroService ERP Backend.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Configure CORS dynamically from settings (.env) + regex for local development
cors_origins = [str(origin).rstrip("/") for origin in settings.BACKEND_CORS_ORIGINS]
for default_origin in [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]:
    if default_origin not in cors_origins:
        cors_origins.append(default_origin)

logger.info(f"Loaded CORS allowed origins: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|.*\.vercel\.app|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|\[::1\])(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Register API routes
app.include_router(api_v1_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "database": "connected",
        "version": "2.0.0"
    }


@app.get("/", tags=["Health"])
def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME} API v2.0",
        "docs": "/docs",
        "health": "/health"
    }
