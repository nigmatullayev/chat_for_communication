"""
Admin endpoints
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlmodel import Session, select
from datetime import datetime

from backend.database import get_session
from backend.models import User, AuditLog
from backend.schemas import AdminUserCreate, UserResponse, AuditLogResponse
from backend.auth import get_current_admin_user, hash_password, get_client_ip
from backend.audit import log_event

router = APIRouter()


@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: AdminUserCreate,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    session: Session = Depends(get_session)
):
    """Create a new user (admin only)"""
    # Check if username already exists
    existing = session.exec(select(User).where(User.username == user_data.username)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    # Create user
    user = User(
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        role=user_data.role
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    
    # Log user creation
    ip = get_client_ip(request)
    log_event(
        session=session,
        event_type="user_created",
        admin_id=admin.id,
        user_id=user.id,
        new_value=f"Created user {user.username}",
        ip=ip
    )
    
    return user


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    admin: User = Depends(get_current_admin_user),
    session: Session = Depends(get_session)
):
    """List all users (admin only)"""
    users = session.exec(select(User)).all()
    return users


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    session: Session = Depends(get_session)
):
    """Get user details (admin only)"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: AdminUserCreate,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    session: Session = Depends(get_session)
):
    """Update user (admin only)"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check username uniqueness
    if user_update.username != user.username:
        existing = session.exec(
            select(User).where(User.username == user_update.username)
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
    
    # Update user
    user.username = user_update.username
    user.password_hash = hash_password(user_update.password)
    user.first_name = user_update.first_name
    user.last_name = user_update.last_name
    user.role = user_update.role
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    
    # Log user update
    ip = get_client_ip(request)
    log_event(
        session=session,
        event_type="user_updated",
        admin_id=admin.id,
        user_id=user.id,
        new_value=f"Updated user {user.username}",
        ip=ip
    )
    
    return user


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    session: Session = Depends(get_session)
):
    """Delete user (admin only)"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete own account"
        )
    
    username = user.username
    session.delete(user)
    session.commit()
    
    # Log user deletion
    ip = get_client_ip(request)
    log_event(
        session=session,
        event_type="user_deleted",
        admin_id=admin.id,
        user_id=None,
        old_value=f"Deleted user {username}",
        ip=ip
    )
    
    return {"message": "User deleted successfully"}


@router.patch("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: int,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    session: Session = Depends(get_session)
):
    """Toggle user active status"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.is_active = not user.is_active
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    
    # Log status change
    ip = get_client_ip(request)
    action = "activated" if user.is_active else "deactivated"
    log_event(
        session=session,
        event_type=f"user_{action}",
        admin_id=admin.id,
        user_id=user.id,
        new_value=f"User {user.username} {action}",
        ip=ip
    )
    
    return {"message": f"User {action} successfully", "is_active": user.is_active}


@router.get("/audit_logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    limit: int = 100,
    offset: int = 0,
    event_type: Optional[str] = None,
    user_id: Optional[int] = None,
    admin: User = Depends(get_current_admin_user),
    session: Session = Depends(get_session)
):
    """Get audit logs (admin only)"""
    query = select(AuditLog)
    
    if event_type:
        query = query.where(AuditLog.event_type == event_type)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    
    query = query.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    
    logs = session.exec(query).all()
    return logs


@router.get("/notifications", response_model=List[AuditLogResponse])
async def get_notifications(
    admin: User = Depends(get_current_admin_user),
    session: Session = Depends(get_session)
):
    """Get recent notifications (admin only)"""
    # Get recent events that should be notifications
    notification_events = [
        "profile_updated", "password_change", "username_changed",
        "avatar_uploaded", "login_failed", "user_created", "user_deleted"
    ]
    
    query = select(AuditLog).where(
        AuditLog.event_type.in_(notification_events)
    ).order_by(AuditLog.created_at.desc()).limit(50)
    
    logs = session.exec(query).all()
    return logs

