from datetime import datetime
import uuid
from sqlalchemy import Column, DateTime, String
from app.db.session import Base


class TimestampMixin:
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


def generate_uuid() -> str:
    return str(uuid.uuid4())
