// Sismomètre (oscillateur à un degré de liberté) et inversion des hodochrones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import O from '../src/sismo/oscillateur.js';
import Rf from '../src/sismo/refraction.js';
import S from '../src/sismo/signal.js';

test('réponse en fréquence : déplacement au-dessus de f₀, accélération en dessous, résonance à f₀', () => {
  assert.ok(Math.abs(O.reponse(50, 1, 0.7).deplacement - 1) < 0.01);
  assert.ok(Math.abs(O.reponse(0.02, 1, 0.7).acceleration - 1) < 0.01);
  assert.ok(Math.abs(O.reponse(1, 1, 0.05).deplacement - 10) < 1e-9); // 1/(2ξ)
  assert.ok(Math.abs(O.reponse(1, 1, 0.7).phase + Math.PI / 2) < 1e-12);
});

test('Newmark : régime permanent conforme à la réponse en fréquence', () => {
  for (const [f, f0, xi] of [[5, 1, 0.7], [0.2, 2, 0.3], [1, 1, 0.1]]) {
    const dt = 0.001, n = Math.round(40 / dt), w = 2 * Math.PI * f, acc = new Float64Array(n);
    for (let i = 0; i < n; i++) acc[i] = -w * w * Math.sin(w * i * dt); // ug = sin(ωt)
    const { x } = O.integrer(acc, dt, f0, xi);
    let a = 0;
    for (let i = n - Math.round(4 / f / dt); i < n; i++) a = Math.max(a, Math.abs(x[i]));
    const attendu = O.reponse(f, f0, xi).deplacement;
    assert.ok(Math.abs(a / attendu - 1) < 0.02, `f ${f}, f₀ ${f0}, ξ ${xi} : ${a.toFixed(3)} au lieu de ${attendu.toFixed(3)}`);
  }
});

test('lâcher : oscillation libre à la pseudo-fréquence f₀√(1 − ξ²), décrément logarithmique 2πξ/√(1 − ξ²)', () => {
  const f0 = 2, xi = 0.05, dt = 0.0005, n = 8000;
  const { x } = O.integrer(new Float64Array(n), dt, f0, xi, 1, 0);
  const pics = [];
  for (let i = 1; i < n - 1; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 0) pics.push(i);
  const Td = (pics[3] - pics[0]) * dt / 3, attenduT = 1 / (f0 * Math.sqrt(1 - xi * xi));
  assert.ok(Math.abs(Td / attenduT - 1) < 0.01);
  const delta = Math.log(x[pics[0]] / x[pics[1]]), attenduD = (2 * Math.PI * xi) / Math.sqrt(1 - xi * xi);
  assert.ok(Math.abs(delta / attenduD - 1) < 0.03);
});

test('pas unique de l\'animation identique à l\'intégration complète', () => {
  const dt = 0.002, n = 2000, acc = new Float64Array(n);
  for (let i = 0; i < n; i++) acc[i] = Math.sin(0.03 * i) * Math.exp(-i / 800);
  const { x } = O.integrer(acc, dt, 1.5, 0.4);
  const e = { x: 0, v: 0 };
  for (let i = 0; i < n - 1; i++) O.pas(e, acc[i], acc[i + 1], dt, 1.5, 0.4);
  assert.ok(Math.abs(e.x - x[n - 1]) < 1e-12);
});

test('réfraction : intercept et épaisseur se répondent ; droite par deux points', () => {
  const H = S.MODELE.H, V1 = S.MODELE.vp1, V2 = S.MODELE.vp2, h = 10;
  const ti = Rf.intercept(V1, V2, H, h);
  assert.ok(Math.abs(Rf.epaisseur(V1, V2, ti, h) - H) < 1e-9);
  // Les temps de Pn du générateur sont sur la droite Δ/V₂ + tᵢ
  const p1 = { d: 200, t: S.temps(200, h).tPn }, p2 = { d: 350, t: S.temps(350, h).tPn };
  const dr = Rf.droite(p1, p2);
  assert.ok(Math.abs(dr.V - V2) < 1e-9 && Math.abs(dr.ti - ti) < 1e-9);
});

test('distance de croisement Pg / Pn cohérente avec le générateur', () => {
  const h = 10, V1 = S.MODELE.vp1, V2 = S.MODELE.vp2, ti = Rf.intercept(V1, V2, S.MODELE.H, h);
  const xc = Rf.croisement(V1, V2, ti, h);
  const a = S.temps(xc - 1, h), b = S.temps(xc + 1, h);
  assert.ok(a.tPg < a.tPn && b.tPn < b.tPg, `croisement ${xc.toFixed(1)} km`);
});

test('coupe de la croûte : distance critique, rais Pg et Pn et croisement conformes aux temps du générateur', () => {
  const distances = Array.from({ length: 12 }, (_, i) => 15 + 30 * i);
  const modeles = [[S.MODELE, 5], [S.MODELE, 10], [{ ...S.MODELE, H: 24, vp1: 6.4, vp2: 7.7 }, 5], [{ ...S.MODELE, H: 48, vp1: 5.7, vp2: 8.3 }, 5]];
  for (const [m, h] of modeles) {
    const V1 = m.vp1, V2 = m.vp2, H = m.H, c = Rf.coupe(V1, V2, H, h, distances), xcr = Rf.distanceCritique(V1, V2, H, h);
    assert.ok(Math.abs(Math.sin(c.ic) - V1 / V2) < 1e-12 && c.xcr === xcr && Math.abs(c.ti - Rf.intercept(V1, V2, H, h)) < 1e-12);
    // Pn existe à partir de la distance critique, pas avant (générateur) ; au croisement, tPg = tPn
    assert.equal(S.temps(xcr - 0.01, h, m).tPn, null);
    assert.notEqual(S.temps(xcr + 0.01, h, m).tPn, null);
    const tc = S.temps(c.xc, h, m);
    assert.ok(Math.abs(tc.tPg - tc.tPn) < 1e-6, `croisement ${c.xc.toFixed(1)} km`);
    const L = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
    for (const st of c.stations) {
      const tt = S.temps(st.d, h, m);
      assert.deepEqual(st.pg.pts, [[0, h], [st.d, 0]]);
      assert.ok(Math.abs(st.pg.t - tt.tPg) < 1e-9);
      if (tt.tPn === null) assert.equal(st.pn, null, `${st.d} km : pas de Pn avant la distance critique`);
      else {
        // rai dessiné : foyer, Moho, Moho, station ; temps le long du rai (croûte à V₁, Moho à V₂) = tPn du générateur
        const [a, b, e, f] = st.pn.pts;
        assert.deepEqual([a, f], [[0, h], [st.d, 0]]);
        assert.ok(b[1] === H && e[1] === H && e[0] >= b[0]);
        const t = (L(a, b) + L(e, f)) / V1 + L(b, e) / V2;
        assert.ok(Math.abs(t - tt.tPn) < 1e-9 && Math.abs(st.pn.t - tt.tPn) < 1e-9, `${st.d} km`);
        // descente et remontée sous l'angle critique (Snell : sin iᶜ = V₁/V₂)
        assert.ok(Math.abs((b[0] - a[0]) / L(a, b) - V1 / V2) < 1e-12 && Math.abs((f[0] - e[0]) / L(e, f) - V1 / V2) < 1e-12);
      }
      // phase première : celle du générateur, et Pn exactement au-delà du croisement
      assert.equal(st.premiere, tt.tP === tt.tPn ? 'Pn' : 'Pg');
      assert.equal(st.premiere === 'Pn', st.d > c.xc);
    }
    // au point critique, descente et remontée se rejoignent sur le Moho (réflexion critique)
    const pc = Rf.raiPn(V1, V2, H, h, xcr);
    assert.ok(Math.abs(pc.pts[1][0] - pc.pts[2][0]) < 1e-9);
  }
  // modèle sans manteau plus rapide, ou Moho au-dessus du foyer : rais Pg seulement
  for (const c of [Rf.coupe(6, 5.5, 30, 5, distances), Rf.coupe(6, 8, 4, 5, distances), Rf.coupe(6, null, null, 5, distances)]) {
    assert.ok(c.xcr === null && c.xc === null && c.stations.every(s => s.pn === null && s.premiere === 'Pg'));
  }
});

test('phase lue la première sur deux droites : la plus précoce, en accord avec leur croisement et le générateur', () => {
  const h = 5, distances = () => Array.from({ length: 12 }, (_, i) => 15 + 30 * i);
  const dg = Rf.droite({ d: 15, t: S.temps(15, h).tPg }, { d: 75, t: S.temps(75, h).tPg });
  const dn = Rf.droite({ d: 195, t: S.temps(195, h).tPn }, { d: 345, t: S.temps(345, h).tPn });
  const xc = Rf.intersection(dg, dn);
  for (let d = 15; d <= 345; d += 30) {
    assert.equal(Rf.premiereLue(dg, dn, d), d > xc ? 'Pn' : 'Pg');
    const tt = S.temps(d, h);
    if (Math.abs(d - xc) > 5) assert.equal(Rf.premiereLue(dg, dn, d), tt.tP === tt.tPn ? 'Pn' : 'Pg', `${d} km`);
  }
  assert.equal(Rf.premiereLue(dg, null, 100), null);
  assert.equal(Rf.premiereLue(null, dn, 100), null);
  assert.equal(Rf.premiereLue(dn, dg, 100), null); // « Pn » plus lente que « Pg » : pas de croisement
  // croûte tirée de ces droites (épaisseur des lectures) : le rai Pn dessiné arrive sur la droite Pn, et H est proche
  // du modèle (la droite Pg par deux points n'est qu'une approximation de √(Δ² + h²)/V₁)
  const H = Rf.epaisseur(dg.V, dn.V, dn.ti, h), c = Rf.coupe(dg.V, dn.V, H, h, distances());
  for (const st of c.stations) if (st.pn) assert.ok(Math.abs(st.pn.t - (dn.ti + st.d / dn.V)) < 1e-9);
  assert.ok(Math.abs(H - S.MODELE.H) < 1);
});
