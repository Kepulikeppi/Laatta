document.addEventListener('DOMContentLoaded', () => {
    // Check for invite code in URL
    const params = new URLSearchParams(window.location.search);
    if (params.has('invite')) {
        document.getElementById('join-code').value = params.get('invite');
    }

    // Allow Enter key to submit
    document.getElementById('join-code').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') attemptJoin();
    });
    
    document.getElementById('join-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('join-code').focus();
    });
});

async function attemptJoin() {
    const code = document.getElementById('join-code').value.trim();
    const name = document.getElementById('join-name').value.trim();
    const btn = document.querySelector('#auth-screen button');
    const err = document.getElementById('auth-error');
    
    if (!name) {
        err.innerText = "Please enter your name";
        return;
    }
    if (!code) {
        err.innerText = "Please enter an invite code";
        return;
    }
    
    btn.innerText = "CONNECTING...";
    btn.disabled = true;
    err.innerText = "";

    try {
        const res = await fetch('/api/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invite: code, name: name })
        });
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('game-ui').style.display = 'block';
            initGame(data.token, data.name || name, data.color);
        } else {
            err.innerText = data.error;
            btn.innerText = "ENTER WORLD";
            btn.disabled = false;
        }
    } catch (e) {
        err.innerText = "Could not connect to server";
        btn.innerText = "ENTER WORLD";
        btn.disabled = false;
    }
}
