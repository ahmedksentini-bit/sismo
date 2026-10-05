import Globe from './globe.js';
import Teleseisme from './teleseisme.js';
import Localisation from './localisation.js';

// src/sismo/direct.js — traitements de la page « En direct » (stations en temps réel) : distance et azimut sur la
// sphère, filtre de Butterworth passe-bande causal en sections du second ordre (comme scipy.signal.butter et sosfilt),
// détecteur STA/LTA et déclenchements (comme ObsPy, classic_sta_lta et trigger_onset), tampon d'une voie qui assemble
// les enregistrements miniSEED reçus (trous, recouvrements), arrivées prévues d'un séisme à une station (ak135),
// stations et fenêtre des sismogrammes d'un séisme passé, pays d'une station, fronts d'onde dessinés sur la carte.
// Vérifié contre scipy et ObsPy (tests/references/direct.json, tools/obspy/direct.py). Solveurs purs.
const Direct = (() => {
  'use strict';
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;

  // ── Géodésie sphérique ──────────────────────────────────────────────────────────────────────────────────────
  // Distance (degrés) et azimut (degrés, depuis le nord) du point 1 vers le point 2, sur une Terre sphérique.
  function distanceAzimut(lat1, lon1, lat2, lon2) {
    const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
    const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const d = 2 * Math.asin(Math.min(1, Math.sqrt(a))) * DEG;
    const az = (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * DEG + 360) % 360;
    return { distance: d, azimut: az, km: d * RAD * Globe.R };
  }

  // ── Filtre de Butterworth passe-bande (sections du second ordre) ─────────────────────────────────────────────
  // Prototype analogique d'ordre n, transformation passe-bas → passe-bande aux pulsations prédéformées, transformation
  // bilinéaire, puis sections (b0, b1, b2, a0 = 1, a1, a2) : chaque section porte un zéro en +1 et un en −1, et une
  // paire de pôles conjugués ; le gain est porté par la première.
  const c = (re, im = 0) => ({ re, im });
  const cmul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
  const cadd = (a, b) => c(a.re + b.re, a.im + b.im), csub = (a, b) => c(a.re - b.re, a.im - b.im);
  const csqrt = a => { const m = Math.hypot(a.re, a.im), r = Math.sqrt((m + a.re) / 2), i = Math.sqrt(Math.max(0, (m - a.re) / 2)); return c(r, a.im < 0 ? -i : i); };
  function butterPasseBande(ordre, fmin, fmax, fs) {
    const proto = Array.from({ length: ordre }, (_, k) => { const t = (Math.PI * (-ordre + 1 + 2 * k)) / (2 * ordre); return c(-Math.cos(t), -Math.sin(t)); });
    const w1 = 2 * fs * Math.tan((Math.PI * fmin) / fs), w2 = 2 * fs * Math.tan((Math.PI * fmax) / fs), bw = w2 - w1, w0 = Math.sqrt(w1 * w2);
    const pa = [];
    for (const p of proto) {
      const q = cmul(p, c(bw / 2)), r = csqrt(csub(cmul(q, q), c(w0 * w0)));
      pa.push(cadd(q, r), csub(q, r));
    }
    let k = c(bw ** ordre);
    const f2 = c(2 * fs), pd = pa.map(p => cdiv(cadd(f2, p), csub(f2, p)));
    // gain de la bilinéaire : ∏(2fs − z)/∏(2fs − p), les zéros analogiques étant tous en 0
    let num = c(1), den = c(1);
    for (let i = 0; i < ordre; i++) num = cmul(num, f2);
    for (const p of pa) den = cmul(den, csub(f2, p));
    k = cmul(k, cdiv(num, den));
    // une paire de pôles conjugués par section (partie imaginaire positive gardée) ; les pôles réels vont par deux
    const cplx = pd.filter(p => p.im > 1e-12), reels = pd.filter(p => Math.abs(p.im) <= 1e-12).map(p => p.re);
    const sos = cplx.map(p => [1, 0, -1, 1, -2 * p.re, p.re * p.re + p.im * p.im]);
    for (let i = 0; i + 1 < reels.length; i += 2) sos.push([1, 0, -1, 1, -(reels[i] + reels[i + 1]), reels[i] * reels[i + 1]]);
    sos[0] = sos[0].map((v, i) => (i < 3 ? v * k.re : v));
    return sos;
  }
  // Filtrage causal (forme directe II transposée), section par section ; un NaN (trou) remet l'état à zéro.
  function filtrer(x, sos) {
    const y = Float64Array.from(x);
    for (const [b0, b1, b2, , a1, a2] of sos) {
      let z1 = 0, z2 = 0;
      for (let i = 0; i < y.length; i++) {
        const v = y[i];
        if (Number.isNaN(v)) { z1 = 0; z2 = 0; continue; }
        const s = b0 * v + z1;
        z1 = b1 * v - a1 * s + z2;
        z2 = b2 * v - a2 * s;
        y[i] = s;
      }
    }
    return y;
  }

  // Préparation d'une trace brute avant filtrage : conversion (facteur k, coups → µm/s), moyenne retirée (décalage du
  // numériseur) et départ de chaque segment continu adouci en cosinus sur n échantillons ; sans cela, le filtre
  // « sonne » sur la marche du début (longtemps pour une bande étroite) et le détecteur y déclenche. NaN : trous.
  function preparer(x, k = 1, n = 0) {
    const y = Float64Array.from(x, v => v * k);
    let m = 0, nm = 0;
    for (const v of y) if (!Number.isNaN(v)) { m += v; nm++; }
    m = nm ? m / nm : 0;
    let depuis = 0;
    for (let i = 0; i < y.length; i++) {
      if (Number.isNaN(y[i])) { depuis = 0; continue; }
      y[i] -= m;
      if (depuis < n) y[i] *= 0.5 - 0.5 * Math.cos((Math.PI * depuis) / n);
      depuis++;
    }
    return y;
  }

  // ── Détection STA/LTA ─────────────────────────────────────────────────────────────────────────────────────────
  // Rapport classique (ObsPy, classic_sta_lta) : moyennes glissantes de x² sur nsta et nlta échantillons, nul avant
  // nlta − 1. Déclenchements (trigger_onset) : début quand le rapport dépasse `on`, fin quand il redescend sous `off`.
  function staLta(x, nsta, nlta) {
    const n = x.length, cum = new Float64Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) { s += x[i] * x[i]; cum[i] = s; }
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (i < nlta - 1) continue;
      const sta = (cum[i] - (i >= nsta ? cum[i - nsta] : 0)) / nsta, lta = (cum[i] - (i >= nlta ? cum[i - nlta] : 0)) / nlta;
      out[i] = sta / Math.max(lta, Number.MIN_VALUE);
    }
    return out;
  }
  // (bornes incluses : le dernier échantillon d'un déclenchement est le dernier au-dessus de `off`, comme ObsPy).
  function declenchements(r, on, off) {
    const out = [];
    let debut = null;
    for (let i = 0; i < r.length; i++) {
      if (debut === null && r[i] >= on) debut = i;
      else if (debut !== null && r[i] < off) { out.push([debut, i - 1]); debut = null; }
    }
    if (debut !== null) out.push([debut, r.length - 1]);
    return out;
  }

  // ── Tampon d'une voie ─────────────────────────────────────────────────────────────────────────────────────────
  // Segments continus { debut (ms), cadence, donnees } : un enregistrement qui prolonge le dernier segment à moins d'un
  // demi-échantillon près s'y ajoute ; un recouvrement (données déjà reçues, par SeedLink et FDSN) est retiré ; sinon
  // un nouveau segment commence (trou). On ne garde que les `garde` dernières millisecondes.
  function voie(garde = 70 * 60 * 1000) {
    let segs = [];
    const finDe = s => s.debut + (1000 * s.donnees.length) / s.cadence;
    return {
      ajouter(enr) {
        if (!enr || !enr.cadence || !enr.echantillons.length) return;
        let { debut } = enr, d = Array.from(enr.echantillons);
        const dt = 1000 / enr.cadence;
        // retrait de ce qui recouvre les segments existants
        for (const s of segs) {
          if (s.cadence !== enr.cadence) continue;
          const f = finDe(s);
          if (debut < f - dt / 2 && debut + d.length * dt > s.debut + dt / 2) {
            const coupe = Math.max(0, Math.round((f - debut) / dt));
            if (debut >= s.debut - dt / 2) { d = d.slice(coupe); debut += coupe * dt; }
          }
        }
        if (!d.length) return;
        const der = segs[segs.length - 1];
        if (der && der.cadence === enr.cadence && Math.abs(finDe(der) - debut) < dt / 2) der.donnees.push(...d);
        else { segs.push({ debut, cadence: enr.cadence, donnees: d }); segs.sort((a, b) => a.debut - b.debut); }
        const limite = Math.max(...segs.map(finDe)) - garde;
        segs = segs.filter(s => finDe(s) > limite).map(s => {
          if (s.debut >= limite) return s;
          const k = Math.ceil((limite - s.debut) / (1000 / s.cadence));
          return { debut: s.debut + (k * 1000) / s.cadence, cadence: s.cadence, donnees: s.donnees.slice(k) };
        });
      },
      // Échantillons de t0 à t1 (ms) à la cadence de la voie, NaN dans les trous.
      extraire(t0, t1) {
        const s0 = segs[segs.length - 1];
        if (!s0) return null;
        const fs = s0.cadence, dt = 1000 / fs, n = Math.max(0, Math.round((t1 - t0) / dt)), out = new Float64Array(n).fill(NaN);
        for (const s of segs) {
          if (s.cadence !== fs) continue;
          const i0 = Math.round((s.debut - t0) / dt);
          for (let j = Math.max(0, -i0); j < s.donnees.length && i0 + j < n; j++) out[i0 + j] = s.donnees[j];
        }
        return { t0, cadence: fs, donnees: out };
      },
      fin: () => (segs.length ? Math.max(...segs.map(finDe)) : null),
      segments: () => segs.map(s => ({ debut: s.debut, cadence: s.cadence, n: s.donnees.length })),
    };
  }

  // ── Arrivées prévues ──────────────────────────────────────────────────────────────────────────────────────────
  // Premières arrivées (s depuis l'origine) des phases ak135 utiles à une distance donnée, foyer à h km, et le début
  // des ondes de Rayleigh (vitesse de groupe à 20 s du générateur de téléséismes).
  const PHASES = ['P', 'pP', 'sP', 'PKIKP', 'PKP', 'PcP', 'S', 'SKS', 'ScS'];
  function arrivees(distance, h) {
    const out = [];
    for (const ph of PHASES) {
      const a = Globe.arrivees(ph, Math.max(0, h), distance);
      if (a.length) out.push({ phase: ph, temps: a[0].temps });
    }
    if (distance >= 2) out.push({ phase: 'LR', temps: (distance * RAD * Globe.R) / Teleseisme.groupe('LR', 20) });
    return out.sort((x, y) => x.temps - y.temps);
  }

  // ── Fronts d'onde sur la carte ──────────────────────────────────────────────────────────────────────────────
  // Temps (s depuis l'origine) des premières arrivées P et S d'un foyer à h km, de 0 à 180° : table de la localisation
  // (data/temps-localisation.json : croûte du cours jusqu'à 1°, ak135 au-delà, h ≤ 40 km, jusqu'à 100°) quand elle est
  // fournie, sinon ak135 (Globe) ; au-delà de 100°, PKIKP et SKS d'ak135 (la P diffractée n'est pas calculée : le front
  // franchit la zone d'ombre par interpolation) ; S = min(S, SKS). Temps rendus croissants (maximum cumulé), pour que
  // l'inversion du temps en distance ait un sens. { h, P: [[d, t]…], S: [[d, t]…] }.
  function tableFronts(h, table = null) {
    h = Math.max(0, h);
    const premier = (phs, d) => {
      let t = null;
      for (const ph of phs) { const a = Globe.arrivees(ph, h, d); if (a.length && (t === null || a[0].temps < t)) t = a[0].temps; }
      return t;
    };
    const min = (a, b) => (a === null ? b : b === null ? a : Math.min(a, b));
    const avecTable = !!table && h <= table.profondeurs[table.profondeurs.length - 1], ds = [], P = [], S = [];
    const lire = (ph, d) => (avecTable ? Localisation.temps(table, ph, h, d) : premier([ph], d));
    for (let d = avecTable ? 0 : 0.5; d <= 100 + 1e-9; d += d < 20 ? 0.5 : 2) {
      ds.push(d); P.push(lire('P', d)); S.push(min(lire('S', d), d >= 80 ? premier(['SKS'], d) : null));
    }
    for (let d = 102; d <= 180; d += 2) { ds.push(d); P.push(premier(['PKIKP'], d)); S.push(premier(['SKS'], d)); }
    const serie = T => {
      const pts = [];
      let m = 0;
      ds.forEach((d, i) => { if (T[i] !== null && Number.isFinite(T[i])) { m = Math.max(m, T[i]); pts.push([d, m]); } });
      return pts;
    };
    return { h, P: serie(P), S: serie(S) };
  }
  const vitesseLR = () => Teleseisme.groupe('LR', 20);
  // Distance (°) atteinte au temps t (s depuis l'origine) par le front d'une phase : 'P', 'S', ou 'LR' (ondes de
  // Rayleigh, vitesse de groupe à 20 s) ; null avant que le front n'atteigne la surface ou au-delà de 180°.
  function distanceFront(tf, phase, t) {
    if (phase === 'LR') { const d = (t * vitesseLR()) / (RAD * Globe.R); return d > 0 && d <= 180 ? d : null; }
    const pts = tf[phase];
    if (!pts.length || !(t >= pts[0][1]) || t > pts[pts.length - 1][1]) return null;
    for (let i = 1; i < pts.length; i++) {
      if (t > pts[i][1]) continue;
      const [d0, t0] = pts[i - 1], [d1, t1] = pts[i];
      return t1 > t0 ? d0 + ((t - t0) / (t1 - t0)) * (d1 - d0) : d0;
    }
    return pts[0][0];
  }
  // Temps (s) d'arrivée d'un front à la distance d (°), interpolé dans la même table ; null hors de la table.
  function tempsFront(tf, phase, d) {
    if (phase === 'LR') return (d * RAD * Globe.R) / vitesseLR();
    const pts = tf[phase];
    if (!pts.length || d < pts[0][0] || d > pts[pts.length - 1][0]) return null;
    for (let i = 1; i < pts.length; i++) if (d <= pts[i][0]) { const [d0, t0] = pts[i - 1], [d1, t1] = pts[i]; return t0 + ((d - d0) / (d1 - d0)) * (t1 - t0); }
    return pts[pts.length - 1][1];
  }

  // ── Sismogrammes d'un séisme passé (archives des centres) ──────────────────────────────────────────────────
  // Stations retenues pour un séisme : les trois plus proches, puis des stations réparties sur le reste des distances
  // (rangs régulièrement espacés), n au plus, rangées par distance : { s, distance (°), azimut (°) }.
  function stationsSeisme(stations, e, n = 10) {
    const tri = stations.map(s => ({ s, ...distanceAzimut(e.lat, e.lon, s.lat, s.lon) })).sort((a, b) => a.distance - b.distance);
    if (tri.length <= n) return tri.map(({ s, distance, azimut }) => ({ s, distance, azimut }));
    const proches = Math.min(3, n), reste = tri.slice(proches), k = n - proches, pris = tri.slice(0, proches);
    for (let i = 0; i < k; i++) pris.push(reste[Math.round(((i + 1) * (reste.length - 1)) / k)]);
    return [...new Set(pris)].sort((a, b) => a.distance - b.distance).map(({ s, distance, azimut }) => ({ s, distance, azimut }));
  }
  // Fenêtre de lecture (ms) : une minute avant l'origine, jusqu'à deux minutes après la dernière arrivée prévue (ondes
  // de surface au-delà de 2°, sinon S) à la station la plus lointaine ; 4 minutes au moins, moins de 2 h (limite du
  // relais FDSN).
  function fenetreSeisme(e, distances) {
    let dernier = 0;
    for (const d of distances) {
      // les réflexions sur le noyau (PcP, ScS) arrivent tard aux petites distances mais ne servent pas ici ; tout près du
      // foyer (pas de S directe dans les rais), l'onde S est bornée par une vitesse de 3,2 km/s
      const h = Number.isFinite(e.h) ? e.h : 10, a = arrivees(Math.max(0.05, d), h), z = a.find(x => x.phase === 'LR') || a.find(x => x.phase === 'S');
      dernier = Math.max(dernier, z ? z.temps : Math.hypot(d * RAD * Globe.R, h) / 3.2);
    }
    const debut = e.temps - 60000, fin = e.temps + Math.max(240, dernier + 120) * 1000;
    return { debut, fin: Math.min(fin, debut + 2 * 3600 * 1000 - 60000) };
  }

  // ── Pays d'une station ──────────────────────────────────────────────────────────────────────────────────────
  // Polygones { code, nom, anneaux: [[lon, lat, lon, lat…]…] } de data/pays-mediterranee.json (Natural Earth, règle
  // pair-impair, trous compris). Une station côtière peut tomber juste hors du polygone simplifié : à moins de `marge`
  // degrés du pays le plus proche, elle lui est rattachée. null : en mer, ou hors des polygones donnés.
  const boites = new WeakMap();
  function boite(p) {
    if (!boites.has(p)) {
      const b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const a of p.anneaux) for (let i = 0; i < a.length; i += 2) { b[0] = Math.min(b[0], a[i]); b[1] = Math.min(b[1], a[i + 1]); b[2] = Math.max(b[2], a[i]); b[3] = Math.max(b[3], a[i + 1]); }
      boites.set(p, b);
    }
    return boites.get(p);
  }
  function pays(lat, lon, liste, marge = 0.1) {
    const kx = Math.cos(lat * RAD);
    let proche = null, dmin = marge;
    for (const p of liste) {
      const b = boite(p);
      if (lon < b[0] - marge / kx || lon > b[2] + marge / kx || lat < b[1] - marge || lat > b[3] + marge) continue;
      let dedans = false;
      for (const a of p.anneaux) {
        for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
          const xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
          if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
          // distance au côté, longitudes ramenées en degrés de grand cercle
          const ux = (xj - xi) * kx, uy = yj - yi, vx = (lon - xi) * kx, vy = lat - yi, l2 = ux * ux + uy * uy;
          const t = l2 > 0 ? Math.max(0, Math.min(1, (vx * ux + vy * uy) / l2)) : 0, d = Math.hypot(vx - t * ux, vy - t * uy);
          if (d < dmin) { dmin = d; proche = p; }
        }
      }
      if (dedans) return { code: p.code, nom: p.nom };
    }
    return proche ? { code: proche.code, nom: proche.nom } : null;
  }

  // Latence (s) d'une voie : temps écoulé depuis son dernier échantillon.
  const latence = (fin, maintenant = Date.now()) => (fin === null ? Infinity : (maintenant - fin) / 1000);

  return { distanceAzimut, butterPasseBande, filtrer, preparer, staLta, declenchements, voie, arrivees, tableFronts, distanceFront, tempsFront, stationsSeisme, fenetreSeisme, pays, latence, PHASES };
})();
export default Direct;
