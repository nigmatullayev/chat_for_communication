# Quick Start Guide - Chat+Video v1

## 🚀 Getting Started in 60 Seconds

### Option 1: Using the Quick Start Script (Easiest)

```bash
./run.sh
```

That's it! The script will:
- Create a virtual environment
- Install all dependencies
- Initialize the database
- Start the server

Access the app at: http://localhost:8000

### Option 2: Manual Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Initialize database
python init_db.py

# Start server
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### Option 3: Using Docker

```bash
docker-compose up -d
```

Access the app at: http://localhost:8000

## 🔑 Default Login

- **Username**: `admin`
- **Password**: `admin123`

⚠️ **Important**: Change the admin password immediately after first login!

## ✨ What You Can Do

### As Admin:
1. **Create Users**: Go to Admin → Users → New User
2. **Monitor Activity**: View Audit Log for all user actions
3. **Manage Users**: Edit, delete, or toggle user status
4. **View Notifications**: Get notified of important events

### As User:
1. **Chat**: Select a user from the sidebar to start chatting
2. **Video/Audio Call**: Click the video/phone icon in chat
3. **Edit Profile**: Update username, name, and avatar
4. **Change Password**: Secure password changes

## 📱 Features

- ✅ Real-time messaging via WebSocket
- ✅ Video and audio calls via WebRTC
- ✅ User profile management
- ✅ Admin dashboard with audit logs
- ✅ Secure authentication (JWT)
- ✅ Mobile responsive design
- ✅ Password hashing (bcrypt)

## 🔧 Configuration

Edit `backend/config.py` or set environment variables:

```env
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///./chat_video.db
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

## 📚 Full Documentation

See [README.md](README.md) for complete documentation.

## 🆘 Troubleshooting

**Port 8000 already in use?**
```bash
# Use a different port
uvicorn backend.main:app --port 8080
```

**Database errors?**
```bash
# Reset database
rm chat_video.db
python init_db.py
```

**Permission denied?**
```bash
chmod +x run.sh
```

## 🎉 Ready to Chat!

Start chatting with your team using Chat+Video v1!

