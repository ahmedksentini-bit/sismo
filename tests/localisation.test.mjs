// Localisation par le réseau : recherche sur grille et diagramme de Wadati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import S from '../src/sismo/signal.js';

const STATIONS = [{ x: 0, y: 0 }, { x: 58, y: 22 }, { x: 22, y: -52 }, { x: -46, y: -14 }];
const pred = S.predicteur();
const lectures = (x, y, h, t0) => STATIONS.map(s => {
  const d = Math.hypot(x - s.x, y - s.y);
  return { tP: t0 + pred(d, h, 0), tS: t0 + pred(d, h, 1) };
});

test('pointés exacts : épicentre, profondeur et heure d\'origine retrouvés', () => {
  for (const [x, y, h] of [[16, -8, 10], [90, 50, 6], [-30, 40, 15]]) {
    const r = S.localiser(STATIONS, lectures(x, y, h, 3.2));
    assert.ok(Math.hypot(r.x - x, r.y - y) < 0.3, `épicentre (${x}, ${y}) : (${r.x.toFixed(1)}, ${r.y.toFixed(1)})`);
    assert.ok(Math.abs(r.h - h) < 0.5, `profondeur ${h} : ${r.h.toFixed(1)}`);
    assert.ok(Math.abs(r.t0 - 3.2) < 0.05);
  }
});

test('gap azimutal : petit dans le réseau, supérieur à 180° hors du réseau', () => {
  assert.ok(S.localiser(STATIONS, lectures(16, -8, 10, 0)).gap < 180);
  assert.ok(S.localiser(STATIONS, lectures(90, 50, 6, 0)).gap > 180);
});

test('trois stations avec P au moins, sinon pas de solution', () => {
  const l = lectures(16, -8, 10, 0);
  l[2] = { tP: null, tS: null }; l[3] = { tP: null, tS: null };
  assert.equal(S.localiser(STATIONS, l), null);
});

test('Wadati : Vp/Vs du modèle et heure d\'origine', () => {
  const w = S.wadati(lectures(16, -8, 10, 3.2));
  assert.ok(Math.abs(w.vpvs - S.MODELE.vp1 / S.MODELE.vs1) < 0.01);
  assert.ok(Math.abs(w.t0 - 3.2) < 0.05);
});
