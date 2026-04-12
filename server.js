import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;

// 1. CONFIGURATION : Ajoute ici tous les IDs de tes maps
const MAPS_TO_TRACK = [
    "2327-7349-9384", 
    "AUTRE-ID-ICI",
    "ENCORE-UN-AUTRE"
];

// 2. STOCKAGE GLOBAL : C'est ici que les chiffres sont gardés
let globalStats = {}; 

app.get("/", (req, res) => res.send("🚀 API WORKER ACTIVE"));

// La route est maintenant instantanée !
app.get("/api/players", (req, res) => {
    const mapId = req.query.id;
    if (globalStats[mapId]) {
        res.json({ ok: true, mapId, playersNow: globalStats[mapId] });
    } else {
        res.json({ ok: false, error: "Map non suivie ou en cours de chargement" });
    }
});

// 3. LE WORKER : La fonction qui tourne en boucle
async function startWorker() {
    console.log("🛠️ Démarrage du Worker de scraping...");
    const browser = await chromium.launch({ 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
    });

    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    });

    while (true) { // Boucle infinie
        for (const id of MAPS_TO_TRACK) {
            let page;
            try {
                console.log(`[Worker] Update de la map : ${id}`);
                page = await context.newPage();
                await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,css,woff,woff2}', route => route.abort());
                
                await page.goto(`https://fortnite.gg/island/${id}`, { waitUntil: "domcontentloaded", timeout: 30000 });

                const count = await page.evaluate(() => {
                    const el = document.querySelector('.js-players-now .chart-stats-title span');
                    return el ? el.textContent.replace(/[^\d]/g, "") : null;
                });

                if (count) {
                    globalStats[id] = parseInt(count, 10);
                    console.log(`[Worker] Succès : ${id} -> ${count} joueurs`);
                }
                await page.close();
            } catch (err) {
                console.error(`[Worker] Erreur sur ${id}:`, err.message);
                if (page) await page.close();
            }
            // Petite pause de 2 secondes entre chaque map pour ne pas se faire bannir
            await new Promise(r => setTimeout(r, 2000));
        }
        
        console.log("--- Cycle terminé. Pause de 60s avant le prochain refresh ---");
        await new Promise(r => setTimeout(r, 60000)); // Attend 1 minute avant de recommencer
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur actif sur ${PORT}`);
    // On lance le worker en arrière-plan sans bloquer le serveur
    startWorker().catch(console.error);
});
