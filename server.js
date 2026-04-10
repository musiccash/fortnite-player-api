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
        // Railway a assez de puissance pour lancer le navigateur proprement
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });

        const page = await context.newPage();

        // On bloque les pubs et images pour charger l'essentiel
        await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'media', 'font'].includes(type)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        // 1. On attend que le réseau soit calme (plus lent mais plus sûr)
        await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });

        // 2. On attend 5 secondes de plus pour que les chiffres s'actualisent sur la page
        await page.waitForTimeout(5000);

        // 3. Extraction de haute précision
        const playersNow = await page.evaluate(() => {
            // On cherche spécifiquement les conteneurs de statistiques
            const statsContainers = Array.from(document.querySelectorAll('div'));
            
            // On trouve celui qui contient le texte cible
            const liveBlock = statsContainers.find(el => {
                const text = el.innerText.trim();
                return text === "Players Right Now" || text === "Joueurs actuels";
            });

            if (liveBlock && liveBlock.parentElement) {
                // On récupère le texte du bloc parent pour isoler le chiffre
                const fullText = liveBlock.parentElement.innerText;
                
                // On enlève les mots pour ne garder que le chiffre
                const rawValue = fullText
                    .replace("Players Right Now", "")
                    .replace("Joueurs actuels", "")
                    .replace(/[^\d]/g, ""); // Garde uniquement les chiffres
                
                return rawValue ? parseInt(rawValue, 10) : "N/A";
            }
            return "N/A";
        });

        await browser.close();

        // VERIFICATION FINALE : Si le chiffre est l'ID de la map (2327...), c'est une erreur
        let result = playersNow;
        if (playersNow && playersNow.toString().startsWith("2327")) {
            result = "Chargement...";
        }

        console.log(`[${new Date().toLocaleTimeString()}] Joueurs en ligne : ${result}`);
        
        res.json({ 
            ok: true, 
            playersNow: result 
        });

    } catch (err) {
        if (browser) await browser.close();
        console.error("ERREUR:", err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 API Railway en ligne sur le port ${PORT}`);
});
