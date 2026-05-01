import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import axios from "axios";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;

// ⚠️ L'URL de la fameuse page publique que Base44 doit te créer
const BASE44_API_LIST = "https://blacklist-manager.base44.app/fortnite-ids";

// Liste de secours au cas où la page Base44 ne répond pas
const FALLBACK_MAPS = ["2327-7349-9384"]; 

// Mémoire locale du serveur
let globalStats = {}; 

// --- ROUTE HEALTHCHECK (Pour Railway) ---
app.get("/", (req, res) => res.status(200).send("✅ WORKER DYNAMIQUE EN LIGNE"));

// --- ROUTE API (Celle appelée par Base44, réponse en 1ms) ---
app.get("/api/players", (req, res) => {
    const mapId = req.query.id;
    if (globalStats[mapId]) {
        res.json({ ok: true, mapId, playersNow: globalStats[mapId] });
    } else {
        res.json({ ok: false, error: "Map non synchronisée. Attente du prochain cycle." });
    }
});

// --- LE WORKER (Le robot en arrière-plan) ---
async function startWorker() {
    let browser;
    try {
        console.log("🛠️ Lancement du navigateur...");
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        const context = await browser.newContext();

        while (true) {
            try {
                console.log("🔄 Recherche des maps sur Base44...");
                let mapsToTrack = [];
                
                try {
                    // Tentative de lecture des IDs sur ton site
                    const response = await axios.get(BASE44_API_LIST, { timeout: 10000 });
                    if (response.data && Array.isArray(response.data.ids)) {
                        mapsToTrack = response.data.ids;
                        console.log(`✅ ${mapsToTrack.length} maps trouvées sur le site.`);
                    } else {
                        throw new Error("Format de réponse invalide");
                    }
                } catch (e) {
                    console.log(`⚠️ Base44 injoignable (${e.message}). Utilisation de la map de secours.`);
                    mapsToTrack = FALLBACK_MAPS;
                }

                // Scraping de chaque map
                for (const id of mapsToTrack) {
                    let page;
                    try {
                        page = await context.newPage();
                        // Bloquer les images pour accélérer le chargement
                        await page.route('**/*.{png,jpg,jpeg,css,woff,woff2}', route => route.abort());
                        await page.goto(`https://fortnite.gg/island/${id}`, { waitUntil: "domcontentloaded", timeout: 20000 });

                        const count = await page.evaluate(() => {
                            const el = document.querySelector('.js-players-now .chart-stats-title span');
                            return el ? el.textContent.replace(/[^\d]/g, "") : null;
                        });

                        if (count) {
                            globalStats[id] = parseInt(count, 10);
                            console.log(`[Worker] 🎮 Map ${id} : ${count} joueurs`);
                        }
                    } catch (e) {
                        console.log(`❌ Erreur sur la map ${id}`);
                    } finally {
                        if (page) await page.close();
                    }
                    // Pause de 2 secondes entre les maps
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (err) {
                console.error("❌ Erreur générale de la boucle:", err.message);
            }
            
            console.log("⏳ Fin du cycle. Prochaine mise à jour dans 60s...");
            await new Promise(r => setTimeout(r, 60000)); // Pause de 1 minute
        }
    } catch (fatal) {
        console.error("🚨 Crash critique du navigateur:", fatal);
    }
}

// --- DÉMARRAGE DU SERVEUR ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur prêt sur le port ${PORT}`);
    // On lance le robot une fois le port ouvert
    startWorker().catch(console.error);
});
