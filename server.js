import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const URL = "https://fortnite.gg/island/2327-7349-9384";

app.get("/", (req, res) => res.send("🚀 API Fortnite Online - Fix Final"));

app.get("/api/players", async (req, res) => {
    let browser;
    try {
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });
        const page = await context.newPage();

        // 1. Navigation
        await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });

        // 2. L'ÉTAPE CLÉ : On attend que le span contienne un chiffre
        // On ne se contente pas d'attendre l'élément, on attend qu'il soit rempli
        await page.waitForFunction(() => {
            const el = document.querySelector('.js-players-now .chart-stats-title span');
            return el && el.textContent && /\d+/.test(el.textContent);
        }, { timeout: 20000 });

        // 3. Extraction
        const playersNow = await page.evaluate(() => {
            const el = document.querySelector('.js-players-now .chart-stats-title span');
            return el ? el.textContent.replace(/[^\d]/g, "") : null;
        });

        await browser.close();
        
        res.json({
            ok: playersNow !== null,
            playersNow: playersNow ? parseInt(playersNow, 10) : "N/A"
        });

    } catch (err) {
        if (browser) await browser.close();
        console.error("Erreur:", err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur en ligne sur le port ${PORT}`);
});
