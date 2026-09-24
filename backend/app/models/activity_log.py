import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.db.base import Base


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user = Column(String(150), nullable=False, default="Admin")
    project_name = Column(String(200), nullable=False, default="—")
    project_key = Column(String(100), nullable=True, default=None)
    module = Column(String(100), nullable=False)
    action = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    @property
    def time_str(self) -> str:
        if not self.created_at:
            return ""
        return self.created_at.strftime("%d %b %Y, %I:%M %p")
