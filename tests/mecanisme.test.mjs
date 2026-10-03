// Mécanisme au foyer : double couple, plan auxiliaire, axes, rayonnement P, projection de Schmidt, émergence,
// inversion des polarités ; comparaison à ObsPy (tests/references/mecanisme.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Me from '../src/sismo/mecanisme.js';

const lire = nom => JSON.parse(readFileSync(new URL(`./references/${nom}`, import.meta.url), 'utf-8'));
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} contre ${b}`);
const dAng = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const egaux = (A, B, tol = 1e-12) => A.every((r, i) => r.every((v, j) => Math.abs(v - B[i][j]) <= tol));

test('double couple : trace nulle, valeurs propres 1, 0, −1, M = u·nᵀ + n·uᵀ', () => {
  for (const [s, d, r] of [[0, 45, -90], [33, 71, 12], [250, 40, 135]]) {
    const M = Me.tenseur(s, d, r), { n, u } = Me.vecteurs(s, d, r);
    proche(M[0][0] + M[1][1] + M[2][2], 0, 1e-15);
    const v = Me.propres(M).map(x => x.valeur);
    proche(v[0], 1, 1e-12); proche(v[1], 0, 1e-12); proche(v[2], -1, 1e-12);
    assert.ok(egaux(M, [0, 1, 2].map(i => [0, 1, 2].map(j => n[i] * u[j] + n[j] * u[i]))));
  }
  // faille normale à 45° de direction nord : axe P vertical, axe T horizontal est-ouest
  const ax = Me.axes(Me.tenseur(0, 45, -90));
  proche(ax.P.plongement, 90, 1e-6); proche(ax.T.plongement, 0, 1e-6); proche(dAng(ax.T.azimut, 90) % 180, 0, 1e-6);
  assert.deepEqual([-90, 90, 0, 180, -20, 160].map(Me.typeFaille), ['normale', 'inverse', 'décrochement', 'décrochement', 'décrochement', 'décrochement']);
});

const modele = lire('modele_mecanisme.json'), ref = lire('mecanisme.json');

test('ObsPy : plans nodaux (mt2plane), axes P, T, N (mt2axes) et rayonnement P (farfield)', () => {
  ref.mecanismes.forEach((o, k) => {
    const nom = `${o.azimut}/${o.pendage}/${o.glissement}`, M = Me.tenseur(o.azimut, o.pendage, o.glissement);
    assert.ok(egaux(M, modele.mecanismes[k].M, 1e-15));
    const aux = Me.planAuxiliaire(o.azimut, o.pendage, o.glissement);
    // le plan auxiliaire redonne le même tenseur, et le plan d'origine par l'opération inverse
    assert.ok(egaux(Me.tenseur(aux.azimut, aux.pendage, aux.glissement), M, 1e-12), `${nom} : auxiliaire`);
    const retour = Me.planAuxiliaire(aux.azimut, aux.pendage, aux.glissement);
    assert.ok(dAng(retour.azimut, o.azimut) < 1e-9 && Math.abs(retour.pendage - o.pendage) < 1e-9 && dAng(retour.glissement, o.glissement) < 1e-9);
    // aux_plane d'ObsPy : identique, sauf pour un plan auxiliaire vertical, où il choisit un glissement de
    // signe opposé (le tenseur n'est alors plus le même : écart d'ObsPy, pas du site)
    if (aux.pendage < 89.9) assert.ok(dAng(aux.azimut, o.auxiliaire[0]) < 1e-6 && Math.abs(aux.pendage - o.auxiliaire[1]) < 1e-6 && dAng(aux.glissement, o.auxiliaire[2]) < 1e-6, `${nom} : aux_plane`);
    // le premier plan d'ObsPy est l'un des deux plans du site
    const p1 = o.plan1;
    assert.ok([{ azimut: o.azimut, pendage: o.pendage, glissement: o.glissement }, aux].some(c => dAng(c.azimut, p1[0]) < 1e-6 && Math.abs(c.pendage - p1[1]) < 1e-6 && dAng(c.glissement, p1[2]) < 1e-6), `${nom} : mt2plane`);
    const ax = Me.axes(M);
    for (const a of ['T', 'N', 'P']) {
      const u = Me.direction(90 - ax[a].plongement, ax[a].azimut), v = Me.direction(90 - o.axes[a].plongement, o.axes[a].azimut);
      assert.ok(Math.acos(Math.min(1, Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) * 180 / Math.PI < 1e-5, `${nom} : axe ${a}`);
    }
    modele.rais.forEach(([i, p], j) => proche(Me.rayonnementP(M, i, p), o.rayonnement[j], 1e-12, `${nom} rai ${i}/${p}`));
  });
});

test('projection de Schmidt et émergence des rais (Pg montante, Pn descendante)', () => {
  assert.deepEqual(Me.projection(0, 37), { x: 0, y: 0 });
  const h = Me.projection(90, 90); proche(h.x, 1, 1e-12); proche(h.y, 0, 1e-12);
  const m = Me.projection(135, 0), a = Me.projection(45, 180); // rai montant vers le nord = point vers le sud
  proche(m.x, a.x, 1e-12); proche(m.y, a.y, 1e-12);
  const r = Me.projectionInverse(0.3, -0.5), q = Me.projection(r.i, r.phi);
  proche(q.x, 0.3, 1e-12); proche(q.y, -0.5, 1e-12);
  assert.equal(Me.projectionInverse(0.9, 0.9), null);
  const proche1 = Me.emergence(20, 10), loin = Me.emergence(250, 10);
  assert.equal(proche1.onde, 'Pg'); assert.ok(proche1.i > 90);
  proche(proche1.i, 180 - Math.atan2(20, 10) * 180 / Math.PI, 1e-12);
  assert.equal(loin.onde, 'Pn'); proche(loin.i, Math.asin(6 / 8) * 180 / Math.PI, 1e-12);
});

test('inversion : polarités exactes d\'un réseau bien réparti, aucun désaccord et axes retrouvés', () => {
  const vrai = { azimut: 40, pendage: 60, glissement: -80 }, stations = [];
  for (let k = 0; k < 24; k++) { const az = (k * 360) / 24 + 7, delta = 15 + ((k * 37) % 180); stations.push({ az, ...Me.emergence(delta, 10) }); }
  const lectures = Me.polarites(vrai, stations);
  assert.equal(Me.desaccords(vrai, lectures), 0);
  const inv = Me.inverser(lectures, 10);
  assert.equal(inv.desaccords, 0);
  assert.ok(inv.solutions.length > 0);
  // la vraie solution (sur la grille) en fait partie ; toutes ont leurs axes P et T proches des vrais
  assert.ok(inv.solutions.some(s => s.azimut === 40 && s.pendage === 60 && s.glissement === -80));
  assert.ok(inv.solutions.every(s => Me.ecartAxes(s, vrai) < 35), 'axes P et T');
  // une polarité inversée : au plus un désaccord
  const bruitees = lectures.map((l, k) => (k === 3 ? { ...l, polarite: -l.polarite } : l));
  assert.ok(Me.inverser(bruitees, 10).desaccords <= 1);
});
