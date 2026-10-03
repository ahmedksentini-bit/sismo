// src/sismo/intensite.js — indicateurs d'un accélérogramme (m/s²) : PGA, PGV, intensité d'Arias, durée
// significative (Trifunac et Brady 1975 : temps entre 5 % et 95 % de l'intensité d'Arias), vitesse absolue
// cumulée (CAV) et courbe de Husid. Intégration par trapèzes, conventions d'eqsig (référence hors ligne,
// tests/references/intensite.json) : g = 9,81 m/s² dans Arias ; bornes de durée aux indices strictement
// compris entre les fractions. Solveurs purs.
const Intensite = (() => {
  'use strict';
  // Intégrale cumulée par trapèzes de f(a), première valeur nulle.
  function cumul(acc, dt, f = x => x) {
    const out = new Float64Array(acc.length);
    for (let i = 1; i < acc.length; i++) out[i] = out[i - 1] + (dt * (f(acc[i - 1]) + f(acc[i]))) / 2;
    return out;
  }
  const arias = (acc, dt) => cumul(acc, dt, x => x * x).map(v => (Math.PI / (2 * 9.81)) * v);
  // Durée significative entre les fractions a et b de l'intensité d'Arias.
  function duree(acc, dt, a = 0.05, b = 0.95, ia = arias(acc, dt)) {
    const fin = ia[ia.length - 1];
    let i0 = -1, i1 = -1;
    for (let i = 0; i < ia.length; i++) if (ia[i] > a * fin && ia[i] < b * fin) { if (i0 < 0) i0 = i; i1 = i; }
    return { debut: i0 * dt, fin: i1 * dt, duree: (i1 - i0) * dt };
  }
  function indicateurs(acc, dt) {
    const ia = arias(acc, dt), v = cumul(acc, dt), cav = cumul(acc, dt, Math.abs);
    let pga = 0, pgv = 0;
    for (let i = 0; i < acc.length; i++) { pga = Math.max(pga, Math.abs(acc[i])); pgv = Math.max(pgv, Math.abs(v[i])); }
    const d95 = duree(acc, dt, 0.05, 0.95, ia), d75 = duree(acc, dt, 0.05, 0.75, ia);
    return { pga, pgv, arias: ia[ia.length - 1], cav: cav[cav.length - 1], d595: d95.duree, d575: d75.duree, t5: d95.debut, t95: d95.fin, husid: ia.map(x => x / ia[ia.length - 1]) };
  }
  return { cumul, arias, duree, indicateurs };
})();
export default Intensite;
