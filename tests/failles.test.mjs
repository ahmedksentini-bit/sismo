// Failles actives réelles (src/sismo/failles.js) : triplets et sens du pendage de la base GEM, lecture du GeoJSON (écarts,
// vitesses recomposées), extrait « sismo-failles », failles retenues par zone (règle de la main droite, Mmax de Wells et
// Coppersmith), pas du maillage, modèle PSHA avec failles (Zones.modelePsha identique au modèle écrit à la main) et
// extrait méditerranéen livré (data/failles-mediterranee.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import F from '../src/sismo/failles.js';
import Faille from '../src/sismo/faille.js';
import Z from '../src/sismo/zones.js';
import P from '../src/sismo/psha.js';

const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≠ ${b} (± ${tol})`);
const ligne = (coords, props) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: props });

test('triplets « (préférée, min, max) » et sens du pendage de la base GEM', () => {
  assert.deepEqual(F.triplet('(0.2,0.1,0.4)'), { pref: 0.2, min: 0.1, max: 0.4 });
  assert.deepEqual(F.triplet('(15.0,,)'), { pref: 15, min: null, max: null });
  assert.equal(F.triplet('(,1,3)').pref, 2);
  assert.equal(F.triplet('(2.0, 1.0, 3.0)').pref, 2);
  for (const s of ['None', '', '(nan,,)', 'A huge range of rates', undefined]) assert.equal(F.triplet(s), null);
  assert.equal(F.azimutSens('NE'), 45); assert.equal(F.azimutSens('W, SW'), 270); assert.equal(F.azimutSens('SSE'), 157.5);
  assert.equal(F.azimutSens('135'), 135); assert.equal(F.azimutSens('360'), 0);
  assert.equal(F.azimutSens('VERTICAL'), null); assert.equal(F.azimutSens(''), null);
});

test('lecture du GeoJSON de la base GEM : écarts, partie la plus longue, vitesse nette recomposée', () => {
  const j = { type: 'FeatureCollection', features: [
    ligne([[10, 36], [10.5, 36.2]], { catalog_id: 'A1', catalog_name: 'SHARE', name: 'Faille A', slip_type: 'Normal', average_dip: '(60,50,70)', average_rake: '(-90,,)',
      net_slip_rate: '(0.5,0.2,0.8)', upper_seis_depth: '(1.0,,)', lower_seis_depth: '(12.0,,)', dip_dir: 'N' }),
    // composantes : décrochement 0,3 et rejet vertical 0,4 sur un pendage de 45° → pente 0,4/sin 45°
    ligne([[11, 36], [11, 36.5]], { catalog_id: 'B2', catalog_name: 'GEM_N_Africa', name: '', fs_name: 'Système B', slip_type: 'Dextral-Normal', average_dip: '(45,,)',
      net_slip_rate: '', strike_slip_rate: '(0.3,,)', vert_sep_rate: '(0.4, 0.3, 0.5)' }),
    // raccourcissement 1 mm/an (signe sans importance) sur un pendage de 30° → 1/cos 30°
    ligne([[12, 36], [12.3, 36.1]], { catalog_id: 'C3', catalog_name: 'GEM_N_Africa', slip_type: 'Reverse', average_dip: '(30,,)', shortening_rate: '(-1,,)' }),
    ligne([[13, 36], [13.2, 36.1]], { catalog_id: 'D4', catalog_name: 'EMME', slip_type: 'Subduction_Thrust' }),
    ligne([[14, 36], [14.2, 36.1]], { catalog_id: 'E5', catalog_name: 'Bird 2003', slip_type: 'Dextral' }),
    ligne([[15, 36], [15.2, 36.1]], { catalog_id: 'F6', catalog_name: 'EMME' }),
    { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[[20, 40], [20.1, 40]], [[21, 40], [21, 40.6]]] }, properties: { catalog_id: 'G7', catalog_name: 'EMME', slip_type: 'Sinistral' } },
  ] };
  const r = F.lire(JSON.stringify(j));
  assert.equal(r.format, 'gem');
  assert.deepEqual(r.ecartees, { type: 2, plaques: 1, geometrie: 0 });
  assert.deepEqual(r.failles.map(f => f.id), ['A1', 'B2', 'C3', 'G7']);
  const [a, b, c, g] = r.failles;
  assert.equal(a.nom, 'Faille A'); assert.equal(a.pendage, 60); assert.equal(a.rake, -90); assert.equal(a.zHaut, 1); assert.equal(a.zBas, 12); assert.equal(a.sens, 0);
  assert.deepEqual(a.glissement, { pref: 0.5, min: 0.2, max: 0.8 });
  assert.equal(b.nom, 'Système B'); proche(b.glissement.pref, Math.hypot(0.3, 0.4 / Math.sin(Math.PI / 4)), 1e-12); assert.ok(b.glissement.recompose);
  proche(c.glissement.pref, 1 / Math.cos(Math.PI / 6), 1e-12);
  assert.deepEqual(g.trace, [[21, 40], [21, 40.6]]); assert.equal(g.glissement, null);
  // défauts du type : décrochement senestre vertical, profondeurs 0–15 km, vitesse absente
  const p = F.parametres(g);
  assert.deepEqual([p.pendage, p.rake, p.zHaut, p.zBas, p.glissement], [90, 0, 0, 15, null]);
  assert.deepEqual(p.defauts, ['pendage', 'rake', 'profondeurs', 'glissement']);
  assert.equal(F.parametres(g, { glissementDefaut: 0.2 }).glissement, 0.2);
  assert.throws(() => F.lire('{"type":"FeatureCollection","features":[]}'), /aucune faille/);
  assert.throws(() => F.lire('pas du json'), /JSON illisible/);
  assert.throws(() => F.lire('{"format":"autre"}'), /ni GeoJSON/);
});

test('extrait « sismo-failles » : écrit puis relu, traces simplifiées', () => {
  const failles = [{ id: 'A1', nom: 'Faille A', catalogue: 'SHARE', type: 'Normal', pendage: 60, rake: -90, glissement: { pref: 0.5, min: 0.2, max: 0.8 },
    zHaut: 1, zBas: 12, sens: 0, trace: [[10.12345, 36.1], [10.5, 36.2]] },
  { id: 'B2', nom: '', catalogue: 'EMME', type: 'Dextral', pendage: null, rake: null, glissement: null, zHaut: null, zBas: null, sens: null, trace: [[11, 36], [11, 36.5]] }];
  const r = F.lire(F.ecrire({ source: { licence: 'CC BY-SA 4.0' }, failles }));
  assert.equal(r.format, F.FORMAT); assert.equal(r.source.licence, 'CC BY-SA 4.0');
  assert.deepEqual(r.failles[0].trace, [[10.123, 36.1], [10.5, 36.2]]);
  assert.deepEqual({ ...r.failles[0], trace: null }, { ...failles[0], trace: null, glissement: { pref: 0.5, min: 0.2, max: 0.8 } });
  assert.equal(r.failles[1].glissement, null); assert.equal(r.failles[1].pendage, null);
  // Douglas-Peucker : les points alignés disparaissent, le coude reste
  const t = [[10, 36], [10.1, 36], [10.2, 36.0001], [10.3, 36], [10.3, 36.2]];
  assert.deepEqual(F.simplifier(t, 0.001), [[10, 36], [10.3, 36], [10.3, 36.2]]);
});

test('failles retenues : milieu dans une zone, vitesse, longueur ; pendage à droite ; Mmax de la rupture entière', () => {
  const zones = [{ polygone: [[9, 35], [12, 35], [12, 38], [9, 38]], mmax: 6.5 }, { polygone: [[13, 35], [15, 35], [15, 38], [13, 38]], mmax: 7 }];
  const base = { catalogue: 'EMME', type: 'Reverse', pendage: 40, rake: 90, glissement: { pref: 0.6, min: null, max: null }, zHaut: 0, zBas: 15 };
  const failles = [
    // tracée du nord au sud (direction 180°, pendage vers l'ouest par la règle de la main droite) mais pendage vers l'est : retournée
    { ...base, id: 'f1', nom: 'Est', sens: 90, trace: [[10, 37], [10, 36.5], [10, 36]] },
    // tracée du sud au nord, pendage vers l'est : gardée
    { ...base, id: 'f2', nom: 'Gardée', sens: 90, trace: [[13.5, 36], [13.5, 37]] },
    { ...base, id: 'f3', nom: 'Hors zone', sens: null, trace: [[12.4, 36], [12.6, 36.5]] },
    { ...base, id: 'f4', nom: 'Sans vitesse', sens: null, glissement: null, trace: [[10.5, 36], [10.5, 36.5]] },
    { ...base, id: 'f5', nom: 'Courte', sens: null, trace: [[11, 36], [11, 36.02]] },
  ];
  const r = F.retenir(failles, zones);
  assert.deepEqual(r.retenues.map(f => f.id), ['f1', 'f2']);
  assert.deepEqual(r.ecartees, { horsZones: 1, sansVitesse: 1, tropCourtes: 1 });
  const [f1, f2] = r.retenues;
  assert.deepEqual(f1.extremites, [[10, 36], [10, 37]]); assert.equal(f1.zone, 0);
  assert.deepEqual(f2.extremites, [[13.5, 36], [13.5, 37]]); assert.equal(f2.zone, 1);
  proche(f1.L, F.distanceKm(10, 36, 10, 37), 1e-9); proche(f1.L, 111.19, 0.01);
  proche(f1.W, 15 / Math.sin(40 * Math.PI / 180), 1e-12);
  assert.equal(f1.mmax, Math.round(Faille.magnitudeFailleEntiere(f1.L * f1.W, 90) * 10) / 10);
  // une vitesse par défaut fait entrer la faille qui n'en a pas
  const r2 = F.retenir(failles, zones, { glissementDefaut: 0.1 });
  assert.equal(r2.retenues.find(f => f.id === 'f4').glissement, 0.1); assert.ok(r2.retenues.find(f => f.id === 'f4').defauts.includes('glissement'));
  // pas du maillage : moins de ruptures à pas plus grand ; le pas retenu respecte le budget
  const mm = zones.map(z => z.mmax), n1 = F.nombreRuptures(r.retenues, mm, 1), n5 = F.nombreRuptures(r.retenues, mm, 5);
  assert.ok(n1 > 4 * n5 && n5 > 0);
  const choix = F.pasAdapte(r.retenues, mm, { cible: n5 });
  assert.ok(choix.pas <= 5 && choix.n <= n5);
  assert.equal(F.pasAdapte(r.retenues, mm, { cible: 1e9 }).pas, 1);
});

test('modèle PSHA avec failles réelles : identique au modèle écrit à la main, la faille ajoute de l\'aléa', () => {
  const m = Z.lire({ format: Z.FORMAT, version: Z.VERSION, site: { lat: 36.5, lon: 10.2, vs30: 760 },
    zones: [{ id: 'z1', nom: 'Zone', polygone: [[9.5, 36], [11, 36], [11, 37], [9.5, 37]], mc: 4, mmax: 6, b: 1, sigmaB: 0, lam: 0.3, rake: 90, profondeur: 10 }] });
  const faille = { catalogue: 'EMME', type: 'Reverse', pendage: 45, rake: 90, glissement: { pref: 0.4, min: null, max: null }, zHaut: 0, zBas: 12, sens: 90,
    id: 'x', nom: 'Faille X', trace: [[10.3, 36.2], [10.3, 36.8]] };
  const { retenues } = F.retenir([faille], m.zones);
  const opts = { gmpe: ['akkar2014'], incMmax: false, pasGrille: 15 };
  const avec = Z.modelePsha(m, { ...opts, failles: retenues, pasFaille: 3 }), sans = Z.modelePsha(m, opts);
  avec.imts = sans.imts = ['PGA', 1];
  // même modèle construit à la main dans le repère de Zones.projection autour du site
  const pr = Z.projection(36.5, 10.2), main = { ...sans, pasFaille: 3, failles: [{ id: 'f0', nom: 'Faille X', zone: 0, trace: [pr.versKm([10.3, 36.2]), pr.versKm([10.3, 36.8])],
    pendage: 45, zHaut: 0, zBas: 12, rake: 90, glissement: 0.4, mu: 3e10, mmax: retenues[0].mmax, rapport: 1 }] };
  assert.deepEqual(avec.failles, main.failles);
  const ra = P.calculer(avec), rm = P.calculer(main), rs = P.calculer(sans);
  assert.deepEqual(Array.from(ra.moyenne[1]), Array.from(rm.moyenne[1]));
  // Sa(1 s) : les grands séismes de la faille (M > 6) l'emportent sur ceux de la zone, qui s'arrête à 6
  const P1 = x => P.niveauPourProba(rs.niveaux, x, 1 - Math.exp(-50 / 475));
  assert.ok(P1(ra.moyenne[1]) > 1.2 * P1(rs.moyenne[1]), `${P1(ra.moyenne[1])} vs ${P1(rs.moyenne[1])}`);
  const d = P.desagregation(avec, 1, P1(ra.moyenne[1]));
  assert.ok(d.failles[0] > 0.3 && Math.abs(d.zones[0] + d.failles[0] - 1) < 1e-9);
});

test('extrait méditerranéen livré : base GEM, licence CC BY-SA, failles de Tunisie', () => {
  const r = F.lire(fs.readFileSync(new URL('../data/failles-mediterranee.json', import.meta.url), 'utf8'));
  assert.equal(r.format, F.FORMAT);
  assert.match(r.source.licence, /CC BY-SA 4\.0/); assert.match(r.source.reference, /Styron/);
  assert.ok(r.failles.length > 1000);
  const D = r.source.domaine;
  assert.ok(r.failles.every(f => f.trace.some(([lon, lat]) => lon >= D.lon[0] && lon <= D.lon[1] && lat >= D.lat[0] && lat <= D.lat[1])));
  assert.ok(r.failles.every(f => F.TYPES[f.type]), 'types tous connus');
  const tunisie = r.failles.filter(f => f.trace.some(([lon, lat]) => lon > 7.5 && lon < 11.6 && lat > 30.2 && lat < 37.6));
  assert.ok(tunisie.length >= 20, `${tunisie.length} failles en Tunisie`);
  assert.ok(tunisie.some(f => /Gafsa/.test(f.nom)));
});
