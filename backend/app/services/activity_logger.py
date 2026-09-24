import logging
from typing import Optional
from sqlalchemy.orm import Session
from app.models.activity_log import ActivityLog

logger = logging.getLogger(__name__)


def log_activity(
    db: Session,
    user: str = "Admin",
    project_name: str = "—",
    module: str = "General",
    action: str = "",
    project_key: Optional[str] = None
) -> Optional[ActivityLog]:
    """Helper to record user/system activity logs to the database."""
    try:
        clean_user = (user or "Admin").strip()
        clean_project = (project_name or "—").strip() if project_name and project_name.strip() else "—"
        log_entry = ActivityLog(
            user=clean_user,
            project_name=clean_project,
            project_key=project_key,
            module=module.strip(),
            action=action.strip(),
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry
    except Exception as e:
        logger.warning(f"Failed to record activity log: {e}")
        try:
            db.rollback()
        except Exception:
            pass
        return None
