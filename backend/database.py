"""
Database configuration and initialization
"""
from sqlmodel import SQLModel, create_engine, Session
from backend.config import settings
# Import all models to ensure they're registered
from backend.models import User, Message, MessageReaction, AuditLog, RefreshToken, Follow

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
    echo=False
)


def create_tables():
    """Create all database tables"""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Dependency to get database session"""
    with Session(engine) as session:
        yield session

