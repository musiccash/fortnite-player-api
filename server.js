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

        // 1. On bloque l'inutile pour aller vite
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

        // 3. On attend que le texte "Joueurs" soit présent n'importe où sur la page
        await page.waitForFunction(() => {
            return document.body.innerText.toLowerCase().includes("joueur") || 
                   document.body.innerText.toLowerCase().includes("player");
        }, { timeout: 20000 });

        // 4. Extraction via une recherche textuelle globale
        const playersNow = await page.evaluate(() => {
            // Cette fonction cherche un nombre situé après "Joueurs actuels" ou "Players right now"
            const text = document.body.innerText;
            
            // Regex qui cherche spécifiquement le bloc de stats
            // Elle cherche "Players Right Now" ou "Joueurs actuels" suivi de n'importe quoi (max 50 caractères) puis un nombre
            const regex = /(?:Players Right Now|Joueurs actuels|Players|Joueurs)[\s\n\r]{1,50}([0-9,.\s]+)/i;
            const match = text.match(regex);
            
            if (match && match[1]) {
                // On nettoie le résultat pour ne garder que les chiffres
                const cleaned = match[1].replace(/[^\d]/g, "");
                return cleaned ? parseInt(cleaned, 10) : "N/A";
            }
            return "N/A";
        });

        await browser.close();

        // Si on récupère un nombre trop grand (ex: l'ID de la map), on le filtre
        // L'ID de ta map commence par 2327..., donc si c'est ce nombre, on met N/A
        const finalResult = (playersNow > 1000000) ? "N/A" : playersNow;

        console.log(`[${new Date().toLocaleTimeString()}] Joueurs : ${finalResult}`);
        
        res.json({ 
            ok: true, 
            playersNow: finalResult 
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
