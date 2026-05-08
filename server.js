const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const BASE44_APP_ID  = process.env.BASE44_APP_ID;
const BASE44_API_KEY = process.env.BASE44_API_KEY;
const SYNC_INTERVAL  = parseInt(process.env.SYNC_INTERVAL_MS || '60000');

if (!BASE44_APP_ID || !BASE44_API_KEY) {
  console.error('❌ BASE44_APP_ID et BASE44_API_KEY sont requis');
  process.exit(1);
}

const BASE44_BASE = `https://api.base44.com/api/apps/${BASE44_APP_ID}/entities`;
const FORTNITE_API = 'https://api.fortnite.com/ecosystem/v1/islands';
const headers44 = { 'Content-Type': 'application/json', 'api-key': BASE44_API_KEY };

async function getMaps() {
  const res = await fetch(`${BASE44_BASE}/RPMap/filter`, {
    method: 'POST', headers: headers44,
    body: JSON.stringify({ filters: { status: 'online' }, sort: '-created_date', limit: 100 }),
  });
  if (!res.ok) throw new Error(`getMaps: ${res.status}`);
  return res.json();
}

async function updateMap(id, data) {
  const res = await fetch(`${BASE44_BASE}/RPMap/${id}`, {
    method: 'PUT', headers: headers44, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`updateMap ${id}: ${res.status}`);
}

async function getPlayerCount(fortniteId) {
  const res = await fetch(`${FORTNITE_API}/${fortniteId}/metrics/minute/peak-ccu`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  const values = data?.data || data?.metrics || [];
  if (Array.isArray(values)) {
    for (let i = values.length - 1; i >= 0; i--) {
      const v = values[i]?.value ?? values[i];
      if (v != null && v > 0) return v;
    }
  }
  return data?.current ?? data?.peak ?? data?.ccu ?? null;
}

let syncCount = 0, lastSync = null;

async function syncPlayers() {
  try {
    const maps = await getMaps();
    const mapsWithId = maps.filter(m => m.fortnite_id);
    await Promise.all(mapsWithId.map(async (map) => {
      try {
        const count = await getPlayerCount(map.fortnite_id);
        if (count == null) return;
        await updateMap(map.id, { current_players: count });
        console.log(`  ✓ ${map.title}: ${count} joueurs`);
      } catch (err) { console.warn(`  ✗ ${map.title}: ${err.message}`); }
    }));
    syncCount++;
    lastSync = new Date().toISOString();
    console.log(`[sync #${syncCount}] ${lastSync}`);
  } catch (err) { console.error(`[sync] Erreur: ${err.message}`); }
}

app.get('/', (req, res) => res.json({ status: 'ok', sync_count: syncCount, last_sync: lastSync }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/sync', async (req, res) => { await syncPlayers(); res.json({ status: 'ok' }); });

app.listen(PORT, () => {
  console.log(`🚀 Démarré sur :${PORT}`);
  syncPlayers();
  setInterval(syncPlayers, SYNC_INTERVAL);
});
