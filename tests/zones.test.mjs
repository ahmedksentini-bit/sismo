// Zones sismogènes d'un catalogue réel (src/sismo/zones.js) : polygone sur la sphère (antiméridien compris), statistiques
// d'une zone (b d'Aki-Utsu, taux, b régional), format « sismo-zones », projection locale, modèle PSHA (comparé au modèle
// d'enseignement Psha.modeleSimple d'une zone circulaire).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Z from '../src/sismo/zones.js';
import P from '../src/sismo/psha.js';
import S from '../src/sismo/signal.js';
import Sm from '../src/sismo/sismicite.js';

test('point dans une zone : polygone en longitude et latitude, antiméridien compris', () => {
  const carre = [[10, 35], [12, 35], [12, 37], [10, 37]];
  assert.ok(Z.contient(carre, 11, 36)); assert.ok(!Z.contient(carre, 13, 36)); assert.ok(!Z.contient(carre, 11, 38));
  const fidji = [[178, -20], [-178, -20], [-178, -16], [178, -16]];
  assert.ok(Z.contient(fidji, 179.5, -18)); assert.ok(Z.contient(fidji, -179.5, -18)); assert.ok(!Z.contient(fidji, 170, -18));
});

test('statistiques d\'une zone : b d\'Aki-Utsu, taux annuel, b régional pour une zone pauvre, Mmax proposée', () => {
  const u = S.aleatoire(4), evts = [];
  // 40 ans, Gutenberg-Richter b = 1 au-dessus de 3, 60 séismes par an dans le carré, 2 par an au-dehors
  for (let i = 0; i < 2400; i++) evts.push({ t: 1980 + 40 * u(), M: Math.round((3 - Math.log10(1 - u())) * 10) / 10, lat: 35 + 2 * u(), lon: 10 + 2 * u(), h: 5 + 10 * u() });
  for (let i = 0; i < 80; i++) evts.push({ t: 1980 + 40 * u(), M: 3.5, lat: 40 + u(), lon: 20 + u(), h: 10 });
  const carre = [[10, 35], [12, 35], [12, 37], [10, 37]];
  const s = Z.statistiques(evts, carre, { debut: 1980, fin: 2020, mc: 3 });
  const ref = Sm.valeurB(evts.filter(e => e.lon < 15).map(e => e.M), 3);
  assert.equal(s.n, 2400); assert.ok(Math.abs(s.lam - 60) < 1e-9);
  assert.ok(s.bPropre && Math.abs(s.b - ref.b) < 1e-12 && Math.abs(s.sigmaB - ref.sigma) < 1e-12);
  assert.ok(s.profondeur > 5 && s.profondeur < 15 && s.mmaxObs >= 5);
  // zone pauvre : b régional
  const pauvre = Z.statistiques(evts.slice(0, 10), carre, { debut: 1980, fin: 2020, mc: 3, bRegional: { b: 0.9, sigma: 0.05 } });
  assert.ok(!pauvre.bPropre && pauvre.b === 0.9 && pauvre.sigmaB === 0.05);
  assert.equal(Z.mmaxPropose(6.2, 3), 6.7); assert.equal(Z.mmaxPropose(3.4, 3), 5);
});

test('fichier de zones : écrit puis relu, erreurs lisibles', () => {
  const m = { source: { catalogue: 'essai', debut: 1980, fin: 2020, mc: 3 }, site: { lat: 36, lon: 10, vs30: 600 },
    zones: [{ id: 'z1', nom: 'Golfe', polygone: [[10, 35], [12, 35], [12, 37]], mc: 3, mmax: 6.5, b: 1, sigmaB: 0.05, lam: 2, n: 80, rake: 90, profondeur: 12 }] };
  const r = Z.lire(Z.ecrire(m));
  assert.deepEqual(r.site, m.site); assert.equal(r.zones[0].nom, 'Golfe'); assert.equal(r.zones[0].rake, 90);
  for (const [faux, motif] of [['{', /JSON/], [{ format: 'autre' }, /zones/], [{ ...m, format: 'sismo-zones', version: 1, zones: [{ ...m.zones[0], lam: 0 }] }, /taux/],
    [{ ...m, format: 'sismo-zones', version: 1, zones: [{ ...m.zones[0], polygone: [[1, 2]] }] }, /polygone/]]) assert.throws(() => Z.lire(faux), motif);
});

test('projection locale : aller-retour exact, distances à 1 % de la sphère à 300 km', () => {
  const pr = Z.projection(36, 10);
  const [lon, lat] = pr.versGeo(pr.versKm([12.3, 37.1]));
  assert.ok(Math.abs(lon - 12.3) < 1e-12 && Math.abs(lat - 37.1) < 1e-12);
  const [x, y] = pr.versKm([13, 37.5]), d = Sm.haversine({ lat: 36, lon: 10 }, { lat: 37.5, lon: 13 });
  assert.ok(Math.abs(Math.hypot(x, y) / d - 1) < 0.01, `${Math.hypot(x, y)} ${d}`);
  assert.ok(Math.abs(Z.centre([{ polygone: [[179, 0], [-179, 0], [-179, 2], [179, 2]] }]).lon) > 179.9); // antiméridien
});

test('modèle PSHA d\'une zone circulaire tracée en longitude et latitude : l\'aléa du modèle d\'enseignement', () => {
  const lat0 = 36, lon0 = 10, pr = Z.projection(lat0, lon0);
  const polygone = Array.from({ length: 48 }, (_, i) => pr.versGeo([100 * Math.cos((2 * Math.PI * i) / 48), 100 * Math.sin((2 * Math.PI * i) / 48)]));
  const m = Z.lire({ format: 'sismo-zones', version: 1, site: { lat: lat0, lon: lon0, vs30: 800 },
    zones: [{ nom: 'Cercle', polygone, mc: 4, mmax: 6.5, b: 1, sigmaB: 0, lam: 0.5, rake: 0, profondeur: 10 }] });
  const mod = Z.modelePsha(m, { incMmax: false });
  assert.deepEqual([mod.site.x, mod.site.y], [0, 0]); assert.equal(mod.failles.length, 0);
  const a = P.calculer({ ...mod, imts: ['PGA', 0.2, 1] }), b = P.calculer(P.modeleSimple({ taux4: 0.5, imts: ['PGA', 0.2, 1] }));
  for (let k = 0; k < 3; k++) for (const x of [0.05, 0.1, 0.2]) {
    const l = a.niveaux.findIndex(v => v >= x), pa = a.moyenne[k][l], pb = b.moyenne[k][l];
    assert.ok(Math.abs(pa / pb - 1) < 0.02, `${k} ${x} : ${pa} / ${pb}`);
  }
  // site déplacé à 150 km à l'est : repère inchangé, site à sa place
  const loin = Z.modelePsha(m, { site: { ...m.site, lon: pr.versGeo([150, 0])[0] } });
  assert.ok(Math.abs(loin.site.x - 150) < 1e-9 && Math.abs(loin.site.y) < 1e-9);
});
