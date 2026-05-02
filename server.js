import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

// --- CONFIGURATION ---
const PORT = process.env.PORT || 8080;
const BASE44_URL = "https://blacklist-manager.base44.app/fortnite-ids";
const FALLBACK_MAPS = ["2327-7349-9384"]; // La map de secours

// Mémoire qui stocke les joueurs
let globalStats = {};

// --- ROUTE 1 : HEALTHCHECK RAILWAY ---
app.get("/", (req, res) => {
    res.status(200).send("✅ SERVEUR V4 EN LIGNE - WORKER ACTIF");
});

// --- ROUTE 2 : API POUR BASE44 ---
app.get("/api/players", (req, res) => {
    const mapId = req.query.id;
    if (globalStats[mapId]) {
        res.json({ ok: true, mapId: mapId, playersNow: globalStats[mapId] });
    } else {
        res.json({ ok: false, error: "Synchro en cours ou map introuvable." });
    }
});

// --- LE WORKER (ROBOT SCRAPER) ---
async function startWorker() {
    let browser;
    try {
        console.log("🛠️ Démarrage du navigateur Playwright...");
        // Lancement du navigateur optimisé pour serveur
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        const context = await browser.newContext();

        // Boucle infinie du robot
        while (true) {
            let mapsToTrack = [];
            let pageBase44;
            
            // ==========================================
            // ÉTAPE 1 : LIRE LA LISTE SUR BASE44
            // ==========================================
            try {
                console.log("🔍 ÉTAPE 1 : Lecture de la liste sur Base44...");
                pageBase44 = await context.newPage();
                
                // On va sur la page et on attend que le réseau se calme (React a fini de charger)
                await pageBase44.goto(BASE44_URL, { waitUntil: "networkidle", timeout: 45000 });
                
                let content = "";
                
                try {
                    // Tentative A : On cherche la balise <pre id="json-output"> dont Base44 a parlé
                    console.log("   -> Recherche de la balise <pre>...");
                    const preLocator = pageBase44.locator('pre#json-output, pre');
                    await preLocator.first().waitFor({ timeout: 5000 });
                    content = await preLocator.first().textContent();
                } catch (err) {
                    // Tentative B : Si la balise n'y est pas, on aspire tout le texte de la page
                    console.log("   -> Balise <pre> introuvable, scan global de la page...");
                    content = await pageBase44.innerText('body');
                }

                console.log(`   -> Extrait du texte lu : "${content.substring(0, 50)}..."`);

                // On extrait le JSON avec une Regex
                const match = content.match(/\{[\s\S]*"ids"[\s\S]*\}/);
                
                if (match) {
                    const data = JSON.parse(match[0]);
                    mapsToTrack = data.ids;
                    console.log(`✅ SUCCÈS : IDs détectés : ${mapsToTrack.join(', ')}`);
                } else {
                    throw new Error("Aucun format JSON valide trouvé dans le texte");
                }
            } catch (e) {
                console.log(`⚠️ ÉCHEC BASE44 : ${e.message}`);
                console.log(`   -> Utilisation de la liste de secours : ${FALLBACK_MAPS[0]}`);
                mapsToTrack = FALLBACK_MAPS;
            } finally {
                // On ferme toujours l'onglet pour ne pas faire exploser la RAM
                if (pageBase44) await pageBase44.close();
            }

            // ==========================================
            // ÉTAPE 2 : SCRAPER LES MAPS SUR FORTNITE.GG
            // ==========================================
            console.log("🎮 ÉTAPE 2 : Scraping des statistiques...");
            for (const id of mapsToTrack) {
                let pageFortnite;
                try {
                    pageFortnite = await context.newPage();
                    
                    // Bloquer les images et CSS pour aller 10x plus vite
                    await pageFortnite.route('**/*.{png,jpg,jpeg,css,woff,woff2}', route => route.abort());
                    
                    // Aller sur la map
                    await pageFortnite.goto(`https://fortnite.gg/island/${id}`, { waitUntil: "domcontentloaded", timeout: 20000 });
                    
                    // Extraire le chiffre
                    const players = await pageFortnite.evaluate(() => {
                        const el = document.querySelector('.js-players-now');
                        return el ? el.getAttribute('data-n') : null;
                    });

                    if (players) {
                        globalStats[id] = parseInt(players, 10);
                        console.log(`   -> [LIVE] Map ${id} : ${players} joueurs`);
                    } else {
                        console.log(`   -> [Alerte] Impossible de lire le chiffre pour ${id}`);
                    }
                } catch (err) {
                    console.log(`❌ Erreur lors du scraping de la map ${id} : ${err.message}`);
                } finally {
                    if (pageFortnite) await pageFortnite.close();
                }
                
                // Petite pause entre chaque map pour ne pas alerter Fortnite.gg
                await new Promise(r => setTimeout(r, 2000));
            }

            // ==========================================
            // ÉTAPE 3 : PAUSE AVANT LE PROCHAIN CYCLE
            // ==========================================
            console.log("💤 Cycle terminé. Le robot se repose pendant 60 secondes...");
            await new Promise(r => setTimeout(r, 60000));
        }
    } catch (fatalError) {
        console.error("🚨 CRASH CRITIQUE DU ROBOT :", fatalError);
        process.exit(1); // Force Railway à redémarrer
    }
}

// --- DÉMARRAGE OFFICIEL ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`✅ Serveur prêt sur le port ${PORT}`);
    console.log(`=========================================`);
    startWorker();
});
