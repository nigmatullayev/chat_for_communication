"""
Pydantic schemas for request/response validation
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


# User schemas
class UserBase(BaseModel):
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: str = "user"


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    bio: Optional[str] = None
    profile_pic: Optional[str] = None


class UserResponse(UserBase):
    id: int
    profile_pic: Optional[str] = None
    bio: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UserPublic(UserBase):
    id: int
    profile_pic: Optional[str] = None
    is_active: bool


# Auth schemas
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# Message schemas
class MessageCreate(BaseModel):
    receiver_id: int
    content: Optional[str] = None
    attachment: Optional[str] = None
    message_type: str = "text"
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None


class MessageUpdate(BaseModel):
    content: Optional[str] = None


class MessageReactionCreate(BaseModel):
    reaction_type: str  # like, love, laugh, wow, sad, angry


class MessageReactionResponse(BaseModel):
    id: int
    message_id: int
    user_id: int
    reaction_type: str
    created_at: datetime
    user: UserPublic
    
    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    content: Optional[str] = None
    attachment: Optional[str] = None
    message_type: str
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    is_read: bool
    is_deleted: bool
    edited_at: Optional[datetime] = None
    created_at: datetime
    sender: UserPublic
    receiver: UserPublic
    reactions: Optional[list[MessageReactionResponse]] = []
    
    class Config:
        from_attributes = True


# Admin schemas
class AdminUserCreate(UserCreate):
    role: str = "user"


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    admin_id: Optional[int] = None
    event_type: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    ip: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


# WebSocket schemas
class WebSocketMessage(BaseModel):
    type: str
    to: Optional[int] = None
    content: Optional[str] = None
    data: Optional[dict] = None

