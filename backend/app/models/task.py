from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, func
from app.db.session import Base

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    raised_by = Column(String(100), nullable=False)
    raised_to = Column(String(100), nullable=False)
    project_key = Column(String(100), nullable=True)
    project_name = Column(String(255), nullable=True)
    priority = Column(String(50), default="medium", nullable=False)  # 'low', 'medium', 'high'
    note = Column(Text, nullable=True)
    status = Column(String(50), default="not_started", nullable=False)  # 'not_started', 'in_progress', 'completed'
    raised_date = Column(String(50), nullable=False)  # e.g. "22-09-2026"
    started_date = Column(String(50), nullable=True)
    completed_date = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
