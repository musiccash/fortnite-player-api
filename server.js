import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

// Railway injecte le PORT, on écoute sur 0.0.0.0 pour être visible
const PORT = process.env.PORT || 8080;
const URL = "https://fortnite.gg/island/2327-7349-9384";

// Route Santé pour Railway (évite que le serveur s'arrête)
app.get("/", (req, res) => res.send("✅ API Opérationnelle"));

app.get("/api/players", async (req, res) => {
  let browser;
  try {
    // 1. Lancement avec arguments spéciaux pour le Cloud/Docker
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    // 2. Navigation (on attend que le gros du contenu soit là)
    console.log("Chargement de la page...");
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });

    // 3. On laisse 5 secondes de plus pour que les chiffres s'allument
    await page.waitForTimeout(5000);

    // 4. Extraction chirurgicale améliorée
    const result = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('div, span, p, b, font'));
      
      // On cherche l'étiquette
      const labelElement = elements.find(el => {
        const t = el.innerText.toUpperCase().trim();
        return t === "JOUEURS ACTUELS" || t === "PLAYERS RIGHT NOW" || t.includes("PLAYERS RIGHT NOW");
      });

      if (labelElement) {
        // On cherche le chiffre dans le parent ou les frères
        const containerText = labelElement.parentElement.innerText;
        // On cherche un nombre qui n'est pas l'ID de la map (2327...)
        const matches = containerText.match(/\d[\d\s,.]*/g);
        if (matches) {
          // On prend le nombre qui n'est pas "2327..."
          const players = matches.find(m => !m.startsWith("2327"));
          return players ? players.replace(/[^\d]/g, "") : null;
        }
      }

      // Plan B : Recherche globale si la structure a changé
      const bodyText = document.body.innerText;
      const globalMatch = bodyText.match(/(?:PLAYERS RIGHT NOW|JOUEURS ACTUELS)[\s\n]*([\d\s,]+)/i);
      return globalMatch ? globalMatch[1].replace(/[^\d]/g, "") : null;
    });

    await browser.close();

    // 5. Réponse
    if (!result) {
        console.log("Chiffre non trouvé, renvoi de N/A");
    }

    res.json({ 
      ok: result ? true : false,
      playersNow: result ? parseInt(result, 10) : "N/A" 
    });

  } catch (err) {
    if (browser) await browser.close();
    console.error("ERREUR:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// IMPORTANT : 0.0.0.0 pour Railway
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur en ligne sur le port ${PORT}`);
});
