// Poussée progressive et méthode N2 d'un bâtiment en console de cisaillement ; calcul temporel non linéaire
// comparé à l'oscillateur inélastique (un étage) et à OpenSeesPy (tests/references/poussee.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import P from '../src/sismo/poussee.js';
import B from '../src/sismo/batiment.js';
import I from '../src/sismo/inelastique.js';
import Spectre from '../src/sismo/spectre.js';

const lire = nom => JSON.parse(readFileSync(new URL(`./references/${nom}`, import.meta.url), 'utf-8'));
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} contre ${b}`);
const bat = { m: [300, 300, 300, 250], k: [5e5, 4.5e5, 4e5, 3e5], h: [3, 3, 3, 3], Vy: [3000, 2700, 2100, 1200] };

test('courbe de capacité : élastique puis mécanisme de l\'étage critique', () => {
  const un = P.capacite({ k: [4e5], Vy: [900] }, [1]);
  proche(un.Fb, 900, 1e-9); proche(un.dy, 900 / 4e5, 1e-15); assert.equal(un.critique, 0);
  const p = P.profil(bat.m, null), c = P.capacite(bat, p);
  // profil uniforme : S = (1150, 850, 550, 250) ; rapports Vy/S = (2,61 ; 3,18 ; 3,82 ; 4,8) → la base est critique
  assert.equal(c.critique, 0); proche(c.lambda, 3000 / 1150, 1e-12); proche(c.Fb, 3000, 1e-9);
  // profil chargé en tête : l'étage 4 devient critique
  assert.equal(P.capacite(bat, [0, 0, 0, 1]).critique, 3);
  // à dy, chaque étage a son glissement élastique ; au-delà, seul l'étage critique se déforme
  const d1 = c.glissements(c.dy), d2 = c.glissements(2 * c.dy);
  proche(d1.reduce((s, x) => s + x, 0), c.dy, 1e-15);
  d1.forEach((x, i) => proche(d2[i] - x, i === 0 ? c.dy : 0, 1e-15));
  proche(c.effort(c.dy / 2), c.Fb / 2, 1e-9); proche(c.effort(3 * c.dy), c.Fb, 1e-9);
});

test('système équivalent : Γ = 1 en uniforme ; Γ du mode 1 pour le profil modal', () => {
  const e = P.equivalent(bat.m, [1, 1, 1, 1]);
  proche(e.gamma, 1, 1e-15); proche(e.mEtoile, 1150, 1e-12);
  const md = B.modes(bat), q = P.equivalent(bat.m, md[0].phi);
  proche(q.gamma, md[0].gamma, 1e-12);
});

test('N2 : un étage → méthode N2 de l\'oscillateur ; T* du profil modal exact = T1 si l\'étage critique ne change rien', () => {
  const se = T => Spectre.ec8(T, { type: 1, sol: 'B', ag: 0.3 }) * 9.81, TC = 0.5;
  const un = { m: [400], k: [3e5], Vy: [1500] }, r = P.n2(un, [1], { se, TC });
  const T = 2 * Math.PI * Math.sqrt(400 / 3e5), ref = I.n2({ T, saY: 1500 / 400, se: se(T), TC });
  proche(r.T, T, 1e-12); proche(r.dt, ref.dt, 1e-15); assert.equal(r.regle, ref.regle);
  // profil modal : dy/Fb = Σ S_i/k_i/S_1 → T* = 2π·√(m*·d*y/F*y) = T1 (quotient de Rayleigh exact)
  const md = B.modes(bat), m = P.n2(bat, md[0].phi, { se, TC });
  proche(m.T, md[0].T, 1e-12);
  proche(m.dt, m.gamma * m.dtEtoile, 1e-15);
});

test('Rayleigh : ξ exact aux modes 1 et 2 ; un étage = amortissement proportionnel à la masse', () => {
  const md = B.modes(bat), { a0, a1 } = P.rayleigh(md, 0.05);
  for (const j of [0, 1]) proche(a0 / (2 * md[j].w) + (a1 * md[j].w) / 2, 0.05, 1e-15);
  const x = P.thomas([0, 1, 1], [4, 4, 4], [1, 1, 0], [5, 6, 5]);
  x.forEach(v => proche(v, 1, 1e-15));
});

test('temporel non linéaire : un étage = oscillateur inélastique', () => {
  const m = lire('modele_inelastique.json'), acc = Float64Array.from(m.acc);
  for (const c of m.cas.filter(x => x.R > 1).slice(0, 4)) {
    // même sous-pas que l'oscillateur (la période recalculée peut différer d'un ulp)
    const kk = (2 * Math.PI / c.T) ** 2 * 100, sousPas = Math.max(1, Math.ceil(m.dt / (c.T / 20) - 1e-9));
    const r = P.temporel({ m: [100], k: [kk], Vy: [c.fy * 100], alpha: c.alpha }, acc, m.dt, { sousPas });
    const ref = I.integrer(acc, m.dt, { T: c.T, xi: 0.05, fy: c.fy, alpha: c.alpha });
    proche(r.dMax[0] / ref.umax, 1, 1e-9, `T ${c.T}`);
    ref.u.forEach((u, i) => proche(r.toit[i], u, 1e-9 * ref.umax, `T ${c.T} pas ${i}`));
  }
});

test('OpenSeesPy : poussée analytique et calcul temporel non linéaire du système couplé', () => {
  const mod = lire('modele_poussee.json'), ref = lire('poussee.json'), acc = Float64Array.from(mod.acc);
  ref.batiments.forEach((o, ib) => {
    const b = mod.batiments[ib];
    // poussée en déplacement imposé (OpenSees, ressorts à faible écrouissage) : effort à la plastification
    for (const [nom, phi] of [['modal', B.modes(b)[0].phi], ['uniforme', null]]) {
      const c = P.capacite(b, P.profil(b.m, phi)), r = o.poussee[nom];
      assert.equal(c.critique, r.critique, `${b.nom} ${nom} étage critique`);
      proche(c.Fb / r.Fy, 1, 1e-12, `${b.nom} ${nom} Fb`); proche(c.dy / r.dy, 1, 1e-12, `${b.nom} ${nom} dy`);
    }
    const t = P.temporel(b, acc, mod.dt, { amortissement: b.amortissement || null });
    assert.equal(t.h, mod.dt / b.sousPas);
    const umax = Math.max(...o.toit.map(Math.abs));
    o.toit.forEach((v, i) => proche(t.toit[i], v, 1e-8 * umax, `${b.nom} toit ${i}`));
    t.dMax.forEach((v, i) => proche(v / o.dMax[i], 1, 1e-10, `${b.nom} glissement ${i}`));
  });
});
