// Fonctions Cloudflare de la page « En direct » : le relais FDSN (functions/api/geofon.js) ne transmet à GEOFON que les
// requêtes permises, avec leurs seuls paramètres, et rend la réponse telle quelle (204 compris). Le relais SeedLink
// (functions/api/seedlink.js, sockets TCP de Cloudflare) s'essaie avec `wrangler pages dev` et les serveurs de
// tools/direct/serveurs-essai.mjs ; ici, on vérifie qu'il refuse ce qui n'est pas une connexion WebSocket valide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestGet } from '../functions/api/geofon.js';

test('relais FDSN : requête transmise à GEOFON avec les seuls paramètres permis ; refus sinon', async () => {
  const appels = [], fetchOrigine = globalThis.fetch;
  globalThis.fetch = async (url) => { appels.push(String(url)); return String(url).includes('dataselect') ? new Response(null, { status: 204 }) : new Response('#Network | Station\nGE|TEST\n', { status: 200, headers: { 'Content-Type': 'text/plain' } }); };
  try {
    const r = await onRequestGet({ request: new Request('https://site.test/api/geofon?service=station&network=GE&level=station&format=text'), env: {} });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /GE\|TEST/);
    assert.equal(appels[0], 'https://geofon.gfz.de/fdsnws/station/1/query?network=GE&level=station&format=text');
    const v = await onRequestGet({ request: new Request('https://site.test/api/geofon?service=dataselect&network=GE&station=TEST&channel=BHZ&starttime=2026-10-04T19:00:00&endtime=2026-10-04T19:10:00'), env: { GEOFON_FDSN: 'http://127.0.0.1:8090' } });
    assert.equal(v.status, 204);
    assert.ok(appels[1].startsWith('http://127.0.0.1:8090/fdsnws/dataselect/1/query?'));
    for (const q of ['service=admin', 'service=station&url=http://ailleurs', 'service=dataselect&network=GE&station=*&channel=BHZ&starttime=2026-10-04T19:00:00&endtime=2026-10-04T19:10:00']) {
      const e = await onRequestGet({ request: new Request(`https://site.test/api/geofon?${q}`), env: {} });
      assert.equal(e.status, 400, q);
    }
    assert.equal(appels.length, 2, 'aucune requête refusée n\'est partie vers GEOFON');
  } finally { globalThis.fetch = fetchOrigine; }
});

test('relais SeedLink : serveurs de GEOFON seulement, flux validés, connexion bornée dans le temps', () => {
  const src = readFileSync(new URL('../functions/api/seedlink.js', import.meta.url), 'utf-8');
  assert.match(src, /const SERVEURS = \['geofon\.gfz\.de:18000', 'geofon\.gfz-potsdam\.de:18000'\]/);
  assert.match(src, /SeedLink\.lireFlux\(/);
  assert.match(src, /DUREE_MAX = 10 \* 60 \* 1000/);
  // la page « En direct » existe, charge son script et les côtes produites par tools/carte/cotes.py
  const page = readFileSync(new URL('../direct.html', import.meta.url), 'utf-8'), cotes = JSON.parse(readFileSync(new URL('../data/cotes-mediterranee.json', import.meta.url), 'utf-8'));
  for (const id of ['dr-carte', 'dr-traces', 'dr-seismes', 'dr-arrivees', 'dr-afficheurs']) assert.ok(page.includes(`id="${id}"`), id);
  assert.ok(page.includes('src="src/direct-page.js"'));
  assert.ok(cotes.cotes.length > 50 && cotes.cotes.every(l => l.length % 2 === 0));
});
