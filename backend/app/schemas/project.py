from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime


class DocumentItemSchema(BaseModel):
    id: str
    name: str
    size: str
    date: str
    fileUrl: Optional[str] = None
    fileType: Optional[str] = None


class CommercialStageBase(BaseModel):
    stage_number: int = 1
    status: str = "in_progress"
    po_number: str = ""
    po_date: str = ""
    contract_value: str = ""
    is_saved: bool = False
    documents: List[DocumentItemSchema] = []


class CommercialStageCreate(BaseModel):
    stage_number: Optional[int] = None
    status: Optional[str] = "in_progress"
    po_number: Optional[str] = ""
    po_date: Optional[str] = ""
    contract_value: Optional[str] = ""
    is_saved: Optional[bool] = False
    documents: Optional[List[DocumentItemSchema]] = []


class CommercialStageUpdate(BaseModel):
    status: Optional[str] = None
    po_number: Optional[str] = None
    po_date: Optional[str] = None
    contract_value: Optional[str] = None
    is_saved: Optional[bool] = None
    documents: Optional[List[DocumentItemSchema]] = None


class CommercialStageResponse(CommercialStageBase):
    id: int
    project_key: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EngineeringStageBase(BaseModel):
    stage_number: int = 1
    status: str = "in_progress"
    documents: List[DocumentItemSchema] = []


class EngineeringStageCreate(BaseModel):
    stage_number: Optional[int] = None
    status: Optional[str] = "in_progress"
    documents: Optional[List[DocumentItemSchema]] = []


class EngineeringStageUpdate(BaseModel):
    status: Optional[str] = None
    documents: Optional[List[DocumentItemSchema]] = None


class EngineeringStageResponse(EngineeringStageBase):
    id: int
    project_key: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProjectBase(BaseModel):
    name: str
    client: str
    location: Optional[str] = "United Arab Emirates"
    code: str
    priority: str = "High"
    priority_level: str = "high"
    current_stage: int = 1
    total_stages: int = 7
    manager: Optional[str] = "Farhan Malik"
    supervisor: Optional[str] = "Site Supervisor"
    start_date: Optional[str] = None
    budget: Optional[str] = ""
    is_completed: bool = False
    completed_at: Optional[str] = None
    commercial_status: Optional[str] = "not_started"
    engineering_status: Optional[str] = "not_started"
    budget_status: Optional[str] = "not_started"
    procurement_status: Optional[str] = "not_started"
    resource_status: Optional[str] = "not_started"
    site_execution_status: Optional[str] = "not_started"
    handover_status: Optional[str] = "not_started"
    verified_progress_percentage: Optional[float] = 0.0


class ProjectCreate(ProjectBase):
    project_key: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client: Optional[str] = None
    location: Optional[str] = None
    priority: Optional[str] = None
    priority_level: Optional[str] = None
    current_stage: Optional[int] = None
    is_completed: Optional[bool] = None
    completed_at: Optional[str] = None
    commercial_status: Optional[str] = None
    engineering_status: Optional[str] = None
    budget_status: Optional[str] = None
    procurement_status: Optional[str] = None
    resource_status: Optional[str] = None
    site_execution_status: Optional[str] = None
    handover_status: Optional[str] = None


class CostingItemBase(BaseModel):
    sl_no: int = 1
    part_no: str = ""
    description: str = ""
    qty: float = 1.0
    purchase_unit_price: float = 0.0
    purchase_total: float = 0.0
    margin: float = 25.0
    selling_margin_percent: float = 25.0
    selling_unit_price: float = 0.0
    selling_total: float = 0.0
    vendor: Optional[str] = ""
    brand: Optional[str] = ""
    invoice_number: Optional[str] = ""
    procurement_status: Optional[str] = "Yet To Order"
    allocated_qty: Optional[float] = 0.0
    remaining_qty: Optional[float] = 0.0


class CostingItemCreate(CostingItemBase):
    pass


class CostingItemUpdate(BaseModel):
    sl_no: Optional[int] = None
    part_no: Optional[str] = None
    description: Optional[str] = None
    qty: Optional[float] = None
    purchase_unit_price: Optional[float] = None
    purchase_total: Optional[float] = None
    margin: Optional[float] = None
    selling_margin_percent: Optional[float] = None
    selling_unit_price: Optional[float] = None
    selling_total: Optional[float] = None
    vendor: Optional[str] = None
    brand: Optional[str] = None
    invoice_number: Optional[str] = None
    procurement_status: Optional[str] = None
    allocated_qty: Optional[float] = None


class CostingItemResponse(CostingItemBase):
    id: int
    project_key: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SOAItemBase(BaseModel):
    stage_number: Optional[int] = 1
    date: str = ""
    po_no: str = ""
    document_no: str = ""
    doc_type: str = "Tax Invoice"
    value: float = 0.0
    received: float = 0.0
    remarks: Optional[str] = ""
    mode: Optional[str] = "Cheque"
    balance: float = 0.0
    document_url: Optional[str] = ""
    document_name: Optional[str] = ""
    document_size: Optional[str] = ""


class SOAItemCreate(SOAItemBase):
    pass


class SOAItemUpdate(BaseModel):
    stage_number: Optional[int] = None
    date: Optional[str] = None
    po_no: Optional[str] = None
    document_no: Optional[str] = None
    doc_type: Optional[str] = None
    value: Optional[float] = None
    received: Optional[float] = None
    remarks: Optional[str] = None
    mode: Optional[str] = None
    balance: Optional[float] = None
    document_url: Optional[str] = None
    document_name: Optional[str] = None
    document_size: Optional[str] = None


class SOAItemResponse(SOAItemBase):
    id: int
    project_key: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ResourceItemBase(BaseModel):
    sl_no: int = 1
    name: str = ""
    type: str = "Internal"
    hours_worked: int = 8
    date: Optional[str] = None


class ResourceItemCreate(BaseModel):
    sl_no: Optional[int] = None
    name: str
    type: Optional[str] = "Internal"
    hours_worked: Optional[int] = 8
    date: Optional[str] = None


class ResourceItemUpdate(BaseModel):
    sl_no: Optional[int] = None
    name: Optional[str] = None
    type: Optional[str] = None
    hours_worked: Optional[int] = None
    date: Optional[str] = None


class ResourceItemResponse(ResourceItemBase):
    id: int
    project_key: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProjectResponse(ProjectBase):
    id: int
    project_key: str
    created_at: Optional[datetime] = None
    commercial_stages: List[CommercialStageResponse] = []
    engineering_stages: List[EngineeringStageResponse] = []
    costing_items: List[CostingItemResponse] = []
    soa_items: List[SOAItemResponse] = []
    resource_items: List[ResourceItemResponse] = []

    class Config:
        from_attributes = True

class SiteExecutionImageItem(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    url: str
    size: Optional[str] = None


class SiteExecutionLogBase(BaseModel):
    date: str
    supervisor_name: str = "Site Supervisor"
    creator_role: Optional[str] = "Site Supervisor"
    phase_name: str = "Daily Progress"
    description: str = ""
    images: List[SiteExecutionImageItem] = []


class SiteExecutionLogCreate(SiteExecutionLogBase):
    pass


class SiteExecutionLogUpdate(BaseModel):
    phase_name: Optional[str] = None
    description: Optional[str] = None
    images: Optional[List[SiteExecutionImageItem]] = None


class SiteExecutionLogResponse(SiteExecutionLogBase):
    id: int
    project_key: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SiteProgressUpdate(BaseModel):
    verified_progress_percentage: float

