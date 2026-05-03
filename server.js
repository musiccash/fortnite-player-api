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
  const res = await fetch(`${API}/RPMap?limit=100`, { headers });
  const all = await res.json();
  return Array.isArray(all) ? all.filter(m => m.status === 'online' && m.fortnite_id) : [];
}

async function updateMap(id, current_players) {
  await fetch(`${API}/RPMap/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ current_players })
  });
}

async function scrapeCount(browser, fortniteId) {
  const page = await browser.newPage();
  try {
    await page.route('**/*.{png,jpg,jpeg,gif,woff2,woff,ttf}', r => r.abort());

    await page.goto(`https://fortnite.gg/island/${fortniteId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    // Laisser le JS de la page s'exécuter
    await page.waitForTimeout(5000);

    const result = await page.evaluate(() => {
      // Debug: dump HTML + texte visible
      const html = document.body.innerHTML.slice(0, 3000);
      const text = document.body.innerText.slice(0, 1000);

      let count = null;
      let strategy = null;

      // Stratégie 1 : .js-players-now .chart-stats-title span
      const s1 = document.querySelector('.js-players-now .chart-stats-title span');
      if (s1 && s1.innerText.trim()) {
        count = parseInt(s1.innerText.replace(/[^0-9]/g, ''), 10);
        strategy = 'S1: .js-players-now .chart-stats-title span';
      }

      // Stratégie 2 : .chart-stats-title span (premier)
      if (count === null) {
        const s2 = document.querySelector('.chart-stats-title span');
        if (s2 && s2.innerText.trim()) {
          count = parseInt(s2.innerText.replace(/[^0-9]/g, ''), 10);
          strategy = 'S2: .chart-stats-title span';
        }
      }

      // Stratégie 3 : [class*="players"] avec data-n
      if (count === null) {
        const s3 = document.querySelector('[class*="players"][data-n]');
        if (s3) {
          count = parseInt(s3.getAttribute('data-n'), 10);
          strategy = 'S3: [class*=players][data-n]';
        }
      }

      // Stratégie 4 : .js-players-now data-n direct
      if (count === null) {
        const s4 = document.querySelector('.js-players-now');
        if (s4 && s4.getAttribute('data-n')) {
          count = parseInt(s4.getAttribute('data-n'), 10);
          strategy = 'S4: .js-players-now[data-n]';
        }
      }

      // Stratégie 5 : regex sur le texte visible
      if (count === null) {
        const match = document.body.innerText.match(/(\d[\d,]*)\s*Players? right now/i);
        if (match) {
          count = parseInt(match[1].replace(/,/g, ''), 10);
          strategy = 'S5: regex innerText';
        }
      }

      return { count, strategy, html, text };
    });

    console.log(`[DEBUG] Stratégie utilisée: ${result.strategy ?? 'AUCUNE'}`);
    console.log(`[DEBUG] HTML (3000 chars):\n${result.html}`);
    console.log(`[DEBUG] TEXT (1000 chars):\n${result.text}`);

    return isNaN(result.count) ? null : result.count;

  } finally {
    await page.close();
  }
}

async function startWorker() {
  console.log("🛠️ Démarrage Playwright...");
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  while (true) {
    try {
      console.log("\n--- NOUVEAU CYCLE ---");
      const maps = await getMaps();

      if (!maps.length) {
        console.log("💤 Aucune map active.");
      } else {
        console.log(`📍 ${maps.length} maps détectées.`);
        for (const map of maps) {
          try {
            console.log(`🔍 Scraping : ${map.fortnite_id}`);
            const count = await scrapeCount(browser, map.fortnite_id);
            if (count !== null) {
              console.log(`📈 [${map.fortnite_id}] : ${count} joueurs`);
              await updateMap(map.id, count);
              console.log(`✅ Base44 mis à jour`);
            } else {
              console.log(`⚠️ Aucune stratégie n'a trouvé le chiffre pour ${map.fortnite_id}`);
            }
          } catch (err) {
            console.error(`❌ Erreur sur ${map.fortnite_id}:`, err.message);
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
