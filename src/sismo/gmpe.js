import Akkar2014 from './coefficients/akkar2014.js';
import Bindi2014 from './coefficients/bindi2014.js';
import Boore2014 from './coefficients/boore2014.js';

// src/sismo/gmpe.js — lois d'atténuation (GMPE). Chaque loi renvoie la médiane en ln (g pour PGA et SA,
// cm/s pour PGV) et ses écarts types en ln : σ total, τ (inter-événement), φ (intra-événement).
// Akkar et al. (2014), Bindi et al. (2014), Boore et al. (2014).
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

  // ── Boore, Stewart, Seyhan et Atkinson (2014), NGA-West2, sans terme de bassin ──
  // ln Y = FE(M, style) + FP(Rjb, M) + FS(Vs30, PGAr) ; FS = c·ln(min(Vs30, Vc)/760) + f2·ln((PGAr + 0,1)/0,1),
  // PGAr : PGA médian au rocher de référence (760 m/s). σ = √(τ² + φ²), τ et φ fonction de M, Rjb et Vs30.
  function booreMagnitude(C, M, rake) {
    const style = Math.abs(rake) <= 30 || 180 - Math.abs(rake) <= 30 ? C.e1 : rake > 30 && rake < 150 ? C.e3 : C.e2;
    const dm = M - C.Mh;
    return style + (M <= C.Mh ? C.e4 * dm + C.e5 * dm * dm : C.e6 * dm);
  }
  function boorePropagation(C, M, Rjb, t) {
    const R = Math.sqrt(Rjb * Rjb + C.h * C.h);
    return (C.c1 + C.c2 * (M - t.Mref)) * Math.log(R / t.Rref) + (C.c3 + C.Dc3) * (R - t.Rref);
  }
  function booreEcarts(C, M, Rjb, vs30, t) {
    const tau = M <= 4.5 ? C.tau1 : M >= 5.5 ? C.tau2 : C.tau1 + (C.tau2 - C.tau1) * (M - 4.5);
    let phi = M <= 4.5 ? C.f1 : M >= 5.5 ? C.f2 : C.f1 + (C.f2 - C.f1) * (M - 4.5);
    if (Rjb > C.R2) phi += C.DfR;
    else if (Rjb > C.R1) phi += C.DfR * (Math.log(Rjb / C.R1) / Math.log(C.R2 / C.R1));
    if (vs30 <= t.v1) phi -= C.DfV;
    else if (vs30 <= t.v2) phi -= C.DfV * (Math.log(t.v2 / vs30) / Math.log(t.v2 / t.v1));
    return { sigma: Math.hypot(tau, phi), tau, phi };
  }
  const boore2014 = {
    id: 'boore2014', nom: 'Boore et al. (2014)', distance: 'Rjb', domaine: { M: [3, 8.5], R: [0, 400], vs30: [150, 1500] },
    periodes: Boore2014.SA.map(c => c.T),
    calculer({ M, Rjb, vs30, rake = 0 }, imt) {
      const t = Boore2014, C = coefficients(t, imt), Cp = t.PGA;
      const pgaRocher = Math.exp(booreMagnitude(Cp, M, rake) + boorePropagation(Cp, M, Rjb, t));
      const lin = C.c * Math.log(Math.min(vs30, C.Vc) / t.Vref);
      const f2 = C.f4 * (Math.exp(C.f5 * (Math.min(vs30, 760) - 360)) - Math.exp(C.f5 * 400));
      const nonLin = t.f1 + f2 * Math.log((pgaRocher + t.f3) / t.f3);
      const ln = booreMagnitude(C, M, rake) + boorePropagation(C, M, Rjb, t) + lin + nonLin;
      return { ln, ...booreEcarts(C, M, Rjb, vs30, t) };
    },
  };

  const LOIS = { akkar2014, bindi2014, boore2014 };
  return { LOIS, coefficientsSA };
})();
export default Gmpe;
