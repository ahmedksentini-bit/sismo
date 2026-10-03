import Spectre from './spectre.js';

// src/sismo/inelastique.js — réponse inélastique d'un oscillateur à un degré de liberté : ressort bilinéaire à
// écrouissage cinématique (comme Steel01 d'OpenSees sans écrouissage isotrope), amortissement visqueux
// c = 2ξω·m constant, Newmark à accélération moyenne avec itérations de Newton à chaque pas (sous-pas ≤ T/20,
// accélération interpolée linéairement). Ductilité, spectres à résistance constante, facteur de réduction
// pour une ductilité visée, déplacement cible de la méthode N2 (EN 1998-1:2004, annexe B). Vérifié contre
// OpenSeesPy (tests/references/inelastique.json). Grandeurs par unité de masse. Solveurs purs.
const Inelastique = (() => {
  'use strict';

  // Ressort bilinéaire cinématique : la force reste entre deux droites de pente α·k décalées de ±(1 − α)·fy.
  function ressort(k, fy, alpha) {
    const kh = alpha * k, bord = (1 - alpha) * fy;
    return {
      // force et raideur tangente pour le déplacement u, depuis l'état validé (u0, f0)
      essai(u0, f0, u) {
        const ft = f0 + k * (u - u0), haut = kh * u + bord, bas = kh * u - bord;
        if (ft > haut) return { f: haut, kt: kh };
        if (ft < bas) return { f: bas, kt: kh };
        return { f: ft, kt: k };
      },
    };
  }

  // Intégration. acc : accélération du sol (m/s²), pas dt ; T (s), ξ, fy (m/s², force par unité de masse,
  // soit Sa de plastification), α. Renvoie u (m), f (m/s²) aux instants du signal, umax, uy et μ = umax/uy,
  // et l'énergie hystérétique dissipée (m²/s²).
  function integrer(acc, dt, { T, xi = 0.05, fy = Infinity, alpha = 0, tolerance = 1e-12 }) {
    const w = (2 * Math.PI) / T, k = w * w, c = 2 * xi * w, r = ressort(k, fy, alpha);
    const m = Math.max(1, Math.ceil(dt / (T / 20) - 1e-9)), h = dt / m, beta = 0.25, gamma = 0.5;
    const n = acc.length, U = new Float64Array(n), F = new Float64Array(n);
    let u = 0, v = 0, a = -acc[0], f = 0, umax = 0, energie = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 1; j <= m; j++) {
        const ag = acc[i] + ((acc[i + 1] - acc[i]) * j) / m;
        // Newton sur u(n+1)
        let un = u, fn = f, kt = k;
        const cu = 1 / (beta * h * h), cv = gamma / (beta * h);
        const pred = u + h * v + h * h * (0.5 - beta) * a;
        for (let it = 0; it < 50; it++) {
          const e = r.essai(u, f, un);
          fn = e.f; kt = e.kt;
          const an = cu * (un - pred), vn = v + h * (1 - gamma) * a + gamma * h * an;
          const R = an + c * vn + fn + ag, Keff = cu + c * cv + kt;
          const du = -R / Keff;
          un += du;
          if (Math.abs(du) <= tolerance * Math.max(1e-6, Math.abs(un))) break;
        }
        const e = r.essai(u, f, un);
        fn = e.f;
        const an = cu * (un - pred), vn = v + h * (1 - gamma) * a + gamma * h * an;
        energie += 0.5 * (fn + f) * (un - u); // travail de la force du ressort
        u = un; v = vn; a = an; f = fn;
      }
      U[i + 1] = u; F[i + 1] = f;
      umax = Math.max(umax, Math.abs(u));
    }
    const uy = fy / k, uFinal = u, eElastique = (f * f) / (2 * k);
    return { u: U, f: F, umax, uy, mu: Number.isFinite(uy) ? umax / uy : NaN, hysteretique: energie - eElastique, residuel: uFinal - f / k };
  }

  // Résistance élastique demandée : Sa (m/s²) de l'oscillateur élastique de même T et ξ.
  const saElastique = (acc, dt, T, xi = 0.05) => Spectre.reponse(acc, dt, [T], xi).Sa[0];

  // Spectre à résistance constante : μ(T) pour fy = Sa,élastique(T)/R.
  function ductiliteR(acc, dt, T, R, { xi = 0.05, alpha = 0 } = {}) {
    const sae = saElastique(acc, dt, T, xi);
    return integrer(acc, dt, { T, xi, fy: sae / R, alpha }).mu;
  }
  // Facteur de réduction Rμ qui donne la ductilité visée : le plus petit R (la plus grande résistance) tel que
  // μ(R) atteigne μ visé, par balayage puis dichotomie.
  function facteurPourDuctilite(acc, dt, T, muVise, { xi = 0.05, alpha = 0, Rmax = 12 } = {}) {
    const sae = saElastique(acc, dt, T, xi), mu = R => integrer(acc, dt, { T, xi, fy: sae / R, alpha }).mu;
    if (muVise <= 1) return 1;
    let a = 1, b = 1;
    for (let R = 1.05; R <= Rmax; R *= 1.05) { if (mu(R) >= muVise) { b = R; break; } a = R; }
    if (b === 1) return Rmax;
    for (let it = 0; it < 40; it++) { const c = (a + b) / 2; if (mu(c) >= muVise) b = c; else a = c; }
    return (a + b) / 2;
  }

  // Méthode N2 (EN 1998-1:2004, annexe B) : système équivalent élastique parfaitement plastique de période T*,
  // résistance Fy*/m* (m/s²) ; Se(T*) (m/s²) ; TC (s). Déplacement cible d*t (m) :
  //   d*e = Se(T*)·(T*/2π)² ; si T* ≥ TC : d*t = d*e ; sinon, si Fy*/m* ≥ Se(T*) : d*t = d*e,
  //   et sinon d*t = (d*e/qu)·(1 + (qu − 1)·TC/T*) ≥ d*e, avec qu = Se(T*)·m*/Fy*.
  function n2({ T, saY, se, TC }) {
    const de = se * (T / (2 * Math.PI)) ** 2, qu = se / saY;
    let dt = de, regle = 'égaux déplacements';
    if (T < TC && qu > 1) { dt = Math.max(de, (de / qu) * (1 + ((qu - 1) * TC) / T)); regle = 'périodes courtes'; }
    else if (T < TC) regle = 'élastique';
    const dy = saY * (T / (2 * Math.PI)) ** 2;
    return { de, dt, qu, dy, mu: dt / dy, regle };
  }
  // Règles R-μ-T : égaux déplacements (μ = R), égales énergies (μ = (R² + 1)/2), et celle de N2 (Vidic,
  // Fajfar et Fischinger 1994 simplifiée) : μ = 1 + (R − 1)·TC/T sous TC, μ = R au-delà.
  const regles = {
    deplacements: R => R,
    energies: R => (R * R + 1) / 2,
    n2: (R, T, TC) => (T < TC ? 1 + ((R - 1) * TC) / T : R),
  };

  return { ressort, integrer, saElastique, ductiliteR, facteurPourDuctilite, n2, regles };
})();
export default Inelastique;
