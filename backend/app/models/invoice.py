from sqlalchemy import Column, String, Boolean, Float
from app.db.session import Base
from app.db.base import TimestampMixin, generate_uuid


class Invoice(Base, TimestampMixin):
    __tablename__ = "invoices"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    invoice_number = Column(String(100), unique=True, index=True, nullable=False)
    vendor = Column(String(200), index=True, nullable=True, default="")
    invoice_date = Column(String(20), nullable=False)  # YYYY-MM-DD
    total_amount = Column(Float, nullable=False, default=0.0)
    currency = Column(String(10), nullable=False, default="AED")
    file_name = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=True)
    file_size = Column(String(50), nullable=True)
    file_type = Column(String(255), nullable=True)
    status = Column(String(50), nullable=False, default="Verified")
    is_active = Column(Boolean, default=True, nullable=False)

    def __repr__(self):
        return f"<Invoice(number={self.invoice_number}, vendor={self.vendor}, amount={self.total_amount})>"
