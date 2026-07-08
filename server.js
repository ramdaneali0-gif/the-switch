const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
// Indispensable sur Render pour choper la vraie IP des utilisateurs
app.set('trust proxy', true); 

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// SCORE INITIALISÉ À 0 
let isLightOn = false;
let clickCount = 0; 

// Stocke le moment (timestamp) du dernier clic de chaque IP
const lastClickTimesByIP = {};

io.on('connection', (socket) => {
    // Récupération propre de l'IP sur Render ou en local
    const userIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    console.log(`Connexion - ID: ${socket.id} | IP: ${userIP}`);

    // Calcul du temps restant si l'IP a déjà cliqué
    const lastClick = lastClickTimesByIP[userIP] || 0;
    const now = Date.now();
    const elapsed = now - lastClick;
    const isLocalCooldownActive = elapsed < 60000;
    const remainingTime = isLocalCooldownActive ? Math.ceil((60000 - elapsed) / 1000) : 0;

    // Envoi de l'état global et du temps restant de l'IP
    socket.emit('init_state', {
        isLightOn: isLightOn,
        clickCount: clickCount,
        cooldownRemaining: remainingTime
    });

    // Gestion du clic
    socket.on('click', () => {
        const clickNow = Date.now();
        const userLastClick = lastClickTimesByIP[userIP] || 0;

        // SÉCURITÉ SERVEUR : 1 minute stricte (60 000 ms)
        if (clickNow - userLastClick < 60000) {
            socket.emit('click_denied');
            return; 
        }

        // Enregistrement du clic pour cette IP
        lastClickTimesByIP[userIP] = clickNow;

        // Changement d'état
        isLightOn = !isLightOn;
        clickCount++;

        // Mise à jour mondiale
        io.emit('update_state', {
            isLightOn: isLightOn,
            clickCount: clickCount
        });
    });

    socket.on('disconnect', () => {
        console.log('Déconnexion :', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});