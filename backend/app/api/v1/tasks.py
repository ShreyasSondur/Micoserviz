from datetime import date, datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.user import User, UserRole
from app.models.task import Task
from app.models.project import Project
from app.schemas.task import (
    TaskCreate,
    TaskStatusUpdate,
    TaskResponse,
    TaskListResponse,
)

router = APIRouter(prefix="/tasks", tags=["Task Management"])


def get_today_formatted() -> str:
    d = date.today()
    return d.strftime("%d-%m-%Y")


def is_user_allowed_to_modify_task(current_user: User, task: Task) -> bool:
    # Admin / Env Admin can manage
    if current_user.is_env_admin or current_user.role == UserRole.ADMIN.value:
        return True
    
    # Check if assigned to current user by username or email
    user_names = [
        current_user.username.lower(),
        current_user.email.lower(),
    ]
    target = task.raised_to.lower()
    return any(name in target or target in name for name in user_names) or "you" in target


@router.get("", response_model=TaskListResponse)
def list_tasks(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by 'all', 'active', 'completed', 'in_progress', 'not_started'"),
    assigned_to: Optional[str] = Query(None, description="Filter by assignee"),
    search: Optional[str] = Query(None, description="Search title, note, or project"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Task).filter(Task.is_active == True)

    # Status filter
    if status_filter and status_filter.lower() != "all":
        sf = status_filter.lower()
        if sf == "active":
            query = query.filter(Task.status.in_(["not_started", "in_progress"]))
        else:
            query = query.filter(Task.status == sf)

    if assigned_to and assigned_to.strip():
        term = f"%{assigned_to.strip()}%"
        query = query.filter(Task.raised_to.ilike(term))

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (Task.title.ilike(term)) |
            (Task.project_name.ilike(term)) |
            (Task.note.ilike(term)) |
            (Task.raised_to.ilike(term))
        )

    items = query.order_by(Task.id.desc()).all()

    # Counts
    all_active_query = db.query(Task).filter(Task.is_active == True)
    total_count = all_active_query.count()
    active_count = all_active_query.filter(Task.status.in_(["not_started", "in_progress"])).count()
    completed_count = all_active_query.filter(Task.status == "completed").count()

    return TaskListResponse(
        items=[TaskResponse.model_validate(t) for t in items],
        total_count=total_count,
        active_count=active_count,
        completed_count=completed_count,
    )


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.title.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task title is required.",
        )
    if not payload.raised_to.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task assignee (Raised To) is required.",
        )

    # Resolve project name if project_key is provided
    proj_name = payload.project_name
    if payload.project_key and not proj_name:
        proj = db.query(Project).filter(Project.project_key == payload.project_key).first()
        if proj:
            proj_name = proj.name

    new_task = Task(
        title=payload.title.strip(),
        raised_by=current_user.username or "Admin",
        raised_to=payload.raised_to.strip(),
        project_key=payload.project_key,
        project_name=proj_name,
        priority=payload.priority.lower() if payload.priority else "medium",
        note=payload.note.strip() if payload.note else None,
        status="not_started",
        raised_date=get_today_formatted(),
        is_active=True,
    )

    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return TaskResponse.model_validate(new_task)


@router.put("/{task_id}/status", response_model=TaskResponse)
def update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id, Task.is_active == True).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )

    # Permission check: Only assigned user (or Admin) can modify task status
    if not is_user_allowed_to_modify_task(current_user, task):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned user or an administrator can update this task's status.",
        )

    new_status = payload.status.lower().strip()
    valid_statuses = ["not_started", "in_progress", "completed"]
    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}",
        )

    # STRICT RULE: Once Completed, task cannot go back to In Progress or Not Started
    if task.status == "completed" and new_status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task is already Completed and cannot be reverted back to In Progress or Not Started.",
        )

    today_str = get_today_formatted()

    if new_status == "in_progress":
        if not task.started_date:
            task.started_date = today_str
    elif new_status == "completed":
        if not task.started_date:
            task.started_date = today_str
        task.completed_date = today_str

    task.status = new_status
    db.commit()
    db.refresh(task)
    return TaskResponse.model_validate(task)


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id, Task.is_active == True).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )

    task.is_active = False
    db.commit()
    return {"message": "Task removed successfully", "id": task_id}
