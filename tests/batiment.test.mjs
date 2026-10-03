// Bâtiment en console de cisaillement : cas analytiques (modes d'une console uniforme, un étage, Rayleigh),
// propriétés de la superposition modale, spectre de calcul de l'EN 1998-1:2004, règles du § 4.3.3.3, puis
// comparaison à OpenSeesPy (tests/references/batiment.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import B from '../src/sismo/batiment.js';
import Spectre from '../src/sismo/spectre.js';

const lire = nom => JSON.parse(readFileSync(new URL(`./references/${nom}`, import.meta.url), 'utf-8'));
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} contre ${b}`);
const uniforme = (n, m = 300, k = 4e5) => ({ m: new Array(n).fill(m), k: new Array(n).fill(k), h: new Array(n).fill(3) });

test('console uniforme : ωj = 2·√(k/m)·sin((2j − 1)π / (2(2N + 1)))', () => {
  for (const n of [1, 3, 7, 10]) {
    const b = uniforme(n), md = B.modes(b);
    md.forEach((x, j) => proche(x.w / (2 * Math.sqrt(4e5 / 300) * Math.sin(((2 * j + 1) * Math.PI) / (2 * (2 * n + 1)))), 1, 1e-12, `N ${n} mode ${j + 1}`));
    // masses effectives : somme = masse totale ; Σ Γj·φj = 1 à chaque plancher
    proche(md.reduce((s, x) => s + x.part, 0), 1, 1e-12);
    for (let i = 0; i < n; i++) proche(md.reduce((s, x) => s + x.gamma * x.phi[i], 0), 1, 1e-11, `plancher ${i}`);
  }
  const un = B.modes(uniforme(1))[0];
  proche(un.T, 2 * Math.PI * Math.sqrt(300 / 4e5), 1e-15); proche(un.meff, 300, 1e-9);
});

test('périodes approchées : 2·√d à 0,3 % sur un étage, Rayleigh exact sous les forces du mode 1', () => {
  const un = uniforme(1);
  proche(B.periodeDeplacement(un) / B.modes(un)[0].T, Math.sqrt(9.81) / Math.PI, 1e-12);
  const b = { m: [400, 350, 300, 300, 250], k: [6e5, 5e5, 4.5e5, 3e5, 2e5], h: [4, 3, 3, 3, 3] }, md = B.modes(b);
  proche(B.periodeRayleigh(b, b.m.map((x, i) => x * md[0].phi[i])), md[0].T, 1e-12);
  // forces en z : Rayleigh proche du mode 1 (quotient stationnaire), par excès
  const T = B.periodeRayleigh(b, B.forcesLaterales(b, { T1: md[0].T, Sd: 1, TC: 0.5 }).F);
  assert.ok(T <= md[0].T + 1e-12 && T > 0.97 * md[0].T, `${T} contre ${md[0].T}`);
});

test('forces latérales : Fb = Sd·m·λ, répartition en z, λ selon T1, TC et le nombre d\'étages', () => {
  const b = uniforme(4), r = B.forcesLaterales(b, { T1: 0.5, Sd: 2, TC: 0.4 });
  assert.equal(r.lambda, 0.85); proche(r.Fb, 2 * 1200 * 0.85, 1e-9);
  proche(r.F.reduce((s, x) => s + x, 0), r.Fb, 1e-9); proche(r.F[3] / r.F[0], 4, 1e-12);
  assert.equal(B.forcesLaterales(b, { T1: 0.9, Sd: 2, TC: 0.4 }).lambda, 1);
  assert.equal(B.forcesLaterales(uniforme(2), { T1: 0.3, Sd: 2, TC: 0.4 }).lambda, 1);
  assert.ok(B.forcesLateralesPermises(1.6, 0.4) && !B.forcesLateralesPermises(1.7, 0.4) && !B.forcesLateralesPermises(2.1, 0.8));
});

test('superposition modale : Sa constant → forces de plancher m·Sa, CQC = SRSS pour des modes éloignés', () => {
  const b = { m: [400, 350, 300, 300, 250], k: [6e5, 5e5, 4.5e5, 3e5, 2e5], h: [4, 3, 3, 3, 3] }, md = B.modes(b);
  const R = md.map(x => B.reponseModale(x, b, 3));
  for (let i = 0; i < 5; i++) proche(R.reduce((s, r) => s + r.F[i], 0), b.m[i] * 3, 1e-9);
  // effort à la base du mode : masse effective × Sa ; V = k·d = Σ F au-dessus
  R.forEach((r, j) => { proche(r.V[0], md[j].meff * 3, 1e-8); proche(r.V[2], r.F[2] + r.F[3] + r.F[4], 1e-8); });
  proche(B.rhoCQC(10, 10), 1, 1e-15); assert.ok(B.rhoCQC(10, 30) < 0.01);
  const srss = B.combiner(R.map(r => r.V), md.map(x => x.w), 'srss'), cqc = B.combiner(R.map(r => r.V), md.map(x => x.w), 'cqc');
  srss.forEach((v, i) => proche(cqc[i] / v, 1, 0.02));
});

test('règles du § 4.3.3.3 : modes retenus et indépendance', () => {
  const md = parts => parts.map((part, j) => ({ part, T: 1 / (j + 1) }));
  assert.equal(B.modesRetenus(md([0.7, 0.15, 0.06, 0.05, 0.04])).n, 3);
  assert.equal(B.modesRetenus(md([0.85, 0.04, 0.06, 0.05])).n, 3);
  assert.equal(B.modesRetenus(md([0.92, 0.04, 0.03, 0.01])).n, 1);
  assert.ok(B.independants([{ T: 1 }, { T: 0.9 }, { T: 0.5 }]));
  assert.ok(!B.independants([{ T: 1 }, { T: 0.95 }]));
  assert.ok(B.independants([{ T: 1 }, { T: 0.3 }, { T: 0.29 }], 2));
});

test('spectre de calcul de l\'EN 1998-1:2004 (3.13 à 3.16) : continuité, q, plancher β·ag', () => {
  for (const type of [1, 2]) for (const sol of ['A', 'B', 'C', 'D', 'E']) {
    const { S, TB, TC, TD } = Spectre.EC8_2004[type][sol], o = { type, sol, ag: 0.25, q: 3 };
    proche(Spectre.ec8Calcul(0, o), 0.25 * S * (2 / 3), 1e-12);
    for (const t of [TB, TC, TD]) proche(Spectre.ec8Calcul(t * (1 - 1e-12), o), Spectre.ec8Calcul(t * (1 + 1e-12), o), 1e-9, `${type}${sol} ${t}`);
    proche(Spectre.ec8Calcul(TC, o), (0.25 * S * 2.5) / 3, 1e-12);
    proche(Spectre.ec8Calcul(4, o), Math.max(0.25 * S * (2.5 / 3) * ((TC * TD) / 16), 0.05), 1e-12);
    proche(Spectre.ec8Calcul(4, { ...o, q: 6 }), 0.05, 1e-12);
    // q = 1 : identique au spectre élastique sur le palier et au-delà
    proche(Spectre.ec8Calcul(1.5, { ...o, q: 1 }), Spectre.ec8(1.5, o), 1e-12);
  }
});

test('calcul temporel : un étage = spectre de réponse ; Sd des modes = Spectre.reponse sur la grille fine', () => {
  const m = lire('modele_batiment.json'), acc = Float64Array.from(m.acc);
  const un = uniforme(1), md1 = B.modes(un), r1 = B.temporel(un, md1, acc, m.dt);
  const sp = Spectre.reponse(acc, m.dt, [md1[0].T], 0.05);
  proche(r1.uMax[0] / sp.Sd[0], 1, 1e-12); proche(r1.Sd[0] / sp.Sd[0], 1, 1e-12);
  // plusieurs modes : la grille fine commune (pas h) est celle du spectre de l'accélérogramme suréchantillonné
  const b = m.batiments[1], md = B.modes(b), r = B.temporel(b, md, acc, m.dt), s = Math.round(m.dt / r.h);
  const sps = Spectre.reponse(Spectre.surEchantillonner(acc, s), r.h, md.map(x => x.T), 0.05);
  r.Sd.forEach((x, j) => proche(x / sps.Sd[j], 1, 1e-12, `mode ${j + 1}`));
});

test('OpenSeesPy : périodes, participation, réponses modales, SRSS et CQC, calcul temporel', () => {
  const m = lire('modele_batiment.json'), ref = lire('batiment.json'), acc = Float64Array.from(m.acc);
  ref.batiments.forEach((o, ib) => {
    const b = m.batiments[ib], md = B.modes(b);
    md.forEach((x, j) => {
      proche(x.T / o.T[j], 1, 1e-12, `${b.nom} T${j + 1}`);
      proche(x.meff / o.meff[j], 1, 1e-12, `${b.nom} meff${j + 1}`);
    });
    const Sa = T => Spectre.ec8Calcul(T, m.spectre) * Spectre.G;
    for (const regle of ['srss', 'cqc']) {
      const s = B.spectrale(b, md, Sa, { regle });
      s.u.forEach((v, i) => proche(v / o[regle].u[i], 1, 1e-12, `${b.nom} ${regle} u${i}`));
      s.V.forEach((v, i) => proche(v / o[regle].V[i], 1, 1e-12, `${b.nom} ${regle} V${i}`));
    }
    const t = B.temporel(b, md, acc, m.dt);
    assert.equal(t.h, m.dt / b.sousPas);
    const top = t.u[b.m.length - 1], umax = Math.max(...top.map(Math.abs));
    o.toit.forEach((v, i) => proche(top[i], v, 1e-9 * umax, `${b.nom} toit ${i}`));
    t.VMax.forEach((v, i) => proche(v / o.VMax[i], 1, 1e-10, `${b.nom} Vmax${i}`));
  });
});
