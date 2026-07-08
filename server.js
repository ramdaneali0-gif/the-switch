const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Autorise Netlify et le local à se connecter au serveur
        methods: ["GET", "POST"]
    }
});

// --- CONFIGURATION ---
const PORT = 3000;

// Variables globales de l'application
let globalSwitchState = false;       // false = Éteint, true = Allumé
const alreadyClickedIPs = new Set(); // Stocke les adresses IP qui ont déjà cliqué

// On dit à Express de rendre accessible tout ce qui sera dans le dossier "public"
app.use(express.static('public'));

// --- LOGIQUE TEMPS RÉEL (SOCKET.IO) ---
io.on('connection', async (socket) => {
    
    // 1. Récupération de l'adresse IP de la personne qui se connecte
    const userIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    // 2. Par défaut, on met des valeurs fictives pour le développement local (127.0.0.1)
    let userCity = "Paris";
    let userCountry = "France";
    
    // Si l'utilisateur n'est pas en local, on va chercher sa vraie ville/pays via son IP
    if (userIP !== '127.0.0.1' && userIP !== '::1') {
        try {
            const response = await fetch(`http://ip-api.com/json/${userIP}`);
            const data = await response.json();
            if (data.status === 'success') {
                userCity = data.city;
                userCountry = data.country;
            }
        } catch (err) {
            console.log("Impossible de géolocaliser l'IP, utilisation des valeurs par défaut.");
        }
    }

    console.log(`🔌 Nouveau joueur connecté ! IP: ${userIP} (${userCity}, ${userCountry})`);

    // 3. Dès qu'un joueur arrive, on lui envoie l'état du bouton et s'il a déjà cliqué ou non
    socket.emit('init_state', {
        state: globalSwitchState,
        hasClicked: alreadyClickedIPs.has(userIP)
    });

    // 4. On écoute quand ce joueur clique sur le bouton
    socket.on('switch_clicked', () => {
        
        // SÉCURITÉ : Si son IP est déjà dans notre liste, on refuse l'action
        if (alreadyClickedIPs.has(userIP)) {
            socket.emit('error_message', "Action refusée : vous avez déjà cliqué !");
            return;
        }

        // Si c'est bon, on ajoute son IP pour le bloquer définitivement
        alreadyClickedIPs.add(userIP);

        // On inverse l'interrupteur mondial
        globalSwitchState = !globalSwitchState;

        // On prépare le pack de données à envoyer à tout le monde
        const clickData = {
            state: globalSwitchState,
            location: {
                city: userCity,
                country: userCountry
            },
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            totalClicks: alreadyClickedIPs.size // Donne le nombre total de clics uniques
        };

        // On envoie la mise à jour à TOUS les écrans connectés sur la Terre
        io.emit('switch_updated', clickData);

        // On envoie un ordre spécifique à CE joueur pour désactiver son bouton
        socket.emit('disable_button');
    });
});

// Lancement officiel du serveur web
server.listen(PORT, () => {
    console.log(`🚀 Serveur actif sur http://localhost:${PORT}`);
});