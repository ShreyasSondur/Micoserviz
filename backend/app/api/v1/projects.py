import datetime
import json
import logging
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.project import (
    Project,
    CommercialApprovalStage,
    EngineeringDocumentationStage,
    ProjectCostingItem,
    ProjectProcurementItem,
    ProjectSOAItem,
    ProjectResourceItem,
    ProjectSiteExecutionLog,
)
from app.models.inventory import InventoryItem, MasterPart
from app.schemas.procurement import (
    ProcurementItemCreate,
    ProcurementItemUpdate,
    ProcurementItemResponse,
    ProcurementItemListResponse,
    ProcurementItemShift,
    ProcurementShiftResponse,
)
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    CommercialStageCreate,
    CommercialStageUpdate,
    CommercialStageResponse,
    EngineeringStageCreate,
    EngineeringStageUpdate,
    EngineeringStageResponse,
    DocumentItemSchema,
    CostingItemCreate,
    CostingItemUpdate,
    CostingItemResponse,
    SOAItemCreate,
    SOAItemUpdate,
    SOAItemResponse,
    ResourceItemCreate,
    ResourceItemUpdate,
    ResourceItemResponse,
    SiteExecutionLogCreate,
    SiteExecutionLogUpdate,
    SiteExecutionLogResponse,
    SiteProgressUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])
logger = logging.getLogger(__name__)

from app.services.inventory_allocation import recalculate_allocations_for_part, get_part_allocations
from app.services.activity_logger import log_activity


def find_project(project_key: str, db: Session) -> Optional[Project]:
    if not project_key:
        return None
    pk = str(project_key).strip()
    p = db.query(Project).filter((Project.project_key == pk) | (Project.code == pk)).first()
    if p:
        return p
    if pk.isdigit():
        p = db.query(Project).filter(Project.id == int(pk)).first()
        if p:
            return p
    return None


def get_project_or_create(project_key: str, db: Session) -> Project:
    p = find_project(project_key, db)
    if p:
        return p

    ensure_default_project(db)

    # Clean project creation for any new project key
    code_suffix = str(project_key).replace("p", "").replace("-", "")[:8]
    p = Project(
        project_key=project_key,
        name=f"Project {project_key.upper()}",
        client="Client Name",
        location="United Arab Emirates",
        code=f"PRJ-2024-{code_suffix or '001'}",
        priority="High",
        priority_level="high",
        current_stage=1,
        total_stages=7,
        manager="Farhan Malik",
        supervisor="Site Supervisor",
        start_date=datetime.datetime.utcnow().strftime("%d %b %Y"),
        budget="",
        is_completed=False,
        commercial_status="not_started",
        engineering_status="not_started",
        budget_status="not_started",
        procurement_status="not_started",
        resource_status="not_started",
        site_execution_status="not_started",
        handover_status="not_started",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def ensure_default_project(db: Session) -> Project:

    """Ensure at least ONE default project exists (no other dummy projects)."""
    p = db.query(Project).filter((Project.project_key == "p1") | (Project.code == "PRJ-2024-001")).first()
    if not p:
        # Check if any project exists
        existing = db.query(Project).first()
        if existing:
            return existing
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
            budget="",
            is_completed=False,
        )
        db.add(p)
        db.commit()
        db.refresh(p)

        # Also add default Commercial Stage 1
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

        # Also add default Engineering Stage 1
        e1 = EngineeringDocumentationStage(
            project_key=p.project_key,
            stage_number=1,
            status="in_progress",
            documents_json="[]",
        )
        db.add(e1)
        db.commit()
        logger.info(f"Initialized single default project: {p.name}")
    # Ensure default Engineering Stage 1 exists if missing
    e_count = db.query(EngineeringDocumentationStage).filter(EngineeringDocumentationStage.project_key == p.project_key).count()
    if e_count == 0:
        e1 = EngineeringDocumentationStage(
            project_key=p.project_key,
            stage_number=1,
            status="in_progress",
            documents_json="[]",
        )
        db.add(e1)
        db.commit()

    # Ensure default Costing items exist if missing
    c_count = db.query(ProjectCostingItem).filter(ProjectCostingItem.project_key == p.project_key).count()
    if c_count == 0:
        sample_costings = [
            ProjectCostingItem(
                project_key=p.project_key,
                sl_no=1,
                part_no="SE-201",
                description="Smart Relay Module 8-Channel DIN",
                qty=5.0,
                purchase_unit_price=650.0,
                purchase_total=3250.0,
                margin=0.65,
                selling_margin_percent=35.0,
                selling_unit_price=1000.0,
                selling_total=5000.0,
                vendor="Schneider Electric UAE",
                brand="Schneider",
                invoice_number="INV-2026-081",
                procurement_status="Added",
            ),
            ProjectCostingItem(
                project_key=p.project_key,
                sl_no=2,
                part_no="ABB-DIM-04",
                description="Universal Dimmer Actuator 4-Fold",
                qty=3.0,
                purchase_unit_price=1200.0,
                purchase_total=3600.0,
                margin=0.65,
                selling_margin_percent=35.0,
                selling_unit_price=1846.15,
                selling_total=5538.45,
                vendor="ABB Automation Middle East",
                brand="ABB",
                invoice_number="INV-2026-088",
                procurement_status="Yet To Deliver",
            ),
            ProjectCostingItem(
                project_key=p.project_key,
                sl_no=3,
                part_no="DUC-CAT6-ST",
                description="Ducab Cat6 UTP Cable Roll (305m)",
                qty=10.0,
                purchase_unit_price=420.0,
                purchase_total=4200.0,
                margin=0.70,
                selling_margin_percent=30.0,
                selling_unit_price=600.0,
                selling_total=6000.0,
                vendor="Ducab Cables Dubai",
                brand="Ducab",
                invoice_number="INV-2026-095",
                procurement_status="Added",
            ),
            ProjectCostingItem(
                project_key=p.project_key,
                sl_no=4,
                part_no="LUT-KP-06",
                description="Lutron Palladiom Keypad 6-Button",
                qty=8.0,
                purchase_unit_price=950.0,
                purchase_total=7600.0,
                margin=0.65,
                selling_margin_percent=35.0,
                selling_unit_price=1461.54,
                selling_total=11692.32,
                vendor="Lutron Electronics UAE",
                brand="Lutron",
                invoice_number="INV-2026-110",
                procurement_status="Yet To Order",
            ),
            ProjectCostingItem(
                project_key=p.project_key,
                sl_no=5,
                part_no="SIE-GW-IP",
                description="Siemens KNX/IP Router Gateway",
                qty=2.0,
                purchase_unit_price=2100.0,
                purchase_total=4200.0,
                margin=0.65,
                selling_margin_percent=35.0,
                selling_unit_price=3230.77,
                selling_total=6461.54,
                vendor="Siemens Building Technologies",
                brand="Siemens",
                invoice_number="INV-2026-102",
                procurement_status="Not Added",
            ),
        ]
        for item in sample_costings:
            db.add(item)
        db.commit()

    # Ensure default SOA items exist if missing
    s_count = db.query(ProjectSOAItem).filter(ProjectSOAItem.project_key == p.project_key).count()
    if s_count == 0:
        sample_soa = [
            ProjectSOAItem(
                project_key=p.project_key,
                date="15 Jan 2024",
                po_no="PO-101",
                document_no="INV-2024-001",
                doc_type="Advance Invoice (30%)",
                value=55500.0,
                received=55500.0,
                remarks="Client 30% mobilization advance payment",
                mode="Online / Bank Transfer",
                balance=0.0,
            ),
            ProjectSOAItem(
                project_key=p.project_key,
                date="20 Feb 2024",
                po_no="PO-101",
                document_no="INV-2024-042",
                doc_type="Milestone 1 Invoice (First Fix)",
                value=37000.0,
                received=37000.0,
                remarks="First fix conduits and wiring completed",
                mode="Cheque",
                balance=0.0,
            ),
            ProjectSOAItem(
                project_key=p.project_key,
                date="12 Mar 2024",
                po_no="PO-101",
                document_no="INV-2024-078",
                doc_type="Milestone 2 Invoice (Equipment Delivery)",
                value=46250.0,
                received=30000.0,
                remarks="Automation panels delivered to site",
                mode="Cheque",
                balance=16250.0,
            ),
        ]
        for s_item in sample_soa:
            db.add(s_item)
        db.commit()

    return p


def compute_total_contract_value(stages, fallback_budget: str = "") -> str:
    total_cv = 0.0
    has_cv = False
    for st in stages:
        cv = getattr(st, "contract_value", None)
        if cv and str(cv).strip():
            clean = re.sub(r"[^0-9.-]", "", str(cv).strip())
            try:
                num = float(clean)
                total_cv += num
                has_cv = True
            except ValueError:
                pass
    if has_cv and total_cv > 0:
        if total_cv.is_integer():
            return f"{int(total_cv):,} AED"
        else:
            return f"{total_cv:,.2f} AED"
    return fallback_budget or ""


def sync_project_budget_from_commercial_stages(project_key: str, db: Session):
    proj = db.query(Project).filter((Project.project_key == project_key) | (Project.code == project_key)).first()
    if not proj:
        return
    stages = db.query(CommercialApprovalStage).filter(CommercialApprovalStage.project_key == proj.project_key).all()
    total_cv = 0.0
    has_cv = False
    for st in stages:
        if st.contract_value and st.contract_value.strip():
            clean = re.sub(r"[^0-9.-]", "", st.contract_value.strip())
            try:
                num = float(clean)
                total_cv += num
                has_cv = True
            except ValueError:
                pass
    if has_cv and total_cv > 0:
        if total_cv.is_integer():
            proj.budget = f"{int(total_cv):,} AED"
        else:
            proj.budget = f"{total_cv:,.2f} AED"


@router.get("", response_model=List[ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    ensure_default_project(db)
    projects = db.query(Project).order_by(Project.id.asc()).all()
    res = []
    for p in projects:
        comm_res = []
        for s in p.commercial_stages:
            comm_res.append(
                CommercialStageResponse(
                    id=s.id,
                    project_key=s.project_key,
                    stage_number=s.stage_number,
                    status=s.status,
                    po_number=s.po_number or "",
                    po_date=s.po_date or "",
                    contract_value=s.contract_value or "",
                    is_saved=s.is_saved,
                    documents=[DocumentItemSchema(**d) for d in s.documents],
                    created_at=s.created_at,
                    updated_at=s.updated_at,
                )
            )

        eng_res = []
        for e in p.engineering_stages:
            eng_res.append(
                EngineeringStageResponse(
                    id=e.id,
                    project_key=e.project_key,
                    stage_number=e.stage_number,
                    status=e.status,
                    documents=[DocumentItemSchema(**d) for d in e.documents],
                    created_at=e.created_at,
                    updated_at=e.updated_at,
                )
            )

        costing_res = [CostingItemResponse.model_validate(c) for c in p.costing_items]
        soa_res = [SOAItemResponse.model_validate(s) for s in p.soa_items]
        resource_res = [ResourceItemResponse.model_validate(r) for r in p.resource_items]

        res.append(
            ProjectResponse(
                id=p.id,
                project_key=p.project_key,
                name=p.name,
                client=p.client,
                location=p.location or "United Arab Emirates",
                code=p.code,
                priority=p.priority,
                priority_level=p.priority_level,
                current_stage=p.current_stage,
                total_stages=p.total_stages,
                manager=p.manager or "Farhan Malik",
                supervisor=p.supervisor or "Site Supervisor",
                start_date=p.start_date,
                budget=compute_total_contract_value(comm_res, p.budget),
                is_completed=p.is_completed,
                completed_at=p.completed_at,
                commercial_status=p.commercial_status or "not_started",
                engineering_status=p.engineering_status or "not_started",
                budget_status=p.budget_status or "not_started",
                procurement_status=p.procurement_status or "not_started",
                resource_status=p.resource_status or "not_started",
                site_execution_status=p.site_execution_status or "not_started",
                handover_status=p.handover_status or "not_started",
                verified_progress_percentage=p.verified_progress_percentage if p.verified_progress_percentage is not None else 0.0,
                created_at=p.created_at,
                commercial_stages=comm_res,
                engineering_stages=eng_res,
                costing_items=costing_res,
                soa_items=soa_res,
                resource_items=resource_res,
            )
        )
    return res


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    key = data.project_key or f"p{int(datetime.datetime.utcnow().timestamp() * 1000)}"
    existing = db.query(Project).filter(Project.project_key == key).first()
    if existing:
        key = f"p{int(datetime.datetime.utcnow().timestamp() * 1000)}"

    p = Project(
        project_key=key,
        name=data.name,
        client=data.client,
        location=data.location or "United Arab Emirates",
        code=data.code,
        priority=data.priority,
        priority_level=data.priority_level,
        current_stage=data.current_stage,
        total_stages=data.total_stages,
        manager=data.manager,
        supervisor=data.supervisor,
        start_date=data.start_date,
        budget=data.budget,
        is_completed=data.is_completed,
        commercial_status=data.commercial_status or "not_started",
        engineering_status=data.engineering_status or "not_started",
        budget_status=data.budget_status or "not_started",
        procurement_status=data.procurement_status or "not_started",
        resource_status=data.resource_status or "not_started",
        site_execution_status=data.site_execution_status or "not_started",
        handover_status=data.handover_status or "not_started",
    )
    db.add(p)
    db.commit()
    db.refresh(p)

    # Initial Commercial Stage 1
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

    # Initial Engineering Stage 1
    e1 = EngineeringDocumentationStage(
        project_key=p.project_key,
        stage_number=1,
        status="in_progress",
        documents_json="[]",
    )
    db.add(e1)
    db.commit()
    db.refresh(p)

    log_activity(
        db,
        user=p.manager or "Admin",
        project_name=p.name,
        module="Projects",
        action=f"Created new project: {p.name} ({p.code or p.project_key})",
        project_key=p.project_key,
    )

    return ProjectResponse(
        id=p.id,
        project_key=p.project_key,
        name=p.name,
        client=p.client,
        location=p.location,
        code=p.code,
        priority=p.priority,
        priority_level=p.priority_level,
        current_stage=p.current_stage,
        total_stages=p.total_stages,
        manager=p.manager,
        supervisor=p.supervisor,
        start_date=p.start_date,
        budget=p.budget,
        is_completed=p.is_completed,
        completed_at=p.completed_at,
        commercial_status=p.commercial_status or "not_started",
        engineering_status=p.engineering_status or "not_started",
        budget_status=p.budget_status or "not_started",
        procurement_status=p.procurement_status or "not_started",
        resource_status=p.resource_status or "not_started",
        site_execution_status=p.site_execution_status or "not_started",
        handover_status=p.handover_status or "not_started",
        verified_progress_percentage=p.verified_progress_percentage if p.verified_progress_percentage is not None else 0.0,
        created_at=p.created_at,
        commercial_stages=[
            CommercialStageResponse(
                id=s1.id,
                project_key=s1.project_key,
                stage_number=s1.stage_number,
                status=s1.status,
                po_number=s1.po_number,
                po_date=s1.po_date,
                contract_value=s1.contract_value,
                is_saved=s1.is_saved,
                documents=[],
                created_at=s1.created_at,
                updated_at=s1.updated_at,
            )
        ],
        engineering_stages=[
            EngineeringStageResponse(
                id=e1.id,
                project_key=e1.project_key,
                stage_number=e1.stage_number,
                status=e1.status,
                documents=[],
                created_at=e1.created_at,
                updated_at=e1.updated_at,
            )
        ],
        costing_items=[],
        soa_items=[],
        resource_items=[],
    )


@router.get("/{project_key}", response_model=ProjectResponse)
def get_project_by_key(project_key: str, db: Session = Depends(get_db)):
    p = get_project_or_create(project_key, db)


    comm_res = []
    for s in p.commercial_stages:
        comm_res.append(
            CommercialStageResponse(
                id=s.id,
                project_key=s.project_key,
                stage_number=s.stage_number,
                status=s.status,
                po_number=s.po_number or "",
                po_date=s.po_date or "",
                contract_value=s.contract_value or "",
                is_saved=s.is_saved,
                documents=[DocumentItemSchema(**d) for d in s.documents],
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
        )

    eng_res = []
    for e in p.engineering_stages:
        eng_res.append(
            EngineeringStageResponse(
                id=e.id,
                project_key=e.project_key,
                stage_number=e.stage_number,
                status=e.status,
                documents=[DocumentItemSchema(**d) for d in e.documents],
                created_at=e.created_at,
                updated_at=e.updated_at,
            )
        )

    costing_res = [CostingItemResponse.model_validate(c) for c in p.costing_items]
    soa_res = [SOAItemResponse.model_validate(s) for s in p.soa_items]
    resource_res = [ResourceItemResponse.model_validate(r) for r in p.resource_items]

    return ProjectResponse(
        id=p.id,
        project_key=p.project_key,
        name=p.name,
        client=p.client,
        location=p.location or "United Arab Emirates",
        code=p.code,
        priority=p.priority,
        priority_level=p.priority_level,
        current_stage=p.current_stage,
        total_stages=p.total_stages,
        manager=p.manager or "Farhan Malik",
        supervisor=p.supervisor or "Site Supervisor",
        start_date=p.start_date,
        budget=compute_total_contract_value(comm_res, p.budget),
        is_completed=p.is_completed,
        completed_at=p.completed_at,
        commercial_status=p.commercial_status or "not_started",
        engineering_status=p.engineering_status or "not_started",
        budget_status=p.budget_status or "not_started",
        procurement_status=p.procurement_status or "not_started",
        resource_status=p.resource_status or "not_started",
        site_execution_status=p.site_execution_status or "not_started",
        handover_status=p.handover_status or "not_started",
        verified_progress_percentage=p.verified_progress_percentage if p.verified_progress_percentage is not None else 0.0,
        created_at=p.created_at,
        commercial_stages=comm_res,
        engineering_stages=eng_res,
        costing_items=costing_res,
        soa_items=soa_res,
        resource_items=resource_res,
    )


@router.put("/{project_key}", response_model=ProjectResponse)
def update_project(project_key: str, data: ProjectUpdate, db: Session = Depends(get_db)):
    p = get_project_or_create(project_key, db)

    if data.name is not None:
        p.name = data.name
    if data.client is not None:
        p.client = data.client
    if data.location is not None:
        p.location = data.location
    if data.priority is not None:
        p.priority = data.priority
        p.priority_level = "high" if data.priority.lower() == "high" else "medium" if data.priority.lower() == "medium" else "low"
    if data.current_stage is not None:
        p.current_stage = data.current_stage
    if data.is_completed is not None:
        p.is_completed = bool(data.is_completed)
        if data.is_completed:
            p.handover_status = "completed"
            p.current_stage = 7
        else:
            if (p.handover_status or "").lower() == "completed":
                p.handover_status = "in_progress"
            if (p.current_stage or 1) >= 7:
                p.current_stage = 6
    if data.completed_at is not None:
        p.completed_at = data.completed_at

    status_fields = [
        "commercial_status",
        "engineering_status",
        "budget_status",
        "procurement_status",
        "resource_status",
        "site_execution_status",
        "handover_status",
    ]
    for field in status_fields:
        new_val = getattr(data, field, None)
        if new_val is not None:
            new_val_clean = new_val.lower().strip()
            if new_val_clean in ["not_started", "in_progress", "completed"]:
                setattr(p, field, new_val_clean)
                if field == "handover_status":
                    if new_val_clean == "completed":
                        p.is_completed = True
                        p.current_stage = 7
                    else:
                        p.is_completed = False
                        if (p.current_stage or 1) >= 7:
                            p.current_stage = 6

    db.commit()
    db.refresh(p)

    distinct_parts = set()
    for pi in p.procurement_items:
        if pi.part_no:
            distinct_parts.add(pi.part_no.strip().upper())
    for ci in p.costing_items:
        if ci.part_no:
            distinct_parts.add(ci.part_no.strip().upper())
    for part in distinct_parts:
        recalculate_allocations_for_part(part, db)

    log_activity(
        db,
        user=p.manager or "Admin",
        project_name=p.name,
        module="Projects",
        action=f"Updated project details: {p.name}",
        project_key=p.project_key,
    )

    return get_project_by_key(p.project_key, db)


# =========================================================================
# COMMERCIAL APPROVAL STAGES ENDPOINTS
# =========================================================================

@router.get("/{project_key}/commercial", response_model=List[CommercialStageResponse])
def get_commercial_stages(project_key: str, db: Session = Depends(get_db)):
    p = get_project_or_create(project_key, db)

    stages = db.query(CommercialApprovalStage).filter(
        CommercialApprovalStage.project_key == p.project_key
    ).order_by(CommercialApprovalStage.stage_number.asc()).all()

    # If no stages yet, create Stage 1
    if not stages:
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
        db.commit()
        db.refresh(s1)
        stages = [s1]

    return [
        CommercialStageResponse(
            id=s.id,
            project_key=s.project_key,
            stage_number=s.stage_number,
            status=s.status,
            po_number=s.po_number or "",
            po_date=s.po_date or "",
            contract_value=s.contract_value or "",
            is_saved=s.is_saved,
            documents=[DocumentItemSchema(**d) for d in s.documents],
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in stages
    ]


@router.post("/{project_key}/commercial", response_model=CommercialStageResponse, status_code=status.HTTP_201_CREATED)
def add_commercial_stage(project_key: str, data: CommercialStageCreate, db: Session = Depends(get_db)):
    p = db.query(Project).filter((Project.project_key == project_key) | (Project.code == project_key)).first()
    if not p:
        p = ensure_default_project(db)

    existing_count = db.query(CommercialApprovalStage).filter(
        CommercialApprovalStage.project_key == p.project_key
    ).count()

    next_num = data.stage_number if data.stage_number else existing_count + 1

    docs_json = json.dumps([d.dict() for d in data.documents]) if data.documents else "[]"
    stage = CommercialApprovalStage(
        project_key=p.project_key,
        stage_number=next_num,
        status=data.status or "in_progress",
        po_number=data.po_number or "",
        po_date=data.po_date or "",
        contract_value=data.contract_value or "",
        is_saved=data.is_saved or False,
        documents_json=docs_json,
    )
    db.add(stage)

    # Automatically create corresponding Engineering stage card in Section 2
    eng_stage = db.query(EngineeringDocumentationStage).filter(
        EngineeringDocumentationStage.project_key == p.project_key,
        EngineeringDocumentationStage.stage_number == next_num,
    ).first()
    if not eng_stage:
        eng_stage = EngineeringDocumentationStage(
            project_key=p.project_key,
            stage_number=next_num,
            status="in_progress",
            documents_json="[]",
        )
        db.add(eng_stage)

    db.commit()
    sync_project_budget_from_commercial_stages(p.project_key, db)
    db.commit()
    db.refresh(stage)

    p_obj = db.query(Project).filter(Project.project_key == stage.project_key).first()
    log_activity(
        db,
        user=p_obj.manager if p_obj and p_obj.manager else "Admin",
        project_name=p_obj.name if p_obj else stage.project_key,
        module="Commercial Approval",
        action=f"Added Stage {stage.stage_number} card",
        project_key=stage.project_key,
    )

    return CommercialStageResponse(
        id=stage.id,
        project_key=stage.project_key,
        stage_number=stage.stage_number,
        status=stage.status,
        po_number=stage.po_number,
        po_date=stage.po_date,
        contract_value=stage.contract_value,
        is_saved=stage.is_saved,
        documents=[DocumentItemSchema(**d) for d in stage.documents],
        created_at=stage.created_at,
        updated_at=stage.updated_at,
    )


@router.put("/{project_key}/commercial/{stage_id}", response_model=CommercialStageResponse)
def update_commercial_stage(project_key: str, stage_id: int, data: CommercialStageUpdate, db: Session = Depends(get_db)):
    stage = db.query(CommercialApprovalStage).filter(CommercialApprovalStage.id == stage_id).first()
    if not stage:
        p = find_project(project_key, db)
        if p:
            stage = db.query(CommercialApprovalStage).filter(
                CommercialApprovalStage.project_key == p.project_key,
                CommercialApprovalStage.stage_number == stage_id,
            ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Commercial stage not found")

    # If stage is already completed, it cannot roll back to in_progress
    if stage.status == "completed" and data.status == "in_progress":
        raise HTTPException(status_code=400, detail="Completed stage cannot be rolled back to In progress")

    if data.is_saved is not None:
        stage.is_saved = data.is_saved
    if data.status is not None:
        stage.status = data.status
    if data.po_number is not None:
        stage.po_number = data.po_number
    if data.po_date is not None:
        stage.po_date = data.po_date
    if data.contract_value is not None:
        stage.contract_value = data.contract_value
    if data.documents is not None:
        stage.documents = [d.dict() for d in data.documents]

    db.commit()
    # Sync project budget with total contract value across all commercial stages
    sync_project_budget_from_commercial_stages(stage.project_key, db)
    db.commit()
    db.refresh(stage)

    p_obj = db.query(Project).filter(Project.project_key == stage.project_key).first()
    log_activity(
        db,
        user=p_obj.manager if p_obj and p_obj.manager else "Admin",
        project_name=p_obj.name if p_obj else stage.project_key,
        module="Commercial Approval",
        action=f"Saved Stage {stage.stage_number} (PO: {stage.po_number or '—'}, Value: {stage.contract_value or '—'}, Status: {stage.status})",
        project_key=stage.project_key,
    )

    return CommercialStageResponse(
        id=stage.id,
        project_key=stage.project_key,
        stage_number=stage.stage_number,
        status=stage.status,
        po_number=stage.po_number,
        po_date=stage.po_date,
        contract_value=stage.contract_value,
        is_saved=stage.is_saved,
        documents=[DocumentItemSchema(**d) for d in stage.documents],
        created_at=stage.created_at,
        updated_at=stage.updated_at,
    )


@router.delete("/{project_key}/commercial/{stage_id}")
def delete_commercial_stage(project_key: str, stage_id: int, db: Session = Depends(get_db)):
    stage = db.query(CommercialApprovalStage).filter(CommercialApprovalStage.id == stage_id).first()
    if not stage:
        p = find_project(project_key, db)
        if p:
            stage = db.query(CommercialApprovalStage).filter(
                CommercialApprovalStage.project_key == p.project_key,
                CommercialApprovalStage.stage_number == stage_id,
            ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Commercial stage not found")

    proj_key = stage.project_key
    st_num = stage.stage_number
    # Also delete corresponding Engineering Documentation stage
    eng_stage = db.query(EngineeringDocumentationStage).filter(
        EngineeringDocumentationStage.project_key == stage.project_key,
        EngineeringDocumentationStage.stage_number == stage.stage_number,
    ).first()
    if eng_stage:
        db.delete(eng_stage)

    db.delete(stage)
    db.commit()
    sync_project_budget_from_commercial_stages(proj_key, db)
    db.commit()

    p_obj = db.query(Project).filter(Project.project_key == proj_key).first()
    log_activity(
        db,
        user=p_obj.manager if p_obj and p_obj.manager else "Admin",
        project_name=p_obj.name if p_obj else proj_key,
        module="Commercial Approval",
        action=f"Deleted Stage {st_num} card",
        project_key=proj_key,
    )

    return {"message": "Commercial stage deleted successfully", "id": stage_id}


@router.post("/{project_key}/commercial/{stage_id}/documents", response_model=CommercialStageResponse)
def add_document_to_stage(project_key: str, stage_id: int, doc: DocumentItemSchema, db: Session = Depends(get_db)):
    stage = db.query(CommercialApprovalStage).filter(CommercialApprovalStage.id == stage_id).first()
    if not stage:
        p = find_project(project_key, db)
        if p:
            stage = db.query(CommercialApprovalStage).filter(
                CommercialApprovalStage.project_key == p.project_key,
                CommercialApprovalStage.stage_number == stage_id,
            ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Commercial stage not found")

    docs = stage.documents
    docs.append(doc.dict())
    stage.documents = docs

    db.commit()
    db.refresh(stage)

    p_obj = db.query(Project).filter(Project.project_key == stage.project_key).first()
    log_activity(
        db,
        user=p_obj.manager if p_obj and p_obj.manager else "Admin",
        project_name=p_obj.name if p_obj else stage.project_key,
        module="Commercial Approval",
        action=f"Uploaded document '{doc.name}' to Stage {stage.stage_number}",
        project_key=stage.project_key,
    )

    return CommercialStageResponse(
        id=stage.id,
        project_key=stage.project_key,
        stage_number=stage.stage_number,
        status=stage.status,
        po_number=stage.po_number,
        po_date=stage.po_date,
        contract_value=stage.contract_value,
        is_saved=stage.is_saved,
        documents=[DocumentItemSchema(**d) for d in stage.documents],
        created_at=stage.created_at,
        updated_at=stage.updated_at,
    )


@router.delete("/{project_key}/commercial/{stage_id}/documents/{doc_id}", response_model=CommercialStageResponse)
def delete_document_from_stage(project_key: str, stage_id: int, doc_id: str, db: Session = Depends(get_db)):
    stage = db.query(CommercialApprovalStage).filter(CommercialApprovalStage.id == stage_id).first()
    if not stage:
        p = find_project(project_key, db)
        if p:
            stage = db.query(CommercialApprovalStage).filter(
                CommercialApprovalStage.project_key == p.project_key,
                CommercialApprovalStage.stage_number == stage_id,
            ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Commercial stage not found")

    docs = [d for d in stage.documents if d.get("id") != doc_id]
    stage.documents = docs

    db.commit()
    db.refresh(stage)

    p_obj = db.query(Project).filter(Project.project_key == stage.project_key).first()
    log_activity(
        db,
        user=p_obj.manager if p_obj and p_obj.manager else "Admin",
        project_name=p_obj.name if p_obj else stage.project_key,
        module="Commercial Approval",
        action=f"Deleted document from Commercial Stage {stage.stage_number}",
        project_key=stage.project_key,
    )

    return CommercialStageResponse(
        id=stage.id,
        project_key=stage.project_key,
        stage_number=stage.stage_number,
        status=stage.status,
        po_number=stage.po_number,
        po_date=stage.po_date,
        contract_value=stage.contract_value,
        is_saved=stage.is_saved,
        documents=[DocumentItemSchema(**d) for d in stage.documents],
        created_at=stage.created_at,
        updated_at=stage.updated_at,
    )


# =========================================================================
# ENGINEERING & DOCUMENTATION STAGES ENDPOINTS
# =========================================================================

@router.get("/{project_key}/engineering", response_model=List[EngineeringStageResponse])
def get_engineering_stages(project_key: str, db: Session = Depends(get_db)):
    p = get_project_or_create(project_key, db)

    stages = db.query(EngineeringDocumentationStage).filter(
        EngineeringDocumentationStage.project_key == p.project_key
    ).order_by(EngineeringDocumentationStage.stage_number.asc()).all()

    if not stages:
        e1 = EngineeringDocumentationStage(
            project_key=p.project_key,
            stage_number=1,
            status="in_progress",
            documents_json="[]",
        )
        db.add(e1)
        db.commit()
        db.refresh(e1)
        stages = [e1]

    return [
        EngineeringStageResponse(
            id=s.id,
            project_key=s.project_key,
            stage_number=s.stage_number,
            status=s.status,
            documents=[DocumentItemSchema(**d) for d in s.documents],
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in stages
    ]


@router.post("/{project_key}/engineering", response_model=EngineeringStageResponse, status_code=status.HTTP_201_CREATED)
def add_engineering_stage(project_key: str, data: EngineeringStageCreate, db: Session = Depends(get_db)):
    p = db.query(Project).filter((Project.project_key == project_key) | (Project.code == project_key)).first()
    if not p:
        p = ensure_default_project(db)

    existing_count = db.query(EngineeringDocumentationStage).filter(
        EngineeringDocumentationStage.project_key == p.project_key
    ).count()

    next_num = data.stage_number if data.stage_number else existing_count + 1

    docs_json = json.dumps([d.dict() for d in data.documents]) if data.documents else "[]"
    stage = EngineeringDocumentationStage(
        project_key=p.project_key,
        stage_number=next_num,
        status=data.status or "in_progress",
        documents_json=docs_json,
    )
    db.add(stage)
    db.commit()
    db.refresh(stage)

    return EngineeringStageResponse(
        id=stage.id,
        project_key=stage.project_key,
        stage_number=stage.stage_number,
        status=stage.status,
        documents=[DocumentItemSchema(**d) for d in stage.documents],
        created_at=stage.created_at,
        updated_at=stage.updated_at,
    )


@router.put("/{project_key}/engineering/{stage_id}", response_model=EngineeringStageResponse)
def update_engineering_stage(project_key: str, stage_id: int, data: EngineeringStageUpdate, db: Session = Depends(get_db)):
    stage = db.query(EngineeringDocumentationStage).filter(EngineeringDocumentationStage.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Engineering stage not found")

    # If stage is already completed, it cannot roll back to in_progress
    if stage.status == "completed" and data.status == "in_progress":
        raise HTTPException(status_code=400, detail="Completed stage cannot be rolled back to In progress")

    if data.status is not None:
        stage.status = data.status
    if data.documents is not None:
        stage.documents = [d.dict() for d in data.documents]

    db.commit()
    db.refresh(stage)

    return EngineeringStageResponse(
        id=stage.id,
        project_key=stage.project_key,
        stage_number=stage.stage_number,
        status=stage.status,
        documents=[DocumentItemSchema(**d) for d in stage.documents],
        created_at=stage.created_at,
        updated_at=stage.updated_at,
    )


@router.delete("/{project_key}/engineering/{stage_id}")
def delete_engineering_stage(project_key: str, stage_id: int, db: Session = Depends(get_db)):
    stage = db.query(EngineeringDocumentationStage).filter(EngineeringDocumentationStage.id == stage_id).first()
    if not stage:
        p = find_project(project_key, db)
        if p:
            stage = db.query(EngineeringDocumentationStage).filter(
                EngineeringDocumentationStage.project_key == p.project_key,
                EngineeringDocumentationStage.stage_number == stage_id,
            ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Engineering stage not found")

    db.delete(stage)
    db.commit()
    return {"message": "Engineering stage deleted successfully", "id": stage_id}


@router.post("/{project_key}/engineering/{stage_id}/documents", response_model=EngineeringStageResponse)
def add_document_to_engineering_stage(project_key: str, stage_id: int, doc: DocumentItemSchema, db: Session = Depends(get_db)):
    stage = db.query(EngineeringDocumentationStage).filter(EngineeringDocumentationStage.id == stage_id).first()
    if not stage:
        p = find_project(project_key, db)
        if p:
            stage = db.query(EngineeringDocumentationStage).filter(
                EngineeringDocumentationStage.project_key == p.project_key,
                EngineeringDocumentationStage.stage_number == stage_id,
            ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Engineering stage not found")

    docs = stage.documents
    docs.append(doc.dict())
    stage.documents = docs

    db.commit()
    db.refresh(stage)

    p_obj = db.query(Project).filter(Project.project_key == stage.project_key).first()
    log_activity(
        db,
        user=p_obj.manager if p_obj and p_obj.manager else "Admin",
        project_name=p_obj.name if p_obj else stage.project_key,
        module="Engineering",
        action=f"Uploaded engineering document '{doc.name}' to Stage {stage.stage_number}",
        project_key=stage.project_key,
    )

    return EngineeringStageResponse(
        id=stage.id,
        project_key=stage.project_key,
        stage_number=stage.stage_number,
        status=stage.status,
        documents=[DocumentItemSchema(**d) for d in stage.documents],
        created_at=stage.created_at,
        updated_at=stage.updated_at,
    )


@router.delete("/{project_key}/engineering/{stage_id}/documents/{doc_id}", response_model=EngineeringStageResponse)
def delete_document_from_engineering_stage(project_key: str, stage_id: int, doc_id: str, db: Session = Depends(get_db)):
    stage = db.query(EngineeringDocumentationStage).filter(EngineeringDocumentationStage.id == stage_id).first()
    if not stage:
        p = find_project(project_key, db)
        if p:
            stage = db.query(EngineeringDocumentationStage).filter(
                EngineeringDocumentationStage.project_key == p.project_key,
                EngineeringDocumentationStage.stage_number == stage_id,
            ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Engineering stage not found")

    docs = [d for d in stage.documents if d.get("id") != doc_id]
    stage.documents = docs

    db.commit()
    db.refresh(stage)

    p_obj = db.query(Project).filter(Project.project_key == stage.project_key).first()
    log_activity(
        db,
        user=p_obj.manager if p_obj and p_obj.manager else "Admin",
        project_name=p_obj.name if p_obj else stage.project_key,
        module="Engineering",
        action=f"Deleted engineering document from Stage {stage.stage_number}",
        project_key=stage.project_key,
    )

    return EngineeringStageResponse(
        id=stage.id,
        project_key=stage.project_key,
        stage_number=stage.stage_number,
        status=stage.status,
        documents=[DocumentItemSchema(**d) for d in stage.documents],
        created_at=stage.created_at,
        updated_at=stage.updated_at,
    )


# =========================================================================
# COSTING SHEET ENDPOINTS
# =========================================================================

@router.get("/{project_key}/costing", response_model=List[CostingItemResponse])
def get_costing_items(project_key: str, db: Session = Depends(get_db)):
    p = get_project_or_create(project_key, db)

    items = db.query(ProjectCostingItem).filter(
        ProjectCostingItem.project_key == p.project_key
    ).order_by(ProjectCostingItem.sl_no.asc()).all()

    # Recalculate allocations for parts in this project so statuses are always fresh
    for item in items:
        if item.part_no:
            recalculate_allocations_for_part(item.part_no, db)

    # Re-query items to ensure updated allocations and statuses
    items = db.query(ProjectCostingItem).filter(
        ProjectCostingItem.project_key == p.project_key
    ).order_by(ProjectCostingItem.sl_no.asc()).all()

    res = []
    for item in items:
        r = CostingItemResponse.model_validate(item)
        r.remaining_qty = max(0.0, float(item.qty or 0.0) - float(item.allocated_qty or 0.0))
        res.append(r)
    return res


@router.post("/{project_key}/costing", response_model=CostingItemResponse, status_code=status.HTTP_201_CREATED)
def create_costing_item(project_key: str, data: CostingItemCreate, db: Session = Depends(get_db)):
    p = db.query(Project).filter((Project.project_key == project_key) | (Project.code == project_key)).first()
    if not p:
        p = ensure_default_project(db)

    # Automatic calculation
    qty = data.qty if data.qty is not None else 1.0
    purchase_unit = data.purchase_unit_price or 0.0
    purchase_total = round(qty * purchase_unit, 2)
    margin = data.margin if data.margin is not None else 25.0
    selling_margin_pct = data.selling_margin_percent if data.selling_margin_percent is not None else margin
    
    if data.selling_unit_price and data.selling_unit_price > 0:
        selling_unit = data.selling_unit_price
    else:
        selling_unit = round(purchase_unit * (1.0 + margin / 100.0), 2)
        
    selling_total = round(qty * selling_unit, 2)

    count = db.query(ProjectCostingItem).filter(ProjectCostingItem.project_key == p.project_key).count()
    sl_no = data.sl_no if data.sl_no else count + 1

    item = ProjectCostingItem(
        project_key=p.project_key,
        sl_no=sl_no,
        part_no=data.part_no or "",
        description=data.description or "",
        qty=qty,
        purchase_unit_price=purchase_unit,
        purchase_total=purchase_total,
        margin=margin,
        selling_margin_percent=selling_margin_pct,
        selling_unit_price=selling_unit,
        selling_total=selling_total,
        vendor=data.vendor or "",
        brand=data.brand or "",
        invoice_number=data.invoice_number or "",
        procurement_status="Yet To Order",
        allocated_qty=0.0,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    resp = CostingItemResponse.model_validate(item)
    resp.remaining_qty = max(0.0, float(item.qty or 0.0) - float(item.allocated_qty or 0.0))
    return resp


@router.put("/{project_key}/costing/{item_id}", response_model=CostingItemResponse)
def update_costing_item(project_key: str, item_id: int, data: CostingItemUpdate, db: Session = Depends(get_db)):
    item = db.query(ProjectCostingItem).filter(ProjectCostingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Costing item not found")

    if data.sl_no is not None:
        item.sl_no = data.sl_no
    if data.part_no is not None:
        item.part_no = data.part_no
    if data.description is not None:
        item.description = data.description
    if data.qty is not None:
        item.qty = data.qty
    if data.purchase_unit_price is not None:
        item.purchase_unit_price = data.purchase_unit_price
    if data.margin is not None:
        item.margin = data.margin
        item.selling_margin_percent = data.margin
    if data.selling_margin_percent is not None:
        item.selling_margin_percent = data.selling_margin_percent
    if data.selling_unit_price is not None:
        item.selling_unit_price = data.selling_unit_price
    elif data.purchase_unit_price is not None or data.margin is not None:
        item.selling_unit_price = round(item.purchase_unit_price * (1.0 + item.margin / 100.0), 2)

    item.purchase_total = round(item.qty * item.purchase_unit_price, 2)
    item.selling_total = round(item.qty * item.selling_unit_price, 2)

    if data.vendor is not None:
        item.vendor = data.vendor
    if data.brand is not None:
        item.brand = data.brand
    if data.invoice_number is not None:
        item.invoice_number = data.invoice_number
    if data.procurement_status is not None:
        item.procurement_status = data.procurement_status

    db.commit()
    db.refresh(item)
    resp = CostingItemResponse.model_validate(item)
    resp.remaining_qty = max(0.0, float(item.qty or 0.0) - float(item.allocated_qty or 0.0))
    return resp


@router.delete("/{project_key}/costing/{item_id}")
def delete_costing_item(project_key: str, item_id: int, db: Session = Depends(get_db)):
    item = db.query(ProjectCostingItem).filter(ProjectCostingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Costing item not found")

    db.delete(item)
    db.commit()

    return {"message": "Costing item deleted successfully", "id": item_id}


# =========================================================================
# PROCUREMENT & INVENTORY ALLOCATION ENDPOINTS
# =========================================================================

@router.get("/{project_key}/procurement", response_model=List[ProcurementItemResponse])
def get_procurement_items(project_key: str, db: Session = Depends(get_db)):
    p = get_project_or_create(project_key, db)

    items = db.query(ProjectProcurementItem).filter(
        ProjectProcurementItem.project_key == p.project_key
    ).order_by(ProjectProcurementItem.sl_no.asc()).all()

    # Recalculate allocations for parts in this project so statuses reflect current warehouse stock
    for item in items:
        if item.part_no:
            recalculate_allocations_for_part(item.part_no, db)

    # Re-query items with updated allocations
    items = db.query(ProjectProcurementItem).filter(
        ProjectProcurementItem.project_key == p.project_key
    ).order_by(ProjectProcurementItem.sl_no.asc()).all()

    res = []
    for item in items:
        r = ProcurementItemResponse.model_validate(item)
        r.remaining_qty = max(0.0, float(item.qty or 0.0) - float(item.allocated_qty or 0.0))
        # Compute warehouse available stock for this part
        norm_part = item.part_no.strip().upper()
        alloc_data = get_part_allocations(norm_part, db)
        r.available_stock = alloc_data.get("available_in_warehouse", 0.0)
        res.append(r)
    return res


@router.post("/{project_key}/procurement", response_model=ProcurementItemResponse, status_code=status.HTTP_201_CREATED)
def create_procurement_item(project_key: str, data: ProcurementItemCreate, db: Session = Depends(get_db)):
    p = find_project(project_key, db)
    if not p:
        p = ensure_default_project(db)

    count = db.query(ProjectProcurementItem).filter(ProjectProcurementItem.project_key == p.project_key).count()
    sl_no = data.sl_no if data.sl_no else count + 1

    part_num = (data.part_no or "").strip().upper()
    if not part_num:
        raise HTTPException(status_code=400, detail="Part number is required.")

    # Enforce part number uniqueness per project
    existing = db.query(ProjectProcurementItem).filter(
        ProjectProcurementItem.project_key == p.project_key,
        ProjectProcurementItem.part_no.ilike(part_num),
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Part number '{part_num}' is already added to this project. Please edit the existing item instead.",
        )

    req_qty = max(0.0, float(data.qty) if data.qty is not None else 1.0)

    # Auto-resolve product name from MasterPart if omitted
    prod_name = (data.product_name or "").strip()
    if not prod_name and part_num:
        mp = db.query(MasterPart).filter(MasterPart.part_number.ilike(part_num)).first()
        if mp:
            prod_name = mp.product_name or mp.description or mp.part_number

    # Calculate current warehouse available stock for this part
    alloc_data = get_part_allocations(part_num, db)
    avail_stock = alloc_data.get("available_in_warehouse", 0.0)

    # Determine allocation and status:
    if data.allocated_qty is not None:
        alloc = min(avail_stock, max(0.0, float(data.allocated_qty)))
    else:
        alloc = 0.0

    alloc = min(alloc, req_qty)

    if alloc >= req_qty and req_qty > 0:
        status_val = "Added"
    elif alloc > 0:
        status_val = "Partially Added"
    else:
        status_val = data.status if data.status in ["Yet To Order", "Yet To Deliver"] else "Yet To Order"

    item = ProjectProcurementItem(
        project_key=p.project_key,
        sl_no=sl_no,
        part_no=part_num,
        product_name=prod_name or part_num,
        vendor=data.vendor or "",
        brand=data.brand or "",
        qty=req_qty,
        allocated_qty=alloc,
        status=status_val,
        invoice_number=data.invoice_number or "",
        notes=data.notes or "",
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    recalculate_allocations_for_part(part_num, db)
    db.refresh(item)

    r = ProcurementItemResponse.model_validate(item)
    r.remaining_qty = max(0.0, float(item.qty or 0.0) - float(item.allocated_qty or 0.0))
    r.available_stock = avail_stock
    return r


@router.put("/{project_key}/procurement/{item_id}", response_model=ProcurementItemResponse)
def update_procurement_item(project_key: str, item_id: int, data: ProcurementItemUpdate, db: Session = Depends(get_db)):
    item = db.query(ProjectProcurementItem).filter(ProjectProcurementItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Procurement item not found")

    old_part_num = item.part_no

    if data.part_no is not None:
        new_part = data.part_no.strip().upper()
        if new_part != item.part_no:
            existing = db.query(ProjectProcurementItem).filter(
                ProjectProcurementItem.project_key == project_key,
                ProjectProcurementItem.part_no.ilike(new_part),
                ProjectProcurementItem.id != item_id,
            ).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Part number '{new_part}' is already added to this project.",
                )
            item.part_no = new_part

    if data.product_name is not None:
        item.product_name = data.product_name.strip()
    if data.vendor is not None:
        item.vendor = data.vendor.strip()
    if data.brand is not None:
        item.brand = data.brand.strip()
    if data.qty is not None:
        item.qty = max(0.0, float(data.qty))
    if data.allocated_qty is not None:
        item.allocated_qty = min(max(0.0, float(data.allocated_qty)), float(item.qty or 0.0))
    if data.invoice_number is not None:
        item.invoice_number = data.invoice_number.strip()
    if data.notes is not None:
        item.notes = data.notes.strip()

    req = float(item.qty or 0.0)
    alloc = float(item.allocated_qty or 0.0)
    if alloc >= req and req > 0:
        item.status = "Added"
    elif alloc > 0:
        item.status = "Partially Added"
    elif data.status is not None:
        item.status = data.status
    elif item.status not in ["Yet To Order", "Yet To Deliver"]:
        item.status = "Yet To Order"

    db.commit()
    recalculate_allocations_for_part(item.part_no, db)
    if old_part_num and old_part_num != item.part_no:
        recalculate_allocations_for_part(old_part_num, db)
    db.refresh(item)

    r = ProcurementItemResponse.model_validate(item)
    r.remaining_qty = max(0.0, float(item.qty or 0.0) - float(item.allocated_qty or 0.0))
    return r


@router.delete("/{project_key}/procurement/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_procurement_item(project_key: str, item_id: int, db: Session = Depends(get_db)):
    item = db.query(ProjectProcurementItem).filter(ProjectProcurementItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Procurement item not found")

    part_num = item.part_no
    db.delete(item)
    db.commit()
    if part_num:
        recalculate_allocations_for_part(part_num, db)
    return None


@router.post("/{project_key}/procurement/shift", response_model=ProcurementShiftResponse)
def shift_procurement_item(project_key: str, data: ProcurementItemShift, db: Session = Depends(get_db)):
    """
    Shifts allocated material from a source project to this destination project.
    Deducts allocated_qty from the source project item, and adds it to the destination project item
    (or creates a new item in the destination project if not present).
    Automatically triggers allocation and Master Inventory traceability recalculation.
    """
    dest_proj = find_project(project_key, db)
    if not dest_proj:
        dest_proj = ensure_default_project(db)

    dest_key = dest_proj.project_key
    src_key = (data.source_project_key or "").strip()

    if not src_key:
        raise HTTPException(status_code=400, detail="Source project is required.")
    if src_key == dest_key:
        raise HTTPException(status_code=400, detail="Source project and destination project cannot be the same.")

    src_proj = find_project(src_key, db)
    if not src_proj:
        raise HTTPException(status_code=404, detail=f"Source project '{src_key}' not found.")

    if src_proj.is_completed or src_proj.handover_status == "Completed":
        raise HTTPException(
            status_code=400,
            detail=f"Source project '{src_proj.name or src_key}' is completed. Materials from completed projects cannot be shifted.",
        )

    part_num = (data.part_no or "").strip().upper()
    if not part_num:
        raise HTTPException(status_code=400, detail="Part number is required.")

    shift_qty = float(data.quantity)
    if shift_qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity to shift must be greater than zero.")

    # 1. Locate source project item
    src_item = db.query(ProjectProcurementItem).filter(
        ProjectProcurementItem.project_key == src_key,
        ProjectProcurementItem.part_no.ilike(part_num),
    ).first()

    if not src_item or float(src_item.allocated_qty or 0.0) <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"Source project '{src_proj.name or src_key}' has no allocated units of part '{part_num}' to shift.",
        )

    avail_in_src = float(src_item.allocated_qty or 0.0)
    if shift_qty > avail_in_src:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot shift {shift_qty} units. Source project only has {avail_in_src} units allocated.",
        )

    # 2. Deduct from source item
    src_item.allocated_qty = avail_in_src - shift_qty
    src_req = float(src_item.qty or 0.0)
    if src_item.allocated_qty >= src_req and src_req > 0:
        src_item.status = "Added"
    elif src_item.allocated_qty > 0:
        src_item.status = "Partially Added"
    else:
        src_item.status = "Yet To Order"

    now_str = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    transfer_reason = f" ({data.notes.strip()})" if data.notes and data.notes.strip() else ""
    src_transfer_note = f"[Transferred {shift_qty} units to {dest_proj.name or dest_key} on {now_str}{transfer_reason}]"
    src_item.notes = f"{src_item.notes.strip()}\n{src_transfer_note}".strip() if src_item.notes else src_transfer_note

    # 3. Add to destination item
    dest_item = db.query(ProjectProcurementItem).filter(
        ProjectProcurementItem.project_key == dest_key,
        ProjectProcurementItem.part_no.ilike(part_num),
    ).first()

    dest_transfer_note = f"[Received {shift_qty} units transferred from {src_proj.name or src_key} on {now_str}{transfer_reason}]"

    if dest_item:
        dest_item.allocated_qty = float(dest_item.allocated_qty or 0.0) + shift_qty
        if dest_item.allocated_qty > float(dest_item.qty or 0.0):
            dest_item.qty = dest_item.allocated_qty
        dest_req = float(dest_item.qty or 0.0)
        if dest_item.allocated_qty >= dest_req and dest_req > 0:
            dest_item.status = "Added"
        elif dest_item.allocated_qty > 0:
            dest_item.status = "Partially Added"
        dest_item.notes = f"{dest_item.notes.strip()}\n{dest_transfer_note}".strip() if dest_item.notes else dest_transfer_note
    else:
        dest_count = db.query(ProjectProcurementItem).filter(ProjectProcurementItem.project_key == dest_key).count()
        dest_item = ProjectProcurementItem(
            project_key=dest_key,
            sl_no=dest_count + 1,
            part_no=part_num,
            product_name=src_item.product_name or part_num,
            vendor=src_item.vendor or "",
            brand=src_item.brand or "",
            qty=shift_qty,
            allocated_qty=shift_qty,
            status="Added",
            invoice_number="",
            notes=dest_transfer_note,
        )
        db.add(dest_item)

    db.commit()
    db.refresh(src_item)
    db.refresh(dest_item)

    # Recalculate Master Inventory allocations & project invoice mapping
    recalculate_allocations_for_part(part_num, db)

    return ProcurementShiftResponse(
        source_project_key=src_key,
        destination_project_key=dest_key,
        part_no=part_num,
        shifted_quantity=shift_qty,
        source_remaining_allocated=float(src_item.allocated_qty or 0.0),
        destination_total_allocated=float(dest_item.allocated_qty or 0.0),
        message=f"Successfully shifted {shift_qty} units of {part_num} from {src_proj.name or src_key} to {dest_proj.name or dest_key}.",
    )



# =========================================================================
# STATEMENT OF ACCOUNT (SOA) ENDPOINTS
# =========================================================================

@router.get("/{project_key}/soa", response_model=List[SOAItemResponse])
def get_soa_items(project_key: str, db: Session = Depends(get_db)):
    p = get_project_or_create(project_key, db)

    items = db.query(ProjectSOAItem).filter(
        ProjectSOAItem.project_key == p.project_key
    ).order_by(ProjectSOAItem.id.asc()).all()

    return [SOAItemResponse.model_validate(item) for item in items]


@router.post("/{project_key}/soa", response_model=SOAItemResponse, status_code=status.HTTP_201_CREATED)
def create_soa_item(project_key: str, data: SOAItemCreate, db: Session = Depends(get_db)):
    p = db.query(Project).filter((Project.project_key == project_key) | (Project.code == project_key)).first()
    if not p:
        p = ensure_default_project(db)

    val = data.value or 0.0
    rec = data.received or 0.0
    balance = round(val - rec, 2)

    item = ProjectSOAItem(
        project_key=p.project_key,
        stage_number=data.stage_number or 1,
        date=data.date or "",
        po_no=data.po_no or "",
        document_no=data.document_no or "",
        doc_type=data.doc_type or "Tax Invoice",
        value=val,
        received=rec,
        remarks=data.remarks or "",
        mode=data.mode or "Cheque",
        balance=balance,
        document_url=data.document_url or "",
        document_name=data.document_name or "",
        document_size=data.document_size or "",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return SOAItemResponse.model_validate(item)


@router.put("/{project_key}/soa/{item_id}", response_model=SOAItemResponse)
def update_soa_item(project_key: str, item_id: int, data: SOAItemUpdate, db: Session = Depends(get_db)):
    item = db.query(ProjectSOAItem).filter(ProjectSOAItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="SOA item not found")

    if data.date is not None:
        item.date = data.date
    if data.po_no is not None:
        item.po_no = data.po_no
    if data.document_no is not None:
        item.document_no = data.document_no
    if data.doc_type is not None:
        item.doc_type = data.doc_type
    if data.value is not None:
        item.value = data.value
    if data.received is not None:
        item.received = data.received
    if data.remarks is not None:
        item.remarks = data.remarks
    if data.stage_number is not None:
        item.stage_number = data.stage_number
    if data.mode is not None:
        item.mode = data.mode
    if data.document_url is not None:
        item.document_url = data.document_url
    if data.document_name is not None:
        item.document_name = data.document_name
    if data.document_size is not None:
        item.document_size = data.document_size

    if data.balance is not None:
        item.balance = data.balance
    else:
        item.balance = round((item.value or 0.0) - (item.received or 0.0), 2)

    db.commit()
    db.refresh(item)
    return SOAItemResponse.model_validate(item)


@router.delete("/{project_key}/soa/{item_id}")
def delete_soa_item(project_key: str, item_id: int, db: Session = Depends(get_db)):
    item = db.query(ProjectSOAItem).filter(ProjectSOAItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="SOA item not found")

    db.delete(item)
    db.commit()
    return {"message": "SOA item deleted successfully", "id": item_id}


# =========================================================================
# RESOURCE ALLOCATION ENDPOINTS
# =========================================================================

@router.get("/{project_key}/resources", response_model=List[ResourceItemResponse])
def get_resource_items(
    project_key: str,
    date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    p = get_project_or_create(project_key, db)
    query = db.query(ProjectResourceItem).filter(
        ProjectResourceItem.project_key == p.project_key
    )
    if date and date.strip() and date.strip().lower() != "all":
        query = query.filter(ProjectResourceItem.date == date.strip())

    items = query.order_by(ProjectResourceItem.sl_no.asc(), ProjectResourceItem.id.asc()).all()
    return [ResourceItemResponse.model_validate(item) for item in items]


@router.post("/{project_key}/resources", response_model=ResourceItemResponse, status_code=status.HTTP_201_CREATED)
def create_resource_item(project_key: str, data: ResourceItemCreate, db: Session = Depends(get_db)):
    p = get_project_or_create(project_key, db)

    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Member name is required")

    # Determine date
    item_date = data.date.strip() if data.date and data.date.strip() else datetime.date.today().isoformat()

    count = db.query(ProjectResourceItem).filter(
        ProjectResourceItem.project_key == p.project_key,
        ProjectResourceItem.date == item_date,
    ).count()
    sl_no = data.sl_no if data.sl_no else count + 1

    # Clamp hours worked to 1..9
    hours = data.hours_worked if data.hours_worked is not None else 8
    if hours < 1:
        hours = 1
    elif hours > 9:
        hours = 9

    item = ProjectResourceItem(
        project_key=p.project_key,
        sl_no=sl_no,
        name=name,
        type=data.type or "Internal",
        hours_worked=hours,
        date=item_date,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return ResourceItemResponse.model_validate(item)


@router.put("/{project_key}/resources/{item_id}", response_model=ResourceItemResponse)
def update_resource_item(project_key: str, item_id: int, data: ResourceItemUpdate, db: Session = Depends(get_db)):
    item = db.query(ProjectResourceItem).filter(ProjectResourceItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Resource item not found")

    if data.sl_no is not None:
        item.sl_no = data.sl_no
    if data.name is not None and data.name.strip():
        item.name = data.name.strip()
    if data.type is not None:
        item.type = data.type
    if data.date is not None:
        item.date = data.date.strip()
    if data.hours_worked is not None:
        hours = data.hours_worked
        if hours < 1:
            hours = 1
        elif hours > 9:
            hours = 9
        item.hours_worked = hours

    db.commit()
    db.refresh(item)
    return ResourceItemResponse.model_validate(item)


@router.delete("/{project_key}/resources/{item_id}")
def delete_resource_item(project_key: str, item_id: int, db: Session = Depends(get_db)):
    item = db.query(ProjectResourceItem).filter(ProjectResourceItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Resource item not found")

    db.delete(item)
    db.commit()
    return {"message": "Resource member deleted successfully", "id": item_id}


@router.delete("/{project_key}")
def delete_project(project_key: str, db: Session = Depends(get_db)):
    p = find_project(project_key, db)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(p)
    db.commit()
    return {"message": f"Project {project_key} deleted successfully", "project_key": project_key}

# =========================================================================
# SITE EXECUTION PROGRESS & LOGS ENDPOINTS
# =========================================================================

@router.get("/{project_key}/site-execution", response_model=List[SiteExecutionLogResponse])
def get_site_execution_logs(
    project_key: str,
    date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    p = get_project_or_create(project_key, db)
    query = db.query(ProjectSiteExecutionLog).filter(ProjectSiteExecutionLog.project_key == p.project_key)
    if date and date.strip() and date.strip().lower() != "all":
        query = query.filter(ProjectSiteExecutionLog.date == date.strip())
    logs = query.order_by(ProjectSiteExecutionLog.id.desc()).all()
    
    result = []
    for log_item in logs:
        resp = SiteExecutionLogResponse(
            id=log_item.id,
            project_key=log_item.project_key,
            date=log_item.date,
            supervisor_name=log_item.supervisor_name,
            creator_role=getattr(log_item, "creator_role", "Site Supervisor") or "Site Supervisor",
            phase_name=log_item.phase_name,
            description=log_item.description,
            images=log_item.images,
            created_at=log_item.created_at,
        )
        result.append(resp)
    return result


@router.post("/{project_key}/site-execution", response_model=SiteExecutionLogResponse, status_code=status.HTTP_201_CREATED)
def create_site_execution_log(
    project_key: str,
    data: SiteExecutionLogCreate,
    db: Session = Depends(get_db)
):
    p = get_project_or_create(project_key, db)
    
    imgs_list = [img.model_dump() for img in data.images] if data.images else []
    log_item = ProjectSiteExecutionLog(
        project_key=p.project_key,
        date=data.date,
        supervisor_name=data.supervisor_name or "Site Supervisor",
        creator_role=data.creator_role or "Site Supervisor",
        phase_name=data.phase_name or "Daily Site Progress",
        description=data.description or "",
        images_json=json.dumps(imgs_list),
    )
    db.add(log_item)
    db.commit()
    db.refresh(log_item)
    
    log_activity(
        db,
        user=log_item.supervisor_name or "Site Supervisor",
        project_name=p.name,
        module="Site Execution",
        action=f"Logged daily site execution report for {log_item.date} ({log_item.phase_name})",
        project_key=p.project_key,
    )

    return SiteExecutionLogResponse(
        id=log_item.id,
        project_key=log_item.project_key,
        date=log_item.date,
        supervisor_name=log_item.supervisor_name,
        creator_role=getattr(log_item, "creator_role", "Site Supervisor") or "Site Supervisor",
        phase_name=log_item.phase_name,
        description=log_item.description,
        images=log_item.images,
        created_at=log_item.created_at,
    )


@router.put("/{project_key}/site-execution/progress", response_model=ProjectResponse)
@router.put("/{project_key}/progress", response_model=ProjectResponse)
def update_site_verified_progress(
    project_key: str,
    payload: SiteProgressUpdate,
    db: Session = Depends(get_db)
):
    p = get_project_or_create(project_key, db)
    current_val = float(p.verified_progress_percentage or 0.0)
    new_val = float(payload.verified_progress_percentage)
    
    # Forward-only rule: cannot decrease verified percentage
    if new_val < current_val:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot roll back verified progress from {current_val}% to {new_val}%. Progression is forward-only."
        )
    
    p.verified_progress_percentage = min(100.0, max(0.0, new_val))
    db.commit()
    db.refresh(p)

    log_activity(
        db,
        user="Site Supervisor",
        project_name=p.name,
        module="Site Execution",
        action=f"Updated site verified milestone to {p.verified_progress_percentage}%",
        project_key=p.project_key,
    )

    return get_project_by_key(p.project_key, db)


@router.put("/{project_key}/site-execution/{log_id}", response_model=SiteExecutionLogResponse)
def update_site_execution_log(
    project_key: str,
    log_id: int,
    data: SiteExecutionLogUpdate,
    db: Session = Depends(get_db)
):
    p = get_project_or_create(project_key, db)
    log_item = db.query(ProjectSiteExecutionLog).filter(
        ProjectSiteExecutionLog.id == log_id,
        ProjectSiteExecutionLog.project_key == p.project_key
    ).first()
    if not log_item:
        raise HTTPException(status_code=404, detail="Site execution log entry not found")
    
    if data.phase_name is not None:
        log_item.phase_name = data.phase_name
    if data.description is not None:
        log_item.description = data.description
    if data.images is not None:
        log_item.images_json = json.dumps([img.model_dump() for img in data.images])
    
    db.commit()
    db.refresh(log_item)

    log_activity(
        db,
        user=log_item.supervisor_name or "Site Supervisor",
        project_name=p.name,
        module="Site Execution",
        action=f"Updated site execution log #{log_item.id} ({log_item.date} - {log_item.phase_name})",
        project_key=p.project_key,
    )

    return SiteExecutionLogResponse(
        id=log_item.id,
        project_key=log_item.project_key,
        date=log_item.date,
        supervisor_name=log_item.supervisor_name,
        creator_role=getattr(log_item, "creator_role", "Site Supervisor") or "Site Supervisor",
        phase_name=log_item.phase_name,
        description=log_item.description,
        images=log_item.images,
        created_at=log_item.created_at,
    )


@router.delete("/{project_key}/site-execution/{log_id}", status_code=status.HTTP_200_OK)
def delete_site_execution_log(
    project_key: str,
    log_id: int,
    db: Session = Depends(get_db)
):
    p = get_project_or_create(project_key, db)
    log_item = db.query(ProjectSiteExecutionLog).filter(
        ProjectSiteExecutionLog.id == log_id,
        ProjectSiteExecutionLog.project_key == p.project_key
    ).first()
    if not log_item:
        raise HTTPException(status_code=404, detail="Site execution log entry not found")
    
    log_sup = log_item.supervisor_name
    log_date = log_item.date

    db.delete(log_item)
    db.commit()

    log_activity(
        db,
        user=log_sup or "Site Supervisor",
        project_name=p.name,
        module="Site Execution",
        action=f"Deleted daily site execution log #{log_id} ({log_sup} - {log_date})",
        project_key=p.project_key,
    )

    return {"message": f"Site execution log #{log_id} deleted successfully"}



