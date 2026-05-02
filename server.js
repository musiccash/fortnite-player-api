import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const BASE44_URL = "https://blacklist-manager.base44.app/fortnite-ids";
const FALLBACK_MAPS = ["2327-7349-9384"]; // Au cas où

let globalStats = {};

// 1. ROUTE POUR RAILWAY (Healthcheck)
app.get("/", (req, res) => res.status(200).send("🚀 SCRAPER V3 : CONNECTÉ"));

// 2. ROUTE POUR TON SITE (Données en 1ms)
app.get("/api/players", (req, res) => {
    const mapId = req.query.id;
    if (globalStats[mapId]) {
        res.json({ ok: true, mapId, playersNow: globalStats[mapId] });
    } else {
        res.json({ ok: false, error: "Synchro en cours..." });
    }
});

// 3. LE CERVEAU (Le Worker)
async function startWorker() {
    let browser;
    try {
        console.log("🛠️ Démarrage du moteur Playwright...");
        browser = await chromium.launch({ args: ['--no-sandbox'] });
        const context = await browser.newContext();

        while (true) {
            let mapsToTrack = [];
            
            // --- ÉTAPE A : RÉCUPÉRER LES IDS SUR BASE44 ---
            let pageID;
            try {
                console.log("🔍 Lecture de la liste sur Base44...");
                pageID = await context.newPage();
                // On attend que React ait fini de charger (networkidle)
                await pageID.goto(BASE44_URL, { waitUntil: "networkidle", timeout: 30000 });
                
                const content = await pageID.innerText('body');
                // Regex magique pour trouver le JSON dans le texte React
                const match = content.match(/\{[\s\S]*"ids"[\s\S]*\}/);
                
                if (match) {
                    const data = JSON.parse(match[0]);
                    mapsToTrack = data.ids;
                    console.log(`✅ IDs détectés : ${mapsToTrack.join(', ')}`);
                } else {
                    throw new Error("JSON non trouvé sur la page");
                }
            } catch (e) {
                console.log(`⚠️ Erreur Base44 (${e.message}). Liste de secours utilisée.`);
                mapsToTrack = FALLBACK_MAPS;
            } finally {
                if (pageID) await pageID.close();
            }

            // --- ÉTAPE B : SCRAPER LES JOUEURS SUR FORTNITE.GG ---
            for (const id of mapsToTrack) {
                let pageScraper;
                try {
                    pageScraper = await context.newPage();
                    // On bloque le superflu pour économiser la RAM
                    await pageScraper.route('**/*.{png,jpg,css,woff2}', r => r.abort());
                    
                    await pageScraper.goto(`https://fortnite.gg/island/${id}`, { waitUntil: "domcontentloaded", timeout: 15000 });
                    
                    const players = await pageScraper.evaluate(() => {
                        const el = document.querySelector('.js-players-now .chart-stats-title span');
                        return el ? el.textContent.replace(/[^\d]/g, "") : null;
                    });

                    if (players) {
                        globalStats[id] = parseInt(players, 10);
                        console.log(`[LIVE] Map ${id} : ${players} joueurs`);
                    }
                } catch (err) {
                    console.log(`❌ Erreur sur ${id}`);
                } finally {
                    if (pageScraper) await pageScraper.close();
                }
                // Pause de 2s entre chaque map pour ne pas se faire bannir
                await new Promise(r => setTimeout(r, 2000));
            }

            console.log("💤 Cycle fini. Repos 60s...");
            await new Promise(r => setTimeout(r, 60000));
        }
    } catch (fatal) {
        console.error("🚨 CRASH CRITIQUE :", fatal);
        process.exit(1); // Force Railway à redémarrer le serveur
    }
}

// LANCEMENT
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur prêt sur le port ${PORT}`);
    startWorker();
});
