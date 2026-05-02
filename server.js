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
            // 2. SCRAPING DES JOUEURS (FORTNITE.GG)
            for (const id of mapsToTrack) {
                let p;
                try {
                    p = await context.newPage();
                    // On bloque le superflu pour booster la vitesse
                    await p.route('**/*.{png,jpg,jpeg,css,woff,woff2}', r => r.abort());
                    
                    await p.goto(`https://fortnite.gg/island/${id}`, { waitUntil: "domcontentloaded", timeout: 20000 });
                    
                    // On attend que le conteneur soit là
                    await p.waitForSelector('.js-players-now', { timeout: 10000 }).catch(() => {});
                    // Petit délai pour laisser le JS de Fortnite.gg injecter le chiffre
                    await new Promise(r => setTimeout(r, 2000));

                    const players = await p.evaluate(() => {
                        // Cible A : Le span dans le titre (La plus fiable)
                        const span = document.querySelector('.js-players-now .chart-stats-title span');
                        let val = span ? span.textContent : null;

                        // Cible B : Fallback sur l'attribut data-n
                        if (!val || val.trim() === "") {
                            const container = document.querySelector('.js-players-now [data-n]');
                            val = container ? container.getAttribute('data-n') : null;
                        }

                        return val;
                    });

                    // [DEBUG] Log pour diagnostic rapide dans Railway
                    console.log(`[DEBUG] Brute pour ${id}: "${players}"`);

                    if (players) {
                        // Nettoyage : On ne garde que les chiffres (ex: "1,234" -> 1234)
                        const cleanCount = parseInt(players.replace(/[^\d]/g, ""), 10);
                        
                        if (!isNaN(cleanCount)) {
                            globalStats[id] = cleanCount;
                            console.log(`📈 [LIVE] Map ${id} : ${cleanCount} joueurs`);
                        }
                    } else {
                        console.log(`⚠️ [Alerte] Aucun chiffre trouvé pour ${id}`);
                    }
                } catch (err) {
                    console.log(`❌ Erreur sur ${id}: ${err.message}`);
                } finally {
                    if (p) await p.close();
                }
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
