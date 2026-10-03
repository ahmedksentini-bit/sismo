// Cours interactif, exerciseur et polycopié : plan (data/chapitres.json) cohérent avec les travaux pratiques
// (src/parcours.js) et avec cours.html ; banques d'exercices reproductibles ; exemples chiffrés du texte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import P from '../src/parcours.js';
import Sismo from '../src/sismo/signal.js';
import { creerAlea } from '../src/exos/alea.js';
import { MODELES, graineDe, controler } from '../src/exos/index.js';

const lire = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf-8');
const plan = JSON.parse(lire('data/chapitres.json'));
const cours = lire('cours.html');

test('un chapitre par banc, dans l\'ordre des travaux pratiques ; parties A à D = groupes du parcours', () => {
  assert.equal(plan.chapitres.length, P.ordre.length);
  assert.deepEqual(plan.parties.map(p => p.titre), P.CHAPITRES.map(c => c.titre));
  plan.chapitres.forEach((c, i) => {
    assert.equal(c.id, `ch${i + 1}`);
    assert.equal(c.number, i + 1);
    assert.equal(c.banc, P.ordre[i], c.id);
    assert.equal(c.partie, String.fromCharCode(65 + P.situer(c.banc).chapitre), c.id);
    assert.equal(c.title, P.LECONS[c.banc].titre, c.id);
    // chapitre rédigé ⇔ section dans cours.html ⇔ lien depuis le banc
    assert.equal(cours.includes(`<section id="${c.id}" class="card">`), !!c.cours, c.id);
    assert.equal(P.LECONS[c.banc].fichier, c.cours ? `cours.html#${c.id}` : null, c.id);
  });
});

test('banques d\'exercices : présentes, au nombre annoncé, reproductibles depuis les modèles', async () => {
  for (const c of plan.chapitres) {
    const fichier = `data/exercices-${c.id}.json`;
    if (!c.exercices) { assert.ok(!MODELES[c.id], `${c.id} : modèles sans exercices annoncés`); continue; }
    assert.ok(existsSync(new URL(`../${fichier}`, import.meta.url)), fichier);
    const banque = JSON.parse(lire(fichier)), modeles = (await MODELES[c.id]()).default;
    assert.equal(banque.exercices.length, c.exercices, c.id);
    assert.deepEqual(banque.exercices.map(e => e.id), modeles.map(m => m.id));
    for (const m of modeles) {
      const r = m.generer(creerAlea(graineDe(m.id)));
      const exo = banque.exercices.find(e => e.id === m.id);
      assert.deepEqual(JSON.parse(JSON.stringify(r.questions)), exo.questions, `${m.id} : relancer npm run exercices`);
    }
  }
});

test('modèles d\'exercices : aucune anomalie sur des tirages au hasard', async () => {
  for (const id of Object.keys(MODELES)) {
    for (const m of (await MODELES[id]()).default) {
      for (let g = 1; g <= 25; g++) {
        const exo = m.generer(creerAlea(1000 + g));
        assert.deepEqual(controler(exo), [], `${m.id}, graine ${1000 + g}`);
        assert.ok(exo.questions.length >= 3, m.id);
      }
    }
  }
});

test('chapitre 1 : les exemples chiffrés du texte', () => {
  assert.equal(Sismo.kmS.toFixed(1), '8.4');
  const R = Sismo.distanceSP(19.5 - 12.0);
  assert.equal(Math.round(R), 63);
  assert.equal(Math.round(Math.sqrt(63 ** 2 - 10 ** 2)), 62);
  assert.equal((22.4 - 63 / Sismo.MODELE.vp1).toFixed(1), '11.9');
  assert.equal(Sismo.ML(2000, 63).toFixed(1), '3.3');
  // la règle est exacte tant que Pg est la première arrivée
  const tt = Sismo.temps(60, 10);
  assert.ok(Math.abs(Sismo.distanceSP(tt.tSg - tt.tP) - tt.R) < 1e-9);
  for (const t of ['63 km', '62 km', '10 h 15 min 11,9 s', 'ML = 3,30 + 2,00 + 0,12 − 2,09']) assert.ok(cours.includes(t), t);
});

test('pages : chaque fichier local référencé existe ; chaque champ lu par un calculateur existe', () => {
  for (const page of ['index.html', 'cours.html', 'exerciseur.html', 'labo.html']) {
    const html = lire(page);
    for (const [, cible] of html.matchAll(/(?:href|src)="([^"#:?]+)[^"]*"/g)) {
      if (/^(https?|mailto)/.test(cible) || cible.includes("${")) continue;
      assert.ok(existsSync(new URL(`../${cible}`, import.meta.url)), `${page} → ${cible}`);
    }
  }
  const scripts = [...cours.matchAll(/src="(src\/cours-[^"]+)"/g)].map(m => m[1]);
  assert.ok(scripts.length >= 1);
  for (const s of scripts) {
    const ids = new Set([...lire(s).matchAll(/(?:el|num)\("([A-Za-z0-9]+)"/g)].map(m => m[1]));
    for (const [, liste] of lire(s).matchAll(/brancher\(\[([^\]]+)\]/g)) for (const [, id] of liste.matchAll(/"([A-Za-z0-9]+)"/g)) ids.add(id);
    for (const id of ids) assert.ok(cours.includes(`id="${id}"`), `${s} : #${id}`);
  }
});
