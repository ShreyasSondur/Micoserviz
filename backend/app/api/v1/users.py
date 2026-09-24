from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, get_current_user
from app.models.user import User, UserRole
from app.models.otp import OTPVerification
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserListResponse,
    UserMetrics,
)
from app.core.security import get_password_hash

router = APIRouter(prefix="/users", tags=["Users Management"])


def compute_user_metrics(db: Session) -> UserMetrics:
    total = db.query(User).filter(User.is_active == True).count()
    project_managers = db.query(User).filter(
        User.is_active == True,
        User.role == UserRole.PROJECT_MANAGER.value
    ).count()
    procurement = db.query(User).filter(
        User.is_active == True,
        User.role == UserRole.PROCUREMENT.value
    ).count()
    site_supervisors = db.query(User).filter(
        User.is_active == True,
        User.role == UserRole.SITE_SUPERVISOR.value
    ).count()
    admins = db.query(User).filter(
        User.is_active == True,
        User.role == UserRole.ADMIN.value
    ).count()

    return UserMetrics(
        total=total,
        project_managers=project_managers,
        procurement=procurement,
        site_supervisors=site_supervisors,
        admins=admins,
    )


@router.get("", response_model=UserListResponse)
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users = db.query(User).filter(User.is_active == True).order_by(User.created_at.desc()).all()
    metrics = compute_user_metrics(db)
    return UserListResponse(
        users=[UserResponse.model_validate(u) for u in users],
        metrics=metrics,
    )


@router.get("/metrics", response_model=UserMetrics)
def get_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return compute_user_metrics(db)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    request: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    email = request.email.strip().lower()
    username = (request.username or request.name or "").strip()

    if not username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is required",
        )

    # Check for existing user with same email or username
    existing_user = db.query(User).filter(
        (User.email.ilike(email)) | (User.username.ilike(username))
    ).first()

    if existing_user:
        if existing_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email or username already exists.",
            )
        else:
            # Reactivate soft-deleted user with new details
            existing_user.username = username
            existing_user.email = email
            existing_user.hashed_password = get_password_hash(request.password)
            existing_user.role = request.role.value
            existing_user.is_active = True
            db.commit()
            db.refresh(existing_user)
            return UserResponse.model_validate(existing_user)

    new_user = User(
        username=username,
        email=email,
        hashed_password=get_password_hash(request.password),
        role=request.role.value,
        is_active=True,
        is_env_admin=False,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return UserResponse.model_validate(new_user)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    request: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check unique constraints if updating username or email
    new_username = (request.username or request.name or "").strip()
    if new_username and new_username != user.username:
        dup = db.query(User).filter(
            User.username.ilike(new_username),
            User.id != user_id,
            User.is_active == True,
        ).first()
        if dup:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken by another user",
            )
        user.username = new_username

    if request.email and request.email.strip().lower() != user.email.lower():
        dup = db.query(User).filter(
            User.email.ilike(request.email.strip().lower()),
            User.id != user_id,
            User.is_active == True,
        ).first()
        if dup:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use by another user",
            )
        user.email = request.email.strip().lower()

    if request.role:
        # Prevent demoting the root .env Admin
        if user.is_env_admin and request.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Root .env Admin cannot have their role changed.",
            )
        user.role = request.role.value

    if request.password and request.password.strip():
        user.hashed_password = get_password_hash(request.password.strip())

    if request.is_active is not None:
        user.is_active = request.is_active

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Prevent deleting the root .env Admin or deleting oneself
    if user.is_env_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The root .env Administrator cannot be deleted.",
        )
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own active Admin session.",
        )

    # Deactivate / soft delete user so they cannot log in
    user.is_active = False

    # Invalidate any pending OTPs
    db.query(OTPVerification).filter(OTPVerification.user_id == user.id).delete()

    db.commit()
    return {"message": f"User {user.username} successfully deleted", "id": user_id}
