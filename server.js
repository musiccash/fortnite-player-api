import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;

let browser;
async function getBrowser() {
    if (!browser || !browser.isConnected()) {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
        });
    }
    return browser;
}

app.get("/", (req, res) => res.send("✅ API MULTI-MAPS ALIVE"));

app.get("/api/players", async (req, res) => {
    // On récupère l'ID envoyé par Base44 (ex: 2327-7349-9384)
    const mapId = req.query.id;

    if (!mapId) {
        return res.status(400).json({ ok: false, error: "ID de map manquant dans l'URL" });
    }

    const targetUrl = `https://fortnite.gg/island/${mapId}`;
    let page;

    try {
        const instance = await getBrowser();
        const context = await instance.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });
        
        page = await context.newPage();
        await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,css,woff,woff2}', route => route.abort());

        console.log(`Analyse de la map : ${mapId}`);
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

        const playersNow = await page.evaluate(async () => {
            const wait = (ms) => new Promise(res => setTimeout(res, ms));
            for (let i = 0; i < 15; i++) {
                const el = document.querySelector('.js-players-now .chart-stats-title span');
                const val = el ? el.textContent.trim() : "";
                if (/\d+/.test(val)) return val.replace(/[^\d]/g, "");
                await wait(1000);
            }
            return null;
        });

        await page.close();
        await context.close();
        
        res.json({ ok: playersNow !== null, mapId, playersNow: playersNow ? parseInt(playersNow, 10) : "N/A" });

    } catch (err) {
        if (page) await page.close();
        res.status(500).json({ ok: false, error: "Erreur lors du scraping" });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Port ${PORT}`));
