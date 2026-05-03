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
    // Block images/fonts only, keep CSS and JS so the page renders fully
    await page.route('**/*.{png,jpg,jpeg,gif,woff2,woff,ttf}', r => r.abort());

    await page.goto(`https://fortnite.gg/island/${fortniteId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    // Give JS time to render dynamic content instead of waiting for a
    // specific selector that may not exist or may have been renamed
    await page.waitForTimeout(5000);

    // --- Diagnostic: log the raw HTML so we can see the real structure ---
    const html = await page.content();
    console.log(`📄 [${fortniteId}] HTML snapshot (first 3000 chars):\n${html.slice(0, 3000)}`);

    // Try multiple selectors in order of specificity
    const count = await page.evaluate(() => {
      // 1. Original target with a child span
      const el1 = document.querySelector('.js-players-now .chart-stats-title span');
      if (el1 && el1.textContent.trim()) {
        console.log('[selector-1] .js-players-now .chart-stats-title span =>', el1.textContent.trim());
        return el1.textContent.trim();
      }

      // 2. Broader: any .chart-stats-title span on the page
      const el2 = document.querySelector('.chart-stats-title span');
      if (el2 && el2.textContent.trim()) {
        console.log('[selector-2] .chart-stats-title span =>', el2.textContent.trim());
        return el2.textContent.trim();
      }

      // 3. Any element whose class contains "players"
      const el3 = document.querySelector('[class*="players"]');
      if (el3 && el3.textContent.trim()) {
        console.log('[selector-3] [class*="players"] =>', el3.textContent.trim(), '| classes:', el3.className);
        return el3.textContent.trim();
      }

      // 4. data-n attribute on .js-players-now (original approach)
      const el4 = document.querySelector('.js-players-now');
      if (el4) {
        const val = el4.getAttribute('data-n');
        console.log('[selector-4] .js-players-now[data-n] =>', val);
        return val;
      }

      return null;
    });

    // 5. Regex fallback: scan visible page text for a standalone number
    //    near the word "players" (case-insensitive)
    if (count === null) {
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log(`📝 [${fortniteId}] body text (first 1000 chars):\n${bodyText.slice(0, 1000)}`);

      const match = bodyText.match(/(\d[\d,]*)\s*(?:players?|joueurs?)/i)
        || bodyText.match(/(?:players?|joueurs?)[^\d]*(\d[\d,]*)/i);
      if (match) {
        const raw = match[1].replace(/,/g, '');
        console.log(`🔢 [${fortniteId}] Regex match: "${match[0]}" → ${raw}`);
        return parseInt(raw, 10);
      }

      console.log(`⚠️ [${fortniteId}] No player count found with any strategy.`);
      return null;
    }

    const parsed = parseInt(String(count).replace(/,/g, ''), 10);
    return isNaN(parsed) ? null : parsed;
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
              console.log(`⚠️ data-n introuvable pour ${map.fortnite_id}`);
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
