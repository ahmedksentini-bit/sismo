// Traitements de la page « En direct » (src/sismo/direct.js et src/sismo/fdsn.js) : filtres de Butterworth comme
// scipy (butter + sosfilt), STA/LTA et déclenchements comme ObsPy, distances comme ObsPy (locations2degrees) ; tampon
// d'une voie (trous, recouvrements, durée gardée) ; lecture des réponses FDSN et validation des requêtes du relais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import D from '../src/sismo/direct.js';
import F from '../src/sismo/fdsn.js';
import G from '../src/sismo/globe.js';

const ref = JSON.parse(readFileSync(new URL('./references/direct.json', import.meta.url), 'utf-8'));

test('Butterworth passe-bande causal : la sortie de scipy (butter + sosfilt), à 1e-9 près', () => {
  for (const f of ref.filtres) {
    const y = D.filtrer(ref.x, D.butterPasseBande(f.ordre, f.fmin, f.fmax, f.fs)), m = Math.max(...f.sortie.map(Math.abs));
    let e = 0;
    y.forEach((v, i) => { e = Math.max(e, Math.abs(v - f.sortie[i])); });
    assert.ok(e < 1e-9 * Math.max(1, m), `ordre ${f.ordre}, ${f.fmin}–${f.fmax} Hz à ${f.fs} Hz : écart ${e}`);
  }
  // un trou (NaN) remet le filtre à zéro sans propager de NaN
  const x = Array.from(ref.x.slice(0, 400)); x[200] = NaN;
  const y = D.filtrer(x, D.butterPasseBande(2, 0.5, 2, 20));
  assert.ok(Number.isNaN(y[200]) && y.filter(Number.isNaN).length === 1);
});

test('STA/LTA classique et déclenchements : ceux d\'ObsPy', () => {
  const s = ref.stalta, r = D.staLta(ref.x, s.nsta, s.nlta);
  r.forEach((v, i) => assert.ok(Math.abs(v - s.r[i]) <= 1e-9 * Math.max(1, Math.abs(s.r[i])), `r[${i}] ${v} contre ${s.r[i]}`));
  assert.deepEqual(D.declenchements(r, s.on, s.off), s.declenchements);
  assert.ok(s.declenchements.length >= 1);
});

test('distance sur la sphère : celle d\'ObsPy ; azimuts des cas simples', () => {
  for (const d of ref.distances) assert.ok(Math.abs(D.distanceAzimut(...d.p).distance - d.degres) < 1e-9, d.p.join(' '));
  assert.ok(Math.abs(D.distanceAzimut(0, 0, 0, 90).azimut - 90) < 1e-9);
  assert.ok(Math.abs(D.distanceAzimut(0, 0, 10, 0).azimut) < 1e-9);
  assert.ok(Math.abs(D.distanceAzimut(10, 0, 0, 0).azimut - 180) < 1e-9);
  assert.ok(Math.abs(D.distanceAzimut(0, 0, 0, 90).km - G.R * Math.PI / 2) < 1e-6);
});

test('tampon d\'une voie : enregistrements bout à bout, recouvrement retiré, trou en NaN, durée gardée', () => {
  const v = D.voie(60000), t0 = Date.UTC(2026, 9, 4, 20, 0, 0), rec = (debut, n, base) => ({ debut, cadence: 20, echantillons: Float64Array.from({ length: n }, (_, i) => base + i) });
  v.ajouter(rec(t0, 100, 0));
  v.ajouter(rec(t0 + 5000, 100, 100));          // bout à bout
  v.ajouter(rec(t0 + 7500, 100, 150));          // recouvre les 50 derniers : seuls les 50 nouveaux restent
  assert.deepEqual(v.segments(), [{ debut: t0, cadence: 20, n: 250 }]);
  v.ajouter(rec(t0 + 20000, 20, 1000));         // trou de 7,5 s
  const e = v.extraire(t0, t0 + 21000);
  assert.equal(e.donnees.length, 420);
  assert.equal(e.donnees[249], 249); assert.ok(Number.isNaN(e.donnees[260])); assert.equal(e.donnees[400], 1000);
  v.ajouter(rec(t0 + 100000, 20, 5000));        // 61 s plus tard : le début est oublié
  assert.ok(v.segments().every(s => s.debut >= t0 + 101000 - 60000 - 1));
  assert.equal(v.fin(), t0 + 101000);
  assert.ok(Math.abs(D.latence(v.fin(), t0 + 103000) - 2) < 1e-9);
});

test('arrivées prévues : premières arrivées ak135 et ondes de Rayleigh, dans l\'ordre', () => {
  const a = D.arrivees(60, 30), nom = a.map(x => x.phase);
  assert.equal(nom[0], 'P');
  assert.ok(nom.includes('pP') && nom.includes('S') && nom.at(-1) === 'LR');
  assert.ok(Math.abs(a[0].temps - G.arrivees('P', 30, 60)[0].temps) < 1e-9);
  assert.ok(D.arrivees(120, 30).every(x => x.phase !== 'P'), 'zone d\'ombre : pas de P directe à 120°');
});

test('FDSN : lecture des voies et des séismes au format texte, choix d\'une verticale, requêtes du relais', () => {
  const texteVoies = `#Network | Station | Location | Channel | Latitude | Longitude | Elevation | Depth | Azimuth | Dip | SensorDescription | Scale | ScaleFreq | ScaleUnits | SampleRate | StartTime | EndTime
GE|AAA||BHZ|36.5|10.1|120.0|0.0|0.0|-90.0|STS-2|6.0E8|1.0|M/S|20.0|2010-01-01T00:00:00|
GE|AAA||HHZ|36.5|10.1|120.0|0.0|0.0|-90.0|STS-2|6.0E8|1.0|M/S|100.0|2010-01-01T00:00:00|
GE|AAA||BHN|36.5|10.1|120.0|0.0|0.0|0.0|0.0|STS-2|6.0E8|1.0|M/S|20.0|2010-01-01T00:00:00|
GE|BBB|00|HHZ|38.0|23.7|80.0|0.0|0.0|-90.0|Trillium|1.2E9|1.0|M/S|100.0|2015-01-01T00:00:00|
GE|CCC||BHZ|41.0|29.0|50.0|0.0|0.0|-90.0|STS-2|6.0E8|1.0|M/S|20.0|2005-01-01T00:00:00|2012-01-01T00:00:00
`;
  const v = F.voies(texteVoies), choix = F.choisirVoies(v, Date.UTC(2026, 9, 4));
  assert.equal(v.length, 5);
  assert.deepEqual(choix.map(x => `${x.station}.${x.emplacement}.${x.voie}`), ['AAA..BHZ', 'BBB.00.HHZ']);
  assert.equal(choix[0].sensibilite, 6e8);
  const ev = F.evenements(`#EventID | Time | Latitude | Longitude | Depth/km | Author | Catalog | Contributor | ContributorID | MagType | Magnitude | MagAuthor | EventLocationName
gfz2026tlah|2026-10-04T18:12:33.21|35.12|23.44|18.0|GFZ|GEOFON|GFZ|gfz2026tlah|mb|4.6|GFZ|Crete, Greece
`);
  assert.deepEqual(ev[0], { id: 'gfz2026tlah', temps: Date.UTC(2026, 9, 4, 18, 12, 33, 210), lat: 35.12, lon: 23.44, h: 18, mag: 4.6, typeMag: 'mb', region: 'Crete, Greece', auteur: 'GFZ' });
  assert.equal(F.heure(Date.UTC(2026, 9, 4, 18, 12, 33, 900)), '2026-10-04T18:12:33');
  const ok = F.requete('dataselect', { network: 'GE', station: 'AAA,BBB', channel: 'BHZ,HHZ', starttime: '2026-10-04T18:00:00', endtime: '2026-10-04T18:30:00' });
  assert.equal(ok.chemin, '/fdsnws/dataselect/1/query');
  for (const [s, p] of [
    ['dataselect', { network: 'GE', station: '*', channel: 'BHZ', starttime: '2026-10-04T18:00:00', endtime: '2026-10-04T18:30:00' }],
    ['dataselect', { network: 'GE', station: 'AAA', channel: 'BHZ', starttime: '2026-10-04T10:00:00', endtime: '2026-10-04T18:30:00' }],
    ['station', { network: 'GE', format: 'xml' }],
    ['station', { network: 'GE', autre: '1' }],
    ['event', { limit: '100000', format: 'text' }],
    ['event', { format: 'text', minmagnitude: '5;rm' }],
    ['admin', {}],
  ]) assert.ok(F.requete(s, p).erreur, `${s} ${JSON.stringify(p)} refusé`);
});

test('préparation avant filtrage : décalage retiré, départ adouci, le filtre ne sonne plus sur la marche du début', () => {
  // coups d'un numériseur : grand décalage constant plus un petit signal ; filtre étroit de 18 à 22 s
  const fs = 20, n = 20 * 60 * fs, x = Float64Array.from({ length: n }, (_, i) => 250000 + 30 * Math.sin((2 * Math.PI * i) / (5 * fs)));
  const sos = D.butterPasseBande(4, 1 / 22, 1 / 18, fs), fin = y => Math.max(...Array.from(y.subarray(n / 2), Math.abs));
  const brut = D.filtrer(x, sos), prep = D.filtrer(D.preparer(x, 1, 20 * fs), sos);
  const debut = y => Math.max(...Array.from(y.subarray(0, 120 * fs), Math.abs));
  // sans préparation, la marche de 250 000 coups fait sonner le filtre étroit pendant plus de dix minutes
  assert.ok(debut(brut) > 10000 && fin(brut) > 1, `sans préparation : ${debut(brut).toFixed(0)} puis ${fin(brut).toFixed(1)}`);
  assert.ok(debut(prep) < 1 && fin(prep) < 0.01, `avec préparation : ${debut(prep).toFixed(3)} puis ${fin(prep)}`);
  // un trou (NaN) reste un trou et la reprise est adoucie à son tour
  const t = Float64Array.from(x); for (let i = 1000; i < 1100; i++) t[i] = NaN;
  const p = D.preparer(t, 2, 40);
  assert.ok(Number.isNaN(p[1050]) && Math.abs(p[1100]) < 1e-9 && Math.abs(p[0]) < 1e-9);
  assert.ok(Math.abs(p[2000] - 2 * (x[2000] - 250000)) < 1, 'facteur appliqué, moyenne retirée');
});

test('sismogrammes d\'un séisme passé : trois stations proches puis distances réparties ; fenêtre jusqu\'aux dernières ondes', () => {
  const e = { lat: 38, lon: 23, h: 10, temps: Date.UTC(2026, 9, 4, 12, 0, 0) };
  const st = Array.from({ length: 30 }, (_, i) => ({ station: `S${i}`, lat: 38, lon: 23 + 0.5 * (i + 1) }));
  const r = D.stationsSeisme(st, e, 10);
  assert.equal(r.length, 10);
  assert.deepEqual(r.slice(0, 3).map(x => x.s.station), ['S0', 'S1', 'S2']);
  assert.equal(r.at(-1).s.station, 'S29', 'la plus lointaine est gardée');
  assert.ok(r.every((x, i) => !i || x.distance > r[i - 1].distance));
  assert.equal(D.stationsSeisme(st.slice(0, 4), e, 10).length, 4);
  // fenêtre : séisme proche (S puis 2 min, 4 min au moins) ; téléséisme (ondes de surface), moins de 2 h
  const proche = D.fenetreSeisme(e, [0.5, 1]);
  assert.equal(proche.debut, e.temps - 60000);
  assert.equal(proche.fin, e.temps + 240000);
  const loin = D.fenetreSeisme(e, [5, 60]), lr = D.arrivees(60, 10).at(-1);
  assert.equal(lr.phase, 'LR');
  assert.ok(Math.abs(loin.fin - (e.temps + (lr.temps + 120) * 1000)) < 1);
  assert.ok(D.fenetreSeisme(e, [170]).fin - (e.temps - 60000) < 2 * 3600 * 1000);
});
