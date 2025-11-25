// --- CONFIG ---
const WORLD_SIZE = 60;
const BLOCK_SIZE = 5;

let scene, camera, renderer, socket;
let players = {};
let peers = {}; 
let localStream;
let isPushToTalk = true;

// Inputs
const keys = { w: false, a: false, s: false, d: false, space: false };
const velocity = { y: 0 };
let canJump = false;

function initGame(token) {
    setupThreeJS();
    generateWorld();
    setupSocket(token); // PASS TOKEN HERE
    setupInputs();
    setupAudio();
    animate();
}

function setupSocket(token) {
    // Connect with the session token we got from the login screen
    socket = io({
        auth: {
            token: token
        }
    });

    socket.on('connect_error', (err) => {
        alert("Connection rejected: " + err.message);
        location.reload();
    });

    socket.on('connect', () => {
        console.log("Connected to game server");
    });

    socket.on('current-players', (existingPlayers) => {
        for (let id in existingPlayers) {
            if (id !== socket.id) {
                createPlayerMesh(id, existingPlayers[id]);
                initWebRTC(id, true);
            }
        }
    });

    socket.on('player-joined', (p) => {
        createPlayerMesh(p.id, p);
        initWebRTC(p.id, false);
    });

    socket.on('player-moved', (p) => {
        if (players[p.id]) {
            players[p.id].mesh.position.set(p.x, p.y, p.z);
            players[p.id].mesh.rotation.y = p.rot;
        }
    });

    socket.on('player-left', (id) => {
        if (players[id]) {
            scene.remove(players[id].mesh);
            delete players[id];
        }
        if(peers[id]) {
            peers[id].close();
            delete peers[id];
        }
    });

    socket.on('chat-message', (data) => {
        const div = document.createElement('div');
        div.style.marginBottom = "5px";
        div.innerHTML = `<span style="color:#aaa">${data.name}:</span> ${data.msg}`;
        const chatBox = document.getElementById('chat-history');
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    socket.on('voice-signal', handleVoiceSignal);
}

// ... REST OF THE GAME CODE IS IDENTICAL TO PREVIOUS VERSION ...
// (setupThreeJS, generateWorld, updatePhysics, animate, setupInputs, WebRTC logic)
// Copy the rendering and physics logic from the previous Node.js response.
// Just ensure updatePhysics uses: socket.emit('move', ...)