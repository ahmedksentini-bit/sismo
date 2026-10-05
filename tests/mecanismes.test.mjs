// Mécanismes au foyer d'un catalogue (src/sismo/mecanismes.js) : fichiers ndk du Global CMT, QuakeML, tableaux à colonnes
// strike, dip, rake (bulletin de l'ISC), régimes de Zoback (1992) et bilan d'une zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/sismo/mecanismes.js';
import C from '../src/sismo/catalogue.js';

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
