"""
Database models using SQLModel
"""
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship


class User(SQLModel, table=True):
    """User model"""
    __tablename__ = "users"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    profile_pic: Optional[str] = None
    bio: Optional[str] = None
    role: str = Field(default="user")  # 'user' or 'admin'
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    sent_messages: list["Message"] = Relationship(back_populates="sender", sa_relationship_kwargs={"foreign_keys": "Message.sender_id"})
    received_messages: list["Message"] = Relationship(back_populates="receiver", sa_relationship_kwargs={"foreign_keys": "Message.receiver_id"})
    message_reactions: list["MessageReaction"] = Relationship(back_populates="user")


class Message(SQLModel, table=True):
    """Message model for chat"""
    __tablename__ = "messages"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    sender_id: int = Field(foreign_key="users.id")
    receiver_id: int = Field(foreign_key="users.id")
    content: Optional[str] = None
    attachment: Optional[str] = None
    message_type: str = Field(default="text")  # text, image, video, location, circular_video
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    is_read: bool = Field(default=False)
    is_deleted: bool = Field(default=False)
    edited_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    sender: User = Relationship(back_populates="sent_messages", sa_relationship_kwargs={"foreign_keys": "Message.sender_id"})
    receiver: User = Relationship(back_populates="received_messages", sa_relationship_kwargs={"foreign_keys": "Message.receiver_id"})
    reactions: list["MessageReaction"] = Relationship(back_populates="message")


class MessageReaction(SQLModel, table=True):
    """Message reaction model"""
    __tablename__ = "message_reactions"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    message_id: int = Field(foreign_key="messages.id")
    user_id: int = Field(foreign_key="users.id")
    reaction_type: str  # like, love, laugh, wow, sad, angry, etc.
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    message: Message = Relationship(back_populates="reactions")
    user: User = Relationship(back_populates="message_reactions")


class AuditLog(SQLModel, table=True):
    """Audit log for tracking user actions"""
    __tablename__ = "audit_logs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(foreign_key="users.id", default=None)
    admin_id: Optional[int] = Field(foreign_key="users.id", default=None)
    event_type: str  # e.g., 'password_change', 'username_changed', 'login_failed'
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    ip: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RefreshToken(SQLModel, table=True):
    """Refresh token storage"""
    __tablename__ = "refresh_tokens"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    token: str = Field(unique=True)
    revoked: bool = Field(default=False)
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Follow(SQLModel, table=True):
    """User follow relationships"""
    __tablename__ = "follows"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    follower_id: int = Field(foreign_key="users.id")
    following_id: int = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    follower: User = Relationship(sa_relationship_kwargs={"foreign_keys": "Follow.follower_id"})
    following: User = Relationship(sa_relationship_kwargs={"foreign_keys": "Follow.following_id"})

