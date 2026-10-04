// Téléséismes (src/sismo/teleseisme.js) : causalité, temps des phases tirés de Globe (ak135, vérifié contre TauP),
// Ms mesurée sans bruit stable avec la distance et proche de Mw avant la saturation, foyer profond sans ondes de
// surface, lectures (Δ par S − P, profondeur par pP − P, heure d'origine) retrouvées à partir des temps vrais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import T from '../src/sismo/teleseisme.js';
import G from '../src/sismo/globe.js';
import Tables from '../src/sismo/tables.js';

const crete = (x, a = 0, b = x.length) => { let m = 0; for (let i = Math.max(0, a); i < Math.min(x.length, b); i++) m = Math.max(m, Math.abs(x[i])); return m; };

test('formule de Ms (IASPEI 2013) et période mesurée entre deux passages par zéro', () => {
  assert.ok(Math.abs(T.Ms(10000, 20, 50) - (Math.log10(500) + 1.66 * Math.log10(50) + 0.3)) < 1e-12);
  const dt = 0.05, x = Float64Array.from({ length: 4000 }, (_, i) => Math.sin((2 * Math.PI * i * dt) / 20 + 0.3));
  assert.ok(Math.abs(T.periodeAutour(x, 1210, dt) - 20) < 0.05);
});

test('aucune énergie avant la première P, arrivée nette ; temps des phases de Globe', () => {
  for (const [Mw, delta, h] of [[6.5, 60, 20], [7, 35, 150], [6.8, 120, 15]]) {
    const ev = T.generer({ Mw, delta, h, baz: 30, graine: 3 });
    const iP = Math.round((ev.tt.tP - ev.t0) / ev.dt);
    // la première P : P, ou une phase du noyau dans la zone d'ombre
    const prem = Math.min(...['P', 'PKIKP', 'PKiKP', 'PKP'].map(ph => Tables.premiere(ph, h, delta)).filter(t => t !== null));
    assert.equal(ev.tt.tP, prem);
    for (const a of ev.tt.phases) assert.ok(G.arrivees(a.phase, h, delta).some(b => Math.abs(b.temps - a.temps) < 1e-9), `${a.phase} : temps de Globe`);
    for (const c of ['Z', 'N', 'E']) {
      const v = ev.vit[c], a = ev.acc[c], tout = crete(v);
      assert.ok(crete(v, 0, iP - 20) < 1e-4 * tout, `Mw ${Mw} Δ ${delta}° ${c} : vitesse avant P`);
      assert.ok(crete(a, 0, iP - 20) < 1e-6 * crete(a), `Mw ${Mw} Δ ${delta}° ${c} : accélération avant P`);
      assert.ok(Math.abs(v[ev.n - 1]) < 1e-3 * tout, `${c} : la vitesse revient à zéro`);
    }
    // arrivée nette sur Z : 5 % de la crête de la fenêtre P atteints moins de 2 s après tP
    const z = ev.vit.Z, cP = crete(z, iP, iP + Math.round(20 / ev.dt));
    let i1 = iP - 20;
    while (Math.abs(z[i1]) < 0.05 * cP) i1++;
    assert.ok(Math.abs(i1 - iP) * ev.dt <= 2, `Mw ${Mw} Δ ${delta}° : arrivée visible à ${((i1 - iP) * ev.dt).toFixed(2)} s de tP`);
  }
});

test('Ms sans bruit : stable de 20° à 160°, proche de Mw, saturée au-delà de 7,5 ; foyer profond sans Ms', () => {
  for (const Mw of [6, 6.5, 7]) {
    const ms = [20, 45, 90, 140, 160].map(delta => T.msVraie(T.generer({ Mw, delta, h: 15, baz: 0, graine: 11 })));
    const v = ms.map(m => m.Ms), ecart = Math.max(...v) - Math.min(...v);
    assert.ok(ecart <= 0.25, `Mw ${Mw} : Ms varie de ${ecart.toFixed(2)} entre 20° et 160°`);
    for (const m of ms) {
      assert.ok(Math.abs(m.Ms - Mw) <= 0.35, `Mw ${Mw} : Ms − Mw = ${(m.Ms - Mw).toFixed(2)}`);
      assert.ok(m.T >= 16 && m.T <= 25, `période mesurée ${m.T.toFixed(1)} s`);
    }
  }
  const ms7 = T.msVraie(T.generer({ Mw: 7, delta: 60, h: 15, baz: 0, graine: 11 })).Ms, ms8 = T.msVraie(T.generer({ Mw: 8, delta: 60, h: 15, baz: 0, graine: 11 })).Ms;
  assert.ok(ms8 - ms7 < 1.2, `saturation : Ms(8) − Ms(7) = ${(ms8 - ms7).toFixed(2)}`);
  const profond = T.generer({ Mw: 7, delta: 60, h: 300, baz: 0, graine: 11 });
  assert.ok(T.msVraie(profond).Ms < 6, 'un foyer à 300 km rayonne peu d\'ondes de surface');
});

test('lectures : Δ par S − P, profondeur par pP − P et heure d\'origine retrouvées à partir des temps vrais', () => {
  for (const [delta, h] of [[45, 33], [70, 250], [85, 550]]) {
    const ev = T.generer({ Mw: 6.8, delta, h, baz: 100, graine: 5 });
    const pP = ev.tt.phases.find(a => a.phase === 'pP');
    const l = T.lire({ tP: ev.tt.tP - ev.t0, tS: ev.tt.tS - ev.t0, tpP: pP.temps - ev.t0 });
    assert.ok(Math.abs(l.distance - delta) < 0.3, `Δ ${delta}° : lu ${l.distance}`);
    assert.ok(Math.abs(l.hLu - h) < Math.max(5, 0.05 * h), `h ${h} km : lu ${l.hLu}`);
    assert.ok(Math.abs(l.t0 + ev.t0) < 1.5, `origine : ${l.t0} contre ${-ev.t0}`);
    // sans pP, le foyer est supposé à 33 km : juste pour un foyer superficiel, faux de plusieurs degrés pour un foyer
    // profond (S − P y est plus court), d'où la lecture de pP
    const s = T.lire({ tP: ev.tt.tP - ev.t0, tS: ev.tt.tS - ev.t0, tpP: null });
    assert.equal(s.hLu, null);
    if (h <= 60) assert.ok(Math.abs(s.distance - delta) < 0.5, `Δ ${delta}° sans pP : ${s.distance}`);
    else assert.ok(Math.abs(s.distance - delta) > 2 && Math.abs(l.distance - delta) < 0.3, `Δ ${delta}°, h ${h} km : sans pP ${s.distance}`);
  }
});

test('polarité vraie de la P : signe du premier mouvement de la verticale sans bruit', () => {
  for (const g of [1, 2, 3, 4, 5, 6]) {
    const ev = T.generer({ Mw: 6.5, delta: 55, h: 30, baz: 0, graine: g });
    if (!ev.verite.polariteLisible) continue;
    const z = ev.vit.Z, iP = Math.round((ev.tt.tP - ev.t0) / ev.dt), c = crete(z, iP, iP + Math.round(10 / ev.dt));
    let i = iP - 20;
    while (Math.abs(z[i]) < 0.1 * c) i++;
    assert.equal(Math.sign(z[i]), ev.verite.sP, `graine ${g}`);
  }
});
