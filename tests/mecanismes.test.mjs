// Mécanismes au foyer d'un catalogue (src/sismo/mecanismes.js) : fichiers ndk du Global CMT, QuakeML, tableaux à colonnes
// strike, dip, rake (bulletin de l'ISC), régimes de Zoback (1992) et bilan d'une zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/sismo/mecanismes.js';
import C from '../src/sismo/catalogue.js';
import fs from 'node:fs';

const NDK = `PDE  2005/01/01 01:20:05.4  13.78  -88.78 193.1 5.0 0.0 EL SALVADOR
C200501010120A   B:  4    4  40 S: 27   33  50 M:  0    0   0 CMT: 1 TRIHD:  0.6
CENTROID:     -0.3 0.9  13.76 0.06  -89.08 0.09 162.8 12.5 FREE S-20050322125201
23  0.838 0.201 -0.005 0.231 -0.833 0.270  1.050 0.121 -0.369 0.161  0.044 0.240
V10   1.581 56  12  -0.537 23 140  -1.044 24 241   1.312   9 29  142 133 72   66
PDE  2005/01/01 01:42:24.9   7.29   93.92  30.0 5.1 0.0 NICOBAR ISLANDS, INDIA R
C200501010142A   B: 17   27  40 S: 41   58  50 M:  0    0   0 CMT: 1 TRIHD:  1.1
CENTROID:     -1.1 0.8   7.24 0.04   93.63 0.04  12.0  0.0 FIX  O-20050322125201
24  0.381 0.104 -0.384 0.101  0.003 0.096 -0.040 0.124 -0.084 0.123  0.311 0.103
V10   0.584 75 283   0.015 10  60  -0.599 11 152   0.592 245 56  -95  73 34  -81`;

test('régimes de Zoback (1992) : faille normale, inverse, décrochement, oblique', () => {
  assert.equal(M.regime({ azimut: 0, pendage: 45, glissement: -90 }), 'NF');
  assert.equal(M.regime({ azimut: 120, pendage: 30, glissement: 90 }), 'TF');
  assert.equal(M.regime({ azimut: 40, pendage: 90, glissement: 0 }), 'SS');
  assert.equal(M.regime({ azimut: 40, pendage: 89, glissement: 180 }), 'SS');
  assert.equal(M.REGIMES[M.regime({ azimut: 0, pendage: 60, glissement: -45 })].type === 'inverse', false);
});

test('Global CMT, format ndk : date, position, profondeur, Mw du moment scalaire, premier plan nodal', () => {
  const r = M.lire(NDK);
  assert.equal(r.format, 'ndk'); assert.equal(r.mecanismes.length, 2); assert.equal(r.rejetees, 0);
  const a = r.mecanismes[0];
  assert.equal(a.t, Date.UTC(2005, 0, 1, 1, 20, 5, 400)); assert.equal(a.lat, 13.78); assert.equal(a.lon, -88.78); assert.equal(a.h, 193.1);
  assert.deepEqual([a.azimut, a.pendage, a.glissement], [9, 29, 142]); assert.equal(a.id, 'C200501010120A');
  assert.ok(Math.abs(a.mag - (2 / 3) * (Math.log10(1.312e23) - 16.1)) < 0.006);
  assert.equal(M.REGIMES[M.regime(r.mecanismes[1])].type, 'normale'); // plans 245/56/−95 et 73/34/−81
});

test('QuakeML : première origine, magnitude, plan nodal 1 ; profondeur en mètres', () => {
  const q = `<?xml version="1.0"?><q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2" xmlns="http://quakeml.org/xmlns/bed/1.2"><eventParameters>
    <event publicID="smi:essai/1"><origin><time><value>2016-10-30T06:40:18.0Z</value></time><latitude><value>42.83</value></latitude><longitude><value>13.11</value></longitude><depth><value>9200</value></depth></origin>
    <magnitude><mag><value>6.5</value></mag><type>Mw</type></magnitude>
    <focalMechanism><nodalPlanes><nodalPlane1><strike><value>155</value></strike><dip><value>47</value></dip><rake><value>-89</value></rake></nodalPlane1></nodalPlanes></focalMechanism></event>
    <event publicID="smi:essai/2"><origin><time><value>2016-10-31T00:00:00Z</value></time><latitude><value>42</value></latitude><longitude><value>13</value></longitude></origin><magnitude><mag><value>3</value></mag></magnitude></event>
  </eventParameters></q:quakeml>`;
  const r = M.lire(q);
  assert.equal(r.format, 'quakeml'); assert.equal(r.mecanismes.length, 1); assert.equal(r.rejetees, 1);
  const a = r.mecanismes[0];
  assert.equal(a.h, 9.2); assert.equal(a.mag, 6.5); assert.equal(a.typeMag, 'Mw'); assert.deepEqual([a.azimut, a.pendage, a.glissement], [155, 47, -89]);
  assert.equal(M.regime(a), 'NF');
});

test('tableau à colonnes strike, dip, rake (bulletin de l\'ISC : préambule, colonnes en double) ; le catalogue garde le plan', () => {
  const isc = `ISC Bulletin - focal mechanisms
EVENT_ID,AUTHOR,DATE,TIME,LAT,LON,DEPTH,CENTROID,AUTHOR,EX,MO,MW,STRIKE,DIP,RAKE,STRIKE,DIP,RAKE
600123,ISC,2003-05-21,18:44:19.5,36.96,3.63,12.0,TRUE,GCMT,19,2.0,6.8,57,44,71,262,49,107
600124,ISC,2003-05-27,17:11:30.0,36.94,3.58,10.0,TRUE,GCMT,17,1.0,5.8,,,,,,`;
  const r = M.lire(isc);
  assert.equal(r.format, 'tableau'); assert.equal(r.mecanismes.length, 1); assert.equal(r.rejetees, 1);
  assert.deepEqual([r.mecanismes[0].azimut, r.mecanismes[0].pendage, r.mecanismes[0].glissement, r.mecanismes[0].mag], [57, 44, 71, 6.8]);
  assert.equal(M.regime(r.mecanismes[0]), 'TF');
  // un catalogue ordinaire, sans ces colonnes, n'a pas de mécanisme
  assert.throws(() => M.lire('time,latitude,longitude,mag\n2020-01-01T00:00:00Z,36,10,4'), /aucun mécanisme/);
  assert.equal(C.lire(isc).evenements[0].mec.glissement, 71);
});

test('bilan d\'une zone : effectifs par mécanisme, mécanisme dominant et glissement des lois d\'atténuation', () => {
  const inv = { azimut: 120, pendage: 30, glissement: 90 }, nor = { azimut: 0, pendage: 45, glissement: -90 }, dec = { azimut: 40, pendage: 90, glissement: 0 };
  const b = M.bilan([inv, inv, inv, nor, dec]);
  assert.deepEqual(b.parType, { normale: 1, inverse: 3, decrochement: 1, indetermine: 0 });
  assert.equal(b.dominant, 'inverse'); assert.equal(b.rake, 90);
  assert.equal(M.bilan([]).dominant, null);
});

// Extrait méditerranéen du Global CMT (tools/gcmt/extrait.mjs → data/mecanismes-mediterranee.json)
const MED = NDK.replace('13.78  -88.78', '38.10   20.50').replace('7.29   93.92', '36.40   10.20'); // les deux séismes du ndk ramenés dans le domaine

test('extrait « sismo-mecanismes » : domaine, doublons, écriture et relecture identiques à lireNdk', () => {
  const lu = M.lire(MED).mecanismes, dehors = M.lire(NDK).mecanismes;
  assert.equal(M.extraire([dehors]).length, 0, 'El Salvador et Nicobar hors du domaine');
  // le même séisme dans un fichier mensuel (même identifiant, ou autre identifiant à 2 s près) ne compte qu'une fois
  const ex = M.extraire([lu, [{ ...lu[0] }, { ...lu[1], id: 'Q' + lu[1].id, t: lu[1].t + 2000 }]]);
  assert.equal(ex.length, 2); assert.equal(ex[1].id, lu[1].id);
  const r = M.lire(M.ecrire({ source: { nom: 'essai' }, mecanismes: ex }));
  assert.equal(r.format, M.FORMAT); assert.equal(r.source.nom, 'essai'); assert.equal(r.rejetees, 0);
  r.mecanismes.forEach((m, i) => {
    const a = lu[i];
    assert.equal(m.t, a.t); assert.equal(m.id, a.id); assert.equal(m.typeMag, 'Mw');
    for (const k of ['lat', 'lon', 'h', 'mag']) assert.ok(Math.abs(m[k] - a[k]) <= 0.005, k);
    assert.deepEqual([m.azimut, m.pendage, m.glissement], [a.azimut, a.pendage, a.glissement]);
    assert.equal(M.regime(m), M.regime(a));
  });
  assert.throws(() => M.lireCompact({ format: M.FORMAT, version: 9, mecanismes: [] }), /version 9/);
});

test('extrait : catalogue dans le domaine, sélection sur la région et la période (antiméridien compris)', () => {
  assert.ok(M.couvre({ lon: [5, 12], lat: [30, 38] }));
  assert.ok(!M.couvre({ lon: [5, 60], lat: [30, 38] })); assert.ok(!M.couvre({ lon: [5, 12], lat: [10, 38] })); assert.ok(!M.couvre(null));
  const mk = (lon, lat, an) => ({ t: Date.UTC(an, 0, 1), lon, lat, id: `${lon}/${lat}/${an}` });
  const mecs = [mk(10, 36, 2000), mk(10, 36, 2015), mk(20, 36, 2000), mk(179, 0, 2000), mk(-179, 0, 2000)];
  const sel = M.selectionner(mecs, { cadre: { lon: [8, 12], lat: [35, 37] }, debut: Date.UTC(1999, 0, 1), fin: Date.UTC(2010, 0, 1) });
  assert.deepEqual(sel.map(m => m.id), ['10/36/2000']);
  assert.equal(M.selectionner(mecs, { cadre: { lon: [178, 182], lat: [-1, 1] } }).length, 2);
});

const EXTRAIT = new URL('../data/mecanismes-mediterranee.json', import.meta.url);
test('extrait livré : lisible, tous les mécanismes dans le domaine, plans nodaux valides', { skip: !fs.existsSync(EXTRAIT) && 'extrait absent : node tools/gcmt/extrait.mjs' }, () => {
  const j = JSON.parse(fs.readFileSync(EXTRAIT, 'utf8')), r = M.lire(fs.readFileSync(EXTRAIT, 'utf8'));
  assert.equal(r.rejetees, 0); assert.ok(r.mecanismes.length > 500, `${r.mecanismes.length} mécanismes`);
  assert.match(j.source.references.join(' '), /Dziewonski.*1981.*2825/); assert.match(j.source.references.join(' '), /Ekström.*2012.*200/);
  const ids = new Set();
  for (const m of r.mecanismes) {
    assert.ok(m.lon >= -20 && m.lon <= 50 && m.lat >= 22 && m.lat <= 53, m.id);
    assert.ok(m.mag > 3 && m.mag < 9 && m.pendage >= 0 && m.pendage <= 90, m.id);
    assert.ok(!ids.has(m.id), `doublon ${m.id}`); ids.add(m.id);
  }
  for (let i = 1; i < r.mecanismes.length; i++) assert.ok(r.mecanismes[i].t >= r.mecanismes[i - 1].t);
});
