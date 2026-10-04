// Fonctions Cloudflare de la page « En direct » : le relais FDSN (functions/api/fdsn.js) ne transmet qu'aux centres de la
// liste blanche (src/sismo/centres.js) les requêtes permises, avec leurs seuls paramètres, et rend la réponse telle
// quelle (204 compris). Le relais SeedLink (functions/api/seedlink.js, sockets TCP de Cloudflare) s'essaie avec
// `wrangler pages dev` et les serveurs de tools/direct/serveurs-essai.mjs ; ici, on vérifie dans sa source qu'il ne
// joint que les serveurs de la liste blanche, des flux validés, pour une durée bornée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestGet } from '../functions/api/fdsn.js';

test('relais FDSN : requête transmise au centre demandé (GEOFON par défaut) avec les seuls paramètres permis ; refus sinon', async () => {
  const appels = [], fetchOrigine = globalThis.fetch;
  globalThis.fetch = async (url) => { appels.push(String(url)); return String(url).includes('dataselect') ? new Response(null, { status: 204 }) : new Response('#Network | Station\nGE|TEST\n', { status: 200, headers: { 'Content-Type': 'text/plain' } }); };
  try {
    const r = await onRequestGet({ request: new Request('https://site.test/api/fdsn?service=station&network=GE&level=station&format=text'), env: {} });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /GE\|TEST/);
    assert.equal(appels[0], 'https://geofon.gfz.de/fdsnws/station/1/query?network=GE&level=station&format=text');
    const v = await onRequestGet({ request: new Request('https://site.test/api/fdsn?centre=ingv&service=dataselect&network=IV&station=LPEL&channel=HHZ&starttime=2026-10-04T19:00:00&endtime=2026-10-04T19:10:00'), env: { FDSN_ESSAI: 'http://127.0.0.1:8090/{centre}' } });
    assert.equal(v.status, 204);
    assert.ok(appels[1].startsWith('http://127.0.0.1:8090/ingv/fdsnws/dataselect/1/query?'), appels[1]);
    const i = await onRequestGet({ request: new Request('https://site.test/api/fdsn?centre=ingv&service=station&network=IV&level=network&format=text'), env: {} });
    assert.equal(i.status, 200);
    assert.equal(appels[2], 'https://webservices.ingv.it/fdsnws/station/1/query?network=IV&level=network&format=text');
    for (const q of ['service=admin', 'service=station&url=http://ailleurs', 'centre=ailleurs&service=station&network=GE', 'centre=__proto__&service=station',
      'service=dataselect&network=GE&station=*&channel=BHZ&starttime=2026-10-04T19:00:00&endtime=2026-10-04T19:10:00']) {
      const e = await onRequestGet({ request: new Request(`https://site.test/api/fdsn?${q}`), env: {} });
      assert.equal(e.status, 400, q);
    }
    assert.equal(appels.length, 3, 'aucune requête refusée n\'est partie vers un centre');
  } finally { globalThis.fetch = fetchOrigine; }
});

test('relais SeedLink : serveurs de la liste blanche seulement, flux validés, voies demandées seules, durée bornée', () => {
  const src = readFileSync(new URL('../functions/api/seedlink.js', import.meta.url), 'utf-8');
  assert.match(src, /if \(!Centres\.serveurPermis\(serveur\)\) return new Response\('Serveur SeedLink non permis', \{ status: 400 \}\)/);
  assert.match(src, /const cible = env\.SEEDLINK_SERVEUR \|\| serveur/);
  assert.ok(src.indexOf('serveurPermis(serveur)') < src.indexOf('diagnostiquer(serveur'), 'le diagnostic passe aussi par la liste blanche');
  assert.match(src, /for \(let i = 0; i < Centres\.SEEDLINK\.length; i \+= 5\)/, 'la sonde ne joint que la liste blanche');
  assert.match(src, /SeedLink\.lireFlux\(/);
  assert.match(src, /voulues\.has\(SeedLink\.identifiant\(p\.enregistrement\)\)/);
  assert.match(src, /DUREE_MAX = 10 \* 60 \* 1000/);
  // la page « En direct » existe, charge son script et les côtes produites par tools/carte/cotes.py
  const page = readFileSync(new URL('../direct.html', import.meta.url), 'utf-8'), cotes = JSON.parse(readFileSync(new URL('../data/cotes-mediterranee.json', import.meta.url), 'utf-8'));
  for (const id of ['dr-carte', 'dr-traces', 'dr-seismes', 'dr-arrivees', 'dr-afficheurs', 'dr-reseaux', 'dr-tunisie', 'dr-centres', 'dr-journal']) assert.ok(page.includes(`id="${id}"`), id);
  assert.ok(page.includes('src="src/direct-page.js"'));
  assert.ok(cotes.cotes.length > 50 && cotes.cotes.every(l => l.length % 2 === 0));
});
