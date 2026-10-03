// Statistique de la sismicité : valeur b, complétude, déclusterage, Poisson.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Sc from '../src/sismo/sismicite.js';

test('valeur b retrouvée sur un catalogue complet sans répliques', () => {
  for (const b of [0.8, 1.0, 1.2]) {
    const cat = Sc.genererCatalogue({ b, taux4: 20, repliques: false, completude: [[1900, 2.5]], graine: 11 });
    const r = Sc.valeurB(cat.map(e => e.M), 3.0);
    assert.ok(Math.abs(r.b - b) < Math.max(0.03, 3 * r.sigma), `b = ${b} : ${r.b.toFixed(3)} ± ${r.sigma.toFixed(3)} (N = ${r.N})`);
  }
});

test('magnitude de complétude par courbure maximale sur la période moderne', () => {
  const cat = Sc.genererCatalogue({ b: 1, taux4: 3, repliques: false, graine: 4 }).filter(e => e.t >= 1990);
  const mc = Sc.mcCourbureMax(cat.map(e => e.M));
  assert.ok(mc >= 2.6 && mc <= 3.1, `Mc = ${mc}`);
});

test('fenêtres de Gardner et Knopoff', () => {
  const w = Sc.fenetreGK(5);
  assert.ok(Math.abs(w.L - Math.pow(10, 1.602)) < 1e-9 && Math.abs(w.T - Math.pow(10, 2.1575)) < 1e-9);
  assert.ok(Sc.fenetreGK(7).T > Sc.fenetreGK(6).T);
});

test('le déclusterage retire les répliques et garde les chocs principaux', () => {
  const cat = Sc.genererCatalogue({ b: 1, taux4: 2, Mmax: 7.5, graine: 9, completude: [[1900, 2.5]] });
  const garde = Sc.declusterGK(cat);
  let rep = 0, repRetirees = 0, princ = 0, princGardes = 0;
  cat.forEach((e, i) => { if (e.rep) { rep++; if (!garde[i]) repRetirees++; } else { princ++; if (garde[i]) princGardes++; } });
  assert.ok(rep > 500, `${rep} répliques`);
  assert.ok(repRetirees / rep > 0.85, `répliques retirées : ${(100 * repRetirees / rep).toFixed(0)} %`);
  assert.ok(princGardes / princ > 0.9, `chocs principaux gardés : ${(100 * princGardes / princ).toFixed(0)} %`);
});

test('taux annuel des chocs principaux retrouvé après déclusterage', () => {
  const cat = Sc.genererCatalogue({ b: 1, taux4: 2, graine: 21, completude: [[1900, 2.5]] });
  const garde = Sc.declusterGK(cat), mags = cat.filter((_, i) => garde[i]).map(e => e.M);
  const r = Sc.recurrence(mags, 3.5, 125);
  assert.ok(Math.abs(r.taux(4) / 2 - 1) < 0.25, `λ(≥4) = ${r.taux(4).toFixed(2)} par an`);
});

test('Poisson : 10 % en 50 ans ↔ 475 ans ; 10 % en 10 ans ↔ 95 ans', () => {
  assert.ok(Math.abs(Sc.periodeRetour(0.1, 50) - 474.6) < 0.1);
  assert.ok(Math.abs(Sc.periodeRetour(0.1, 10) - 94.9) < 0.1);
  assert.ok(Math.abs(Sc.probabilite(1 / 475, 50) - 0.0999) < 1e-3);
});

test('Stepp : σλ·√T constant tant que la classe est complète, chute au-delà', () => {
  const cat = Sc.genererCatalogue({ b: 1, taux4: 5, repliques: false, graine: 8, completude: [[1900, 5.5], [1964, 3.0]] });
  const [c] = Sc.stepp(cat, { classes: [[3.5, 4]], anneeFin: 2025, durees: [10, 30, 60, 100] });
  const k = c.points.map(p => p.sigma * Math.sqrt(p.T));
  assert.ok(Math.abs(k[1] / k[0] - 1) < 0.25 && Math.abs(k[2] / k[0] - 1) < 0.25, `complet : ${k.map(v => v.toFixed(2)).join(' ; ')}`);
  assert.ok(k[3] / k[0] < 0.85, `incomplet avant 1964 : ${(k[3] / k[0]).toFixed(2)}`);
});
