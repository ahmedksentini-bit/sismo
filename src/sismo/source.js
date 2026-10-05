import Sismo from './signal.js';

// src/sismo/source.js — paramètres de la source par le spectre des ondes S : fenêtre S des deux horizontales,
// spectre de déplacement corrigé du trajet (expansion géométrique, Q(f)), de κ et de l'amplification du site
// (modèle du générateur), lissé en bandes de 1/6 d'octave, puis modèle de Brune Ω(f) = Ω0 / (1 + (f/fc)²)
// ajusté en échelle log. M0 = Ω0 / C avec C = Rθφ·F / (4πρβ³) comme le générateur (Rθφ = 0,63, F = 2) ;
// Mw = (log10 M0 − 9,05) / 1,5 ; Δσ de la relation de Brune utilisée par le générateur :
// fc = 4,906·10⁶·β·(Δσ/M0)^(1/3) (β en km/s, Δσ en bar, M0 en dyn·cm). La vérité est celle du générateur.
// Séisme réel (banc « source », mode « Séisme réel ») : vitesses dérivées en accélérations, fenêtre de bruit de même durée avant la P,
// ajustement sur les seules bandes où le signal dépasse trois fois le bruit. Solveurs purs.
const Source = (() => {
  'use strict';
  const MOD = Sismo.MODELE;
  const constante = (m = MOD) => (0.63 * 2) / (4 * Math.PI * m.rho * Math.pow(m.vs1 * 1000, 3) * 1000);
  const magnitude = M0 => (Math.log10(M0) - 9.05) / 1.5;
  // Chute de contrainte (MPa) depuis M0 (N·m) et fc (Hz), relation de Brune du générateur.
  const chuteContrainte = (M0, fc, m = MOD) => (M0 * 1e7 * Math.pow(fc / (4.906e6 * m.vs1), 3)) / 10;

  // Spectre d'amplitude d'une fenêtre [i0, i0 + n) avec 5 % de cosinus aux bords, sur N points (zéros au-delà).
  function spectreFenetre(x, dt, i0, n, N = Sismo.puissance2(n * 2)) {
    const re = new Float64Array(N), im = new Float64Array(N), b = Math.max(1, Math.round(n * 0.05));
    for (let i = 0; i < n; i++) {
      const w = i < b ? 0.5 - 0.5 * Math.cos((Math.PI * i) / b) : i > n - b ? 0.5 - 0.5 * Math.cos((Math.PI * (n - i)) / b) : 1;
      re[i] = (x[i0 + i] || 0) * w;
    }
    Sismo.fft(re, im, false);
    return { N, df: 1 / (N * dt), amp: Array.from({ length: N / 2 }, (_, k) => Math.hypot(re[k], im[k]) * dt) };
  }
  // Spectre de déplacement à la source (lissé en bandes de 1/6 d'octave) des deux horizontales (accélérations) :
  // moyenne quadratique des composantes, divisée par l'effet du trajet et du site, et par (2πf)². bruit = { i0, n } :
  // spectre d'une fenêtre de bruit sur la même grille de fréquences, ramené à la durée du signal (×√(n/nb)), et rapport
  // signal sur bruit de chaque bande (spectres bruts).
  function spectreSource(accN, accE, dt, i0, n, { R, Mw = 5, fmin = 0.1, fmax = 15, m = MOD, bruit = null } = {}) {
    const sN = spectreFenetre(accN, dt, i0, n), sE = spectreFenetre(accE, dt, i0, n), g = Sismo.etalement(Sismo.Reff(R, Mw));
    const bN = bruit ? spectreFenetre(accN, dt, bruit.i0, bruit.n, sN.N) : null, bE = bruit ? spectreFenetre(accE, dt, bruit.i0, bruit.n, sN.N) : null;
    const kb = bruit ? Math.sqrt(n / bruit.n) : 0;
    const brut = [], corrige = [], bb = [];
    for (let k = 1; k < sN.N / 2; k++) {
      const f = k * sN.df;
      if (f < fmin || f > fmax) continue;
      const a = Math.sqrt((sN.amp[k] ** 2 + sE.amp[k] ** 2) / 2), w = (2 * Math.PI * f) ** 2;
      const trajet = g * Math.exp((-Math.PI * f * R) / (Sismo.Q(f, m) * m.vs1)) * Math.exp(-Math.PI * m.kappa * f) * (m.site ? Sismo.ampSite(f) : 1);
      brut.push([f, a / w]); corrige.push([f, a / w / trajet]);
      if (bruit) bb.push([f, (kb * Math.sqrt((bN.amp[k] ** 2 + bE.amp[k] ** 2) / 2)) / w]);
    }
    const lisser = pts => {
      const out = [], r = Math.pow(2, 1 / 6);
      for (let f = fmin; f < fmax; f *= r) {
        const s = pts.filter(q => q[0] >= f && q[0] < f * r);
        if (s.length) out.push([f * Math.sqrt(r), Math.exp(s.reduce((x, q) => x + Math.log(q[1]), 0) / s.length)]);
      }
      return out;
    };
    const res = { brut: lisser(brut), corrige: lisser(corrige) };
    if (bruit) { res.bruit = lisser(bb); res.snr = res.brut.map(([, d], j) => d / res.bruit[j][1]); }
    return res;
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

  // Accélération depuis une vitesse mesurée (m/s) : dérivée spectrale i·2πf sur la série entière (valeur moyenne retirée,
  // zéros jusqu'à une puissance de 2), avant toute fenêtre, comme l'accélération du générateur.
  function accelerationDepuisVitesse(v, dt) {
    const n = v.length, x = new Float64Array(Sismo.puissance2(Math.ceil(n * 1.25)));
    let m = 0;
    for (let i = 0; i < n; i++) m += v[i];
    m /= n || 1;
    for (let i = 0; i < n; i++) x[i] = v[i] - m;
    return Sismo.versTemps(Sismo.versSpectre(x), f => [0, 2 * Math.PI * f], dt).subarray(0, n);
  }
  // Analyse des deux horizontales (accélérations, ou vitesses avec entree = 'vitesse') : fenêtre S de iS à
  // max(5 s, 1/fc + 0,05·R) (fc estimée), la correction de saturation (Reff) dépend de Mw : on itère. iP (indice de
  // la P, facultatif) : fenêtre de bruit de même durée finissant 1 s avant la P (ce qu'il en reste avant le début de
  // l'enregistrement, 2 s au moins), et ajustement sur les bandes où le signal dépasse snr fois le bruit (6 bandes au
  // moins, sinon fit null).
  function analyserSerie(xN, xE, dt, { R, iS, iP = null, entree = 'acceleration', fmin = 0.1, fmax = 15, m = MOD, snr = 3 }) {
    if (entree === 'vitesse') { xN = accelerationDepuisVitesse(xN, dt); xE = accelerationDepuisVitesse(xE, dt); }
    const i0 = Math.max(0, iS), nTot = Math.min(xN.length, xE.length);
    let Mw = 5, fc = 1, res = null;
    for (let it = 0; it < 4; it++) {
      const duree = Math.max(5, 1 / fc + 0.05 * R), n = Math.min(nTot - i0, Math.round(duree / dt));
      let bruit = null;
      if (iP !== null) {
        const fin = iP - Math.round(1 / dt), debut = Math.max(0, fin - n);
        if (fin - debut >= Math.round(2 / dt)) bruit = { i0: debut, n: fin - debut };
      }
      const sp = spectreSource(xN, xE, dt, i0, n, { R, Mw, fmin, fmax, m, bruit });
      const retenues = sp.snr ? sp.snr.map(x => x >= snr) : sp.corrige.map(() => true), bandes = sp.corrige.filter((_, j) => retenues[j]);
      if (bandes.length < 6) { res = { R, i0, n, bruitFenetre: bruit, ...sp, retenues, fit: null, omega0: null, fc: null, M0: null, Mw: null, dsigma: null }; break; }
      const fit = ajusterBrune(bandes), M0 = fit.omega0 / constante(m);
      res = { R, i0, n, bruitFenetre: bruit, ...sp, retenues, fit, ...fit, M0, Mw: magnitude(M0), dsigma: chuteContrainte(M0, fit.fc, m) };
      Mw = res.Mw; fc = fit.fc;
    }
    return res;
  }
  // Analyse d'un enregistrement du générateur (ev de Sismo.generer) : accélérations vraies, fenêtre S dès 0,5 s avant Sg.
  function analyser(ev, { fmin = 0.1, fmax = 15, m = MOD } = {}) {
    const { fit, retenues, bruitFenetre, ...res } = analyserSerie(ev.acc.N, ev.acc.E, ev.dt, { R: ev.tt.R, iS: Math.round((ev.tt.tSg - 0.5 - ev.t0) / ev.dt), fmin, fmax, m });
    return res;
  }

  return { constante, magnitude, chuteContrainte, spectreFenetre, spectreSource, ajusterBrune, ecartBrune, accelerationDepuisVitesse, analyserSerie, analyser };
})();
export default Source;
