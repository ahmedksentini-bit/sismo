// Tables de temps de trajet (src/sismo/tables.js) : chaque case de la table télésismique est la première arrivée
// calculée par TauP (tests/references/phases.json) ; la table régionale est celle de la croûte du cours ; la lecture
// par interpolation retrouve la distance, la profondeur et l'heure d'origine des exemples du chapitre 6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Tables from '../src/sismo/tables.js';
import Sismo from '../src/sismo/signal.js';

const ref = JSON.parse(readFileSync(new URL('./references/phases.json', import.meta.url), 'utf-8')).arrivees;
const DIST = Array.from({ length: 18 }, (_, i) => 10 * (i + 1));

test('table télésismique : chaque case est la première arrivée de TauP, à 0,02 s', () => {
  for (const h of [10, 100, 300, 600]) {
    const lignes = Tables.telesismique({ h, distances: DIST });
    for (const l of lignes) for (const ph of Tables.PHASES_TELE) {
      const tauP = ref.filter((a) => a.profondeur === h && a.distance === l.d && a.phase === ph).map((a) => a.temps);
      if (!tauP.length) assert.equal(l[ph], null, `${ph} à ${l.d}°, ${h} km : absent chez TauP`);
      else assert.ok(Math.abs(l[ph] - Math.min(...tauP)) < 0.02, `${ph} à ${l.d}°, ${h} km : ${l[ph]} contre ${Math.min(...tauP)}`);
    }
    // S − P croît avec la distance tant que P et S existent ; la zone d'ombre commence entre 90 et 110°
    const sp = lignes.filter((l) => l.SP !== null);
    for (let i = 1; i < sp.length; i++) assert.ok(sp[i].SP > sp[i - 1].SP);
    assert.equal(lignes.find((l) => l.d === 90).premiere, 'P');
    assert.notEqual(lignes.find((l) => l.d === 110).premiere, 'P');
  }
});

test('table régionale : croûte du cours, Pn première au-delà du croisement, règle 8,4 × (S − P) biaisée', () => {
  const l = Tables.regionale({ h: 10, distances: Array.from({ length: 21 }, (_, i) => 20 * i) });
  for (const r of l) {
    const t = Sismo.temps(r.d, 10);
    assert.equal(r.Pg, t.tPg); assert.equal(r.Pn, t.tPn); assert.equal(r.SP, t.tSg - t.tP);
  }
  assert.equal(l.find((r) => r.d === 140).premiere, 'Pg');
  assert.equal(l.find((r) => r.d === 160).premiere, 'Pn');
  const r200 = l.find((r) => r.d === 200);
  assert.ok(8.4 * r200.SP > 1.08 * Math.hypot(200, 10), 'la règle surestime au-delà du croisement');
  const r60 = l.find((r) => r.d === 60);
  assert.ok(Math.abs(8.4 * r60.SP - Math.hypot(60, 10)) < 1, 'la règle tient avant le croisement');
});

test('lecture par interpolation : exemples du chapitre 6 et calculateur', () => {
  // exemple 1 : régional, 187 km
  const reg = Tables.regionale({ h: 10, distances: Array.from({ length: 21 }, (_, i) => 20 * i) });
  const t187 = Sismo.temps(187, 10), sp1 = Math.round((t187.tSg - t187.tP) * 10) / 10;
  const l1 = Tables.inverser(reg, sp1, (r) => r.d, (r) => r.SP);
  assert.deepEqual([l1.a.d, l1.b.d], [180, 200]);
  assert.ok(Math.abs(l1.x - 187) < 1);
  assert.ok(Math.abs(Tables.distanceSPRegionale(t187.tSg - t187.tP, 10) - 187) < 1e-6);
  // exemple 2 : lointain, 64°, foyer à 10 km
  const tele = Tables.telesismique({ h: 10, distances: DIST }), sp2 = Math.round(Tables.spTele(10, 64));
  const l2 = Tables.inverser(tele, sp2, (r) => r.d, (r) => r.SP);
  assert.deepEqual([l2.a.d, l2.b.d], [60, 70]);
  assert.ok(Math.abs(l2.x - 64) < 0.2, `Δ lu ${l2.x}`);
  const tp = Tables.interpoler(tele, l2.x, (r) => r.d, (r) => r.P), TP = Tables.premiere('P', 10, 64);
  assert.ok(Math.abs(tp.y - TP) < 1.5, `T_P lu ${tp.y} contre ${TP}`);
  const ex = Tables.dichotomie((d) => Tables.spTele(10, d), sp2, 60, 70, 16);
  assert.ok(Math.abs(Tables.spTele(10, ex) - sp2) < 0.05 && Math.abs(ex - 64) < 0.05);
  // exemple 3 : profondeur à 50°, 200 km
  const prof = Tables.profondeurs({ profondeurs: [10, 100, 300, 600], distances: [50] })[0];
  const pp = Math.round(10 * (Tables.premiere('pP', 200, 50) - Tables.premiere('P', 200, 50))) / 10, l3 = Tables.lireProfondeur(prof, pp, [10, 100, 300, 600]);
  assert.deepEqual([l3.a.h, l3.b.h], [100, 300]);
  assert.ok(Math.abs(l3.x - 200) < 10, `h lue ${l3.x}`);
  // hors table : pas de lecture
  assert.equal(Tables.inverser(tele, 2000, (r) => r.d, (r) => r.SP), null);
  // le cours appelle les tables, les exemples et le calculateur
  const cours = readFileSync(new URL('../cours.html', import.meta.url), 'utf-8');
  for (const id of ['tabTempsRegional', 'tabTempsTele', 'tabTempsProf', 'exTables', 'calcTable', 'tbSP', 'tbH', 'tbP']) assert.ok(cours.includes(`id="${id}"`), id);
});
