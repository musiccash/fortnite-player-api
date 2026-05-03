import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;
const BASE44_APP_ID = process.env.BASE44_APP_ID;
const BASE44_API_KEY = process.env.BASE44_API_KEY;
const API = `https://api.base44.app/api/apps/${BASE44_APP_ID}/entities`;

const headers = {
  "Content-Type": "application/json",
  "api-key": BASE44_API_KEY
};

app.get("/", (req, res) => res.send("🚀 SCRAPER BASE44 - READY"));
app.get("/health", (req, res) => res.status(200).send("OK"));

async function getMaps() {
  const res = await fetch(`${API}/RPMap?filters=${encodeURIComponent(JSON.stringify({ status: "online" }))}`, { headers });
  return await res.json();
}

async function updateMap(id, current_players) {
  await fetch(`${API}/RPMap/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ current_players })
  });
}

async function startWorker() {
  console.log("🛠️ Démarrage Playwright...");
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  while (true) {
    try {
      console.log("\n--- NOUVEAU CYCLE ---");
      const maps = await getMaps();

      if (!maps || !maps.length) {
        console.log("💤 Aucune map active.");
      } else {
        console.log(`📍 ${maps.length} maps détectées.`);

        for (const map of maps) {
          if (!map.fortnite_id) continue;
          const id = map.fortnite_id;
          const p = await context.newPage();
          await p.route('**/*.{png,jpg,jpeg,svg,woff2,css,gif}', r => r.abort());

          try {
            console.log(`🔍 Scraping : ${id}`);
            await p.goto(`https://fortnite.gg/island/${id}`, { waitUntil: "domcontentloaded", timeout: 30000 });

            const count = await p.evaluate(() => {
              const el = document.querySelector('.js-players-now');
              return el ? el.getAttribute('data-n') : null;
            });

            if (count !== null) {
              const cleanCount = parseInt(count, 10);
              console.log(`📈 [${id}] : ${cleanCount} joueurs`);
              await updateMap(map.id, cleanCount);
              console.log(`✅ Base44 mis à jour pour ${id}`);
            } else {
              console.log(`⚠️ Impossible de lire le chiffre pour ${id}`);
            }
          } catch (err) {
            console.error(`❌ Erreur sur ${id}:`, err.message);
          } finally {
            await p.close();
          }
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    } catch (err) {
      console.error("🚨 Erreur critique:", err.message);
    }

    console.log("💤 Cycle fini. Attente 60s...");
    await new Promise(r => setTimeout(r, 60000));
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Serveur prêt sur le port ${PORT}`);
  startWorker().catch(err => console.error("🚨 Worker failed:", err));
});
