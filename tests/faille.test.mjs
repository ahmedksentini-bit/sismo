// Sources de faille : loi d'échelle, maillage, ruptures flottantes et distances, puis comparaison aux
// ruptures d'OpenQuake (tests/references/failles.json, SimpleFaultSource avec WC1994).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import F from '../src/sismo/faille.js';
import Psha from '../src/sismo/psha.js';
import Geodesie from '../src/sismo/geodesie.js';

const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} contre ${b}`);
const VERTICALE = { trace: [[-10, -40], [-10, 40]], pendage: 90, zHaut: 0, zBas: 12, rake: 0 };

test('Wells et Coppersmith (1994) : aire médiane selon le mécanisme', () => {
  proche(F.aireWC1994(7, 0), Math.pow(10, -3.42 + 6.3), 1e-9, 'décrochement');
  proche(F.aireWC1994(7, 90), Math.pow(10, -3.99 + 6.86), 1e-9, 'inverse');
  proche(F.aireWC1994(7, -90), Math.pow(10, -2.87 + 5.74), 1e-9, 'normale');
  proche(F.magnitudeFailleEntiere(F.aireWC1994(6.8, 0), 0), 6.8, 1e-12);
});

test('maillage et ruptures flottantes : dimensions bornées par la faille, taux partagé', () => {
  const g = F.geometrie(VERTICALE, 1);
  assert.deepEqual([g.nRangs, g.nCols, g.L, g.W], [13, 81, 80, 12]);
  // M 7 : aire 759 km² > largeur² → largeur 12 km, longueur 63 km
  const d = F.dimensions(g, 7, 0);
  assert.deepEqual(d, { cols: Math.round(F.aireWC1994(7, 0) / 12) + 1, rangs: 13 });
  assert.equal(F.ruptures(g, 7, 0).length, 81 - d.cols + 1);
  // au-delà de l'aire de la faille : une seule rupture, la faille entière
  assert.equal(F.ruptures(g, 7.5, 0).length, 1);
  // moment μ·L·W·s
  proche(F.moment(g, 0.8), 3e10 * 80e3 * 12e3 * 0.8e-3, 1);
});

test('distances : Rjb nul au-dessus d\'une rupture pentée, Rrup ≥ Rjb', () => {
  const g = F.geometrie({ trace: [[0, 0], [0, 40]], pendage: 30, zHaut: 0, zBas: 10, rake: 90 }, 1);
  const rup = F.ruptures(g, 7.5, 90)[0]; // toute la faille : projection de x = 0 à 17,3 km (pendage vers l'est)
  assert.equal(F.rjb(g, rup, { x: 8, y: 20 }), 0);
  proche(F.rjb(g, rup, { x: -5, y: 20 }), 5 - 0.005, 1e-9, 'projection dilatée de 5 m comme OpenQuake');
  proche(F.rjb(g, rup, { x: -50, y: 20 }), 50, 1e-9, 'au-delà de 40 km : sans dilatation');
  proche(F.rrup(g, rup, { x: 8, y: 20 }), 8 * Math.sin(30 * Math.PI / 180), 1e-9, 'au-dessus : distance au plan');
  for (const p of [{ x: -30, y: 5 }, { x: 25, y: 60 }, { x: 10, y: -8 }]) assert.ok(F.rrup(g, rup, p) >= F.rjb(g, rup, p) - 1e-9);
});

test('OpenQuake : mêmes ruptures flottantes, mêmes taux, Rjb et Rrup', () => {
  const ref = JSON.parse(readFileSync(new URL('./references/failles.json', import.meta.url), 'utf-8'));
  let eJ = 0, eR = 0;
  for (const f of Object.values(ref.failles)) {
    const g = F.geometrie(f, 1);
    assert.deepEqual([g.nRangs, g.nCols], f.maillage);
    for (const [m, r] of Object.entries(f.ruptures)) {
      const rups = F.ruptures(g, +m, f.rake, 1);
      assert.equal(rups.length, r.n, `nombre de ruptures, M ${m}`);
      proche(1 / rups.length, r.taux, 1e-15);
      r.indices.forEach((i, k) => ref.sites.forEach(([x, y], s) => {
        eJ = Math.max(eJ, Math.abs(F.rjb(g, rups[i], { x, y }) - r.rjb[k][s]));
        eR = Math.max(eR, Math.abs(F.rrupSphere(g, rups[i], { x, y }) - r.rrup[k][s]));
      }));
    }
  }
  // Rjb : plan du site contre projection d'OpenQuake (écart de sphère) ; Rrup : même calcul aux nœuds
  assert.ok(eJ < 0.02, `Rjb : écart ${eJ} km`);
  assert.ok(eR < 0.005, `Rrup : écart ${eR} km`);
});

test('faille F du modèle d\'école : grands séismes au-delà de la zone A, budget de moment partagé', () => {
  const m = Psha.modeleDefaut(), f = m.failles[0], mF = Psha.momentFaille(m, f);
  const vars = Psha.variantes(m), c = vars.find(v => v.id === 'c11'), g = vars.find(v => v.id === 'g1');
  // La loi de la faille commence au Mmax de la zone A, branche ΔMmax comprise, et libère son moment
  for (const [idm, dm] of m.dMmax.entries()) {
    const l = Psha.loiFaille(m, c, 0, dm.d);
    proche(l.mmin, m.zones[0].mmax + dm.d, 1e-12);
    proche(Geodesie.momentGR(l) / mF, 1, 1e-12, `ΔMmax n° ${idm}`);
  }
  // Géodésie : la faille et le fond de la zone A se partagent χ·Ṁ0 de la zone
  const chi = m.taux[1].couplage[1].chi;
  proche(g.failles[0].moment + g.zones[0].moment, chi * m.taux[1].moments[0], 1);
  // Catalogue de la zone A + faille F ≈ moment géodésique de la zone A (le catalogue seul en libère 30 %)
  const cat = Geodesie.momentGR({ a: Math.log10(0.25) + 4, b: 1, mmin: 4, mmax: 6.5 });
  proche((cat + mF) / m.taux[1].moments[0], 1, 0.05);
  proche(cat / m.taux[1].moments[0], 0.3, 0.03);
});
