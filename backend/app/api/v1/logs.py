from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.activity_log import ActivityLog
from app.schemas.activity_log import ActivityLogCreate, ActivityLogResponse
from app.services.activity_logger import log_activity

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("", response_model=List[ActivityLogResponse])
def get_activity_logs(
    limit: int = Query(300, ge=1, le=1000),
    module: Optional[str] = None,
    project_key: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(ActivityLog)
    if module and module.strip():
        query = query.filter(ActivityLog.module == module.strip())
    if project_key and project_key.strip():
        query = query.filter(ActivityLog.project_key == project_key.strip())
    
    logs = query.order_by(ActivityLog.id.desc()).limit(limit).all()
    
    return [
        ActivityLogResponse(
            id=l.id,
            user=l.user,
            projectName=l.project_name or "—",
            projectKey=l.project_key,
            module=l.module,
            action=l.action,
            time=l.time_str,
            created_at=l.created_at,
        )
        for l in logs
    ]


@router.post("", response_model=ActivityLogResponse, status_code=status.HTTP_201_CREATED)
def create_activity_log(
    payload: ActivityLogCreate,
    db: Session = Depends(get_db)
):
    log_entry = log_activity(
        db=db,
        user=payload.user or "Admin",
        project_name=payload.project_name or "—",
        module=payload.module,
        action=payload.action,
        project_key=payload.project_key
    )
    if not log_entry:
        log_entry = ActivityLog(
            id=0,
            user=payload.user or "Admin",
            project_name=payload.project_name or "—",
            module=payload.module,
            action=payload.action
        )
    return ActivityLogResponse(
        id=log_entry.id,
        user=log_entry.user,
        projectName=log_entry.project_name,
        projectKey=log_entry.project_key,
        module=log_entry.module,
        action=log_entry.action,
        time=log_entry.time_str,
        created_at=log_entry.created_at,
    )
