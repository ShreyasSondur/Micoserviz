from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, model_validator


class InvoiceBase(BaseModel):
    invoice_number: str
    vendor: Optional[str] = ""
    invoice_date: str
    total_amount: float = 0.0
    currency: str = "AED"
    status: str = "Verified"

    model_config = ConfigDict(from_attributes=True)


class InvoiceCreate(BaseModel):
    invoice_number: str
    vendor: Optional[str] = ""
    invoice_date: str
    total_amount: float = 0.0


class InvoiceUpdate(BaseModel):
    invoice_number: Optional[str] = None
    vendor: Optional[str] = None
    invoice_date: Optional[str] = None
    total_amount: Optional[float] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None


class InvoiceResponse(InvoiceBase):
    id: str
    file_name: Optional[str] = None
    file_size: Optional[str] = None
    file_type: Optional[str] = None
    has_file: bool = False
    is_active: bool
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def populate_file_status(cls, data: Any) -> Any:
        if hasattr(data, "created_at") and not isinstance(data, dict):
            file_path_val = getattr(data, "file_path", None)
            return {
                "id": str(getattr(data, "id")),
                "invoice_number": getattr(data, "invoice_number", ""),
                "vendor": getattr(data, "vendor", ""),
                "invoice_date": getattr(data, "invoice_date", ""),
                "total_amount": float(getattr(data, "total_amount", 0.0) or 0.0),
                "currency": getattr(data, "currency", "AED"),
                "file_name": getattr(data, "file_name", None),
                "file_size": getattr(data, "file_size", None),
                "file_type": getattr(data, "file_type", None),
                "has_file": bool(file_path_val),
                "status": getattr(data, "status", "Verified"),
                "is_active": getattr(data, "is_active", True),
                "created_at": getattr(data, "created_at") or datetime.utcnow(),
            }
        return data


class InvoiceMetrics(BaseModel):
    total_count: int
    total_amount_aed: float
    vendors_count: int


class InvoiceListResponse(BaseModel):
    items: List[InvoiceResponse]
    metrics: InvoiceMetrics
