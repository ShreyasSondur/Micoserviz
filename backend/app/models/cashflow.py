from sqlalchemy import Column, String, Boolean, Float
from app.db.session import Base
from app.db.base import TimestampMixin, generate_uuid


class PettyCashTransaction(Base, TimestampMixin):
    __tablename__ = "petty_cash_transactions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    type = Column(String(20), nullable=False)  # "Cash In" or "Cash Out"
    amount = Column(Float, nullable=False, default=0.0)
    invoice_number = Column(String(100), nullable=True, index=True)
    invoice_id = Column(String(36), nullable=True, index=True)
    description = Column(String(500), nullable=False)
    date = Column(String(20), nullable=False)  # YYYY-MM-DD
    is_active = Column(Boolean, default=True, nullable=False)

    # Document Attachment fields
    file_name = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=True)
    file_type = Column(String(100), nullable=True)
    file_size = Column(String(50), nullable=True)

    def __repr__(self):
        return f"<PettyCashTransaction(id={self.id}, type={self.type}, amount={self.amount})>"


class CreditLoanItem(Base, TimestampMixin):
    __tablename__ = "credit_loans"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    description = Column(String(500), nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    invoice_number = Column(String(100), nullable=True, index=True)
    invoice_id = Column(String(36), nullable=True, index=True)
    date = Column(String(20), nullable=False)  # YYYY-MM-DD
    is_active = Column(Boolean, default=True, nullable=False)

    # Document Attachment fields
    file_name = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=True)
    file_type = Column(String(100), nullable=True)
    file_size = Column(String(50), nullable=True)

    def __repr__(self):
        return f"<CreditLoanItem(id={self.id}, desc={self.description}, amount={self.amount})>"
