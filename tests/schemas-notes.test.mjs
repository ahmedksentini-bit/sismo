// Schémas des notes de calcul (src/schemas-notes.js) : chaque figure se dessine sans valeur manquante, y compris
// dans les cas limites, et ce qu'elle chiffre est ce que calcule la note ; chaque figure sert à un calculateur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as N from '../src/schemas-notes.js';
import { noteCalcul } from '../src/ui.js';
import Spectre from '../src/sismo/spectre.js';
import Geodesie from '../src/sismo/geodesie.js';
import Sismo from '../src/sismo/signal.js';

const texte = (s) => s.replace(/<[^>]+>/g, '').replace(/[  ]/g, ' ');
const propre = (nom, s) => {
  assert.ok(s.startsWith('<svg') && s.endsWith('</svg>'), nom);
  assert.ok(!/NaN|undefined|Infinity|null/.test(s), `${nom} : valeur manquante`);
  return texte(s);
};
const se = (T) => Spectre.ec8(T, { type: 1, sol: 'C', ag: 0.2 });

test('chaque schéma se dessine, cas courants et cas limites', () => {
  const cas = {
    raisCroute: [{ V1: 6, V2: 8, H: 32, h: 10, delta: 50 }, { V1: 6, V2: 8, H: 32, h: 0, delta: 5 }, { V1: 0.5, V2: 2, H: 8, delta: 21, xc: 21, unite: 'm', uniteT: 'ms' }],
    heureOrigine: [{ tP: 12.3, tS: 18.4, Vp: 6, Vs: 3.5, t0: 3.7, R: 51.2 }, { tP: 2, tS: 10, Vp: 6, Vs: 3.5, t0: -9.2, R: 67 }],
    rosaceAzimuts: [{ stations: [{ nom: 'A', az: 10, d: 30 }, { nom: 'B', az: 130, d: 40 }, { nom: 'C', az: 250, d: 50 }] }, { stations: [{ nom: 'A', az: 250, d: 130 }, { nom: 'B', az: 251, d: 180 }] }],
    triangleProfondeur: [{ D: 12, h: 10, R: 15.6, Rm: 14.8, Rp: 16.4 }, { D: 60, h: 10, R: 60.8, Rm: 59.9, Rp: 61.6 }, { D: 0, h: 15, R: 15, Rm: 14, Rp: 16 }],
    failleLocale: [{ phi: 35, delta: 50, lambda: 60 }, { phi: 0, delta: 90, lambda: 0 }, { phi: 360, delta: 1, lambda: -180 }],
    departs: [{ h: 10, H: 32, rais: [{ nom: 'a', delta: 22, i: 155 }, { nom: 'b', delta: 140, i: 48.6 }] }],
    ruptureMoment: [{ L: 20, W: 10, D: 1, Awc: 140, M0: 6e18, Mw: 6.48 }, { L: 300, W: 1, D: 5, Awc: 2500, M0: 6.7e20, Mw: 7.85 }],
    instrument: [{ f0: 50, xi: 0.7, fs: 2, theo: 0.0016 }, { f0: 1, xi: 0.05, fs: 1, theo: 10 }, { f0: 1, xi: 0.7, fs: 1e-3, theo: 1e-6 }],
    pPgeometrie: [{ h: 120, i: 24, v: 7.2, retard: 31.5 }, { h: 1, i: 40, v: 5.8 }],
    branchesEC8: [{ courbe: se, TB: 0.2, TC: 0.6, TD: 2, T: 0.75 }, { courbe: se, elastique: se, TB: 0.2, TC: 0.6, TD: 2, T: 4, plancher: 0.04, nom: 'Sd' }],
    fenetresGK: [{ M: 6.5, L: 61, T: 885, evenements: [{ dt: 3, r: 10, M: 4 }, { dt: 2000, r: 100, M: 3 }, { dt: 1e-4, r: 1, M: 3 }] }],
    poissonCourbe: [{ lt: 0.105, P: 0.1 }, { lt: 12, P: 1 - Math.exp(-12) }],
    failleBloquee: [{ s: 20, D: 15, L: 100, M0: 9e17 }],
    mohrDeformation: [{ exx: -60, eyy: 10, exy: 25, e1: -68.2, e2: 18.2, az: 160 }, { exx: -10, eyy: 0, exy: 0, e1: -10, e2: 0, az: 90 }, { exx: -50, eyy: -50, exy: 0, e1: -50, e2: -50, az: 0 }],
    gaussienne: [{ eps: 0.62, P: 0.268, med: 0.17, sigma: 0.65, y: 0.25 }, { eps: 5, P: 0, med: 0.17, sigma: 0.65, y: 3 }, { eps: -5, P: 1, med: 0.17, sigma: 0.65, y: 0.001 }],
    zonePSHA: [{ polygone: [[-10, -10], [10, -10], [10, 10], [-10, 10]], points: [{ x: 0, y: 5 }], ex: { x: 0, y: 5 } }],
    colonneVs30: [{ couches: [{ h: 4, vs: 160 }, { h: 30, vs: 300 }], vr: 1200, vs30: 280, classe: 'C' }, { couches: [{ h: 3, vs: 150 }], vr: 1100, vs30: 600, classe: 'B' }],
    contraintesSPT: [{ z: 6, gwl: 1.5 }, { z: 6, gwl: 0 }],
    forceDeplacement: [{ Sa: 0.8, R: 4, uy: 8, umax: 35, sdEl: 31, alpha: 0.05 }, { Sa: 0.8, R: 1, uy: 31, umax: 31, sdEl: 31 }],
    reglesRmu: [{ R: 4 }, { R: 1 }],
    consoleModele: [{ m: [200], k: [2e5] }, { m: Array(30).fill(200), k: Array(30).fill(2e5) }],
    forcesEtages: [{ z: [3, 6], F: [10, 20], Fb: 30 }, { z: Array.from({ length: 30 }, (_, i) => 3 * i + 3), F: Array.from({ length: 30 }, (_, i) => i + 1), Fb: 465 }],
    n2ADRS: [{ se, Ts: 0.45, TC: 0.6, dy: 0.01208, ay: 0.24, de: 0.0289, dt: 0.0345, sae: 0.575 }],
    boucleIsolateur: [{ K1: 30000, K2: 3000, Q: 300, dy: 0.01, d: 0.15, F: 750 }, { K1: 30000, K2: 3000, Q: 300, dy: 0.01, d: 0.005, F: 150 }],
  };
  const fonctions = Object.keys(N).filter((k) => k !== 'natureMecanisme');
  assert.deepEqual(fonctions.sort(), Object.keys(cas).sort());
  for (const [nom, liste] of Object.entries(cas)) for (const p of liste) propre(nom, N[nom](p));
});

test('les chiffres des schémas sont ceux des formules de la note', () => {
  // rais : distance critique (2H − h)·tan ic et temps de Pn
  const ic = Math.asin(6 / 8), r = propre('raisCroute', N.raisCroute({ V1: 6, V2: 8, H: 32, h: 10, delta: 200 }));
  assert.ok(r.includes(`= ${(54 * Math.tan(ic)).toLocaleString('fr-FR', { maximumSignificantDigits: 3 })} km`));
  assert.ok(r.includes(`Δ/V₂ + tᵢ = 25,00 + ${((54 * Math.cos(ic)) / 6).toFixed(2).replace('.', ',')}`));
  // profondeur : h− et h+ sur les arcs R ± 8,4·e
  const t = propre('triangleProfondeur', N.triangleProfondeur({ D: 12, h: 10, R: Math.hypot(12, 10), Rm: Math.hypot(12, 10) - 0.84, Rp: Math.hypot(12, 10) + 0.84 }));
  assert.ok(t.includes(`h− = ${Math.sqrt((Math.hypot(12, 10) - 0.84) ** 2 - 144).toLocaleString('fr-FR', { maximumSignificantDigits: 3 })} km`));
  // pP : chemin en plus 2h·cos i / v
  assert.ok(propre('pP', N.pPgeometrie({ h: 100, i: 30, v: 7 })).includes(`= ${((200 * Math.cos(Math.PI / 6)) / 7).toFixed(1).replace('.', ',')} s`));
  // lacune : plus grand écart entre azimuts voisins, comme la localisation
  const st = [{ nom: 'SIM1', x: 0, y: 0 }, { nom: 'SIM2', x: 58, y: 22 }, { nom: 'SIM3', x: 22, y: -52 }, { nom: 'SIM4', x: -46, y: -14 }];
  const L = Sismo.localiser(st, st.map((s) => { const tt = Sismo.temps(Math.hypot(80 - s.x, 30 - s.y), 10); return { tP: 4 + tt.tP, tS: 4 + tt.tSg }; }));
  const ro = propre('rosace', N.rosaceAzimuts({ stations: st.map((s) => ({ nom: s.nom, az: (Math.atan2(s.x - L.x, s.y - L.y) * 180) / Math.PI, d: Math.hypot(s.x - L.x, s.y - L.y) })) }));
  assert.ok(ro.includes(`${Math.round(L.gap)}° (de`), `lacune ${L.gap}`);
  // Mohr : taux principaux du solveur de géodésie
  const P = Geodesie.principales({ exx: -60, eyy: 10, exy: 25 });
  const mo = propre('mohr', N.mohrDeformation({ exx: -60, eyy: 10, exy: 25, e1: P.e1h, e2: P.e2h, az: P.azimutRaccourcissement }));
  assert.ok(mo.includes(`c = −25`) && mo.includes(`r = ${Math.hypot(35, 25).toLocaleString('fr-FR', { maximumSignificantDigits: 3 })}`));
  assert.ok(Math.abs(P.e1h - (-25 - Math.hypot(35, 25))) < 1e-9 && Math.abs(P.e2h - (-25 + Math.hypot(35, 25))) < 1e-9);
  // isolateur : Q lu sur la boucle à déplacement nul ; règles R–μ : (R² + 1)/2
  assert.ok(propre('boucle', N.boucleIsolateur({ K1: 30000, K2: 3000, Q: 300, dy: 0.01, d: 0.15, F: 750 })).includes('Q = 300 kN'));
  assert.ok(propre('regles', N.reglesRmu({ R: 4 })).includes('μ = (R² + 1)/2 = 8,5'));
  // nature du mécanisme d'après λ
  assert.equal(N.natureMecanisme(60), 'faille inverse à composante de décrochement');
  assert.equal(N.natureMecanisme(-90), 'faille normale pure');
  assert.equal(N.natureMecanisme(180), 'décrochement dextre');
  assert.equal(N.natureMecanisme(-20), 'décrochement sénestre à composante normale');
});

test('la note place le schéma sous son étape ; chaque schéma sert à un calculateur', () => {
  const h = noteCalcul({ etapes: [{ titre: 'Étape', calcul: 'x = 1', schema: '<svg viewBox="0 0 10 10"></svg>', legende: 'Légende.' }, { titre: 'Sans', calcul: 'y' }] });
  assert.ok(h.includes('<span class="nc-calcul">x = 1</span><figure class="nc-schema"><svg viewBox="0 0 10 10"></svg><figcaption>Légende.</figcaption></figure></li>'));
  assert.equal(h.split('<figure').length - 1, 1);
  const sources = Array.from({ length: 17 }, (_, i) => readFileSync(new URL(`../src/cours-ch${i + 1}.js`, import.meta.url), 'utf-8')).join('\n');
  for (const nom of Object.keys(N).filter((k) => k !== 'natureMecanisme')) assert.ok(new RegExp(`schema: (\\w+ \\? )?${nom}\\(`).test(sources), `${nom} inutilisé`);
  // une légende accompagne chaque schéma
  const n = (sources.match(/schema: /g) || []).length;
  assert.ok(n >= 28, `${n} schémas`);
  assert.equal((sources.match(/legende: /g) || []).length, n);
});
