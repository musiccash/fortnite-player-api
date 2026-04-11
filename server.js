import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const URL = "https://fortnite.gg/island/2327-7349-9384";

app.get("/", (req, res) => res.send("🚀 API Fortnite Online - Version Ultra-Précise Active"));

app.get("/api/players", async (req, res) => {
    let browser;
    try {
        console.log("Lancement de l'extraction par sélecteur CSS...");
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });
        const page = await context.newPage();

        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });

        // On attend spécifiquement que l'élément avec la classe 'js-players-now' soit là
        try {
            await page.waitForSelector('.js-players-now', { timeout: 15000 });
        } catch (e) {
            console.log("Sélecteur non trouvé, tentative d'attente classique...");
            await page.waitForTimeout(5000);
        }

        const playersNow = await page.evaluate(() => {
            // MÉTHODE 1 : Span dans .chart-stats-title à l'intérieur de .js-players-now (structure réelle)
            const span = document.querySelector('.js-players-now .chart-stats-title span');
            if (span) {
                const text = (span.textContent || span.innerText || "").replace(/[^\d]/g, "");
                if (text) return text;
            }

            // MÉTHODE 2 : Attribut data-n sur l'élément .js-players-now
            const el = document.querySelector('.js-players-now');
            if (el) {
                const dataN = el.getAttribute('data-n');
                if (dataN && /\d/.test(dataN)) return dataN;
            }

            // MÉTHODE 3 : Tout span numérique dans .chart-stats-title (fallback large)
            const anySpan = document.querySelector('.chart-stats-title span');
            if (anySpan) {
                const text = (anySpan.textContent || anySpan.innerText || "").replace(/[^\d]/g, "");
                if (text) return text;
            }

            return null;
        });


        await browser.close();
        
        console.log(`[LOG] Chiffre extrait via CSS : ${playersNow}`);

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
