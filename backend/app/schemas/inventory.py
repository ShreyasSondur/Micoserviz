from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, model_validator


class InventoryBase(BaseModel):
    product_name: str
    vendor: Optional[str] = ""
    brand: str
    part_number: str
    quantity: int = 1
    invoice_number: str
    invoice_id: Optional[str] = None
    availability: Optional[str] = "Available"

    model_config = ConfigDict(from_attributes=True)


class InventoryCreate(BaseModel):
    product_name: Optional[str] = ""
    vendor: Optional[str] = ""
    brand: Optional[str] = ""
    part_number: str
    quantity: int = 1
    invoice_number: str
    invoice_id: Optional[str] = None
    availability: Optional[str] = "Available"


class InventoryUpdate(BaseModel):
    product_name: Optional[str] = None
    vendor: Optional[str] = None
    brand: Optional[str] = None
    part_number: Optional[str] = None
    quantity: Optional[int] = None
    invoice_number: Optional[str] = None
    invoice_id: Optional[str] = None
    availability: Optional[str] = None


class InventoryResponse(InventoryBase):
    id: str
    invoice_file_name: Optional[str] = None
    invoice_file_size: Optional[str] = None
    invoice_file_type: Optional[str] = None
    has_invoice_file: bool = False
    is_active: bool
    created_at: datetime
    available_quantity: Optional[int] = None
    allocated_quantity: Optional[int] = None
    active_projects_count: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def populate_invoice_details(cls, data: Any) -> Any:
        if hasattr(data, "created_at") and not isinstance(data, dict):
            invoice_obj = getattr(data, "invoice", None)
            inv_file_name = getattr(invoice_obj, "file_name", None) if invoice_obj else None
            inv_file_size = getattr(invoice_obj, "file_size", None) if invoice_obj else None
            inv_file_type = getattr(invoice_obj, "file_type", None) if invoice_obj else None
            inv_file_path = getattr(invoice_obj, "file_path", None) if invoice_obj else None
            inv_id_val = getattr(data, "invoice_id", None) or (str(invoice_obj.id) if invoice_obj else None)

            return {
                "id": str(getattr(data, "id")),
                "product_name": getattr(data, "product_name", ""),
                "vendor": getattr(data, "vendor", "") or (getattr(invoice_obj, "vendor", "") if invoice_obj else ""),
                "brand": getattr(data, "brand", ""),
                "part_number": getattr(data, "part_number", ""),
                "quantity": int(getattr(data, "quantity", 1) or 1),
                "invoice_number": getattr(data, "invoice_number", ""),
                "invoice_id": str(inv_id_val) if inv_id_val else None,
                "invoice_file_name": inv_file_name,
                "invoice_file_size": inv_file_size,
                "invoice_file_type": inv_file_type,
                "has_invoice_file": bool(inv_file_path or inv_file_name),
                "availability": getattr(data, "availability", "Available") or "Available",
                "is_active": getattr(data, "is_active", True),
                "created_at": getattr(data, "created_at") or datetime.utcnow(),
                "available_quantity": getattr(data, "available_quantity", None),
                "allocated_quantity": getattr(data, "allocated_quantity", None),
                "active_projects_count": getattr(data, "active_projects_count", None),
            }
        return data


class InventoryListResponse(BaseModel):
    items: List[InventoryResponse]
    total_count: int


class PartCreate(BaseModel):
    product_name: str
    part_number: str
    description: Optional[str] = ""


class PartResponse(BaseModel):
    id: str
    product_name: Optional[str] = ""
    part_number: str
    description: Optional[str] = ""
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PartListResponse(BaseModel):
    items: List[PartResponse]
    total_count: int


class ActiveProjectAllocationSchema(BaseModel):
    project_key: str
    project_name: str
    project_code: str
    required_qty: float
    allocated_qty: float
    remaining_qty: float
    status: str


class PartAllocationOverviewSchema(BaseModel):
    part_number: str
    total_received: float
    total_allocated: float
    available_in_warehouse: float
    total_consumed: Optional[float] = 0.0
    total_in_warehouse: Optional[float] = 0.0
    remaining_in_warehouse: Optional[float] = 0.0
    active_projects: List[ActiveProjectAllocationSchema]


class LinkedInvoiceItemSchema(BaseModel):
    invoice_number: str
    invoice_id: Optional[str] = None
    vendor: Optional[str] = ""
    invoice_date: Optional[str] = ""
    quantity: int = 0
    file_name: Optional[str] = None
    has_file: bool = False
    created_at: Optional[datetime] = None


class ProjectInvoiceAllocationSchema(BaseModel):
    project_key: str
    project_name: str
    project_code: str
    vendor: Optional[str] = ""
    quantity: float = 0.0
    invoice_number: str
    invoice_id: Optional[str] = None
    invoice_date: Optional[str] = ""
    file_name: Optional[str] = None
    has_file: bool = False


class PartDrillDownDetailsResponse(BaseModel):
    part_number: str
    product_name: str
    description: Optional[str] = ""
    total_inventory: float
    total_in_warehouse: Optional[float] = 0.0
    total_allocated: float
    available_in_warehouse: float
    remaining_in_warehouse: Optional[float] = 0.0
    total_consumed: Optional[float] = 0.0
    active_projects: List[ActiveProjectAllocationSchema]
    linked_invoices: List[LinkedInvoiceItemSchema]
    project_invoice_allocations: Optional[List[ProjectInvoiceAllocationSchema]] = []



