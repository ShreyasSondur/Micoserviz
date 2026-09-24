import datetime
import json
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.db.session import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    project_key = Column(String(50), unique=True, index=True, nullable=False) # e.g. "p1", "PRJ-2024-001"
    name = Column(String(255), nullable=False)
    client = Column(String(255), nullable=False)
    location = Column(String(255), nullable=True, default="United Arab Emirates")
    code = Column(String(100), nullable=False)
    priority = Column(String(50), nullable=False, default="High")
    priority_level = Column(String(50), nullable=False, default="high")
    current_stage = Column(Integer, default=1)
    total_stages = Column(Integer, default=7)
    manager = Column(String(100), default="Farhan Malik")
    supervisor = Column(String(100), default="Site Supervisor")
    start_date = Column(String(50), nullable=True)
    budget = Column(String(50), default="", nullable=True)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # 7 Section Statuses (unidirectional: not_started -> in_progress -> completed)
    commercial_status = Column(String(50), nullable=False, default="not_started")
    engineering_status = Column(String(50), nullable=False, default="not_started")
    budget_status = Column(String(50), nullable=False, default="not_started")
    procurement_status = Column(String(50), nullable=False, default="not_started")
    resource_status = Column(String(50), nullable=False, default="not_started")
    site_execution_status = Column(String(50), nullable=False, default="not_started")
    handover_status = Column(String(50), nullable=False, default="not_started")

    # Relationships
    verified_progress_percentage = Column(Float, nullable=False, default=0.0)

    commercial_stages = relationship("CommercialApprovalStage", back_populates="project", cascade="all, delete-orphan", order_by="CommercialApprovalStage.stage_number")
    engineering_stages = relationship("EngineeringDocumentationStage", back_populates="project", cascade="all, delete-orphan", order_by="EngineeringDocumentationStage.stage_number")
    costing_items = relationship("ProjectCostingItem", back_populates="project", cascade="all, delete-orphan", order_by="ProjectCostingItem.sl_no")
    procurement_items = relationship("ProjectProcurementItem", back_populates="project", cascade="all, delete-orphan", order_by="ProjectProcurementItem.sl_no")
    soa_items = relationship("ProjectSOAItem", back_populates="project", cascade="all, delete-orphan", order_by="ProjectSOAItem.id")
    resource_items = relationship("ProjectResourceItem", back_populates="project", cascade="all, delete-orphan", order_by="ProjectResourceItem.sl_no")
    site_execution_logs = relationship("ProjectSiteExecutionLog", back_populates="project", cascade="all, delete-orphan", order_by="ProjectSiteExecutionLog.id.desc()")


class CommercialApprovalStage(Base):
    __tablename__ = "commercial_approval_stages"

    id = Column(Integer, primary_key=True, index=True)
    project_key = Column(String(50), ForeignKey("projects.project_key"), nullable=False, index=True)
    stage_number = Column(Integer, nullable=False, default=1)
    status = Column(String(50), nullable=False, default="in_progress") # "in_progress" | "completed"
    po_number = Column(String(100), default="")
    po_date = Column(String(50), default="")
    contract_value = Column(String(100), default="")
    is_saved = Column(Boolean, default=False)
    documents_json = Column(Text, default="[]") # JSON string containing list of {id, name, size, date, fileUrl}
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project = relationship("Project", back_populates="commercial_stages")

    @property
    def documents(self):
        try:
            return json.loads(self.documents_json or "[]")
        except Exception:
            return []

    @documents.setter
    def documents(self, val):
        self.documents_json = json.dumps(val or [])


class EngineeringDocumentationStage(Base):
    __tablename__ = "engineering_documentation_stages"

    id = Column(Integer, primary_key=True, index=True)
    project_key = Column(String(50), ForeignKey("projects.project_key"), nullable=False, index=True)
    stage_number = Column(Integer, nullable=False, default=1)
    status = Column(String(50), nullable=False, default="in_progress") # "in_progress" | "completed"
    documents_json = Column(Text, default="[]") # JSON string containing list of {id, name, size, date, fileUrl}
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project = relationship("Project", back_populates="engineering_stages")

    @property
    def documents(self):
        try:
            return json.loads(self.documents_json or "[]")
        except Exception:
            return []

    @documents.setter
    def documents(self, val):
        self.documents_json = json.dumps(val or [])


class ProjectCostingItem(Base):
    __tablename__ = "project_costing_items"

    id = Column(Integer, primary_key=True, index=True)
    project_key = Column(String(50), ForeignKey("projects.project_key"), nullable=False, index=True)
    sl_no = Column(Integer, default=1)
    part_no = Column(String(100), nullable=False, default="")
    description = Column(String(255), nullable=False, default="")
    qty = Column(Float, nullable=False, default=1.0)
    purchase_unit_price = Column(Float, nullable=False, default=0.0)
    purchase_total = Column(Float, nullable=False, default=0.0)
    margin = Column(Float, nullable=False, default=0.65) # e.g. cost factor 0.65
    selling_margin_percent = Column(Float, nullable=False, default=35.0) # e.g. 35%
    selling_unit_price = Column(Float, nullable=False, default=0.0)
    selling_total = Column(Float, nullable=False, default=0.0)
    vendor = Column(String(150), default="")
    brand = Column(String(150), default="")
    invoice_number = Column(String(100), default="")
    procurement_status = Column(String(50), default="Yet To Order") # Added, Partially Added, Yet To Order
    allocated_qty = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project = relationship("Project", back_populates="costing_items")


class ProjectSOAItem(Base):
    __tablename__ = "project_soa_items"

    id = Column(Integer, primary_key=True, index=True)
    project_key = Column(String(50), ForeignKey("projects.project_key"), nullable=False, index=True)
    stage_number = Column(Integer, nullable=False, default=1)
    date = Column(String(50), default="")
    po_no = Column(String(100), default="")
    document_no = Column(String(100), default="")
    doc_type = Column(String(100), default="Tax Invoice") # Tax Invoice, Proforma Invoice, Delivery Note, etc.
    value = Column(Float, default=0.0)
    received = Column(Float, default=0.0)
    remarks = Column(String(255), default="")
    mode = Column(String(50), default="Cheque") # Cheque, Cash, Online, Bank Transfer, Card
    balance = Column(Float, default=0.0)
    document_url = Column(Text, default="")
    document_name = Column(String(255), default="")
    document_size = Column(String(50), default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project = relationship("Project", back_populates="soa_items")


class ProjectResourceItem(Base):
    __tablename__ = "project_resource_items"

    id = Column(Integer, primary_key=True, index=True)
    project_key = Column(String(50), ForeignKey("projects.project_key"), nullable=False, index=True)
    sl_no = Column(Integer, default=1)
    name = Column(String(150), nullable=False)
    type = Column(String(50), default="Internal") # "Internal" | "External"
    hours_worked = Column(Integer, default=8) # 1 to 9
    date = Column(String(50), nullable=True) # e.g. "2026-09-21"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project = relationship("Project", back_populates="resource_items")

class ProjectSiteExecutionLog(Base):
    __tablename__ = "project_site_execution_logs"

    id = Column(Integer, primary_key=True, index=True)
    project_key = Column(String(50), ForeignKey("projects.project_key"), nullable=False, index=True)
    date = Column(String(50), nullable=False, index=True)
    supervisor_name = Column(String(150), default="Site Supervisor")
    creator_role = Column(String(50), default="Site Supervisor")
    phase_name = Column(String(200), default="Daily Site Progress")
    description = Column(Text, default="")
    images_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("Project", back_populates="site_execution_logs")

    @property
    def images(self):
        try:
            return json.loads(self.images_json or "[]")
        except Exception:
            return []

    @images.setter
    def images(self, val):
        self.images_json = json.dumps(val or [])


class ProjectProcurementItem(Base):
    __tablename__ = "project_procurement_items"

    id = Column(Integer, primary_key=True, index=True)
    project_key = Column(String(50), ForeignKey("projects.project_key"), nullable=False, index=True)
    sl_no = Column(Integer, default=1)
    part_no = Column(String(100), nullable=False, default="")
    product_name = Column(String(255), nullable=False, default="")
    vendor = Column(String(150), default="", nullable=True)
    brand = Column(String(150), default="", nullable=True)
    qty = Column(Float, nullable=False, default=1.0)
    allocated_qty = Column(Float, nullable=False, default=0.0)
    status = Column(String(50), default="Yet To Order", nullable=False) # "Added" | "Partially Added" | "Yet To Order" | "Yet To Deliver"
    invoice_number = Column(String(100), default="", nullable=True)
    notes = Column(Text, default="", nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project = relationship("Project", back_populates="procurement_items")

