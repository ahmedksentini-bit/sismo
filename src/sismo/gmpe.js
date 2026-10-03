import Akkar2014 from './coefficients/akkar2014.js';

// src/sismo/gmpe.js — lois d'atténuation (GMPE). Chaque loi renvoie la médiane en ln (g pour PGA et SA,
// cm/s pour PGV) et ses écarts types en ln : σ total, τ (inter-événement), φ (intra-événement).
// Vérifiées contre openquake.hazardlib par tests/references.test.mjs. Solveurs purs.
const Gmpe = (() => {
  'use strict';

  // Coefficients d'une période spectrale : interpolation linéaire en log(T) entre les périodes
  // tabulées, comme hazardlib (CoeffsTable).
  function coefficientsSA(table, T) {
    const sa = table.SA;
    const exact = sa.find(c => Math.abs(c.T - T) < 1e-9);
    if (exact) return exact;
    if (T < sa[0].T || T > sa[sa.length - 1].T) throw new RangeError(`période ${T} s hors du domaine de la loi`);
    let k = 1;
    while (sa[k].T < T) k++;
    const a = sa[k - 1], b = sa[k], r = (Math.log(T) - Math.log(a.T)) / (Math.log(b.T) - Math.log(a.T)), c = {};
    for (const cle of Object.keys(a)) c[cle] = a[cle] + (b[cle] - a[cle]) * r;
    c.T = T;
    return c;
  }
  const coefficients = (table, imt) => (imt === 'PGA' ? table.PGA : imt === 'PGV' ? table.PGV : coefficientsSA(table, imt));

  // ── Akkar, Sandıkkaya et Bommer (2014), distance de Joyner-Boore ────────
  // ln Y = a1 + a2|a7·(M − c1) + a3·(8,5 − M)² + [a4 + a5·(M − c1)]·ln√(Rjb² + a6²) + a8·FN + a9·FR + ln S
  // ln S : non linéaire pour Vs30 < 750 m/s (fonction du PGA de référence), plafonné à Vs30 = 1000 m/s.
  function akkarReference(C, M, Rjb, rake, c1) {
    const FN = rake > -135 && rake < -45 ? 1 : 0, FR = rake > 45 && rake < 135 ? 1 : 0;
    return C.a1 + (M <= c1 ? C.a2 : C.a7) * (M - c1) + C.a3 * (8.5 - M) ** 2
      + (C.a4 + C.a5 * (M - c1)) * Math.log(Math.sqrt(Rjb * Rjb + C.a6 * C.a6)) + C.a8 * FN + C.a9 * FR;
  }
  function akkarSite(C, vs30, pgaRef, t) {
    if (vs30 < t.Vref) {
      const r = vs30 / t.Vref;
      return C.b1 * Math.log(r) + C.b2 * Math.log((pgaRef + C.c * r ** C.n) / ((pgaRef + C.c) * r ** C.n));
    }
    return C.b1 * Math.log(Math.min(vs30, t.Vcon) / t.Vref);
  }
  const akkar2014 = {
    id: 'akkar2014', nom: 'Akkar, Sandıkkaya et Bommer (2014)', distance: 'Rjb',
    domaine: { M: [4, 8], R: [0, 200], vs30: [150, 1200] },
    periodes: Akkar2014.SA.map(c => c.T),
    calculer({ M, Rjb, vs30, rake = 0 }, imt) {
      const t = Akkar2014, C = coefficients(t, imt);
      const pgaRef = Math.exp(akkarReference(t.PGA, M, Rjb, rake, t.c1));
      const ln = akkarReference(C, M, Rjb, rake, t.c1) + akkarSite(C, vs30, pgaRef, t);
      return { ln, sigma: Math.hypot(C.sigma, C.tau), tau: C.tau, phi: C.sigma };
    },
  };

  const LOIS = { akkar2014 };
  return { LOIS, coefficientsSA };
})();
export default Gmpe;
