"""
Chat+Video v1 - Main application entry point
"""
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os

from backend.routers import auth, admin, users, messages
from backend.database import engine, create_tables
from backend.config import settings

app = FastAPI(
    title="Chat+Video API",
    description="Admin-managed chat application with video/audio calls",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])

# Static files for uploads
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Serve static files from frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
async def serve_index():
    """Serve frontend index.html"""
    return FileResponse("frontend/index.html")


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    create_tables()


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "Chat+Video v1"}


if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

