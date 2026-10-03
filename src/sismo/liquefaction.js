// src/sismo/liquefaction.js — déclenchement de la liquéfaction par la méthode simplifiée de Boulanger et
// Idriss (2014), au pénétromètre statique (CPT) et au carottier (SPT) : CSR = 0,65·(σv/σ'v)·amax·rd,
// CRR = CRR7,5(qc1Ncs ou (N1)60cs)·MSF·Kσ, FS = CRR/CSR. Indice de potentiel de liquéfaction d'Iwasaki (LPI)
// et tassement post-liquéfaction de Zhang, Robertson et Brachman (2002). Conventions de liquepy (référence
// hors ligne, tests/references/liquefaction.json) : Pa = 101 kPa (100 kPa pour Kσ), eau à 9,8 kN/m³, poids
// volumique de Robertson et Cabal (2010), contraintes cumulées vers le bas, FS plafonné à 2. Solveurs purs.
const Liquefaction = (() => {
  'use strict';
  const PA = 101, GW = 9.8;

  // ── Briques communes ──
  // Coefficient de réduction des contraintes avec la profondeur z (m), magnitude M (éq. 2.14).
  function rd(z, M) {
    const a = -1.012 - 1.126 * Math.sin(z / 11.73 + 5.133), b = 0.106 + 0.118 * Math.sin(z / 11.28 + 5.142);
    return Math.exp(a + b * M);
  }
  const csr = (sv, sve, amax, r) => 0.65 * (sv / sve) * r * amax;
  // Facteur de magnitude : MSF = 1 + (MSFmax − 1)·(8,64·e^(−M/4) − 1,325), MSFmax fonction de la densité.
  const msfDepuisMax = (M, max) => (M === 7.5 ? 1 : 1 + (max - 1) * (8.64 * Math.exp(-M / 4) - 1.325));
  const msfCPT = (M, q) => msfDepuisMax(M, Math.min(2.2, 1.09 + (q / 180) ** 3));
  const msfSPT = (M, n) => msfDepuisMax(M, Math.min(2.2, 1.09 + (n / 31.5) ** 2));
  // Correction de confinement Kσ = 1 − Cσ·ln(σ'v/Pa) ≤ 1,1, Cσ ≤ 0,3 (Pa = 100 kPa, comme liquepy).
  const kSigmaCPT = (sve, q) => Math.min(1.1, 1 - (1 / (37.3 - 8.27 * Math.pow(Math.min(q, 211), 0.264))) * Math.log(sve / 100));
  const kSigmaSPT = (sve, n) => Math.min(1.1, 1 - Math.min(0.3, 1 / (18.9 - 2.55 * Math.sqrt(n))) * Math.log(sve / 100));
  // Résistance cyclique à M = 7,5 et σ'v = 1 atm (c0 = 2,8 : courbe à 16 %, déterministe).
  const crrCPT = (q, c0 = 2.8) => Math.exp(q / 113 + (q / 1000) ** 2 - (q / 140) ** 3 + (q / 137) ** 4 - c0);
  const crrSPT = (n, c0 = 2.8) => Math.exp(n / 14.1 + (n / 126) ** 2 - (n / 23.6) ** 3 + (n / 25.4) ** 4 - c0);

  // ── CPT ──
  // Poids volumique (kN/m³) de Robertson et Cabal (2010), borné à [1,5 ; 4]·γw.
  function poidsRobertson(fs, qt) {
    const rf = Math.max(0.1, (fs / Math.max(qt, 1e-10)) * 100);
    return Math.min(4 * GW, Math.max(1.5 * GW, (0.27 * Math.log10(rf) + 0.36 * Math.log10(qt / PA) + 1.236) * GW));
  }
  // Indice de comportement Ic (Robertson et Wride 1998), Q ≥ 1 et F ≥ 0,1.
  const indiceIc = (Q, F) => Math.hypot(3.47 - Math.log10(Math.max(Q, 1)), 1.22 + Math.log10(Math.max(F, 0.1)));
  // Teneur en fines (%) déduite de Ic, corrigée par Cfc, bornée à [0 ; 100].
  function finesIc(ic, cfc = 0) {
    const t = Math.min(100, 80 * (ic + cfc) - 137);
    return t <= 137 / 80 - cfc ? 0 : t;
  }
  const deltaQc1n = (q, fc) => (11.9 + q / 14.6) * Math.exp(1.63 - 9.7 / (fc + 2) - (15.7 / (fc + 2)) ** 2);
  const exposantM = q => (q >= 254 ? 0.263823991466759 : q <= 21 ? 0.781756126201587 : 1.338 - 0.249 * Math.pow(q, 0.264));

  // Un point du sondage : itère CN, qc1N, Ic (exposant n de Robertson), FC et qc1Ncs comme liquepy.
  function pointCPT(qc, fs, qt, sv, sve, cfc) {
    let m = 1, n = 1, prec = 1e6, r = null;
    for (let j = 0; j < 100; j++) {
      const cn = Math.min(Math.pow(PA / sve, m), 1.7), qc1n = (cn * qc) / PA;
      const Q = ((qt - sv) / PA) * Math.pow(PA / sve, n), F = (fs / (qt - sv)) * 100, ic = indiceIc(Q, F);
      let stable = true;
      if (ic < 2.6 && n === 1) { n = 0.5; stable = false; } else if (ic > 2.6 && n === 0.5) { n = 0.75; stable = false; }
      const fc = finesIc(ic, cfc), qc1ncs = qc1n + deltaQc1n(qc1n, fc);
      r = { cn, qc1n, Q, F, ic, fc, qc1ncs };
      m = exposantM(qc1ncs);
      if (Math.abs(qc1n - prec) < 1e-5 && stable) break;
      prec = qc1n;
    }
    return r;
  }
  // Sondage CPT : profondeurs (m), qc, fs, u2 (kPa) ; nappe gwl (m), amax (g), magnitude M.
  function cpt({ z, qc, fs, u2 = null, aRatio = 0.8 }, { gwl, amax, M, cfc = 0, icLimite = 2.6, c0 = 2.8, poidsPreforage = 17 }) {
    const n = z.length, out = [];
    let sv = z[0] * poidsPreforage;
    for (let i = 0; i < n; i++) {
      const qt = qc[i] + (1 - aRatio) * (u2 ? u2[i] : 0), gamma = poidsRobertson(fs[i], qt);
      sv += (i === 0 ? z[1] - z[0] : z[i] - z[i - 1]) * gamma;
      const u = z[i] > gwl ? (z[i] - gwl) * GW : 0, sve = Math.abs(sv - u) || 1e-10;
      const p = pointCPT(qc[i], fs[i], qt, sv, sve, cfc), r = rd(z[i], M), c = csr(sv, sve, amax, r);
      const crr75 = p.ic <= icLimite ? (z[i] < gwl ? 4 : crrCPT(p.qc1ncs, c0)) : 4;
      const ks = kSigmaCPT(sve, p.qc1ncs), msf = msfCPT(M, p.qc1ncs), crr = crr75 * ks * msf;
      const fsl = p.ic <= icLimite ? Math.min(2, crr / c) : 2.25;
      out.push({ z: z[i], gamma, sv, sve, u, rd: r, csr: c, crr75, ks, msf, crr, fs: fsl, ...p });
    }
    return { points: out, lpi: lpi(out.map(p => p.fs), z), tassement: tassementZhang(out, z) };
  }

  // ── SPT ──
  const deltaN1 = fc => Math.exp(1.63 + 9.7 / (fc + 0.01) - (15.7 / (fc + 0.01)) ** 2);
  // Un essai : N60 (coups, énergie de 60 %), FC (%), σv et σ'v (kPa) ; itère CN et (N1)60cs.
  function pointSPT(n60, fc, sv, sve, amax, M, z, c0 = 2.8) {
    let n1cs = n60, n1 = n60, cn = 1;
    for (let j = 0; j < 100; j++) {
      const m = 0.784 - 0.0768 * Math.sqrt(Math.min(n1cs, 46));
      cn = Math.min(1.7, Math.pow(PA / sve, m)); n1 = cn * n60;
      const nouveau = n1 + deltaN1(fc);
      if (Math.abs(nouveau - n1cs) < 1e-6) { n1cs = nouveau; break; }
      n1cs = nouveau;
    }
    const r = rd(z, M), c = csr(sv, sve, amax, r), crr75 = crrSPT(n1cs, c0), ks = kSigmaSPT(sve, n1cs), msf = msfSPT(M, n1cs);
    return { cn, n1, n1cs, rd: r, csr: c, crr75, ks, msf, crr: crr75 * ks * msf, fs: Math.min(2, (crr75 * ks * msf) / c) };
  }

  // ── Conséquences ──
  // LPI d'Iwasaki : Σ F·w·Δz sur 0–20 m, F = 1 − FS si FS < 1 (FS et z au milieu des pas), w = 10 − 0,5·z.
  function lpi(fsl, z) {
    let s = 0;
    for (let i = 1; i < z.length; i++) {
      const zm = (z[i] + z[i - 1]) / 2, f = (fsl[i] + fsl[i - 1]) / 2;
      if (zm < 20 && f < 1) s += (10 - 0.5 * zm) * (1 - f) * (z[i] - z[i - 1]);
    }
    return s;
  }
  // Déformation volumique de Zhang et al. (2002), en fraction, interpolée entre les courbes à FS fixé.
  function evFixe(fs, q) {
    q = Math.min(200, Math.max(33, q));
    const a = 102 * q ** -0.82;
    switch (fs) {
      case 0.5: return a / 100;
      case 0.6: return (q <= 147 ? a : 2411 * q ** -1.45) / 100;
      case 0.7: return (q <= 110 ? a : 1701 * q ** -1.42) / 100;
      case 0.8: return (q <= 80 ? a : 1609 * q ** -1.46) / 100;
      case 0.9: return (q <= 60 ? a : 1403 * q ** -1.48) / 100;
      case 1: return (64 * q ** -0.93) / 100;
      case 1.1: return (11 * q ** -0.65) / 100;
      case 1.2: return (9.7 * q ** -0.69) / 100;
      case 1.3: return (7.6 * q ** -0.71) / 100;
      case 2: return 0;
      default: return 0;
    }
  }
  const PALIERS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 2, 300];
  function deformationVolumique(fs, q) {
    const i = PALIERS.findIndex(p => fs < p);
    if (i < 0) return 0;
    const bas = PALIERS[Math.max(0, i - 1)], haut = PALIERS[i], eb = evFixe(bas, q), eh = evFixe(haut, q);
    if (haut === bas) return eb;
    const t = Math.min(1, Math.max(0, (fs - bas) / (haut - bas)));
    return eb + t * (eh - eb);
  }
  // Tassement (m) : Σ εv·Δz sous la nappe, pour les points liquéfiables (Ic ≤ 2,6).
  function tassementZhang(points, z) {
    let s = 0;
    for (let i = 0; i < points.length; i++) {
      const dz = i + 1 < z.length ? z[i + 1] - z[i] : z[i] - z[i - 1], p = points[i];
      if (p.ic <= 2.6 && p.crr75 < 4) s += deformationVolumique(p.fs, p.qc1ncs) * dz;
    }
    return s;
  }
  // Sondage CPT d'école : couches { h (m), qc (MPa), rf (%) } ; qc croît comme (σ'v/Pa)^0,25 sous 2 m
  // (ordre de grandeur des sables), bruit multiplicatif de la graine, transitions lissées sur 0,2 m.
  function sondageSynthetique(couches, { pas = 0.1, graine = 1, bruit = 0.08, gwl = 2 } = {}) {
    let a = graine >>> 0;
    const u = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(u(), 1e-12))) * Math.cos(2 * Math.PI * u());
    const H = couches.reduce((s, c) => s + c.h, 0), z = [], qc = [], fs = [];
    const couche = zz => { let t = 0; for (const c of couches) { if (zz < t + c.h) return c; t += c.h; } return couches[couches.length - 1]; };
    for (let zz = pas; zz <= H + 1e-9; zz += pas) {
      // σ'v approchée (γ = 18, γw = 9,8) pour la tendance en profondeur
      const sve = 18 * zz - (zz > gwl ? 9.8 * (zz - gwl) : 0), tend = Math.pow(Math.max(sve, 36) / 100, 0.25);
      const lisse = (dz) => couche(Math.max(0, Math.min(H - 1e-9, zz + dz)));
      const c0 = lisse(-0.1), c1 = lisse(0), c2 = lisse(0.1), q = ((c0.qc + 2 * c1.qc + c2.qc) / 4) * tend * Math.exp(bruit * gauss());
      const rf = ((c0.rf + 2 * c1.rf + c2.rf) / 4) * Math.exp(0.5 * bruit * gauss());
      z.push(+zz.toFixed(4)); qc.push(1000 * q); fs.push(10 * q * rf);
    }
    return { z, qc, fs };
  }
  // Classes du LPI (Iwasaki et al. 1982) : 0 nul, ≤ 5 faible, ≤ 15 élevé, au-delà très élevé.
  const classeLPI = v => (v <= 0 ? 'nul' : v <= 5 ? 'faible' : v <= 15 ? 'élevé' : 'très élevé');

  return { PA, GW, rd, csr, msfCPT, msfSPT, kSigmaCPT, kSigmaSPT, crrCPT, crrSPT, poidsRobertson, indiceIc, finesIc, deltaQc1n, pointCPT, cpt, deltaN1, pointSPT, lpi, deformationVolumique, tassementZhang, classeLPI, sondageSynthetique };
})();
export default Liquefaction;
