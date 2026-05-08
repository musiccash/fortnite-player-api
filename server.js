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

const BASE44_BASE_APP = `https://api.base44.app/api/apps/${BASE44_APP_ID}/entities`;
const BASE44_BASE_COM = `https://api.base44.com/api/apps/${BASE44_APP_ID}/entities`;
const FORTNITE_API = 'https://api.fortnite.com/ecosystem/v1/islands';
const headers44 = { 'Content-Type': 'application/json', 'api-key': BASE44_API_KEY };

async function tryFetch(url, options) {
  console.log(`[base44] → ${options?.method || 'GET'} ${url}`);
  if (options?.body) console.log(`[base44]   body: ${options.body}`);
  const res = await fetch(url, options);
  const text = await res.text();
  console.log(`[base44] ← ${res.status} ${res.statusText}`);
  console.log(`[base44]   response: ${text.slice(0, 500)}`);
  return { ok: res.ok, status: res.status, text };
}

async function getMaps() {
  const filterBody = JSON.stringify({ filters: { status: 'online' }, sort: '-created_date', limit: 100 });
  const filterOpts = { method: 'POST', headers: headers44, body: filterBody };

  // Try base44.app /RPMap/filter first
  let result = await tryFetch(`${BASE44_BASE_APP}/RPMap/filter`, filterOpts);
  if (result.ok) return JSON.parse(result.text);

  // Try base44.com /RPMap/filter
  if (result.status === 404) {
    console.log('[base44] base44.app returned 404, trying base44.com /RPMap/filter …');
    result = await tryFetch(`${BASE44_BASE_COM}/RPMap/filter`, filterOpts);
    if (result.ok) return JSON.parse(result.text);
  }

  // Fall back to GET /RPMap?limit=100 on base44.app
  if (result.status === 404) {
    console.log('[base44] /RPMap/filter returned 404, trying GET /RPMap?limit=100 on base44.app …');
    result = await tryFetch(`${BASE44_BASE_APP}/RPMap?limit=100`, { method: 'GET', headers: headers44 });
    if (result.ok) return JSON.parse(result.text);
  }

  // Fall back to GET /RPMap?limit=100 on base44.com
  if (result.status === 404) {
    console.log('[base44] Trying GET /RPMap?limit=100 on base44.com …');
    result = await tryFetch(`${BASE44_BASE_COM}/RPMap?limit=100`, { method: 'GET', headers: headers44 });
    if (result.ok) return JSON.parse(result.text);
  }

  throw new Error(`getMaps: all endpoints failed, last status ${result.status} — ${result.text.slice(0, 200)}`);
}

async function updateMap(id, data) {
  const res = await fetch(`${BASE44_BASE_APP}/RPMap/${id}`, {
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
