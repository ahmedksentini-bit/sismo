// Moteur PSHA : briques élémentaires, puis comparaison complète à OpenQuake (tests/references/psha.json,
// produit par tools/oq/psha.py sur le modèle de tests/references/modele_psha.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Psha from '../src/sismo/psha.js';
import Geodesie from '../src/sismo/geodesie.js';

const lire = nom => JSON.parse(readFileSync(new URL(`./references/${nom}`, import.meta.url), 'utf-8'));

test('erfc et loi normale tronquée', () => {
  // Valeurs de référence : erf(0,5), erf(1), erfc(2), erfc(3) (Abramowitz et Stegun, 15 chiffres)
  assert.ok(Math.abs(1 - Psha.erfc(0.5) - 0.520499877813047) < 1e-14);
  assert.ok(Math.abs(1 - Psha.erfc(1) - 0.842700792949715) < 1e-14);
  assert.ok(Math.abs(Psha.erfc(2) / 4.67773498104727e-3 - 1) < 1e-12);
  assert.ok(Math.abs(Psha.erfc(3) / 2.20904969985854e-5 - 1) < 1e-12);
  assert.ok(Math.abs(Psha.Phi(-1.96) - 0.0249978951482204) < 1e-14);
  // Troncature à ±3σ : symétrie, bornes, et la queue au-delà de 3σ est nulle
  assert.equal(Psha.survie(-3, 3), 1);
  assert.equal(Psha.survie(3, 3), 0);
  assert.ok(Math.abs(Psha.survie(0, 3) - 0.5) < 1e-15);
  assert.ok(Math.abs(Psha.survie(1, 3) + Psha.survie(-1, 3) - 1) < 1e-15);
  const sf = Psha.tableSurvie(3);
  for (let z = -3.2; z <= 3.2; z += 0.0137) assert.ok(Math.abs(sf(z) - Psha.survie(z, 3)) < 1e-7);
});

test('Gutenberg-Richter tronquée par classes (comme TruncatedGRMFD)', () => {
  const mfd = Psha.mfdGR({ a: 4, b: 1, mmin: 4, mmax: 6.5 });
  assert.equal(mfd.length, 25);
  assert.ok(Math.abs(mfd[0].M - 4.05) < 1e-12 && Math.abs(mfd[24].M - 6.45) < 1e-9);
  // La somme des classes est le taux entre Mmin et Mmax
  const total = mfd.reduce((s, c) => s + c.taux, 0);
  assert.ok(Math.abs(total - (10 ** (4 - 4) - 10 ** (4 - 6.5))) < 1e-12);
  // Mmax non multiple du pas : arrondi au pas, comme hazardlib (6,26 → 6,3)
  assert.equal(Psha.mfdGR({ a: 4, b: 1, mmin: 4, mmax: 6.26 }).length, 23);
});

test('zones discrétisées et branches (a, b)', () => {
  const carre = [[0, 0], [100, 0], [100, 100], [0, 100]];
  assert.equal(Psha.discretiser(carre, 10).length, 100);
  const br = Psha.branchesAB({ b: 1, sigmaB: 0.1, lamPivot: 0.5, mPivot: 4 });
  assert.ok(Math.abs(br.reduce((s, x) => s + x.poids, 0) - 1) < 1e-15);
  // Chaque branche garde le taux au pivot : 10^(a − b·4) = 0,5
  for (const x of br) assert.ok(Math.abs(10 ** (x.a - x.b * 4) - 0.5) < 1e-12);
});

test('fractiles pondérés comme hazardlib.stats.quantile_curve', () => {
  const v = [0.15, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 0.8, 0.9], w = v.map(() => 1 / v.length);
  assert.ok(Math.abs(Psha.quantile(0.8, v, w) - 0.76) < 1e-12);
  assert.equal(Psha.quantile(0.85, [0.15, 0.15, 0.15], [1 / 3, 1 / 3, 1 / 3]), 0.15);
});

test('arbre logique : énumération complète, catalogue et géodésie', () => {
  const m = Psha.modeleDefaut(), rlz = Psha.realisations(m);
  // (3 × 3 branches (a, b) du catalogue + 3 couplages χ) × 3 ΔMmax × 2 lois
  assert.equal(rlz.length, (3 * 3 + 3) * 3 * 2);
  assert.ok(Math.abs(rlz.reduce((s, r) => s + r.poids, 0) - 1) < 1e-12);
  assert.equal(new Set(rlz.map(r => r.cle)).size, rlz.length);
  // Variante géodésique : le moment χ·Ṁ0 est conservé quand Mmax change, pas le taux
  const g = Psha.variantes(m).find(v => v.id === 'g1');
  for (const d of [-0.3, 0, 0.3]) {
    const l = Psha.loiZone(m, g, 1, d);
    assert.ok(Math.abs(Geodesie.momentGR(l) / (0.6 * m.taux[1].moments[1]) - 1) < 1e-12);
  }
  const c = Psha.variantes(m).find(v => v.id === 'c11');
  assert.equal(Psha.loiZone(m, c, 0, 0.3).a, Psha.loiZone(m, c, 0, -0.3).a);
});

// ── Comparaison à OpenQuake ──
const modele = lire('modele_psha.json'), oq = lire('psha.json');
const res = Psha.calculer(modele);
const imtOQ = imt => (imt === 'PGA' ? 'PGA' : `SA(${Number.isInteger(imt) ? imt.toFixed(1) : imt})`);
// Écart relatif sur les probabilités significatives (≥ 1e-6 en 50 ans, soit ~5 millions d'années)
function ecartMax(js, ref) {
  let e = 0;
  ref.forEach((p, l) => { if (p >= 1e-6) e = Math.max(e, Math.abs(js[l] / p - 1)); });
  return e;
}

test('OpenQuake : mêmes niveaux, mêmes réalisations et mêmes poids', () => {
  assert.deepEqual(oq.niveaux.map(x => +x.toPrecision(6)), modele.niveaux.map(x => +x.toPrecision(6)));
  assert.equal(oq.realisations.length, res.realisations.length);
  for (const r of oq.realisations) {
    const js = res.realisations.find(x => x.cle === r.cle);
    assert.ok(js, `réalisation ${r.cle} absente`);
    assert.ok(Math.abs(js.poids - r.poids) < 1e-6);
  }
});

test('OpenQuake : courbe d\'aléa de chaque réalisation (écart < 0,2 %)', () => {
  let pire = 0;
  for (const r of oq.realisations) {
    const js = res.realisations.find(x => x.cle === r.cle);
    modele.imts.forEach((imt, k) => { pire = Math.max(pire, ecartMax(js.poe[k], r.poe[imtOQ(imt)])); });
  }
  assert.ok(pire < 0.002, `écart maximal ${(pire * 100).toFixed(3)} %`);
});

test('OpenQuake : courbe moyenne et spectre à probabilité uniforme (écart < 0,1 %)', () => {
  modele.imts.forEach((imt, k) => {
    const e = ecartMax(res.moyenne[k], oq.stats.mean[imtOQ(imt)]);
    assert.ok(e < 0.001, `moyenne ${imt} : écart ${(e * 100).toFixed(3)} %`);
    const x = Psha.niveauPourProba(res.niveaux, res.moyenne[k], 0.1), ref = oq.uhs.mean[imtOQ(imt)];
    assert.ok(Math.abs(x / ref - 1) < 0.001, `UHS ${imt} : ${x} contre ${ref}`);
  });
});

// Un fractile interpole entre réalisations triées : deux courbes presque égales mais de poids différents
// (ici, les branches de la zone lointaine aux courtes périodes) peuvent changer d'ordre pour un écart de
// 0,05 % et déplacer le fractile de quelques %. On vérifie donc l'algorithme sur les courbes mêmes
// d'OpenQuake (fractiles et carte d'aléa au flottant simple près), puis le moteur avec une marge.
test('OpenQuake : fractiles pondérés et leur UHS, sur les courbes d\'OpenQuake', () => {
  const poids = oq.realisations.map(r => r.poids);
  for (const q of [0.16, 0.5, 0.84]) {
    const nom = `quantile-${q}`;
    for (const imt of oq.imts) {
      const ref = oq.stats[nom][imt];
      const courbe = ref.map((_, l) => Psha.quantile(q, oq.realisations.map(r => r.poe[imt][l]), poids));
      assert.ok(ecartMax(courbe, ref) < 1e-6, `${nom} ${imt}`);
      const x = Psha.niveauPourProba(oq.niveaux, ref, 0.1);
      assert.ok(Math.abs(x / oq.uhs[nom][imt] - 1) < 1e-5, `UHS ${nom} ${imt} : ${x} contre ${oq.uhs[nom][imt]}`);
    }
    modele.imts.forEach((imt, k) => {
      const e = ecartMax(res.fractiles[q][k], oq.stats[nom][imtOQ(imt)]);
      assert.ok(e < 0.05, `moteur, ${nom} ${imt} : écart ${(e * 100).toFixed(2)} %`);
    });
  }
});

// Désagrégation : OpenQuake range les distances en Rrup (corde vers le foyer) et donne, par case, la
// probabilité en 50 ans 1 − exp(−50·λ) ; sa moyenne part des taux moyens pondérés, comme le moteur.
test('OpenQuake : désagrégation magnitude-distance, moyenne et réalisations (écart < 1 %)', () => {
  const D = oq.desagregation, d0 = modele.desagregation;
  assert.deepEqual(D.mag, [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]);
  assert.deepEqual(D.dist, Array.from({ length: 16 }, (_, i) => 20 * i));
  const imtJS = s => (s === 'PGA' ? 'PGA' : +s.slice(3, -1));
  const matrice = d => {
    const M = D.mag.slice(1).map(() => D.dist.slice(1).map(() => 0));
    for (const c of d.cases) M[Math.round((c.m0 - D.mag[0]) / d0.largeurM)][Math.round(c.r0 / d0.largeurR)] += 1 - Math.exp(-modele.dureeVie * c.taux);
    return M;
  };
  const comparer = (js, ref, nom) => ref.forEach((ligne, i) => ligne.forEach((p, j) => {
    if (p > 1e-5) assert.ok(Math.abs(js[i][j] / p - 1) < 0.01, `${nom} case (${D.mag[i]}, ${D.dist[j]}) : ${js[i][j]} contre ${p}`);
  }));
  for (const [imt, x] of Object.entries(D.niveaux)) {
    const opts = { largeurM: d0.largeurM, largeurR: d0.largeurR, distance: 'rrup' };
    comparer(matrice(Psha.desagregation(modele, imtJS(imt), x, opts)), D.moyenne[imt], `${imt} moyenne`);
    for (const r of D.realisations) comparer(matrice(Psha.desagregation(modele, imtJS(imt), x, { ...opts, cle: r.cle })), r.poe[imt], `${imt} ${r.cle}`);
  }
});
