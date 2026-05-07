const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ────────────────────────────────────────────────────────────────
const BASE44_APP_ID  = process.env.BASE44_APP_ID;   // ex: abc123
const BASE44_API_KEY = process.env.BASE44_API_KEY;  // ta clé API base44
const BASE44_BASE    = `https://api.base44.app/api/apps/${BASE44_APP_ID}/entities`;
const INTERVAL_MS    = 5 * 60 * 1000; // toutes les 5 minutes

// ─── HELPERS ───────────────────────────────────────────────────────────────

async function getMaps() {
  const res = await fetch(`${BASE44_BASE}/RPMap?limit=100`, {
    headers: { 'api-key': BASE44_API_KEY }
  });
  const data = await res.json();
  // data est soit un tableau directement, soit { results: [...] }
  const items = Array.isArray(data) ? data : (data.results ?? []);
  return items.filter(m => m.status === 'online' && m.fortnite_id);
}

async function getPlayerCount(fortniteId) {
  const res = await fetch(
    `https://api.fortnite.com/ecosystem/v1/islands/${fortniteId}/metrics/minute/peak-ccu`
  );
  if (!res.ok) return null;
  const data = await res.json();
  // Prendre le dernier intervalle non-null
  const intervals = data?.intervals ?? [];
  for (let i = intervals.length - 1; i >= 0; i--) {
    if (intervals[i].value !== null) return intervals[i].value;
  }
  return null;
}

async function updateMap(mapId, playerCount) {
  await fetch(`${BASE44_BASE}/RPMap/${mapId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BASE44_API_KEY
    },
    body: JSON.stringify({ current_players: playerCount })
  });
}

// ─── SYNC PRINCIPALE ───────────────────────────────────────────────────────

async function sync() {
  console.log(`[${new Date().toISOString()}] 🔄 Démarrage sync...`);
  
  let maps;
  try {
    maps = await getMaps();
    console.log(`  → ${maps.length} map(s) actives trouvées`);
  } catch (err) {
    console.error('  ❌ Erreur récupération maps Base44:', err.message);
    return;
  }

  for (const map of maps) {
    try {
      const count = await getPlayerCount(map.fortnite_id);
      if (count === null) {
        console.log(`  ⚠️  ${map.title} (${map.fortnite_id}) → pas de données`);
        continue;
      }
      await updateMap(map.id, count);
      console.log(`  ✅ ${map.title} → ${count} joueurs`);
    } catch (err) {
      console.error(`  ❌ ${map.title}:`, err.message);
    }
  }
  
  console.log(`[${new Date().toISOString()}] ✔ Sync terminée`);
}

// ─── DÉMARRAGE ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`🚀 Server démarré sur le port ${PORT}`);
  if (!BASE44_APP_ID || !BASE44_API_KEY) {
    console.error('❌ Variables d\'environnement manquantes: BASE44_APP_ID, BASE44_API_KEY');
    process.exit(1);
  }
  sync();
  setInterval(sync, INTERVAL_MS);
});
