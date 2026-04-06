const express = require("express");
const { fetchPlayers } = require("./fetchPlayers");
const app = express();

// Tes maps avec leurs codes
const maps = {
  shadow: "2327-7349-9384",
  prison: "1234-5678-9012",
  city: "3456-7890-1234"
};

// Cache 30 secondes pour éviter de spammer Fortnite.gg
let cache = {};

// Route pour une map précise
app.get("/players/:map", async (req, res) => {
  const mapKey = req.params.map;
  const mapCode = maps[mapKey];

  if (!mapCode) return res.json({ error: "Map inconnue" });

  if (cache[mapKey] && Date.now() - cache[mapKey].time < 30000) {
    return res.json(cache[mapKey].data);
  }

  const players = await fetchPlayers(mapCode);

  const result = { map: mapKey, code: mapCode, players };
  cache[mapKey] = { data: result, time: Date.now() };

  res.json(result);
});

// Route pour toutes les maps
app.get("/players", async (req, res) => {
  let results = {};
  for (let key in maps) {
    // On peut utiliser le cache ici aussi si tu veux
    results[key] = await fetchPlayers(maps[key]);
  }
  res.json(results);
});

// Démarrage serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 API READY on port ${PORT}`));
