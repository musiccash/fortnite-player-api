import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import axios from "axios";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const BASE44_API_LIST = "https://blacklist-manager.base44.app/api/get-all-fortnite-ids";

// 1. LISTE DE SECOURS (Si Base44 ne répond pas)
const FALLBACK_MAPS = ["2327-7349-9384"]; 

let globalStats = {}; 

app.get("/", (req, res) => res.status(200).send("🚀 WORKER DYNAMIQUE OK"));

app.get("/api/players", (req, res) => {
    const mapId = req.query.id;
    if (globalStats[mapId]) {
        res.json({ ok: true, mapId, playersNow: globalStats[mapId] });
    } else {
        res.json({ ok: false, error: "Map non synchronisée. Attendez 1 min." });
    }
});

async function startWorker() {
    let browser;
    try {
        browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
        const context = await browser.newContext();

        while (true) {
            try {
                console.log("🔄 Tentative de récupération des IDs depuis Base44...");
                let mapsToTrack = [];
                
                try {
                    const response = await axios.get(BASE44_API_LIST, { timeout: 5000 });
                    if (response.data && Array.isArray(response.data.ids)) {
                        mapsToTrack = response.data.ids;
                        console.log(`✅ Liste récupérée : ${mapsToTrack.length} maps.`);
                    }
                } catch (e) {
                    console.log(`⚠️ Base44 inaccessible (${e.message}). Utilisation de la liste de secours.`);
                    mapsToTrack = FALLBACK_MAPS;
                }

                for (const id of mapsToTrack) {
                    let page;
                    try {
                        page = await context.newPage();
                        await page.route('**/*.{png,jpg,jpeg,css,woff,woff2}', route => route.abort());
                        await page.goto(`https://fortnite.gg/island/${id}`, { waitUntil: "domcontentloaded", timeout: 20000 });

                        const count = await page.evaluate(() => {
                            const el = document.querySelector('.js-players-now .chart-stats-title span');
                            return el ? el.textContent.replace(/[^\d]/g, "") : null;
                        });

                        if (count) {
                            globalStats[id] = parseInt(count, 10);
                            console.log(`[Worker] Map ${id} : ${count} joueurs`);
                        }
                    } catch (e) {
                        console.log(`❌ Erreur scraping map ${id}`);
                    } finally {
                        if (page) await page.close();
                    }
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (err) {
                console.error("❌ Erreur boucle worker:", err.message);
            }
            console.log("--- Pause de 60s ---");
            await new Promise(r => setTimeout(r, 60000));
        }
    } catch (fatal) {
        console.error("❌ Crash navigateur:", fatal);
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur prêt sur le port ${PORT}`);
    startWorker().catch(console.error);
});
