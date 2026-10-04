// Équations des lois d'atténuation montrées dans le cours (src/gmpe-notes.js, Gmpe.LOIS[id].detailler) : la somme
// des termes affichés redonne la médiane du solveur (lui-même vérifié contre OpenQuake), chaque coefficient tabulé
// est décrit et lu dans le fichier exporté, l'exemple du chapitre 10 retrouve les valeurs du texte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Gmpe from '../src/sismo/gmpe.js';
import Akkar2014 from '../src/sismo/coefficients/akkar2014.js';
import Bindi2014 from '../src/sismo/coefficients/bindi2014.js';
import Boore2014 from '../src/sismo/coefficients/boore2014.js';
import { COEFFICIENTS, GRANDEURS, tableCoefficients, constantes, etapesLoi, sommeEnLigne } from '../src/gmpe-notes.js';

const IDS = ['akkar2014', 'bindi2014', 'boore2014'], TABLES = { akkar2014: Akkar2014, bindi2014: Bindi2014, boore2014: Boore2014 };
const texte = (h) => h.replace(/<[^>]+>/g, '').replace(/[  ]/g, ' ');

test('la somme des termes est la médiane du solveur, sur tout le domaine', () => {
  for (const id of IDS) {
    const loi = Gmpe.LOIS[id];
    for (const imt of ['PGA', 'PGV', 0.2, 1, 0.37]) for (const M of [4, 5.5, 6.75, 7.4]) for (const Rjb of [0, 10, 80, 190]) for (const vs30 of [200, 450, 760, 1200]) for (const rake of [0, 90, -90, 180]) {
      const d = loi.detailler({ M, Rjb, vs30, rake }, imt), c = loi.calculer({ M, Rjb, vs30, rake }, imt);
      const somme = Object.values(d.termes).reduce((a, b) => a + b, 0);
      if (id === 'bindi2014') {
        assert.ok(Math.abs(somme - d.log10Y) < 1e-12);
        assert.ok(Math.abs((imt === 'PGV' ? somme * Math.LN10 : Math.log(10 ** (somme - 2) / 9.80665)) - c.ln) < 1e-9, `${id} ${imt} ${M} ${Rjb} ${vs30} ${rake}`);
      } else assert.ok(Math.abs(somme - c.ln) < 1e-12, `${id} ${imt} ${M} ${Rjb} ${vs30} ${rake}`);
      assert.ok(Math.abs(d.sigma - c.sigma) < 1e-12 && Math.abs(Math.hypot(d.tau, d.phi) - d.sigma) < 1e-4);
    }
  }
});

test('chaque coefficient est décrit et lu dans le fichier exporté, colonnes sans interpolation', () => {
  for (const id of IDS) {
    const t = TABLES[id], decrits = COEFFICIENTS[id].map(([k]) => k);
    assert.deepEqual([...decrits].sort(), Object.keys(t.PGA).sort(), `${id} : coefficients décrits`);
    for (const g of GRANDEURS) if (typeof g === 'number') assert.ok(t.SA.some((c) => Math.abs(c.T - g) < 1e-9), `${id} : période ${g} tabulée`);
    const h = tableCoefficients(id);
    assert.equal(h.split('<tr>').length - 1, decrits.length + 1);
    assert.ok(!/NaN|undefined/.test(h + constantes(id)));
    // une valeur prise au hasard : a4, c3 ou c1 de la colonne Sa(1 s)
    const k = { akkar2014: 'a4', bindi2014: 'c3', boore2014: 'c1' }[id], v = t.SA.find((c) => c.T === 1)[k];
    assert.ok(texte(h).includes(v.toLocaleString('fr-FR', { maximumSignificantDigits: 6 }).replace('-', '−')), `${id} ${k}`);
  }
});

test("l'exemple du chapitre 10 retrouve les médianes du texte, terme à terme", () => {
  const p = { M: 6, Rjb: 10, vs30: 800, rake: 0 };
  const attendu = { boore2014: '0,176 g', akkar2014: '0,142 g', bindi2014: '0,128 g' };
  for (const id of IDS) {
    const e = etapesLoi(id, p, 'PGA'), t = texte(e.map((x) => `${x.formule ?? ''} ${x.calcul ?? ''}`).join(' '));
    assert.ok(t.includes(attendu[id]), `${id} : ${attendu[id]}`);
    assert.ok(!/NaN|undefined|Infinity|−0,0+\b/.test(t), `${id} : valeur douteuse`);
    const ln = Gmpe.LOIS[id].calculer(p, 'PGA').ln;
    assert.ok(t.includes(ln.toFixed(3).replace('.', ',').replace('-', '−')), `${id} : ln PGA`);
  }
  // sols mous : les branches non linéaires d'Akkar et de Boore sont expliquées
  assert.ok(texte(etapesLoi('akkar2014', { M: 7, Rjb: 20, vs30: 300, rake: 90 }, 1).map((x) => x.titre).join(' ')).includes('non linéaire'));
  assert.ok(texte(etapesLoi('boore2014', { M: 5, Rjb: 20, vs30: 300, rake: -90 }, 0.2).map((x) => x.note ?? '').join(' ')).includes('amplifie moins'));
  assert.ok(texte(sommeEnLigne('bindi2014', p)).includes('= 2,099 (cm/s²)'));
  const cours = readFileSync(new URL('../cours.html', import.meta.url), 'utf-8');
  for (const id of ['tabAkkar', 'tabBindi', 'tabBoore', 'gmpeConstAkkar', 'gmpeConstBindi', 'gmpeConstBoore', 'exGmpe', 'gmImt']) assert.ok(cours.includes(`id="${id}"`), id);
});
