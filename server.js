import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const URL = "https://fortnite.gg/island/2327-7349-9384";

app.get("/api/players", async (req, res) => {
    let browser;
    try {
        browser = await chromium.launch({ 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-blink-features=AutomationControlled' // Cache le fait que c'est un robot
            ] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale: 'fr-FR',
            timezoneId: 'Europe/Paris'
        });

        const page = await context.newPage();

        // Bloquer les images et les pubs pour charger plus vite et éviter d'être détecté
        await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,css}', route => route.abort());

        console.log("Navigation...");
        await page.goto(URL, { waitUntil: "commit", timeout: 60000 });

        // On attend que le chiffre soit là (on est plus patient : 40s)
        console.log("Attente du chiffre...");
        const playersNow = await page.evaluate(async () => {
            // Petite fonction pour attendre dans le navigateur
            const wait = (ms) => new Promise(res => setTimeout(res, ms));
            
            for (let i = 0; i < 20; i++) { // On essaie pendant 20 secondes
                const el = document.querySelector('.js-players-now .chart-stats-title span');
                const val = el ? el.textContent.trim() : "";
                if (/\d+/.test(val)) return val.replace(/[^\d]/g, "");
                await wait(1000);
            }
            return null;
        });

        await browser.close();
        
        res.json({
            ok: playersNow !== null,
            playersNow: playersNow ? parseInt(playersNow, 10) : "N/A"
        });

    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Port ${PORT}`));
