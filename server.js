const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Autorise les connexions de n'importe où (notamment Netlify)
        methods: ["GET", "POST"]
    }
});

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, 'public')));

// État global de l'application
let isLightOn = false;
let clickCount = 0;

// Stocke le moment (timestamp) du dernier clic de chaque utilisateur
const lastClickTimes = {};

io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté :', socket.id);

    // Envoyer l'état actuel au nouvel utilisateur dès qu'il se connecte
    socket.emit('init_state', {
        isLightOn: isLightOn,
        clickCount: clickCount
    });

    // Gestion du clic sur l'ampoule
    socket.on('click', () => {
        const now = Date.now();
        const lastClick = lastClickTimes[socket.id] || 0;

        // LIMITE : 60 000 millisecondes = 1 minute
        if (now - lastClick < 60000) {
            // Moins d'une minute s'est écoulée, on ignore le clic et on s'arrête là
            return; 
        }

        // Si le délai est respecté, on enregistre l'heure de ce nouveau clic
        lastClickTimes[socket.id] = now;

        // Changement d'état
        isLightOn = !isLightOn;
        clickCount++;

        // On envoie le nouvel état mis à jour à TOUT LE MONDE en temps réel
        io.emit('update_state', {
            isLightOn: isLightOn,
            clickCount: clickCount
        });
    });

    // Nettoyage quand un utilisateur quitte la page
    socket.on('disconnect', () => {
        console.log('Un utilisateur est parti :', socket.id);
        delete lastClickTimes[socket.id];
    });
});

// Écoute sur le port fourni par Render ou 3000 en local
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});