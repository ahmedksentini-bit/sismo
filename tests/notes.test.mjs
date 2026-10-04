// Notes de calcul des calculateurs du cours : chaque conteneur est rempli par un noter() du chapitre, et la note
// se compose de données, d'étapes (formule, application numérique) et d'une conclusion facultative.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noteCalcul } from '../src/ui.js';

const lire = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf-8');
const cours = lire('cours.html');

test('chaque conteneur de note de calcul est rempli par son chapitre, une fois', () => {
  const sections = cours.split(/<section id="ch(\d+)" class="card">/);
  let n = 0;
  for (let i = 1; i < sections.length; i += 2) {
    const ch = sections[i], js = lire(`src/cours-ch${ch}.js`);
    for (const [, id] of sections[i + 1].matchAll(/<div id="(calc\w+Note)"><\/div>/g)) {
      assert.ok(js.includes(`noter("${id}", {`) || js.includes(`noter("${id}", arr.length ? {`), `${id} : pas de noter() dans cours-ch${ch}.js`);
      assert.ok(sections[i + 1].includes(`<div class="calc" id="${id.replace(/Note$/, '')}">`), `${id} hors de son calculateur`);
      n++;
    }
  }
  assert.ok(n >= 20, `${n} notes`);
});

test('mise en forme : données, étapes numérotées, conclusion', () => {
  const h = noteCalcul({ donnees: [['R', '21 km'], ['croûte', 'H = 32 km']], etapes: [{ titre: 'Distance', formule: 'R = 8,4 × (S − P)', calcul: 'R = 8,4 × 2,5 = <b>21 km</b>' }, null], conclusion: 'fin' });
  assert.ok(h.startsWith('<details class="note-calcul" open><summary>Note de calcul</summary>'));
  assert.ok(h.includes('<span>R = <b>21 km</b></span>') && h.includes('<span>croûte : <b>H = 32 km</b></span>'));
  assert.equal(h.split('<li>').length - 1, 1);
  assert.ok(h.includes('<span class="nc-formule">R = 8,4 × (S − P)</span>') && h.includes('<p class="nc-conclusion">fin</p>'));
});
