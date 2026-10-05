// Centres de données de la page « En direct » (src/sismo/centres.js) : liste blanche des relais, serveurs SeedLink à
// essayer par station, réseaux temporaires, fusion des listes ; réseaux FDSN au format texte ; pays d'une station
// (polygones de Natural Earth produits par tools/carte/pays.py) ; identifiant d'un enregistrement lu sans le décoder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import C from '../src/sismo/centres.js';
import F from '../src/sismo/fdsn.js';
import D from '../src/sismo/direct.js';
import SL from '../src/sismo/seedlink.js';
import M from '../src/sismo/miniseed.js';

test('centres : identifiants uniques, services FDSN en https, serveurs SeedLink hôte:port, GEOFON en premier', () => {
  assert.equal(new Set(C.LISTE.map(c => c.id)).size, C.LISTE.length);
  assert.equal(C.LISTE[0].id, 'geofon');
  for (const c of C.LISTE) {
    assert.match(c.fdsn, /^https:\/\/[a-z0-9.-]+$/, c.id);
    for (const s of c.seedlink) assert.match(s, /^[a-z0-9.-]+:\d+$/, s);
  }
  assert.ok(C.permis('ingv') && !C.permis('toString') && !C.permis('ailleurs'));
  assert.ok(C.serveurPermis('geofon.gfz.de:18000') && !C.serveurPermis('evil.example:18000') && !C.serveurPermis('geofon.gfz.de:22'));
});

test('catalogues de séismes : EMSC pour le seul service event ; adresses des services', () => {
  assert.ok(C.servicePermis('emsc', 'event'));
  for (const sv of ['station', 'dataselect']) assert.ok(!C.servicePermis('emsc', sv), sv);
  assert.ok(C.servicePermis('geofon', 'station') && C.servicePermis('geofon', 'event'));
  assert.ok(!C.servicePermis('ailleurs', 'event') && !C.servicePermis('toString', 'event'));
  assert.equal(C.adresseFdsn('emsc'), 'https://www.seismicportal.eu');
  assert.equal(C.adresseFdsn('ingv'), 'https://webservices.ingv.it');
  assert.equal(C.adresseFdsn('ailleurs'), null);
  assert.ok(!C.permis('emsc'), 'un catalogue n\'est pas un centre de stations');
});

test('serveurs à essayer : celui du centre, puis GEOFON ; GEOFON une seule fois ; un centre inconnu va à GEOFON', () => {
  assert.deepEqual(C.candidats('ingv'), ['webservices.ingv.it:18000', C.GEOFON]);
  assert.deepEqual(C.candidats('geofon'), [C.GEOFON]);
  assert.deepEqual(C.candidats('inconnu'), [C.GEOFON]);
  assert.equal(C.centreDuServeur('rtserve.resif.fr:18000').id, 'resif');
  assert.equal(C.centreDuServeur('ailleurs:18000'), null);
});

test('réseaux temporaires (X, Y, Z ou chiffre) ; fusion : la première liste l\'emporte, ordre gardé', () => {
  assert.deepEqual(['GE', 'IV', 'Z3', 'XT', 'Y9', '1A', 'TT'].map(C.temporaire), [false, false, true, true, true, true, false]);
  const a = [{ reseau: 'GE', station: 'MTE', centre: 'geofon' }], b = [{ reseau: 'GE', station: 'MTE', centre: 'earthscope' }, { reseau: 'IU', station: 'ANTO', centre: 'earthscope' }];
  assert.deepEqual(C.fusionner([a, b]).map(s => `${s.reseau}.${s.station}@${s.centre}`), ['GE.MTE@geofon', 'IU.ANTO@earthscope']);
});

test('FDSN : réseaux au format texte ; emplacement « -- » lu comme vide', () => {
  const r = F.reseaux(`#Network | Description | StartTime | EndTime | TotalStations
GE|GEOFON Program, GFZ|1993-01-01T00:00:00||82
Z3|AlpArray|2015-01-01T00:00:00|2022-12-31T23:59:59|600
`);
  assert.deepEqual(r[0], { reseau: 'GE', description: 'GEOFON Program, GFZ', debut: Date.UTC(1993, 0, 1), fin: null, total: 82 });
  assert.equal(r[1].fin, Date.UTC(2022, 11, 31, 23, 59, 59));
  const v = F.voies(`#Network | Station | Location | Channel | Latitude | Longitude | Elevation | Depth | Azimuth | Dip | SensorDescription | Scale | ScaleFreq | ScaleUnits | SampleRate | StartTime | EndTime
IV|LPEL|--|HHZ|35.5|12.6|30.0|0.0|0.0|-90.0|Trillium|1.2E9|1.0|M/S|100.0|2010-01-01T00:00:00|
`);
  assert.equal(v[0].emplacement, '');
});

test('pays d\'une station : dans le polygone, sur la côte (marge), en mer ; trous et îles', () => {
  const P = JSON.parse(readFileSync(new URL('../data/pays-mediterranee.json', import.meta.url), 'utf-8')).pays;
  const code = (lat, lon) => { const p = D.pays(lat, lon, P); return p ? p.code : null; };
  assert.equal(code(36.80, 10.18), 'TN');   // Tunis
  assert.equal(code(33.88, 10.10), 'TN');   // Gabès
  assert.equal(code(36.90, 7.77), 'DZ');    // Annaba
  assert.equal(code(36.83, 11.95), 'IT');   // Pantelleria
  assert.equal(code(35.90, 14.50), 'MT');   // Malte
  assert.equal(code(41.90, 12.45), 'IT');   // Rome, autour du Vatican
  assert.equal(code(43.94, 12.45), 'SM');   // Saint-Marin, enclave : trou du polygone italien
  assert.equal(code(36.00, 13.00), null);   // canal de Sicile
  assert.equal(code(37.32, 9.75), 'TN');    // cap au nord de Bizerte, à quelques km au large du trait simplifié
  assert.equal(P.find(p => p.code === 'TN').nom, 'Tunisie');
});

test('identifiant d\'un enregistrement lu dans l\'en-tête : celui du décodage complet', () => {
  const dir = new URL('./references/miniseed/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const o = new Uint8Array(readFileSync(new URL(f, dir)));
    assert.equal(SL.identifiant(o.subarray(0, 512)), M.enregistrement(o).id, f);
  }
  assert.equal(SL.identifiant(new Uint8Array(10)), null);
});
