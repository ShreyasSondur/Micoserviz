from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import SessionLocal
from app.api.deps import get_db, get_current_user
from app.models.user import User, UserRole
from app.models.otp import OTPVerification
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    VerifyOTPRequest,
    ResendOTPRequest,
    ResendOTPResponse,
    TokenResponse,
    VerifyAdminPasswordRequest,
)
from app.schemas.user import UserResponse
from app.core.security import (
    verify_password,
    create_access_token,
    get_password_hash,
)
from app.core.otp import generate_otp_code, send_otp_email

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    identifier = request.username_or_email.strip().lower()
    password = request.password

    # 1. Check for Admin Special Access match from .env
    is_env_admin_match = (
        (identifier == settings.ADMIN_USERNAME.lower() or identifier == settings.ADMIN_EMAIL.lower())
        and password == settings.ADMIN_PASSWORD
    )

    user = db.query(User).filter(
        (User.username.ilike(identifier)) | (User.email.ilike(identifier))
    ).first()

    if is_env_admin_match:
        # If admin user not yet in DB, initialize record
        if not user:
            user = User(
                username=settings.ADMIN_USERNAME,
                email=settings.ADMIN_EMAIL,
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                role=UserRole.ADMIN.value,
                is_active=True,
                is_env_admin=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
    else:
        # Only users created by admin in DB can log in
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email/username or password",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account has been deactivated or deleted by Admin",
            )

        if not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email/username or password",
            )

    # 2. Universal Login: All users (Admin & Admin-created users) require 6-digit OTP email verification
    otp_code = generate_otp_code(6)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    # Invalidate existing unused OTPs for this user's email
    db.query(OTPVerification).filter(
        OTPVerification.email.ilike(user.email),
        OTPVerification.is_used == False,
    ).update({"is_used": True}, synchronize_session=False)

    otp_record = OTPVerification(
        user_id=user.id,
        email=user.email,
        otp_code=otp_code,
        expires_at=expires_at,
        is_used=False,
    )
    db.add(otp_record)
    db.commit()

    # Dispatch email via Resend or SMTP
    email_sent = send_otp_email(user.email, otp_code, user.username)
    if not email_sent and settings.SMTP_ENABLED and not settings.DEV_OTP_MODE:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to dispatch verification email. Note: Render free tier blocks outbound SMTP ports (587). Please set DEV_OTP_MODE=True or configure RESEND_API_KEY in Render environment variables.",
        )

    return LoginResponse(
        requires_otp=True,
        email=user.email,
        message=f"Verification code sent to {user.email}" if email_sent else "Email delivery skipped/blocked. OTP available in server logs / Dev mode.",
        dev_otp=otp_code if (settings.DEV_OTP_MODE or not settings.SMTP_ENABLED) else None,
    )


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp(request: VerifyOTPRequest, db: Session = Depends(get_db)):
    email = request.email.strip().lower()
    otp_code = request.otp_code.strip()

    user = db.query(User).filter(
        (User.email.ilike(email)) | (User.username.ilike(email))
    ).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated or deleted",
        )

    # Validate OTP
    valid_otp = db.query(OTPVerification).filter(
        (OTPVerification.email.ilike(user.email)) | (OTPVerification.user_id == user.id),
        OTPVerification.otp_code == otp_code,
        OTPVerification.is_used == False,
        OTPVerification.expires_at >= datetime.utcnow(),
    ).order_by(OTPVerification.created_at.desc()).first()

    if not valid_otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code",
        )

    # Mark OTP as used
    valid_otp.is_used = True
    db.commit()

    # Issue JWT token
    token = create_access_token(
        subject=user.id,
        role=user.role,
        email=user.email,
        username=user.username,
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post("/resend-otp", response_model=ResendOTPResponse)
def resend_otp(request: ResendOTPRequest, db: Session = Depends(get_db)):
    email = request.email.strip().lower()
    user = db.query(User).filter(
        (User.email.ilike(email)) | (User.username.ilike(email))
    ).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated or deleted",
        )

    # Invalidate older OTPs
    db.query(OTPVerification).filter(
        (OTPVerification.email.ilike(user.email)) | (OTPVerification.user_id == user.id),
        OTPVerification.is_used == False,
    ).update({"is_used": True}, synchronize_session=False)

    otp_code = generate_otp_code(6)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    otp_record = OTPVerification(
        user_id=user.id,
        email=user.email,
        otp_code=otp_code,
        expires_at=expires_at,
        is_used=False,
    )
    db.add(otp_record)
    db.commit()

    email_sent = send_otp_email(user.email, otp_code, user.username)
    if not email_sent and settings.SMTP_ENABLED and not settings.DEV_OTP_MODE:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to dispatch verification email. Note: Render free tier blocks outbound SMTP ports (587). Please set DEV_OTP_MODE=True or configure RESEND_API_KEY in Render environment variables.",
        )

    return ResendOTPResponse(
        message=f"A new verification code has been dispatched to {user.email}" if email_sent else "Email delivery skipped/blocked. OTP available in server logs / Dev mode.",
        dev_otp=otp_code if (settings.DEV_OTP_MODE or not settings.SMTP_ENABLED) else None,
    )


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.post("/verify-admin-password")
def verify_admin_password(
    request: VerifyAdminPasswordRequest,
    db: Session = Depends(get_db),
):
    entered_pw = request.password.strip()
    if not entered_pw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password cannot be empty",
        )

    # 1. Match against .env ADMIN_PASSWORD
    if entered_pw == settings.ADMIN_PASSWORD:
        return {"valid": True, "message": "Admin password verified successfully"}

    # 2. Match against any Admin user's hashed password in DB
    admin_users = db.query(User).filter(
        (User.role == UserRole.ADMIN.value) | (User.is_env_admin == True)
    ).all()
    for u in admin_users:
        if verify_password(entered_pw, u.hashed_password):
            return {"valid": True, "message": "Admin password verified successfully"}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect admin password. Action denied.",
    )

