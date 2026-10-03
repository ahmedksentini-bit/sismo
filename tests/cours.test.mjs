// Cours : chaque leçon annoncée existe, renvoie au bon TP, et ses chiffres sont ceux des solveurs du site (le texte
// est vérifié contre le modèle : si le modèle change, le test signale la leçon à reprendre).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import P from '../src/parcours.js';
import Sismo from '../src/sismo/signal.js';
import Accelero from '../src/sismo/accelerogramme.js';
import Questions01 from '../src/cours/questions-01.js';

const lire = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf-8');
const virg = (x, d) => x.toFixed(d).replace('.', ',');

test('chaque leçon disponible existe, charge ses scripts et renvoie à son TP', () => {
  const disponibles = P.ordre.filter(b => P.LECONS[b].fichier);
  assert.ok(disponibles.length >= 1);
  for (const b of disponibles) {
    const f = `cours/${P.LECONS[b].fichier}`;
    assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), f);
    const html = lire(f);
    assert.ok(html.includes(`../index.html#${P.ANCRES[b]}`), `${f} : lien vers le TP`);
    assert.ok(html.includes(`<h1>${P.LECONS[b].titre}</h1>`), `${f} : titre`);
    for (const m of html.matchAll(/src="\.\.\/(src\/[^"]+)"/g)) assert.ok(existsSync(new URL(`../${m[1]}`, import.meta.url)), m[1]);
  }
  for (const b of P.ordre) assert.ok(P.LECONS[b].titre && P.LECONS[b].duree > 0, b);
});

test('leçon 1 : les chiffres du texte sont ceux du modèle', () => {
  const html = lire('cours/lecon-01.html');
  const k = Sismo.kmS, d = k * 7.5;
  assert.equal(virg(k, 1), '8,4'); assert.ok(html.includes('d ≈ 8,4 × (S − P)'));
  assert.equal(virg(d, 0), '63'); assert.ok(html.includes('8,4 × 7,5 ≈ <b>63 km</b>'));
  assert.equal(virg(Math.sqrt(63 * 63 - 100), 0), '62');
  assert.equal(virg(63 / Sismo.MODELE.vp1, 1), '10,5');
  assert.equal(virg(Sismo.ML(2000, 63), 1), '3,3'); assert.ok(html.includes('≈ <b>3,3</b>'));
  // accélérations citées : médiane des trois lois, magnitude 5, au rocher
  const pga = R => Math.exp(Accelero.medianeLois(5, R, 'PGA'));
  assert.equal(virg(pga(5), 1), '0,1'); assert.equal(virg(pga(80), 3), '0,003');
  assert.ok(html.includes('0,1 g d\'accélération maximale à 5 km') && html.includes('0,003 g à 80 km'));
});

test('leçon 1 : test d\'auto-évaluation bien formé', () => {
  assert.ok(Questions01.length >= 5);
  for (const q of Questions01) {
    assert.ok(q.enonce && q.explication);
    if (q.type === 'choix') assert.ok(q.bonne >= 0 && q.bonne < q.choix.length);
    else { assert.ok(Number.isFinite(q.reponse)); assert.ok(q.ecart.relatif > 0 || q.ecart.absolu > 0); }
  }
  assert.equal(virg(Questions01[4].reponse, 0), '50');
  assert.equal(virg(Questions01[5].reponse, 1), '2,5');
});
