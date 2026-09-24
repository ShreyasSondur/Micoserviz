from typing import Optional, List, Union, Any
from datetime import datetime
from pydantic import BaseModel, Field, model_validator


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1)
    raised_to: str = Field(..., min_length=1)
    project_key: Optional[str] = None
    project_name: Optional[str] = None
    priority: str = Field(default="medium")  # 'low', 'medium', 'high'
    note: Optional[str] = None


class TaskStatusUpdate(BaseModel):
    status: str = Field(...)  # 'not_started', 'in_progress', 'completed'


class TaskResponse(BaseModel):
    id: int
    title: str
    raised_by: str
    raised_to: str
    project_key: Optional[str] = None
    project_name: Optional[str] = None
    priority: str = "medium"
    note: Optional[str] = None
    status: str = "not_started"
    raised_date: str
    started_date: Optional[str] = None
    completed_date: Optional[str] = None
    is_active: bool = True
    created_at: Optional[Union[str, datetime]] = None
    updated_at: Optional[Union[str, datetime]] = None

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    items: List[TaskResponse]
    total_count: int
    active_count: int
    completed_count: int
