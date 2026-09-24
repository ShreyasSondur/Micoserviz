from typing import Optional
from pydantic import BaseModel, EmailStr
from app.schemas.user import UserResponse


class LoginRequest(BaseModel):
    username_or_email: str
    password: str


class LoginResponse(BaseModel):
    requires_otp: bool
    message: str
    email: Optional[str] = None
    access_token: Optional[str] = None
    token_type: Optional[str] = "bearer"
    user: Optional[UserResponse] = None
    dev_otp: Optional[str] = None  # Available only when DEV_OTP_MODE is True


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp_code: str


class ResendOTPRequest(BaseModel):
    email: EmailStr


class ResendOTPResponse(BaseModel):
    message: str
    dev_otp: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class VerifyAdminPasswordRequest(BaseModel):
    password: str

