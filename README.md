# Chat+Video v1

An admin-managed real-time chat application with video/audio calling capabilities.

## Features

- **Admin-managed users**: No public registration - admins create and manage users
- **Real-time messaging**: WebSocket-based instant messaging
- **Video/Audio calls**: WebRTC peer-to-peer video and audio calls
- **Profile management**: Users can update their profile, username, and avatar
- **Audit logging**: Complete audit trail of all user activities
- **Admin dashboard**: Monitor users, view audit logs, and manage the system
- **Secure authentication**: JWT-based auth with refresh tokens
- **Responsive design**: Works on desktop and mobile devices

## Technology Stack

### Backend
- **FastAPI**: Modern, fast web framework for building APIs
- **SQLModel**: Modern SQL database toolkit
- **SQLite**: Lightweight database (can be migrated to PostgreSQL)
- **WebSocket**: Real-time bidirectional communication
- **WebRTC**: Peer-to-peer video/audio calling
- **JWT**: Secure token-based authentication
- **bcrypt**: Password hashing

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **Tailwind-inspired CSS**: Responsive, modern UI
- **WebSocket API**: Real-time updates
- **WebRTC API**: Media streaming

## Quick Start

### Using Docker (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd chat_for_conversition
```

2. Start the application:
```bash
docker-compose up -d
```

3. Access the application:
- Web UI: http://localhost:8000
- API docs: http://localhost:8000/docs

4. Default admin credentials:
- Username: `admin`
- Password: `admin123`

### Manual Installation

1. Install Python 3.11+

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Initialize the database:
```bash
python init_db.py
```

4. Start the server:
```bash
python -m uvicorn backend.main:app --reload
```

5. Access the application:
- Web UI: http://localhost:8000
- API docs: http://localhost:8000/docs

## Default Admin Credentials

- **Username**: admin
- **Password**: admin123

⚠️ **Important**: Change the admin password immediately after first login!

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login and get tokens
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout

### Users (Authenticated)
- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update profile
- `PUT /api/users/me/password` - Change password
- `POST /api/users/me/avatar` - Upload avatar

### Admin (Admin only)
- `POST /api/admin/users` - Create new user
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/{id}` - Get user details
- `PUT /api/admin/users/{id}` - Update user
- `DELETE /api/admin/users/{id}` - Delete user
- `PATCH /api/admin/users/{id}/toggle-active` - Toggle user status
- `GET /api/admin/audit_logs` - Get audit logs
- `GET /api/admin/notifications` - Get notifications

### Messages
- `GET /api/messages/{user_id}` - Get chat history
- `WebSocket /api/messages/ws/{user_id}` - Real-time messaging and signaling

## WebSocket Events

### Client → Server
- `message` - Send chat message
- `incoming_call` - Initiate video/audio call
- `call_answer` - Answer incoming call
- `ice_candidate` - WebRTC ICE candidate
- `call_end` - End call
- `typing` - Typing indicator

### Server → Client
- `connected` - Connection confirmed
- `message` - New chat message
- `incoming_call` - Incoming call notification
- `call_answer` - Call answer received
- `ice_candidate` - ICE candidate from peer
- `call_end` - Call ended by peer
- `typing` - Typing indicator from peer

## Security Features

- **Password hashing**: Bcrypt with work factor 12
- **JWT tokens**: Secure token-based authentication
- **HTTPS ready**: Configure for production
- **Input validation**: SQLModel and Pydantic validation
- **Audit logging**: Complete activity tracking
- **Rate limiting**: Configurable limits
- **File upload validation**: Type and size checks

## Deployment

### Environment Variables

Create a `.env` file:

```env
SECRET_KEY=your-super-secret-key-change-in-production
DATABASE_URL=sqlite:///./chat_video.db
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
```

### Production Considerations

1. **Change SECRET_KEY**: Use a secure random string
2. **Enable HTTPS**: Use reverse proxy (nginx) with Let's Encrypt
3. **Database**: Migrate from SQLite to PostgreSQL for production
4. **TURN Server**: Configure STUN/TURN for NAT traversal
5. **File Storage**: Consider S3 or similar for avatars
6. **Monitoring**: Add logging and error tracking (Sentry)
7. **Backups**: Schedule regular database backups

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Database Schema

### Users
- id, username, password_hash, first_name, last_name, profile_pic
- role (user/admin), is_active, created_at, updated_at

### Messages
- id, sender_id, receiver_id, content, attachment, is_read, created_at

### Audit Logs
- id, user_id, admin_id, event_type, old_value, new_value, ip, created_at

### Refresh Tokens
- id, user_id, token, revoked, expires_at, created_at

## Development

### Project Structure

```
chat_for_conversition/
├── backend/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── config.py            # Configuration
│   ├── database.py          # DB setup
│   ├── models.py            # SQLModel models
│   ├── schemas.py           # Pydantic schemas
│   ├── auth.py              # Auth utilities
│   ├── audit.py             # Audit logging
│   ├── websocket_manager.py # WebSocket handler
│   └── routers/
│       ├── auth.py          # Auth endpoints
│       ├── users.py         # User endpoints
│       ├── admin.py         # Admin endpoints
│       └── messages.py      # Message & WebSocket
├── frontend/
│   ├── index.html           # Main HTML
│   ├── app.js               # Frontend JS
│   ├── styles.css           # CSS styles
│   └── default-avatar.png   # Default avatar
├── uploads/                 # User uploads
├── requirements.txt         # Python deps
├── Dockerfile               # Docker image
├── docker-compose.yml       # Docker compose
├── init_db.py               # DB initialization
└── README.md                # This file
```

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio

# Run tests
pytest
```

## Future Enhancements

- [ ] PostgreSQL migration script
- [ ] Group chat support
- [ ] Message reactions and replies
- [ ] File attachments in messages
- [ ] Push notifications
- [ ] Mobile app (React Native)
- [ ] Two-factor authentication
- [ ] Message encryption
- [ ] Screen sharing
- [ ] Recording capabilities

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on GitHub.

