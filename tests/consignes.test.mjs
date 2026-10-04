// Consignes des travaux pratiques (src/consignes.js) : chaque banc du parcours a sa carte « Ce que vous allez faire »
// en tête de son poste dans labo.html, avec un objectif, des étapes (Explorer puis Exercice) et ce qu'il faut rendre ;
// chaque bouton, case ou carte cité entre guillemets existe dans la page ou dans les bancs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import Parcours from '../src/parcours.js';
import { CONSIGNES, carteConsigne } from '../src/consignes.js';

const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf-8');
const labo = lire('labo.html');
const poste = (b) => { const i = labo.indexOf(`id="banc-${b}"`), j = labo.indexOf('<div class="poste"', i); return labo.slice(i, j < 0 ? undefined : j); };
const bancs = readdirSync(new URL('../src/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'consignes.js').map((f) => lire(`src/${f}`)).join('\n');

test('une consigne par banc du parcours, ni plus ni moins', () => {
  assert.deepEqual(Object.keys(CONSIGNES).sort(), [...Parcours.ordre].sort());
  for (const b of Parcours.ordre) {
    const c = CONSIGNES[b];
    assert.ok(c.objectif.length > 40, `${b} : objectif`);
    assert.ok(c.etapes.length >= 5 && c.etapes.length <= 6, `${b} : ${c.etapes.length} étapes`);
    // un banc qui a un mode Exercice finit par lui (le sismomètre et le spectre n'en ont pas)
    if (/mode-exercice"/.test(poste(b))) {
      assert.match(c.etapes.at(-1), /mode Exercice/, `${b} : la dernière étape passe en mode Exercice`);
      assert.match(c.etapes.at(-1), /« Vérifier »/, `${b} : la dernière étape se vérifie`);
    } else assert.ok(!/mode Exercice/.test(c.etapes.join(' ')), `${b} : pas de mode Exercice`);
    assert.ok(c.rendre.length > 20, `${b} : à rendre`);
    const h = carteConsigne(b, Parcours.LECONS[b]);
    assert.ok(!/undefined|NaN/.test(h), `${b} : carte`);
    assert.ok(h.includes(`${Parcours.LECONS[b].duree} min`), `${b} : durée`);
  }
});

test('la carte est en tête du poste de chaque banc, avant tout réglage', () => {
  for (const b of Parcours.ordre) {
    const debut = labo.indexOf(`id="banc-${b}"`);
    assert.ok(debut > 0, `poste ${b}`);
    const suite = labo.slice(debut, debut + 400);
    assert.match(suite, new RegExp(`^id="banc-${b}"[^>]*>\\s*<section class="carte consigne" id="consigne-${b}"`), `${b} : la consigne ouvre le poste`);
  }
  // l'ancienne carte « Expériences guidées » du sismomètre est remplacée par la consigne
  assert.ok(!labo.includes('Expériences guidées'));
});

test('chaque libellé cité entre guillemets existe dans la page ou dans les bancs', () => {
  for (const b of Parcours.ordre) {
    const c = CONSIGNES[b], texte = [...c.etapes, c.rendre, c.prerequis ?? ''].join(' ');
    for (const [, x] of texte.matchAll(/«\s([^»]+?)\s»/g)) assert.ok(labo.includes(x) || bancs.includes(x), `${b} : « ${x} » introuvable`);
  }
});
