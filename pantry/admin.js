document.addEventListener('DOMContentLoaded', () => {
    let myToken = null;

    // Elements
    const btnLogin = document.getElementById('btn-login');
    const btnGenerate = document.getElementById('btn-generate');
    const btnPlay = document.getElementById('btn-play');

    // Login Action
    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            const pass = document.getElementById('admin-pass').value;
            const name = document.getElementById('admin-name').value;
            const errorMsg = document.getElementById('error-msg');
            
            errorMsg.innerText = "AUTHENTICATING...";
            
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: pass, name: name })
                });
                const data = await res.json();
                
                if(data.success) {
                    myToken = data.token;
                    document.getElementById('login-screen').style.display = 'none';
                    document.getElementById('dashboard').style.display = 'flex';
                } else {
                    errorMsg.innerText = "ACCESS DENIED";
                }
            } catch(e) {
                errorMsg.innerText = "CONNECTION ERROR";
            }
        });
    }

    // Generate Invite Action
    if (btnGenerate) {
        btnGenerate.addEventListener('click', async () => {
            if (!myToken) return;

            const res = await fetch('/api/generate-invite', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ token: myToken })
            });
            const data = await res.json();
            
            if(data.success) {
                const link = window.location.origin + "?invite=" + data.code;
                document.getElementById('invite-link').innerText = link;
            } else {
                alert("Session Expired");
                window.location.reload();
            }
        });
    }

    // Play Action
    if (btnPlay) {
        btnPlay.addEventListener('click', () => {
            if (!myToken) return;
            document.getElementById('dashboard').style.display = 'none';
            document.getElementById('game-ui').style.display = 'block';
            
            // Function from game.js
            if (typeof initGame === "function") {
                initGame(myToken);
            }
        });
    }
});