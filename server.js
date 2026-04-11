import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const URL = "https://fortnite.gg/island/2327-7349-9384";

app.get("/", (req, res) => res.send("🚀 API Fortnite Player Count - Logic v3.0 (Robust)"));

app.get("/api/players", async (req, res) => {
    let browser;
    try {
        console.log("Démarrage de l'extraction (Multi-méthode)...");
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });
        const page = await context.newPage();

        // On attend que le réseau soit calme
        await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });

        // Petit délai supplémentaire de sécurité pour le rendu du JS
        await page.waitForTimeout(5000);

        const playersNow = await page.evaluate(() => {
            // METHODE 1 : Le Span précis (le plus fiable d'après ton analyse)
            const primarySpan = document.querySelector('.js-players-now .chart-stats-title span');
            if (primarySpan && primarySpan.textContent) {
                const val = primarySpan.textContent.replace(/[^\d]/g, "");
                if (val) return val;
            }

            // METHODE 2 : L'attribut data-n (en secours)
            const dataElement = document.querySelector('.js-players-now');
            if (dataElement && dataElement.getAttribute('data-n')) {
                const val = dataElement.getAttribute('data-n');
                if (val) return val;
            }

            // METHODE 3 : Sélecteur plus large si la structure bouge
            const broadSpan = document.querySelector('.chart-stats-title span');
            if (broadSpan && (broadSpan.innerText || broadSpan.textContent)) {
                const val = (broadSpan.innerText || broadSpan.textContent).replace(/[^\d]/g, "");
                if (val) return val;
            }

            return null;
        });

        await browser.close();
        
        console.log(`[LOG] Extraction terminée. Valeur trouvée : ${playersNow}`);

        res.json({
            ok: playersNow !== null,
            playersNow: playersNow ? parseInt(playersNow, 10) : "N/A"
        });

    } catch (err) {
        if (browser) await browser.close();
        console.error("ERREUR:", err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur actif sur le port ${PORT}`);
});
