import express from "express";
import cors from "cors";
import { chromium as playwrightChromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Register stealth plugin — patches navigator, webdriver flag, plugins, etc.
playwrightChromium.use(StealthPlugin());

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

// Returns true if the page is showing a Cloudflare / security-check wall
function isSecurityChallenge(html, text) {
  const lower = (html + text).toLowerCase();
  return (
    lower.includes("security check") ||
    lower.includes("please complete") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("challenge-form") ||
    lower.includes("just a moment") ||
    lower.includes("enable javascript and cookies")
  );
}

async function scrapeCount(browser, fortniteId) {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "America/New_York",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.google.com/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1"
      },
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    try {
      // Block heavy assets to speed up load, but keep JS/CSS so Cloudflare can run
      await page.route('**/*.{png,jpg,jpeg,gif,woff2,woff,ttf,svg,ico}', r => r.abort());

      console.log(`[${fortniteId}] Tentative ${attempt}/${MAX_RETRIES}...`);

      await page.goto(`https://fortnite.gg/island/${fortniteId}`, {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });

      // Give Cloudflare challenge / JS rendering time to complete
      await page.waitForTimeout(10000);

      const result = await page.evaluate(() => {
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

      // Detect security challenge and retry
      if (isSecurityChallenge(result.html, result.text)) {
        console.warn(`[${fortniteId}] ⚠️ Security challenge détecté (tentative ${attempt}). Attente avant retry...`);
        await page.close();
        await context.close();
        if (attempt < MAX_RETRIES) {
          // Back off progressively: 15s, 30s
          await new Promise(r => setTimeout(r, 15000 * attempt));
          continue;
        }
        console.error(`[${fortniteId}] ❌ Toutes les tentatives bloquées par le security check.`);
        return null;
      }

      return isNaN(result.count) ? null : result.count;

    } finally {
      await page.close();
      await context.close();
    }
  }

  return null;
}

async function startWorker() {
  console.log("🛠️ Démarrage Playwright (stealth mode)...");
  const browser = await playwrightChromium.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1280,800',
      '--start-maximized'
    ],
    headless: true
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
