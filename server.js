import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

// Railway utilise le port 8080 par défaut
const PORT = process.env.PORT || 8080;
const URL = "https://fortnite.gg/island/2327-7349-9384";

// --- IMPORTANT : CETTE ROUTE DOIT RÉPONDRE TOUT DE SUITE ---
// C'est ce qui règle l'erreur "Healthcheck failed"
app.get("/", (req, res) => {
    res.status(200).send("✅ API ALIVE");
});

app.get("/api/players", async (req, res) => {
    let browser;
    try {
        console.log("Extraction demandée...");
        browser = await chromium.launch({ 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });

        const page = await context.newPage();

        // On bloque les trucs lourds pour que le serveur reste "Healthy" (léger)
        await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,css}', route => route.abort());

        // Navigation rapide
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });

        // Recherche du chiffre
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

        await browser.close();
        res.json({ ok: playersNow !== null, playersNow: playersNow ? parseInt(playersNow, 10) : "N/A" });

    } catch (err) {
        if (browser) await browser.close();
        console.error("Erreur:", err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Écoute sur 0.0.0.0 est CRUCIAL pour Railway
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
