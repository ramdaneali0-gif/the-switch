const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
app.set('trust proxy', true); 

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

// Liste de boss massifs
const bossList = [
    { name: "Titan de Pierre Primordial", emoji: "🪨" },
    { name: "Béhémoth des Forges", emoji: "🔥" },
    { name: "Léviathan des Abysses", emoji: "🐉" },
    { name: "Colosse de Foudre", emoji: "⚡" },
    { name: "Seigneur du Néant Ancien", emoji: "👑" }
];

let currentBossIndex = 0;
let boss = {
    name: bossList[0].name,
    emoji: bossList[0].emoji,
    level: 1,
    maxHp: 25000, // Gros pool de PV dès le début
    hp: 25000
};

const players = {};

io.on('connection', (socket) => {
    // Profil de départ du joueur
    players[socket.id] = {
        gold: 0,
        damageLevel: 1,
        critLevel: 1,
        stats: {
            baseDmg: 10,
            critChance: 5 // 5% de chance de base
        }
    };

    socket.emit('init_game', { boss: boss, player: players[socket.id] });

    // Gestion de l'attaque
    socket.on('attack_boss', () => {
        const player = players[socket.id];
        if (!player || boss.hp <= 0) return;

        let dmg = player.stats.baseDmg;
        let isCrit = false;

        // Calcul du coup critique
        if (Math.random() * 100 < player.stats.critChance) {
            dmg = dmg * 2; // Dégâts doublés sur un crit
            isCrit = true;
        }

        boss.hp -= dmg;
        player.gold += isCrit ? dmg * 2 : dmg; // Plus d'or sur un coup critique

        // Boss terrassé
        if (boss.hp <= 0) {
            boss.level += 1;
            currentBossIndex = (currentBossIndex + 1) % bossList.length;
            
            boss.name = bossList[currentBossIndex].name;
            boss.emoji = bossList[currentBossIndex].emoji;
            boss.maxHp = Math.floor(boss.maxHp * 1.8); // Échelle massive x1.8 HP
            boss.hp = boss.maxHp;

            // Bonus global aux connectés
            Object.keys(players).forEach(id => {
                players[id].gold += 500 * boss.level;
            });

            io.emit('boss_defeated', { boss: boss, message: `Le Titan a évolué !` });
        }

        io.emit('boss_updated', { hp: boss.hp, maxHp: boss.maxHp });
        socket.emit('player_updated', player);
        
        // On envoie l'effet visuel du coup (Crit ou Normal) à tout le monde
        io.emit('damage_effect', { isCrit: isCrit, damage: dmg });
    });

    // Achat d'améliorations
    socket.on('upgrade_stat', (type) => {
        const player = players[socket.id];
        if (!player) return;

        if (type === 'damage') {
            const cost = Math.floor(30 * Math.pow(1.5, player.damageLevel - 1));
            if (player.gold >= cost) {
                player.gold -= cost;
                player.damageLevel += 1;
                player.stats.baseDmg += 8; // +8 dégâts par niveau
                socket.emit('player_updated', player);
            }
        } 
        else if (type === 'crit') {
            if (player.stats.critChance >= 100) return; // Cap max à 100%
            
            const cost = Math.floor(50 * Math.pow(1.6, player.critLevel - 1));
            if (player.gold >= cost) {
                player.gold -= cost;
                player.critLevel += 1;
                player.stats.critChance += 3; // +3% chance de crit par niveau
                socket.emit('player_updated', player);
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT);