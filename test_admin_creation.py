#!/usr/bin/env python3
"""
Test script to verify admin user creation
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.database import create_tables, init_default_admin, engine
from backend.models import User
from sqlmodel import Session, select

def test_admin_creation():
    """Test admin user creation"""
    print("=" * 60)
    print("Testing Admin User Creation")
    print("=" * 60)
    
    # Create tables
    print("\n1. Creating database tables...")
    try:
        create_tables()
        print("   ✅ Tables created successfully")
    except Exception as e:
        print(f"   ❌ Error creating tables: {e}")
        return False
    
    # Check if admin exists before
    print("\n2. Checking for existing admin user...")
    try:
        with Session(engine) as session:
            existing = session.exec(
                select(User).where(User.username == "admin")
            ).first()
            if existing:
                print(f"   ⚠️ Admin user already exists (ID: {existing.id})")
            else:
                print("   ℹ️ No admin user found")
    except Exception as e:
        print(f"   ❌ Error checking admin: {e}")
        return False
    
    # Create admin
    print("\n3. Creating admin user...")
    try:
        result = init_default_admin()
        if result:
            print("   ✅ Admin user created successfully")
        else:
            print("   ℹ️ Admin user already exists or creation skipped")
    except Exception as e:
        print(f"   ❌ Error creating admin: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Verify admin exists
    print("\n4. Verifying admin user...")
    try:
        with Session(engine) as session:
            admin = session.exec(
                select(User).where(User.username == "admin")
            ).first()
            if admin:
                print(f"   ✅ Admin user verified:")
                print(f"      ID: {admin.id}")
                print(f"      Username: {admin.username}")
                print(f"      Role: {admin.role}")
                print(f"      Active: {admin.is_active}")
                return True
            else:
                print("   ❌ Admin user not found after creation")
                return False
    except Exception as e:
        print(f"   ❌ Error verifying admin: {e}")
        return False

if __name__ == "__main__":
    success = test_admin_creation()
    print("\n" + "=" * 60)
    if success:
        print("✅ Test completed successfully!")
    else:
        print("❌ Test failed!")
    print("=" * 60)
    sys.exit(0 if success else 1)

