import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

// --- CONFIGURATION ---
const PORT = process.env.PORT || 8080;
const BASE44_URL = "https://blacklist-manager.base44.app/fortnite-ids";
const BASE44_API_UPDATE = "https://blacklist-manager.base44.app/api/update-players";
const API_KEY = process.env.BASE44_API_KEY || "TON_CODE_SECRET_ICI";

// Stockage local pour consultation rapide via /api/players
let globalStats = {};

// --- ROUTES EXPRESS ---
app.get("/", (req, res) => res.send("🚀 WORKER SCRAPER V5 EN LIGNE"));

app.get("/api/players", (req, res) => {
    const { id } = req.query;
    if (id && globalStats[id] !== undefined) {
        return res.json({ ok: true, mapId: id, playersNow: globalStats[id] });
    }
    res.json({ ok: false, data: globalStats });
});

// --- FONCTION DE MISE À JOUR VERS BASE44 ---
async function updateBase44(mapId, count) {
    try {
        const response = await fetch(BASE44_API_UPDATE, {
            method: 'POST', // Ou PUT selon ton API
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': API_KEY // Sécurité
            },
            body: JSON.stringify({
                fortnite_id: mapId,
                current_players: parseInt(count)
            })
        });
        console.log(`📡 Base44 Update [${mapId}]: ${response.statusText}`);
    } catch (err) {
        console.error(`⚠️ Erreur envoi Base44 [${mapId}]:`, err.message);
    }
}

// --- LE WORKER (BOUCLE INFINIE) ---
async function startWorker() {
    console.log("🛠️ Initialisation du navigateur...");
    
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    while (true) {
        try {
            console.log("\n--- NOUVEAU CYCLE ---");

            // 1. RÉCUPÉRATION DES IDS DEPUIS BASE44
            const pageBase = await context.newPage();
            let mapsToTrack = [];
            try {
                await pageBase.goto(BASE44_URL, { waitUntil: "networkidle", timeout: 20000 });
                const bodyText = await pageBase.innerText('body');
                const jsonMatch = bodyText.match(/\{[\s\S]*"ids"[\s\S]*\}/);
                mapsToTrack = jsonMatch ? JSON.parse(jsonMatch[0]).ids : [];
            } catch (e) {
                console.error("❌ Impossible de lire /fortnite-ids");
            } finally { await pageBase.close(); }

            console.log(`📍 Maps à scanner : ${mapsToTrack.length}`);

            // 2. SCRAPING INDIVIDUEL
            for (const id of mapsToTrack) {
                const p = await context.newPage();
                // Optimisation : On bloque les images et le CSS lourd
                await p.route('**/*.{png,jpg,jpeg,svg,woff2,css}', r => r.abort());

                try {
                    await p.goto(`https://fortnite.gg/island/${id}`, { waitUntil: "domcontentloaded", timeout: 30000 });
                    
                    // Attente que le JS de Fortnite.gg injecte le nombre
                    await p.waitForTimeout(5000);

                    const playerCount = await p.evaluate(() => {
                        const el = document.querySelector('.js-players-now [data-n]') || 
                                   document.querySelector('.js-players-now .chart-stats-title span');
                        return el ? el.innerText.replace(/[^\d]/g, "") : null;
                    });

                    if (playerCount) {
                        const cleanCount = parseInt(playerCount);
                        globalStats[id] = cleanCount;
                        console.log(`📈 [${id}] : ${cleanCount} joueurs`);
                        
                        // 3. ENVOI À BASE44
                        await updateBase44(id, cleanCount);
                    }
                } catch (err) {
                    console.error(`❌ Erreur sur ${id}:`, err.message);
                } finally {
                    await p.close();
                }
                // Pause de 2s entre chaque map pour éviter le ban
                await new Promise(r => setTimeout(r, 2000));
            }

        } catch (globalErr) {
            console.error("🚨 Erreur critique cycle:", globalErr.message);
        }

        console.log("💤 Cycle terminé. Repos 60s...");
        await new Promise(r => setTimeout(r, 60000));
    }
}

// Lancement
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur prêt sur port ${PORT}`);
    startWorker();
});
