"""
Initialize database with default admin user
"""
from backend.database import create_tables, init_default_admin

def init_database():
    """Create tables and default admin user"""
    print("🚀 Starting database initialization...")
    print("📦 Creating database tables...")
    create_tables()
    print("✅ Database tables created successfully")
    
    print("👤 Creating default admin user...")
    init_default_admin()
    
    print("✅ Database initialization complete!")

if __name__ == "__main__":
    init_database()

