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
import R from '../src/sismo/reel.js';

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

test('composantes : sensibilité propre, verticale remise vers le haut, horizontales tournées vers le nord et l\'est', () => {
  const recs = M.lire(brut), debut = recs[0].debut, fin = debut + 20000, enregistrements = [];
  for (const r of recs) enregistrements.push(r.brut, voie(r.brut, 'BH1'), voie(r.brut, 'BH2'));
  const f = D.lire(D.ecrire({
    seisme: { id: 'essai', temps: debut, lat: 37, lon: 22, h: 10, mag: 4 }, debut, fin, enregistrements,
    stations: [{ reseau: 'GE', station: 'TEST', emplacement: '00', voie: 'BHZ', lat: 38, lon: 23, sensibilite: 2e9,
      composantes: { BHZ: { sensibilite: 2e9, azimut: 0, pendage: 90 }, BH1: { sensibilite: 1e9, azimut: 30, pendage: 0 }, BH2: { sensibilite: 1e9, azimut: 120, pendage: 0 } } }],
  }));
  const s = f.stations[0], x = Float64Array.from(recs.flatMap(r => Array.from(r.echantillons))).subarray(0, 400), m = x.reduce((a, b) => a + b, 0) / x.length;
  assert.ok(s.retournee && s.tournee && !s.approchee);
  assert.deepEqual(s.voies, ['BHZ', 'BHN', 'BHE']);
  const c = Math.PI / 180;
  for (const i of [5, 120, 333]) {
    const y = (x[i] - m) / 1e9;
    assert.ok(Math.abs(s.series[0][i] + (x[i] - m) / 2e9) < 1e-15, 'verticale');
    assert.ok(Math.abs(s.series[1][i] - y * (Math.cos(30 * c) + Math.cos(120 * c))) < 1e-15, 'nord');
    assert.ok(Math.abs(s.series[2][i] - y * (Math.sin(30 * c) + Math.sin(120 * c))) < 1e-15, 'est');
  }
});

test('magnitude locale d\'une station : Wood-Anderson depuis la vitesse = vérité du générateur (depuis l\'accélération)', () => {
  const ev = S.generer({ Mw: 3.8, delta: 60, h: 10, baz: 40, graine: 5 }), vrai = S.mlVraie(ev);
  const wa = ['N', 'E'].map(c => S.woodAndersonVitesse(ev.vit[c], ev.dt));
  const r = R.magnitudeStation(wa, ev.dt, 0, ev.n * ev.dt, ev.tt.R);
  assert.ok(Math.abs(r.N.Anm / vrai.N.A - 1) < 1e-6 && Math.abs(r.E.Anm / vrai.E.A - 1) < 1e-6); // arrondis des FFT
  assert.ok(Math.abs(r.ML - vrai.ML) < 1e-6 && r.domaine);
  const reseau = R.magnitudeReseau([r, { ...r, ML: r.ML + 0.2 }, { ...r, R: 900, domaine: false, ML: 9 }]);
  assert.equal(reseau.n, 2);
  assert.ok(Math.abs(reseau.ML - (r.ML + 0.1)) < 1e-12);
});

test('polarité de la première P : sens du premier écart qui sort du bruit, 0 si rien ne sort', () => {
  const u = S.aleatoire(3), dt = 0.01, n = 1000, tP = 6;
  const trace = signe => Float64Array.from({ length: n }, (_, i) => 0.01 * u.gauss() + (i * dt >= tP ? signe * (1 - Math.exp(-(i * dt - tP) / 0.05)) : 0));
  assert.equal(R.polarite(trace(1), dt, tP), 1);
  assert.equal(R.polarite(trace(-1), dt, tP), -1);
  assert.equal(R.polarite(trace(0), dt, tP), 0);
});

test('angle de départ de la première P : croûte du cours sous 2°, ak135 au-delà', () => {
  const Me = { emergence: (d, h) => import('../src/sismo/mecanisme.js').then(m => m.default.emergence(d, h)) };
  return Me.emergence(0.5 * G.R * Math.PI / 180, 10).then(e => {
    assert.ok(Math.abs(L.emergence(T, 10, 0.5) - e.i) < 0.01);
    const p = G.arrivees('P', 10, 30)[0];
    assert.ok(Math.abs(L.emergence(T, 10, 30) - p.depart) < 0.01);
    assert.ok(L.emergence(T, 10, 0.5) > 90 && L.emergence(T, 10, 30) < 90, 'Pg monte, P télésismique descend');
  });
});

test('rai d\'un foyer vers une station : distance, azimut, angle de départ et arrivées de la table', () => {
  const f = { lat: 37, lon: 22, h: 10, t0: 60 }, st = { lat: 38.5, lon: 23.7 }, r = L.rai(T, f, st), d = L.distanceAzimut(37, 22, 38.5, 23.7);
  assert.equal(r.distance, d.distance); assert.equal(r.azimut, d.azimut);
  assert.ok(Math.abs(r.R - Math.hypot(L.km(d.distance), 10)) < 1e-9);
  assert.equal(r.tP, 60 + L.temps(T, 'P', 10, d.distance)); assert.equal(r.tS, 60 + L.temps(T, 'S', 10, d.distance));
  assert.equal(r.i, L.emergence(T, 10, d.distance));
  assert.equal(L.rai(T, f, { lat: -60, lon: -100 }).tP, null); // hors de la table
});

test('pointé automatique de la P (Akaike) : début du signal retrouvé, rapport signal sur bruit', () => {
  const u = S.aleatoire(8), dt = 0.02, n = 3000, tP = 31.37;
  const z = Float64Array.from({ length: n }, (_, i) => { const t = i * dt; return 0.2 * u.gauss() + (t >= tP ? Math.sin(2 * Math.PI * 2 * (t - tP)) * Math.exp(-(t - tP) / 3) * 3 : 0); });
  const p = R.pointerP(z, dt, tP + 2.5);
  assert.ok(Math.abs(p.t - tP) < 0.1, `pointé ${p.t}`);
  assert.ok(p.rapport > 5);
  assert.equal(R.pointerP(z, dt, -100), null);
});

test('spectre de la source : la vitesse donne le même spectre que l\'accélération ; fenêtre de bruit et bandes retenues', async () => {
  const So = (await import('../src/sismo/source.js')).default;
  const ev = S.generer({ Mw: 4.6, delta: 80, h: 10, baz: 30, graine: 12 }), iS = Math.round((ev.tt.tSg - 0.5 - ev.t0) / ev.dt), iP = Math.round((ev.tt.tP - ev.t0) / ev.dt);
  const a = So.analyserSerie(ev.acc.N, ev.acc.E, ev.dt, { R: ev.tt.R, iS }), v = So.analyserSerie(ev.vit.N, ev.vit.E, ev.dt, { R: ev.tt.R, iS, entree: 'vitesse' });
  // vitesse dérivée sur la série entière, avant la fenêtre : même accélération que le générateur (arrondis des FFT)
  a.corrige.forEach(([f, d], j) => assert.ok(Math.abs(Math.log(v.corrige[j][1] / d)) < 1e-6, `${f} Hz`));
  assert.ok(Math.abs(v.Mw - a.Mw) < 1e-6 && Math.abs(v.fc / a.fc - 1) < 1e-6);
  // l'analyse du générateur est celle de analyserSerie sur les accélérations
  const g = So.analyser(ev);
  assert.equal(g.Mw, a.Mw); assert.equal(g.fc, a.fc);
  // bruit blanc ajouté : la fenêtre de bruit finit 1 s avant P, les bandes noyées sont écartées
  const u = S.aleatoire(2), bruite = x => Float64Array.from(x, y => y + 1e-4 * u.gauss());
  const b = So.analyserSerie(bruite(ev.vit.N), bruite(ev.vit.E), ev.dt, { R: ev.tt.R, iS, iP, entree: 'vitesse' });
  assert.equal(b.bruitFenetre.i0 + b.bruitFenetre.n, iP - Math.round(1 / ev.dt));
  assert.equal(b.snr.length, b.corrige.length);
  assert.ok(b.retenues.some(x => !x) && b.retenues.filter(Boolean).length >= 6);
  assert.ok(Math.abs(b.Mw - v.Mw) < 0.2);
  // signal noyé partout : pas d'ajustement
  const noye = x => Float64Array.from(x, y => y + 1 * u.gauss());
  assert.equal(So.analyserSerie(noye(ev.vit.N), noye(ev.vit.E), ev.dt, { R: ev.tt.R, iS, iP, entree: 'vitesse' }).fit, null);
});
