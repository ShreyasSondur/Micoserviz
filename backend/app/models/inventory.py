import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base


class InventoryItem(Base):
    __tablename__ = "master_inventory"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_name = Column(String(255), nullable=False, index=True)
    vendor = Column(String(255), nullable=True, default="")
    brand = Column(String(255), nullable=False)
    part_number = Column(String(255), nullable=False, index=True)
    quantity = Column(Integer, nullable=False, default=0)
    
    invoice_id = Column(String(36), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    invoice_number = Column(String(100), nullable=True, default="", index=True)
    
    availability = Column(String(50), nullable=False, default="Available")
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Optional relationship to Invoice
    invoice = relationship("Invoice", foreign_keys=[invoice_id], lazy="joined")


class MasterPart(Base):
    __tablename__ = "master_parts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    part_number = Column(String(255), unique=True, nullable=False, index=True)
    product_name = Column(String(255), nullable=True, default="")
    brand = Column(String(255), nullable=True, default="")
    vendor = Column(String(255), nullable=True, default="")
    description = Column(String(500), nullable=True, default="")
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

