from sqlalchemy import text
from sqlalchemy.orm import Session
from app.config import settings
from app.db.session import Base, engine, SessionLocal
import app.models  # Ensures all model tables are registered with Base.metadata
from app.models.user import User, UserRole
from app.core.security import get_password_hash
import logging

logger = logging.getLogger(__name__)


def _apply_sqlite_safeguards():
    """Apply SQLite specific table/column safeguards if migrating an existing local db."""
    with engine.connect() as conn:
        for col in [
            "commercial_status",
            "engineering_status",
            "budget_status",
            "procurement_status",
            "soa_status",
            "resource_status",
            "site_execution_status",
            "handover_status",
        ]:
            try:
                conn.execute(text(f"ALTER TABLE projects ADD COLUMN {col} VARCHAR(50) DEFAULT 'not_started'"))
                conn.commit()
            except Exception:
                pass

        try:
            conn.execute(text("ALTER TABLE project_costing_items ADD COLUMN allocated_qty FLOAT DEFAULT 0.0"))
            conn.commit()
        except Exception:
            pass

        try:
            conn.execute(text("ALTER TABLE project_resource_items ADD COLUMN date VARCHAR(50)"))
            conn.commit()
        except Exception:
            pass

        for col_def in [
            "stage_number INTEGER DEFAULT 1",
            "document_url TEXT DEFAULT ''",
            "document_name VARCHAR(255) DEFAULT ''",
            "document_size VARCHAR(50) DEFAULT ''",
        ]:
            try:
                conn.execute(text(f"ALTER TABLE project_soa_items ADD COLUMN {col_def}"))
                conn.commit()
            except Exception:
                pass

        try:
            conn.execute(text("ALTER TABLE projects ADD COLUMN verified_progress_percentage FLOAT DEFAULT 0.0"))
            conn.commit()
        except Exception:
            pass

        try:
            conn.execute(text("UPDATE projects SET total_stages = 7 WHERE total_stages != 7 OR total_stages IS NULL"))
            conn.commit()
        except Exception:
            pass

        # Create project_site_execution_logs table if not exists
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS project_site_execution_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_key VARCHAR(50) NOT NULL,
                    date VARCHAR(50) NOT NULL,
                    supervisor_name VARCHAR(150) DEFAULT 'Site Supervisor',
                    creator_role VARCHAR(50) DEFAULT 'Site Supervisor',
                    phase_name VARCHAR(200) DEFAULT 'Daily Site Progress',
                    description TEXT DEFAULT '',
                    images_json TEXT DEFAULT '[]',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_key) REFERENCES projects(project_key)
                )
            """))
            conn.commit()
        except Exception:
            pass

        try:
            conn.execute(text("ALTER TABLE project_site_execution_logs ADD COLUMN creator_role VARCHAR(50) DEFAULT 'Site Supervisor'"))
            conn.commit()
        except Exception:
            pass

        # Create activity_logs table if not exists
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS activity_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user VARCHAR(150) NOT NULL DEFAULT 'Admin',
                    project_name VARCHAR(200) NOT NULL DEFAULT '—',
                    project_key VARCHAR(100),
                    module VARCHAR(100) NOT NULL,
                    action TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.commit()
        except Exception:
            pass

        # Create project_procurement_items table if not exists
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS project_procurement_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_key VARCHAR(50) NOT NULL,
                    sl_no INTEGER DEFAULT 1,
                    part_no VARCHAR(100) NOT NULL DEFAULT '',
                    product_name VARCHAR(255) NOT NULL DEFAULT '',
                    vendor VARCHAR(150) DEFAULT '',
                    brand VARCHAR(150) DEFAULT '',
                    qty FLOAT NOT NULL DEFAULT 1.0,
                    allocated_qty FLOAT NOT NULL DEFAULT 0.0,
                    status VARCHAR(50) NOT NULL DEFAULT 'Yet To Order',
                    invoice_number VARCHAR(100) DEFAULT '',
                    notes TEXT DEFAULT '',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_key) REFERENCES projects(project_key)
                )
            """))
            conn.commit()
        except Exception as e:
            logger.warning(f"Procurement table check: {e}")

        # Create project_costing_proposals table if not exists (Temporary table for non-admin proposed changes)
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS project_costing_proposals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_key VARCHAR(50) NOT NULL,
                    change_type VARCHAR(20) NOT NULL,
                    costing_item_id INTEGER,
                    proposed_by_name VARCHAR(100) DEFAULT 'Team Member',
                    proposed_by_role VARCHAR(100) DEFAULT 'User',
                    original_data_json TEXT DEFAULT '{}',
                    proposed_data_json TEXT DEFAULT '{}',
                    status VARCHAR(30) DEFAULT 'pending',
                    notes VARCHAR(255) DEFAULT '',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    reviewed_at DATETIME,
                    reviewed_by VARCHAR(100),
                    FOREIGN KEY (project_key) REFERENCES projects(project_key)
                )
            """))
            conn.commit()
        except Exception as e:
            logger.warning(f"Costing proposals table check: {e}")


def init_db(db: Session) -> None:
    # 1. Create tables natively via SQLAlchemy models
    Base.metadata.create_all(bind=engine)

    # 1.1 Run SQLite backward compatibility guards only if SQLite dialect
    if engine.dialect.name == "sqlite":
        _apply_sqlite_safeguards()

    # 2. Sync Admin from .env safely without unique constraint collisions
    by_username = db.query(User).filter(User.username == settings.ADMIN_USERNAME).first()
    by_email = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()

    if by_username and by_email and by_username.id != by_email.id:
        from app.models.otp import OTPVerification
        db.query(OTPVerification).filter(OTPVerification.user_id == by_email.id).update(
            {"user_id": by_username.id}, synchronize_session=False
        )
        db.delete(by_email)
        db.flush()
        admin_user = by_username
    elif by_username:
        admin_user = by_username
    elif by_email:
        admin_user = by_email
    else:
        admin_user = db.query(User).filter(User.is_env_admin == True).first()

    if not admin_user:
        admin_user = User(
            username=settings.ADMIN_USERNAME,
            email=settings.ADMIN_EMAIL,
            hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
            role=UserRole.ADMIN.value,
            is_active=True,
            is_env_admin=True,
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        logger.info(f"Initialized Admin account: {admin_user.username} ({admin_user.email})")
    else:
        # Update credentials to match .env
        admin_user.username = settings.ADMIN_USERNAME
        admin_user.email = settings.ADMIN_EMAIL
        admin_user.hashed_password = get_password_hash(settings.ADMIN_PASSWORD)
        admin_user.role = UserRole.ADMIN.value
        admin_user.is_active = True
        admin_user.is_env_admin = True
        db.commit()
        logger.info(f"Synchronized Admin credentials from .env for: {admin_user.username}")

    logger.info("Database initialized successfully in clean production mode.")




