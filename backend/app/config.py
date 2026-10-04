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

    # Admin Special Access Credentials (loaded from .env)
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@microservice.io"
    ADMIN_PASSWORD: str = ""

    # JWT
    JWT_SECRET: str = "microservice-jwt-secret-key-change-in-production-2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Storage Root (Used only if local fallback is required)
    STORAGE_ROOT: str = str(BACKEND_DIR / "storage" / "MicroServiceData")

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def resolve_database_url(cls, v: Any) -> str:
        if isinstance(v, str):
            if v.startswith("postgres://"):
                v = v.replace("postgres://", "postgresql+psycopg2://", 1)
            elif v.startswith("postgresql://") and not v.startswith("postgresql+"):
                v = v.replace("postgresql://", "postgresql+psycopg2://", 1)
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

    # OTP & Email Settings (loaded from .env)
    DEV_OTP_MODE: bool = False
    OTP_EXPIRE_MINUTES: int = 10
    SMTP_ENABLED: bool = False
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAILS_FROM_EMAIL: str = "noreply@microservice.io"
    EMAILS_FROM_NAME: str = "MicroService ERP"
    EMAILS_TO_EMAIL: str = ""
    RESEND_API_KEY: str = ""

    # Backblaze B2 / S3 Storage Settings (loaded from .env)
    B2_ENABLED: bool = True
    B2_ENDPOINT_URL: str = "https://s3.us-east-005.backblazeb2.com"
    B2_KEY_ID: str = ""
    B2_APPLICATION_KEY: str = ""
    B2_BUCKET_NAME: str = "Microservice"
    B2_REGION_NAME: str = "us-east-005"

    # CORS Allowed Origins (loaded dynamically from .env, comma-separated or JSON list)
    BACKEND_CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
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


