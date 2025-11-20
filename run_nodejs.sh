#!/bin/bash
# Quick start script for Chat+Video v1 (Node.js version)

echo "================================================"
echo "Chat+Video v1 - Quick Start (Node.js)"
echo "================================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Initialize database if needed
if [ ! -f "chat_video.db" ]; then
    echo "Initializing database..."
    npm run init-db
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
npm start

