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
      const LABEL_PATTERNS = ["PLAYERS RIGHT NOW", "JOUEURS ACTUELS"];

      // Strip a string down to digits only
      const digitsOnly = (s) => s.replace(/[^\d]/g, "");

      // A plausible player count is 1–9,999,999.
      // This rules out the map ID (2327-7349-9384) and empty strings.
      const isPlausibleCount = (digits) => {
        if (!digits || digits.length === 0) return false;
        const n = parseInt(digits, 10);
        return n >= 1 && n <= 9_999_999;
      };

      // ── Strategy 1: find the exact label element, then walk siblings ─────────
      // fortnite.gg renders the stat block roughly as:
      //   <span class="label">PLAYERS RIGHT NOW</span>
      //   <span class="value">1,234</span>
      // or with the value above the label.
      const allElements = Array.from(document.querySelectorAll("*"));

      const labelEl = allElements.find((el) => {
        // Only match leaf-ish nodes whose own visible text IS the label exactly,
        // so we don't accidentally match a parent that contains extra text.
        const ownText = (el.innerText || "").toUpperCase().trim();
        return LABEL_PATTERNS.some((p) => ownText === p);
      });

      if (labelEl) {
        console.log("[scraper] Label element found:", labelEl.outerHTML);

        // Check next sibling elements (skip text nodes)
        let sibling = labelEl.nextElementSibling;
        for (let i = 0; i < 3 && sibling; i++) {
          const digits = digitsOnly(sibling.innerText || "");
          if (isPlausibleCount(digits)) {
            console.log("[scraper] Strategy 1 (next sibling) →", digits);
            return digits;
          }
          sibling = sibling.nextElementSibling;
        }

        // Check previous sibling elements (value-above-label layout)
        let prevSibling = labelEl.previousElementSibling;
        for (let i = 0; i < 3 && prevSibling; i++) {
          const digits = digitsOnly(prevSibling.innerText || "");
          if (isPlausibleCount(digits)) {
            console.log("[scraper] Strategy 1 (prev sibling) →", digits);
            return digits;
          }
          prevSibling = prevSibling.previousElementSibling;
        }

        // Check all children of the parent container
        const parent = labelEl.parentElement;
        if (parent) {
          console.log("[scraper] Parent HTML:", parent.outerHTML);
          const children = Array.from(parent.querySelectorAll("*"));
          for (const child of children) {
            if (child === labelEl) continue;
            const digits = digitsOnly(child.innerText || "");
            if (isPlausibleCount(digits)) {
              console.log("[scraper] Strategy 1 (parent child) →", digits);
              return digits;
            }
          }
        }
      } else {
        console.log("[scraper] Label element NOT found in DOM.");
      }

      // ── Strategy 2: tight regex on body text ─────────────────────────────────
      // Match the label followed immediately by a compact number (commas/dots OK).
      // The character class [,.\d]* stops at the first whitespace, preventing
      // the match from bleeding into unrelated numbers elsewhere on the page.
      const bodyText = document.body.innerText;
      console.log("[scraper] Body text snippet (first 2000 chars):", bodyText.slice(0, 2000));

      const globalMatch = bodyText.match(
        /(?:PLAYERS RIGHT NOW|JOUEURS ACTUELS)\s*[:\-]?\s*(\d[,.\d]*)/i
      );
      if (globalMatch) {
        const digits = digitsOnly(globalMatch[1]);
        if (isPlausibleCount(digits)) {
          console.log("[scraper] Strategy 2 (body regex) →", digits);
          return digits;
        }
      }

      console.log("[scraper] All strategies exhausted — returning null.");
      return null;
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
