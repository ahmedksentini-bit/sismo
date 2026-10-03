// Modèle géodésique : champ de vitesses, ajustement des taux de déformation, moments, loi équilibrée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import G from '../src/sismo/geodesie.js';
import Sismo from '../src/sismo/signal.js';

const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} contre ${b}`);

test('faille bloquée (Savage et Burford) : décalage s au loin, cisaillement s/(2πD) sur la trace', () => {
  const c = G.champDefaut(), { x, s, D } = c.faille;
  const ouest = G.vitesse(x - 1e9, 0, c).n, est = G.vitesse(x + 1e9, 0, c).n;
  proche(ouest - est, s, 1e-6, 'décalage dextre');
  // ε̇xy = ½ ∂vN/∂x = −s/(2πD) mm/an/km sur la trace → ns/an
  proche(G.deformation(x, 0, c).exy, -1000 * s / (2 * Math.PI * D), 1e-9);
  // dérivée numérique du champ = tenseur analytique
  const h = 1e-4, num = (G.vitesse(x + 5 + h, 0, c).n - G.vitesse(x + 5 - h, 0, c).n) / (2 * h);
  proche(G.deformation(x + 5, 0, c).exy, 500 * num, 1e-5);
});

test('bande de raccourcissement : ε̇xx uniforme = −V/largeur, nulle hors de la bande', () => {
  const c = G.champDefaut(), { x0, x1, V } = c.bande;
  proche(G.deformation((x0 + x1) / 2, 0, c).exx, -1000 * V / (x1 - x0), 1e-12);
  assert.equal(G.deformation(x1 + 1, 0, c).exx, 0);
  const carre = [[110, -20], [190, -20], [190, 40], [110, 40]];
  proche(G.deformationMoyenne(c, carre).exx, -1000 * V / (x1 - x0), 1e-9);
  proche(G.aire(carre), 80 * 60, 1e-9);
});

test('moindres carrés : un champ uniforme est retrouvé exactement, translation comprise', () => {
  const u = Sismo.aleatoire(3), L = { ee: -0.012, en: 0.004, ne: -0.006, nn: 0.002 }; // mm/an/km
  const st = Array.from({ length: 12 }, () => {
    const x = u.entre(0, 100), y = u.entre(0, 80), e = 3 + L.ee * x + L.en * y, n = -1 + L.ne * x + L.nn * y;
    return { x, y, e, n, eVrai: e, nVrai: n, sigma: 0.5 };
  });
  const aj = G.ajuster(st);
  proche(aj.exx, -12, 1e-9); proche(aj.eyy, 2, 1e-9); proche(aj.exy, (4 - 6) / 2, 1e-9); proche(aj.omega, (-6 - 4) / 2, 1e-9);
  proche(aj.chi2r, 0, 1e-12);
  assert.equal(G.ajuster(st.slice(0, 2)), null);
});

test('covariance de l\'ajustement conforme à la dispersion de tirages répétés', () => {
  const c = G.champDefaut(), poly = [[100, -80], [200, -80], [200, 100], [100, 100]];
  const base = G.genererReseau({ n: 120, sigma: 0.5, graine: 5 }).filter(s => G.dansPolygone(s.x, s.y, poly));
  const ref = G.ajuster(base), u = Sismo.aleatoire(9), tirs = [];
  for (let k = 0; k < 2000; k++) tirs.push(G.ajuster(base.map(s => ({ ...s, e: s.eVrai + 0.5 * u.gauss(), n: s.nVrai + 0.5 * u.gauss() }))));
  const ecart = f => { const v = tirs.map(f), m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };
  proche(ecart(t => t.exx) / Math.sqrt(ref.cov[0][0]), 1, 0.06, 'σ(exx)');
  proche(ecart(t => t.eyy) / Math.sqrt(ref.cov[1][1]), 1, 0.06, 'σ(eyy)');
  proche(ecart(t => t.exy) / Math.sqrt(ref.cov[2][2]), 1, 0.06, 'σ(exy)');
  // ε̇1h : propagation linéaire conforme aux tirages (signal fort devant le bruit)
  const sp = G.incertitudePrincipales(ref);
  proche(ecart(t => G.principales(t).e1h) / sp.e1h, 1, 0.08, 'σ(ε̇1h)');
  // sans bruit, la bande uniforme est retrouvée
  proche(G.ajuster(base, { vrai: true }).exx, -1000 * c.bande.V / (c.bande.x1 - c.bande.x0), 1e-9);
});

test('axes principaux : azimut du raccourcissement', () => {
  proche(G.principales({ exx: -20, eyy: 0, exy: 0 }).azimutRaccourcissement, 90, 1e-9, 'E–O');
  proche(G.principales({ exx: 0, eyy: -20, exy: 0 }).azimutRaccourcissement, 0, 1e-9, 'N–S');
  // cisaillement dextre sur une faille N–S : raccourcissement au N45°E
  proche(G.principales({ exx: 0, eyy: 0, exy: -5 }).azimutRaccourcissement, 45, 1e-9, 'dextre');
});

test('Kostrov : 2μHA·max(|ε̇1|, |ε̇2|, |ε̇1 + ε̇2|) ; une faille traversant la zone donne μ·L·H·s', () => {
  const opts = { mu: 3e10, H: 15, A: 1000 };
  proche(G.momentKostrov({ exx: -20, eyy: 0, exy: 0 }, opts) / (2 * 3e10 * 15e3 * 1e9 * 20e-9), 1, 1e-12);
  proche(G.momentKostrov({ exx: -10, eyy: -10, exy: 0 }, opts) / (2 * 3e10 * 15e3 * 1e9 * 20e-9), 1, 1e-12, 'isotrope : |ε̇1 + ε̇2|');
  // Zone rectangulaire de ±200 km autour d'une faille N–S de 60 km : la zone contient presque tout le
  // cisaillement (fraction (2/π)·arctan(200/D)) ; Kostrov retrouve le moment de la faille.
  const c = { ...G.champDefaut(), bande: { x0: 0, x1: 1, V: 0 } }, { x, s, D } = c.faille, L = 60;
  const rect = [[x - 200, 0], [x + 200, 0], [x + 200, L], [x - 200, L]];
  const k = G.momentKostrov(G.deformationMoyenne(c, rect), { mu: 3e10, H: 15, A: G.aire(rect) });
  const faille = G.momentFaille({ mu: 3e10, L, W: 15, s }) * (2 / Math.PI) * Math.atan(200 / D);
  proche(k / faille, 1, 1e-3);
});

test('magnitude de moment et loi équilibrée en moment', () => {
  proche(G.moment(6), Math.pow(10, 18.05), 1);
  proche(G.magnitude(G.moment(6.3)), 6.3, 1e-12);
  const l = { b: 0.9, mmin: 4, mmax: 7.3 }, a = G.aDepuisMoment({ ...l, moment: 3.3e17 });
  proche(G.momentGR({ ...l, a }) / 3.3e17, 1, 1e-12);
  // b = 1,5 : formule limite
  proche(G.momentGR({ a: G.aDepuisMoment({ moment: 1e16, b: 1.5, mmin: 4, mmax: 6 }), b: 1.5, mmin: 4, mmax: 6 }) / 1e16, 1, 1e-12);
  // la moitié du moment donne la moitié des séismes (a − log10 2)
  const z = G.bilanZone({ tenseur: { exx: -20, eyy: 0, exy: 0 }, A: 18000, chi: 0.5, ...l });
  proche(z.taux(5) / G.bilanZone({ tenseur: { exx: -20, eyy: 0, exy: 0 }, A: 18000, chi: 1, ...l }).taux(5), 0.5, 1e-12);
});

test('incertitude du moment : quand le bruit domine, la médiane est biaisée vers le haut', () => {
  const nul = { exx: 0, eyy: 0, exy: 0, cov: [[25, 0, 0], [0, 25, 0], [0, 0, 6.25]] };
  const t = G.momentTires(nul, { A: 10000 });
  assert.ok(t.q16 > 0 && t.q50 > t.q16 && t.q84 > t.q50);
  const fort = { exx: -200, eyy: 0, exy: 0, cov: nul.cov }, tf = G.momentTires(fort, { A: 10000 });
  proche(tf.q50 / G.momentKostrov(fort, { A: 10000 }), 1, 0.01, 'signal fort : sans biais');
});

test('modèle d\'école : le catalogue libère 30 % du moment géodésique de la zone A (la faille F porte le reste), 58 % de la zone B', () => {
  const zones = [[[-60, -40], [50, -55], [70, 35], [-15, 60], [-70, 20]], [[95, -90], [190, -70], [215, 50], [150, 120], [100, 80]]];
  const [mA, mB] = G.momentsVrais(zones);
  proche(G.momentGR({ a: Math.log10(0.25) + 4, b: 1, mmin: 4, mmax: 6.5 }) / mA, 0.30, 0.02);
  proche(G.momentGR({ a: Math.log10(1.2) + 3.6, b: 0.9, mmin: 4, mmax: 7.3 }) / mB, 0.58, 0.02);
});
