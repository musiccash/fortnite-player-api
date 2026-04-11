import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const URL = "https://fortnite.gg/island/2327-7349-9384";

// On garde le navigateur en mémoire à l'extérieur de la route
let browser;

async function getBrowser() {
    if (!browser || !browser.isConnected()) {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
        });
    }
    return browser;
}

app.get("/", (req, res) => res.send("✅ API ALIVE"));

app.get("/api/players", async (req, res) => {
    let page;
    try {
        const instance = await getBrowser();
        const context = await instance.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });
        
        page = await context.newPage();
        
        // Optimisation : on bloque le superflu
        await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,css,woff,woff2}', route => route.abort());

        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });

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

        // TRÈS IMPORTANT : On ferme l'onglet et le contexte, mais PAS le navigateur
        await page.close();
        await context.close();
        
        res.json({ ok: playersNow !== null, playersNow: playersNow ? parseInt(playersNow, 10) : "N/A" });

    } catch (err) {
        if (page) await page.close();
        console.error("Erreur:", err.message);
        res.status(500).json({ ok: false, error: "Serveur surchargé, réessayez dans un instant." });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Port ${PORT}`));
