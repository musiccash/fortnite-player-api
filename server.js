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
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });

        const page = await context.newPage();

        // 1. On bloque le superflu pour la rapidité
        await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'media', 'font'].includes(type)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        // 2. Navigation
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

        // 3. Attente que le bloc des statistiques soit chargé
        await page.waitForSelector('.island-stats', { timeout: 15000 });

        // 4. Extraction Ciblée
        const playersNow = await page.evaluate(() => {
            // On cherche spécifiquement le titre "Players Right Now" ou "Joueurs actuels"
            const allElements = Array.from(document.querySelectorAll('.island-stats > div'));
            
            const statsBlock = allElements.find(el => {
                const text = el.innerText.toUpperCase();
                return text.includes("PLAYERS RIGHT NOW") || text.includes("JOUEURS ACTUELS");
            });

            if (statsBlock) {
                // Le chiffre est généralement dans une balise <b> ou <span> à l'intérieur du bloc
                const numberEl = statsBlock.querySelector('b, span, div:nth-child(2)');
                if (numberEl) {
                    const value = numberEl.innerText.replace(/[^\d]/g, "");
                    return value ? parseInt(value, 10) : "N/A";
                }
            }

            // Plan B : Recherche par texte de proximité si la structure change
            const backupMatch = document.body.innerText.match(/(?:Players Right Now|Joueurs actuels)\s*([\d,]+)/i);
            return backupMatch ? parseInt(backupMatch[1].replace(/[^\d]/g, ""), 10) : "N/A";
        });

        await browser.close();

        console.log(`[${new Date().toLocaleTimeString()}] Résultat : ${playersNow}`);
        
        res.json({ 
            ok: true, 
            playersNow: playersNow 
        });

    } catch (err) {
        if (browser) await browser.close();
        console.error("ERREUR:", err.message);
        res.status(500).json({ ok: false, playersNow: "Erreur", error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur en ligne sur le port ${PORT}`);
});
