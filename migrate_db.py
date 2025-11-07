#!/usr/bin/env python3
"""
Migration script to add new columns to messages table
"""
import sqlite3
import sys
import os

# Get database path
db_path = os.path.join(os.path.dirname(__file__), 'chat_video.db')

def migrate_database():
    """Add missing columns to messages table"""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check which columns exist
        cursor.execute("PRAGMA table_info(messages)")
        columns = [row[1] for row in cursor.fetchall()]
        
        print("Existing columns:", columns)
        
        # Add missing columns
        if 'message_type' not in columns:
            print("Adding message_type column...")
            cursor.execute("ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text'")
            # Update existing rows to have 'text' as message_type
            cursor.execute("UPDATE messages SET message_type = 'text' WHERE message_type IS NULL")
        
        if 'location_lat' not in columns:
            print("Adding location_lat column...")
            cursor.execute("ALTER TABLE messages ADD COLUMN location_lat REAL")
        
        if 'location_lng' not in columns:
            print("Adding location_lng column...")
            cursor.execute("ALTER TABLE messages ADD COLUMN location_lng REAL")
        
        if 'is_deleted' not in columns:
            print("Adding is_deleted column...")
            cursor.execute("ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0")
        
        if 'edited_at' not in columns:
            print("Adding edited_at column...")
            cursor.execute("ALTER TABLE messages ADD COLUMN edited_at TEXT")
        
        # Check users table for bio column
        cursor.execute("PRAGMA table_info(users)")
        user_columns = [row[1] for row in cursor.fetchall()]
        
        if 'bio' not in user_columns:
            print("Adding bio column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN bio TEXT")
        
        conn.commit()
        print("Migration completed successfully!")
        
        # Verify columns
        cursor.execute("PRAGMA table_info(messages)")
        new_columns = [row[1] for row in cursor.fetchall()]
        print("New columns in messages table:", new_columns)
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
        conn.close()
        return False

if __name__ == "__main__":
    if migrate_database():
        print("Database migration successful!")
        sys.exit(0)
    else:
        print("Database migration failed!")
        sys.exit(1)

