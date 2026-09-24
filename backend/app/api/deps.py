from typing import Generator, List, Callable, Optional
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.config import settings
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.core.security import decode_access_token

security_bearer = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> User:
    raw_token = None
    if auth and auth.credentials:
        raw_token = auth.credentials
    elif token and token.strip():
        raw_token = token.strip()

    if not raw_token:
        if settings.DEV_OTP_MODE:
            dev_admin = db.query(User).filter(User.is_env_admin == True, User.is_active == True).first()
            if not dev_admin:
                dev_admin = db.query(User).filter(User.role == UserRole.ADMIN.value, User.is_active == True).first()
            if dev_admin:
                return dev_admin
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_access_token(raw_token)
    if not payload or "sub" not in payload:
        if settings.DEV_OTP_MODE:
            dev_admin = db.query(User).filter(User.is_env_admin == True, User.is_active == True).first()
            if dev_admin:
                return dev_admin
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account does not exist",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account has been deactivated or deleted",
        )
    
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required for this operation",
        )
    return current_user


def require_roles(*allowed_roles: str) -> Callable:
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {', '.join(allowed_roles)}",
            )
        return current_user
    return role_checker
