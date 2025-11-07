"""
Authentication endpoints
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlmodel import Session, select
from jose import JWTError

from backend.database import get_session
from backend.models import User, RefreshToken
from backend.schemas import LoginRequest, TokenResponse, RefreshTokenRequest
from backend.auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_token, get_current_user, get_client_ip
)
from backend.audit import log_event
from backend.config import settings

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: LoginRequest,
    request: Request,
    session: Session = Depends(get_session)
):
    """Login endpoint"""
    # Find user
    user = session.exec(select(User).where(User.username == credentials.username)).first()
    
    # Verify credentials
    if not user or not verify_password(credentials.password, user.password_hash):
        # Log failed login attempt
        ip = get_client_ip(request)
        log_event(
            session=session,
            event_type="login_failed",
            user_id=user.id if user else None,
            ip=ip
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    # Log successful login
    ip = get_client_ip(request)
    log_event(
        session=session,
        event_type="login_success",
        user_id=user.id,
        ip=ip
    )
    
    # Create tokens
    token_data = {"sub": user.username}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    
    # Store refresh token in DB
    expires_at = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    db_refresh_token = RefreshToken(
        user_id=user.id,
        token=refresh_token,
        expires_at=expires_at
    )
    session.add(db_refresh_token)
    session.commit()
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    token_data: RefreshTokenRequest,
    session: Session = Depends(get_session)
):
    """Refresh access token"""
    # Decode refresh token
    try:
        payload = decode_token(token_data.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    # Verify refresh token exists in DB and is not revoked
    db_token = session.exec(
        select(RefreshToken).where(RefreshToken.token == token_data.refresh_token)
    ).first()
    
    if not db_token or db_token.revoked or db_token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    # Get user
    user = session.get(User, db_token.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    # Create new access token
    token_data_dict = {"sub": user.username}
    access_token = create_access_token(token_data_dict)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=token_data.refresh_token,  # Keep same refresh token
        user=user
    )


@router.post("/logout")
async def logout(
    token_data: RefreshTokenRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Logout - revoke refresh token"""
    db_token = session.exec(
        select(RefreshToken).where(RefreshToken.token == token_data.refresh_token)
    ).first()
    
    if db_token and not db_token.revoked:
        db_token.revoked = True
        session.add(db_token)
        session.commit()
    
    return {"message": "Logged out successfully"}

