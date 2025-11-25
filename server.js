const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

if (!process.env.ADMIN_PASSWORD) {
    console.error("FATAL: ADMIN_PASSWORD missing.");
    process.exit(1);
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const validInvites = new Set();
const sessions = new Map();
let players = {};

app.use(express.json());
app.use(express.static('public'));

// Admin routes
app.get('/kitchen', (req, res) => {
    res.sendFile(__dirname + '/pantry/kitchen.html');
});

app.get('/admin.js', (req, res) => {
    res.sendFile(__dirname + '/pantry/admin.js');
});

// Generate a valid random hex color
function generateRandomColor() {
    const hue = Math.random() * 360;
    const saturation = 60 + Math.random() * 40; // 60-100%
    const lightness = 45 + Math.random() * 20;  // 45-65%
    return hslToHex(hue, saturation, lightness);
}

function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// API: Admin login
app.post('/api/login', (req, res) => {
    const { password, name } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        const token = uuidv4();
        const adminColor = '#FF0000';
        const adminName = (name || "Admin").substring(0, 15);
        
        sessions.set(token, { 
            name: adminName, 
            color: adminColor, 
            isAdmin: true 
        });
        
        console.log(`Admin logged in: ${adminName}`);
        res.json({ 
            success: true, 
            token: token,
            name: adminName,
            color: adminColor
        });
    } else {
        setTimeout(() => res.json({ success: false, error: "Invalid Password" }), 500);
    }
});

// API: Player join via invite
app.post('/api/join', (req, res) => {
    const { invite, name } = req.body;

    if (validInvites.has(invite)) {
        const token = uuidv4();
        const color = generateRandomColor();
        const playerName = (name || "Player").substring(0, 15);
        
        sessions.set(token, { 
            name: playerName,
            color: color, 
            isAdmin: false 
        });

        console.log(`Player joined: ${playerName} (${color})`);
        
        res.json({ 
            success: true, 
            token: token,
            name: playerName,
            color: color
        });
    } else {
        res.json({ success: false, error: "Invalid or expired invite code." });
    }
});

// API: Generate invite (admin only)
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

// API: Nuke world (admin only)
app.post('/api/nuke', (req, res) => {
    const { token } = req.body;
    const session = sessions.get(token);

    if (session && session.isAdmin) {
        console.log("WORLD NUKED BY ADMIN");
        validInvites.clear();
        players = {};
        io.disconnectSockets();
        res.json({ success: true });
    } else {
        res.status(403).json({ success: false, error: "Unauthorized" });
    }
});

// Socket.IO error handling
io.engine.on("connection_error", (err) => {
    console.log("ENGINE.IO CONNECTION ERROR");
    console.log(" code:", err.code);
    console.log(" message:", err.message);
    console.log(" context:", err.context);
});

// Socket.IO authentication middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const session = sessions.get(token);

    if (session) {
        socket.user = session;
        next();
    } else {
        console.log("AUTH FAIL for token:", token);
        next(new Error("Authentication error"));
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    const user = socket.user;
    
    // Create player entry
    players[socket.id] = {
        id: socket.id,
        name: user.name,
        color: user.color,
        x: 0,
        y: 0,
        z: 0,
        rot: 0
    };

    console.log(`Player connected: ${user.name} (${socket.id})`);

    // Notify others of new player
    socket.broadcast.emit('player-joined', players[socket.id]);
    
    // Send current players to new player
    socket.emit('current-players', players);

    // Handle movement
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].rot = data.rot;
            socket.broadcast.volatile.emit('player-moved', players[socket.id]);
        }
    });

    // Handle chat
    socket.on('chat', (msg) => {
        const cleanMsg = String(msg).replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 200);
        io.emit('chat-message', { name: user.name, msg: cleanMsg });
    });

    // Handle voice signaling
    socket.on('voice-signal', (data) => {
        io.to(data.target).emit('voice-signal', {
            from: socket.id,
            signal: data.signal
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${user.name} (${socket.id})`);
        delete players[socket.id];
        io.emit('player-left', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Laatta server running on port ${PORT}`);
});
