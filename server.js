const express = require("express");
const fetch = require("node-fetch");
const app = express();

const maps = {
  shadow: "2327-7349-9384", // déjà un code
  prison: "1234-5678-9012", // exemple de code à remplacer
  city: "3456-7890-1234"    // exemple de code à remplacer
};

// 🔥 CACHE (évite spam Fortnite.gg)
let cache = {};

async function fetchPlayers(mapCode) {
  // Simule un nombre de joueurs aléatoire entre 100 et 500
  return Math.floor(Math.random() * 400 + 100);
}

// 🔥 ROUTE PRINCIPALE
app.get("/players/:map", async (req, res) => {
  const mapKey = req.params.map;
  const mapCode = maps[mapKey];

  if (!mapCode) {
    return res.json({ error: "Map inconnue" });
  }

  // cache 30 sec
  if (cache[mapKey] && Date.now() - cache[mapKey].time < 30000) {
    return res.json(cache[mapKey].data);
  }

  const players = await fetchPlayers(mapCode);

  const result = {
    map: mapKey,
    code: mapCode,
    players: players
  };

  cache[mapKey] = {
    data: result,
    time: Date.now()
  };

  res.json(result);
});

// 🔥 ALL MAPS
app.get("/players", async (req, res) => {
  let results = {};

  for (let key in maps) {
    const players = await fetchPlayers(maps[key]);
    results[key] = players;
  }

  res.json(results);
});

app.listen(3000, () => console.log("🔥 API READY"));
