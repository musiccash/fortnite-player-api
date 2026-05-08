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

// ─── getPlayerCount : logs complets à chaque étape ──────────────────────────
async function getPlayerCount(fortniteId) {
  const url = `${FORTNITE_API}/${fortniteId}/metrics/minute/peak-ccu`;
  console.log(`[getPlayerCount] → fortniteId=${fortniteId} | url=${url}`);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const text = await res.text();

    console.log(`[getPlayerCount] ← ${res.status} ${res.statusText} | fortniteId=${fortniteId}`);
    console.log(`[getPlayerCount]   response: ${text.slice(0, 500)}${text.length > 500 ? '…' : ''}`);

    if (!res.ok) {
      console.warn(`[getPlayerCount] HTTP ${res.status} pour ${fortniteId} — retourne null`);
      return null;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.warn(`[getPlayerCount] JSON invalide pour ${fortniteId}: ${parseErr.message} — retourne null`);
      return null;
    }

    // Tentative 1 : tableau intervals (format Fortnite API natif)
    if (Array.isArray(data?.intervals) && data.intervals.length > 0) {
      const last = data.intervals[data.intervals.length - 1];
      const v = last?.value ?? null;
      console.log(`[getPlayerCount] trouvé via intervals[${data.intervals.length - 1}].value=${v} (timestamp=${last?.timestamp}) pour ${fortniteId}`);
      if (v != null) return v;
    }

    // Tentative 2 : tableau dans data.data
    if (Array.isArray(data?.data) && data.data.length > 0) {
      const last = data.data[data.data.length - 1];
      const v = last?.value ?? last ?? null;
      if (v != null) {
        console.log(`[getPlayerCount] trouvé via data[${data.data.length - 1}].value=${v} pour ${fortniteId}`);
        return v;
      }
      console.log(`[getPlayerCount] tableau data présent (${data.data.length} entrées) mais valeur null pour ${fortniteId}`);
    }

    // Tentative 3 : tableau dans data.metrics
    if (Array.isArray(data?.metrics) && data.metrics.length > 0) {
      const last = data.metrics[data.metrics.length - 1];
      const v = last?.value ?? last ?? null;
      if (v != null) {
        console.log(`[getPlayerCount] trouvé via metrics[${data.metrics.length - 1}].value=${v} pour ${fortniteId}`);
        return v;
      }
      console.log(`[getPlayerCount] tableau metrics présent (${data.metrics.length} entrées) mais valeur null pour ${fortniteId}`);
    }

    // Tentative 4 : scalaires de repli
    const scalar = data?.current ?? data?.peak ?? data?.ccu ?? null;
    if (scalar != null) {
      console.log(`[getPlayerCount] trouvé via scalaire=${scalar} pour ${fortniteId}`);
      return scalar;
    }

    console.warn(`[getPlayerCount] aucune valeur exploitable dans la réponse pour ${fortniteId} — retourne null`);
    return null;

  } catch (err) {
    console.error(`[getPlayerCount] exception pour ${fortniteId}: ${err.message} — retourne null`);
    return null;
  }

}

// ─── syncPlayers ─────────────────────────────────────────────────────────────
let syncCount = 0, lastSync = null;

async function syncPlayers() {
  try {
    const maps = await getMaps();
    const mapsWithId = maps.filter(m => m.fortnite_id);
    console.log(`[sync] ${maps.length} maps récupérées, ${mapsWithId.length} avec fortnite_id`);

    await Promise.all(mapsWithId.map(async (map) => {
      console.log(`[sync] → fetch joueurs pour "${map.title}" (fortnite_id=${map.fortnite_id})`);
      try {
        const count = await getPlayerCount(map.fortnite_id);
        if (count == null) {
          console.warn(`[sync] ⚠ count=null pour "${map.title}" (fortnite_id=${map.fortnite_id}) — mise à jour ignorée`);
          return;
        }
        console.log(`[sync] → updateMap id=${map.id} "${map.title}" current_players=${count}`);
        await updateMap(map.id, { current_players: count });
        console.log(`[sync] ✓ "${map.title}": ${count} joueurs`);
      } catch (err) {
        console.warn(`[sync] ✗ "${map.title}": ${err.message}`);
      }
    }));

    syncCount++;
    lastSync = new Date().toISOString();
    console.log(`[sync #${syncCount}] terminé à ${lastSync}`);
  } catch (err) {
    console.error(`[sync] Erreur fatale: ${err.message}`);
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
