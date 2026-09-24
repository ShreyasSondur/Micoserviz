from sqlalchemy import Column, String, Boolean
from app.db.session import Base
from app.db.base import TimestampMixin, generate_uuid


class Manpower(Base, TimestampMixin):
    __tablename__ = "manpower"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), index=True, nullable=False)
    type = Column(String(20), nullable=False, default="Internal")  # "Internal" or "External"
    is_active = Column(Boolean, default=True, nullable=False)

    def __repr__(self):
        return f"<Manpower(name={self.name}, type={self.type}, is_active={self.is_active})>"
