import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import axios from "axios";

const app = express();
app.use(cors());

// Port par défaut pour Railway
const PORT = process.env.PORT || 8080;
// L'URL de ton site qui renverra la liste des maps
const BASE44_API_LIST = "https://blacklist-manager.base44.app/api/get-all-fortnite-ids";

// Objet qui stocke les stats en mémoire
let globalStats = {}; 

// --- ROUTE HEALTHCHECK (Cruciale pour Railway) ---
app.get("/", (req, res) => {
    res.status(200).send("🚀 WORKER DYNAMIQUE OK");
});

// --- ROUTE API POUR BASE44 ---
app.get("/api/players", (req, res) => {
    const mapId = req.query.id;
    if (globalStats[mapId]) {
        res.json({ ok: true, mapId, playersNow: globalStats[mapId] });
    } else {
        res.json({ ok: false, error: "Map non synchronisée. Attendez 1 min." });
    }
});

// --- LE WORKER QUI TOURNE EN FOND ---
async function startWorker() {
    let browser;
    try {
        console.log("🛠️ Lancement du navigateur en arrière-plan...");
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        const context = await browser.newContext();

        // Boucle infinie
        while (true) {
            try {
                console.log("🔄 Récupération des IDs depuis Base44...");
                // On essaie de récupérer la liste des maps. Si le site bug, on renvoie null.
                const response = await axios.get(BASE44_API_LIST).catch(() => null);
                
                // Si la requête échoue ou que les données sont mal formées, on attend et on recommence
                if (!response || !response.data || !Array.isArray(response.data.ids)) {
                    console.log("⚠️ Impossible de lire la liste sur Base44 (ou liste vide), nouvel essai dans 30s...");
                    await new Promise(r => setTimeout(r, 30000));
                    continue; 
                }

                const mapsToTrack = response.data.ids;
                console.log(`📋 ${mapsToTrack.length} map(s) à scanner.`);

                for (const id of mapsToTrack) {
                    let page;
                    try {
                        page = await context.newPage();
                        // Bloquer les éléments inutiles pour aller très vite
                        await page.route('**/*.{png,jpg,jpeg,css,woff,woff2}', route => route.abort());
                        await page.goto(`https://fortnite.gg/island/${id}`, { waitUntil: "domcontentloaded", timeout: 20000 });

                        // Extraction du nombre
                        const count = await page.evaluate(() => {
                            const el = document.querySelector('.js-players-now .chart-stats-title span');
                            return el ? el.textContent.replace(/[^\d]/g, "") : null;
                        });

                        if (count) {
                            globalStats[id] = parseInt(count, 10);
                            console.log(`[Worker] Map ${id} : ${count} joueurs`);
                        }
                    } catch (e) {
                        console.log(`⚠️ Erreur de lecture sur la map ${id}`);
                    } finally {
                        if (page) await page.close();
                    }
                    // Petite pause de 2 secondes entre chaque map
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (err) {
                console.error("❌ Erreur dans la boucle du worker:", err.message);
            }
            // Pause de 60 secondes avant de recommencer le cycle complet
            console.log("--- Fin du cycle. Prochaine mise à jour dans 60s ---");
            await new Promise(r => setTimeout(r, 60000));
        }
    } catch (fatal) {
        console.error("❌ Crash critique du navigateur:", fatal);
    }
}

// --- DÉMARRAGE DU SERVEUR ---
// On écoute d'abord le port pour que Railway valide le Healthcheck
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur prêt sur le port ${PORT}`);
    // On lance le robot seulement APRES que le serveur soit en ligne
    startWorker().catch(console.error);
});
