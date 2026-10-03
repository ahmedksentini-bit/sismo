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

test('chapitre 2 : les exemples chiffrés du texte', () => {
  const st = [{ x: 0, y: 0 }, { x: 58, y: 22 }, { x: 22, y: -52 }, { x: -46, y: -14 }], E = { x: 16, y: -8, h: 10 };
  // les lectures de l'exemple sortent du modèle de croûte (origine à 4,0 s)
  const lect = st.map(s => { const tt = Sismo.temps(Math.hypot(E.x - s.x, E.y - s.y), E.h); return { tP: +(4 + tt.tP).toFixed(1), tS: +(4 + tt.tSg).toFixed(1) }; });
  assert.deepEqual(lect, [{ tP: 7.4, tS: 9.9 }, { tP: 12.8, tS: 19 }, { tP: 11.6, tS: 17 }, { tP: 14.5, tS: 22 }]);
  assert.deepEqual(lect.map(l => Math.round(Sismo.distanceSP(l.tS - l.tP))), [21, 52, 45, 63]);
  assert.equal(Math.hypot(E.x, E.y).toFixed(1), '17.9');
  const w = Sismo.wadati(lect), p2 = 5.0 / 7.1;
  assert.equal(w.vpvs.toFixed(2), '1.70');
  assert.equal(p2.toFixed(2), '0.70');
  assert.equal(w.t0.toFixed(1), '3.9');
  assert.equal((7.4 - 2.5 / p2).toFixed(1), '3.9');
  const L = Sismo.localiser(st, lect);
  assert.ok(Math.hypot(L.x - E.x, L.y - E.y) < 1 && Math.abs(L.h - E.h) < 1 && L.gap < 180);
  // profondeur par la station la plus proche
  const R = Sismo.distanceSP(2.5), h = Math.sqrt(R * R - 17.9 ** 2);
  assert.equal(R.toFixed(1), '21.0');
  assert.equal(Math.round(h), 11);
  const dh = d => { const r = Math.hypot(d, h); return Math.sqrt((r + 0.84) ** 2 - d * d) - h; };
  assert.equal(dh(17.9).toFixed(1), '1.5');
  assert.equal(Math.round(dh(60)), 4);
  for (const t of ['R ≈ 21, 52, 45 et 63 km', 'Vp/Vs ≈ <strong>1,70</strong>', '≈ <strong>3,9 s</strong>', '≈ <strong>11 km</strong>', 'h d\'environ 1,5 km', 'h de 4 km']) assert.ok(cours.includes(t), t);
});

test('chapitre 3 : les exemples chiffrés du texte', async () => {
  const Me = (await import('../src/sismo/mecanisme.js')).default, G = (await import('../src/sismo/gmpe.js')).default;
  const r = x => Math.round(x);
  const aux = Me.planAuxiliaire(30, 50, -90), ax = Me.axes(Me.tenseur(30, 50, -90));
  assert.deepEqual([r(aux.azimut), r(aux.pendage), r(aux.glissement)], [210, 40, -90]);
  assert.deepEqual([r(ax.T.azimut), r(ax.T.plongement), r(ax.P.plongement)], [120, 5, 85]);
  const aux2 = Me.planAuxiliaire(120, 35, 90), ax2 = Me.axes(Me.tenseur(120, 35, 90));
  assert.deepEqual([r(aux2.azimut), r(aux2.pendage), r(aux2.glissement)], [300, 55, 90]);
  assert.deepEqual([r(ax2.P.azimut), r(ax2.P.plongement)], [30, 10]);
  assert.equal(r(Math.asin(Sismo.MODELE.vp1 / Sismo.MODELE.vp2) * 180 / Math.PI), 49);
  // style de faille : médiane des trois lois, Mw 6, Rjb 10 km, rocher
  const pga = rake => Math.exp(Object.values(G.LOIS).reduce((s, L) => s + L.calculer({ M: 6, Rjb: 10, vs30: 800, rake }, 'PGA').ln, 0) / 3);
  assert.deepEqual([pga(90), pga(0), pga(-90)].map(x => x.toFixed(3)), ['0.165', '0.148', '0.131']);
  for (const t of ['azimut 210°, pendage 40°', 'plan auxiliaire 300° / 55° / 90°', '0,165 g (inverse), 0,148 g (décrochement) et 0,131 g', 'émergent à 49°']) assert.ok(cours.includes(t), t);
});
