document.addEventListener('DOMContentLoaded', () => {
    let myToken = null;

    const btnLogin = document.getElementById('btn-login');
    const btnGenerate = document.getElementById('btn-generate');
    const btnNuke = document.getElementById('btn-nuke');
    const btnPlay = document.getElementById('btn-play');

    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            const name = document.getElementById('admin-name').value;
            const pass = document.getElementById('admin-pass').value;
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
                    document.getElementById('dashboard').style.display = 'block';
                } else {
                    errorMsg.innerText = "ACCESS DENIED";
                }
            } catch(e) {
                console.error(e);
                errorMsg.innerText = "CONNECTION ERROR";
            }
        });
    }

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

    if (btnNuke) {
        btnNuke.addEventListener('click', async () => {
            if (!myToken) return;
            if (!confirm("ARE YOU SURE? This will kick everyone.")) return;

            const res = await fetch('/api/nuke', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ token: myToken })
            });
            const data = await res.json();
            
            if(data.success) {
                alert("World Destroyed.");
                document.getElementById('invite-link').innerText = "...";
            }
        });
    }

    if (btnPlay) {
        btnPlay.addEventListener('click', () => {
            if (!myToken) return;
            document.getElementById('dashboard').style.display = 'none';
            document.getElementById('game-ui').style.display = 'block';
            
            if (typeof initGame === "function") {
                initGame(myToken);
            } else {
                alert("Game engine not loaded!");
            }
        });
    }
});