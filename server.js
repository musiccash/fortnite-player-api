import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;;
const URL = "https://fortnite.gg/island/2327-7349-9384";

app.get("/api/players", async (req, res) => {
  let browser;
  try {
    // 1. Lancement avec des arguments pour éviter d'être détecté comme un robot
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    // 2. Navigation
    await page.goto(URL, { waitUntil: "networkidle", timeout: 45000 });

    // 3. On attend que l'un des mots-clés apparaisse à l'écran
    await page.waitForFunction(() => {
      const b = document.body.innerText.toLowerCase();
      return b.includes("joueurs") || b.includes("players");
    }, { timeout: 15000 });

    // 4. Extraction chirurgicale
    const result = await page.evaluate(() => {
      // On récupère tous les éléments qui pourraient contenir du texte
      const elements = Array.from(document.querySelectorAll('div, span, p, b'));
      
      // On cherche l'élément qui contient "JOUEURS ACTUELS" ou "PLAYERS RIGHT NOW"
      const labelElement = elements.find(el => {
        const t = el.innerText.toUpperCase();
        return t === "JOUEURS ACTUELS" || t === "PLAYERS RIGHT NOW";
      });

      if (labelElement) {
        // Le chiffre est généralement dans l'élément juste après ou le parent
        // On va regarder le texte du parent pour être sûr de capturer le chiffre
        const parentText = labelElement.parentElement.innerText;
        const match = parentText.match(/(\d[\d\s,.]*)/); // Cherche le premier bloc de chiffres
        if (match) {
          return match[0].replace(/[^\d]/g, ""); // Nettoyage final
        }
      }

      // Plan B : Si la méthode chirurgicale échoue, on tente la regex globale sur toute la page
      const globalMatch = document.body.innerText.match(/(?:JOUEURS ACTUELS|PLAYERS RIGHT NOW)[\s\n]*([\d\s,]+)/i);
      return globalMatch ? globalMatch[1].replace(/[^\d]/g, "") : "N/A";
    });

    await browser.close();

    console.log(`[${new Date().toLocaleTimeString()}] Joueurs détectés : ${result}`);
    
    res.json({ 
      playersNow: result !== "N/A" ? parseInt(result, 10) : "N/A" 
    });

  } catch (err) {
    if (browser) await browser.close();
    console.error("ERREUR:", err.message);
    res.status(500).json({ playersNow: "Erreur", error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur en ligne sur http://localhost:${PORT}`);
});
