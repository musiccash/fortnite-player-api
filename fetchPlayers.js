const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

// Fonction pour récupérer le nombre de joueurs d'une map
async function fetchPlayers(mapCode) {
  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    await page.goto(`https://fortnite.gg/island?code=${mapCode}`, { waitUntil: "networkidle2" });

    const players = await page.evaluate(() => {
      // Fortnite.gg affiche "Players right now 243"
      const text = document.body.innerText;
      const match = text.match(/Players right now\s*(\d+)/i);
      return match ? parseInt(match[1]) : 0;
    });

    await browser.close();
    return players;

  } catch (err) {
    console.log("Erreur Puppeteer:", err);
    return 0;
  }
}

module.exports = { fetchPlayers };
