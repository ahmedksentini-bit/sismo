import Sismo from './signal.js';
import Spectre from './spectre.js';
import Gmpe from './gmpe.js';
import CalageAccelerogrammes from './coefficients/accelerogrammes.js';

// src/sismo/accelerogramme.js — accélérogrammes synthétiques pour la sélection et le calage.
// Méthode stochastique de Boore (2003), fenêtre des ondes S seule : bruit blanc fenêtré (Saragoni-Hart)
// mis au spectre de Fourier d'une source à deux coins (Atkinson et Silva 2000), avec le trajet et le site
// du générateur de sismogrammes (signal.js : expansion géométrique, Q(f), κ, amplification « rocher »).
// Une correction spectrale fixe c(f) cale la moyenne des spectres de réponse sur celle des trois lois
// d'atténuation (principe de la méthode hybride empirique, Campbell 2003) ; elle est produite par
// tools/calage-accelerogrammes.mjs. Chaque enregistrement tire de sa graine son coin fa, son κ et un
// terme d'événement : c'est la dispersion d'un enregistrement à l'autre. Solveurs purs.
const Accelero = (() => {
  'use strict';
  const MOD = Sismo.MODELE, DT = 0.01, PROFONDEUR = 10, AVANT = 1;
  // Variabilité d'un enregistrement à l'autre (écarts types en ln) et κ médian.
  const VARIABILITE = { fa: 0.3, kappa: 0.3, terme: 0.3 };
  const KAPPA = 0.04;

  // Source à deux coins d'Atkinson et Silva (2000) : fa, fb (Hz) et poids ε du second coin.
  function source(M) {
    return { M0: Math.pow(10, 1.5 * M + 9.05), fa: Math.pow(10, 2.181 - 0.496 * M), fb: Math.pow(10, 2.41 - 0.408 * M), eps: Math.pow(10, 0.605 - 0.255 * M) };
  }
  // Correction c(f) interpolée en log-log, constante au-delà des fréquences tabulées.
  function correction(f, table = CalageAccelerogrammes.correction) {
    if (f <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      const [f1, c1] = table[i - 1], [f2, c2] = table[i];
      if (f <= f2) return Math.exp(Math.log(c1) + (Math.log(c2 / c1) * Math.log(f / f1)) / Math.log(f2 / f1));
    }
    return table[table.length - 1][1];
  }
  // Paramètres propres à un enregistrement, tirés de sa graine (avant le bruit).
  function tirage(u) {
    const g = () => u.gauss();
    return { kfa: Math.exp(VARIABILITE.fa * g()), kappa: KAPPA * Math.exp(VARIABILITE.kappa * g()), terme: Math.exp(VARIABILITE.terme * g()) };
  }
  // Spectre de Fourier d'accélération (m/s) d'une composante horizontale ; R : distance Joyner-Boore (km),
  // foyer à 10 km de profondeur comme les zones du modèle d'aléa.
  function spectreFourier(M, R, { kfa = 1, kappa = KAPPA, terme = 1, table } = {}) {
    const s = source(M), fa = s.fa * kfa, Rh = Math.hypot(R, PROFONDEUR), beta = MOD.vs1;
    // Rθφ = 0,55, surface libre 2, partition horizontale 1/√2 ; ρ (kg/m³), β (m/s), R en km → m.
    const C = (0.55 * 2 * Math.SQRT1_2) / (4 * Math.PI * MOD.rho * Math.pow(beta * 1000, 3) * 1000);
    const g = Sismo.etalement(Sismo.Reff(Rh, M));
    const A = f => {
      const w = 2 * Math.PI * f, S = (1 - s.eps) / (1 + (f / fa) ** 2) + s.eps / (1 + (f / s.fb) ** 2);
      return terme * C * s.M0 * w * w * S * g * Math.exp((-Math.PI * f * Rh) / (Sismo.Q(f) * beta)) * Math.exp(-Math.PI * kappa * f) * Sismo.ampSite(f) * correction(f, table);
    };
    // Durée : source 1/fa, trajet 0,05·R (Boore 2003).
    return { A, duree: 1 / fa + 0.05 * Rh, Rh };
  }
  // Un accélérogramme (m/s²) : { acc, dt, M, R, graine, kfa, kappa, terme, duree }.
  function simuler({ M, R, graine, table }) {
    const u = Sismo.aleatoire(graine), p = tirage(u), fs = spectreFourier(M, R, { ...p, table });
    const i0 = Math.round(AVANT / DT), n = i0 + Math.ceil((2 * fs.duree + 8) / DT), N = Sismo.puissance2(Math.ceil(n * 1.25));
    const x = Sismo.stochastique(N, DT, u, i0, Sismo.saragoniHart(fs.duree), fs.A);
    return { acc: x.slice(0, n), dt: DT, M, R, graine, ...p, duree: fs.duree };
  }

  // Spectre de réponse (g, ξ = 5 %) aux périodes T (s) et PGA (g).
  function spectre(rec, T) {
    const r = Spectre.reponse(rec.acc, rec.dt, T, 0.05);
    let pga = 0;
    for (let i = 0; i < rec.acc.length; i++) pga = Math.max(pga, Math.abs(rec.acc[i]));
    return { Sa: Array.from(r.Sa, v => v / Spectre.G), pga: pga / Spectre.G };
  }
  // Médiane (ln, g) des trois lois d'atténuation à poids égaux, au rocher (Vs30 = 800 m/s), décrochement.
  const LOIS = ['akkar2014', 'bindi2014', 'boore2014'];
  function medianeLois(M, R, imt, vs30 = 800) {
    return LOIS.reduce((s, id) => s + Gmpe.LOIS[id].calculer({ M, Rjb: R, vs30, rake: 0 }, imt).ln, 0) / LOIS.length;
  }

  return { DT, PROFONDEUR, VARIABILITE, KAPPA, source, correction, spectreFourier, simuler, spectre, medianeLois };
})();
export default Accelero;
