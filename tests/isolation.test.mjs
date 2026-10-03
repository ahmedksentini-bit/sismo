// Isolation à la base : isolateur bilinéaire, linéarisation équivalente (aire de boucle, point fixe), modèle à
// deux niveaux. Le calcul temporel est celui de Poussee.temporel, vérifié contre OpenSeesPy avec un bâtiment isolé
// (tests/poussee.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Iso from '../src/sismo/isolation.js';
import I from '../src/sismo/inelastique.js';
import Spectre from '../src/sismo/spectre.js';
import B from '../src/sismo/batiment.js';

const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} contre ${b}`);
const se = (T, xi) => Spectre.ec8(T, { type: 1, sol: 'C', ag: 0.3, xi }) * 9.81;

test('isolateur : K2 de la période post-élastique, Q à déplacement nul, Fy = K1·dy', () => {
  const iso = Iso.isolateur({ M: 1000, Tiso: 2.5, q: 0.06, dy: 0.01 });
  proche(2 * Math.PI * Math.sqrt(1000 / iso.K2), 2.5, 1e-12);
  proche(iso.Fy - iso.K2 * iso.dy, iso.Q, 1e-9); proche(iso.Q, 0.06 * 1000 * 9.81, 1e-9);
  // ressort cinématique : sur la branche montante, la force à déplacement nul vaut Q
  proche((1 - iso.alpha) * iso.Fy, iso.Q, 1e-9);
});

test('aire d\'une boucle stabilisée du ressort bilinéaire = 4·Q·(d − dy)', () => {
  const iso = Iso.isolateur({ M: 800, Tiso: 3, q: 0.05, dy: 0.015 }), r = I.ressort(iso.K1, iso.Fy, iso.alpha);
  for (const d of [0.05, 0.12, 0.3]) {
    // chargement à +d, puis cycles −d → +d → −d ; on intègre F·du sur le cycle complet
    let u = 0, f = 0, E = 0;
    const aller = (cible, compter) => { const n = 4000, du = (cible - u) / n; for (let i = 0; i < n; i++) { const e = r.essai(u, f, u + du); if (compter) E += 0.5 * (f + e.f) * du; u += du; f = e.f; } };
    aller(d, false); aller(-d, true); aller(d, true);
    proche(E / (4 * iso.Q * (d - iso.dy)), 1, 1e-9, `d ${d}`);
    const eq = Iso.equivalent(iso, d, 0);
    proche(eq.xi, E / (2 * Math.PI * eq.Keff * d * d), 1e-9);
  }
});

test('linéarisation équivalente : Q = 0 → raideur post-élastique et ξv ; sous dy, pas d\'hystérésis', () => {
  const lin = Iso.isolateur({ M: 1000, Tiso: 2, q: 0, dy: 0.01 }), e = Iso.equivalent(lin, 0.2, 0.1);
  proche(e.Keff, lin.K2, 1e-9); proche(e.xi, 0.1, 1e-15); proche(e.Teff, 2, 1e-12);
  const iso = Iso.isolateur({ M: 1000, Tiso: 2.5, q: 0.05, dy: 0.02 });
  proche(Iso.equivalent(iso, 0.01, 0.02).xi, 0.02, 1e-15); proche(Iso.equivalent(iso, 0.01).Keff, iso.K1, 1e-9);
  // isolateur linéaire : le point fixe est la demande spectrale à Tiso
  const r = Iso.deplacementCalcul(lin, { se, xiV: 0.05 });
  assert.ok(r.converge); proche(r.d, se(2, 0.05) * (2 / (2 * Math.PI)) ** 2, 1e-12);
});

test('déplacement de calcul : point fixe d = Se(Teff, ξeff)·(Teff/2π)², ξeff croît avec Q', () => {
  let avant = 0;
  for (const q of [0.02, 0.04, 0.06, 0.08]) {
    const iso = Iso.isolateur({ M: 1200, Tiso: 2.5, q, dy: 0.01 }), r = Iso.deplacementCalcul(iso, { se, xiV: 0.02 });
    assert.ok(r.converge, `q ${q}`);
    proche(se(r.Teff, r.xi) * (r.Teff / (2 * Math.PI)) ** 2 / r.d, 1, 1e-9);
    assert.ok(r.Teff < 2.5 && r.d > iso.dy);
    if (avant) assert.ok(r.xi > avant, `ξ ${r.xi} après ${avant}`);
    avant = r.xi;
  }
});

test('modèle isolé : le mode 1 est celui de l\'isolateur, la superstructure garde sa période sur base fixe', () => {
  const iso = Iso.isolateur({ M: 1200, Tiso: 2.5, q: 0.05, dy: 0.01 }), mod = Iso.modele({ ms: 900, mb: 300, Ts: 0.4 }, iso, 0.02);
  // raideur post-élastique : période d'ensemble proche de Tiso (superstructure presque rigide)
  const md = B.modes({ m: mod.bat.m, k: [iso.K2, mod.bat.k[1]] });
  assert.ok(md[0].T > 2.4 && md[0].T < 2.6, `T1 ${md[0].T}`);
  proche(2 * Math.PI * Math.sqrt(900 / mod.bat.k[1]), 0.4, 1e-12);
  proche(mod.amortissement.c[0], 2 * 0.02 * 1200 * (2 * Math.PI / 2.5), 1e-9);
});
