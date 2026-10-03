// Liquéfaction : briques de Boulanger et Idriss (2014), puis comparaison complète à liquepy
// (tests/references/liquefaction.json, produit par tools/liquepy/liquefaction.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import L from '../src/sismo/liquefaction.js';

const lire = nom => JSON.parse(readFileSync(new URL(`./references/${nom}`, import.meta.url), 'utf-8'));
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} contre ${b}`);

test('briques : rd, MSF, Kσ, CRR, correction des fines', () => {
  proche(L.rd(0, 7.5), 1, 0.01, 'rd en surface (la formule donne 1,006)');
  // en profondeur, rd croît avec la magnitude (mouvements plus longs) et décroît avec z
  assert.ok(L.rd(10, 7.5) > L.rd(10, 6) && L.rd(15, 7) < L.rd(5, 7));
  assert.equal(L.msfCPT(7.5, 80), 1);
  proche(L.msfCPT(6.5, 60), 1 + (1.09 + (60 / 180) ** 3 - 1) * (8.64 * Math.exp(-6.5 / 4) - 1.325), 1e-12);
  assert.ok(L.msfCPT(5.5, 170) > L.msfCPT(5.5, 60)); // un sable dense gagne plus à un séisme court
  proche(L.kSigmaCPT(100, 120), 1, 1e-12); assert.equal(L.kSigmaCPT(10, 150), 1.1);
  assert.ok(L.kSigmaCPT(300, 150) < L.kSigmaCPT(300, 60));
  // CRR croît avec la densité ; plateau de la correction de fines vers 5,5 coups au-delà de 35 % de fines
  for (let q = 20; q < 200; q += 10) assert.ok(L.crrCPT(q + 10) > L.crrCPT(q));
  assert.ok(L.deltaN1(5) < 0.01); proche(L.deltaN1(35), 5.5, 0.05); proche(L.deltaN1(80), 5.6, 0.1);
  // classes d'Iwasaki
  assert.deepEqual([0, 3, 10, 20].map(L.classeLPI), ['nul', 'faible', 'élevé', 'très élevé']);
});

test('SPT : (N1)60cs itéré, FS croissant avec N, sable lâche liquéfié', () => {
  const lache = L.pointSPT(6, 5, 100, 70, 0.3, 7, 6), dense = L.pointSPT(30, 5, 100, 70, 0.3, 7, 6);
  assert.ok(lache.fs < 1 && dense.fs > lache.fs);
  // cohérence de l'itération : (N1)60cs = CN·N60 + Δ, m = 0,784 − 0,0768·√(N1)60cs
  const m = 0.784 - 0.0768 * Math.sqrt(lache.n1cs);
  proche(lache.cn, Math.min(1.7, Math.pow(L.PA / 70, m)), 1e-6);
  proche(lache.n1cs, lache.n1 + L.deltaN1(5), 1e-6);
});

// ── Comparaison à liquepy ──
const modele = lire('modele_liquefaction.json'), ref = lire('liquefaction.json');

test('liquepy : procédure CPT complète, profondeur par profondeur, trois scénarios', () => {
  for (const sc of ref.scenarios) {
    const r = L.cpt(modele.sondage, sc);
    assert.equal(r.points.length, sc.fs.length);
    for (const k of ['gamma', 'sv', 'sve', 'rd', 'ic', 'fc', 'qc1n', 'qc1ncs', 'ks', 'msf', 'csr', 'crr75', 'crr', 'fs'])
      r.points.forEach((p, i) => assert.ok(Math.abs(p[k] - sc[k][i]) <= 1e-10 * Math.max(1, Math.abs(sc[k][i])), `M ${sc.M} z ${p.z} ${k} : ${p[k]} contre ${sc[k][i]}`));
    proche(r.lpi, sc.lpi, 1e-9, 'LPI');
    r.points.forEach((p, i) => proche(L.deformationVolumique(p.fs, p.qc1ncs), sc.ev[i], 1e-12, `εv z ${p.z}`));
  }
  // le scénario le plus fort liquéfie davantage
  const [a, b] = ref.scenarios;
  assert.ok(b.lpi > a.lpi);
});

test('liquepy : CRR7,5 et Kσ du SPT', () => {
  const s = ref.spt;
  s.n.forEach((n, i) => proche(L.crrSPT(n) / s.crr75[i], 1, 1e-12, `N = ${n}`));
  s.sve.forEach((v, j) => s.n.forEach((n, i) => proche(L.kSigmaSPT(v, Math.max(n, 1e-9)), s.ks[j][i], 1e-12, `σ'v ${v}, N ${n}`)));
});

test('sondage synthétique : reproductible, qc et fs positifs, couches reconnaissables', () => {
  const C = [{ h: 3, qc: 5, rf: 0.5 }, { h: 3, qc: 1, rf: 4 }];
  const a = L.sondageSynthetique(C, { graine: 3 }), b = L.sondageSynthetique(C, { graine: 3 });
  assert.deepEqual(a, b);
  assert.equal(a.z.length, 60);
  assert.ok(a.qc.every(v => v > 0) && a.fs.every(v => v > 0));
  const r = L.cpt(a, { gwl: 1, amax: 0.2, M: 7 });
  // sable en haut (Ic < 2,6), argile en bas (Ic > 2,6 : non liquéfiable, FS = 2,25 par convention)
  assert.ok(r.points[15].ic < 2.6 && r.points[50].ic > 2.6 && r.points[50].fs === 2.25);
});
