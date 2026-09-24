from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, ConfigDict, model_validator
from app.models.user import UserRole


class UserBase(BaseModel):
    username: str
    name: Optional[str] = None
    email: EmailStr
    role: UserRole

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def reconcile_username_and_name(cls, data: Any) -> Any:
        if hasattr(data, "username") and not isinstance(data, dict):
            return data
        if isinstance(data, dict):
            if not data.get("username") and data.get("name"):
                data["username"] = data["name"]
            elif not data.get("name") and data.get("username"):
                data["name"] = data["username"]
        return data


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile_update_name(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("username") and data.get("name"):
                data["username"] = data["name"]
        return data


class UserResponse(UserBase):
    id: str
    is_active: bool
    is_env_admin: bool
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def populate_response_name(cls, data: Any) -> Any:
        if hasattr(data, "username") and not isinstance(data, dict):
            username_val = getattr(data, "username", "")
            return {
                "id": str(getattr(data, "id")),
                "username": username_val,
                "name": getattr(data, "name", None) or username_val,
                "email": getattr(data, "email"),
                "role": getattr(data, "role"),
                "is_active": getattr(data, "is_active", True),
                "is_env_admin": getattr(data, "is_env_admin", False),
                "created_at": getattr(data, "created_at"),
            }
        if isinstance(data, dict):
            if not data.get("name") and data.get("username"):
                data["name"] = data["username"]
        return data


class UserMetrics(BaseModel):
    total: int
    project_managers: int
    procurement: int
    site_supervisors: int
    admins: int
    projectManagers: Optional[int] = None
    siteSupervisors: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def set_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "project_managers" in data and "projectManagers" not in data:
                data["projectManagers"] = data["project_managers"]
            if "site_supervisors" in data and "siteSupervisors" not in data:
                data["siteSupervisors"] = data["site_supervisors"]
        return data


class UserListResponse(BaseModel):
    users: List[UserResponse]
    metrics: UserMetrics

