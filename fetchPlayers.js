const puppeteer = require("puppeteer");

async function fetchPlayers(mapCode) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto(`https://fortnite.gg/island?code=${mapCode}`, {
      waitUntil: "networkidle2",
      timeout: 0
    });

    // ⛏️ On récupère le nombre de joueurs affiché
    const players = await page.evaluate(() => {
      // Fortnite.gg affiche le nombre ici (à adapter si ça change)
      const el = document.querySelector('[data-testid="player-count"]') 
              || document.querySelector(".player-count")
              || document.body;

      const text = el.innerText || "";

      const match = text.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    });

    await browser.close();

    return players;

  } catch (err) {
    console.log("Erreur Puppeteer:", err);
    return 0;
  }
}
