"""
User profile endpoints
"""
import os
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request, Query
from sqlmodel import Session, select, or_, and_
from PIL import Image
import aiofiles

from backend.database import get_session
from backend.models import User, Follow
from backend.schemas import UserResponse, UserUpdate
from backend.auth import get_current_user, hash_password, get_client_ip, verify_password
from backend.audit import log_event
from backend.config import settings

router = APIRouter()


@router.get("/list", response_model=List[UserResponse])
async def list_users(
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get list of active users for chat (username search, excludes admin)"""
    conditions = [
        User.is_active == True,
        User.role != "admin",  # Exclude admin users from search
        User.id != current_user.id  # Exclude current user
    ]
    
    # Instagram-like username search
    if search:
        search_term = f"%{search.lower()}%"
        search_conditions = [
            User.username.ilike(search_term),
            User.first_name.ilike(search_term),
            User.last_name.ilike(search_term)
        ]
        conditions.append(or_(*search_conditions))
    
    query = select(User).where(and_(*conditions))
    users = session.exec(query).all()
    return users


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_profile(
    user_update: UserUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update user profile"""
    ip = get_client_ip(request)
    changes = []
    
    # Update fields if provided
    if user_update.username is not None and user_update.username != current_user.username:
        # Check if username already exists
        existing = session.exec(
            select(User).where(User.username == user_update.username)
        ).first()
        if existing and existing.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        log_event(
            session=session,
            event_type="username_changed",
            user_id=current_user.id,
            old_value=current_user.username,
            new_value=user_update.username,
            ip=ip
        )
        changes.append(f"Username: {current_user.username} → {user_update.username}")
        current_user.username = user_update.username
    
    if user_update.first_name is not None:
        current_user.first_name = user_update.first_name
        changes.append("First name updated")
    
    if user_update.last_name is not None:
        current_user.last_name = user_update.last_name
        changes.append("Last name updated")
    
    if user_update.bio is not None:
        current_user.bio = user_update.bio
        changes.append("Bio updated")
    
    if user_update.profile_pic is not None:
        current_user.profile_pic = user_update.profile_pic
        changes.append("Profile picture updated")
    
    current_user.updated_at = datetime.now(timezone.utc)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    
    # Log profile update
    if changes:
        log_event(
            session=session,
            event_type="profile_updated",
            user_id=current_user.id,
            old_value=None,
            new_value="; ".join(changes),
            ip=ip
        )
    
    return current_user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_profile(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get user profile by ID"""
    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/{user_id}/follow")
async def follow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Follow a user"""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    
    target_user = session.get(User, user_id)
    if not target_user or not target_user.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already following
    existing = session.exec(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.following_id == user_id
        )
    ).first()
    
    if existing:
        return {"message": "Already following", "following": True}
    
    follow = Follow(follower_id=current_user.id, following_id=user_id)
    session.add(follow)
    session.commit()
    
    return {"message": "User followed", "following": True}


@router.delete("/{user_id}/follow")
async def unfollow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Unfollow a user"""
    follow = session.exec(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.following_id == user_id
        )
    ).first()
    
    if not follow:
        return {"message": "Not following", "following": False}
    
    session.delete(follow)
    session.commit()
    
    return {"message": "User unfollowed", "following": False}


@router.get("/{user_id}/follow-status")
async def get_follow_status(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Check if current user is following target user"""
    follow = session.exec(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.following_id == user_id
        )
    ).first()
    
    return {"following": follow is not None}


@router.get("/{user_id}/followers", response_model=List[UserResponse])
async def get_followers(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get list of users who follow this user"""
    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all followers
    followers = session.exec(
        select(User).join(Follow, User.id == Follow.follower_id)
        .where(Follow.following_id == user_id, User.is_active == True)
    ).all()
    
    return followers


@router.get("/{user_id}/following", response_model=List[UserResponse])
async def get_following(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get list of users this user is following"""
    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all users being followed
    following = session.exec(
        select(User).join(Follow, User.id == Follow.following_id)
        .where(Follow.follower_id == user_id, User.is_active == True)
    ).all()
    
    return following


@router.put("/me/password")
async def change_password(
    old_password: str,
    new_password: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Change password"""
    # Verify old password
    if not verify_password(old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect old password"
        )
    
    # Update password
    current_user.password_hash = hash_password(new_password)
    current_user.updated_at = datetime.now(timezone.utc)
    session.add(current_user)
    session.commit()
    
    # Log password change
    ip = get_client_ip(request)
    log_event(
        session=session,
        event_type="password_change",
        user_id=current_user.id,
        ip=ip
    )
    
    return {"message": "Password changed successfully"}


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Upload profile picture"""
    # Validate file
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in settings.allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(settings.allowed_extensions)}"
        )
    
    # Create uploads directory if it doesn't exist
    os.makedirs(settings.upload_dir, exist_ok=True)
    
    # Read file content
    content = await file.read()
    if len(content) > settings.max_upload_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Max size: {settings.max_upload_size / 1024 / 1024}MB"
        )
    
    # Process and save image
    filename = f"user_{current_user.id}_{datetime.now().timestamp()}{file_ext}"
    filepath = os.path.join(settings.upload_dir, filename)
    
    # Save original
    async with aiofiles.open(filepath, 'wb') as f:
        await f.write(content)
    
    # Create thumbnail
    try:
        image = Image.open(filepath)
        image.thumbnail((256, 256), Image.Resampling.LANCZOS)
        thumb_filename = f"thumb_{filename}"
        thumb_filepath = os.path.join(settings.upload_dir, thumb_filename)
        image.save(thumb_filepath, optimize=True, quality=85)
        current_user.profile_pic = thumb_filename
    except Exception as e:
        # If image processing fails, use original
        current_user.profile_pic = filename
    
    current_user.updated_at = datetime.now(timezone.utc)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    
    # Log avatar upload
    ip = get_client_ip(request)
    log_event(
        session=session,
        event_type="avatar_uploaded",
        user_id=current_user.id,
        ip=ip
    )
    
    return current_user

