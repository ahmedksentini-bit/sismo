// src/sismo/refraction.js — hodochrones d'une croûte sur manteau et leur inversion.
// Droite t = tᵢ + Δ/V ; ondes directe (Pg) et réfractée sous le Moho (Pn). Solveurs purs.
const Refraction = (() => {
  'use strict';

  // Droite passant par deux points (Δ en km, t en s, temps non réduits).
  function droite(p1, p2) {
    if (Math.abs(p2.d - p1.d) < 1e-6) return null;
    const pente = (p2.t - p1.t) / (p2.d - p1.d);
    if (pente <= 0) return null;
    return { V: 1 / pente, ti: p1.t - pente * p1.d };
  }

  // Épaisseur de la croûte H depuis V₁, V₂, le temps d'intercept tᵢ de Pn et la profondeur h du foyer :
  // tᵢ = (2H − h)·cos iᶜ / V₁ avec sin iᶜ = V₁/V₂.
  function epaisseur(V1, V2, ti, h = 0) {
    if (!(V2 > V1)) return null;
    const cos = Math.sqrt(1 - (V1 / V2) ** 2);
    return ((ti * V1) / cos + h) / 2;
  }

  // Temps d'intercept attendu pour un modèle (inverse de la fonction précédente).
  function intercept(V1, V2, H, h = 0) {
    return ((2 * H - h) * Math.sqrt(1 - (V1 / V2) ** 2)) / V1;
  }

  // Distance de croisement : Pg (√(Δ² + h²)/V₁) et Pn (Δ/V₂ + tᵢ) arrivent ensemble. Bissection.
  function croisement(V1, V2, ti, h = 0) {
    const f = d => Math.hypot(d, h) / V1 - (d / V2 + ti);
    let a = 0, b = 2000;
    if (f(a) > 0 || f(b) < 0) return null;
    for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (f(m) < 0) a = m; else b = m; }
    return (a + b) / 2;
  }

  // Intersection de deux droites t = tᵢ + Δ/V (croisement lu sur le profil).
  function intersection(d1, d2) {
    const s = 1 / d1.V - 1 / d2.V;
    if (Math.abs(s) < 1e-9) return null;
    return (d2.ti - d1.ti) / s;
  }

  return { droite, epaisseur, intercept, croisement, intersection };
})();
export default Refraction;
