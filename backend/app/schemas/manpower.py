from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, model_validator


class ManpowerBase(BaseModel):
    name: str
    type: str = "Internal"  # "Internal" or "External"

    model_config = ConfigDict(from_attributes=True)


class ManpowerCreate(ManpowerBase):
    pass


class ManpowerUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    is_active: Optional[bool] = None


class ManpowerResponse(ManpowerBase):
    id: str
    is_active: bool
    created_at: datetime
    date_added: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def populate_date_added(cls, data: Any) -> Any:
        if hasattr(data, "created_at") and not isinstance(data, dict):
            created_at_val = getattr(data, "created_at", None)
            date_str = created_at_val.strftime("%Y-%m-%d") if created_at_val else datetime.utcnow().strftime("%Y-%m-%d")
            return {
                "id": str(getattr(data, "id")),
                "name": getattr(data, "name", ""),
                "type": getattr(data, "type", "Internal"),
                "is_active": getattr(data, "is_active", True),
                "created_at": created_at_val or datetime.utcnow(),
                "date_added": date_str,
            }
        return data


class ManpowerMetrics(BaseModel):
    total: int
    internal: int
    external: int


class ManpowerListResponse(BaseModel):
    items: List[ManpowerResponse]
    metrics: ManpowerMetrics
