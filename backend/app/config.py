import os
import json
from pathlib import Path
from typing import Any, List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    PROJECT_NAME: str = "MicroService ERP"
    API_V1_STR: str = "/api/v1"

    # Database
    DATABASE_URL: str = f"sqlite:///{BACKEND_DIR / 'microservice.db'}"

    # Admin Special Access Credentials (from .env)
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@microservice.io"
    ADMIN_PASSWORD: str = "Admin@2026!"

    # JWT
    JWT_SECRET: str = "e9c40b8a4f61f7d23a54b9d031c28741e9b27d4c82f912e7539bc27a1348e025"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Storage Root
    STORAGE_ROOT: str = str(BACKEND_DIR / "storage" / "MicroServiceData")

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def resolve_database_url(cls, v: Any) -> str:
        if isinstance(v, str):
            if v.startswith("postgres://"):
                v = v.replace("postgres://", "postgresql://", 1)
            elif v.startswith("sqlite"):
                # If it's a relative path sqlite URL like sqlite:///./microservice.db
                db_path = BACKEND_DIR / "microservice.db"
                return f"sqlite:///{db_path.as_posix()}"
        return str(v)

    @field_validator("STORAGE_ROOT", mode="before")
    @classmethod
    def resolve_storage_root(cls, v: Any) -> str:
        if isinstance(v, str):
            if v.startswith("./") or v.startswith(".\\") or not Path(v).is_absolute():
                cleaned = v.lstrip("./").lstrip(".\\")
                return str(BACKEND_DIR / cleaned)
        return str(v)

    # OTP & Email Settings

    DEV_OTP_MODE: bool = False
    OTP_EXPIRE_MINUTES: int = 10
    SMTP_ENABLED: bool = True
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_USER: str = "servizwebsite@gmail.com"
    SMTP_PASSWORD: str = "yqvpopslmekmcekd"
    EMAILS_FROM_EMAIL: str = "servizwebsite@gmail.com"
    EMAILS_FROM_NAME: str = "MicroService ERP"
    EMAILS_TO_EMAIL: str = "servizwebsite@gmail.com"
    RESEND_API_KEY: str = ""

    # CORS
    BACKEND_CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://micoserviz.vercel.app",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            if v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    pass
            return [item.strip() for item in v.split(",") if item.strip()]
        elif isinstance(v, (list, tuple)):
            return [str(item).strip() for item in v if str(item).strip()]
        return []

    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )


settings = Settings()


