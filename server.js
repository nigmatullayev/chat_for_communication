import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { initDatabase } from './backend/database.js';
import config from './backend/config.js';

// Import routers
import authRouter from './backend/routers/auth.js';
import adminRouter from './backend/routers/admin.js';
import usersRouter from './backend/routers/users.js';
import messagesRouter from './backend/routers/messages.js';

// Import WebSocket handler
import { setupWebSocket } from './backend/websocket_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);

// Trust proxy for correct IP addresses
app.set('trust proxy', true);

// CORS middleware
app.use(cors({
    origin: config.corsOrigins,
    credentials: true
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/static', express.static(path.join(__dirname, 'frontend')));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/messages', messagesRouter);

// Serve frontend index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Chat+Video v1' });
});

// Setup WebSocket server
// WebSocket will handle /api/messages/ws/:userId path
const wss = new WebSocketServer({ 
    server,
    verifyClient: (info) => {
        // Allow all WebSocket connections - authentication happens in websocket_manager
        return true;
    }
});
setupWebSocket(wss);

// Initialize database
initDatabase();

// Start server
const PORT = process.env.PORT || 8000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`API docs available at http://localhost:${PORT}/api/health`);
});

