const express = require("express");
const fetch = require("node-fetch");

const app = express();

// 🔥 PORT RENDER
const PORT = process.env.PORT || 3000;

// 🔥 MAPS CONFIG (modifie ici)
const maps = {
  shadow: "2327-7349-9384",
  prison: "XXXX-XXXX-XXXX",
  city: "XXXX-XXXX-XXXX"
};

// 🔥 CACHE (30 sec)
let cache = {};

async function fetchPlayers(mapCode) {
  try {
    const res = await fetch(
      `https://fortnite.gg/player-count-graph?range=1h&id=${mapCode}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": "https://fortnite.gg/"
        }
      }
    );

    const data = await res.json();
    const values = data?.data?.values || [];

    return values.length ? values[values.length - 1] : 0;
  } catch (err) {
    return 0;
  }
}

// 🔥 ROUTE 1 MAP
app.get("/players/:map", async (req, res) => {
  const mapKey = req.params.map;
  const mapCode = maps[mapKey];

  if (!mapCode) {
    return res.json({ error: "Map inconnue" });
  }

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

// 🔥 ROUTE ALL MAPS
app.get("/players", async (req, res) => {
  let results = {};

  for (let key in maps) {
    const players = await fetchPlayers(maps[key]);
    results[key] = players;
  }

  res.json(results);
});

// 🔥 HEALTH CHECK (IMPORTANT)
app.get("/healthz", (req, res) => {
  res.status(200).send("ok");
});

// 🔥 START SERVER
app.listen(PORT, () => {
  console.log(`🔥 API READY on port ${PORT}`);
});
