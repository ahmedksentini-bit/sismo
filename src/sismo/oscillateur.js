// src/sismo/oscillateur.js — oscillateur à un degré de liberté : le sismomètre (et, plus loin, l'ouvrage).
// ẍ + 2ξω₀ẋ + ω₀²x = −üg ; x est le déplacement de la masse par rapport au bâti, ug celui du sol.
// Solveurs purs, sans accès au DOM.
const Oscillateur = (() => {
  'use strict';

  // Réponse en fréquence vis-à-vis du déplacement du sol : X/Ug = r² / (1 − r² + 2iξr), r = f/f₀.
  // En haute fréquence X → −Ug (la masse reste immobile : on lit le déplacement du sol) ;
  // en basse fréquence X → −Üg/ω₀² (on lit l'accélération du sol).
  function reponse(f, f0, xi) {
    const r = f / f0, re = 1 - r * r, im = 2 * xi * r, d = Math.hypot(re, im);
    return {
      deplacement: (r * r) / d,           // |X / Ug|
      acceleration: 1 / d,                 // |X·ω₀² / Üg|
      phase: Math.atan2(-im, re),          // phase de X/Ug (rad), de 0 à −π
    };
  }

  // Régime de fonctionnement selon r = f/f₀.
  function regime(f, f0) {
    const r = f / f0;
    if (r <= 0.3) return 'accelerometre';
    if (r >= 3) return 'sismometre';
    return 'resonance';
  }

  // Intégration de Newmark à accélération moyenne (β = 1/4, γ = 1/2), inconditionnellement stable.
  // acc : accélération du sol (m/s²) échantillonnée à dt ; renvoie x, v (relatifs au bâti).
  function integrer(acc, dt, f0, xi, x0 = 0, v0 = 0) {
    const w = 2 * Math.PI * f0, c = 2 * xi * w, k = w * w, n = acc.length;
    const b = 0.25, g = 0.5;
    const kh = k + (g / (b * dt)) * c + 1 / (b * dt * dt);
    const a1 = 1 / (b * dt) + (g / b) * c, a2 = 1 / (2 * b) + dt * (g / (2 * b) - 1) * c;
    const x = new Float64Array(n), v = new Float64Array(n);
    let xi_ = x0, vi = v0, ai = -acc[0] - c * v0 - k * x0;
    x[0] = x0; v[0] = v0;
    for (let i = 0; i < n - 1; i++) {
      const dp = -(acc[i + 1] - acc[i]) + a1 * vi + a2 * ai;
      const dx = dp / kh;
      const dv = (g / (b * dt)) * dx - (g / b) * vi + dt * (1 - g / (2 * b)) * ai;
      const da = dx / (b * dt * dt) - vi / (b * dt) - ai / (2 * b);
      xi_ += dx; vi += dv; ai += da;
      x[i + 1] = xi_; v[i + 1] = vi;
    }
    return { x, v };
  }

  // Pas d'avance unique (pour l'animation) : même schéma, état {x, v, a}, accélération du sol a0 → a1.
  function pas(etat, ag0, ag1, dt, f0, xi) {
    const w = 2 * Math.PI * f0, c = 2 * xi * w, k = w * w, b = 0.25, g = 0.5;
    const kh = k + (g / (b * dt)) * c + 1 / (b * dt * dt);
    const a1 = 1 / (b * dt) + (g / b) * c, a2 = 1 / (2 * b) + dt * (g / (2 * b) - 1) * c;
    if (etat.a === undefined) etat.a = -ag0 - c * etat.v - k * etat.x;
    const dx = (-(ag1 - ag0) + a1 * etat.v + a2 * etat.a) / kh;
    const dv = (g / (b * dt)) * dx - (g / b) * etat.v + dt * (1 - g / (2 * b)) * etat.a;
    const da = dx / (b * dt * dt) - etat.v / (b * dt) - etat.a / (2 * b);
    etat.x += dx; etat.v += dv; etat.a += da;
    return etat;
  }

  // Instruments de référence (T₀, ξ) : préréglages du banc.
  const INSTRUMENTS = {
    woodAnderson: { nom: 'Wood-Anderson', f0: 1 / 0.8, xi: 0.8 },
    courtePeriode: { nom: 'Courte période', f0: 1, xi: 0.7 },
    longuePeriode: { nom: 'Longue période', f0: 1 / 20, xi: 0.7 },
    accelerometre: { nom: 'Accéléromètre', f0: 25, xi: 0.7 },
  };

  return { reponse, regime, integrer, pas, INSTRUMENTS };
})();
export default Oscillateur;
