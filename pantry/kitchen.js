let adminToken = null;
let adminName = "";
let adminColor = "";

document.addEventListener('DOMContentLoaded', () => {
    // Login
    document.getElementById('btn-login').addEventListener('click', doLogin);
    
    // Allow Enter to submit login
    document.getElementById('admin-pass').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doLogin();
    });

    // Generate invite
    document.getElementById('btn-generate').addEventListener('click', generateInvite);

    // Click to copy invite link
    document.getElementById('invite-link').addEventListener('click', copyInviteLink);

    // Nuke world
    document.getElementById('btn-nuke').addEventListener('click', nukeWorld);

    // Enter world
    document.getElementById('btn-play').addEventListener('click', enterWorld);
});

async function doLogin() {
    const name = document.getElementById('admin-name').value.trim();
    const pass = document.getElementById('admin-pass').value;
    const errorMsg = document.getElementById('error-msg');
    
    errorMsg.innerText = "AUTHENTICATING...";
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass, name: name })
        });
        const data = await res.json();
        
        if (data.success) {
            adminToken = data.token;
            adminName = data.name;
            adminColor = data.color;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('dashboard').style.display = 'flex';
        } else {
            errorMsg.innerText = "ACCESS DENIED";
        }
    } catch (e) {
        errorMsg.innerText = "CONNECTION ERROR";
    }
}

async function generateInvite() {
    if (!adminToken) return;

    const res = await fetch('/api/generate-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: adminToken })
    });
    const data = await res.json();
    
    if (data.success) {
        const link = window.location.origin + "?invite=" + data.code;
        document.getElementById('invite-link').innerText = link;
    } else {
        alert("Session Expired");
        window.location.reload();
    }
}

function copyInviteLink() {
    const text = document.getElementById('invite-link').innerText;
    if (text.startsWith('http')) {
        navigator.clipboard.writeText(text).then(() => {
            const msg = document.getElementById('copied-msg');
            msg.classList.add('show');
            setTimeout(() => msg.classList.remove('show'), 2000);
        });
    }
}

async function nukeWorld() {
    if (!adminToken) return;
    if (!confirm("ARE YOU SURE? This will kick everyone and reset all invites.")) return;

    const res = await fetch('/api/nuke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: adminToken })
    });
    const data = await res.json();
    
    if (data.success) {
        alert("World Destroyed.");
        document.getElementById('invite-link').innerText = "Click above to generate...";
    }
}

function enterWorld() {
    if (!adminToken) return;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';
    initGame(adminToken, adminName, adminColor);
}
