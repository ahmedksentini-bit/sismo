// Indicateurs d'accélérogramme : cas analytiques, puis comparaison à eqsig (tests/references/intensite.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import I from '../src/sismo/intensite.js';

const lire = nom => JSON.parse(readFileSync(new URL(`./references/${nom}`, import.meta.url), 'utf-8'));
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} contre ${b}`);

test('cas analytiques : sinus d\'amplitude 1 m/s² pendant 10 s', () => {
  const dt = 0.001, acc = Float64Array.from({ length: 10001 }, (_, i) => Math.sin(2 * Math.PI * 2 * i * dt));
  const r = I.indicateurs(acc, dt);
  // ∫a² dt = 5 ; Arias = π/(2g)·5 ; CAV = 10·2/π ; PGV = 2/(2π·2) ; durée 5–95 % ≈ 9 s
  proche(r.arias, (Math.PI / (2 * 9.81)) * 5, 1e-6); proche(r.cav, 20 / Math.PI, 2e-4); // trapèzes : écart aux points anguleux de |sin|
  proche(r.pgv, 1 / (2 * Math.PI), 1e-5); proche(r.d595, 9, 0.01); proche(r.husid[10000], 1, 1e-15);
});

test('eqsig : PGA, PGV, Arias, durées 5–95 % et 5–75 %, CAV', () => {
  const refs = lire('intensite.json').accelerogrammes;
  const m = lire('modele_inelastique.json'), s = lire('modele_site.json');
  const sources = { inelastique: [m.acc, m.dt], ...Object.fromEntries(s.mouvements.map(mv => [`site-${mv.nom}`, [mv.acc.map(v => v * 9.81), mv.dt]])) };
  for (const r of refs) {
    const [acc, dt] = sources[r.nom], x = I.indicateurs(Float64Array.from(acc), dt);
    for (const k of ['pga', 'pgv', 'arias', 'cav']) proche(x[k] / r[k], 1, 1e-12, `${r.nom} ${k}`);
    proche(x.d595, r.d595, 1e-9, `${r.nom} D5-95`); proche(x.d575, r.d575, 1e-9, `${r.nom} D5-75`);
  }
});

test('mise à l\'échelle : Arias × s², CAV et PGV × s, durées inchangées', () => {
  const m = lire('modele_inelastique.json'), s = 1.7;
  const a = I.indicateurs(Float64Array.from(m.acc), m.dt), b = I.indicateurs(Float64Array.from(m.acc, v => v * s), m.dt);
  proche(b.arias / a.arias, s * s, 1e-12); proche(b.cav / a.cav, s, 1e-12); proche(b.pgv / a.pgv, s, 1e-12);
  assert.equal(b.d595, a.d595); assert.equal(b.d575, a.d575);
});
