"""
Database configuration and initialization
"""
from sqlmodel import SQLModel, create_engine, Session, select
from sqlalchemy import text
from backend.config import settings
# Import all models to ensure they're registered
from backend.models import User, Message, MessageReaction, AuditLog, RefreshToken, Follow, Group, GroupMember, GroupMessage, GroupMessageReaction

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
    echo=False
)


def migrate_database():
    """Migrate database schema - add missing columns"""
    if "sqlite" not in settings.database_url:
        # For non-SQLite databases, use proper migrations
        return
    
    with Session(engine) as session:
        try:
            # Check if reply_to_message_id column exists
            # PRAGMA table_info returns rows with: cid, name, type, notnull, dflt_value, pk
            result = session.exec(
                text("PRAGMA table_info(messages)")
            ).all()
            
            # Extract column names (index 1 is the column name)
            columns = [row[1] for row in result] if result else []
            
            # Check and add reply_to_message_id column if missing
            if "reply_to_message_id" not in columns:
                print("🔄 Adding reply_to_message_id column to messages table...")
                session.exec(
                    text("ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER")
                )
                session.commit()
                print("✅ Migration completed: reply_to_message_id column added")
                # Re-fetch columns after adding
                result = session.exec(
                    text("PRAGMA table_info(messages)")
                ).all()
                columns = [row[1] for row in result] if result else []
            
            # Check and add read_at column if missing
            if "read_at" not in columns:
                print("🔄 Adding read_at column to messages table...")
                session.exec(
                    text("ALTER TABLE messages ADD COLUMN read_at DATETIME")
                )
                session.commit()
                print("✅ Migration completed: read_at column added")
                # Re-fetch columns after adding
                result = session.exec(
                    text("PRAGMA table_info(messages)")
                ).all()
                columns = [row[1] for row in result] if result else []
            
            # Print final status
            if "reply_to_message_id" in columns and "read_at" in columns:
                print("ℹ️ Database schema is up to date")
                
        except Exception as e:
            session.rollback()
            error_str = str(e).lower()
            # If table doesn't exist, that's okay - create_tables will handle it
            if "no such table" in error_str:
                print("ℹ️ Messages table doesn't exist yet, will be created by create_tables()")
            else:
                print(f"⚠️ Migration error: {e}")
                # Don't raise - let the app continue


def create_tables():
    """Create all database tables"""
    SQLModel.metadata.create_all(engine)
    # Run migrations after creating tables
    migrate_database()


def get_session():
    """Dependency to get database session"""
    with Session(engine) as session:
        yield session


def init_default_admin(ensure_tables=True):
    """Create default admin user if it doesn't exist
    
    Args:
        ensure_tables: If True, ensure tables are created before creating admin
        
    Returns:
        bool: True if admin was created, False if already exists or error occurred
    """
    try:
        from backend.auth import hash_password
        
        # Ensure tables are created first if requested
        if ensure_tables:
            try:
                create_tables()
            except Exception as table_error:
                print(f"⚠️ Warning: Could not create tables: {table_error}")
                # Continue anyway - tables might already exist
        
        with Session(engine) as session:
            try:
                # Check if admin already exists
                existing_admin = session.exec(
                    select(User).where(User.username == "admin")
                ).first()
                
                if existing_admin:
                    print("✅ Admin user already exists (ID: {})".format(existing_admin.id))
                    return False
                
                # Create new admin user
                admin_user = User(
                    username="admin",
                    password_hash=hash_password("admin123"),
                    first_name="System",
                    last_name="Administrator",
                    role="admin",
                    is_active=True
                )
                session.add(admin_user)
                session.commit()
                session.refresh(admin_user)
                
                print("=" * 60)
                print("✅ Default admin user created successfully!")
                print("   Username: admin")
                print("   Password: admin123")
                print("   ID: {}".format(admin_user.id))
                print("=" * 60)
                return True
                
            except Exception as db_error:
                session.rollback()
                print(f"⚠️ Database error creating admin user: {db_error}")
                import traceback
                traceback.print_exc()
                return False
                
    except ImportError as import_error:
        print(f"⚠️ Import error: {import_error}")
        import traceback
        traceback.print_exc()
        return False
    except Exception as e:
        print(f"⚠️ Unexpected error creating admin user: {e}")
        import traceback
        traceback.print_exc()
        return False

