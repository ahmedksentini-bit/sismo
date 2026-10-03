// Isolignes par carrés marchants : cercle d'un champ radial, cas de selle, niveaux ronds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import I from '../src/sismo/isolignes.js';

test('isoligne d\'un champ radial : un cercle, à moins d\'un centième de maille', () => {
  const nx = 41, ny = 31, v = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v.push(Math.hypot(i - 20, j - 15));
  const s = I.segments(v, nx, ny, 10);
  assert.ok(s.length > 60);
  for (const seg of s) for (const [x, y] of seg) assert.ok(Math.abs(Math.hypot(x - 20, y - 15) - 10) < 0.01);
  // champ linéaire : isoligne droite exacte, et rien hors du champ ou aux valeurs non finies
  const w = [];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) w.push(i);
  for (const seg of I.segments(w, 6, 5, 2.5)) for (const [x] of seg) assert.ok(Math.abs(x - 2.5) < 1e-12);
  assert.equal(I.segments(w, 6, 5, 9).length, 0);
  assert.equal(I.segments([NaN, 1, 2, 3], 2, 2, 1.5).length, 0);
});

test('maille en selle : deux segments, tranchés par la moyenne des coins', () => {
  // coins 0 et 2 hauts, 1 et 3 bas
  const haut = I.segments([1, 0, 0, 1], 2, 2, 0.5);   // v(0,0)=1, v(1,0)=0, v(0,1)=0, v(1,1)=1 ; centre = 0,5 ≥ 0,5
  assert.equal(haut.length, 2);
  const bas = I.segments([1, 0, 0, 1], 2, 2, 0.6);
  assert.equal(bas.length, 2);
  assert.notDeepEqual(haut.map(s => s.map(p => p.map(x => +x.toFixed(3)))), bas.map(s => s.map(p => p.map(x => +x.toFixed(3)))));
});

test('niveaux ronds entre deux bornes', () => {
  assert.deepEqual(I.niveauxRonds(0.03, 0.4), [0.05, 0.07, 0.1, 0.15, 0.2, 0.3]);
  const n = I.niveauxRonds(0.001, 3, 6);
  assert.ok(n.length <= 6 && n.every((v, k) => k === 0 || v > n[k - 1]) && n[0] > 0.001 && n[n.length - 1] < 3);
});
