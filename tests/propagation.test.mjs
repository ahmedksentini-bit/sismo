// Fronts d'onde de l'animation (src/sismo/propagation.js) : les rais du faisceau sont ceux de Globe (ak135, vérifié
// contre TauP) ; leurs arrivées en surface retrouvent la table de temps de trajet, la zone d'ombre de P apparaît
// d'elle-même, le noyau liquide ne transmet pas d'onde S, et le front au temps de la P atteint la station.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Pr from '../src/sismo/propagation.js';
import G from '../src/sismo/globe.js';
import Tables from '../src/sismo/tables.js';

const RAD = Math.PI / 180;

test('faisceau P : arrivées sur la courbe des temps de trajet, zone d\'ombre de P entre ~100° et ~143°', () => {
  for (const h of [15, 300]) {
    const arr = Pr.arrivees(Pr.faisceau('P', h));
    for (const a of arr.filter(x => x.phase === 'P' && x.distance >= 30 && x.distance <= 95)) {
      const t = Tables.premiere('P', h, a.distance);
      assert.ok(Math.abs(a.temps - t) < 0.5, `h ${h} : P à ${a.distance.toFixed(1)}° en ${a.temps.toFixed(2)} s contre ${t.toFixed(2)} s`);
    }
    const pMax = Math.max(...arr.filter(x => x.phase === 'P').map(x => x.distance));
    const pkpMin = Math.min(...arr.filter(x => x.phase === 'PKP').map(x => x.distance));
    assert.ok(pMax > 97 && pMax < 102, `h ${h} : P jusqu'à ${pMax.toFixed(1)}°`);
    assert.ok(pkpMin > 142 && pkpMin < 147, `h ${h} : PKP dès ${pkpMin.toFixed(1)}°`);
    assert.ok(!arr.some(x => (x.phase === 'P' || x.phase === 'PKP') && x.distance > 103 && x.distance < 141), 'rien dans la zone d\'ombre, hors PKIKP');
  }
});

test('faisceau S : aucune onde S dans le noyau liquide (SKS y passe en P) ; rais montants réfléchis sous la surface', () => {
  const rais = Pr.faisceau('S', 100), noyau = G.RAYONS.noyau;
  for (const r of rais) {
    const dedans = r.pts.some(([rr]) => rr < noyau - 1e-6);
    if (r.phase === 'S' || r.phase === 'sS') assert.ok(!dedans, `${r.phase} (départ ${r.depart.toFixed(1)}°) entre dans le noyau`);
    if (dedans) assert.ok(/SKS$/.test(r.phase), `${r.phase} dans le noyau`);
  }
  // un rai montant monte jusqu'à la surface avant de redescendre (sS), et le temps croît le long du rai
  const sS = rais.find(r => r.phase === 'sS');
  const iS = sS.pts.findIndex(([rr]) => rr === G.R);
  assert.ok(iS > 0 && sS.pts.slice(0, iS + 1).every((q, i, a) => !i || q[0] >= a[i - 1][0]));
  assert.ok(sS.pts.every((q, i, a) => !i || q[2] >= a[i - 1][2] - 1e-9));
});

test('front au temps de la P : il touche la surface à la distance de la station, et chaque point est sur un rai', () => {
  const h = 35, delta = 62, rais = Pr.faisceau('P', h), tP = Tables.premiere('P', h, delta);
  const lignes = Pr.front(rais, tP), xy = ([r, a]) => [r * Math.sin(a), r * Math.cos(a)], st0 = xy([G.R, delta * RAD]);
  // distance de la station au front (segments entre rais voisins), en km
  let dMin = Infinity;
  for (const l of lignes) for (let i = 1; i < l.length; i++) {
    const [ax, ay] = xy(l[i - 1]), [bx, by] = xy(l[i]), [px, py] = st0, vx = bx - ax, vy = by - ay;
    const k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
    dMin = Math.min(dMin, Math.hypot(ax + k * vx - px, ay + k * vy - py));
  }
  assert.ok(dMin < 30, `front de P à ${dMin.toFixed(1)} km de la station au temps de la P`);
  for (const l of lignes) assert.ok(typeof l.phase === 'string' && l.length > 1);
  // rais vers la station : ceux des arrivées de Globe, point de départ au foyer et d'arrivée à la station
  const st = Pr.raisStation(h, delta, ['P', 'pP', 'S']);
  assert.deepEqual(st.map(r => r.phase), ['P', 'pP', 'S']);
  for (const r of st) {
    const fin = r.pts[r.pts.length - 1];
    assert.ok(Math.abs(fin[1] / RAD - delta) < 1e-6 && Math.abs(fin[2] - r.temps) < 1e-6 && r.pts[0][0] === G.R - h);
  }
});
