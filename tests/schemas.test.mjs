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

test('aléa, sismicité, spectre : les chiffres des schémas sortent des solveurs', async () => {
  const { cornell, nombreEnergie, oscillateurs } = await import('../src/schemas.js');
  const Psha = (await import('../src/sismo/psha.js')).default, Spectre = (await import('../src/sismo/spectre.js')).default;
  const res = Psha.calculer(Psha.modeleSimple({ imts: ['PGA'] })), a475 = Psha.niveauPourProba(res.niveaux, res.moyenne[0], 0.1);
  const nb = s => s.replace(/[  ]/g, ' ');
  assert.ok(nb(cornell()).includes(`475 ans → ${a475.toLocaleString('fr-FR', { maximumSignificantDigits: 2 })} g`));
  const gr = nb(nombreEnergie());
  for (const t of ['>20<', '>2<', '>5 ans<', '>50 ans<', '>500 ans<']) assert.ok(gr.includes(t), t);
  assert.equal(Math.round(10 ** 1.5), 32);
  // le plateau du spectre dessiné est celui de l'EN 1998-1:2004, type 1, sol C, ag = 0,2 g
  assert.equal(Spectre.ec8(0.4, { type: 1, sol: 'C', ag: 0.2 }).toFixed(3), '0.575');
  assert.ok(oscillateurs().includes('0,6'));
});

test('chaque chapitre rédigé a au moins un schéma de principe ; modes et spectre des schémas calculés', async () => {
  const plan = JSON.parse(readFileSync(new URL('../data/chapitres.json', import.meta.url), 'utf-8'));
  const sections = cours.split(/<section id="(ch\d+)" class="card">/);
  for (const c of plan.chapitres.filter(x => x.cours)) {
    const corps = sections[sections.indexOf(c.id) + 1];
    assert.ok(/class="figure-cours" id="(schema\w+|globeCh1|figSubduction)"/.test(corps), `${c.id} sans schéma`);
  }
  const Batiment = (await import('../src/sismo/batiment.js')).default;
  const md = Batiment.modes({ m: Array(5).fill(200), k: Array(5).fill(2e5) }), s = SCHEMAS.schemaConsole.f();
  assert.ok(s.includes(`T = ${md[0].T.toLocaleString('fr-FR', { maximumSignificantDigits: 2 })} s`) && s.includes(`${Math.round(100 * md[0].part)} % de la masse`));
  // isolation : l'accélération spectrale chute de la base fixe à la base isolée
  const Spectre = (await import('../src/sismo/spectre.js')).default, se = T => Spectre.ec8(T, { type: 1, sol: 'C', ag: 0.2 });
  assert.ok(se(2.5) < se(0.4) / 4);
  assert.ok(SCHEMAS.schemaIsolation.f().includes('0,11 g'));
});
