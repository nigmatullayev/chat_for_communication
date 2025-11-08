"""
Configuration settings
"""
import os
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings"""
    
    # Server
    port: int = 8000
    host: str = "0.0.0.0"
    
    # Database
    database_url: str = "sqlite:///./chat_video.db"
    
    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    
    # File uploads
    upload_dir: str = "uploads"
    max_upload_size: int = 50 * 1024 * 1024  # 50 MB for videos
    allowed_extensions: set = {".jpg", ".jpeg", ".png", ".gif", ".mp4", ".webm", ".mov"}
    allowed_image_extensions: set = {".jpg", ".jpeg", ".png", ".gif"}
    allowed_video_extensions: set = {".mp4", ".webm", ".mov"}
    
    # Password hashing
    bcrypt_work_factor: int = 12
    
    # Rate limiting
    rate_limit_per_minute: int = 5
    
    # CORS
    cors_origins: list = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    
    class Config:
        env_file = ".env"


settings = Settings()

