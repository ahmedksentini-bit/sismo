import Sismo from './signal.js';

// src/sismo/site.js — effets de site 1D : propagation verticale d'ondes SH dans une colonne de sol stratifiée
// sur un rocher élastique (Kramer 1996), en linéaire ou en linéaire équivalent (SHAKE : propriétés compatibles
// avec 0,65 × la déformation maximale, itérées jusqu'à convergence). Courbes de dégradation de Darendeli (2001).
// Mêmes conventions que pystrata (Kottke), qui sert de référence hors ligne (tests/references/site.json) :
// module complexe de Dormieux et Canou (1990), courbes échantillonnées sur 20 déformations de 10⁻⁶ à 10^−1,5
// et interpolées en ln γ. Vs30 et classe de sol de l'EN 1998-1:2004 (tableau 3.1). Solveurs purs.
const Site = (() => {
  'use strict';
  const GRAV = 9.80665, KPA_ATM = 1000 / 101325;

  // ── Complexes : [re, im] ──
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const cexp = a => { const e = Math.exp(a[0]); return [e * Math.cos(a[1]), e * Math.sin(a[1])]; };
  const csqrt = a => { const r = Math.hypot(a[0], a[1]), re = Math.sqrt((r + a[0]) / 2), im = Math.sqrt(Math.max(0, (r - a[0]) / 2)); return [re, a[1] < 0 ? -im : im]; };
  const cabs = a => Math.hypot(a[0], a[1]);

  // ── Darendeli (2001), comme DarendeliSoilType de pystrata ──
  // ip : indice de plasticité (%), ocr, sigmaM : contrainte moyenne effective (kPa), freq (Hz), N : cycles.
  const DEFORMATIONS = Array.from({ length: 20 }, (_, i) => Math.pow(10, -6 + (4.5 * i) / 19));
  function darendeli({ ip = 0, ocr = 1, sigmaM = 101.3, freq = 1, N = 10 } = {}) {
    const atm = sigmaM * KPA_ATM;
    const gammaRef = ((0.0352 + 0.001 * ip * Math.pow(ocr, 0.3246)) * Math.pow(atm, 0.3483)) / 100;
    const courbure = 0.919, masing = 0.6329 - 0.00566 * Math.log(N);
    const xiMin = ((0.8005 + 0.0129 * ip * Math.pow(ocr, -0.1069)) * Math.pow(atm, -0.2889) * (1 + 0.2919 * Math.log(freq))) / 100;
    const GG0 = DEFORMATIONS.map(g => 1 / (1 + Math.pow(g / gammaRef, courbure)));
    // amortissement de Masing d'un modèle hyperbolique (%), corrigé pour la courbure, puis réduit
    const c1 = -1.1143 * courbure ** 2 + 1.8618 * courbure + 0.2523, c2 = 0.0805 * courbure ** 2 - 0.071 * courbure - 0.0095, c3 = -0.0005 * courbure ** 2 + 0.0002 * courbure + 0.0003;
    let cumul = -Infinity;
    const xi = DEFORMATIONS.map((g, i) => {
      const gp = 100 * g, rp = 100 * gammaRef;
      const a1 = (100 / Math.PI) * ((4 * (gp - rp * Math.log((gp + rp) / rp))) / (gp * gp / (gp + rp)) - 2);
      const dm = c1 * a1 + c2 * a1 * a1 + c3 * a1 ** 3;
      cumul = Math.max(cumul, (masing * dm * Math.pow(GG0[i], 0.1)) / 100); // jamais décroissant
      return cumul + xiMin;
    });
    // ξ0 : amortissement en petites déformations, valeur de la courbe à γ = 10⁻⁶ (comme pystrata)
    return { gamma: DEFORMATIONS, GG0, xi, xiMin, xi0: xi[0], gammaRef };
  }
  // Valeur d'une courbe à la déformation γ : interpolation linéaire en ln γ, bornée aux extrémités.
  function interpoler(gammas, valeurs, g) {
    const x = Math.log(Math.max(1e-9, g));
    if (x <= Math.log(gammas[0])) return valeurs[0];
    const n = gammas.length;
    if (x >= Math.log(gammas[n - 1])) return valeurs[n - 1];
    let k = 1;
    while (Math.log(gammas[k]) < x) k++;
    const x0 = Math.log(gammas[k - 1]), x1 = Math.log(gammas[k]);
    return valeurs[k - 1] + ((valeurs[k] - valeurs[k - 1]) * (x - x0)) / (x1 - x0);
  }

  // ── Profil ──
  // couches : [{ h (m), vs (m/s), poids (kN/m³), ip (%), ocr }] ; rocher : { vs, poids, xi }.
  // Sous-couches d'épaisseur au plus `hMax` (les propriétés varient avec la déformation sur la hauteur).
  function subdiviser(couches, hMax = 2.5) {
    const out = [];
    couches.forEach((c, i) => {
      const n = Math.max(1, Math.ceil(c.h / hMax - 1e-9));
      for (let j = 0; j < n; j++) out.push({ ...c, h: c.h / n, origine: i });
    });
    return out;
  }
  // Contrainte moyenne effective au milieu de chaque couche (kPa) : σv' sans nappe, σm' = σv'·(1 + 2K0)/3.
  function contraintes(couches, K0 = 0.5) {
    let z = 0, sv = 0;
    return couches.map(c => {
      const milieu = sv + (c.poids * c.h) / 2;
      sv += c.poids * c.h; z += c.h;
      return { svMilieu: milieu, sigmaM: (milieu * (1 + 2 * K0)) / 3 };
    });
  }
  // Colonne prête au calcul : sous-couches, contraintes, courbes de Darendeli, masses volumiques.
  function colonne(couches, rocher, { hMax = 2.5, K0 = 0.5 } = {}) {
    const sc = subdiviser(couches, hMax), s = contraintes(sc, K0);
    return {
      couches: sc.map((c, i) => ({ ...c, rho: c.poids / GRAV, G0: (c.poids / GRAV) * c.vs * c.vs, sigmaM: s[i].sigmaM, courbes: darendeli({ ip: c.ip || 0, ocr: c.ocr || 1, sigmaM: s[i].sigmaM }) })),
      rocher: { ...rocher, rho: rocher.poids / GRAV, G0: (rocher.poids / GRAV) * rocher.vs * rocher.vs },
    };
  }

  // ── Propagation (Kramer 1996) ──
  // G* = G·(√(1 − 4ξ²) + 2iξ) (Dormieux et Canou 1990) ; v* = √(G*/ρ) ; k* = ω/v*.
  // Amplitudes montante A et descendante B ; surface libre : A₁ = B₁ = 1 ;
  // A(m+1) = ½A(1 + α)e^{ik*h} + ½B(1 − α)e^{−ik*h},  B(m+1) = ½A(1 − α)e^{ik*h} + ½B(1 + α)e^{−ik*h},
  // α = k*_m G*_m / (k*_{m+1} G*_{m+1}).
  function proprietesComplexes(G, xi, rho) {
    const Gs = [G * Math.sqrt(1 - 4 * xi * xi), 2 * G * xi];
    return { Gs, vs: csqrt([Gs[0] / rho, Gs[1] / rho]) };
  }
  function ondes(col, etat, w) {
    const milieux = [...col.couches.map((c, i) => ({ ...proprietesComplexes(etat.G[i], etat.xi[i], c.rho), h: c.h })), { ...proprietesComplexes(col.rocher.G0, col.rocher.xi, col.rocher.rho), h: 0 }];
    const k = milieux.map(m => cdiv([w, 0], m.vs)), A = [[1, 0]], B = [[1, 0]];
    for (let m = 0; m < milieux.length - 1; m++) {
      const alpha = cdiv(cmul(k[m], milieux[m].Gs), cmul(k[m + 1], milieux[m + 1].Gs));
      const e = cexp(cmul([0, 1], cmul(k[m], [milieux[m].h, 0]))), ei = cdiv([1, 0], e);
      const p = cmul([0.5, 0], cadd([1, 0], alpha)), q = cmul([0.5, 0], csub([1, 0], alpha));
      A.push(cadd(cmul(cmul(A[m], p), e), cmul(cmul(B[m], q), ei)));
      B.push(cadd(cmul(cmul(A[m], q), e), cmul(cmul(B[m], p), ei)));
    }
    return { A, B, k };
  }
  // Fonction de transfert de l'accélération : surface (libre) / affleurement du rocher (2·A du rocher).
  function transfert(col, etat, f) {
    if (f === 0) return [1, 0];
    const { A } = ondes(col, etat, 2 * Math.PI * f);
    return cdiv([1, 0], A[A.length - 1]);
  }
  // Déformation au milieu de la couche m par unité d'accélération (g) à l'affleurement du rocher.
  function transfertDeformation(o, m, h, w) {
    const z = h / 2, e = cexp(cmul([0, 1], cmul(o.k[m], [z, 0]))), ei = cdiv([1, 0], e);
    const num = cmul(cmul([0, 1], o.k[m]), csub(cmul(o.A[m], e), cmul(o.B[m], ei)));
    const den = cmul([-w * w, 0], cmul([2, 0], o.A[o.A.length - 1]));
    return cmul([GRAV, 0], cdiv(num, den));
  }

  // Spectre de l'entrée : FFT sur la puissance de 2 suivante (zéros ajoutés), comme pystrata.
  function spectreEntree(acc, dt, n = null) {
    const N = n || Sismo.puissance2(acc.length), re = new Float64Array(N), im = new Float64Array(N);
    re.set(acc);
    Sismo.fft(re, im, false);
    return { N, dt, re, im, df: 1 / (N * dt) };
  }
  // Série temporelle de H(f)·X(f) (H donné pour f = k·df, k ≤ N/2).
  function serie(sp, H) {
    const { N } = sp, re = new Float64Array(N), im = new Float64Array(N);
    for (let k = 0; k <= N / 2; k++) {
      const [hr, hi] = H[k], xr = sp.re[k], xi = sp.im[k];
      re[k] = hr * xr - hi * xi; im[k] = hr * xi + hi * xr;
      if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    }
    im[0] = 0; im[N / 2] = 0;
    Sismo.fft(re, im, true);
    return re;
  }
  const pic = x => { let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return p; };

  // Calcul complet sur un accélérogramme (g) à l'affleurement du rocher. Linéaire équivalent sauf
  // `lineaire: true` (G = G0, ξ = ξ0). Renvoie l'accélération en surface (g), les fonctions
  // de transfert, et par couche G/G0, ξ, γeff et γmax.
  function calculer(col, acc, dt, { lineaire = false, ratio = 0.65, tolerance = 1e-4, iterMax = 30, n = null } = {}) {
    const sp = spectreEntree(acc, dt, n), nf = sp.N / 2 + 1, nc = col.couches.length;
    const etat = { G: col.couches.map(c => c.G0), xi: col.couches.map(c => c.courbes.xi0) };
    const regler = gammas => {
      let ecart = 0;
      col.couches.forEach((c, i) => {
        const G = c.G0 * interpoler(c.courbes.gamma, c.courbes.GG0, gammas[i]), xi = interpoler(c.courbes.gamma, c.courbes.xi, gammas[i]);
        ecart = Math.max(ecart, Math.abs(G - etat.G[i]) / G, Math.abs(xi - etat.xi[i]) / xi);
        etat.G[i] = G; etat.xi[i] = xi;
      });
      return ecart;
    };
    // estimation de départ, comme pystrata : γ = PGV / Vs
    let pgv = 0;
    if (!lineaire) {
      const Hv = Array.from({ length: nf }, (_, k) => (k === 0 ? [0, 0] : [0, -GRAV / (2 * Math.PI * k * sp.df)]));
      pgv = pic(serie(sp, Hv));
      regler(col.couches.map(c => pgv / c.vs));
    }
    // Une passe : fonction de transfert surface / rocher et déformations au milieu des couches, pour
    // toutes les fréquences. α et 1/v* ne dépendent pas de la fréquence : précalculés, puis arithmétique
    // scalaire (même récurrence que `ondes`).
    const passe = () => {
      const med = [...col.couches.map((c, i) => ({ ...proprietesComplexes(etat.G[i], etat.xi[i], c.rho), h: c.h })), { ...proprietesComplexes(col.rocher.G0, col.rocher.xi, col.rocher.rho), h: 0 }];
      const inv = med.map(m => cdiv([1, 0], m.vs)), nm = med.length;
      const alpha = med.slice(0, -1).map((m, i) => cdiv(cmul(inv[i], m.Gs), cmul(inv[i + 1], med[i + 1].Gs)));
      const H = new Array(nf), Hg = col.couches.map(() => new Array(nf));
      const Ar = new Float64Array(nm), Ai = new Float64Array(nm), Br = new Float64Array(nm), Bi = new Float64Array(nm);
      for (let k = 0; k < nf; k++) {
        const w = 2 * Math.PI * k * sp.df;
        if (k === 0) { H[k] = [1, 0]; Hg.forEach(t => { t[k] = [0, 0]; }); continue; }
        Ar[0] = 1; Ai[0] = 0; Br[0] = 1; Bi[0] = 0;
        for (let m = 0; m < nm - 1; m++) {
          // e = exp(i·w·(1/v*)·h)
          const a = w * inv[m][0] * med[m].h, b = w * inv[m][1] * med[m].h, mod = Math.exp(-b), er = mod * Math.cos(a), ei = mod * Math.sin(a);
          const d = er * er + ei * ei, fr = er / d, fi = -ei / d; // 1/e
          const pr = 0.5 * (1 + alpha[m][0]), pi = 0.5 * alpha[m][1], qr = 0.5 * (1 - alpha[m][0]), qi = -0.5 * alpha[m][1];
          const Aer = Ar[m] * er - Ai[m] * ei, Aei = Ar[m] * ei + Ai[m] * er, Bfr = Br[m] * fr - Bi[m] * fi, Bfi = Br[m] * fi + Bi[m] * fr;
          Ar[m + 1] = Aer * pr - Aei * pi + Bfr * qr - Bfi * qi; Ai[m + 1] = Aer * pi + Aei * pr + Bfr * qi + Bfi * qr;
          Br[m + 1] = Aer * qr - Aei * qi + Bfr * pr - Bfi * pi; Bi[m + 1] = Aer * qi + Aei * qr + Bfr * pi + Bfi * pr;
        }
        const aN = [Ar[nm - 1], Ai[nm - 1]];
        H[k] = cdiv([1, 0], aN);
        // γ(milieu de m) / accélération du rocher (g) = g·i·k*(A·e½ − B/e½) / (−ω²·2A_N)
        const den = cmul([-2 * w * w, 0], aN);
        for (let m = 0; m < nm - 1; m++) {
          const a = 0.5 * w * inv[m][0] * med[m].h, b = 0.5 * w * inv[m][1] * med[m].h, mod = Math.exp(-b), er = mod * Math.cos(a), ei = mod * Math.sin(a);
          const d = er * er + ei * ei, fr = er / d, fi = -ei / d;
          const dr = Ar[m] * er - Ai[m] * ei - (Br[m] * fr - Bi[m] * fi), di = Ar[m] * ei + Ai[m] * er - (Br[m] * fi + Bi[m] * fr);
          const kr = w * inv[m][0], ki = w * inv[m][1]; // k*
          const nr = -(kr * di + ki * dr), ni = kr * dr - ki * di; // i·k*·(…)
          const q = cdiv([nr, ni], den);
          Hg[m][k] = [GRAV * q[0], GRAV * q[1]];
        }
      }
      return { H, Hg };
    };
    let p = passe(), iterations = 0, ecart = 0;
    if (!lineaire) {
      for (; iterations < iterMax; iterations++) {
        ecart = regler(p.Hg.map(Hg => ratio * pic(serie(sp, Hg))));
        p = passe();
        if (ecart < tolerance) break;
      }
    }
    const gmax = p.Hg.map(Hg => pic(serie(sp, Hg)));
    const surface = serie(sp, p.H).slice(0, acc.length);
    return {
      surface, H: p.H, df: sp.df, N: sp.N, iterations, ecart, pgv,
      couches: col.couches.map((c, i) => ({ GG0: etat.G[i] / c.G0, xi: etat.xi[i], gammaEff: ratio * gmax[i], gammaMax: gmax[i], vs: Math.sqrt(etat.G[i] / c.rho) })),
    };
  }

  // ── Grandeurs de classement ──
  // Vs30 = 30 / Σ hi/vi sur les 30 premiers mètres (EN 1998-1:2004, éq. 3.1), le rocher complétant.
  function vs30(couches, rocher) {
    let z = 0, t = 0;
    for (const c of couches) { const h = Math.min(c.h, 30 - z); if (h <= 0) break; t += h / c.vs; z += h; }
    if (z < 30) t += (30 - z) / rocher.vs;
    return 30 / t;
  }
  // Fréquence fondamentale approchée de la colonne : Vs moyen (temps de trajet) / 4H.
  function frequenceQuartOnde(couches) {
    const H = couches.reduce((s, c) => s + c.h, 0), t = couches.reduce((s, c) => s + c.h / c.vs, 0);
    return 1 / (4 * t);
  }
  // Classe de sol de l'EN 1998-1:2004, tableau 3.1, par Vs30 ; E : 5 à 20 m d'alluvions de type C ou D
  // (Vs < 360 m/s) sur un substratum à Vs > 800 m/s. S1 et S2 (argiles molles, sols liquéfiables) ne se
  // déduisent pas de Vs seul. Vs30 = 800 m/s exactement compte comme rocher A, comme au banc « aléa ».
  function classeEC8(couches, rocher) {
    const v = vs30(couches, rocher), H = couches.reduce((s, c) => s + c.h, 0);
    const vMoy = H > 0 ? H / couches.reduce((s, c) => s + c.h / c.vs, 0) : Infinity;
    if (rocher.vs > 800 && H >= 5 && H <= 20 && vMoy < 360) return { classe: 'E', vs30: v };
    return { classe: v >= 800 ? 'A' : v >= 360 ? 'B' : v >= 180 ? 'C' : 'D', vs30: v };
  }

  return { GRAV, DEFORMATIONS, darendeli, interpoler, subdiviser, contraintes, colonne, proprietesComplexes, ondes, transfert, calculer, vs30, frequenceQuartOnde, classeEC8, cabs };
})();
export default Site;
