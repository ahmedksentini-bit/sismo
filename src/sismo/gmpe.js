import Akkar2014 from './coefficients/akkar2014.js';
import Bindi2014 from './coefficients/bindi2014.js';

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

  // ── Bindi et al. (2014), distance de Joyner-Boore ───────────────────────
  // log10 Y (cm/s² pour PGA et SA, cm/s pour PGV) = e1 + FM + FD + γ·log10(Vs30/800) + style de faille,
  // FM = b1·(M − Mh) + b2·(M − Mh)² sous Mh = 6,75, b3·(M − Mh) au-dessus ;
  // FD = [c1 + c2·(M − 5,5)]·log10 √(Rjb² + h²) − c3·(√(Rjb² + h²) − 1). Écarts types donnés en log10.
  const G = 9.80665;
  function styleBindi(C, rake) {
    if (Math.abs(rake) <= 30 || 180 - Math.abs(rake) <= 30) return C.sofS;
    if (rake > 30 && rake < 150) return C.sofR;
    if (rake > -150 && rake < -30) return C.sofN;
    return 0;
  }
  const bindi2014 = {
    id: 'bindi2014', nom: 'Bindi et al. (2014)', distance: 'Rjb',
    domaine: { M: [4, 7.6], R: [0, 300], vs30: [150, 1500] },
    periodes: Bindi2014.SA.map(c => c.T),
    calculer({ M, Rjb, vs30, rake = 0 }, imt) {
      const t = Bindi2014, C = coefficients(t, imt), dm = M - t.Mh;
      const FM = M < t.Mh ? C.e1 + C.b1 * dm + C.b2 * dm * dm : C.e1 + C.b3 * dm;
      const r = Math.sqrt(Rjb * Rjb + C.h * C.h);
      const FD = (C.c1 + C.c2 * (M - t.Mref)) * Math.log10(r / t.Rref) - C.c3 * (r - t.Rref);
      const log10Y = FM + FD + C.gamma * Math.log10(vs30 / t.Vref) + styleBindi(C, rake);
      const ln = imt === 'PGV' ? log10Y * Math.LN10 : Math.log(Math.pow(10, log10Y - 2) / G);
      return { ln, sigma: C.sigma * Math.LN10, tau: C.tau * Math.LN10, phi: C.phi * Math.LN10 };
    },
  };

  const LOIS = { akkar2014, bindi2014 };
  return { LOIS, coefficientsSA };
})();
export default Gmpe;
