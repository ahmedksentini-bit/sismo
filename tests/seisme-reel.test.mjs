// Séisme réel dans le TP de localisation : fichier d'un séisme (src/sismo/dossier.js : écriture, relecture des
// enregistrements miniSEED, trois composantes, rééchantillonnage) ; table des temps de trajet de la localisation
// (data/temps-localisation.json : croûte du cours jusqu'à 1°, ak135 au-delà de 2°) ; localisation sur la sphère
// (src/sismo/localisation.js : un séisme synthétique est retrouvé).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import D from '../src/sismo/dossier.js';
import L from '../src/sismo/localisation.js';
import M from '../src/sismo/miniseed.js';
import G from '../src/sismo/globe.js';
import S from '../src/sismo/signal.js';

const T = JSON.parse(readFileSync(new URL('../data/temps-localisation.json', import.meta.url), 'utf-8'));
const brut = new Uint8Array(readFileSync(new URL('./references/miniseed/steim2.mseed', import.meta.url)));

// copie d'un enregistrement sous une autre voie (octets 15 à 17 de l'en-tête)
const voie = (o, v) => { const c = o.slice(); for (let i = 0; i < 3; i++) c[15 + i] = v.charCodeAt(i); return c; };

test('fichier d\'un séisme : écrit puis relu, trois composantes, coups en m/s, grille commune', () => {
  const recs = M.lire(brut), debut = recs[0].debut, fin = debut + 20000;
  assert.ok(recs.every(r => r.brut.length === r.longueur));
  const enregistrements = [];
  for (const r of recs) enregistrements.push(r.brut, voie(r.brut, 'BHN'), voie(r.brut, 'BHE'));
  const texte = D.ecrire({
    seisme: { id: 'essai', temps: debut + 5000, lat: 37, lon: 22, h: 10, mag: 4.5, typeMag: 'mb', region: 'Grèce' }, debut, fin,
    stations: [{ reseau: 'GE', station: 'TEST', emplacement: '00', voie: 'BHZ', lat: 38, lon: 23, sensibilite: 1e9 }, { reseau: 'GE', station: 'VIDE', emplacement: '', voie: 'BHZ', lat: 36, lon: 21, sensibilite: 1e9 }],
    enregistrements,
  });
  const f = D.lire(texte);
  assert.equal(f.seisme.temps, Math.trunc(debut + 5000)); // heures écrites à la milliseconde
  assert.deepEqual(f.ecartees, ['GE.VIDE']);
  assert.equal(f.stations.length, 1);
  const s = f.stations[0];
  assert.deepEqual(s.voies, ['BHZ', 'BHN', 'BHE']);
  assert.equal(f.dt, 1 / 20); assert.equal(f.n, 400);
  // valeurs : (coups − moyenne) / sensibilité, identiques sur les trois composantes
  const x = Float64Array.from(recs.flatMap(r => Array.from(r.echantillons))).subarray(0, 400), m = x.reduce((a, b) => a + b, 0) / x.length;
  for (const i of [0, 37, 211, 399]) for (const c of [0, 1, 2]) assert.ok(Math.abs(s.series[c][i] - (x[i] - m) / 1e9) < 1e-15, `${c} ${i}`);
  for (const faux of ['pas du json', '{"format":"autre"}', JSON.stringify({ format: 'sismo-seisme', version: 9 })]) assert.throws(() => D.lire(faux), /fichier|version/);
});

test('rééchantillonnage : un sinus de 1 Hz à 100 Hz ramené à 20 Hz garde sa forme', () => {
  const x = Float64Array.from({ length: 2000 }, (_, i) => Math.sin(2 * Math.PI * i / 100)), y = D.reechantillonner(x, 100, 20);
  assert.equal(y.length, 400);
  let e = 0;
  for (let j = 10; j < 390; j++) e = Math.max(e, Math.abs(y[j] - Math.sin(2 * Math.PI * j / 20) * 0.9935));
  assert.ok(e < 0.01, `écart ${e}`);
});

test('table de la localisation : croûte du cours jusqu\'à 1°, ak135 au-delà de 2°, sans saut entre les deux', () => {
  const R = G.R * Math.PI / 180;
  for (const h of [5, 10, 30]) {
    const c = S.temps(0.75 * R, h);
    assert.ok(Math.abs(L.temps(T, 'P', h, 0.75) - c.tP) < 0.01);
    for (const d of [3, 20, 60, 90]) {
      assert.ok(Math.abs(L.temps(T, 'P', h, d) - G.arrivees('P', h, d)[0].temps) < 0.02, `P ${h} ${d}`);
      assert.ok(Math.abs(L.temps(T, 'S', h, d) - Math.min(...G.arrivees('S', h, d).map(a => a.temps))) < 0.02, `S ${h} ${d}`);
    }
    for (let d = 0.25; d <= 3; d += 0.25) {
      const a = L.temps(T, 'P', h, d - 0.25), b = L.temps(T, 'P', h, d);
      assert.ok(b > a && b - a < 5, `P croissant et sans saut vers ${d}°`);
    }
  }
  assert.equal(L.temps(T, 'P', 10, 150), null);
  assert.ok(Math.abs(L.distanceSP(T, L.temps(T, 'S', 10, 7) - L.temps(T, 'P', 10, 7), 10) - 7) < 1e-3);
});

test('localisation sur la sphère : un séisme synthétique est retrouvé (épicentre, profondeur, heure)', () => {
  const vrai = { lat: 37.3, lon: 21.4, h: 12, t0: 100 };
  const st = [[38.0, 23.7], [35.3, 25.1], [39.6, 19.9], [40.6, 22.9], [36.9, 27.3], [41.9, 12.5], [35.9, 14.5]].map(([lat, lon]) => ({ lat, lon }));
  const lec = st.map(s => { const d = L.distanceAzimut(vrai.lat, vrai.lon, s.lat, s.lon).distance; return { tP: vrai.t0 + L.temps(T, 'P', vrai.h, d), tS: vrai.t0 + L.temps(T, 'S', vrai.h, d) }; });
  const r = L.localiser(st, lec, T);
  assert.ok(L.distanceAzimut(r.lat, r.lon, vrai.lat, vrai.lon).distance < 0.02);
  assert.ok(Math.abs(r.h - vrai.h) <= 1 && Math.abs(r.t0 - vrai.t0) < 0.2 && r.rms < 0.05);
  assert.ok(r.residus.every(x => Math.abs(x.dP) < 0.1));
  assert.ok(r.gap > 0 && r.gap < 360);
  // trop peu de lectures
  assert.equal(L.localiser(st.slice(0, 2), lec.slice(0, 2), T), null);
});
