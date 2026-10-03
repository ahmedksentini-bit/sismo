// Accélérogrammes synthétiques (causalité, calage sur les lois d'atténuation) et sélection : mise à
// l'échelle, choix et échanges gloutons, règles de l'EN 1998-1:2004 (§ 3.2.3.1.2 (4)).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Accelero from '../src/sismo/accelerogramme.js';
import Selection from '../src/sismo/selection.js';
import Calage from '../src/sismo/coefficients/accelerogrammes.js';
import Spectre from '../src/sismo/spectre.js';
import { residus, GRILLE } from '../tools/calage-accelerogrammes.mjs';

test('source à deux coins d\'Atkinson et Silva (2000)', () => {
  const s = Accelero.source(6);
  assert.ok(Math.abs(s.fa - Math.pow(10, 2.181 - 2.976)) < 1e-12 && Math.abs(s.fb - Math.pow(10, 2.41 - 2.448)) < 1e-12);
  assert.ok(Math.abs(s.eps - Math.pow(10, 0.605 - 1.53)) < 1e-12);
  // aux basses fréquences, le spectre d'accélération croît en f² (plateau du déplacement : M0)
  const A = Accelero.spectreFourier(6, 20).A, r = A(0.02) / A(0.01);
  assert.ok(Math.abs(r / 4 - 1) < 0.02, `pente basse fréquence ${r}`);
});

test('accélérogramme : reproductible, causal, vitesse finale nulle', () => {
  const a = Accelero.simuler({ M: 6.5, R: 20, graine: 7 }), b = Accelero.simuler({ M: 6.5, R: 20, graine: 7 });
  assert.deepEqual(Array.from(a.acc.slice(0, 2000)), Array.from(b.acc.slice(0, 2000)));
  // aucune énergie avant l'arrivée (1 s)
  for (let i = 0; i < 100; i++) assert.equal(a.acc[i], 0);
  // la vitesse revient à zéro : intégrale de l'accélération ≪ vitesse maximale
  let v = 0, vmax = 0;
  for (const x of a.acc) { v += x * a.dt; vmax = Math.max(vmax, Math.abs(v)); }
  assert.ok(Math.abs(v) < 0.02 * vmax, `vitesse finale ${v} contre ${vmax}`);
  // graines différentes : enregistrements différents
  assert.notEqual(Accelero.simuler({ M: 6.5, R: 20, graine: 8 }).acc[500], a.acc[500]);
});

// La correction spectrale est calée sur 12 graines par scénario ; d'autres graines doivent redonner la
// médiane des lois à mieux que 0,12 en ln à chaque période (≈ 13 %).
test('calage : la moyenne des spectres simulés suit la médiane des trois lois', () => {
  assert.ok(Calage.residus.every(r => Math.abs(r) < 0.03), 'résidus du calage');
  const r = residus(undefined, { ...GRILLE, graines: 2 }, 424242);
  r.forEach((v, k) => assert.ok(Math.abs(v) < 0.12, `T = ${Calage.periodes[k]} s : résidu ${v}`));
});

test('interpolation log-log, facteur et écart', () => {
  const v = Selection.interpoler([0.1, 1], [1, 0.1], [0.05, 0.1, Math.sqrt(0.1), 1, 2]);
  assert.deepEqual(v.map(x => +x.toFixed(12)), [1, 1, +Math.sqrt(0.1).toFixed(12), 0.1, 0.1]);
  const T = [0.1, 0.2, 0.5, 1], cible = [0.5, 0.6, 0.3, 0.1], ln = cible.map(Math.log), Sa = cible.map(x => 2 * x);
  const idx = Selection.plage(T, 0.2, 1);
  assert.deepEqual(idx, [1, 2, 3]);
  assert.ok(Math.abs(Selection.facteur(Sa, ln, idx) - 0.5) < 1e-12);
  assert.ok(Selection.ecart(Sa, 0.5, ln, idx) < 1e-12);
});

// Banque d'école : la cible déformée par des écarts connus ; les n enregistrements sans écart doivent sortir.
function banque(T, cible, u = 1) {
  const c = [];
  for (let i = 0; i < 40; i++) {
    const a = i < 5 ? 0 : 0.05 + 0.01 * i, s = 0.5 + (i % 7) * 0.2;
    c.push({ Sa: cible.map((x, k) => x * s * Math.exp(a * Math.sin(3 * k + i * u))), id: i });
  }
  return c;
}

test('sélection : enregistrements de même forme d\'abord, facteurs bornés, échanges gloutons', () => {
  const T = Spectre.periodes(20, 0.05, 3), cible = T.map(t => 0.3 / (1 + t)), ln = cible.map(Math.log);
  const c = banque(T, cible);
  const r = Selection.selectionner(c, { ln }, T, { n: 5, Tmin: 0.1, Tmax: 2 });
  assert.deepEqual(r.choisis.map(x => x.i).sort((a, b) => a - b), [0, 1, 2, 3, 4]);
  for (const x of r.choisis) assert.ok(x.e < 1e-12 && Math.abs(x.s * (0.5 + (x.i % 7) * 0.2) - 1) < 1e-12);
  // facteur maximal : les candidats à mettre à l'échelle de plus de 1,5 sont écartés
  const r2 = Selection.selectionner(c, { ln }, T, { n: 3, sMax: 1.5 });
  for (const x of r2.choisis) assert.ok(x.s <= 1.5 && x.s >= 1 / 1.5);
  // mise à l'échelle à T* : chaque spectre passe exactement par la cible à T*
  const k = 10, r3 = Selection.selectionner(c, { ln }, T, { n: 4, kStar: k });
  for (const x of r3.choisis) assert.ok(Math.abs(x.s * c[x.i].Sa[k] / cible[k] - 1) < 1e-12);
  // critère avec dispersion : les échanges ne l'augmentent jamais et améliorent l'écart type
  const sigma = T.map(() => 0.08), g = Selection.selectionner(c, { ln, sigma }, T, { n: 6, optimiser: false });
  const o = Selection.selectionner(c, { ln, sigma }, T, { n: 6 });
  assert.ok(o.critere <= g.critere && o.echanges > 0, `${o.critere} contre ${g.critere}`);
  // un filtre (scénario) restreint les candidats
  const f = Selection.selectionner(c, { ln }, T, { n: 3, admissible: x => x.id % 2 === 1 });
  assert.ok(f.choisis.every(x => c[x.i].id % 2 === 1));
  assert.equal(Selection.selectionner(c, { ln }, T, { n: 41 }), null);
});

test('EN 1998-1:2004 § 3.2.3.1.2 (4) : nombre, PGA moyen, 90 % du spectre sur [0,2·T1 ; 2·T1]', () => {
  const T = Spectre.periodes(30, 0.05, 4), ag = 0.2, sol = 'B', S = Spectre.EC8_2004[1][sol].S;
  const Se = T.map(t => Spectre.ec8(t, { type: 1, sol, ag }));
  // trois enregistrements : 95 %, 85 % et 100 % du spectre, PGA moyen 0,9·ag·S
  const jeu = [0.95, 0.85, 1].map(a => ({ Sa: Se.map(x => a * x), pga: 0.9 * ag * S }));
  const v = Selection.verifierEC8(jeu, T, Se, ag * S, 1);
  assert.ok(v.regles.nombre.ok && !v.regles.pga.ok);
  assert.ok(Math.abs(v.regles.spectre.rapportMin - 0.9333333333 / 0.9) < 1e-9 && v.regles.spectre.ok);
  assert.ok(!v.conforme && Math.abs(v.facteurConformite - 1 / 0.9) < 1e-12);
  assert.equal(v.reponse, 'plus défavorable');
  // mis à l'échelle par le facteur de conformité, le jeu respecte les trois règles
  const f = v.facteurConformite, w = Selection.verifierEC8(jeu.map(r => ({ Sa: r.Sa.map(x => f * x), pga: f * r.pga })), T, Se, ag * S, 1);
  assert.ok(w.conforme && Math.abs(w.pgaMoyen / (ag * S) - 1) < 1e-12);
  // la règle du spectre ne porte que sur [0,2·T1 ; 2·T1] : un creux à 3 s n'y entre pas pour T1 = 1 s
  const creux = jeu.map(r => ({ Sa: r.Sa.map((x, k) => (T[k] > 2.5 ? 0.1 * x : x)), pga: ag * S }));
  assert.ok(Selection.verifierEC8(creux, T, Se, ag * S, 1).conforme);
  assert.ok(!Selection.verifierEC8(creux, T, Se, ag * S, 1.5).regles.spectre.ok);
  // moins de 3 enregistrements : non conforme ; 7 et plus : la moyenne des réponses
  assert.ok(!Selection.verifierEC8(jeu.slice(0, 2), T, Se, ag * S, 1).conforme);
  assert.equal(Selection.verifierEC8([...jeu, ...jeu, jeu[0]], T, Se, ag * S, 1).reponse, 'moyenne');
});
