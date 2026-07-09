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

// Configuration de la grille : 20 lignes x 20 colonnes = 400 pixels
const GRID_SIZE = 20;
// On initialise la grille en mémoire vive avec de la couleur blanche (#ffffff) partout
let pixelGrid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill('#ffffff'));

// Stocke le moment (timestamp) de la dernière action de chaque IP
const lastClickTimesByIP = {};

io.on('connection', (socket) => {
    // Récupération propre de l'IP
    const userIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    console.log(`Connexion Pixel Wars - ID: ${socket.id} | IP: ${userIP}`);

    // Calcul du temps de cooldown restant si l'IP a déjà joué
    const lastClick = lastClickTimesByIP[userIP] || 0;
    const now = Date.now();
    const elapsed = now - lastClick;
    const isLocalCooldownActive = elapsed < 60000;
    const remainingTime = isLocalCooldownActive ? Math.ceil((60000 - elapsed) / 1000) : 0;

    // On envoie toute la grille actuelle et le compte à rebours de l'IP au nouveau connecté
    socket.emit('init_state', {
        grid: pixelGrid,
        cooldownRemaining: remainingTime
    });

    // Gestion du placement d'un pixel
    socket.on('place_pixel', (data) => {
        const clickNow = Date.now();
        const userLastClick = lastClickTimesByIP[userIP] || 0;

        // Sécurité serveur : 1 minute stricte (60 000 ms)
        if (clickNow - userLastClick < 60000) {
            socket.emit('click_denied');
            return; 
        }

        const { row, col, color } = data;

        // Sécurité anti-crash : on vérifie que les coordonnées sont bien dans la grille
        if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
            
            // Enregistrement de l'action pour cette IP
            lastClickTimesByIP[userIP] = clickNow;

            // Mise à jour de la grille en mémoire
            pixelGrid[row][col] = color;

            // On diffuse instantanément le pixel posé à TOUT LE MONDE en temps réel
            io.emit('pixel_updated', { row, col, color });
        }
    });

    socket.on('disconnect', () => {
        console.log('Déconnexion :', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});