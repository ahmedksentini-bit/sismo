import Sismo from './signal.js';

// src/sismo/source.js — paramètres de la source par le spectre des ondes S : fenêtre S des deux horizontales,
// spectre de déplacement corrigé du trajet (expansion géométrique, Q(f)), de κ et de l'amplification du site
// (modèle du générateur), lissé en bandes de 1/6 d'octave, puis modèle de Brune Ω(f) = Ω0 / (1 + (f/fc)²)
// ajusté en échelle log. M0 = Ω0 / C avec C = Rθφ·F / (4πρβ³) comme le générateur (Rθφ = 0,63, F = 2) ;
// Mw = (log10 M0 − 9,05) / 1,5 ; Δσ de la relation de Brune utilisée par le générateur :
// fc = 4,906·10⁶·β·(Δσ/M0)^(1/3) (β en km/s, Δσ en bar, M0 en dyn·cm). La vérité est celle du générateur.
// Solveurs purs.
const Source = (() => {
  'use strict';
  const MOD = Sismo.MODELE;
  const constante = (m = MOD) => (0.63 * 2) / (4 * Math.PI * m.rho * Math.pow(m.vs1 * 1000, 3) * 1000);
  const magnitude = M0 => (Math.log10(M0) - 9.05) / 1.5;
  // Chute de contrainte (MPa) depuis M0 (N·m) et fc (Hz), relation de Brune du générateur.
  const chuteContrainte = (M0, fc, m = MOD) => (M0 * 1e7 * Math.pow(fc / (4.906e6 * m.vs1), 3)) / 10;

  // Spectre d'amplitude (m/s, accélération) d'une fenêtre [i0, i0 + n) avec 5 % de cosinus aux bords.
  function spectreFenetre(x, dt, i0, n) {
    const N = Sismo.puissance2(n * 2), re = new Float64Array(N), im = new Float64Array(N), b = Math.max(1, Math.round(n * 0.05));
    for (let i = 0; i < n; i++) {
      const w = i < b ? 0.5 - 0.5 * Math.cos((Math.PI * i) / b) : i > n - b ? 0.5 - 0.5 * Math.cos((Math.PI * (n - i)) / b) : 1;
      re[i] = (x[i0 + i] || 0) * w;
    }
    Sismo.fft(re, im, false);
    return { N, df: 1 / (N * dt), amp: Array.from({ length: N / 2 }, (_, k) => Math.hypot(re[k], im[k]) * dt) };
  }
  // Spectre de déplacement à la source (lissé en bandes de 1/6 d'octave) des deux horizontales : moyenne
  // quadratique des composantes, divisée par l'effet du trajet et du site, et par (2πf)².
  function spectreSource(accN, accE, dt, i0, n, { R, Mw = 5, fmin = 0.1, fmax = 15, m = MOD } = {}) {
    const sN = spectreFenetre(accN, dt, i0, n), sE = spectreFenetre(accE, dt, i0, n), g = Sismo.etalement(Sismo.Reff(R, Mw));
    const brut = [], corrige = [];
    for (let k = 1; k < sN.N / 2; k++) {
      const f = k * sN.df;
      if (f < fmin || f > fmax) continue;
      const a = Math.sqrt((sN.amp[k] ** 2 + sE.amp[k] ** 2) / 2), w2 = (2 * Math.PI * f) ** 2;
      const trajet = g * Math.exp((-Math.PI * f * R) / (Sismo.Q(f, m) * m.vs1)) * Math.exp(-Math.PI * m.kappa * f) * (m.site ? Sismo.ampSite(f) : 1);
      brut.push([f, a / w2]); corrige.push([f, a / w2 / trajet]);
    }
    const lisser = pts => {
      const out = [], r = Math.pow(2, 1 / 6);
      for (let f = fmin; f < fmax; f *= r) {
        const s = pts.filter(p => p[0] >= f && p[0] < f * r);
        if (s.length) out.push([f * Math.sqrt(r), Math.exp(s.reduce((x, p) => x + Math.log(p[1]), 0) / s.length)]);
      }
      return out;
    };
    return { brut: lisser(brut), corrige: lisser(corrige) };
  }
  // Ajustement de Brune en log : pour chaque fc (grille fine en log), ln Ω0 optimal en moyenne ; minimum des
  // écarts quadratiques.
  function ajusterBrune(bandes, { fcMin = 0.05, fcMax = 20, pas = 0.005 } = {}) {
    let best = { ecart: Infinity };
    for (let lf = Math.log(fcMin); lf <= Math.log(fcMax); lf += pas) {
      const fc = Math.exp(lf), lo = bandes.reduce((s, [f, d]) => s + Math.log(d) + Math.log(1 + (f / fc) ** 2), 0) / bandes.length;
      const e = bandes.reduce((s, [f, d]) => s + (Math.log(d) - lo + Math.log(1 + (f / fc) ** 2)) ** 2, 0) / bandes.length;
      if (e < best.ecart) best = { ecart: e, fc, omega0: Math.exp(lo) };
    }
    return { ...best, rms: Math.sqrt(best.ecart) };
  }
  // Écart (rms en ln) d'un modèle de Brune donné aux bandes.
  const ecartBrune = (bandes, omega0, fc) => Math.sqrt(bandes.reduce((s, [f, d]) => s + (Math.log(d) - Math.log(omega0 / (1 + (f / fc) ** 2))) ** 2, 0) / bandes.length);

  // Analyse d'un enregistrement du générateur (ev de Sismo.generer) : fenêtre S de 0,5 s avant Sg à
  // max(5 s, 1/fc + 0,05·R), avec fc estimée ; la correction de saturation (Reff) dépend de Mw : on itère.
  function analyser(ev, { fmin = 0.1, fmax = 15, m = MOD } = {}) {
    const R = ev.tt.R, i0 = Math.max(0, Math.round((ev.tt.tSg - 0.5 - ev.t0) / ev.dt));
    let Mw = 5, fc = 1, res = null;
    for (let it = 0; it < 4; it++) {
      const duree = Math.max(5, 1 / fc + 0.05 * R), n = Math.min(ev.n - i0, Math.round(duree / ev.dt));
      const sp = spectreSource(ev.acc.N, ev.acc.E, ev.dt, i0, n, { R, Mw, fmin, fmax, m }), fit = ajusterBrune(sp.corrige);
      const M0 = fit.omega0 / constante(m);
      res = { R, i0, n, ...sp, ...fit, M0, Mw: magnitude(M0), dsigma: chuteContrainte(M0, fit.fc, m) };
      Mw = res.Mw; fc = fit.fc;
    }
    return res;
  }

  return { constante, magnitude, chuteContrainte, spectreFenetre, spectreSource, ajusterBrune, ecartBrune, analyser };
})();
export default Source;
