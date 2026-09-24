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


def init_db(db: Session) -> None:
    # 1. Create tables natively via SQLAlchemy models
    Base.metadata.create_all(bind=engine)

    # 1.1 Run SQLite backward compatibility guards only if SQLite dialect
    if engine.dialect.name == "sqlite":
        _apply_sqlite_safeguards()

    # 2. Sync Admin from .env
    admin_user = db.query(User).filter(
        (User.username == settings.ADMIN_USERNAME) |
        (User.email == settings.ADMIN_EMAIL) |
        (User.is_env_admin == True)
    ).first()

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
        # Update credentials to match .env if changed
        admin_user.username = settings.ADMIN_USERNAME
        admin_user.email = settings.ADMIN_EMAIL
        admin_user.hashed_password = get_password_hash(settings.ADMIN_PASSWORD)
        admin_user.role = UserRole.ADMIN.value
        admin_user.is_active = True
        admin_user.is_env_admin = True
        db.commit()
        logger.info(f"Synchronized Admin credentials from .env for: {admin_user.username}")

    # 3. Seed initial team users if table only contains admin
    total_users = db.query(User).count()
    if total_users <= 1:
        initial_team = [
            {
                "username": "sheikh_nayaaz",
                "email": "Sheikhnayaaz@gmail.com",
                "password": "Password@123",
                "role": UserRole.PROJECT_MANAGER.value,
            },
            {
                "username": "shreyas_u",
                "email": "ShreyasU@gmail.com",
                "password": "Password@123",
                "role": UserRole.PROCUREMENT.value,
            },
            {
                "username": "shawaz_hussain",
                "email": "Shawazhussain@gmail.com",
                "password": "Password@123",
                "role": UserRole.SITE_SUPERVISOR.value,
            },
        ]
        for member in initial_team:
            existing = db.query(User).filter(User.email == member["email"]).first()
            if not existing:
                u = User(
                    username=member["username"],
                    email=member["email"],
                    hashed_password=get_password_hash(member["password"]),
                    role=member["role"],
                    is_active=True,
                    is_env_admin=False,
                )
                db.add(u)
        db.commit()
        logger.info("Seeded initial team members.")

    # 4. Seed initial Manpower personnel if table is empty
    from app.models.manpower import Manpower
    total_manpower = db.query(Manpower).count()
    if total_manpower == 0:
        initial_manpower = [
            {"name": "Ahmed Al-Mansoor", "type": "Internal"},
            {"name": "Vikram Patel", "type": "External"},
            {"name": "Rahul Sharma", "type": "Internal"},
            {"name": "Tariq Mahmood", "type": "External"},
            {"name": "Suresh Kumar", "type": "Internal"},
            {"name": "Zayd Siddiqui", "type": "External"},
        ]
        for item in initial_manpower:
            m = Manpower(
                name=item["name"],
                type=item["type"],
                is_active=True,
            )
            db.add(m)
        db.commit()
    # 5. Seed single default Project if table is empty
    from app.models.project import Project, CommercialApprovalStage, EngineeringDocumentationStage
    total_projects = db.query(Project).count()
    if total_projects == 0:
        p = Project(
            project_key="p1",
            name="Al Reem Villa - Smart Automation",
            client="Al Reem Holdings Abu Dhabi",
            location="Al Reem Island, Abu Dhabi",
            code="PRJ-2024-001",
            priority="High",
            priority_level="high",
            current_stage=4,
            total_stages=7,
            manager="Farhan Malik",
            supervisor="Site Supervisor 1",
            start_date="15 Jan 2024",
            budget="85,000 AED",
            is_completed=False,
        )
        db.add(p)
        db.commit()
        db.refresh(p)

        s1 = CommercialApprovalStage(
            project_key=p.project_key,
            stage_number=1,
            status="in_progress",
            po_number="",
            po_date="",
            contract_value="",
            is_saved=False,
            documents_json="[]",
        )
        db.add(s1)

        e1 = EngineeringDocumentationStage(
            project_key=p.project_key,
            stage_number=1,
            status="in_progress",
            documents_json="[]",
        )
        db.add(e1)
        db.commit()
        logger.info("Seeded single default project: Al Reem Villa with Commercial & Engineering stages.")

    # 6. Seed Invoices if table has few records or is empty
    from app.models.invoice import Invoice
    total_invoices = db.query(Invoice).count()

    if total_invoices <= 1:
        initial_invoices = [
            {"invoice_number": "INV-2026-081", "vendor": "Schneider Electric UAE", "invoice_date": "2026-05-02", "total_amount": 50000.0},
            {"invoice_number": "INV-2026-088", "vendor": "ABB Automation Middle East", "invoice_date": "2026-05-14", "total_amount": 25000.0},
            {"invoice_number": "INV-2026-095", "vendor": "Ducab Cables Dubai", "invoice_date": "2026-05-18", "total_amount": 4200.0},
            {"invoice_number": "INV-2026-102", "vendor": "Siemens Building Technologies", "invoice_date": "2026-06-01", "total_amount": 12000.0},
            {"invoice_number": "INV-2026-110", "vendor": "Lutron Electronics UAE", "invoice_date": "2026-06-06", "total_amount": 18500.0},
        ]
        for inv_data in initial_invoices:
            exists = db.query(Invoice).filter(Invoice.invoice_number.ilike(inv_data["invoice_number"])).first()
            if not exists:
                inv = Invoice(
                    invoice_number=inv_data["invoice_number"],
                    vendor=inv_data["vendor"],
                    invoice_date=inv_data["invoice_date"],
                    total_amount=inv_data["total_amount"],
                    currency="AED",
                    status="Verified",
                    is_active=True,
                )
                db.add(inv)
        db.commit()

    # 7. Seed Petty Cash Transactions if empty
    from app.models.cashflow import PettyCashTransaction, CreditLoanItem
    petty_count = db.query(PettyCashTransaction).count()
    if petty_count == 0:
        initial_petty = [
            {"type": "Cash In", "amount": 50000.0, "invoice_number": "INV-2026-081", "description": "Initial petty cash replenishment float", "date": "2026-05-02"},
            {"type": "Cash In", "amount": 25000.0, "invoice_number": "INV-2026-088", "description": "Client on-site milestone cash advance", "date": "2026-05-14"},
            {"type": "Cash Out", "amount": 4200.0, "invoice_number": "INV-2026-095", "description": "Emergency electrical conduits and terminal blocks", "date": "2026-05-18"},
            {"type": "Cash Out", "amount": 1850.0, "invoice_number": None, "description": "Express van logistics and technician fuel vouchers", "date": "2026-05-22"},
            {"type": "Cash In", "amount": 12000.0, "invoice_number": "INV-2026-102", "description": "Subcontractor retention deposit release", "date": "2026-06-01"},
            {"type": "Cash Out", "amount": 3400.0, "invoice_number": "INV-2026-110", "description": "Specialized cable testers and field calibration kit", "date": "2026-06-06"},
        ]
        for p_item in initial_petty:
            tx = PettyCashTransaction(
                type=p_item["type"],
                amount=p_item["amount"],
                invoice_number=p_item["invoice_number"],
                description=p_item["description"],
                date=p_item["date"],
                is_active=True,
            )
            db.add(tx)
        db.commit()

    # 8. Seed Credit & Loans if empty
    loans_count = db.query(CreditLoanItem).count()
    if loans_count == 0:
        initial_loans = [
            {"description": "Corporate Visa - Automation Hardware Procurement", "amount": 18500.0, "invoice_number": "INV-2026-110", "date": "2026-05-10"},
            {"description": "Equipment Bridge Loan - Villa 14 Panel Import", "amount": 45000.0, "invoice_number": "INV-2026-081", "date": "2026-05-18"},
            {"description": "Supplier Credit Line - Lutron Keypads & Dimmers", "amount": 22000.0, "invoice_number": "INV-2026-088", "date": "2026-05-25"},
        ]
        for l_item in initial_loans:
            cl = CreditLoanItem(
                description=l_item["description"],
                amount=l_item["amount"],
                invoice_number=l_item["invoice_number"],
                date=l_item["date"],
                is_active=True,
            )
            db.add(cl)
        db.commit()

    # 9. Seed Master Parts if empty
    from app.models.inventory import MasterPart, InventoryItem
    parts_count = db.query(MasterPart).count()
    if parts_count == 0:
        initial_parts = [
            {"part_number": "SE-201", "description": "Acti9 iC60N Miniature Circuit Breaker 2P 16A C-Curve"},
            {"part_number": "ABB-DIM-04", "description": "ABB KNX Universal Dimming Actuator 4-Fold 250W"},
            {"part_number": "DUC-CAT6-ST", "description": "Ducab Cat6 UTP 4-Pair Network Cable 305m Drum"},
            {"part_number": "LUT-KP-06", "description": "Lutron Palladiom 6-Button Keypad White Matte"},
            {"part_number": "SE-RELAY-08", "description": "Schneider Electric SpaceLogic 8-Channel Relay Module"},
        ]
        # Also include any part numbers already present in existing inventory items
        existing_items = db.query(InventoryItem).filter(InventoryItem.is_active == True).all()
        for it in existing_items:
            if it.part_number and not any(p["part_number"].upper() == it.part_number.strip().upper() for p in initial_parts):
                initial_parts.append({"part_number": it.part_number.strip().upper(), "description": f"Master part for {it.product_name}"})

        for p_data in initial_parts:
            pn = p_data["part_number"].strip().upper()
            exists = db.query(MasterPart).filter(MasterPart.part_number.ilike(pn)).first()
            if not exists:
                mp = MasterPart(
                    part_number=pn,
                    description=p_data.get("description", ""),
                    is_active=True,
                )
                db.add(mp)
        db.commit()
        logger.info(f"Seeded initial master parts ({len(initial_parts)} items).")

    # 10. Seed initial Project Resource Allocation items if empty for default project
    from app.models.project import ProjectResourceItem
    resource_count = db.query(ProjectResourceItem).count()
    if resource_count == 0:
        default_proj = db.query(Project).filter(Project.project_key == "p1").first()
        if default_proj:
            sample_resources = [
                ProjectResourceItem(project_key="p1", sl_no=1, name="Ahmed Al-Mansoor", type="Internal", hours_worked=8),
                ProjectResourceItem(project_key="p1", sl_no=2, name="Vikram Patel", type="External", hours_worked=8),
                ProjectResourceItem(project_key="p1", sl_no=3, name="Rahul Sharma", type="Internal", hours_worked=6),
            ]
    # 11. Seed initial Tasks if table is empty
    from app.models.task import Task
    tasks_count = db.query(Task).count()
    if tasks_count == 0:
        initial_tasks = [
            {
                "title": "Smart HVAC Controller Wiring & Relay Calibration",
                "raised_by": "Admin",
                "raised_to": "Admin",
                "project_key": "p1",
                "project_name": "Al Reem Villa - Smart Automation",
                "priority": "high",
                "note": "Verify dual thermostat interlock relays and calibrate voltage regulators before powering main automation panel.",
                "status": "in_progress",
                "raised_date": "20-05-2026",
                "started_date": "21-05-2026",
            },
            {
                "title": "Lutron Keypad Firmware Upgrade - 2nd Floor Master Suite",
                "raised_by": "Admin",
                "raised_to": "sheikh_nayaaz",
                "project_key": "p1",
                "project_name": "Al Reem Villa - Smart Automation",
                "priority": "medium",
                "note": "Flash v4.2 keypad firmware and test scene triggers for dimming channels.",
                "status": "not_started",
                "raised_date": "22-05-2026",
                "started_date": None,
            },
        ]
        for t_data in initial_tasks:
            task_obj = Task(
                title=t_data["title"],
                raised_by=t_data["raised_by"],
                raised_to=t_data["raised_to"],
                project_key=t_data["project_key"],
                project_name=t_data["project_name"],
                priority=t_data["priority"],
                note=t_data["note"],
                status=t_data["status"],
                raised_date=t_data["raised_date"],
                started_date=t_data["started_date"],
                is_active=True,
            )
            db.add(task_obj)
        db.commit()
        logger.info("Seeded initial active tasks.")

    logger.info("Database initialized successfully.")




