import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import axios from "axios";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const BASE44_API_LIST = "https://blacklist-manager.base44.app/fortnite-ids";
const FALLBACK_MAPS = ["2327-7349-9384"]; 

let globalStats = {}; 

app.get("/", (req, res) => res.status(200).send("✅ WORKER RADAR ACTIF"));

app.get("/api/players", (req, res) => {
    const mapId = req.query.id;
    if (globalStats[mapId]) {
        res.json({ ok: true, mapId, playersNow: globalStats[mapId] });
    } else {
        res.json({ ok: false, error: "Map non synchronisée." });
    }
});

async function startWorker() {
    let browser;
    try {
        console.log("🛠️ Lancement du navigateur...");
        browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
        const context = await browser.newContext();

        while (true) {
            try {
                console.log("🔄 Extraction des IDs depuis le HTML de Base44...");
                let mapsToTrack = [];
                
                try {
                    // 1. On récupère le HTML brut
                    const response = await axios.get(BASE44_API_LIST, { timeout: 10000, responseType: 'text' });
                    const html = response.data;

                    // 2. LE RADAR (Regex) : On cherche ce qui ressemble à du JSON { "ids": [...] }
                    const jsonMatch = html.match(/\{[\s\S]*"ids"[\s\S]*\}/);

                    if (jsonMatch) {
                        const cleanJson = JSON.parse(jsonMatch[0]);
                        mapsToTrack = cleanJson.ids;
                        console.log(`✅ IDs extraits du HTML : ${mapsToTrack.join(', ')}`);
                    } else {
                        throw new Error("Aucun JSON trouvé dans le HTML");
                    }
                } catch (e) {
                    console.log(`⚠️ Erreur d'extraction (${e.message}). Mode secours activé.`);
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
                console.error("❌ Erreur boucle:", err.message);
            }
            console.log("--- Cycle terminé. Pause 60s ---");
            await new Promise(r => setTimeout(r, 60000));
        }
    } catch (fatal) {
        console.error("🚨 Crash critique:", fatal);
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur prêt sur le port ${PORT}`);
    startWorker().catch(console.error);
});
