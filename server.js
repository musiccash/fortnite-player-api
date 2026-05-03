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

const BLOCKED_TYPES = new Set([
  'image', 'stylesheet', 'font', 'media',
  'texttrack', 'eventsource', 'websocket', 'manifest', 'other'
]);

const CF_PHRASES = [
  'security check',
  'one more step',
  'checking your browser',
  'please wait',
  'cloudflare',
  'just a moment'
];

async function scrapeCount(browser, fortniteId) {
  const page = await browser.newPage();
  try {
    // Bloquer ressources non essentielles mais garder document/script/xhr/fetch
    await page.route('**/*', (route) => {
      if (BLOCKED_TYPES.has(route.request().resourceType())) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto(`https://fortnite.gg/island/${fortniteId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    // Polling 30s : attendre que le challenge CF soit résolu
    const MAX_WAIT = 30000;
    const INTERVAL = 2000;
    let elapsed = 0;
    let challengeCleared = false;

    while (elapsed < MAX_WAIT) {
      const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
      const isChallenge = CF_PHRASES.some(p => bodyText.includes(p));
      if (!isChallenge) {
        challengeCleared = true;
        console.log(`✅ Challenge CF résolu après ${elapsed}ms`);
        break;
      }
      await page.waitForTimeout(INTERVAL);
      elapsed += INTERVAL;
    }

    if (!challengeCleared) {
      console.warn(`⚠️ Challenge CF non résolu après ${MAX_WAIT}ms pour ${fortniteId}`);
      return null;
    }

    const count = await page.evaluate(() => {
      // S1 : data-n direct sur .js-players-now
      const s1 = document.querySelector('.js-players-now');
      if (s1?.getAttribute('data-n')) return parseInt(s1.getAttribute('data-n'), 10);

      // S2 : span dans .js-players-now
      const s2 = document.querySelector('.js-players-now .chart-stats-title span');
      if (s2?.innerText) return parseInt(s2.innerText.replace(/[^0-9]/g, ''), 10);

      // S3 : premier .chart-stats-title span
      const s3 = document.querySelector('.chart-stats-title span');
      if (s3?.innerText) return parseInt(s3.innerText.replace(/[^0-9]/g, ''), 10);

      // S4 : regex sur texte visible
      const match = document.body.innerText.match(/(\d[\d,]*)\s*Players? right now/i);
      if (match) return parseInt(match[1].replace(/,/g, ''), 10);

      return null;
    });

    return (count === null || isNaN(count)) ? null : count;

  } finally {
    await page.close();
  }
}

async function startWorker() {
  console.log("🛠️ Démarrage Playwright...");
  const browser = await chromium.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-background-networking',
      '--disable-default-apps',
      '--no-first-run',
    ]
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
              console.log(`⚠️ Impossible de lire le chiffre pour ${map.fortnite_id}`);
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
