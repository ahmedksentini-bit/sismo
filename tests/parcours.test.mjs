// Plan du cours : chaque banc de labo.html figure une fois dans le parcours, dans l'ordre de la barre, avec son
// poste, son chapeau, son ancre et son script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import P from '../src/parcours.js';

const html = readFileSync(new URL('../labo.html', import.meta.url), 'utf-8');

test('le parcours couvre exactement les onglets de labo.html, dans le même ordre', () => {
  const onglets = [...html.matchAll(/data-onglet="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(onglets, P.ordre);
  assert.equal(new Set(P.ordre).size, P.ordre.length);
  assert.deepEqual(Object.keys(P.ANCRES).sort(), [...P.ordre].sort());
  for (const b of P.ordre) {
    assert.ok(html.includes(`id="banc-${b}"`), `poste ${b}`);
    assert.ok(html.includes(`id="chapeau-${b}"`), `chapeau ${b}`);
  }
});

test('ancres uniques et réversibles ; précédent et suivant enchaînent tout le cours', () => {
  const ancres = Object.values(P.ANCRES);
  assert.equal(new Set(ancres).size, ancres.length);
  for (const b of P.ordre) assert.equal(P.depuisAncre('#' + P.ANCRES[b]), b);
  assert.equal(P.depuisAncre('#inconnue'), null);
  let b = P.ordre[0], vus = 0;
  while (b) { vus++; const s = P.situer(b); assert.ok(s.position < s.taille); b = s.suivant; }
  assert.equal(vus, P.ordre.length);
  assert.equal(P.situer(P.ordre[0]).precedent, null);
  assert.equal(P.situer('ductilite').chapitre, 3);
});

test('chaque banc a un script qui l\'ouvre sur « banc:ouvert », chargé par labo.html', () => {
  const scripts = [...html.matchAll(/<script type="module" src="(src\/[^"?]+)/g)].map(m => m[1]);
  const textes = scripts.map(s => readFileSync(new URL(`../${s}`, import.meta.url), 'utf-8'));
  for (const b of P.ordre.filter(x => x !== 'station' && x !== 'reseau')) assert.ok(textes.some(t => t.includes(`'${b}'`) && t.includes('banc:ouvert')), `script de ${b}`);
  // aucun script de banc oublié dans src/
  for (const f of readdirSync(new URL('../src/', import.meta.url)).filter(f => f.startsWith('banc-'))) assert.ok(scripts.includes(`src/${f}`), f);
});
