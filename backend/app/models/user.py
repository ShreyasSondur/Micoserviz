from datetime import datetime
import enum
from sqlalchemy import Column, String, Boolean, DateTime
from app.db.session import Base
from app.db.base import TimestampMixin, generate_uuid


class UserRole(str, enum.Enum):
    ADMIN = "Admin"
    PROJECT_MANAGER = "Project Manager"
    PROCUREMENT = "Procurement"
    SITE_SUPERVISOR = "Site Supervisor"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    username = Column(String(100), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default=UserRole.PROJECT_MANAGER.value)
    is_active = Column(Boolean, default=True, nullable=False)
    is_env_admin = Column(Boolean, default=False, nullable=False)

    def __repr__(self):
        return f"<User(username={self.username}, role={self.role}, is_active={self.is_active})>"
