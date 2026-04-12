import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import axios from "axios"; // On ajoute axios pour appeler ton site

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const BASE44_API_LIST = "https://blacklist-manager.base44.app/api/get-all-fortnite-ids"; // L'URL que l'IA Base44 doit créer

let globalStats = {}; 

app.get("/", (req, res) => res.send("🚀 WORKER DYNAMIQUE ACTIF"));

app.get("/api/players", (req, res) => {
    const mapId = req.query.id;
    if (globalStats[mapId]) {
        res.json({ ok: true, mapId, playersNow: globalStats[mapId] });
    } else {
        res.json({ ok: false, error: "Map non encore synchronisée" });
    }
});

async function startWorker() {
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext();

    while (true) {
        try {
            // --- ÉTAPE CLÉ : Récupérer la liste depuis ta BDD ---
            console.log("🔄 Récupération de la liste des maps depuis Base44...");
            const response = await axios.get(BASE44_API_LIST);
            const mapsToTrack = response.data.ids; // On attend un format { ids: ["ID1", "ID2"] }

            for (const id of mapsToTrack) {
                let page;
                try {
                    page = await context.newPage();
                    await page.route('**/*.{png,jpg,jpeg,css}', route => route.abort());
                    await page.goto(`https://fortnite.gg/island/${id}`, { waitUntil: "domcontentloaded", timeout: 20000 });

                    const count = await page.evaluate(() => {
                        const el = document.querySelector('.js-players-now .chart-stats-title span');
                        return el ? el.textContent.replace(/[^\d]/g, "") : null;
                    });

                    if (count) {
                        globalStats[id] = parseInt(count, 10);
                        console.log(`[Worker] ${id}: ${count} joueurs`);
                    }
                    await page.close();
                } catch (err) {
                    if (page) await page.close();
                }
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (err) {
            console.error("❌ Impossible de joindre la BDD de Base44:", err.message);
        }
        await new Promise(r => setTimeout(r, 60000));
    }
}

app.listen(PORT, '0.0.0.0', () => {
    startWorker().catch(console.error);
});
