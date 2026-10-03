import Oscillateur from './oscillateur.js';

// src/sismo/spectre.js — spectre de réponse d'un accélérogramme et spectre élastique de l'Eurocode 8.
// Solveurs purs. L'intégration passe par Newmark à accélération moyenne (Oscillateur), avec des
// sous-pas pour les courtes périodes : le pas reste inférieur à T/20.
const Spectre = (() => {
  'use strict';
  const O = Oscillateur;
  const G = 9.81;

  // Périodes de calcul réparties en échelle logarithmique.
  function periodes(n = 100, tmin = 0.02, tmax = 4) {
    return Array.from({ length: n }, (_, i) => tmin * Math.pow(tmax / tmin, i / (n - 1)));
  }
  const sousPas = (dt, T) => Math.max(1, Math.ceil(dt / (T / 20)));

  // Accélération rééchantillonnée par interpolation linéaire (k sous-pas par pas).
  function surEchantillonner(acc, k) {
    if (k === 1) return acc;
    const n = acc.length, out = new Float64Array((n - 1) * k + 1);
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < k; j++) out[i * k + j] = acc[i] + ((acc[i + 1] - acc[i]) * j) / k;
    out[out.length - 1] = acc[n - 1];
    return out;
  }

  // Spectres de réponse : Sd (m), pseudo-vitesse Sv = ω·Sd (m/s), pseudo-accélération Sa = ω²·Sd (m/s²).
  function reponse(acc, dt, T, xi) {
    const Sd = new Float64Array(T.length), Sv = new Float64Array(T.length), Sa = new Float64Array(T.length);
    T.forEach((Ti, k) => {
      const m = sousPas(dt, Ti), { x } = O.integrer(surEchantillonner(acc, m), dt / m, 1 / Ti, xi);
      let d = 0;
      for (let i = 0; i < x.length; i++) d = Math.max(d, Math.abs(x[i]));
      const w = (2 * Math.PI) / Ti;
      Sd[k] = d; Sv[k] = w * d; Sa[k] = w * w * d;
    });
    return { T, Sd, Sv, Sa };
  }

  // Calcul progressif pour l'animation : un oscillateur par période, avancé échantillon par échantillon.
  function progressif(T, xi, dt) {
    const etats = T.map(() => ({ x: 0, v: 0 })), Sd = new Float64Array(T.length), m = T.map(Ti => sousPas(dt, Ti));
    return {
      T, Sd, etats,
      avancer(ag0, ag1) {
        T.forEach((Ti, k) => {
          const e = etats[k], h = dt / m[k];
          for (let j = 0; j < m[k]; j++) {
            const a0 = ag0 + ((ag1 - ag0) * j) / m[k], a1 = ag0 + ((ag1 - ag0) * (j + 1)) / m[k];
            O.pas(e, a0, a1, h, 1 / Ti, xi);
          }
          if (Math.abs(e.x) > Sd[k]) Sd[k] = Math.abs(e.x);
        });
      },
      Sa: k => (((2 * Math.PI) / T[k]) ** 2) * Sd[k],
    };
  }

  // EN 1998-1:2004, § 3.2.2.2 : spectre élastique horizontal, valeurs recommandées (tableaux 3.2 et 3.3).
  const EC8_2004 = {
    1: { A: { S: 1.0, TB: 0.15, TC: 0.4, TD: 2.0 }, B: { S: 1.2, TB: 0.15, TC: 0.5, TD: 2.0 }, C: { S: 1.15, TB: 0.2, TC: 0.6, TD: 2.0 }, D: { S: 1.35, TB: 0.2, TC: 0.8, TD: 2.0 }, E: { S: 1.4, TB: 0.15, TC: 0.5, TD: 2.0 } },
    2: { A: { S: 1.0, TB: 0.05, TC: 0.25, TD: 1.2 }, B: { S: 1.35, TB: 0.05, TC: 0.25, TD: 1.2 }, C: { S: 1.5, TB: 0.1, TC: 0.25, TD: 1.2 }, D: { S: 1.8, TB: 0.1, TC: 0.3, TD: 1.2 }, E: { S: 1.6, TB: 0.05, TC: 0.25, TD: 1.2 } },
  };
  // Correction d'amortissement η = √(10 / (5 + ξ)) ≥ 0,55, ξ en %.
  const eta = xi => Math.max(0.55, Math.sqrt(10 / (5 + 100 * xi)));
  // Se(T) dans l'unité de ag.
  function ec8(T, { type = 1, sol = 'A', ag, xi = 0.05 }) {
    const { S, TB, TC, TD } = EC8_2004[type][sol], n = eta(xi);
    if (T <= TB) return ag * S * (1 + (T / TB) * (n * 2.5 - 1));
    if (T <= TC) return ag * S * n * 2.5;
    if (T <= TD) return ag * S * n * 2.5 * (TC / T);
    return ag * S * n * 2.5 * ((TC * TD) / (T * T));
  }
  // Période fondamentale approchée (EN 1998-1, § 4.3.3.2.2) : T₁ = Ct·H^(3/4), H en m.
  const CT = { acier: 0.085, beton: 0.075, autres: 0.05 };
  const periodeApprochee = (H, systeme) => CT[systeme] * Math.pow(H, 0.75);

  return { G, periodes, reponse, progressif, EC8_2004, eta, ec8, CT, periodeApprochee };
})();
export default Spectre;
