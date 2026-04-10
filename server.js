import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const URL = "https://fortnite.gg/island/2327-7349-9384";

app.get("/api/players", async (req, res) => {
    let browser;
    try {
        // 1. Lancement optimisé pour les serveurs (Linux/Render)
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });

        const page = await context.newPage();

        // 2. OPTIMISATION : On bloque les images, CSS et pubs pour éviter le Timeout
        await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        // 3. Navigation : On attend juste que le DOM soit chargé (beaucoup plus rapide)
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

        // 4. Attente chirurgicale du texte
        // On attend que le sélecteur contenant le texte apparaisse
        await page.waitForSelector('text=/JOUEURS ACTUELS|PLAYERS RIGHT NOW/i', { timeout: 15000 });

        // 5. Extraction
        const result = await page.evaluate(() => {
            function clean(v) {
                return v ? v.replace(/[^\d]/g, "") : null;
            }

            const text = document.body.innerText;
            
            // Tentative avec une Regex globale robuste
            const match = text.match(/(?:JOUEURS ACTUELS|PLAYERS RIGHT NOW|PLAYERS)[\s\n\r]*([0-9\s,]+)/i);
            
            if (match && match[1]) {
                const val = clean(match[1]);
                return val ? parseInt(val, 10) : "N/A";
            }
            return "N/A";
        });

        await browser.close();

        console.log(`[${new Date().toLocaleTimeString()}] Joueurs détectés : ${result}`);
        
        res.json({ 
            ok: true,
            playersNow: result 
        });

    } catch (err) {
        if (browser) await browser.close();
        console.error("ERREUR:", err.message);
        res.status(500).json({ 
            ok: false, 
            playersNow: "Erreur", 
            error: err.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur en ligne sur le port ${PORT}`);
});
