"""
Initialize database with default admin user
"""
from backend.database import engine, create_tables
from backend.models import User
from backend.auth import hash_password
from sqlmodel import Session, select

def init_database():
    """Create tables and default admin user"""
    print("Creating database tables...")
    create_tables()
    
    print("Creating default admin user...")
    with Session(engine) as session:
        # Check if admin already exists
        existing_admin = session.exec(
            select(User).where(User.username == "admin")
        ).first()
        
        if not existing_admin:
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
            print("Default admin user created:")
            print("  Username: admin")
            print("  Password: admin123")
        else:
            print("Admin user already exists")
    
    print("Database initialization complete!")

if __name__ == "__main__":
    init_database()

