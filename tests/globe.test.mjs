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
  for (const [phase, d] of [['P', 60], ['ScS', 40], ['PKIKP', 150], ['SKS', 100], ['pP', 60], ['sP', 80]]) {
    const a = G.arrivees(phase, 100, d)[0], t = G.trajet(phase, 100, a.p);
    assert.deepEqual(t[0], [G.R - 100, 0]);
    const fin = t[t.length - 1];
    assert.equal(fin[0], G.R);
    assert.ok(Math.abs(fin[1] * 180 / Math.PI - d) < 1e-6, `${phase} : ${fin[1] * 180 / Math.PI}`);
    // le rai ne descend jamais sous son point le plus bas attendu
    const rMin = Math.min(...t.map(q => q[0]));
    if (phase === 'ScS') assert.ok(Math.abs(rMin - G.RAYONS.noyau) < 1e-6);
    if (phase === 'P') assert.ok(rMin > G.RAYONS.noyau);
    // une phase de profondeur monte d'abord jusqu'à la surface, puis repart vers le bas
    if (phase[0] === 'p' || phase[0] === 's') {
      const iSurf = t.findIndex(q => q[0] === G.R);
      assert.ok(iSurf > 0 && iSurf < t.length - 1 && t.slice(0, iSurf).every((q, i) => !i || q[0] >= t[i - 1][0]));
    }
  }
});

test('phases de profondeur : mode rapide exact de 40° à 95°, profondeur retrouvée d\'après les retards de TauP', () => {
  for (const h of [1, 33, 100, 250, 450, 700]) for (let d = 40; d <= 95; d += 5) for (const ph of ['P', 'pP', 'sP']) {
    const a = G.arrivees(ph, h, d)[0], b = G.arrivees(ph, h, d, { rapide: true })[0];
    assert.ok(a && b && Math.abs(a.temps - b.temps) < 1e-6, `${ph} ${h} km ${d}°`);
  }
  // retards pP − P et sP − P lus par TauP : la dichotomie sur la profondeur retrouve le foyer à 0,5 km près
  const t = (ph, h, d) => Math.min(...ref.arrivees.filter(a => a.phase === ph && a.profondeur === h && a.distance === d).map(a => a.temps));
  for (const h of [100, 300, 600]) for (const d of [40, 60, 90]) for (const ph of ['pP', 'sP']) {
    const z = G.profondeur(t(ph, h, d) - t('P', h, d), d, ph);
    assert.ok(Math.abs(z - h) < 0.5, `${ph} ${h} km ${d}° : ${z}`);
  }
  // le retard croît avec la profondeur et un peu avec la distance ; hors de 1 à 700 km : NaN
  assert.ok(G.retard('pP', 100, 40) < G.retard('pP', 100, 90) && G.retard('pP', 100, 60) < G.retard('pP', 300, 60));
  assert.ok(Number.isNaN(G.profondeur(500, 60)));
});
