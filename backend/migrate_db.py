"""
Standalone Safe Database Migration Script for MicroService ERP.
Adds all missing columns and tables to existing PostgreSQL/SQLite DB without dropping tables or losing data.
"""

import sys
import logging
from sqlalchemy import text
from app.db.session import engine, SessionLocal
from app.db.init_db import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

def run_migration():
    logger.info(f"Connecting to database (Engine: {engine.dialect.name})...")
    db = SessionLocal()
    try:
        init_db(db)
        logger.info("✓ Universal database migration & safeguard check completed successfully!")
    except Exception as e:
        logger.error(f"Migration error: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
