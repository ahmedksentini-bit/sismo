// Rais sismiques dans le globe (src/sismo/globe.js) face à TauP d'ObsPy sur le même modèle ak135
// (tests/references/phases.json, tools/obspy/globe.py) : mêmes arrivées, mêmes temps et paramètres de rai.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import G from '../src/sismo/globe.js';

const ref = JSON.parse(readFileSync(new URL('./references/phases.json', import.meta.url), 'utf-8'));

test("toutes les arrivées de TauP, aucune de plus : temps à 0,02 s, p à 0,2 s/rad (mal déterminé près des caustiques), angles à 0,05°", () => {
  const groupes = new Map();
  for (const a of ref.arrivees) {
    const cle = `${a.phase}|${a.profondeur}|${a.distance}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(a);
  }
  let n = 0;
  for (const [cle, liste] of groupes) {
    const [phase, h, d] = cle.split('|'), miennes = G.arrivees(phase, +h, +d);
    assert.equal(miennes.length, liste.length, `${cle} : nombre d'arrivées`);
    const triees = [...liste].sort((x, y) => x.temps - y.temps);
    triees.forEach((a, i) => {
      const m = miennes[i];
      assert.ok(Math.abs(m.temps - a.temps) < 0.02, `${cle} : temps ${m.temps} / ${a.temps}`);
      assert.ok(Math.abs(m.p - a.p) < 0.2, `${cle} : p ${m.p} / ${a.p}`);
      assert.ok(Math.abs(m.depart - a.depart) < 0.05 && Math.abs(m.incidence - a.incidence) < 0.05, `${cle} : angles`);
      n++;
    });
  }
  assert.ok(n > 400);
});

test('le globe : rayons des discontinuités, zone d\'ombre de P, S arrêtée par le noyau liquide', () => {
  assert.deepEqual(G.RAYONS, { surface: 6371, moho: 6336, d410: 5961, d660: 5711, noyau: 3479.5, graine: 1217.5 });
  // P retourne dans le manteau jusqu'à une centaine de degrés, puis le noyau fait ombre
  const pMax = Math.max(...G.branche('P', 10).filter(Boolean).map(x => x.dist)) * 180 / Math.PI;
  assert.ok(pMax > 97 && pMax < 101, `P jusqu'à ${pMax}°`);
  assert.equal(G.arrivees('P', 10, 120).length, 0);
  const pkp = Math.min(...G.branche('PKP', 10).filter(Boolean).map(x => x.dist)) * 180 / Math.PI;
  assert.ok(pkp > 140 && pkp < 146, `PKP dès ${pkp}°`);
  // aucune onde S ne traverse le noyau externe (Vs = 0) : S y devient P (SKS)
  assert.equal(G.evaluer('S', 300, 10), null);
  assert.ok(G.arrivees('SKS', 10, 120).length === 1);
  // l'antipode n'est atteint que par le rai vertical PKIKP
  const anti = G.arrivees('PKIKP', 10, 180);
  assert.equal(anti.length, 1);
  assert.ok(anti[0].p < 1e-3);
});

test('tracé d\'un rai : du foyer à la station, à la distance de l\'arrivée', () => {
  for (const [phase, d] of [['P', 60], ['ScS', 40], ['PKIKP', 150], ['SKS', 100]]) {
    const a = G.arrivees(phase, 100, d)[0], t = G.trajet(phase, 100, a.p);
    assert.deepEqual(t[0], [G.R - 100, 0]);
    const fin = t[t.length - 1];
    assert.equal(fin[0], G.R);
    assert.ok(Math.abs(fin[1] * 180 / Math.PI - d) < 1e-6, `${phase} : ${fin[1] * 180 / Math.PI}`);
    // le rai ne descend jamais sous son point le plus bas attendu
    const rMin = Math.min(...t.map(q => q[0]));
    if (phase === 'ScS') assert.ok(Math.abs(rMin - G.RAYONS.noyau) < 1e-6);
    if (phase === 'P') assert.ok(rMin > G.RAYONS.noyau);
  }
});
