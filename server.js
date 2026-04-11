import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const URL = "https://fortnite.gg/island/2327-7349-9384";

app.get("/", (req, res) => res.send("🚀 API Fortnite Online - Fix PR Railway"));

app.get("/api/players", async (req, res) => {
    let browser;
    try {
        console.log("Lancement de l'extraction précise...");
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });
        const page = await context.newPage();

        await page.goto(URL, { waitUntil: "networkidle", timeout: 45000 });

        // Attente forcée pour que le JS de Fortnite.gg affiche le chiffre
        await page.waitForTimeout(8000);

        const playersNow = await page.evaluate(() => {
            // Fonction pour vérifier si un nombre est crédible (entre 1 et 1 million, pas une année)
            const isPlausibleCount = (n) => {
                const num = parseInt(n.replace(/[^\d]/g, ""), 10);
                return num > 0 && num < 1000000 && num !== 2025 && num !== 2026;
            };

            // 1. On cherche précisément l'élément qui contient le texte exact
            const elements = Array.from(document.querySelectorAll('div, b, span'));
            const label = elements.find(el => {
                const t = el.innerText.trim().toUpperCase();
                return t === "PLAYERS RIGHT NOW" || t === "JOUEURS ACTUELS";
            });

            if (label) {
                // STRATÉGIE PR : On cherche dans les éléments frères (siblings) ou le parent direct
                const parent = label.parentElement;
                const siblings = Array.from(parent.children);
                
                for (let sibling of siblings) {
                    const text = sibling.innerText.trim();
                    if (isPlausibleCount(text)) {
                        return text.replace(/[^\d]/g, "");
                    }
                }

                // Fallback : On cherche n'importe quel chiffre crédible dans le bloc parent
                const parentText = parent.innerText;
                const matches = parentText.match(/\d[\d\s,.]*/g);
                if (matches) {
                    const count = matches.find(m => isPlausibleCount(m));
                    if (count) return count.replace(/[^\d]/g, "");
                }
            }
            return null;
        });

        await browser.close();
        
        console.log(`[LOG] Chiffre extrait : ${playersNow}`);

        res.json({
            ok: playersNow !== null,
            playersNow: playersNow ? parseInt(playersNow, 10) : "N/A"
        });

    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur en ligne sur le port ${PORT}`);
});
