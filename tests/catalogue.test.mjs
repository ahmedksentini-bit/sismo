// Catalogue réel du banc « sismicité » (src/sismo/catalogue.js) : lecture du texte FDSN, du CSV et du GeoJSON de l'USGS,
// des tableaux à en-tête (français ou anglais, virgule décimale) ; messages d'erreur ; années décimales ; résumé et types
// de magnitude ; déclusterage aux conventions d'HMTK, identique à HMTK sur le catalogue de référence ; requêtes du relais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import C from '../src/sismo/catalogue.js';
import Fdsn from '../src/sismo/fdsn.js';
import Centres from '../src/sismo/centres.js';

const proche = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const ms = iso => Date.parse(iso);

test('texte FDSN (GEOFON) : heures en ms UTC, position, profondeur, magnitude et type, rangés dans le temps', () => {
  const r = C.lire(`#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType
gfz2024abcd|2024-03-02T10:15:30.250|36.81|10.18|12.0|GFZ|GEOFON|GFZ|gfz2024abcd|mb|4.6|GFZ|Tunisia|earthquake
gfz2024abce|2024-01-15T00:00:01.5|35.20|-3.90|33.5|GFZ|GEOFON|GFZ|gfz2024abce|Mw|5.1|GFZ|Strait of Gibraltar|earthquake
`);
  assert.equal(r.format, 'fdsn');
  assert.equal(r.evenements.length, 2);
  const [a, b] = r.evenements;
  assert.deepEqual(a, { t: ms('2024-01-15T00:00:01.500Z'), lat: 35.2, lon: -3.9, h: 33.5, mag: 5.1, typeMag: 'Mw', id: 'gfz2024abce' });
  assert.equal(b.t, ms('2024-03-02T10:15:30.250Z'));
  assert.equal(b.typeMag, 'mb');
  assert.equal(r.rejetees, 0);
});

test('texte FDSN (INGV) : Depth/Km, microsecondes, tir de carrière écarté, ligne illisible comptée', () => {
  const r = C.lire(`#EventID|Time|Latitude|Longitude|Depth/Km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType
38001|2023-05-01T12:00:00.123456|42.5|13.2|9.8|SURVEY-INGV||||ML|2.3|--|2 km E Norcia (PG)|earthquake
38002|2023-05-01T12:30:00.000000|42.6|13.1|0.5|SURVEY-INGV||||ML|1.9|--|Cava|quarry blast
38003|2023-05-01T13:00:00.000000|xx|13.1|8.0|SURVEY-INGV||||ML|1.2|--|?|earthquake
38004|2023-05-02T01:02:03.500000|42.4|13.3||SURVEY-INGV||||Mw|4.1|--|Norcia|earthquake
`);
  assert.equal(r.format, 'fdsn');
  assert.equal(r.evenements.length, 2);
  assert.equal(r.evenements[0].t, ms('2023-05-01T12:00:00.123Z') + 0.456);
  assert.equal(r.evenements[1].h, null);
  assert.deepEqual(r.ecartes, { 'quarry blast': 1 });
  assert.equal(r.rejetees, 1);
  assert.deepEqual(r.rejets, [{ ligne: 4, raison: 'position illisible' }]);
  assert.equal(r.lignes, 4);
});

test('CSV de l\'USGS : champs entre guillemets avec virgules, heures en Z, explosion écartée', () => {
  const r = C.lire(`time,latitude,longitude,depth,mag,magType,nst,gap,dmin,rms,net,id,updated,place,type,horizontalError,depthError,magError,magNst,status,locationSource,magSource
2024-01-01T07:10:09.476Z,37.4874,137.2710,10,7.5,mww,,26,2.249,0.86,us,us6000m0xl,2024-04-02T15:30:59.040Z,"2024 Noto Peninsula, Japan earthquake",earthquake,5.68,1.835,0.036,73,reviewed,us,us
2024-01-01T07:18:43.640Z,37.2,137.0,8.5,4.6,mb,,80,2.1,0.7,us,us6000m0xm,2024-03-01T00:00:00.000Z,"20 km NE of Wajima, Japan",earthquake,4,2,0.1,20,reviewed,us,us
2024-01-02T00:00:00.000Z,40.0,-120.0,0,2.1,ml,,,,,nc,nc7000,2024-01-03T00:00:00.000Z,"5 km S of Somewhere, CA",explosion,,,,,reviewed,nc,nc
`);
  assert.equal(r.format, 'usgs');
  assert.equal(r.evenements.length, 2);
  assert.deepEqual(r.evenements[0], { t: ms('2024-01-01T07:10:09.476Z'), lat: 37.4874, lon: 137.271, h: 10, mag: 7.5, typeMag: 'mww', id: 'us6000m0xl' });
  assert.deepEqual(r.ecartes, { explosion: 1 });
});

test('GeoJSON de l\'USGS (heure en ms) et de l\'EMSC (heure ISO, profondeur en propriété)', () => {
  const usgs = C.lire(JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', id: 'us1', properties: { mag: 6.1, time: ms('2020-02-03T04:05:06Z'), type: 'earthquake', magType: 'mww' }, geometry: { type: 'Point', coordinates: [-71.5, -33.2, 35] } },
    { type: 'Feature', id: 'us2', properties: { mag: null, time: ms('2020-02-04T04:05:06Z'), type: 'earthquake', magType: 'mb' }, geometry: { type: 'Point', coordinates: [-71, -33, 30] } },
  ] }));
  assert.equal(usgs.format, 'geojson');
  assert.deepEqual(usgs.evenements, [{ t: ms('2020-02-03T04:05:06Z'), lat: -33.2, lon: -71.5, h: 35, mag: 6.1, typeMag: 'mww', id: 'us1' }]);
  assert.equal(usgs.rejetees, 1);
  const emsc = C.lire(JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', id: '20240101_0000001', geometry: { type: 'Point', coordinates: [10.1, 36.5, -10] }, properties: { time: '2024-01-01T10:00:00.5Z', lat: 36.5, lon: 10.1, depth: 10, evtype: 'ke', mag: 3.2, magtype: 'ml' } },
  ] }));
  assert.deepEqual(emsc.evenements[0], { t: ms('2024-01-01T10:00:00.500Z'), lat: 36.5, lon: 10.1, h: 10, mag: 3.2, typeMag: 'ml', id: '20240101_0000001' });
});

test('tableau à points-virgules en français : année, mois, jour… séparés, virgule décimale, Latin-1, ligne rejetée', () => {
  const csv = `Catalogue de travail (exemple)
Année;Mois;Jour;Heure;Minute;Seconde;Latitude (°N);Longitude (°E);Profondeur (km);Magnitude;Type
1998;3;7;14;5;12,5;35,812;10,64;8;4,2;ML
1857;12;16;;;;40,35;15,85;;6,9;Mw
2001;2;30;0;0;0;35;10;5;3,1;ML
2003;11;5;23;59;59,99;34,5;9,1;12,5;3,6;mb
`;
  // export d'un tableur en Windows-1252 : « Année » et « °N » ne sont pas de l'UTF-8
  const octets = Uint8Array.from([...csv].map(c => c.charCodeAt(0)));
  const r = C.lire(octets);
  assert.equal(r.format, 'tableau');
  assert.equal(r.separateur, ';');
  assert.equal(r.evenements.length, 3);
  const [hist, a, b] = r.evenements;
  assert.equal(hist.t, C.utc(1857, 12, 16));
  assert.equal(hist.h, null);
  assert.equal(hist.typeMag, 'Mw');
  assert.equal(a.t, ms('1998-03-07T14:05:12.500Z'));
  assert.deepEqual([a.lat, a.lon, a.h, a.mag, a.typeMag], [35.812, 10.64, 8, 4.2, 'ML']);
  assert.ok(proche(b.t, ms('2003-11-05T23:59:59.990Z'), 1e-6));
  assert.deepEqual(r.rejets, [{ ligne: 5, raison: 'date illisible' }]); // 30 février
  assert.equal(r.colonnes.annee, 'Année');
});

test('tableau TSV : date jj/mm/aaaa et heure séparées, colonne « Mw » comme magnitude', () => {
  const r = C.lire('Date\tHeure\tLat\tLon\tProf\tMw\tML\n06/02/2023\t01:17:34\t37,17\t37,03\t10\t7,8\t\n06/02/2023\t10:24:48,9\t38,02\t37,20\t7\t7,5\t7,6\n');
  assert.equal(r.evenements.length, 2);
  assert.equal(r.evenements[0].t, ms('2023-02-06T01:17:34Z'));
  assert.equal(r.evenements[1].t, ms('2023-02-06T10:24:48.900Z'));
  assert.deepEqual(r.evenements.map(e => [e.mag, e.typeMag]), [[7.8, 'Mw'], [7.5, 'Mw']]);
});

test('tableau CSV : colonne de date ISO avec décalage horaire, longitudes de 0 à 360, ordre mm/jj/aaaa reconnu', () => {
  const r = C.lire('id,datetime,lat,lon,depth,mag,magtype\nA,2010-02-27T03:34:08+00:00,-36.12,287.33,22.9,8.8,Mw\nB,2010-02-27 06:00:00+02:00,-35,-72,30,5.0,mb\n');
  assert.equal(r.evenements[0].t, ms('2010-02-27T03:34:08Z'));
  assert.ok(proche(r.evenements[0].lon, 287.33 - 360, 1e-9));
  assert.equal(r.evenements[1].t, ms('2010-02-27T04:00:00Z'));
  assert.equal(C.dateHeure('12/31/1999 23:00'), ms('1999-12-31T23:00:00Z'));
  assert.equal(C.dateHeure('05/04/2001'), ms('2001-04-05T00:00:00Z')); // ordre français par défaut
  assert.ok(Number.isNaN(C.dateHeure('2001-13-01')));
});

test('messages d\'erreur clairs', () => {
  assert.throws(() => C.lire(''), /fichier vide/);
  assert.throws(() => C.lire('bonjour\n1 2 3\n'), /en-tête introuvable/);
  assert.throws(() => C.lire('time,latitude,longitude,depth\n2024-01-01,1,2,3\n'), /ligne 1 : colonne introuvable : magnitude/);
  assert.throws(() => C.lire('date,lat,lon,mag\nhier,1,2,3\n'), /aucune date lisible/);
  assert.throws(() => C.lire('time,latitude,longitude,mag\n2024-01-01,1,2,\n'), /aucun séisme lisible \(ligne 2 : magnitude manquante\)/);
  assert.throws(() => C.lire('{"format":"sismo-seisme"}'), /features/);
  assert.throws(() => C.lire('{"a":'), /JSON illisible/);
});

test('années décimales : calendrier et convention d\'HMTK (au jour près, années de 365 jours)', () => {
  assert.ok(proche(C.anneeDecimale(ms('2024-07-01T00:00:00Z')), 2024 + 182 / 366));
  assert.ok(proche(C.anneeHMTK(ms('2024-07-01T18:00:00Z')), 2024 + 181 / 365));
  assert.ok(proche(C.anneeHMTK(ms('2023-01-01T00:00:00Z')), 2023));
  assert.ok(proche(C.depuisAnnee(C.anneeDecimale(ms('1999-05-17T12:34:56Z'))), ms('1999-05-17T12:34:56Z'), 0.05)); // ms : précision d'une année décimale en double
  assert.equal(new Date(C.utc(856, 12, 22)).getUTCFullYear(), 856);
  assert.equal(new Date(C.utc(42, 1, 1)).getUTCFullYear(), 42);
});

test('résumé : période, région, profondeurs, types de magnitude et familles (mélange signalé)', () => {
  const e = (t, mag, typeMag, h = 10) => ({ t: ms(t), lat: 36, lon: 10, h, mag, typeMag, id: '' });
  const s = C.resume([e('2000-01-01T00:00:00Z', 3.1, 'ML'), e('2001-01-01T00:00:00Z', 4.4, 'MLv', null), e('2002-01-01T00:00:00Z', 5.2, 'mb'), e('2003-01-01T00:00:00Z', 6.0, 'Mww', 25), e('2004-01-01T00:00:00Z', 5.8, 'Mwr', 3)]);
  assert.equal(s.n, 5);
  assert.deepEqual(s.h, [3, 25]);
  assert.equal(s.sansH, 1);
  assert.deepEqual(s.mag, [3.1, 6]);
  assert.deepEqual(s.familles.map(f => [f.famille, f.n]), [['ML', 2], ['Mw', 2], ['mb', 1]]);
  assert.ok(s.melange);
  assert.deepEqual(['Mww', 'mwr', 'MLv', 'mB', 'mb_Lg', 'Ms_20', 'Md', 'M', '', 'Mjma'].map(C.familleMag), ['Mw', 'Mw', 'ML', 'mb', 'mbLg', 'Ms', 'Md', 'M', '?', 'Mjma']);
  assert.ok(!C.resume([e('2000-01-01T00:00:00Z', 3, 'mww'), e('2000-02-01T00:00:00Z', 4, 'Mw')]).melange);
});

test('préparation de l\'analyse : classes de 0,1 et période d\'un fichier', () => {
  const ev = [{ t: ms('2010-01-01T00:00:00Z'), lat: 0, lon: 0, h: 1, mag: 3.26, typeMag: 'ML', id: '' }, { t: ms('2019-12-31T23:59:59Z'), lat: 0, lon: 0, h: 1, mag: 2.94, typeMag: 'ML', id: '' }];
  assert.deepEqual(C.pourAnalyse(ev).map(e => e.M), [3.3, 2.9]);
  const p = C.periode(ev);
  assert.ok(proche(p.debut, 2010) && proche(p.fin, 2020));
});

test('déclusterage d\'un catalogue réel : fenêtres de Gardner et Knopoff sur la sphère, précurseur du même jour compris', () => {
  const base = ms('2020-06-10T12:00:00Z'), j = 86400000;
  const ev = [
    { t: base, lat: 36, lon: 10, mag: 6.0 }, // choc principal
    { t: base + 3 * j, lat: 36.2, lon: 10.1, mag: 4.0 }, // réplique : 23 km, 3 jours
    { t: base + 200 * j, lat: 36.1, lon: 10, mag: 3.0 }, // 200 jours, 11 km : encore dans la fenêtre de M6 (T = 10^(0,5409·6 − 0,547) ≈ 511 j)
    { t: base + 2 * j, lat: 37, lon: 10, mag: 4.5 }, // 111 km : hors de la fenêtre (L(6) ≈ 53,4 km)
    { t: base - 2 * 3600000, lat: 36, lon: 10.05, mag: 3.5 }, // même jour, 2 h avant : rejoint l'amas (HMTK au jour près)
    { t: base - 2 * j, lat: 36, lon: 10.05, mag: 3.5 }, // deux jours avant : gardé (pas de fenêtre des précurseurs)
  ].map((e, i) => ({ ...e, h: 10, typeMag: 'Mw', id: String(i) }));
  const { drapeau, garde } = C.decluster(ev);
  assert.deepEqual([...drapeau], [0, 1, 1, 0, 1, 0]);
  assert.deepEqual(garde, [true, false, false, true, false, true]);
});

test('déclusterage d\'un catalogue lu identique à HMTK (catalogue de référence, GardnerKnopoffType1)', () => {
  const ref = JSON.parse(readFileSync(new URL('./references/hmtk.json', import.meta.url), 'utf-8')).gk;
  const r = C.lire(readFileSync(new URL('./references/catalogue.csv', import.meta.url), 'utf-8'));
  assert.equal(r.format, 'tableau');
  assert.equal(r.evenements.length, ref.n);
  // les séismes du même jour gardent l'ordre du fichier, celui d'HMTK
  const { drapeau } = C.decluster(r.evenements);
  const diff = [...drapeau].reduce((n, d, i) => n + (d !== ref.drapeau[i]), 0);
  assert.equal(diff, 0, `${diff} drapeaux différents sur ${ref.n}`);
});

test('cadre de la carte : marge, étendue minimale, antiméridien, monde entier', () => {
  const med = C.cadre([{ lat: 33, lon: 8 }, { lat: 37, lon: 11 }]);
  assert.ok(proche(med.lon[0], 9.5 - 3 * 1.16 / 2) && proche(med.lon[1], 9.5 + 3 * 1.16 / 2));
  assert.ok(proche(med.lat[0], 35 - 4 * 1.16 / 2) && proche(med.lat[1], 35 + 4 * 1.16 / 2));
  const seul = C.cadre([{ lat: -33, lon: -71 }]);
  assert.deepEqual(seul, { lon: [-72, -70], lat: [-34, -32] });
  // Fidji et Tonga : le cadre passe par 180° au lieu de couvrir 350° de longitude
  const fidji = C.cadre([{ lat: -18, lon: 177.5 }, { lat: -20, lon: 179.9 }, { lat: -21, lon: -175.2 }, { lat: -15, lon: -173.8 }]);
  assert.ok(fidji.lon[0] > 175 && fidji.lon[0] < 177.5 && fidji.lon[1] > 186.2 && fidji.lon[1] < 189, JSON.stringify(fidji));
  assert.ok(proche(C.lonDans(-175.2, fidji.lon[0]), 184.8, 1e-9) && proche(C.lonDans(177.5, fidji.lon[0]), 177.5, 1e-9));
  const monde = C.cadre([{ lat: 38, lon: 142 }, { lat: -33, lon: -71 }, { lat: 37, lon: 37 }, { lat: 61, lon: -147 }, { lat: -41, lon: 174 }]);
  assert.deepEqual(monde.lon, [-180, 180]);
  assert.ok(monde.lat[0] >= -90 && monde.lat[1] <= 90);
  // un catalogue tout à l'est de 180° (longitudes de 0 à 360 lues comme négatives) reste du bon côté
  const alaska = C.cadre([{ lat: 52, lon: -170 }, { lat: 55, lon: -160 }]);
  assert.ok(alaska.lon[0] < -170 && alaska.lon[1] > -160 && alaska.lon[1] < -150);
});

test('téléchargement : requêtes acceptées par le relais (texte, 500 au plus), pages suivantes, centres permis', () => {
  const q = { lat0: 30, lat1: 38, lon0: 7, lon1: 12, debut: ms('1990-01-01T00:00:00Z'), fin: ms('2025-01-01T00:00:00Z'), mmin: 3 };
  const { params, erreur } = C.requete(q);
  assert.equal(erreur, undefined);
  assert.equal(Fdsn.requete('event', params).erreur, undefined);
  assert.equal(params.limit, '500');
  assert.equal(params.format, 'text');
  assert.equal(params.orderby, 'time');
  assert.equal(params.starttime, '1990-01-01T00:00:00');
  assert.ok(C.requete({ ...q, lat0: 40 }).erreur);
  assert.ok(C.requete({ ...q, lon1: 200 }).erreur);
  assert.ok(C.requete({ ...q, mmin: NaN }).erreur);
  // page pleine : la suivante s'arrête à la seconde qui suit le plus ancien séisme reçu
  const suite = C.pageSuivante(params, { lignes: 500, tMin: ms('2011-04-05T06:07:08.900Z') });
  assert.equal(suite.endtime, '2011-04-05T06:07:09');
  assert.equal(Fdsn.requete('event', suite).erreur, undefined);
  assert.equal(C.pageSuivante(params, { lignes: 499, tMin: 0 }), null);
  assert.equal(C.pageSuivante(suite, { lignes: 500, tMin: ms('2011-04-05T06:07:08.100Z') }), null); // plus rien de neuf
  for (const c of C.CENTRES_EVENT) assert.ok(Centres.permis(c.id), c.id);
});
