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

function setupThreeJS() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // light-ish sky

    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    // Start camera roughly in the middle of the world
    const center = (CONFIG.WORLD_SIZE * CONFIG.BLOCK_SIZE) / 2;
    camera.position.set(center, 40, center + 40);
    camera.lookAt(center, 0, center);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    document.body.appendChild(renderer.domElement);

    // Basic lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function generateWorld() {
    if (!scene) {
        console.error("Scene not initialized before generateWorld()");
        return;
    }

    if (typeof World !== "undefined" && World.generate) {
        // Build terrain meshes + height map
        World.generate(scene);

        // Old code expects worldHeights[x][z]
        window.worldHeights = World.heightMap;
    } else {
        console.error("World module missing – no terrain generated.");
        // Fallback: flat world so physics doesn't explode
        window.worldHeights = Array(WORLD_SIZE)
            .fill(0)
            .map(() => Array(WORLD_SIZE).fill(0));
    }
}



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
        console.error('connect_error:', err.message, err.description, err.context);
        alert("Connection problem: " + err.message);
        // remove location.reload();
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

function createPlayerMesh(id, data) {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(4, 8, 4);
    const material = new THREE.MeshLambertMaterial({ color: data.color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 4;
    group.add(mesh);

    // Name Label
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = 'Bold 20px Arial';
    ctx.fillStyle = 'white';
    ctx.fillText(data.name, 0, 20);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
    sprite.position.y = 12;
    sprite.scale.set(10, 5, 1);
    group.add(sprite);

    scene.add(group);
    players[id] = { mesh: group };
}

// --- PHYSICS ---
function updatePhysics() {
    const speed = 0.6;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const right = new THREE.Vector3();
    right.crossVectors(camera.up, dir).normalize();

    if(keys.w) camera.position.addScaledVector(dir, speed);
    if(keys.s) camera.position.addScaledVector(dir, -speed);
    if(keys.a) camera.position.addScaledVector(right, speed);
    if(keys.d) camera.position.addScaledVector(right, -speed);

    velocity.y -= 0.03;
    camera.position.y += velocity.y;

    // Collision
    let gx = Math.round(camera.position.x / BLOCK_SIZE);
    let gz = Math.round(camera.position.z / BLOCK_SIZE);
    
    if(gx < 0 || gx >= WORLD_SIZE || gz < 0 || gz >= WORLD_SIZE) {
        camera.position.x = Math.max(0, Math.min(WORLD_SIZE*BLOCK_SIZE, camera.position.x));
        camera.position.z = Math.max(0, Math.min(WORLD_SIZE*BLOCK_SIZE, camera.position.z));
    } else {
        let ground = (window.worldHeights[gx][gz] || 0) + 8;
        if(camera.position.y < ground) {
            camera.position.y = ground;
            velocity.y = 0;
            canJump = true;
        }
    }
    if(keys.space && canJump) { velocity.y = 0.6; canJump = false; }

    // Send Update
    if (socket) {
        socket.emit('move', { 
            x: camera.position.x, 
            y: camera.position.y, 
            z: camera.position.z, 
            rot: camera.rotation.y 
        });
    }
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics();
    renderer.render(scene, camera);
}

// --- INPUTS & AUDIO (Standard WebRTC) ---
function setupInputs() {
    document.addEventListener('keydown', e => {
        if(document.activeElement.tagName === 'INPUT') return;
        if(e.key === 'w') keys.w = true;
        if(e.key === 'a') keys.a = true;
        if(e.key === 's') keys.s = true;
        if(e.key === 'd') keys.d = true;
        if(e.key === ' ') keys.space = true;
        if(e.key === 't') {
            document.getElementById('chat-input').style.display = 'block';
            document.getElementById('chat-input').focus();
            document.exitPointerLock();
        }
        if(e.key === 'v') setMic(true);
    });
    document.addEventListener('keyup', e => {
        if(e.key === 'w') keys.w = false;
        if(e.key === 'a') keys.a = false;
        if(e.key === 's') keys.s = false;
        if(e.key === 'd') keys.d = false;
        if(e.key === ' ') keys.space = false;
        if(e.key === 'v' && isPushToTalk) setMic(false);
    });

    document.getElementById('chat-input').addEventListener('keypress', e => {
        if(e.key === 'Enter') {
            socket.emit('chat', e.target.value);
            e.target.value = '';
            e.target.style.display = 'none';
            renderer.domElement.requestPointerLock();
        }
    });

    document.getElementById('btn-ptt').onclick = () => { isPushToTalk=true; setMic(false); };
    document.getElementById('btn-open').onclick = () => { isPushToTalk=false; setMic(true); };
}

async function setupAudio() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMic(false);
    } catch(e) { console.log("Mic error", e); }
}

function setMic(on) {
    if(localStream) localStream.getAudioTracks()[0].enabled = on;
    document.getElementById('btn-ptt').style.fontWeight = isPushToTalk ? 'bold' : 'normal';
    document.getElementById('btn-open').style.fontWeight = !isPushToTalk ? 'bold' : 'normal';
}

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function initWebRTC(targetId, initiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    peers[targetId] = pc;
    
    if(localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.onicecandidate = e => {
        if(e.candidate) socket.emit('voice-signal', { target: targetId, signal: { candidate: e.candidate } });
    };
    pc.ontrack = e => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.play();
    };

    if(initiator) {
        pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => {
            socket.emit('voice-signal', { target: targetId, signal: { sdp: pc.localDescription } });
        });
    }
}

function handleVoiceSignal(data) {
    let pc = peers[data.from];
    if (!pc) {
        pc = new RTCPeerConnection(rtcConfig);
        peers[data.from] = pc;
        if(localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        pc.onicecandidate = e => {
            if(e.candidate) socket.emit('voice-signal', { target: data.from, signal: { candidate: e.candidate } });
        };
        pc.ontrack = e => {
            const audio = new Audio();
            audio.srcObject = e.streams[0];
            audio.play();
        };
    }

    const sig = data.signal;
    if (sig.sdp) {
        pc.setRemoteDescription(new RTCSessionDescription(sig.sdp)).then(() => {
            if (pc.remoteDescription.type === 'offer') {
                pc.createAnswer().then(a => pc.setLocalDescription(a)).then(() => {
                    socket.emit('voice-signal', { target: data.from, signal: { sdp: pc.localDescription } });
                });
            }
        });
    } else if (sig.candidate) {
        pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
    }
}