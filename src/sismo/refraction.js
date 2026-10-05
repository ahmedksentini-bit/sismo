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

  // ── Géométrie des rais d'une croûte sur manteau (coupe du banc « profil ») ──
  // Repère de la coupe : x horizontal le long du profil depuis l'épicentre, z profondeur (km), foyer en (0, h).
  // Angle critique iᶜ (sin iᶜ = V₁/V₂), null si le manteau n'est pas plus rapide que la croûte.
  const angleCritique = (V1, V2) => (V1 > 0 && V2 > V1 ? Math.asin(V1 / V2) : null);

  // Distance critique : plus petite distance où l'onde conique Pn existe, (H − h)·tan iᶜ à la descente depuis le
  // foyer plus H·tan iᶜ à la remontée. null sans angle critique ou si le foyer n'est pas dans la croûte.
  function distanceCritique(V1, V2, H, h = 0) {
    const ic = angleCritique(V1, V2);
    return ic === null || !(H > h) || h < 0 ? null : (2 * H - h) * Math.tan(ic);
  }

  // Rai direct Pg : droite du foyer à la station (Δ, 0) ; temps √(Δ² + h²)/V₁.
  const raiPg = (V1, h, d) => ({ pts: [[0, h], [d, 0]], t: Math.hypot(d, h) / V1 });

  // Rai réfracté Pn : descente sous iᶜ jusqu'au Moho, trajet le long du Moho à V₂, remontée sous iᶜ. Points [x, z] et
  // temps sommé segment par segment ; null avant la distance critique.
  function raiPn(V1, V2, H, h, d) {
    const xcr = distanceCritique(V1, V2, H, h);
    if (xcr === null || d < xcr) return null;
    const ic = Math.asin(V1 / V2), x1 = (H - h) * Math.tan(ic), x2 = d - H * Math.tan(ic);
    return { pts: [[0, h], [x1, H], [x2, H], [d, 0]], t: (H - h) / (V1 * Math.cos(ic)) + (x2 - x1) / V2 + H / (V1 * Math.cos(ic)) };
  }

  // Coupe d'un modèle (V₁, V₂, H, foyer à h) vue par des stations aux distances données : angle critique, temps
  // d'intercept, distances critique et de croisement, rais Pg et Pn de chaque station et phase arrivée la première.
  // Un modèle sans angle critique ou dont le Moho passe au-dessus du foyer n'a que des rais Pg.
  function coupe(V1, V2, H, h, distances) {
    const xcr = distanceCritique(V1, V2, H, h), ok = xcr !== null, ic = ok ? Math.asin(V1 / V2) : null;
    const ti = ok ? intercept(V1, V2, H, h) : null;
    return {
      V1, V2, H, h, ic, ti, xcr, xc: ok ? croisement(V1, V2, ti, h) : null,
      stations: distances.map(d => {
        const pg = raiPg(V1, h, d), pn = ok ? raiPn(V1, V2, H, h, d) : null;
        return { d, pg, pn, premiere: pn && pn.t < pg.t ? 'Pn' : 'Pg' };
      }),
    };
  }

  // Phase lue la première à la distance Δ sur deux droites (Pg, Pn) : la plus précoce des deux. null tant qu'il
  // manque une droite ou que la droite Pn n'est pas plus rapide que la droite Pg (pas de croisement).
  function premiereLue(dg, dn, d) {
    if (!dg || !dn || !(dn.V > dg.V)) return null;
    return dn.ti + d / dn.V < dg.ti + d / dg.V ? 'Pn' : 'Pg';
  }

  return { droite, epaisseur, intercept, croisement, intersection, angleCritique, distanceCritique, raiPg, raiPn, coupe, premiereLue };
})();
export default Refraction;
