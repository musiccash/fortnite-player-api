import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import { createClient } from '@base44/sdk';

const app = express();
app.use(cors());

// Configuration
const PORT = process.env.PORT || 8080;
const base44 = createClient({
  appId: process.env.BASE44_APP_ID,
  headers: {
    "api_key": process.env.BASE44_API_KEY
  }
});

let globalStats = {};

app.get("/", (req, res) => res.send("🚀 SCRAPER BASE44 DOCKERIZED - READY"));
app.get("/health", (req, res) => res.status(200).send("OK"));

async function startWorker() {
    console.log("🛠️ Démarrage du navigateur Playwright...");
    
    // On lance le navigateur une seule fois pour tout le cycle
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    while (true) {
        try {
            console.log("\n--- NOUVEAU CYCLE DE SCAN ---");

            // 1. Récupération des maps (Table 'maps')
            const { data: maps, error: fetchError } = await base44
                .from('maps') 
                .select('fortnite_id')
                .eq('status', 'online');

            if (fetchError) {
                console.error("❌ Erreur Base44 (Fetch):", fetchError.message);
            } else if (maps && maps.length > 0) {
                console.log(`📍 ${maps.length} maps détectées.`);

                for (const map of maps) {
                    const id = map.fortnite_id;
                    if (!id) continue;

                    const p = await context.newPage();
                    // Bloquer les ressources inutiles
                    await p.route('**/*.{png,jpg,jpeg,svg,woff2,css}', r => r.abort());

                    try {
                        console.log(`🔍 Analyse de la map : ${id}`);
                        await p.goto(`https://fortnite.gg/island/${id}`, { waitUntil: "domcontentloaded", timeout: 30000 });
                        
                        // Attente du rendu des compteurs JS
                        await p.waitForTimeout(5000); 

                        const count = await p.evaluate(() => {
                            const el = document.querySelector('.js-players-now [data-n]') || 
                                       document.querySelector('.js-players-now .chart-stats-title span');
                            return el ? (el.getAttribute('data-n') || el.innerText).replace(/[^\d]/g, "") : null;
                        });

                        if (count) {
                            const cleanCount = parseInt(count);
                            globalStats[id] = cleanCount;
                            console.log(`📈 [${id}] : ${cleanCount} joueurs`);

                            // 2. Mise à jour de la base de données
                            const { error: updateError } = await base44
                                .from('maps')
                                .update({ current_players: cleanCount })
                                .eq('fortnite_id', id);
                            
                            if (updateError) console.error(`⚠️ Update Failed [${id}]:`, updateError.message);
                            else console.log(`📡 Base44 synchronisé pour ${id}`);
                        }
                    } catch (err) {
                        console.error(`❌ Erreur technique sur ${id}:`, err.message);
                    } finally {
                        await p.close();
                    }
                    // Petite pause pour éviter la détection
                    await new Promise(r => setTimeout(r, 2000));
                }
            } else {
                console.log("💤 Aucune map active à scanner.");
            }
        } catch (globalErr) {
            console.error("🚨 Erreur critique dans le worker:", globalErr.message);
        }

        console.log("💤 Cycle fini. Attente de 60 secondes...");
        await new Promise(r => setTimeout(r, 60000));
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur HTTP prêt sur le port ${PORT}`);
    startWorker().catch(err => console.error("🚨 Le Worker n'a pas pu démarrer:", err));
});
