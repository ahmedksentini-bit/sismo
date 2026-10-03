// Sismomètre (oscillateur à un degré de liberté) et inversion des hodochrones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import O from '../src/sismo/oscillateur.js';
import Rf from '../src/sismo/refraction.js';
import S from '../src/sismo/signal.js';

test('réponse en fréquence : déplacement au-dessus de f₀, accélération en dessous, résonance à f₀', () => {
  assert.ok(Math.abs(O.reponse(50, 1, 0.7).deplacement - 1) < 0.01);
  assert.ok(Math.abs(O.reponse(0.02, 1, 0.7).acceleration - 1) < 0.01);
  assert.ok(Math.abs(O.reponse(1, 1, 0.05).deplacement - 10) < 1e-9); // 1/(2ξ)
  assert.ok(Math.abs(O.reponse(1, 1, 0.7).phase + Math.PI / 2) < 1e-12);
});

test('Newmark : régime permanent conforme à la réponse en fréquence', () => {
  for (const [f, f0, xi] of [[5, 1, 0.7], [0.2, 2, 0.3], [1, 1, 0.1]]) {
    const dt = 0.001, n = Math.round(40 / dt), w = 2 * Math.PI * f, acc = new Float64Array(n);
    for (let i = 0; i < n; i++) acc[i] = -w * w * Math.sin(w * i * dt); // ug = sin(ωt)
    const { x } = O.integrer(acc, dt, f0, xi);
    let a = 0;
    for (let i = n - Math.round(4 / f / dt); i < n; i++) a = Math.max(a, Math.abs(x[i]));
    const attendu = O.reponse(f, f0, xi).deplacement;
    assert.ok(Math.abs(a / attendu - 1) < 0.02, `f ${f}, f₀ ${f0}, ξ ${xi} : ${a.toFixed(3)} au lieu de ${attendu.toFixed(3)}`);
  }
});

test('lâcher : oscillation libre à la pseudo-fréquence f₀√(1 − ξ²), décrément logarithmique 2πξ/√(1 − ξ²)', () => {
  const f0 = 2, xi = 0.05, dt = 0.0005, n = 8000;
  const { x } = O.integrer(new Float64Array(n), dt, f0, xi, 1, 0);
  const pics = [];
  for (let i = 1; i < n - 1; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 0) pics.push(i);
  const Td = (pics[3] - pics[0]) * dt / 3, attenduT = 1 / (f0 * Math.sqrt(1 - xi * xi));
  assert.ok(Math.abs(Td / attenduT - 1) < 0.01);
  const delta = Math.log(x[pics[0]] / x[pics[1]]), attenduD = (2 * Math.PI * xi) / Math.sqrt(1 - xi * xi);
  assert.ok(Math.abs(delta / attenduD - 1) < 0.03);
});

test('pas unique de l\'animation identique à l\'intégration complète', () => {
  const dt = 0.002, n = 2000, acc = new Float64Array(n);
  for (let i = 0; i < n; i++) acc[i] = Math.sin(0.03 * i) * Math.exp(-i / 800);
  const { x } = O.integrer(acc, dt, 1.5, 0.4);
  const e = { x: 0, v: 0 };
  for (let i = 0; i < n - 1; i++) O.pas(e, acc[i], acc[i + 1], dt, 1.5, 0.4);
  assert.ok(Math.abs(e.x - x[n - 1]) < 1e-12);
});

test('réfraction : intercept et épaisseur se répondent ; droite par deux points', () => {
  const H = S.MODELE.H, V1 = S.MODELE.vp1, V2 = S.MODELE.vp2, h = 10;
  const ti = Rf.intercept(V1, V2, H, h);
  assert.ok(Math.abs(Rf.epaisseur(V1, V2, ti, h) - H) < 1e-9);
  // Les temps de Pn du générateur sont sur la droite Δ/V₂ + tᵢ
  const p1 = { d: 200, t: S.temps(200, h).tPn }, p2 = { d: 350, t: S.temps(350, h).tPn };
  const dr = Rf.droite(p1, p2);
  assert.ok(Math.abs(dr.V - V2) < 1e-9 && Math.abs(dr.ti - ti) < 1e-9);
});

test('distance de croisement Pg / Pn cohérente avec le générateur', () => {
  const h = 10, V1 = S.MODELE.vp1, V2 = S.MODELE.vp2, ti = Rf.intercept(V1, V2, S.MODELE.H, h);
  const xc = Rf.croisement(V1, V2, ti, h);
  const a = S.temps(xc - 1, h), b = S.temps(xc + 1, h);
  assert.ok(a.tPg < a.tPn && b.tPn < b.tPg, `croisement ${xc.toFixed(1)} km`);
});
