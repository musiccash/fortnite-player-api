import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const URL = "https://fortnite.gg/island/2327-7349-9384";

// Route de base (Healthcheck pour Railway)
app.get("/", (req, res) => res.send("🚀 API Fortnite LIVE"));

app.get("/api/players", async (req, res) => {
    let browser;
    try {
        console.log("Lancement de Chromium...");
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });

        const page = await context.newPage();
        
        console.log("Chargement de la page...");
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });

        // On attend que les stats dynamiques se chargent
        await page.waitForTimeout(8000);

        const playersNow = await page.evaluate(() => {
            // LISTE NOIRE : On ignore l'année actuelle et ton ID de map
            const blacklist = ["2025", "2026", "2327", "7349", "9384"];
            
            // On cherche le texte "Players Right Now"
            const elements = Array.from(document.querySelectorAll('div, b, span, p'));
            const targetLabel = elements.find(el => {
                const text = el.innerText.toUpperCase();
                return text.includes("PLAYERS RIGHT NOW") || text.includes("JOUEURS ACTUELS");
            });

            if (targetLabel) {
                // On récupère le texte du conteneur parent qui contient le chiffre
                const containerText = targetLabel.parentElement.innerText;
                // On extrait tous les nombres
                const foundNumbers = containerText.match(/\d+/g);

                if (foundNumbers) {
                    // On filtre pour ne garder que le chiffre qui n'est PAS dans la liste noire
                    const result = foundNumbers.find(n => !blacklist.includes(n));
                    return result || null;
                }
            }
            return null;
        });

        await browser.close();
        
        console.log(`Extraction réussie : ${playersNow}`);

        res.json({
            ok: playersNow !== null,
            playersNow: playersNow ? parseInt(playersNow, 10) : "N/A"
        });

    } catch (err) {
        if (browser) await browser.close();
        console.error("Erreur détectée:", err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur actif sur le port ${PORT}`);
});
