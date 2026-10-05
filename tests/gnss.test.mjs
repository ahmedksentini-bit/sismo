// Champ de vitesses GNSS réel (src/sismo/gnss.js) : lecture psvelo et tableau à en-tête, rotation rigide d'une plaque
// (aucune déformation grâce à la convergence des méridiens), déformation uniforme retrouvée, moment de Kostrov d'une zone,
// marge autour de la zone, moment du catalogue ; zone sans moment géodésique dans l'arbre logique (Psha.variantes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import G from '../src/sismo/gnss.js';
import Geo from '../src/sismo/geodesie.js';
import Z from '../src/sismo/zones.js';
import P from '../src/sismo/psha.js';

const RAD = Math.PI / 180;
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≠ ${b} (± ${tol})`);

test('lecture : psvelo de GMT (commentaires, noms de sites) et tableau à en-tête (m/an converti)', () => {
  const ps = `# lon lat ve vn se sn corr site
> segment
10.1 36.8 1.2 3.4 0.3 0.4 0.05 TUNI
370.5 37.0 -0.5 2.0 0.2 0.2 0.0 OUES_GPS
9.0 35.0 0.1 0.2
abc def
11 36 1 2 0.5 0.5 0.9 SITE A`;
  const r = G.lire(ps);
  assert.equal(r.format, 'psvelo'); assert.equal(r.unite, 'mm/an'); assert.equal(r.rejetees, 1);
  assert.deepEqual(r.stations.map(s => s.id), ['TUNI', 'OUES_GPS', 'S3', 'SITE A']);
  assert.deepEqual(r.stations[0], { id: 'TUNI', lon: 10.1, lat: 36.8, e: 1.2, n: 3.4, se: 0.3, sn: 0.4, corr: 0.05 });
  assert.equal(r.stations[1].lon, 10.5); assert.equal(r.stations[2].se, null);
  const csv = `Station;Longitude;Latitude;Ve (m/yr);Vn (m/yr);sig_e;sig_n
AAAA;10;36;0,001;0,002;0,0003;0,0004
BBBB;11;36;0,002;0,001;0,0003;0,0004
CCCC;10;37;0,001;0,003;;`;
  const t = G.lire(csv);
  assert.equal(t.format, 'tableau'); assert.equal(t.unite, 'm/an');
  proche(t.stations[0].e, 1, 1e-12); proche(t.stations[2].n, 3, 1e-12); proche(t.stations[1].sn, 0.4, 1e-12); assert.equal(t.stations[2].se, null);
  const mm = G.lire('site,lon,lat,ve,vn\nA,10,36,1,2\nB,11,36,1,2\nC,10,37,1,2');
  assert.equal(mm.unite, 'mm/an'); assert.equal(mm.stations[1].e, 1);
  assert.throws(() => G.lire('nom,x,y\nA,1,2'), /longitude, latitude/);
  assert.throws(() => G.lire('10 36 1 2'), /il en faut au moins trois/);
  assert.throws(() => G.lire('# rien\n'), /vide/);
});

// Vitesse (mm/an, est et nord) d'un point en rotation rigide autour d'un pôle d'Euler (°, °, °/Ma).
function euler(lon, lat, pole) {
  const w = (pole.omega * 1e-6 * RAD), wv = [Math.cos(pole.lat * RAD) * Math.cos(pole.lon * RAD), Math.cos(pole.lat * RAD) * Math.sin(pole.lon * RAD), Math.sin(pole.lat * RAD)].map(c => c * w);
  const Rmm = 6371e6, p = [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)].map(c => c * Rmm);
  const v = [wv[1] * p[2] - wv[2] * p[1], wv[2] * p[0] - wv[0] * p[2], wv[0] * p[1] - wv[1] * p[0]];
  const est = [-Math.sin(lon * RAD), Math.cos(lon * RAD), 0], nord = [-Math.sin(lat * RAD) * Math.cos(lon * RAD), -Math.sin(lat * RAD) * Math.sin(lon * RAD), Math.cos(lat * RAD)];
  return { e: v[0] * est[0] + v[1] * est[1], n: v[0] * nord[0] + v[1] * nord[1] + v[2] * nord[2] };
}

test('rotation rigide d\'une plaque : aucune déformation (convergence des méridiens prise en compte)', () => {
  const zone = [[6, 34], [12, 34], [12, 38], [6, 38]], pole = { lon: -95, lat: 55, omega: 0.26 }, stations = [];
  for (let lon = 6.25; lon < 12; lon += 0.5) for (let lat = 34.25; lat < 38; lat += 0.5) stations.push({ id: '', lon, lat, ...euler(lon, lat, pole), se: 0.3, sn: 0.3, corr: 0 });
  assert.ok(Math.hypot(stations[0].e, stations[0].n) > 15, 'vitesses de plusieurs mm/an');
  const t = G.tenseurZone(stations, zone, { tirages: 200 });
  assert.equal(t.n, stations.length);
  for (const k of ['exx', 'eyy', 'exy']) assert.ok(Math.abs(t.aj[k]) < 0.3, `${k} = ${t.aj[k]} ns/an`);
  // sans la convergence des méridiens, un cisaillement de l'ordre de ω·sin φ / 2 apparaîtrait
  const brut = Geo.ajuster(stations.map(s => { const [x, y] = Z.projection(36, 9).versKm([s.lon, s.lat]); return { x, y, e: s.e, n: s.n, sigma: 0.3 }; }));
  assert.ok(Math.abs(brut.exy) > 1, `cisaillement apparent ${brut.exy} ns/an`);
});

test('déformation uniforme retrouvée ; moment de Kostrov de la zone ; marge autour de la zone', () => {
  const zone = [[9, 35], [10, 35], [10, 36], [9, 36]], c = Z.centre([{ polygone: zone }]), pr = Z.projection(c.lat, c.lon);
  const L = { exx: -40, eyy: 10, exy: 15, w: 5 }; // ns/an ; vitesse (mm/an) = L·r (km) / 1000
  const stations = [];
  for (let lon = 8.6; lon <= 10.4; lon += 0.2) for (let lat = 34.6; lat <= 36.4; lat += 0.2) {
    const [x, y] = pr.versKm([lon, lat]), E = 0.5 + (L.exx * x + (L.exy - L.w) * y) / 1000, N = -0.2 + ((L.exy + L.w) * x + L.eyy * y) / 1000;
    // vitesse exprimée dans le repère local de la station (rotation inverse de la convergence des méridiens)
    const g = (lon - c.lon) * RAD * Math.sin(((lat + c.lat) / 2) * RAD);
    stations.push({ id: '', lon, lat, e: E * Math.cos(g) + N * Math.sin(g), n: -E * Math.sin(g) + N * Math.cos(g), se: 0.5, sn: 0.5, corr: 0 });
  }
  const t = G.tenseurZone(stations, zone, { tirages: 500 });
  proche(t.aj.exx, -40, 1e-6); proche(t.aj.eyy, 10, 1e-6); proche(t.aj.exy, 15, 1e-6); proche(t.aj.omega, 5, 1e-6);
  // aire d'un carré de 1° à 35,5° N : 111,2 × 90,5 km² environ
  proche(t.aire, 111.19 * 111.19 * Math.cos(35.5 * RAD), 60);
  proche(t.moment, Geo.momentKostrov(t.aj, { A: t.aire }), 1e-6 * t.moment);
  proche(t.moment, 2 * 3e10 * 15e3 * t.aire * 1e6 * Math.max(...[t.principales.e1h, t.principales.e2h, t.principales.e1h + t.principales.e2h].map(Math.abs)) * 1e-9, 1e-6 * t.moment);
  assert.ok(t.incertitude.q16 <= t.moment * 1.01 && t.incertitude.q84 >= t.moment * 0.99);
  // marge : plus de stations, même tenseur (champ uniforme)
  const t50 = G.tenseurZone(stations, zone, { marge: 30, tirages: 100 });
  assert.ok(t50.n > t.n); proche(t50.aj.exx, -40, 1e-6);
  // trop peu de stations
  const peu = G.tenseurZone(stations.slice(0, 2), [[8.5, 34.5], [8.7, 34.5], [8.7, 34.7]]);
  assert.ok(peu.moment === undefined && /station/.test(peu.raison));
  assert.equal(G.distancePolygone(5, 5, [[0, 0], [10, 0], [10, 10], [0, 10]]), 0);
  proche(G.distancePolygone(13, 5, [[0, 0], [10, 0], [10, 10], [0, 10]]), 3, 1e-12);
});

test('moment du catalogue (couplage apparent) et zone sans moment géodésique dans l\'arbre logique', () => {
  const z = { lam: 0.5, b: 1, mc: 3.5, mmax: 6.5 };
  proche(G.momentCatalogue(z), Geo.momentGR({ a: Math.log10(0.5) + 3.5, b: 1, mmin: 4, mmax: 6.5 }), 1e-9);
  const m = Z.lire({ format: Z.FORMAT, version: Z.VERSION, site: { lat: 36, lon: 10 },
    zones: [{ nom: 'A', polygone: [[9, 35], [10, 35], [10, 36], [9, 36]], mc: 4, mmax: 6, b: 1, sigmaB: 0.1, lam: 0.2 },
      { nom: 'B', polygone: [[11, 35], [12, 35], [12, 36], [11, 36]], mc: 4, mmax: 6.5, b: 0.9, sigmaB: 0, lam: 0.4 }] });
  const mod = Z.modelePsha(m, { geodesie: { poids: 0.4, moments: [3e16, null] } });
  assert.deepEqual(mod.taux.map(t => [t.id, t.poids]), [['catalogue', 0.6], ['geodesie', 0.4]]);
  const geo = P.variantes(mod).filter(v => v.etiquettes.modele === 'geodesie');
  assert.equal(geo.length, 3);
  for (const v of geo) {
    assert.ok(v.zones[0].moment > 0); // zone A : χ·Ṁ0
    assert.deepEqual(v.zones[1], { a: Math.log10(0.4) + 0.9 * 4, b: 0.9 }); // zone B : loi centrale du catalogue
  }
  // sans aucun moment connu, ni poids, la géodésie disparaît de l'arbre
  assert.deepEqual(Z.modelePsha(m, { geodesie: { poids: 0.4, moments: [null, null] } }).taux.map(t => t.id), ['catalogue']);
  assert.deepEqual(Z.modelePsha(m, { geodesie: { poids: 0, moments: [1e16, 1e16] } }).taux.map(t => t.id), ['catalogue']);
  // le calcul tourne avec la zone sans moment
  const r = P.calculer({ ...mod, imts: ['PGA'], pasGrille: 20 });
  assert.ok(r.moyenne[0][0] > 0);
});
