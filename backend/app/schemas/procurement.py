from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ProcurementItemBase(BaseModel):
    sl_no: int = 1
    part_no: str = ""
    product_name: str = ""
    vendor: Optional[str] = ""
    brand: Optional[str] = ""
    qty: float = 1.0
    allocated_qty: float = 0.0
    status: str = "Yet To Order"
    invoice_number: Optional[str] = ""
    notes: Optional[str] = ""

    model_config = ConfigDict(from_attributes=True)


class ProcurementItemCreate(BaseModel):
    sl_no: Optional[int] = None
    part_no: str
    product_name: Optional[str] = ""
    vendor: Optional[str] = ""
    brand: Optional[str] = ""
    qty: float = 1.0
    allocated_qty: Optional[float] = 0.0
    status: Optional[str] = "Yet To Order"
    invoice_number: Optional[str] = ""
    notes: Optional[str] = ""


class ProcurementItemUpdate(BaseModel):
    sl_no: Optional[int] = None
    part_no: Optional[str] = None
    product_name: Optional[str] = None
    vendor: Optional[str] = None
    brand: Optional[str] = None
    qty: Optional[float] = None
    allocated_qty: Optional[float] = None
    status: Optional[str] = None
    invoice_number: Optional[str] = None
    notes: Optional[str] = None


class ProcurementItemResponse(ProcurementItemBase):
    id: int
    project_key: str
    remaining_qty: float = 0.0
    available_stock: float = 0.0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProcurementItemListResponse(BaseModel):
    items: List[ProcurementItemResponse]
    total_count: int


class ProcurementItemShift(BaseModel):
    source_project_key: str
    part_no: str
    quantity: float
    notes: Optional[str] = ""


class ProcurementShiftResponse(BaseModel):
    source_project_key: str
    destination_project_key: str
    part_no: str
    shifted_quantity: float
    source_remaining_allocated: float
    destination_total_allocated: float
    message: str

