// Schémas de principe du cours (src/schemas.js) : chaque schéma a son conteneur dans cours.html, se dessine
// sans valeur manquante, et ce qu'il chiffre sort des solveurs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMAS, ruptures } from '../src/schemas.js';
import Faille from '../src/sismo/faille.js';
import Me from '../src/sismo/mecanisme.js';

const cours = readFileSync(new URL('../cours.html', import.meta.url), 'utf-8');

test('chaque schéma a un conteneur unique dans le cours et se dessine sans valeur manquante', () => {
  for (const [id, { f, legende }] of Object.entries(SCHEMAS)) {
    assert.equal(cours.split(`<div class="figure-cours" id="${id}"></div>`).length - 1, 1, id);
    const s = f();
    assert.ok(s.startsWith('<svg') && s.endsWith('</svg>'), id);
    assert.ok(!/NaN|undefined|Infinity/.test(s), `${id} : valeur manquante`);
    assert.ok(legende.length > 40, id);
  }
  assert.ok(cours.includes('<script type="module" src="src/cours-schemas.js"></script>'));
});

test('ruptures : aires de Wells et Coppersmith, glissement M0/(μA), légende cohérente', () => {
  const s = ruptures().replace(/[\u00a0\u202f]/g, ' ');
  for (const t of ['Mw 5 : 3,4 km × 3,4 km (11,5 km²), glissement moyen 0,1 m', 'Mw 6 : 9,7 km × 9,7 km (93,3 km²), glissement moyen 0,4 m',
    'Mw 7 : 38 km × 20 km (759 km²), glissement moyen 1,6 m', 'Mw 8 : 310 km × 20 km (6 170 km²), glissement moyen 6,1 m']) assert.ok(s.includes(t), t);
  // « chaque degré multiplie la surface par 8 environ et le glissement par 4 »
  const A = M => Faille.aireWC1994(M), D = M => Math.pow(10, 1.5 * M + 9.05) / (3e10 * A(M) * 1e6);
  assert.equal(Math.round(A(7) / A(6)), 8);
  assert.equal(Math.round(D(7) / D(6)), 4);
  assert.ok(SCHEMAS.schemaRuptures.legende.includes('par 8 environ') && SCHEMAS.schemaRuptures.legende.includes('par 4'));
});

test('types de failles : mécanismes des trois blocs bien classés', () => {
  assert.equal(Me.typeFaille(-90), 'normale');
  assert.equal(Me.typeFaille(90), 'inverse');
  assert.equal(Me.typeFaille(0), 'décrochement');
  const s = SCHEMAS.schemaTypes.f();
  for (const t of ['Faille normale', 'Faille inverse', 'Décrochement', 'Sphère focale : faille normale']) assert.ok(s.includes(t), t);
});
