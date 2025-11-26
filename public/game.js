// --- GAME STATE ---
let scene, camera, renderer, socket;
let players = {};
let peers = {};
let localStream;
let isPushToTalk = true;
let isPointerLocked = false;
let isPaused = false;

// Camera rotation (for mouse look)
let pitch = 0; // Up/down rotation
let yaw = 0;   // Left/right rotation

// Inputs
const keys = { w: false, a: false, s: false, d: false, space: false };
const velocity = { y: 0 };
let canJump = false;

// Player info
let myName = "";
let myColor = "";

// Network throttling
let lastPositionUpdate = 0;
let lastSentPosition = { x: 0, y: 0, z: 0, rot: 0 };

function setupThreeJS() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.FOG_COLOR);
    
    // Add fog
    scene.fog = new THREE.Fog(CONFIG.FOG_COLOR, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);

    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        CONFIG.VIEW_DISTANCE
    );

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    
    // Setup pointer lock for mouse look
    setupPointerLock();
}

function setupPointerLock() {
    const canvas = renderer.domElement;
    
    canvas.addEventListener('click', () => {
        if (!isPointerLocked && !isPaused && document.activeElement.tagName !== 'INPUT') {
            canvas.requestPointerLock();
        }
    });
    
    document.addEventListener('pointerlockchange', () => {
        isPointerLocked = document.pointerLockElement === canvas;
        
        // If pointer lock was released (e.g., by pressing ESC) and not already paused, show pause menu
        if (!isPointerLocked && !isPaused) {
            showPauseMenu();
        }
        
        updateUIVisibility();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isPointerLocked) return;
        
        yaw -= e.movementX * CONFIG.MOUSE_SENSITIVITY;
        pitch -= e.movementY * CONFIG.MOUSE_SENSITIVITY;
        
        // Clamp pitch to prevent over-rotation
        pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
        
        // Apply rotation to camera
        camera.rotation.order = 'YXZ';
        camera.rotation.y = yaw;
        camera.rotation.x = pitch;
    });
}

function showPauseMenu() {
    isPaused = true;
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
        pauseMenu.style.display = 'flex';
    }
    updateUIVisibility();
}

function hidePauseMenu() {
    isPaused = false;
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
        pauseMenu.style.display = 'none';
    }
    // Re-lock pointer
    if (renderer && renderer.domElement) {
        renderer.domElement.requestPointerLock();
    }
}

function continueGame() {
    hidePauseMenu();
}

function exitGame() {
    // Disconnect socket
    if (socket) {
        socket.disconnect();
    }
    
    // Stop audio
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close all peer connections
    for (let id in peers) {
        peers[id].close();
    }
    peers = {};
    
    // Reload the page to go back to front page
    window.location.reload();
}

function updateUIVisibility() {
    const hint = document.getElementById('pointer-hint');
    if (hint) {
        // Only show "click to play" hint if not paused and not pointer locked
        hint.style.display = (!isPointerLocked && !isPaused) ? 'block' : 'none';
    }
}

function generateWorld() {
    if (!scene) {
        console.error("Scene not initialized before generateWorld()");
        return;
    }

    if (typeof World !== "undefined" && World.generate) {
        World.generate(scene);
        window.worldHeights = World.heightMap;
    } else {
        console.error("World module missing – no terrain generated.");
        window.worldHeights = Array(CONFIG.WORLD_SIZE)
            .fill(0)
            .map(() => Array(CONFIG.WORLD_SIZE).fill(0));
    }
}

function initGame(token, playerName, playerColor) {
    myName = playerName || "Player";
    myColor = playerColor || "#FFFFFF";
    
    setupThreeJS();
    generateWorld();
    
    // Set spawn position
    const spawnX = CONFIG.SPAWN_X;
    const spawnZ = CONFIG.SPAWN_Z;
    const spawnY = World.getSpawnHeight();
    
    camera.position.set(spawnX, spawnY, spawnZ);
    
    setupSocket(token);
    setupInputs();
    setupPauseMenu();
    setupAudio();
    animate();
}

function setupPauseMenu() {
    const continueBtn = document.getElementById('btn-continue');
    const exitBtn = document.getElementById('btn-exit');
    
    if (continueBtn) {
        continueBtn.addEventListener('click', continueGame);
    }
    if (exitBtn) {
        exitBtn.addEventListener('click', exitGame);
    }
}

function setupSocket(token) {
    socket = io({
        auth: { token: token }
    });

    socket.on('connect_error', (err) => {
        console.error('connect_error:', err.message);
        alert("Connection problem: " + err.message);
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
        updatePlayerList();
    });

    socket.on('player-joined', (p) => {
        createPlayerMesh(p.id, p);
        initWebRTC(p.id, false);
        updatePlayerList();
        
        // Show join message in chat
        addSystemMessage(`${p.name} joined the game`);
    });

    socket.on('player-moved', (p) => {
        if (players[p.id]) {
            // Store target position for interpolation (don't set directly)
            players[p.id].targetX = p.x;
            players[p.id].targetY = p.y;
            players[p.id].targetZ = p.z;
            players[p.id].targetRot = p.rot;
        }
    });

    socket.on('player-left', (id) => {
        if (players[id]) {
            addSystemMessage(`${players[id].name} left the game`);
            scene.remove(players[id].mesh);
            delete players[id];
        }
        if (peers[id]) {
            peers[id].close();
            delete peers[id];
        }
        updatePlayerList();
    });

    socket.on('chat-message', (data) => {
        addChatMessage(data.name, data.msg);
    });

    socket.on('voice-signal', handleVoiceSignal);
}

function addChatMessage(name, msg) {
    const chatBox = document.getElementById('chat-history');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="chat-name">${name}:</span> ${msg}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    
    // Fade out old messages
    setTimeout(() => {
        div.style.opacity = '0.5';
    }, 10000);
}

function addSystemMessage(msg) {
    const chatBox = document.getElementById('chat-history');
    const div = document.createElement('div');
    div.className = 'chat-msg system-msg';
    div.innerHTML = `<em>${msg}</em>`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function updatePlayerList() {
    const list = document.getElementById('player-list');
    if (!list) return;
    
    list.innerHTML = '<div class="player-list-title">Players Online</div>';
    
    // Add self
    const selfItem = document.createElement('div');
    selfItem.className = 'player-item';
    selfItem.innerHTML = `<span class="player-color" style="background: ${myColor}"></span><span>${myName} (you)</span>`;
    list.appendChild(selfItem);
    
    // Add other players
    for (let id in players) {
        const p = players[id];
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `<span class="player-color" style="background: ${p.color}"></span><span>${p.name}</span>`;
        list.appendChild(item);
    }
}

function createPlayerMesh(id, data) {
    const group = new THREE.Group();
    
    // Player body
    const geometry = new THREE.BoxGeometry(CONFIG.PLAYER_WIDTH, CONFIG.PLAYER_HEIGHT, CONFIG.PLAYER_WIDTH);
    
    // Ensure valid color
    let color = data.color;
    if (!color || color.length < 7) {
        color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    }
    
    const material = new THREE.MeshLambertMaterial({ color: color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = CONFIG.PLAYER_HEIGHT / 2;
    group.add(mesh);

    // Name label using sprite
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.roundRect(0, 16, canvas.width, 32, 8);
    ctx.fill();
    
    // Draw text
    ctx.font = 'Bold 24px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.name.substring(0, 15), canvas.width / 2, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.y = CONFIG.PLAYER_HEIGHT + 3;
    sprite.scale.set(12, 3, 1);
    group.add(sprite);

    scene.add(group);
    players[id] = { 
        mesh: group, 
        label: sprite,
        name: data.name,
        color: color,
        // Target positions for interpolation
        targetX: data.x || 0,
        targetY: data.y || 0,
        targetZ: data.z || 0,
        targetRot: data.rot || 0
    };
    
    // Set initial position
    group.position.set(players[id].targetX, players[id].targetY, players[id].targetZ);
}

// --- PHYSICS ---
function updatePhysics() {
    // Don't update physics if paused
    if (isPaused) return;
    
    const speed = CONFIG.SPEED;
    
    // Get forward/right vectors based on camera yaw only (not pitch)
    const forward = new THREE.Vector3(
        -Math.sin(yaw),
        0,
        -Math.cos(yaw)
    );
    const right = new THREE.Vector3(
        Math.cos(yaw),
        0,
        -Math.sin(yaw)
    );

    // Movement
    if (keys.w) camera.position.addScaledVector(forward, speed);
    if (keys.s) camera.position.addScaledVector(forward, -speed);
    if (keys.a) camera.position.addScaledVector(right, -speed);
    if (keys.d) camera.position.addScaledVector(right, speed);

    // Gravity
    velocity.y -= CONFIG.GRAVITY;
    camera.position.y += velocity.y;

    // World boundaries (invisible walls)
    const margin = CONFIG.BLOCK_SIZE;
    const maxPos = CONFIG.WORLD_SIZE * CONFIG.BLOCK_SIZE - margin;
    camera.position.x = Math.max(margin, Math.min(maxPos, camera.position.x));
    camera.position.z = Math.max(margin, Math.min(maxPos, camera.position.z));

    // Ground collision
    const groundHeight = World.getGroundHeight(camera.position.x, camera.position.z);
    const playerFeetHeight = groundHeight + CONFIG.PLAYER_HEIGHT;
    
    if (camera.position.y < playerFeetHeight) {
        camera.position.y = playerFeetHeight;
        velocity.y = 0;
        canJump = true;
    }

    // Jump
    if (keys.space && canJump) {
        velocity.y = CONFIG.JUMP_FORCE;
        canJump = false;
    }

    // Send position update (throttled)
    if (socket && socket.connected) {
        const now = Date.now();
        const updateInterval = 1000 / CONFIG.POSITION_UPDATE_RATE;
        
        if (now - lastPositionUpdate >= updateInterval) {
            // Only send if position or rotation changed
            const posChanged = 
                Math.abs(camera.position.x - lastSentPosition.x) > 0.01 ||
                Math.abs(camera.position.y - lastSentPosition.y) > 0.01 ||
                Math.abs(camera.position.z - lastSentPosition.z) > 0.01 ||
                Math.abs(yaw - lastSentPosition.rot) > 0.01;
            
            if (posChanged) {
                socket.emit('move', {
                    x: camera.position.x,
                    y: camera.position.y,
                    z: camera.position.z,
                    rot: yaw
                });
                
                lastSentPosition.x = camera.position.x;
                lastSentPosition.y = camera.position.y;
                lastSentPosition.z = camera.position.z;
                lastSentPosition.rot = yaw;
            }
            
            lastPositionUpdate = now;
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics();
    
    // Interpolate other players' positions smoothly
    for (let id in players) {
        const p = players[id];
        if (p.mesh && p.targetX !== undefined) {
            // Lerp position
            p.mesh.position.x += (p.targetX - p.mesh.position.x) * CONFIG.INTERPOLATION_SPEED;
            p.mesh.position.y += (p.targetY - p.mesh.position.y) * CONFIG.INTERPOLATION_SPEED;
            p.mesh.position.z += (p.targetZ - p.mesh.position.z) * CONFIG.INTERPOLATION_SPEED;
            
            // Lerp rotation (handle wraparound)
            let rotDiff = p.targetRot - p.mesh.rotation.y;
            if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            p.mesh.rotation.y += rotDiff * CONFIG.INTERPOLATION_SPEED;
        }
        
        // Make label face camera
        if (p.label) {
            p.label.quaternion.copy(camera.quaternion);
        }
    }
    
    renderer.render(scene, camera);
}

// --- INPUTS ---
function setupInputs() {
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in chat
        if (document.activeElement.tagName === 'INPUT') return;
        
        // Ignore movement keys if paused
        if (isPaused) return;
        
        const key = e.key.toLowerCase();
        if (key === 'w') keys.w = true;
        if (key === 'a') keys.a = true;
        if (key === 's') keys.s = true;
        if (key === 'd') keys.d = true;
        if (key === ' ') { keys.space = true; e.preventDefault(); }
        
        // Open chat
        if (key === 't') {
            e.preventDefault();
            const chatInput = document.getElementById('chat-input');
            chatInput.style.display = 'block';
            chatInput.focus();
            document.exitPointerLock();
        }
        
        // Push-to-talk
        if (key === 'v' && isPushToTalk) setMic(true);
    });
    
    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'w') keys.w = false;
        if (key === 'a') keys.a = false;
        if (key === 's') keys.s = false;
        if (key === 'd') keys.d = false;
        if (key === ' ') keys.space = false;
        if (key === 'v' && isPushToTalk) setMic(false);
    });

    // Chat input handler
    const chatInput = document.getElementById('chat-input');
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const msg = chatInput.value.trim();
            if (msg) {
                socket.emit('chat', msg);
            }
            chatInput.value = '';
            chatInput.style.display = 'none';
            renderer.domElement.requestPointerLock();
        }
        if (e.key === 'Escape') {
            chatInput.value = '';
            chatInput.style.display = 'none';
            // Don't re-lock pointer, let pause menu show
        }
    });

    // Voice control buttons
    document.getElementById('btn-ptt').onclick = () => {
        isPushToTalk = true;
        setMic(false);
        updateVoiceButtons();
    };
    
    document.getElementById('btn-open').onclick = () => {
        isPushToTalk = false;
        setMic(true);
        updateVoiceButtons();
    };
}

function updateVoiceButtons() {
    document.getElementById('btn-ptt').classList.toggle('active', isPushToTalk);
    document.getElementById('btn-open').classList.toggle('active', !isPushToTalk);
}

// --- AUDIO ---
async function setupAudio() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMic(false); // Start muted
        updateVoiceButtons();
    } catch (e) {
        console.log("Microphone access denied:", e);
    }
}

function setMic(on) {
    if (localStream && localStream.getAudioTracks().length > 0) {
        localStream.getAudioTracks()[0].enabled = on;
        
        // Update mic indicator
        const indicator = document.getElementById('mic-indicator');
        if (indicator) {
            indicator.classList.toggle('active', on);
        }
    }
}

// --- WebRTC Voice ---
const rtcConfig = { 
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
};

function initWebRTC(targetId, initiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    peers[targetId] = pc;
    
    if (localStream) {
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }

    pc.onicecandidate = (e) => {
        if (e.candidate) {
            socket.emit('voice-signal', { 
                target: targetId, 
                signal: { candidate: e.candidate } 
            });
        }
    };
    
    pc.ontrack = (e) => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.play().catch(err => console.log("Audio play error:", err));
    };

    if (initiator) {
        pc.createOffer()
            .then(o => pc.setLocalDescription(o))
            .then(() => {
                socket.emit('voice-signal', { 
                    target: targetId, 
                    signal: { sdp: pc.localDescription } 
                });
            });
    }
}

function handleVoiceSignal(data) {
    let pc = peers[data.from];
    
    if (!pc) {
        pc = new RTCPeerConnection(rtcConfig);
        peers[data.from] = pc;
        
        if (localStream) {
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        }
        
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('voice-signal', { 
                    target: data.from, 
                    signal: { candidate: e.candidate } 
                });
            }
        };
        
        pc.ontrack = (e) => {
            const audio = new Audio();
            audio.srcObject = e.streams[0];
            audio.play().catch(err => console.log("Audio play error:", err));
        };
    }

    const sig = data.signal;
    
    if (sig.sdp) {
        pc.setRemoteDescription(new RTCSessionDescription(sig.sdp))
            .then(() => {
                if (pc.remoteDescription.type === 'offer') {
                    return pc.createAnswer();
                }
            })
            .then(answer => {
                if (answer) {
                    return pc.setLocalDescription(answer);
                }
            })
            .then(() => {
                if (pc.localDescription && pc.remoteDescription.type === 'offer') {
                    socket.emit('voice-signal', { 
                        target: data.from, 
                        signal: { sdp: pc.localDescription } 
                    });
                }
            })
            .catch(err => console.error("WebRTC error:", err));
    } else if (sig.candidate) {
        pc.addIceCandidate(new RTCIceCandidate(sig.candidate))
            .catch(err => console.error("ICE error:", err));
    }
}
