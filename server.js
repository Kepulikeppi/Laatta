const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// --- SECURITY & STATE ---
// Get password from DigitalOcean Environment Variable, or fallback to 'supersecret'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "supersecret";

// Store valid invite codes (e.g., 'abc-123')
const validInvites = new Set();

// Store active sessions: Token -> { name, color, isAdmin }
const sessions = new Map();

// Store game state
let players = {};

app.use(express.static('public'));
app.use(express.json());

// --- 1. HTTP API (The Gatekeeper) ---

// Admin Login
app.post('/api/login', (req, res) => {
    const { password, name } = req.body;
    
    // Server-side check. The client never knows the real password.
    if (password === ADMIN_PASSWORD) {
        const token = uuidv4();
        // Register this token as an Admin
        sessions.set(token, { 
            name: name || "Admin", 
            color: '#FF0000', 
            isAdmin: true 
        });
        
        console.log(`Admin logged in. Token: ${token}`);
        res.json({ success: true, token: token });
    } else {
        // Delay response slightly to prevent brute-force timing attacks
        setTimeout(() => res.json({ success: false, error: "Invalid Password" }), 500);
    }
});

// Player Join (via Invite)
app.post('/api/join', (req, res) => {
    const { invite, name } = req.body;

    // Check if invite exists in server memory
    if (validInvites.has(invite)) {
        const token = uuidv4();
        // Generate random color
        const color = '#' + Math.floor(Math.random()*16777215).toString(16);
        
        // Register token
        sessions.set(token, { 
            name: name.substring(0, 15), // Limit name length
            color: color, 
            isAdmin: false 
        });

        // Optional: Remove invite after use? 
        // validInvites.delete(invite); 

        res.json({ success: true, token: token });
    } else {
        res.json({ success: false, error: "Invalid or expired invite code." });
    }
});

// Generate Invite (Protected: Only Admins can do this)
app.post('/api/generate-invite', (req, res) => {
    const { token } = req.body;
    const session = sessions.get(token);

    if (session && session.isAdmin) {
        const newCode = uuidv4().substring(0, 8); // Short code
        validInvites.add(newCode);
        console.log(`Invite generated: ${newCode}`);
        res.json({ success: true, code: newCode });
    } else {
        res.status(403).json({ success: false, error: "Unauthorized" });
    }
});

// --- 2. SOCKET.IO (The Game Loop) ---

// Middleware: This runs BEFORE a socket connects.
// It checks if the user has a valid token from the HTTP step above.
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const session = sessions.get(token);

    if (session) {
        // Attach user info to the socket object so we can use it later
        socket.user = session;
        next();
    } else {
        next(new Error("Authentication error"));
    }
});

io.on('connection', (socket) => {
    const user = socket.user; // We know who they are now
    console.log(`User connected: ${user.name} (${socket.id})`);

    // Add to game state
    players[socket.id] = {
        id: socket.id,
        name: user.name,
        color: user.color,
        x: 0, y: 0, z: 0, rot: 0
    };

    // Send init data
    socket.broadcast.emit('player-joined', players[socket.id]);
    socket.emit('current-players', players);

    // Movement
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].rot = data.rot;
            socket.broadcast.volatile.emit('player-moved', players[socket.id]);
        }
    });

    // Chat
    socket.on('chat', (msg) => {
        // Sanitize HTML to prevent XSS
        const cleanMsg = String(msg).replace(/</g, "&lt;").substring(0, 100);
        io.emit('chat-message', { name: user.name, msg: cleanMsg });
    });

    // Voice Signaling
    socket.on('voice-signal', (data) => {
        io.to(data.target).emit('voice-signal', {
            from: socket.id,
            signal: data.signal
        });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player-left', socket.id);
        // Note: We don't delete the session from the map immediately 
        // in case they just refreshed the page.
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});