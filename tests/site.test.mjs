// Effets de site 1D : solutions analytiques, classement EN 1998-1:2004, puis comparaison à pystrata
// (tests/references/site.json, produit par tools/pystrata/site.py sur tests/references/modele_site.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Site from '../src/sismo/site.js';
import Spectre from '../src/sismo/spectre.js';

const lire = nom => JSON.parse(readFileSync(new URL(`./references/${nom}`, import.meta.url), 'utf-8'));
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} contre ${b}`);

test('couche homogène sans amortissement sur rocher élastique : |H| = 1/√(cos²kH + α²sin²kH)', () => {
  const H = 20, vs = 200, vr = 1000, rho = 1.8, rhoR = 2.2;
  const col = { couches: [{ h: H, rho }], rocher: { rho: rhoR, G0: rhoR * vr * vr, xi: 0 } };
  const etat = { G: [rho * vs * vs], xi: [0] }, alpha = (rho * vs) / (rhoR * vr);
  for (const f of [0.3, 1, 2.5, 4.1, 7.5, 12.5]) {
    const k = (2 * Math.PI * f) / vs, attendu = 1 / Math.sqrt(Math.cos(k * H) ** 2 + alpha ** 2 * Math.sin(k * H) ** 2);
    proche(Site.cabs(Site.transfert(col, etat, f)), attendu, 1e-9, `f = ${f} Hz`);
  }
  // résonance au quart d'onde, f0 = vs/4H, amplification 1/α
  const f0 = Site.frequenceQuartOnde([{ h: H, vs }]);
  proche(f0, 2.5, 1e-12);
  proche(Site.cabs(Site.transfert(col, etat, f0)), 1 / alpha, 1e-9);
});

test('Vs30 et classe de sol de l\'EN 1998-1:2004 (tableau 3.1)', () => {
  const R = { vs: 1000 };
  proche(Site.vs30([{ h: 10, vs: 200 }, { h: 20, vs: 400 }], R), 300, 1e-9);
  assert.equal(Site.classeEC8([{ h: 10, vs: 200 }, { h: 20, vs: 400 }], R).classe, 'C');
  // moins de 30 m de sol : le rocher complète
  proche(Site.vs30([{ h: 15, vs: 300 }], R), 30 / (15 / 300 + 15 / 1000), 1e-9);
  assert.equal(Site.classeEC8([{ h: 10, vs: 200 }], R).classe, 'E');
  assert.equal(Site.classeEC8([{ h: 25, vs: 200 }], R).classe, 'C');
  assert.equal(Site.classeEC8([{ h: 40, vs: 150 }], R).classe, 'D');
  assert.equal(Site.classeEC8([{ h: 40, vs: 500 }], R).classe, 'B');
  assert.equal(Site.classeEC8([], { vs: 900 }).classe, 'A');
  // contraintes au milieu des sous-couches : σv' = Σγh, σm' = σv'(1 + 2K0)/3
  const sc = Site.subdiviser([{ h: 4, vs: 160, poids: 18 }, { h: 3, vs: 200, poids: 20 }]);
  assert.deepEqual(sc.map(c => c.h), [2, 2, 1.5, 1.5]);
  const s = Site.contraintes(sc);
  proche(s[0].svMilieu, 18, 1e-12); proche(s[2].svMilieu, 72 + 15, 1e-12); proche(s[0].sigmaM, 12, 1e-12);
});

// ── Comparaison à pystrata ──
const modele = lire('modele_site.json'), ref = lire('site.json');
const col = Site.colonne(modele.profil.couches, modele.profil.rocher);

test('pystrata : mêmes sous-couches, courbes de Darendeli et amortissement en petites déformations', () => {
  assert.equal(col.couches.length, ref.courbes.length);
  col.couches.forEach((c, i) => {
    proche(c.sigmaM, modele.couches[i].sigmaM, 1e-9, 'σm');
    const r = ref.courbes[i];
    c.courbes.GG0.forEach((v, k) => { proche(v, r.GG0[k], 1e-12); proche(c.courbes.xi[k], r.xi[k], 1e-12); });
    proche(c.courbes.xi0, r.xiMin, 1e-12, 'ξ0');
  });
  // interpolation en ln γ, bornée
  const c = col.couches[0].courbes;
  assert.equal(Site.interpoler(c.gamma, c.GG0, 1e-8), c.GG0[0]);
  proche(Site.interpoler(c.gamma, c.GG0, Math.sqrt(c.gamma[3] * c.gamma[4])), (c.GG0[3] + c.GG0[4]) / 2, 1e-12);
});

test('pystrata : fonction de transfert linéaire surface / affleurement du rocher', () => {
  const etat = { G: col.couches.map(c => c.G0), xi: col.couches.map(c => c.courbes.xi0) };
  ref.transfert.frequences.forEach((f, k) => {
    const h = Site.transfert(col, etat, f), r = [ref.transfert.re[k], ref.transfert.im[k]];
    assert.ok(Math.hypot(h[0] - r[0], h[1] - r[1]) < 1e-10 * Math.hypot(...r), `f = ${f} Hz`);
  });
});

// L'accélération en surface est la même (PGA) ; le spectre de réponse diffère de quelques % aux courtes
// périodes par la méthode : pystrata calcule l'oscillateur en fréquence (signal à bande limitée), le site
// intègre par Newmark le signal interpolé linéairement (≤ 3,5 % à 0,05 s, déjà sur l'entrée seule).
test('pystrata : linéaire équivalent (G/G0, ξ, γ, PGA et spectre en surface), faible et fort', () => {
  modele.mouvements.forEach((mv, j) => {
    const o = ref.mouvements[j], r = Site.calculer(col, mv.acc, mv.dt, { ratio: modele.ratio, tolerance: 1e-5, iterMax: 40 });
    r.couches.forEach((c, i) => {
      const q = o.couches[i];
      for (const k of ['GG0', 'xi']) proche(c[k] / q[k], 1, 1e-4, `${mv.nom} couche ${i} ${k}`);
      for (const k of ['gammaEff', 'gammaMax']) proche(c[k] / q[k], 1, 2e-4, `${mv.nom} couche ${i} ${k}`);
    });
    let pga = 0;
    for (const v of r.surface) pga = Math.max(pga, Math.abs(v));
    proche(pga / o.pgaSurface, 1, 1e-4, `${mv.nom} PGA`);
    const sa = Spectre.reponse(Float64Array.from(r.surface, v => v * Site.GRAV), mv.dt, modele.periodes, 0.05).Sa;
    modele.periodes.forEach((T, k) => proche(sa[k] / Site.GRAV / o.saSurface[k], 1, T >= 0.15 ? 0.015 : 0.04, `${mv.nom} Sa(${T})`));
  });
  // le mouvement fort dégrade le sol : G/G0 plus bas, amortissement plus haut, amplification du PGA moindre
  const [f, F] = ref.mouvements;
  assert.ok(Math.min(...F.couches.map(c => c.GG0)) < 0.2 && Math.min(...f.couches.map(c => c.GG0)) > 0.7);
  assert.ok(F.pgaSurface / F.pgaEntree < f.pgaSurface / f.pgaEntree);
});
