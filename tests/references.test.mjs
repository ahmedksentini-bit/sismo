// Comparaison aux références d'OpenQuake (tests/references/*.json, produites par `npm run references`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Gmpe from '../src/sismo/gmpe.js';
import Sc from '../src/sismo/sismicite.js';

const lire = f => JSON.parse(readFileSync(new URL(`./references/${f}`, import.meta.url), 'utf-8'));
function catalogue() {
  const [entete, ...lignes] = readFileSync(new URL('./references/catalogue.csv', import.meta.url), 'utf-8').trim().split('\n');
  const cles = entete.split(',');
  return lignes.map(l => {
    const v = l.split(','), o = Object.fromEntries(cles.map((k, i) => [k, Number(v[i])]));
    return { id: o.id, t: o.dtime, annee: o.annee, M: o.magnitude, x: o.x, y: o.y, lon: o.longitude, lat: o.latitude };
  });
}
// Haversine d'HMTK (rayon 6371,227 km)
const haversine = (a, b) => {
  const r = Math.PI / 180, dlat = (a.lat - b.lat) * r, dlon = (a.lon - b.lon) * r;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlon / 2) ** 2;
  return 2 * 6371.227 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

test('Akkar et al. (2014) identique à hazardlib (AkkarEtAlRjb2014) : médiane et σ', () => {
  const ref = lire('gmpe_akkar2014.json'), loi = Gmpe.LOIS.akkar2014;
  let ecartMax = 0;
  for (const c of ref.cas) {
    ref.imts.forEach((imt, j) => {
      const r = loi.calculer({ M: c.M, Rjb: c.Rjb, vs30: c.vs30, rake: c.rake }, imt);
      ecartMax = Math.max(ecartMax, Math.abs(r.ln - c.ln[j]), Math.abs(r.sigma - c.sigma[j]));
    });
  }
  assert.ok(ecartMax < 1e-8, `écart maximal en ln : ${ecartMax.toExponential(2)} (${ref.cas.length} cas × ${ref.imts.length} grandeurs)`);
});

test('déclusterage de Gardner et Knopoff identique à HMTK (GardnerKnopoffType1)', () => {
  const ref = lire('hmtk.json').gk, cat = catalogue(), { drapeau } = Sc.amasGK(cat, { distance: haversine });
  const diff = [...drapeau].reduce((n, d, i) => n + (d !== ref.drapeau[i]), 0);
  assert.equal(cat.length, ref.n);
  assert.equal(diff, 0, `${diff} drapeaux différents sur ${ref.n}`);
});

test('estimateur de Weichert identique à HMTK : b, σb, taux et a', () => {
  const ref = lire('hmtk.json'), w = ref.weichert, cat = catalogue();
  const garde = cat.filter((_, i) => ref.gk.drapeau[i] === 0);
  const r = Sc.weichert(Sc.comptagesCompletude(garde, w.completude, w.dm, w.anneeFin), w.mref);
  assert.ok(Math.abs(r.b - w.b) < 1e-6, `b = ${r.b} au lieu de ${w.b}`);
  assert.ok(Math.abs(r.sigma - w.sigma_b) < 1e-6, `σb = ${r.sigma} au lieu de ${w.sigma_b}`);
  assert.ok(Math.abs(r.lamRef / w.taux_mref - 1) < 1e-6, `λ(≥ ${w.mref}) = ${r.lamRef} au lieu de ${w.taux_mref}`);
  assert.ok(Math.abs(r.a - w.agr) < 1e-6, `a = ${r.a} au lieu de ${w.agr}`);
  // La loi ajustée redonne le taux de référence à mref et 10^a à M = 0
  assert.ok(Math.abs(r.taux(w.mref) / w.taux_mref - 1) < 1e-6 && Math.abs(Math.log10(r.taux(0)) - w.agr) < 1e-6);
});
