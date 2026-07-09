const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// --- ÉTAT GLOBAL DU BOSS ---
let boss = {
    name: "Giga Dragon de Render",
    level: 1,
    maxHp: 10000,
    hp: 10000
};

// Base de données en mémoire pour stocker l'or et les multiplicateurs des joueurs connectés
const players = {};

io.on('connection', (socket) => {
    console.log(`Joueur connecté : ${socket.id}`);

    // On initialise le joueur avec 0 pièces et un multiplicateur de dégâts de 1 (mains nues)
    players[socket.id] = {
        gold: 0,
        multiplier: 1,
        weaponName: "Poings"
    };

    // Envoyer l'état du boss et les infos du joueur dès qu'il arrive
    socket.emit('init_game', {
        boss: boss,
        player: players[socket.id]
    });

    // Événement : Le joueur attaque le Boss
    socket.on('attack_boss', () => {
        if (!players[socket.id] || boss.hp <= 0) return;

        const playerModifier = players[socket.id].multiplier;
        const damageInflicted = 10 * playerModifier; // 10 dégâts de base x le multiplicateur

        // On baisse les points de vie du boss
        boss.hp -= damageInflicted;
        
        // Le joueur gagne de l'or proportionnel à ses dégâts
        players[socket.id].gold += 1 * playerModifier;

        // --- SI LE BOSS EST MORT ---
        if (boss.hp <= 0) {
            boss.level += 1;
            boss.maxHp = Math.floor(boss.maxHp * 1.5); // +50% de PV au prochain niveau
            boss.hp = boss.maxHp;
            
            // On offre un bonus d'or à TOUS les joueurs actuellement connectés pour la victoire !
            Object.keys(players).forEach(id => {
                players[id].gold += 100 * boss.level;
            });

            // On prévient tout le monde que le boss a évolué
            io.emit('boss_defeated', { boss: boss, message: `Le Boss a été terrassé ! Bienvenue au Niveau ${boss.level} !` });
        }

        // On renvoie les points de vie mis à jour à TOUT LE MONDE
        io.emit('boss_updated', { hp: boss.hp, maxHp: boss.maxHp });

        // On renvoie ses nouvelles stats perso (or) UNIQUEMENT au joueur qui a cliqué
        socket.emit('player_updated', players[socket.id]);
    });

    // Événement : Le joueur achète une arme dans la boutique
    socket.on('buy_weapon', (weaponType) => {
        const player = players[socket.id];
        if (!player) return;

        // Configuration des armes disponibles
        const weapons = {
            wood_sword:  { name: "Épée en Bois", price: 50,  mult: 2 },
            iron_sword:  { name: "Épée en Fer",  price: 250, mult: 5 },
            diamond_axe: { name: "Hache Diamant", price: 1000, mult: 15 }
        };

        const chosenWeapon = weapons[weaponType];

        if (chosenWeapon && player.gold >= chosenWeapon.price) {
            // On vérifie s'il n'a pas déjà une meilleure arme ou la même
            if (chosenWeapon.mult > player.multiplier) {
                player.gold -= chosenWeapon.price;
                player.multiplier = chosenWeapon.mult;
                player.weaponName = chosenWeapon.name;

                // On valide l'achat auprès du joueur
                socket.emit('player_updated', player);
                socket.emit('shop_success', `Tu as équipé : ${chosenWeapon.name} !`);
            } else {
                socket.emit('shop_error', "Tu possèdes déjà une arme équivalente ou meilleure !");
            }
        } else {
            socket.emit('shop_error', "Or insuffisant pour acheter cette arme !");
        }
    });

    socket.on('disconnect', () => {
        console.log(`Joueur déconnecté : ${socket.id}`);
        delete players[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur Boss Raid démarré sur le port ${PORT}`);
});