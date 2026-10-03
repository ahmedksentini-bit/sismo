// Source sismique par le spectre des ondes S : relations de Brune, ajustement exact sur un spectre théorique,
// et paramètres retrouvés sur les enregistrements du générateur (la vérité est celle du générateur).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Source from '../src/sismo/source.js';
import Sismo from '../src/sismo/signal.js';

const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} contre ${b}`);

test('relations de Brune : Mw et Δσ inverses de celles du générateur', () => {
  for (const Mw of [3.5, 5, 6.2]) {
    const s = Sismo.source(Mw, Sismo.MODELE.vs1, Sismo.MODELE.dsigma);
    proche(Source.magnitude(s.M0), Mw, 1e-12);
    proche(Source.chuteContrainte(s.M0, s.fc), Sismo.MODELE.dsigma / 10, 1e-9, 'Δσ (MPa)');
  }
});

test('ajustement : Ω0 et fc exacts sur un spectre de Brune théorique', () => {
  const bandes = [];
  for (let f = 0.1; f < 15; f *= Math.pow(2, 1 / 6)) bandes.push([f, 3e-4 / (1 + (f / 1.7) ** 2)]);
  const a = Source.ajusterBrune(bandes, { pas: 0.001 });
  proche(a.fc / 1.7, 1, 0.002); proche(a.omega0 / 3e-4, 1, 0.002); assert.ok(a.rms < 1e-3);
  proche(Source.ecartBrune(bandes, 3e-4, 1.7), 0, 1e-12);
});

// Spectres corrigés de quatre stations (30 à 140 km) : Mw moyen à ±0,15, Δσ à un facteur 2 près (log), et
// la fréquence coin baisse quand la magnitude monte.
test('générateur : Mw et Δσ retrouvés, moyenne de quatre stations', () => {
  const fcs = [];
  for (const [Mw, g] of [[4, 3], [5, 5], [5.8, 11]]) {
    const r = [30, 60, 100, 140].map((d, k) => Source.analyser(Sismo.generer({ Mw, delta: d, h: 10, baz: 30 + 70 * k, graine: g * 100 + k })));
    const mw = r.reduce((s, x) => s + x.Mw, 0) / r.length, ds = Math.exp(r.reduce((s, x) => s + Math.log(x.dsigma), 0) / r.length);
    proche(mw, Mw, 0.15, `Mw ${Mw}`);
    const vrai = Sismo.MODELE.dsigma / 10;
    assert.ok(ds > vrai / 2 && ds < vrai * 2, `Δσ ${ds} MPa pour ${vrai} MPa`);
    fcs.push(Math.exp(r.reduce((s, x) => s + Math.log(x.fc), 0) / r.length));
  }
  assert.ok(fcs[0] > fcs[1] && fcs[1] > fcs[2]);
});
