// src/sismo/reel.js — mesures sur un séisme réel (banc « réseau », mode « Séisme réel ») : magnitude locale ML aux
// stations (Wood-Anderson simulé sur les deux horizontales, amplitude maximale en nm, loi de l'IASPEI du cours :
// Sismo.ML, comme au banc « station »), ML du réseau (moyenne des stations entre 10 et 600 km, domaine de la loi), et
// polarité de la première onde P lue sur la verticale (sens du premier écart qui sort du bruit, comme un analyste).
// Pointé automatique de la P (critère d'Akaike) pour les bancs « mécanisme » et « source ». Solveurs purs, sans accès au DOM.
import Sismo from './signal.js';

const Reel = (() => {
  'use strict';
  const RMIN = 10, RMAX = 600;

  // Amplitude maximale (nm) d'un déplacement Wood-Anderson (m) entre les indices i0 et i1, et son indice.
  function amplitude(w, i0, i1) {
    let a = 0, ia = -1;
    for (let i = Math.max(0, i0); i < Math.min(w.length, i1); i++) if (Math.abs(w[i]) > a) { a = Math.abs(w[i]); ia = i; }
    return { Anm: a * 1e9, i: ia };
  }
  // ML d'une station : wa = [Wood-Anderson N, Wood-Anderson E] (m), fenêtre [t0, t1] (s), R distance hypocentrale (km).
  function magnitudeStation(wa, dt, t0, t1, R) {
    const i0 = Math.floor(t0 / dt), i1 = Math.ceil(t1 / dt), r = { R, domaine: R >= RMIN && R <= RMAX };
    ['N', 'E'].forEach((c, k) => {
      const a = amplitude(wa[k], i0, i1);
      r[c] = { Anm: a.Anm, t: a.i * dt, ML: a.Anm > 0 ? Sismo.ML(a.Anm, R) : null };
    });
    const v = [r.N.ML, r.E.ML].filter(Number.isFinite);
    r.ML = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    return r;
  }
  // ML du réseau : moyenne des ML de station dans le domaine de la loi, avec l'écart type.
  function magnitudeReseau(stations) {
    const v = stations.filter(r => r && r.domaine && Number.isFinite(r.ML)).map(r => r.ML);
    if (!v.length) return null;
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return { ML: m, n: v.length, ecart: v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : null };
  }
  // Polarité de la première P sur la verticale (vers le haut) : sens du premier échantillon, après le pointé tP (s), qui
  // s'écarte du niveau au pointé de plus de k écarts types du bruit (mesuré sur les `bruit` s qui précèdent), dans la
  // seconde qui suit. 1 : compression (le sol monte), −1 : dilatation, 0 : illisible (rien ne sort du bruit).
  function polarite(z, dt, tP, { k = 3, bruit = 5, fenetre = 1 } = {}) {
    const i0 = Math.round(tP / dt), b0 = Math.max(0, i0 - Math.round(bruit / dt));
    if (i0 <= b0 + 2 || i0 >= z.length) return 0;
    let m = 0;
    for (let i = b0; i < i0; i++) m += z[i];
    m /= i0 - b0;
    let s2 = 0;
    for (let i = b0; i < i0; i++) s2 += (z[i] - m) ** 2;
    const sigma = Math.sqrt(s2 / (i0 - b0)), ref = z[i0];
    for (let i = i0 + 1; i < Math.min(z.length, i0 + Math.round(fenetre / dt)); i++) {
      const d = z[i] - ref;
      if (Math.abs(d) > k * sigma && sigma > 0) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  // Pointé automatique de la P autour d'une arrivée prévue tPrevu (s) : critère d'Akaike de Maeda (1985) sur la fenêtre
  // [tPrevu − avant ; tPrevu + apres], AIC(k) = k·ln var(x[0..k]) + (N − k − 1)·ln var(x[k+1..N−1]), minimum au début du
  // signal. Renvoie { t, rapport } (rapport : écart type de la seconde qui suit sur celui des `bruit` s qui précèdent) ou
  // null si la fenêtre sort de l'enregistrement.
  function pointerP(z, dt, tPrevu, { avant = 6, apres = 6, bruit = 3 } = {}) {
    const a = Math.max(0, Math.round((tPrevu - avant) / dt)), b = Math.min(z.length, Math.round((tPrevu + apres) / dt));
    const N = b - a;
    if (N < 20) return null;
    // sommes cumulées de x et x² pour les variances des deux côtés en O(N)
    const s1 = new Float64Array(N + 1), s2 = new Float64Array(N + 1);
    for (let i = 0; i < N; i++) { s1[i + 1] = s1[i] + z[a + i]; s2[i + 1] = s2[i] + z[a + i] ** 2; }
    const variance = (i, j) => { const n = j - i, m = (s1[j] - s1[i]) / n; return (s2[j] - s2[i]) / n - m * m; };
    let best = Infinity, kb = -1;
    for (let k = 5; k < N - 6; k++) {
      const v1 = variance(0, k + 1), v2 = variance(k + 1, N);
      if (!(v1 > 0) || !(v2 > 0)) continue;
      const aic = (k + 1) * Math.log(v1) + (N - k - 1) * Math.log(v2);
      if (aic < best) { best = aic; kb = k; }
    }
    if (kb < 0) return null;
    const i0 = a + kb, ecart = (i, j) => { i = Math.max(0, i); j = Math.min(z.length, j); if (j - i < 2) return 0; let m = 0; for (let q = i; q < j; q++) m += z[q]; m /= j - i; let s = 0; for (let q = i; q < j; q++) s += (z[q] - m) ** 2; return Math.sqrt(s / (j - i)); };
    const eb = ecart(i0 - Math.round(bruit / dt), i0), es = ecart(i0, i0 + Math.round(1 / dt));
    return { t: i0 * dt, rapport: eb > 0 ? es / eb : Infinity };
  }

  return { RMIN, RMAX, amplitude, magnitudeStation, magnitudeReseau, polarite, pointerP };
})();
export default Reel;
