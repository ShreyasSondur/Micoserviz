from typing import Optional, List, Union, Any
from datetime import datetime
from pydantic import BaseModel, Field, model_validator


class PettyCashBase(BaseModel):
    type: str  # "Cash In" or "Cash Out"
    amount: float = Field(..., gt=0)
    description: str
    invoice_number: Optional[str] = None
    invoice_id: Optional[str] = None
    date: Optional[str] = None


class PettyCashCreate(PettyCashBase):
    pass


class PettyCashResponse(PettyCashBase):
    id: str
    date: str
    is_active: bool
    created_at: Optional[Union[str, datetime]] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def format_fields(cls, data: Any) -> Any:
        if hasattr(data, "id") and not isinstance(data, dict):
            return {
                "id": str(getattr(data, "id")),
                "type": getattr(data, "type", "Cash In"),
                "amount": float(getattr(data, "amount", 0.0)),
                "description": getattr(data, "description", ""),
                "invoice_number": getattr(data, "invoice_number", None),
                "invoice_id": getattr(data, "invoice_id", None),
                "date": getattr(data, "date", ""),
                "is_active": getattr(data, "is_active", True),
                "created_at": getattr(data, "created_at", None),
                "file_name": getattr(data, "file_name", None),
                "file_type": getattr(data, "file_type", None),
                "file_size": getattr(data, "file_size", None),
            }
        return data

    class Config:
        from_attributes = True


class PettyCashListResponse(BaseModel):
    items: List[PettyCashResponse]
    total_balance: float
    total_cash_in: float
    total_cash_out: float


class CreditLoanBase(BaseModel):
    description: str
    amount: float = Field(..., gt=0)
    invoice_number: Optional[str] = None
    invoice_id: Optional[str] = None
    date: Optional[str] = None


class CreditLoanCreate(CreditLoanBase):
    pass


class CreditLoanResponse(CreditLoanBase):
    id: str
    date: str
    is_active: bool
    created_at: Optional[Union[str, datetime]] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def format_fields(cls, data: Any) -> Any:
        if hasattr(data, "id") and not isinstance(data, dict):
            return {
                "id": str(getattr(data, "id")),
                "description": getattr(data, "description", ""),
                "amount": float(getattr(data, "amount", 0.0)),
                "invoice_number": getattr(data, "invoice_number", None),
                "invoice_id": getattr(data, "invoice_id", None),
                "date": getattr(data, "date", ""),
                "is_active": getattr(data, "is_active", True),
                "created_at": getattr(data, "created_at", None),
                "file_name": getattr(data, "file_name", None),
                "file_type": getattr(data, "file_type", None),
                "file_size": getattr(data, "file_size", None),
            }
        return data

    class Config:
        from_attributes = True


class CreditLoanListResponse(BaseModel):
    items: List[CreditLoanResponse]
    total_amount: float


class CashflowSummaryResponse(BaseModel):
    petty_balance: float
    total_cash_in: float
    total_cash_out: float
    total_credit_loans: float
    petty_count: int
    loans_count: int
