const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
// Indispensable sur Render pour récupérer la vraie IP de l'utilisateur derrière leur proxy
app.set('trust proxy', true); 

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// SCORE INITIALISÉ À 0 🚀
let isLightOn = false;
let clickCount = 0; 

// Stocke le moment (timestamp) du dernier clic de chaque IP
const lastClickTimesByIP = {};

io.on('connection', (socket) => {
    // Récupération de la vraie adresse IP (gère le local et le cloud de Render)
    const userIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    console.log(`Un utilisateur s'est connecté. ID: ${socket.id} | IP: ${userIP}`);

    // Calcule si cet utilisateur est actuellement en cooldown au moment de sa connexion/rafraîchissement
    const lastClick = lastClickTimesByIP[userIP] || 0;
    const now = Date.now();
    const elapsed = now - lastClick;
    const isLocalCooldownActive = elapsed < 60000;
    const remainingTime = isLocalCooldownActive ? Math.ceil((60000 - elapsed) / 1000) : 0;

    // On lui envoie l'état global ET son temps restant personnalisé
    socket.emit('init_state', {
        isLightOn: isLightOn,
        clickCount: clickCount,
        cooldownRemaining: remainingTime
    });

    // Gestion du clic sur l'ampoule
    socket.on('click', () => {
        const clickNow = Date.now();
        const userLastClick = lastClickTimesByIP[userIP] || 0;

        // LIMITE STRICTE DE 1 MINUTE PAR IP (60 000 ms)
        if (clickNow - userLastClick < 60000) {
            socket.emit('click_denied');
            return; 
        }

        // Si le délai est respecté, on bloque cette IP pour les 60 prochaines secondes
        lastClickTimesByIP[userIP] = clickNow;

        // Changement d'état
        isLightOn = !isLightOn;
        clickCount++;

        // On met à jour tout le monde
        io.emit('update_state', {
            isLightOn: isLightOn,
            clickCount: clickCount
        });
    });

    socket.on('disconnect', () => {
        console.log('Un utilisateur s\'est déconnecté :', socket.id);
        // ATTENTION : On ne supprime surtout pas l'IP ici ! Elle doit rester bloquée même s'il quitte/rafraîchit.
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});