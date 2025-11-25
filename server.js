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

app.get('/kitchen', (req, res) => {
    res.sendFile(__dirname + '/pantry/kitchen.html');
});

app.get('/admin.js', (req, res) => {
    res.sendFile(__dirname + '/pantry/admin.js');
});

app.post('/api/login', (req, res) => {
    const { password, name } = req.body;
    
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
        setTimeout(() => res.json({ success: false, error: "Invalid Password" }), 500);
    }
});

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

io.engine.on("connection_error", (err) => {
    console.log("ENGINE.IO CONNECTION ERROR");
    console.log(" code:", err.code);        // e.g. 1 = Session ID unknown, 3 = Bad request
    console.log(" message:", err.message);  // human-readable
    console.log(" context:", err.context);  // extra info (like TRANSPORT_MISMATCH, etc.)
});


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