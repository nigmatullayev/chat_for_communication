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
from backend.models import User
from backend.auth import hash_password
from sqlmodel import Session, select

app = FastAPI(
    title="Chat+Video API",
    description="Admin-managed chat application with video/audio calls",
    version="1.0.0"
)

# CORS middleware
# For Render deployment, we need to allow the Render domain
# Get Render external URL from environment variable if available
render_external_url = os.getenv("RENDER_EXTERNAL_URL")
render_service_url = os.getenv("RENDER_SERVICE_URL")

cors_origins = settings.cors_origins.copy()

# Add Render URLs if running on Render
if render_external_url:
    cors_origins.append(render_external_url)
if render_service_url:
    cors_origins.append(render_service_url)

# Remove duplicates while preserving order
seen = set()
cors_origins = [x for x in cors_origins if not (x in seen or seen.add(x))]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
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
    """Initialize database on startup and create default admin if not exists"""
    # Create database tables
    create_tables()
    
    # Create default admin user if it doesn't exist
    try:
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
                print("✅ Default admin user created:")
                print("   Username: admin")
                print("   Password: admin123")
            else:
                print("✅ Admin user already exists")
    except Exception as e:
        print(f"⚠️ Error during startup initialization: {e}")
        import traceback
        traceback.print_exc()


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "Chat+Video v1"}


if __name__ == "__main__":
    # Get port from environment variable (Render sets PORT env var) or use default
    port = int(os.getenv("PORT", settings.port))
    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=port,
        reload=True
    )

