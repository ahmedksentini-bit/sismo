// src/sismo/localisation.js — localisation d'un séisme réel (banc « réseau », mode « Séisme réel ») : stations en
// latitude et longitude, temps de trajet lus dans la table des premières arrivées P et S (data/temps-localisation.json,
// produite par tools/temps-localisation.mjs : croûte du cours jusqu'à 1°, ak135 au-delà de 2°), Terre sphérique. Même
// principe que la recherche sur grille du réseau simulé (Sismo.localiser) : P pondérée 1, S pondérée 0,5, t0 ajusté
// analytiquement, grille grossière puis affinée, profondeur de 0 à 40 km. Solveurs purs, sans accès au DOM.
const Localisation = (() => {
  'use strict';
  const RAD = Math.PI / 180, R = 6371;

  // Distance (°) et azimut (° depuis le nord) du point 1 vers le point 2.
  function distanceAzimut(lat1, lon1, lat2, lon2) {
    const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
    const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const d = (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / RAD;
    const az = ((Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD) + 360) % 360;
    return { distance: d, azimut: az };
  }
  const km = deg => deg * RAD * R;

  // Temps (s) d'une phase ('P' ou 'S') à la distance d (°) pour un foyer à h km : interpolation bilinéaire dans la
  // table ; null hors de la table ou dans une zone d'ombre.
  function temps(table, phase, h, d) {
    const hs = table.profondeurs, t = table[phase];
    if (!(d >= 0) || d > table.dmax || h < hs[0] || h > hs[hs.length - 1]) return null;
    let k = 0;
    while (k < hs.length - 2 && h > hs[k + 1]) k++;
    const wh = hs.length > 1 ? (h - hs[k]) / (hs[k + 1] - hs[k]) : 0, x = d / table.pas, i = Math.min(Math.floor(x), t[k].length - 2), wd = x - i;
    const v = (kk, ii) => t[kk][ii];
    const a = v(k, i), b = v(k, i + 1), c = v(k + 1, i), e = v(k + 1, i + 1);
    if (a === null || b === null || c === null || e === null) return null;
    return (1 - wh) * ((1 - wd) * a + wd * b) + wh * ((1 - wd) * c + wd * e);
  }
  // Distance (°) qui donne l'écart S − P observé, pour un foyer à h km (la table est croissante en S − P).
  function distanceSP(table, dSP, h = 10) {
    if (!(dSP > 0)) return null;
    let a = 0, b = table.dmax;
    const f = d => { const p = temps(table, 'P', h, d), s = temps(table, 'S', h, d); return p === null || s === null ? null : s - p; };
    while (b > 0 && f(b) === null) b -= table.pas;
    if (f(b) === null || dSP > f(b)) return null;
    for (let n = 0; n < 50; n++) { const m = (a + b) / 2; if (f(m) < dSP) a = m; else b = m; }
    return (a + b) / 2;
  }

  // Gap azimutal : plus grand secteur sans station vu depuis l'épicentre.
  function gap(lat, lon, stations) {
    const a = stations.map(s => distanceAzimut(lat, lon, s.lat, s.lon).azimut).sort((p, q) => p - q);
    let g = 360 - a[a.length - 1] + a[0];
    for (let i = 1; i < a.length; i++) g = Math.max(g, a[i] - a[i - 1]);
    return g;
  }

  // stations : [{ lat, lon }] ; lectures : [{ tP, tS }] dans une même échelle de temps (null si absent). Recherche sur
  // grille de (lat, lon, h) autour de la station de première P, ±25° puis ±1° puis ±0,06°. Renvoie l'épicentre, h, t0,
  // le résidu quadratique, les résidus par station, le gap azimutal et la zone compatible (résidu au plus seuil s de
  // plus que le minimum, à h optimal), ou null s'il manque des lectures (3 P et 4 lectures au moins).
  function localiser(stations, lectures, table, { seuil = 0.5 } = {}) {
    const obs = [];
    lectures.forEach((l, k) => {
      if (l.tP !== null && l.tP !== undefined) obs.push({ k, ph: 'P', t: l.tP, w: 1 });
      if (l.tS !== null && l.tS !== undefined) obs.push({ k, ph: 'S', t: l.tS, w: 0.5 });
    });
    const nP = new Set(obs.filter(o => o.ph === 'P').map(o => o.k)).size;
    if (obs.length < 4 || nP < 3) return null;
    const p = new Float64Array(obs.length), dist = new Float64Array(stations.length);
    const evaluer = (lat, lon, h) => {
      for (let k = 0; k < stations.length; k++) dist[k] = distanceAzimut(lat, lon, stations[k].lat, stations[k].lon).distance;
      let s0 = 0, W = 0;
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i], t = temps(table, o.ph, h, dist[o.k]);
        if (t === null) return null;
        p[i] = t; s0 += o.w * (o.t - t); W += o.w;
      }
      const t0 = s0 / W;
      let e = 0;
      for (let i = 0; i < obs.length; i++) { const r = obs[i].t - t0 - p[i]; e += obs[i].w * r * r; }
      return { t0, rms: Math.sqrt(e / W) };
    };
    let b = { rms: Infinity };
    const essayer = (lat, lon, h) => {
      if (lat > 89.9 || lat < -89.9) return;
      const r = evaluer(lat, lon, h);
      if (r && r.rms < b.rms) b = { lat, lon, h, t0: r.t0, rms: r.rms };
    };
    const premiere = obs.filter(o => o.ph === 'P').reduce((m, o) => (o.t < m.t ? o : m)), s0 = stations[premiere.k];
    const H = [0, 5, 10, 15, 20, 25, 30, 35, 40];
    const grille = (clat, clon, demi, pas, hs) => {
      const kx = Math.max(0.2, Math.cos(clat * RAD));
      for (let la = clat - demi; la <= clat + demi + 1e-9; la += pas)
        for (let lo = clon - demi / kx; lo <= clon + demi / kx + 1e-9; lo += pas / kx)
          for (const h of hs) essayer(la, lo, h);
    };
    grille(s0.lat, s0.lon, 25, 0.5, H);
    if (!Number.isFinite(b.rms)) return null;
    let c = { ...b };
    grille(c.lat, c.lon, 1, 0.05, H);
    c = { ...b };
    grille(c.lat, c.lon, 0.06, 0.01, [c.h - 2, c.h - 1, c.h, c.h + 1, c.h + 2].filter(h => h >= 0 && h <= 40));
    // zone compatible, à h optimal
    const zone = [], kx = Math.max(0.2, Math.cos(b.lat * RAD));
    for (let la = b.lat - 1.5; la <= b.lat + 1.5 + 1e-9; la += 0.05)
      for (let lo = b.lon - 1.5 / kx; lo <= b.lon + 1.5 / kx + 1e-9; lo += 0.05 / kx) {
        const r = evaluer(la, lo, b.h);
        if (r && r.rms <= b.rms + seuil) zone.push([la, lo]);
      }
    const residus = lectures.map((l, k) => {
      const d = distanceAzimut(b.lat, b.lon, stations[k].lat, stations[k].lon).distance, tp = temps(table, 'P', b.h, d), ts = temps(table, 'S', b.h, d);
      return {
        distance: d,
        dP: l.tP !== null && l.tP !== undefined && tp !== null ? l.tP - b.t0 - tp : null,
        dS: l.tS !== null && l.tS !== undefined && ts !== null ? l.tS - b.t0 - ts : null,
      };
    });
    return { ...b, zone, residus, gap: gap(b.lat, b.lon, stations), nObs: obs.length };
  }

  return { distanceAzimut, km, temps, distanceSP, gap, localiser };
})();
export default Localisation;
