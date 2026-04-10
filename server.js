import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

// Railway injecte le port, sinon 8080 par défaut
const PORT = process.env.PORT || 8080;
const URL = "https://fortnite.gg/island/2327-7349-9384";

// --- ROUTES ---

// 1. Route racine pour le Healthcheck de Railway
app.get("/", (req, res) => {
    res.status(200).send("API Statut: OK. Utilisez /api/players pour les données.");
});

// 2. Route principale pour le nombre de joueurs
app.get("/api/players", async (req, res) => {
    let browser;
    try {
        console.log(`[${new Date().toLocaleTimeString()}] Lancement du navigateur...`);
        
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });

        const page = await context.newPage();

        // Blocage des images pour gagner de la RAM sur Railway
        await page.route('**/*', (route) => {
            if (['image', 'media', 'font'].includes(route.request().resourceType())) {
                route.abort();
            } else {
                route.continue();
            }
        });

        console.log("Accès à fortnite.gg...");
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

        // On attend que la page s'initialise
        await page.waitForTimeout(5000);

        const playersNow = await page.evaluate(() => {
            // On cherche le bloc qui contient le texte spécifique
            const divs = Array.from(document.querySelectorAll('div, span, b'));
            const target = divs.find(el => 
                el.innerText.trim() === "Players Right Now" || 
                el.innerText.trim() === "Joueurs actuels"
            );

            if (target && target.parentElement) {
                const parentText = target.parentElement.innerText;
                // On nettoie tout sauf les chiffres
                const cleanValue = parentText
                    .replace("Players Right Now", "")
                    .replace("Joueurs actuels", "")
                    .replace(/[^\d]/g, "");
                
                return cleanValue ? parseInt(cleanValue, 10) : null;
            }
            return null;
        });

        await browser.close();

        // SÉCURITÉ ANTI-ID : Si le chiffre commence par 2327 (ton ID de map), on l'annule
        let finalValue = playersNow;
        if (playersNow && playersNow.toString().startsWith("2327")) {
            console.log("Alerte: Confusion avec l'ID de la map detectée.");
            finalValue = "N/A";
        }

        console.log(`Résultat envoyé : ${finalValue}`);
        res.json({ ok: true, playersNow: finalValue });

    } catch (err) {
        if (browser) await browser.close();
        console.error("ERREUR:", err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// --- DÉMARRAGE ---
// Important: '0.0.0.0' est vital pour Railway
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur en ligne sur le port ${PORT}`);
});
