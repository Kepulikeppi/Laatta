const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// --- SECURITY CHECK ---
// The server will refuse to start if the password is not set in the environment
if (!process.env.ADMIN_PASSWORD) {
    console.error("❌ CRITICAL ERROR: ADMIN_PASSWORD is missing.");
    console.error("Please set the Environment Variable in DigitalOcean/Kinsta settings.");
    process.exit(1);
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const validInvites = new Set();
const sessions = new Map();
let players = {};

app.use(express.static('public'));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/kitchen', (req, res) => {
    res.sendFile(__dirname + '/public/kitchen.html');
});

// API: Login
app.post('/api/login', (req, res) => {
    const { password, name } = req.body;
    
    // Server-side validation
    if (password === ADMIN_PASSWORD) {
        const token = uuidv4();
        sessions.set(token, { 
            name: name || "Admin", 
            color: '#FF0000', 
            isAdmin: true 
        });
        
        console.log(`Admin logged in. Token: ${token}`);
        res.json({ success: true, token: token });
    } else {
        // Slow down brute force attempts
        setTimeout(() => res.json({ success: false, error: "Invalid Password" }), 500);
    }
});

// API: Join (Public)
app.post('/api/join', (req, res) => {
    const { invite, name } = req.body;

    if (validInvites.has(invite)) {
        const token = uuidv4();
        const color = '#' + Math.floor(Math.random()*16777215).toString(16);
        
        sessions.set(token, { 
            name: name.substring(0, 15),
            color: color, 
            isAdmin: false 
        });

        res.json({ success: true, token: token });
    } else {
        res.json({ success: false, error: "Invalid or expired invite code." });
    }
});

// API: Generate Invite (Protected)
app.post('/api/generate-invite', (req, res) => {
    const { token } = req.body;
    const session = sessions.get(token);

    if (session && session.isAdmin) {
        const newCode = uuidv4().substring(0, 8);
        validInvites.add(newCode);
        console.log(`Invite generated: ${newCode}`);
        res.json({ success: true, code: newCode });
    } else {
        res.status(403).json({ success: false, error: "Unauthorized" });
    }
});

// Socket.io Authentication Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const session = sessions.get(token);

    if (session) {
        socket.user = session;
        next();
    } else {
        next(new Error("Authentication error"));
    }
});

// Socket.io Game Loop
io.on('connection', (socket) => {
    const user = socket.user;
    
    players[socket.id] = {
        id: socket.id,
        name: user.name,
        color: user.color,
        x: 0, y: 0, z: 0, rot: 0
    };

    socket.broadcast.emit('player-joined', players[socket.id]);
    socket.emit('current-players', players);

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].rot = data.rot;
            socket.broadcast.volatile.emit('player-moved', players[socket.id]);
        }
    });

    socket.on('chat', (msg) => {
        const cleanMsg = String(msg).replace(/</g, "&lt;").substring(0, 100);
        io.emit('chat-message', { name: user.name, msg: cleanMsg });
    });

    socket.on('voice-signal', (data) => {
        io.to(data.target).emit('voice-signal', {
            from: socket.id,
            signal: data.signal
        });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player-left', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});