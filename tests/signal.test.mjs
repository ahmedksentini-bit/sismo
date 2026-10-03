// Invariants du générateur de sismogrammes : calage de ML, causalité, saturation, ordres de grandeur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import S from '../src/sismo/signal.js';

const moyenne = a => a.reduce((s, x) => s + x, 0) / a.length;
const mlVraie = (Mw, delta, graines = [1, 2, 3]) =>
  moyenne(graines.map(graine => S.mlVraie(S.generer({ Mw, delta, h: 10, baz: 40, graine })).ML));
const pga = (Mw, delta) => {
  const ev = S.generer({ Mw, delta, h: 10, baz: 40, graine: 1 });
  let a = 0;
  for (const c of ['N', 'E']) for (const v of ev.acc[c]) a = Math.max(a, Math.abs(v));
  return a / 9.81;
};

test('formule IASPEI : 1 mm sur un Wood-Anderson (×2080) à 100 km donne ML = 3', () => {
  assert.ok(Math.abs(S.ML(1e6 / S.WA.gain, 100) - 3) < 0.01);
});

test('ML mesurée sur le signal sans bruit : stable avec la distance, proche de Mw', () => {
  for (const Mw of [3, 4, 5]) {
    const ml = [20, 80, 250].map(d => mlVraie(Mw, d));
    const ecart = Math.max(...ml) - Math.min(...ml);
    assert.ok(ecart <= 0.4, `Mw ${Mw} : ML varie de ${ecart.toFixed(2)} entre 20 et 250 km`);
    for (const m of ml) assert.ok(m - Mw > -0.2 && m - Mw < 0.7, `Mw ${Mw} : ML − Mw = ${(m - Mw).toFixed(2)}`);
  }
});

test('aucune énergie avant l\'arrivée P, arrivée nette', () => {
  for (const [Mw, delta] of [[3, 40], [4, 120], [5, 20]]) {
    const ev = S.generer({ Mw, delta, h: 10, baz: 200, graine: 5 });
    const iP = Math.round((ev.tt.tP - ev.t0) / ev.dt), z = ev.vit.Z;
    let crete = 0, avant = 0;
    for (let i = 0; i < ev.n; i++) crete = Math.max(crete, Math.abs(z[i]));
    for (let i = 0; i < iP - 50; i++) avant = Math.max(avant, Math.abs(z[i]));
    assert.ok(avant < 2e-3 * crete, `Mw ${Mw} à ${delta} km : ${(avant / crete).toExponential(1)} de la crête avant P`);
    let i1 = iP - 50;
    while (Math.abs(z[i1]) < 0.02 * crete) i1++;
    assert.ok(Math.abs(i1 - iP) * ev.dt <= 0.3, `arrivée visible à ${((i1 - iP) * ev.dt).toFixed(2)} s de tP`);
  }
});

test('accélérations maximales plausibles (rocher)', () => {
  const a5 = pga(5, 10), a6 = pga(6, 10);
  assert.ok(a5 > 0.02 && a5 < 0.15, `M5 à 10 km : ${a5.toFixed(3)} g`);
  assert.ok(a6 > 0.08 && a6 < 0.4, `M6 à 10 km : ${a6.toFixed(3)} g`);
  assert.ok(pga(5, 100) < a5 / 5, 'décroissance avec la distance');
});

test('le vélocimètre sature en champ proche, l\'accéléromètre non', () => {
  const ev = S.generer({ Mw: 5, delta: 20, h: 10, baz: 40, graine: 7 });
  const hh = S.enregistrer(ev, 'HH', 'standard', 1), hn = S.enregistrer(ev, 'HN', 'standard', 1);
  assert.ok(hh.sature.N + hh.sature.E > 0);
  assert.equal(hn.sature.N + hn.sature.E + hn.sature.Z, 0);
});

test('filtre de Butterworth : −3 dB aux fréquences de coupure', () => {
  const H = S.passeBande(1, 10, 2), mod = f => Math.hypot(...H(f));
  assert.ok(Math.abs(mod(3.16) - 1) < 0.03);
  assert.ok(Math.abs(mod(1) - Math.SQRT1_2) < 0.06 && Math.abs(mod(10) - Math.SQRT1_2) < 0.06);
});

test('azimut de la source par le mouvement de la P (pointé exact)', () => {
  for (const baz of [10, 95, 200, 300]) {
    const ev = S.generer({ Mw: 3.5, delta: 50, h: 10, baz, graine: 11 });
    const rec = S.enregistrer(ev, 'HH', 'standard', 5), f = [1, 10];
    const [z, n, e] = ['Z', 'N', 'E'].map(c => S.convertir(rec.series[c], ev.dt, 'HH', 'vitesse', f));
    const i0 = Math.round((ev.tt.tP - ev.t0) / ev.dt) - 3, i1 = i0 + 63;
    const r = S.azimutP(z.subarray(i0, i1), n.subarray(i0, i1), e.subarray(i0, i1));
    const err = Math.abs(((r.baz - baz + 540) % 360) - 180);
    assert.ok(err <= 15, `azimut ${baz}° : estimé ${r.baz.toFixed(0)}°`);
  }
});
