import Spectre from './spectre.js';
import Inelastique from './inelastique.js';
import Batiment from './batiment.js';

// src/sismo/poussee.js — analyse en poussée progressive et méthode N2 (EN 1998-1:2004, § 4.3.3.4.2 et annexe B)
// d'un bâtiment en console de cisaillement à étages élastiques parfaitement plastiques (rigidité k_i en kN/m,
// résistance Vy_i en kN, masses en t) ; calcul temporel non linéaire du même modèle (ressorts d'étage à écrouissage
// cinématique comme Steel01, amortissement de Rayleigh sur la rigidité initiale, Newmark à accélération moyenne et
// Newton, sous-pas ≤ Tmin/20). Vérifié contre OpenSeesPy (tests/references/poussee.json). Solveurs purs.
const Poussee = (() => {
  'use strict';
  const somme = a => a.reduce((s, x) => s + x, 0);
  // Efforts tranchants d'étage S_i = Σ_{j ≥ i} p_j d'un profil de forces de plancher.
  const cumulHaut = p => { const S = new Array(p.length); for (let i = p.length - 1, s = 0; i >= 0; i--) { s += p[i]; S[i] = s; } return S; };

  // Profils de charge du § 4.3.3.4.2.2 (1) : « modal » Fi = mi·Φi (Φ normée au sommet), « uniforme » Fi = mi.
  const profil = (m, phi) => m.map((x, i) => x * (phi ? phi[i] : 1));

  // Courbe de capacité sous le profil p (forces par unité du multiplicateur λ). Étages élastiques parfaitement
  // plastiques : comportement élastique jusqu'à λ* = min_i Vy_i / S_i, où l'étage critique c plastifie et forme un
  // mécanisme d'étage ; au-delà, seul cet étage se déforme, à effort constant. Renvoie l'étage critique, l'effort à
  // la base Fb = λ*·S_1, le déplacement en tête à la plastification dy, et les glissements d'étage pour un
  // déplacement en tête donné.
  function capacite({ k, Vy }, p) {
    const S = cumulHaut(p), ratios = Vy.map((v, i) => v / S[i]);
    const lambda = Math.min(...ratios), c = ratios.indexOf(lambda), souple = somme(S.map((s, i) => s / k[i]));
    const dy = lambda * souple, Fb = lambda * S[0];
    function glissements(dTop) {
      const f = Math.min(dTop, dy) / dy, d = S.map((s, i) => (f * lambda * s) / k[i]);
      if (dTop > dy) d[c] += dTop - dy;
      return d;
    }
    const effort = dTop => (dTop <= dy ? (Fb * dTop) / dy : Fb);
    return { S, critique: c, lambda, Fb, dy, K: Fb / dy, glissements, effort };
  }

  // Résistances d'étage d'un bâtiment dimensionné à l'EN 1998-1:2004 : ω fois les efforts tranchants de calcul de
  // l'analyse modale spectrale (modes retenus, SRSS ou CQC selon le § 4.3.3.3.2) pour le spectre Sd (m/s²) ;
  // ω est la surrésistance.
  function resistances(bat, Sd, { omega = 1.5 } = {}) {
    const md = Batiment.modes(bat), n = Batiment.modesRetenus(md).n, regle = Batiment.independants(md, n) ? 'srss' : 'cqc';
    return Batiment.spectrale(bat, md, Sd, { n, regle }).V.map(v => omega * v);
  }

  // Système équivalent à un degré de liberté (annexe B, B.2) : m* = Σ mi·Φi, Γ = m* / Σ mi·Φi².
  function equivalent(m, phi) {
    const ms = somme(m.map((x, i) => x * phi[i]));
    return { mEtoile: ms, gamma: ms / somme(m.map((x, i) => x * phi[i] * phi[i])) };
  }

  // Méthode N2 complète pour un profil (Φ normée au sommet ; Φ = 1 partout pour le profil uniforme) :
  // F* = Fb/Γ, d* = dn/Γ ; idéalisation élasto-plastique à aire égale (B.3) jusqu'au mécanisme, ici exacte :
  // d*y = 2·(d*m − E*m/F*y) = dy/Γ ; T* = 2π·√(m*·d*y / F*y) (B.4) ; déplacement cible d*t (B.5, Inelastique.n2)
  // pour Se(T*) ; dt = Γ·d*t (B.6). se : T → Se(T) en m/s².
  function n2(bat, phi, { se, TC }) {
    const p = profil(bat.m, phi), cap = capacite(bat, p), { mEtoile, gamma } = equivalent(bat.m, phi);
    const Fy = cap.Fb / gamma, dy = cap.dy / gamma, T = 2 * Math.PI * Math.sqrt((mEtoile * dy) / Fy), SeT = se(T);
    const r = Inelastique.n2({ T, saY: Fy / mEtoile, se: SeT, TC });
    const dt = gamma * r.dt;
    return { cap, mEtoile, gamma, Fy, dy, T, se: SeT, ...r, dtEtoile: r.dt, dt, glissements: cap.glissements(dt) };
  }

  // Amortissement de Rayleigh c = a0·M + a1·K0 donnant ξ aux modes 1 et 2 (mode 1 seul : proportionnel à la masse).
  function rayleigh(md, xi = 0.05) {
    if (md.length < 2) return { a0: 2 * xi * md[0].w, a1: 0 };
    const w1 = md[0].w, w2 = md[1].w;
    return { a0: (2 * xi * w1 * w2) / (w1 + w2), a1: (2 * xi) / (w1 + w2) };
  }

  // Système tridiagonal (sous-diagonale a, diagonale b, sur-diagonale c) : algorithme de Thomas.
  function thomas(a, b, c, r) {
    const n = b.length, cp = new Array(n), rp = new Array(n), x = new Array(n);
    cp[0] = c[0] / b[0]; rp[0] = r[0] / b[0];
    for (let i = 1; i < n; i++) { const d = b[i] - a[i] * cp[i - 1]; cp[i] = c[i] / d; rp[i] = (r[i] - a[i] * rp[i - 1]) / d; }
    x[n - 1] = rp[n - 1];
    for (let i = n - 2; i >= 0; i--) x[i] = rp[i] - cp[i] * x[i + 1];
    return x;
  }

  // Calcul temporel non linéaire : acc (m/s²) au pas dt ; ressorts d'étage (k_i, Vy_i, α, éventuellement un α par
  // étage) ; amortissement C = a0·M + amortisseurs d'étage c_i (kN·s/m) — par défaut Rayleigh sur la rigidité
  // initiale (ξ aux modes 1 et 2), soit c_i = a1·k_i ; Newmark (β = 1/4, γ = 1/2) et Newton sur le système couplé,
  // sous-pas s = ⌈dt/(Tmin/20)⌉ (ou sousPas imposé), accélération interpolée linéairement. Renvoie, aux instants du
  // signal, le déplacement en tête, l'effort à la base, l'accélération absolue du dernier niveau et les historiques
  // des glissements et des efforts d'étage ; les maxima, les glissements résiduels et les ductilités d'étage.
  function temporel({ m, k, Vy, alpha = 0 }, acc, dt, { xi = 0.05, amortissement = null, sousPas = null, tolerance = 1e-12 } = {}) {
    const N = m.length, md = Batiment.modes({ m, k });
    let a0, c;
    if (amortissement) ({ a0, c } = amortissement);
    else { const r = rayleigh(md, xi); a0 = r.a0; c = k.map(ki => r.a1 * ki); }
    const s = sousPas || Math.max(...md.map(x => Spectre.sousPas(dt, x.T))), h = dt / s;
    const ress = k.map((ki, i) => Inelastique.ressort(ki, Vy[i], Array.isArray(alpha) ? alpha[i] : alpha));
    const beta = 0.25, gam = 0.5, cu = 1 / (beta * h * h), cv = gam / (beta * h);
    // C = a0·M + assemblage des amortisseurs d'étage (tridiagonale)
    const Cd = m.map((mi, i) => a0 * mi + c[i] + (i + 1 < N ? c[i + 1] : 0)), Co = m.map((_, i) => (i + 1 < N ? -c[i + 1] : 0));
    const Cmul = v => v.map((x, i) => Cd[i] * x + (i ? Co[i - 1] * v[i - 1] : 0) + (i + 1 < N ? Co[i] * v[i + 1] : 0));
    let u = new Array(N).fill(0), v = new Array(N).fill(0), d0 = new Array(N).fill(0), f0 = new Array(N).fill(0);
    let a = m.map(() => -acc[0]);
    const L = acc.length, toit = new Float64Array(L), base = new Float64Array(L), accTete = new Float64Array(L);
    const G = m.map(() => new Float64Array(L)), E = m.map(() => new Float64Array(L));
    accTete[0] = a[N - 1] + acc[0];
    const dMax = new Array(N).fill(0), fMax = new Array(N).fill(0);
    for (let i = 0; i < L - 1; i++) {
      for (let j = 1; j <= s; j++) {
        const ag = acc[i] + ((acc[i + 1] - acc[i]) * j) / s;
        const pred = u.map((x, n) => x + h * v[n] + h * h * (0.5 - beta) * a[n]);
        let un = u.slice(), f = f0.slice(), kt = k.slice();
        for (let it = 0; it < 50; it++) {
          const dn = un.map((x, n) => x - (n ? un[n - 1] : 0));
          dn.forEach((x, n) => { const e = ress[n].essai(d0[n], f0[n], x); f[n] = e.f; kt[n] = e.kt; });
          const an = un.map((x, n) => cu * (x - pred[n])), vn = v.map((x, n) => x + h * (1 - gam) * a[n] + gam * h * an[n]);
          const Cv = Cmul(vn);
          const R = un.map((_, n) => m[n] * an[n] + Cv[n] + f[n] - (n + 1 < N ? f[n + 1] : 0) + m[n] * ag);
          const Kd = un.map((_, n) => cu * m[n] + cv * Cd[n] + kt[n] + (n + 1 < N ? kt[n + 1] : 0));
          const Ko = un.map((_, n) => cv * Co[n] - (n + 1 < N ? kt[n + 1] : 0));
          const du = thomas(Ko.map((_, n) => (n ? Ko[n - 1] : 0)), Kd, Ko, R.map(x => -x));
          let ecart = 0, norme = 1e-6;
          un = un.map((x, n) => { ecart = Math.max(ecart, Math.abs(du[n])); return x + du[n]; });
          for (const x of un) norme = Math.max(norme, Math.abs(x));
          if (ecart <= tolerance * norme) break;
        }
        const dn = un.map((x, n) => x - (n ? un[n - 1] : 0));
        dn.forEach((x, n) => { f[n] = ress[n].essai(d0[n], f0[n], x).f; });
        const an = un.map((x, n) => cu * (x - pred[n]));
        v = v.map((x, n) => x + h * (1 - gam) * a[n] + gam * h * an[n]);
        u = un; a = an; d0 = dn; f0 = f;
        dn.forEach((x, n) => { dMax[n] = Math.max(dMax[n], Math.abs(x)); fMax[n] = Math.max(fMax[n], Math.abs(f[n])); });
      }
      toit[i + 1] = u[N - 1]; base[i + 1] = f0[0]; accTete[i + 1] = a[N - 1] + acc[i + 1];
      for (let n = 0; n < N; n++) { G[n][i + 1] = d0[n]; E[n][i + 1] = f0[n]; }
    }
    const residuel = d0.map((x, n) => x - f0[n] / k[n]);
    return { h, toit, base, accTete, glissements: G, efforts: E, dMax, fMax, residuel, mu: dMax.map((x, n) => x / (Vy[n] / k[n])), a0, c };
  }

  return { profil, capacite, resistances, equivalent, n2, rayleigh, thomas, temporel };
})();
export default Poussee;
