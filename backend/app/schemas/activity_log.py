import datetime
from typing import Optional
from pydantic import BaseModel


class ActivityLogCreate(BaseModel):
    user: Optional[str] = "Admin"
    project_name: Optional[str] = "—"
    project_key: Optional[str] = None
    module: str
    action: str


class ActivityLogResponse(BaseModel):
    id: int
    user: str
    projectName: str
    projectKey: Optional[str] = None
    module: str
    action: str
    time: str
    created_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True
