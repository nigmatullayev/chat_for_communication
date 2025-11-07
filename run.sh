#!/bin/bash
# Quick start script for Chat+Video v1

echo "================================================"
echo "Chat+Video v1 - Quick Start"
echo "================================================"

# Activate virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

# Install dependencies
if [ ! -f ".deps_installed" ]; then
    echo "Installing dependencies..."
    pip install --upgrade pip setuptools wheel
    pip install -r requirements.txt
    touch .deps_installed
fi

# Initialize database if needed
if [ ! -f "chat_video.db" ]; then
    echo "Initializing database..."
    python init_db.py
fi

echo ""
echo "Starting server..."
echo "Access the application at: http://localhost:8000"
echo "Default admin credentials:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo "Press CTRL+C to stop the server"
echo "================================================"
echo ""

# Start the server
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

