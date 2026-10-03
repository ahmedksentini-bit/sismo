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

test('cours.html : identifiants uniques (deux calculateurs ne partagent aucun champ ni aucune sortie)', () => {
  const ids = [...cours.matchAll(/ id="([^"]+)"/g)].map(m => m[1]), vus = new Set(), doublons = ids.filter(id => (vus.has(id) ? true : (vus.add(id), false)));
  assert.deepEqual(doublons, []);
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

test('chapitre 4 : les exemples chiffrés du texte', async () => {
  const Faille = (await import('../src/sismo/faille.js')).default, A = (await import('../src/sismo/accelerogramme.js')).default;
  const mo = Mw => 10 ** (1.5 * Mw + 9.05), mw = M0 => (Math.log10(M0) - 9.05) / 1.5;
  const fc = (Mw, ds) => 0.4906 * Sismo.MODELE.vs1 * 1000 * Math.cbrt(ds * 1e6 / mo(Mw));
  const M0 = 3e10 * 10e3 * 8e3 * 0.5;
  assert.equal(M0, 1.2e18);
  assert.equal(Math.log10(M0).toFixed(2), '18.08');
  assert.equal(mw(M0).toFixed(1), '6.0');
  assert.ok(Math.abs((Math.log10(M0) - 9.1) / 1.5 - mw(M0) + 0.0333) < 1e-3);
  // relation de Brune du générateur, réécrite en unités SI
  const ref = Sismo.source(5, Sismo.MODELE.vs1, 60).fc;
  assert.ok(Math.abs(fc(5, 6) - ref) / ref < 1e-3);
  assert.deepEqual([4, 5, 6, 7].map(M => +fc(M, 6).toPrecision(2)), [3, 0.95, 0.3, 0.095]);
  assert.equal(Math.round(Faille.aireWC1994(6)), 93);
  assert.equal(Math.round(Faille.aireWC1994(7) / 10) * 10, 760);
  assert.equal((mo(6) / (3e10 * Faille.aireWC1994(6) * 1e6)).toFixed(1), '0.4');
  assert.equal((mo(7) / (3e10 * Faille.aireWC1994(7) * 1e6)).toFixed(1), '1.6');
  const r = [2, 5, 10].map(R => Math.exp(A.medianeLois(7, R, 'PGA') - A.medianeLois(6, R, 'PGA')));
  assert.ok(r.every(x => x > 1.35 && x < 1.65));
  for (const t of ['≈ <strong>6,0</strong>', 'A ≈ 93 km²', 'A ≈ 760 km²', '0,95 Hz pour Mw 5 ; 0,30 Hz pour Mw 6', '1,4 à 1,6 fois plus forte']) assert.ok(cours.includes(t), t);
});

test('chapitre 5 : les exemples chiffrés du texte', async () => {
  const O = (await import('../src/sismo/oscillateur.js')).default;
  const w0 = Math.sqrt(79 / 2);
  assert.equal(w0.toFixed(2), '6.28');
  assert.equal((w0 / (2 * Math.PI)).toFixed(1), '1.0');
  assert.equal((2 * 0.7 * 2 * w0).toFixed(1), '17.6');
  // oscillations libres T0 = 1 s, ξ = 5 %, lâcher de 10 mm : maxima 7,3 puis 5,3 mm (Newmark)
  const dt = 0.001, n = 3000, { x } = O.integrer(new Float64Array(n), dt, 1, 0.05, 10, 0), pics = [];
  for (let i = 1; i < n - 1; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1]) pics.push(x[i]);
  assert.deepEqual(pics.slice(0, 2).map(p => p.toFixed(1)), ['7.3', '5.3']);
  assert.equal(Math.log(7.3 / 5.3).toFixed(2), '0.32');
  assert.equal((0.32 / (2 * Math.PI)).toFixed(2), '0.05');
  const r = (f, f0, xi) => O.reponse(f, f0, xi);
  assert.equal(r(5, 1, 0.7).deplacement.toFixed(2), '1.00');
  assert.equal(r(0.2, 1, 0.7).acceleration.toFixed(2), '1.00');
  assert.equal(r(1, 1, 0.7).deplacement.toFixed(2), '0.71');
  assert.equal(r(1, 1, 0.05).acceleration.toFixed(0), '10');
  assert.equal(r(2, 1.25, 0.8).deplacement.toFixed(2), '0.85');
  for (const t of ['f<sub>0</sub> = 1,0 Hz', '≈ 17,6 N·s/m', 'passe de 7,3 mm à 5,3 mm', '≈ 0,32', 'les deux valent 0,71', 'il en\n     rend encore 85 %']) assert.ok(cours.includes(t), t);
});

test('chapitre 6 : les exemples chiffrés du texte', async () => {
  const Rf = (await import('../src/sismo/refraction.js')).default, m = Sismo.MODELE;
  const ic = Math.asin(m.vp1 / m.vp2), ti = Rf.intercept(m.vp1, m.vp2, m.H, 10);
  assert.equal((ic * 180 / Math.PI).toFixed(1), '48.6');
  assert.equal(Math.cos(ic).toFixed(3), '0.661');
  assert.equal(ti.toFixed(2), '5.95');
  assert.equal(Math.round((2 * m.H - 10) * Math.tan(ic)), 61);
  assert.equal(Math.round(Rf.croisement(m.vp1, m.vp2, ti, 10)), 141);
  // le croisement du modèle est bien celui des temps de trajet du générateur
  assert.ok(Sismo.temps(140, 10).tPn > Sismo.temps(140, 10).tPg && Sismo.temps(142, 10).tPn < Sismo.temps(142, 10).tPg);
  // sismique réfraction de site
  const H = Rf.epaisseur(0.6, 2.5, 20, 0);
  assert.equal(H.toFixed(1), '6.2');
  assert.equal(Math.sqrt(1 - 0.24 ** 2).toFixed(3), '0.971');
  assert.equal(Math.round(Rf.croisement(0.6, 2.5, 20, 0)), 16);
  for (const t of ['<strong>5,95 s</strong>', 'Pn apparaît à 61 km', '<strong>141 km</strong>', '≈ <strong>6,2 m</strong>', 'au-delà de 16 m']) assert.ok(cours.includes(t), t);
});

test('chapitre 6 : le globe, les phases et la zone d\'ombre', async () => {
  const G = (await import('../src/sismo/globe.js')).default;
  const t = (ph, d) => G.arrivees(ph, 10, d)[0].temps, mmss = s => `${Math.floor(s / 60)} min ${(s % 60).toFixed(1).replace('.', ',')} s`;
  assert.equal(mmss(t('P', 60)), '10 min 6,7 s');
  assert.equal(mmss(t('S', 60)), '18 min 19,2 s');
  assert.equal(mmss(t('S', 60) - t('P', 60)), '8 min 12,5 s');
  assert.equal(Math.round(t('PcP', 60) - t('P', 60)), 46);
  assert.equal(mmss(t('PKIKP', 150)), '19 min 45,7 s');
  assert.ok(['P', 'PKP', 'PKiKP', 'PKIKP'].every(ph => G.arrivees(ph, 10, 150).every(a => a.temps >= t('PKIKP', 150))));
  assert.equal(Math.round(8.4 * (t('S', 60) - t('P', 60)) / 100) * 100, 4100);
  assert.equal(Math.round(60 * Math.PI * G.R / 180 / 100) * 100, 6700);
  // zone d'ombre : plus de P directe au-delà de ~100°, PKP à partir de ~145°
  assert.equal(G.arrivees('P', 10, 99).length > 0 && G.arrivees('P', 10, 101).length, 0);
  assert.ok(G.arrivees('PKP', 10, 144).length === 0 && G.arrivees('PKP', 10, 146).length > 0);
  for (const x of ['après <strong>10 min 6,7 s</strong>', '18 min 19,2 s, soit S − P = 8 min 12,5 s', 'suit P de 46 s', 'PKIKP (19 min 45,7 s)',
    'donnerait 4 100 km au lieu de 6 700', 'entre ~100° et ~145°']) assert.ok(cours.includes(x), x);
});

test('chapitre 7 : les exemples chiffrés du texte', async () => {
  const S = (await import('../src/sismo/spectre.js')).default;
  const se = (T, type = 1) => S.ec8(T, { type, sol: 'C', ag: 0.2 });
  assert.deepEqual([S.EC8_2004[1].C.S, S.EC8_2004[1].C.TB, S.EC8_2004[1].C.TC, S.EC8_2004[1].C.TD], [1.15, 0.2, 0.6, 2]);
  assert.equal(se(0.4).toFixed(3), '0.575');
  assert.equal(se(1).toFixed(3), '0.345');
  assert.equal(se(3).toFixed(3), '0.077');
  assert.deepEqual([S.EC8_2004[2].C.S, S.EC8_2004[2].C.TC], [1.5, 0.25]);
  assert.equal(se(0.2, 2).toFixed(2), '0.75');
  assert.equal(se(1, 2).toFixed(2), '0.19');
  assert.deepEqual([0.05, 0.1, 0.02].map(x => S.eta(x).toFixed(2)), ['1.00', '0.82', '1.20']);
  assert.ok(S.eta(0.27) > 0.55 && S.eta(0.29) === 0.55);
  assert.equal(S.periodeApprochee(15, 'beton').toFixed(2), '0.57');
  assert.ok(S.periodeApprochee(15, 'beton') < 0.6);
  for (const t of ['<strong>0,575 g</strong>', '= 0,345 g', '= 0,077 g', 'tombe à 0,19 g', '≈ 0,57 s', '0,82 pour 10 % ; 1,20 pour 2 %', 'vers\n     28 %']) assert.ok(cours.includes(t), t);
});

test('chapitre 8 : les exemples chiffrés du texte', async () => {
  const S = (await import('../src/sismo/sismicite.js')).default;
  const lam = m => 2 * 10 ** (-(m - 4));
  assert.deepEqual([5, 6, 7].map(m => +lam(m).toPrecision(2)), [0.2, 0.02, 0.002]);
  assert.equal((Math.log10(2) + 4).toFixed(2), '4.30');
  assert.equal((Math.LOG10E / (3.43 - 2.95)).toFixed(2), '0.90');
  const w5 = S.fenetreGK(5), w7 = S.fenetreGK(7);
  assert.equal(Math.round(w5.L / 10) * 10, 40);
  assert.equal(Math.round(w5.T / 10) * 10, 140);
  assert.equal(Math.round(w7.L / 10) * 10, 70);
  assert.equal((w7.T / 365.25).toFixed(1), '2.5');
  assert.equal(Math.round(S.periodeRetour(0.1, 50)), 475);
  assert.equal(Math.round(S.periodeRetour(0.02, 50)), 2475);
  assert.equal(Math.round(100 * S.probabilite(1 / 50, 50)), 63);
  assert.equal((10 ** 0.2).toFixed(1), '1.6');
  for (const t of ['tous les <strong>5 ans</strong>', '(tous les\n       50 ans)', '2,95) =\n       <strong>0,90</strong>', 'environ 40 km et 140 jours pour M 5, 70 km et 2,5 ans pour M 7', 'T<sub>R</sub> = 475 ans', 'a 63 % de chances']) assert.ok(cours.includes(t), t);
});

test('chapitre 9 : les exemples chiffrés du texte', async () => {
  const G = (await import('../src/sismo/geodesie.js')).default;
  const M0 = G.momentFaille({ L: 60, W: 12, s: 5 });
  assert.equal(M0.toExponential(2), '1.08e+17');
  assert.equal(G.moment(6.5).toExponential(1), '6.3e+18');
  assert.equal(Math.round(G.moment(6.5) / M0), 58);
  assert.equal(Math.round(G.moment(7) / M0 / 10) * 10, 330);
  assert.equal(Math.round(1000 * 5 / (Math.PI * 12)), 133);
  const t = { exx: -10, eyy: 0, exy: 0 };
  assert.equal(G.momentKostrov(t, { A: 1e4, H: 15 }).toExponential(1), '9.0e+16');
  const z = G.bilanZone({ tenseur: t, A: 1e4, chi: 0.5, b: 1, mmin: 4, mmax: 7 }), z2 = G.bilanZone({ tenseur: t, A: 1e4, chi: 0.5, b: 1, mmin: 4, mmax: 6.5 });
  assert.equal(z.a.toFixed(2), '3.82');
  assert.equal(Math.round(1 / z.taux(5)), 15);
  assert.equal(Math.round(1 / z.taux(6) / 10) * 10, 170);
  assert.equal(Math.round(1 / z2.taux(6) / 10) * 10, 120);
  assert.ok(z2.taux(4) / z.taux(4) > 1.7 && z2.taux(4) / z.taux(4) < 2);
  for (const t of ['tous les <strong>58 ans</strong>', 'tous les <strong>330 ans</strong>', 'soit 133 ns/an', '9,0·10<sup>16</sup> N·m/an', 'a = 3,82', 'tous les <strong>170 ans</strong>', 'tous les\n       120 ans']) assert.ok(cours.includes(t), t);
});

test('chapitre 10 : les exemples chiffrés du texte', async () => {
  const P = (await import('../src/sismo/psha.js')).default, G = (await import('../src/sismo/gmpe.js')).default;
  const b14 = G.LOIS.boore2014.calculer({ M: 6, Rjb: 10, vs30: 800, rake: 0 }, 'PGA');
  assert.equal(Math.exp(b14.ln).toFixed(3), '0.176');
  assert.equal(b14.sigma.toFixed(2), '0.61');
  assert.equal(Math.round(100 * P.survie((Math.log(0.3) - b14.ln) / b14.sigma, 3)), 19);
  assert.deepEqual(['akkar2014', 'bindi2014'].map(id => Math.exp(G.LOIS[id].calculer({ M: 6, Rjb: 10, vs30: 800, rake: 0 }, 'PGA').ln).toFixed(3)), ['0.142', '0.128']);
  assert.equal((1 - P.Phi(1)).toFixed(3), '0.159');
  const niv = (o, p, k = 0) => { const m = P.modeleSimple({ imts: ['PGA', 0.2, 1], ...o }), r = P.calculer(m); return P.niveauPourProba(r.niveaux, r.moyenne[k], p); };
  assert.equal(niv({}, 0.1).toFixed(3), '0.126');
  assert.equal(niv({}, 0.02).toFixed(3), '0.248');
  assert.equal(niv({}, 0.1, 1).toFixed(2), '0.26');
  assert.equal(niv({}, 0.1, 2).toFixed(2), '0.04');
  assert.equal(niv({ mmax: 7.5 }, 0.1).toFixed(3), '0.133');
  assert.equal(niv({ taux4: 0.2 }, 0.1).toFixed(3), '0.055');
  const m = P.modeleSimple({ imts: ['PGA'] }), d = P.desagregation(m, 'PGA', niv({}, 0.1));
  assert.equal(d.mMoy.toFixed(1), '5.2');
  assert.equal(Math.round(d.rMoy), 14);
  for (const t of ['médiane de 0,176 g', 'vaut 19 %', 'PGA = <strong>0,126 g</strong> à 475 ans et 0,248 g', 'M̄ = 5,2 et R̄ = 14 km', 'monte qu\'à 0,133 g', 'descend à 0,055 g']) assert.ok(cours.includes(t), t);
});

test('chapitre 11 : les exemples chiffrés du texte', async () => {
  const I = (await import('../src/sismo/intensite.js')).default;
  // Arias d'une sinusoïde de 0,2 g pendant 5 s (cycles entiers) : π·A²·D/(4g) ≈ 1,54 m/s
  const A = 0.2 * 9.81, dt = 0.001, n = 5000, acc = Float64Array.from({ length: n + 1 }, (_, i) => A * Math.sin(2 * Math.PI * 2 * i * dt));
  const ia = I.indicateurs(acc, dt).arias, formule = Math.PI * A * A * 5 / (4 * 9.81);
  assert.ok(Math.abs(ia - formule) / formule < 1e-6);
  assert.equal(formule.toFixed(2), '1.54');
  for (const t of ['≈ 1,54 m/s', 'au moins <strong>3</strong>', '<strong>90 %</strong>', 'moins 7 calculs, la plus défavorable sinon']) assert.ok(cours.includes(t), t);
});

test('chapitre 12 : les exemples chiffrés du texte', async () => {
  const S = (await import('../src/sismo/site.js')).default, A = (await import('../src/sismo/accelerogramme.js')).default;
  const col = S.colonne([{ h: 20, vs: 200, ip: 0, poids: 17.5 }], { vs: 1000, poids: 22, xi: 0.01 }), etat = { G: col.couches.map(c => c.G0), xi: col.couches.map(() => 0.02) };
  let pic = 0;
  for (let fr = 2; fr < 3; fr += 0.001) pic = Math.max(pic, S.cabs(S.transfert(col, etat, fr)));
  const I = 17.5 * 200 / (22 * 1000);
  assert.equal(I.toFixed(2), '0.16');
  assert.equal((1 / (I + Math.PI * 0.02 / 2)).toFixed(1), '5.2');
  assert.equal(pic.toFixed(1), '5.2');
  const c1 = S.classeEC8([{ h: 20, vs: 200 }], { vs: 1000 });
  assert.equal(Math.round(c1.vs30), 273);
  assert.equal(c1.classe, 'E');
  // profil d'école du banc « site »
  const poids = vs => (vs < 200 ? 17.5 : vs < 300 ? 18.5 : vs < 450 ? 19.5 : 20.5);
  const prof = [[4, 160, 30], [8, 220, 15], [12, 320, 0], [10, 450, 0]].map(([h, vs, ip]) => ({ h, vs, ip, poids: poids(vs) })), roc = { vs: 1200, poids: 22, xi: 0.01 };
  const cl = S.classeEC8(prof, roc);
  assert.deepEqual([Math.round(cl.vs30), cl.classe, S.frequenceQuartOnde(prof).toFixed(1)], [267, 'C', '2.1']);
  const rec = A.simuler({ M: 6.5, R: 20, graine: 271828 });
  let p = 0;
  for (const v of rec.acc) p = Math.max(p, Math.abs(v));
  const surf = (pga, lineaire) => {
    const acc = new Float64Array(rec.acc.length + Math.round(10 / rec.dt));
    for (let i = 0; i < rec.acc.length; i++) acc[i] = rec.acc[i] / p * pga;
    return S.calculer(S.colonne(prof, roc), acc, rec.dt, lineaire ? { lineaire: true } : { tolerance: 1e-3, iterMax: 30 }).surface.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  };
  assert.deepEqual([surf(0.05).toFixed(2), surf(0.25).toFixed(2), surf(0.25, true).toFixed(2), surf(0.5).toFixed(2)], ['0.14', '0.46', '0.89', '0.76']);
  for (const t of ['= <strong>2,5 Hz</strong>', '≈ <strong>5,2</strong>', 'Vs30 = 273 m/s, est de classe E', 'Vs30 = 267 m/s (classe C)', '0,46 g (1,9)', 'en prédirait 0,89 g']) assert.ok(cours.includes(t), t);
});

test('chapitre 13 : les exemples chiffrés du texte', async () => {
  const L = (await import('../src/sismo/liquefaction.js')).default;
  const sv = 18 * 5, u = 9.8 * 3, sve = sv - u, p = L.pointSPT(12, 10, sv, sve, 0.25, 6.5, 5);
  assert.deepEqual([sv, u.toFixed(1), sve.toFixed(1)], [90, '29.4', '60.6']);
  assert.equal(L.rd(5, 6.5).toFixed(2), '0.93');
  assert.equal((sv / sve).toFixed(2), '1.49');
  assert.equal(p.csr.toFixed(3), '0.225');
  assert.deepEqual([p.n1cs.toFixed(1), p.crr75.toFixed(3), p.msf.toFixed(2), p.ks.toFixed(2), p.crr.toFixed(3), p.fs.toFixed(2)], ['16.4', '0.169', '1.14', '1.06', '0.203', '0.90']);
  assert.equal(L.pointSPT(25, 10, sv, sve, 0.25, 6.5, 5).fs, 2);
  assert.equal(1 / 0.8, 1.25);
  for (const t of ['σ\'<sub>v</sub> = 60,6 kPa', '= <strong>0,225</strong>', '<strong>FS = 0,90</strong>', 'λ = 0,8, le\n     coefficient doit atteindre 1/0,8 = <strong>1,25</strong>']) assert.ok(cours.includes(t), t);
});

test('chapitre 14 : les exemples chiffrés du texte', async () => {
  const I = (await import('../src/sismo/inelastique.js')).default, S = (await import('../src/sismo/spectre.js')).default;
  assert.equal(I.regles.n2(4, 1, 0.6), 4);
  assert.equal(I.regles.n2(4, 0.3, 0.6), 7);
  assert.equal(I.regles.energies(4), 8.5);
  assert.equal(S.ec8(0.4, { type: 1, sol: 'C', ag: 0.2 }).toFixed(3), '0.575');
  assert.equal(S.ec8Calcul(0.4, { type: 1, sol: 'C', ag: 0.2, q: 3.9 }).toFixed(3), '0.147');
  assert.equal((0.2 * 1.15 * 2.5 / 3.9 * 0.6 * 2 / 2.5 ** 2).toFixed(3), '0.028');
  assert.equal(S.ec8Calcul(2.5, { type: 1, sol: 'C', ag: 0.2, q: 3.9 }), 0.2 * 0.2);
  for (const t of ['0,575 g au plateau', '0,6/0,3 =\n       <strong>7</strong>', '(16 + 1)/2 = 8,5', '<strong>0,147 g</strong>', 'β·a<sub>g</sub> = 0,04 g']) assert.ok(cours.includes(t), t);
});

test('chapitre 15 : les exemples chiffrés du texte', async () => {
  const B = (await import('../src/sismo/batiment.js')).default, S = (await import('../src/sismo/spectre.js')).default;
  const bat = { m: Array(5).fill(200), k: Array(5).fill(2e5), h: Array(5).fill(3) }, md = B.modes(bat);
  assert.deepEqual([md[0].T.toFixed(2), md[0].gamma.toFixed(2), Math.round(100 * md[0].part)], ['0.70', '1.25', 88]);
  assert.deepEqual([md[1].T.toFixed(2), (100 * md[1].part).toFixed(1), md[2].T.toFixed(2), (100 * md[2].part).toFixed(1)], ['0.24', '8.7', '0.15', '2.4']);
  const r = B.modesRetenus(md);
  assert.deepEqual([r.n, Math.round(100 * r.cumul)], [2, 97]);
  const Sd = T => S.ec8Calcul(T, { type: 1, sol: 'C', ag: 0.2, q: 3.9 }) * S.G;
  assert.equal((Sd(md[0].T) / S.G).toFixed(3), '0.127');
  const fl = B.forcesLaterales(bat, { T1: md[0].T, Sd: Sd(md[0].T), TC: 0.6 });
  assert.equal(fl.lambda, 0.85);
  assert.equal(Math.round(fl.Fb), 1057);
  assert.deepEqual(fl.F.map(Math.round), [70, 141, 211, 282, 352]);
  const sp = B.spectrale(bat, md, Sd, { n: 2, regle: 'srss' });
  assert.equal(Math.round(sp.V[0]), 1101);
  for (const t of ['T<sub>1</sub> = <strong>0,70 s</strong>', 'T<sub>2</sub> = 0,24 s (8,7 %)', '≈ <strong>1 057 kN</strong>', '70, 141, 211, 282\n       et 352 kN', 'donne 1 101 kN']) assert.ok(cours.includes(t), t);
});

test('chapitre 16 : les exemples chiffrés du texte', async () => {
  const P = (await import('../src/sismo/poussee.js')).default, B = (await import('../src/sismo/batiment.js')).default, S = (await import('../src/sismo/spectre.js')).default;
  const bat = { m: Array(5).fill(200), k: Array(5).fill(2e5), h: Array(5).fill(3) };
  bat.Vy = P.resistances(bat, T => S.ec8Calcul(T, { type: 1, sol: 'C', ag: 0.2, q: 3.9 }) * S.G, { omega: 1.5 });
  const se = T => S.ec8(T, { type: 1, sol: 'C', ag: 0.2 }) * S.G, md = B.modes(bat);
  const mo = P.n2(bat, md[0].phi, { se, TC: 0.6 }), un = P.n2(bat, bat.m.map(() => 1), { se, TC: 0.6 });
  assert.deepEqual([Math.round(mo.mEtoile), mo.gamma.toFixed(2), mo.cap.critique], [703, '1.25', 1]);
  assert.deepEqual([Math.round(mo.Fy), Math.round(mo.dy * 1000), mo.T.toFixed(2), (mo.se / S.G).toFixed(3)], [1311, 23, '0.70', '0.494']);
  assert.equal(mo.regle, 'égaux déplacements');
  assert.deepEqual([(mo.dtEtoile * 1000).toFixed(1), Math.round(mo.dt * 1000), Math.round(mo.glissements[1] * 1000)], ['59.8', 75, 54]);
  assert.equal((100 * mo.glissements[1] / 3).toFixed(1), '1.8');
  assert.deepEqual([un.cap.critique, Math.round(un.dt * 1000)], [0, 66]);
  for (const t of ['m* = 703 t, Γ = 1,25', 'F*<sub>y</sub> = 1 311 kN', 'd*<sub>t</sub> = 59,8 mm', '<strong>d<sub>t</sub> = 75 mm</strong>', '54 mm dans le seul deuxième étage', 'd<sub>t</sub> = 66 mm']) assert.ok(cours.includes(t), t);
});

test('chapitre 17 : les exemples chiffrés du texte', async () => {
  const I = (await import('../src/sismo/isolation.js')).default, S = (await import('../src/sismo/spectre.js')).default;
  const iso = I.isolateur({ M: 1000, Tiso: 2.5, q: 0.05, dy: 0.01 });
  assert.deepEqual([Math.round(iso.Q), Math.round(iso.K2), Math.round(iso.K1 / 10) * 10], [491, 6317, 55370]);
  const se = (T, xi = 0.05) => S.ec8(T, { type: 1, sol: 'C', ag: 0.25, xi }) * S.G, eq = I.deplacementCalcul(iso, { se });
  assert.ok(eq.converge);
  assert.deepEqual([Math.round(eq.d * 1000), eq.Teff.toFixed(2), Math.round(100 * eq.xi), S.eta(eq.xi).toFixed(2)], [128, '1.97', 22, '0.61']);
  assert.equal((eq.F / 1000 / S.G).toFixed(3), '0.133');
  assert.equal((se(0.4) / S.G).toFixed(2), '0.72');
  assert.ok(se(0.4) / (eq.F / 1000) > 5);
  for (const t of ['Q = 5 % du poids (490 kN)', '<strong>d = 128 mm</strong>', 'T<sub>eff</sub> = 1,97 s, ξ<sub>eff</sub> = 22 % (η = 0,61)', 'F/M = 0,133 g, contre 0,72 g']) assert.ok(cours.includes(t), t);
});
