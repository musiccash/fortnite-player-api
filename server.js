const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const BASE44_APP_ID  = process.env.BASE44_APP_ID  || '694abe882d8d2f778954958b';
const BASE44_API_KEY = process.env.BASE44_API_KEY || '9d972a85b7db4f0eb376335a3dd0a872';
const SYNC_INTERVAL  = parseInt(process.env.SYNC_INTERVAL_MS || '60000');

if (!BASE44_APP_ID || !BASE44_API_KEY) {
  console.error('❌ BASE44_APP_ID et BASE44_API_KEY sont requis');
  process.exit(1);
}

const BASE44_BASE_APP = `https://api.base44.app/api/apps/${BASE44_APP_ID}/entities`;
const BASE44_BASE_COM = `https://api.base44.com/api/apps/${BASE44_APP_ID}/entities`;
const FORTNITE_API = 'https://api.fortnite.com/ecosystem/v1/islands';
const headers44 = { 'Content-Type': 'application/json', 'api-key': BASE44_API_KEY };

// ─── tryFetch : log complet + erreur détaillée ───────────────────────────────
async function tryFetch(url, options = {}) {
  const method = options.method || 'GET';
  console.log(`[tryFetch] → ${method} ${url}`);
  if (options.body) console.log(`[tryFetch]   body: ${options.body}`);

  const res = await fetch(url, options);
  const text = await res.text();

  console.log(`[tryFetch] ← ${res.status} ${res.statusText}`);
  console.log(`[tryFetch]   response: ${text.slice(0, 300)}${text.length > 300 ? '…' : ''}`);

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  try { return JSON.parse(text); }
  catch { return text; }
}

// ─── getMaps : 4 endpoints en fallback ──────────────────────────────────────
async function getMaps() {
  const filterBody = JSON.stringify({ filters: { status: 'online' }, sort: '-created_date', limit: 100 });

  const attempts = [
    () => tryFetch(`${BASE44_BASE_APP}/RPMap/filter`, { method: 'POST', headers: headers44, body: filterBody }),
    () => tryFetch(`${BASE44_BASE_COM}/RPMap/filter`, { method: 'POST', headers: headers44, body: filterBody }),
    () => tryFetch(`${BASE44_BASE_APP}/RPMap?limit=100`, { method: 'GET', headers: headers44 }),
    () => tryFetch(`${BASE44_BASE_COM}/RPMap?limit=100`, { method: 'GET', headers: headers44 }),
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      const data = await attempt();
      // Normalise : tableau direct, ou { data/results/items: [...] }
      return Array.isArray(data) ? data : (data?.data ?? data?.results ?? data?.items ?? []);
    } catch (err) {
      console.warn(`[getMaps] tentative échouée : ${err.message}`);
      errors.push(`${err.message} | body: ${err.body ?? '(none)'}`);
    }
  }

  throw new Error(`getMaps : tous les endpoints ont échoué.\n${errors.join('\n')}`);
}

// ─── updateMap : .app d'abord, .com en fallback ──────────────────────────────
async function updateMap(id, data) {
  const urls = [
    `${BASE44_BASE_APP}/RPMap/${id}`,
    `${BASE44_BASE_COM}/RPMap/${id}`,
  ];
  for (const url of urls) {
    try {
      return await tryFetch(url, { method: 'PUT', headers: headers44, body: JSON.stringify(data) });
    } catch (err) {
      console.warn(`[updateMap ${id}] ${err.message}`);
    }
  }
  throw new Error(`updateMap ${id} : tous les endpoints ont échoué`);
}

// ─── getPlayerCount ──────────────────────────────────────────────────────────
async function getPlayerCount(fortniteId) {
  try {
    const res = await fetch(`${FORTNITE_API}/${fortniteId}/metrics/minute/peak-ccu`, {
      signal: AbortSignal.timeout(8000),
    });
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
  } catch {
    return null;
  }
}

// ─── syncPlayers ─────────────────────────────────────────────────────────────
let syncCount = 0, lastSync = null;

async function syncPlayers() {
  try {
    const maps = await getMaps();
    console.log(`[sync] ${maps.length} maps récupérées, ${maps.filter(m => m.fortnite_id).length} avec fortnite_id`);

    const mapsWithId = maps.filter(m => m.fortnite_id);
    await Promise.all(mapsWithId.map(async (map) => {
      try {
        const count = await getPlayerCount(map.fortnite_id);
        if (count == null) return;
        await updateMap(map.id, { current_players: count });
        console.log(`  ✓ ${map.title}: ${count} joueurs`);
      } catch (err) {
        console.warn(`  ✗ ${map.title}: ${err.message}`);
      }
    }));

    syncCount++;
    lastSync = new Date().toISOString();
    console.log(`[sync #${syncCount}] ${lastSync}`);
  } catch (err) {
    console.error(`[sync] Erreur: ${err.message}`);
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', sync_count: syncCount, last_sync: lastSync }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/sync', async (req, res) => {
  await syncPlayers();
  res.json({ status: 'ok', sync_count: syncCount, last_sync: lastSync });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Démarré sur :${PORT}`);
  syncPlayers();
  setInterval(syncPlayers, SYNC_INTERVAL);
});
