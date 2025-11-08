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
from backend.database import create_tables, init_default_admin
from backend.config import settings

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
    import sys
    print("🚀 Starting application initialization...", file=sys.stdout, flush=True)
    
    try:
        # Create database tables
        print("📦 Creating database tables...", file=sys.stdout, flush=True)
        create_tables()
        print("✅ Database tables created successfully", file=sys.stdout, flush=True)
        
        # Create default admin user if it doesn't exist
        # Pass ensure_tables=False since we already created them above
        print("👤 Checking for admin user...", file=sys.stdout, flush=True)
        result = init_default_admin(ensure_tables=False)
        
        if result:
            print("✅ Admin user created during startup", file=sys.stdout, flush=True)
        else:
            print("ℹ️ Admin user check completed", file=sys.stdout, flush=True)
        
        print("✅ Startup initialization complete!", file=sys.stdout, flush=True)
        
    except Exception as e:
        error_msg = f"❌ Error during startup initialization: {e}"
        print(error_msg, file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc()
        # Don't raise - let the app start even if admin creation fails
        # Admin can be created manually later via init_db.py or API


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "Chat+Video v1"}


@app.post("/api/init-admin")
async def init_admin_endpoint():
    """Manual admin initialization endpoint (for testing/debugging)"""
    try:
        from backend.database import init_default_admin
        
        result = init_default_admin(ensure_tables=True)
        
        if result:
            return {
                "status": "success",
                "message": "Admin user created successfully",
                "username": "admin",
                "password": "admin123"
            }
        else:
            return {
                "status": "info",
                "message": "Admin user already exists or creation skipped"
            }
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return {
            "status": "error",
            "message": f"Error creating admin: {str(e)}",
            "details": error_details
        }


if __name__ == "__main__":
    # Get port from environment variable (Render sets PORT env var) or use default
    port = int(os.getenv("PORT", settings.port))
    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=port,
        reload=True
    )

