from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.manpower import Manpower
from app.schemas.manpower import (
    ManpowerCreate,
    ManpowerUpdate,
    ManpowerResponse,
    ManpowerListResponse,
    ManpowerMetrics,
)

router = APIRouter(prefix="/manpower", tags=["Manpower Management"])


def compute_manpower_metrics(db: Session) -> ManpowerMetrics:
    total = db.query(Manpower).filter(Manpower.is_active == True).count()
    internal = db.query(Manpower).filter(
        Manpower.is_active == True,
        Manpower.type == "Internal"
    ).count()
    external = db.query(Manpower).filter(
        Manpower.is_active == True,
        Manpower.type == "External"
    ).count()
    return ManpowerMetrics(
        total=total,
        internal=internal,
        external=external,
    )


@router.get("", response_model=ManpowerListResponse)
def list_manpower(
    search: Optional[str] = Query(None, description="Search worker name"),
    type: Optional[str] = Query(None, description="Filter by Internal or External"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Manpower).filter(Manpower.is_active == True)

    if search and search.strip():
        query = query.filter(Manpower.name.ilike(f"%{search.strip()}%"))

    if type and type.strip() and type.strip().upper() != "ALL":
        query = query.filter(Manpower.type.ilike(type.strip()))

    items = query.order_by(Manpower.created_at.desc()).all()
    metrics = compute_manpower_metrics(db)

    return ManpowerListResponse(
        items=[ManpowerResponse.model_validate(i) for i in items],
        metrics=metrics,
    )


@router.get("/metrics", response_model=ManpowerMetrics)
def get_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return compute_manpower_metrics(db)


@router.post("", response_model=ManpowerResponse, status_code=status.HTTP_201_CREATED)
def create_manpower(
    request: ManpowerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = request.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Worker name is required",
        )

    norm_type = "External" if request.type.strip().lower() == "external" else "Internal"

    new_worker = Manpower(
        name=name,
        type=norm_type,
        is_active=True,
    )
    db.add(new_worker)
    db.commit()
    db.refresh(new_worker)
    return ManpowerResponse.model_validate(new_worker)


@router.put("/{manpower_id}", response_model=ManpowerResponse)
def update_manpower(
    manpower_id: str,
    request: ManpowerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    worker = db.query(Manpower).filter(Manpower.id == manpower_id, Manpower.is_active == True).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worker not found",
        )

    if request.name is not None and request.name.strip():
        worker.name = request.name.strip()

    if request.type is not None and request.type.strip():
        worker.type = "External" if request.type.strip().lower() == "external" else "Internal"

    if request.is_active is not None:
        worker.is_active = request.is_active

    db.commit()
    db.refresh(worker)
    return ManpowerResponse.model_validate(worker)


@router.delete("/{manpower_id}")
def delete_manpower(
    manpower_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    worker = db.query(Manpower).filter(Manpower.id == manpower_id, Manpower.is_active == True).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worker not found",
        )

    worker.is_active = False
    db.commit()
    return {"message": f"Worker {worker.name} successfully removed", "id": manpower_id}


@router.get("/attendance")
def get_manpower_attendance(
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    type: Optional[str] = Query(None, description="Filter by Internal or External or ALL"),
    search: Optional[str] = Query(None, description="Search worker name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.project import ProjectResourceItem

    # 1. Fetch active manpower
    query_manpower = db.query(Manpower).filter(Manpower.is_active == True)
    if search and search.strip():
        query_manpower = query_manpower.filter(Manpower.name.ilike(f"%{search.strip()}%"))
    if type and type.strip() and type.strip().upper() != "ALL":
        query_manpower = query_manpower.filter(Manpower.type.ilike(type.strip()))

    workers = query_manpower.order_by(Manpower.name.asc()).all()

    # 2. Query ProjectResourceItem allocations
    res_query = db.query(ProjectResourceItem)
    if start_date and start_date.strip():
        res_query = res_query.filter(ProjectResourceItem.date >= start_date.strip())
    if end_date and end_date.strip():
        res_query = res_query.filter(ProjectResourceItem.date <= end_date.strip())

    records = res_query.all()

    # Build attendance map: worker_name_lower -> { date: total_hours }
    # Also keep track of all distinct dates where work occurred
    attendance_map = {}
    distinct_dates_worked = set()

    for r in records:
        if not r.name or not r.date:
            continue
        key = r.name.strip().lower()
        d_str = r.date.strip()
        distinct_dates_worked.add(d_str)
        if key not in attendance_map:
            attendance_map[key] = {}
        attendance_map[key][d_str] = attendance_map[key].get(d_str, 0) + (r.hours_worked or 8)

    return {
        "workers": [
            {
                "id": w.id,
                "name": w.name,
                "type": w.type,
                "created_at": w.created_at.isoformat() if w.created_at else None,
            }
            for w in workers
        ],
        "attendance_map": attendance_map,
        "distinct_dates_worked": sorted(list(distinct_dates_worked)),
    }
