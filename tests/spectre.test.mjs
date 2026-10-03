// Spectre de réponse et spectre élastique de l'Eurocode 8 (EN 1998-1:2004).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Sp from '../src/sismo/spectre.js';
import S from '../src/sismo/signal.js';

test('sinus de 1 m/s² à 1 Hz : Sa = 10 m/s² à la résonance (ξ = 5 %), Sa → PGA en courte période', () => {
  const dt = 0.01, n = 6000, acc = new Float64Array(n);
  for (let i = 0; i < n; i++) acc[i] = Math.sin(2 * Math.PI * i * dt);
  const r = Sp.reponse(acc, dt, [0.02, 1], 0.05);
  assert.ok(Math.abs(r.Sa[1] / 10 - 1) < 0.03, `Sa(1 s) = ${r.Sa[1].toFixed(2)}`);
  assert.ok(Math.abs(r.Sa[0] - 1) < 0.02, `Sa(0,02 s) = ${r.Sa[0].toFixed(3)}`);
});

test('accélérogramme simulé : Sa en très courte période égale au PGA', () => {
  const ev = S.generer({ Mw: 5.5, delta: 20, h: 10, baz: 40, graine: 3 });
  let pga = 0;
  for (const v of ev.acc.N) pga = Math.max(pga, Math.abs(v));
  const r = Sp.reponse(ev.acc.N, ev.dt, [0.02], 0.05);
  assert.ok(Math.abs(r.Sa[0] / pga - 1) < 0.05, `Sa(0,02 s) / PGA = ${(r.Sa[0] / pga).toFixed(3)}`);
});

test('calcul progressif identique au calcul d\'un bloc', () => {
  const ev = S.generer({ Mw: 5, delta: 30, h: 10, baz: 40, graine: 4 }), T = [0.05, 0.3, 1.5];
  const bloc = Sp.reponse(ev.acc.N, ev.dt, T, 0.05), p = Sp.progressif(T, 0.05, ev.dt);
  for (let i = 0; i < ev.n - 1; i++) p.avancer(ev.acc.N[i], ev.acc.N[i + 1]);
  T.forEach((_, k) => assert.ok(Math.abs(p.Sd[k] / bloc.Sd[k] - 1) < 1e-9));
});

test('EC8 : points du spectre élastique et correction d\'amortissement', () => {
  const ag = 1;
  assert.equal(Sp.ec8(0, { type: 1, sol: 'C', ag }), 1.15);
  assert.ok(Math.abs(Sp.ec8(0.3, { type: 1, sol: 'C', ag }) - 2.875) < 1e-12);
  assert.ok(Math.abs(Sp.ec8(1, { type: 1, sol: 'C', ag }) - 1.725) < 1e-12);
  assert.ok(Math.abs(Sp.ec8(3, { type: 1, sol: 'C', ag }) - 1.15 * 2.5 * 0.6 * 2 / 9) < 1e-12);
  assert.ok(Math.abs(Sp.ec8(0.2, { type: 2, sol: 'D', ag }) - 1.8 * 2.5) < 1e-12);
  assert.ok(Math.abs(Sp.eta(0.10) - Math.sqrt(10 / 15)) < 1e-12);
  assert.equal(Sp.eta(0.5), 0.55);
});

test('période approchée T₁ = Ct·H^(3/4)', () => {
  assert.ok(Math.abs(Sp.periodeApprochee(16, 'beton') - 0.075 * 8) < 1e-12);
});
