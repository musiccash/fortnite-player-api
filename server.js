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
    // Lancement du navigateur
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();

    // Aller sur la page et attendre que le contenu soit chargé
    await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });

    const playersNow = await page.evaluate(() => {
      const text = document.body.innerText;
      // Regex pour attraper le nombre après "JOUEURS ACTUELS" ou "PLAYERS RIGHT NOW"
      const match = text.match(/(?:JOUEURS ACTUELS|PLAYERS RIGHT NOW)[\s\n]*([\d\s,]+)/i);
      if (match && match[1]) {
        return parseInt(match[1].replace(/[^\d]/g, ""), 10);
      }
      return "N/A";
    });

    await browser.close();

    console.log(`[LOG] Requête reçue - Joueurs en ligne : ${playersNow}`);
    
    res.json({ 
      ok: true,
      playersNow: playersNow 
    });

  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur actif : http://localhost:${PORT}/api/players`);
});
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });

        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        });

        const page = await context.newPage();

        // On ne bloque QUE les images/polices pour garder le CSS (important pour trouver les blocs)
        await page.route('**/*', (route) => {
            if (['image', 'font', 'media'].includes(route.request().resourceType())) {
                route.abort();
            } else {
                route.continue();
            }
        });

        // 1. Chargement complet (on prend notre temps)
        await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });

        // 2. Petite pause pour laisser les scripts JS du site calculer le nombre
        await page.waitForTimeout(5000);

        // 3. Extraction de précision
        const playersNow = await page.evaluate(() => {
            // Méthode A : Chercher dans les boîtes de statistiques de Fortnite.gg
            const blocks = Array.from(document.querySelectorAll('.island-stats > div, .island-stat'));
            
            for (let block of blocks) {
                const title = block.innerText.toUpperCase();
                if (title.includes("PLAYERS RIGHT NOW") || title.includes("JOUEURS ACTUELS")) {
                    // On cherche le chiffre à l'intérieur de CE bloc précis
                    const match = block.innerText.match(/(\d[\d\s,]*)/);
                    if (match) {
                        const val = match[0].replace(/[^\d]/g, "");
                        return parseInt(val, 10);
                    }
                }
            }

            // Méthode B : Si la structure a changé, on cherche le texte et on remonte au parent
            const allElements = Array.from(document.querySelectorAll('div, span, b, p'));
            const targetLabel = allElements.find(el => {
                const t = el.innerText.trim();
                return t === "Players Right Now" || t === "Joueurs actuels";
            });

            if (targetLabel) {
                // On regarde dans le parent direct pour trouver le chiffre associé
                const content = targetLabel.parentElement.innerText;
                const match = content.match(/(\d[\d\s,]*)/);
                if (match) {
                    return parseInt(match[0].replace(/[^\d]/g, ""), 10);
                }
            }

            return "N/A";
        });

        await browser.close();

        // VERIFICATION FINALE : On élimine l'ID de la map (2327...) ou les chiffres trop longs
        let finalResult = playersNow;
        if (typeof playersNow === 'number') {
            const strVal = playersNow.toString();
            // Si c'est l'ID de la map ou un chiffre bizarre de plus de 6 chiffres (rare pour une map seule)
            if (strVal.startsWith("2327") || strVal.length > 6) {
                finalResult = "En attente..."; 
            }
        }

        console.log(`[${new Date().toLocaleTimeString()}] Donnée réelle : ${finalResult}`);
        
        res.json({ 
            ok: true, 
            playersNow: finalResult 
        });

    } catch (err) {
        if (browser) await browser.close();
        console.error("ERREUR:", err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur en ligne sur le port ${PORT}`);
});
