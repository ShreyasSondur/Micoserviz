from sqlalchemy import text
from sqlalchemy.orm import Session
from app.config import settings
from app.db.session import Base, engine, SessionLocal
import app.models  # Ensures all model tables are registered with Base.metadata
from app.models.user import User, UserRole
from app.core.security import get_password_hash
import logging

logger = logging.getLogger(__name__)


def _apply_db_safeguards():
    """Apply safe backward-compatible column/table migrations for both PostgreSQL and SQLite without data loss."""
    is_postgres = engine.dialect.name == "postgresql"

    with engine.connect() as conn:
        # 1. Projects table new columns
        project_columns = [
            ("commercial_status", "VARCHAR(50) DEFAULT 'not_started'"),
            ("engineering_status", "VARCHAR(50) DEFAULT 'not_started'"),
            ("budget_status", "VARCHAR(50) DEFAULT 'not_started'"),
            ("procurement_status", "VARCHAR(50) DEFAULT 'not_started'"),
            ("soa_status", "VARCHAR(50) DEFAULT 'not_started'"),
            ("resource_status", "VARCHAR(50) DEFAULT 'not_started'"),
            ("site_execution_status", "VARCHAR(50) DEFAULT 'not_started'"),
            ("handover_status", "VARCHAR(50) DEFAULT 'not_started'"),
            ("verified_progress_percentage", "FLOAT DEFAULT 0.0"),
            ("description", "TEXT DEFAULT ''"),
            ("is_completed", "BOOLEAN DEFAULT FALSE"),
            ("completed_at", "VARCHAR(50)"),
        ]

        for col_name, col_type in project_columns:
            try:
                if is_postgres:
                    conn.execute(text(f"ALTER TABLE projects ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
                else:
                    conn.execute(text(f"ALTER TABLE projects ADD COLUMN {col_name} {col_type}"))
                conn.commit()
            except Exception:
                pass

        # 2. Costing items new columns
        try:
            if is_postgres:
                conn.execute(text("ALTER TABLE project_costing_items ADD COLUMN IF NOT EXISTS allocated_qty FLOAT DEFAULT 0.0"))
            else:
                conn.execute(text("ALTER TABLE project_costing_items ADD COLUMN allocated_qty FLOAT DEFAULT 0.0"))
            conn.commit()
        except Exception:
            pass

        # 3. Resource items new columns
        try:
            if is_postgres:
                conn.execute(text("ALTER TABLE project_resource_items ADD COLUMN IF NOT EXISTS date VARCHAR(50)"))
            else:
                conn.execute(text("ALTER TABLE project_resource_items ADD COLUMN date VARCHAR(50)"))
            conn.commit()
        except Exception:
            pass

        # 4. SOA items new columns
        soa_columns = [
            ("stage_number", "INTEGER DEFAULT 1"),
            ("document_url", "TEXT DEFAULT ''"),
            ("document_name", "VARCHAR(255) DEFAULT ''"),
            ("document_size", "VARCHAR(50) DEFAULT ''"),
        ]
        for col_name, col_type in soa_columns:
            try:
                if is_postgres:
                    conn.execute(text(f"ALTER TABLE project_soa_items ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
                else:
                    conn.execute(text(f"ALTER TABLE project_soa_items ADD COLUMN {col_name} {col_type}"))
                conn.commit()
            except Exception:
                pass

        # 5. Site Execution logs new columns & table
        try:
            if is_postgres:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS project_site_execution_logs (
                        id SERIAL PRIMARY KEY,
                        project_key VARCHAR(50) NOT NULL,
                        date VARCHAR(50) NOT NULL,
                        supervisor_name VARCHAR(150) DEFAULT 'Site Supervisor',
                        creator_role VARCHAR(50) DEFAULT 'Site Supervisor',
                        phase_name VARCHAR(200) DEFAULT 'Daily Site Progress',
                        description TEXT DEFAULT '',
                        images_json TEXT DEFAULT '[]',
                        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (project_key) REFERENCES projects(project_key)
                    )
                """))
            else:
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
            if is_postgres:
                conn.execute(text("ALTER TABLE project_site_execution_logs ADD COLUMN IF NOT EXISTS creator_role VARCHAR(50) DEFAULT 'Site Supervisor'"))
            else:
                conn.execute(text("ALTER TABLE project_site_execution_logs ADD COLUMN creator_role VARCHAR(50) DEFAULT 'Site Supervisor'"))
            conn.commit()
        except Exception:
            pass

        # 6. Activity logs table
        try:
            if is_postgres:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS activity_logs (
                        id SERIAL PRIMARY KEY,
                        "user" VARCHAR(150) NOT NULL DEFAULT 'Admin',
                        project_name VARCHAR(200) NOT NULL DEFAULT '—',
                        project_key VARCHAR(100),
                        module VARCHAR(100) NOT NULL,
                        action TEXT NOT NULL,
                        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """))
            else:
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

        # 7. Procurement items table
        try:
            if is_postgres:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS project_procurement_items (
                        id SERIAL PRIMARY KEY,
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
                        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (project_key) REFERENCES projects(project_key)
                    )
                """))
            else:
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

        # 8. Costing proposals table
        try:
            if is_postgres:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS project_costing_proposals (
                        id SERIAL PRIMARY KEY,
                        project_key VARCHAR(50) NOT NULL,
                        change_type VARCHAR(20) NOT NULL,
                        costing_item_id INTEGER,
                        proposed_by_name VARCHAR(100) DEFAULT 'Team Member',
                        proposed_by_role VARCHAR(100) DEFAULT 'User',
                        original_data_json TEXT DEFAULT '{}',
                        proposed_data_json TEXT DEFAULT '{}',
                        status VARCHAR(30) DEFAULT 'pending',
                        notes VARCHAR(255) DEFAULT '',
                        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        reviewed_at TIMESTAMP WITHOUT TIME ZONE,
                        reviewed_by VARCHAR(100),
                        FOREIGN KEY (project_key) REFERENCES projects(project_key)
                    )
                """))
            else:
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

    # 1.1 Apply universal safeguards to add missing columns without data loss
    _apply_db_safeguards()

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




