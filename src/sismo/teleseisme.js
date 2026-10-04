import Sismo from './signal.js';
import Globe from './globe.js';
import Tables from './tables.js';
import Mecanisme from './mecanisme.js';

// src/sismo/teleseisme.js — sismogrammes d'un séisme lointain (téléséisme) vus par une station trois composantes.
// Phases de volume dans ak135 (Globe : temps, paramètre de rai, angles de départ et d'incidence), amplitudes de la
// théorie des rais : rayonnement d'un double couple tiré de la graine (Mecanisme), expansion géométrique tirée de
// dp/dΔ, atténuation t*, coefficients de réflexion et de transmission d'ordre de grandeur, surface libre. Source de
// Brune (Δσ = 10 MPa), impulsions causales, codas diffusées (Boore 2003). Ondes de surface dispersées : Rayleigh (Z et
// R, ellipse rétrograde) et Love (T), calées pour que Ms ≈ Mw avant la saturation. Lectures : distance par S − P
// (rais ak135), heure d'origine, profondeur par pP − P, Ms (IASPEI 2013). Solveurs purs, sans accès au DOM.
const Teleseisme = (() => {
  'use strict';
  const R = Globe.R, RAD = Math.PI / 180, DT = 0.05;
  const PHASES = ['P', 'pP', 'sP', 'PcP', 'PKIKP', 'PKiKP', 'PKP', 'S', 'ScS', 'SKS'];
  const PHASES_P = ['P', 'PKIKP', 'PKiKP', 'PKP'];
  // Δσ de Brune : 10 MPa (le modèle de Brune donne des chutes de contrainte plusieurs fois plus fortes que celui de
  // Madariaga pour un même spectre) ; avec 3 MPa, la P à 1 Hz était dix fois trop faible (mb ≈ 5 pour Mw 6,6).
  const DSIGMA = 100, BETA_SOURCE = 3.75; // bars et km/s
  // t* (s) : atténuation intégrée le long du rai (valeurs usuelles des téléséismes)
  // t* (s) à la fréquence de référence de l'onde (1 Hz pour P, 0,3 Hz pour S) : l'atténuation intégrée décroît avec la
  // fréquence ; l'opérateur causal (1 + i·f/f1)⁻⁴ vaut exp(−π·f·t*) à cette fréquence (voir `attenuation`).
  const TSTAR = { P: 0.55, pP: 0.55, sP: 1, PcP: 0.55, PKIKP: 0.9, PKiKP: 0.7, PKP: 0.75, S: 3, ScS: 3.5, SKS: 2.2 };
  const F_REF = { P: 1, S: 0.3 };
  // Atténuation causale : produit de quatre passe-bas du premier ordre de coupure f1, égal à exp(−π·fref·t*) à fref
  // (une seule paire de pôles amortissait trop la bande de 1 à 2 Hz).
  const attenuation = (tstar, fref) => fref / Math.sqrt(Math.exp((Math.PI * fref * tstar) / 2) - 1);
  // Coefficient de réflexion ou de transmission (ordre de grandeur, signe compris) appliqué au rayonnement de départ :
  // pP se réfléchit sous la surface en changeant de signe, sP s'y convertit de S en P, PcP et ScS se réfléchissent
  // sur le noyau, PKP, PKIKP et SKS le traversent, PKiKP se réfléchit sur la graine.
  const COEF = { P: 1, pP: -0.85, sP: 0.55, PcP: 0.2, PKIKP: 0.6, PKiKP: 0.15, PKP: 0.6, S: 1, ScS: 0.8, SKS: 0.45 };
  const DEPART_S = new Set(['S', 'ScS', 'SKS', 'sP']);
  const ARRIVEE_S = new Set(['S', 'ScS', 'SKS']);
  // Ondes de surface : vitesse de phase c(T) = c0 + a·ln T (km/s, dispersion normale), groupe U = c²/(c + a).
  const SURFACE = { LR: { c0: 3.0, a: 0.25 }, LQ: { c0: 3.3, a: 0.25 } };
  const CALAGE = { K: 2e-20, Q: 290, prof: 0.25 };
  const groupe = (onde, T) => { const { c0, a } = SURFACE[onde], c = c0 + a * Math.log(T); return (c * c) / (c + a); };
  // Bande de mesure de Ms : 18 à 22 s de période (Butterworth d'ordre 4, sans quoi les ondes de 30 s, plus fortes
  // aux grandes distances, passeraient et fausseraient la période lue).
  const FILTRE_MS = [1 / 22, 1 / 18, 4];

  // Masse volumique (g/cm³) et vitesses à la profondeur z (interpolation du modèle).
  function modeleA(z) {
    const M = Globe.modele;
    for (let i = 1; i < M.length; i++) {
      const [z1, p1, s1, r1] = M[i - 1], [z2, p2, s2, r2] = M[i];
      if (z <= z2 && z2 > z1) { const k = (z - z1) / (z2 - z1); return { vp: p1 + k * (p2 - p1), vs: s1 + k * (s2 - s1), rho: r1 + k * (r2 - r1) }; }
    }
    return { vp: M[0][1], vs: M[0][2], rho: M[0][3] };
  }

  // Expansion géométrique (1/km) d'une arrivée : g = (1/R)·√[(ρh·vh)/(ρ0·v0) · sin ih/(sin Δ·cos i0) · |dih/dΔ|],
  // dih/dΔ = vh/(rh·cos ih)·dp/dΔ, dp/dΔ par différences centrées sur la même branche. Bornée près des caustiques.
  function etalement(phase, h, distance, a) {
    const pVoisin = d => { const l = Globe.arrivees(phase, h, d); return l.length ? l.reduce((u, v) => (Math.abs(v.p - a.p) < Math.abs(u.p - a.p) ? v : u)).p : null; };
    const dd = 0.5, p1 = pVoisin(distance - dd), p2 = pVoisin(distance + dd);
    let dp;
    if (p1 !== null && p2 !== null) dp = (p2 - p1) / (2 * dd * RAD);
    else if (p1 !== null) dp = (a.p - p1) / (dd * RAD);
    else if (p2 !== null) dp = (p2 - a.p) / (dd * RAD);
    else return 0;
    const depS = DEPART_S.has(phase), arrS = ARRIVEE_S.has(phase), src = modeleA(h), sol = modeleA(0);
    const vh = depS ? src.vs : src.vp, v0 = arrS ? sol.vs : sol.vp, rh = R - h;
    const ih = (a.depart > 90 ? 180 - a.depart : a.depart) * RAD, i0 = a.incidence * RAD;
    const didD = (vh / (rh * Math.max(Math.cos(ih), 0.05))) * Math.abs(dp);
    const g = Math.sqrt(((src.rho * vh) / (sol.rho * v0)) * (Math.sin(ih) / (Math.sin(distance * RAD) * Math.cos(i0))) * didD) / R;
    return Math.min(g, 4e-4);
  }

  // Arrivées des phases de volume : temps, angles, polarités et amplitudes (déplacement, m·s) sur Z, R et T.
  function phases(p, mec) {
    const M = Mecanisme.tenseur(mec.azimut, mec.pendage, mec.glissement), { M0 } = Sismo.source(p.Mw, BETA_SOURCE, DSIGMA);
    const src = modeleA(p.h), out = [];
    for (const ph of PHASES) {
      for (const a of Globe.arrivees(ph, p.h, p.delta)) {
        const depS = DEPART_S.has(ph), vh = (depS ? src.vs : src.vp) * 1000, rho = src.rho * 1000;
        const g = etalement(ph, p.h, p.delta, a) / 1000; // 1/m
        const base = (M0 * g) / (4 * Math.PI * rho * vh ** 3), i0 = a.incidence * RAD;
        const c = { Z: 0, R: 0, T: 0 };
        if (!depS) {
          const F = Mecanisme.rayonnementP(M, a.depart, mec.az) * COEF[ph];
          c.Z = 1.9 * Math.cos(i0) * F; c.R = 1.9 * Math.sin(i0) * F;
        } else if (ph === 'sP') {
          const F = Mecanisme.rayonnementS(M, a.depart, mec.az).SV * COEF[ph];
          c.Z = 1.9 * Math.cos(i0) * F; c.R = 1.9 * Math.sin(i0) * F;
        } else {
          const s = Mecanisme.rayonnementS(M, a.depart, mec.az);
          // SV sur R (et un peu Z), SH sur T ; SKS n'a pas de composante SH (S convertie en P dans le noyau)
          c.R = 2 * Math.cos(i0) * s.SV * COEF[ph]; c.Z = -2 * Math.sin(i0) * s.SV * COEF[ph];
          c.T = ph === 'SKS' ? 0 : 2 * s.SH * (ph === 'ScS' ? 1 : COEF[ph]);
        }
        out.push({ phase: ph, temps: a.temps, p: a.p, depart: a.depart, incidence: a.incidence, onde: ARRIVEE_S.has(ph) ? 'S' : 'P', Z: base * c.Z, R: base * c.R, T: base * c.T, tstar: TSTAR[ph] });
      }
    }
    return out.sort((x, y) => x.temps - y.temps);
  }

  // Première P (P, ou une phase du noyau dans la zone d'ombre) et première S (S seule ; null au-delà de ~100°).
  function premieres(h, distance) {
    const tP = Math.min(...PHASES_P.map(ph => Tables.premiere(ph, h, distance)).filter(t => t !== null));
    return { tP, tS: Tables.premiere('S', h, distance) };
  }

  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };

  // ── Génération : p = { Mw, delta (°), h (km), baz (°), graine } ───────────────────────────────────────────
  function generer(p) {
    const u = Sismo.aleatoire(p.graine), dt = DT, x = p.delta * RAD * R;
    // mécanisme tiré de la graine ; az : azimut de la station vu du foyer
    const mec = { azimut: Math.floor(u() * 360), pendage: Math.round(u.entre(25, 85)), glissement: Math.round(u.entre(-180, 180)), az: u() * 360 };
    const ph = phases(p, mec), { tP, tS } = premieres(p.h, p.delta);
    const t0 = Math.floor(tP - 120), fin = Math.max(x / 3.1 + 300, (tS ?? tP) + 400);
    const n = Math.round((fin - t0) / dt), N = Sismo.puissance2(Math.ceil(n * 1.25));
    const idx = t => Math.round((t - t0) / dt), df = 1 / (N * dt);
    const { fc: fcS } = Sismo.source(p.Mw, BETA_SOURCE, DSIGMA), { M0 } = Sismo.source(p.Mw, BETA_SOURCE, DSIGMA);

    // 1) Impulsions directes, construites en fréquence (accélération), causales : Ω/((1 + if/fc)²(1 + if/fa)²)
    const spec = () => ({ re: new Float64Array(N), im: new Float64Array(N) });
    const dZ = spec(), dR = spec(), dT = spec();
    for (const a of ph) {
      const fc = a.onde === 'P' ? 1.5 * fcS : fcS, f1 = attenuation(a.tstar, F_REF[a.onde]), retard = a.temps - t0;
      for (let k = 1; k <= N / 2; k++) {
        const f = k * df, w = 2 * Math.PI * f;
        const q = cmul([1, f / f1], [1, f / f1]);
        let hh = cdiv([1, 0], cmul(cmul([1, f / fc], [1, f / fc]), cmul(q, q)));
        hh = cmul(hh, [Math.cos(-w * retard), Math.sin(-w * retard)]);
        const ar = -w * w * hh[0], ai = -w * w * hh[1];
        dZ.re[k] += a.Z * ar; dZ.im[k] += a.Z * ai;
        dR.re[k] += a.R * ar; dR.im[k] += a.R * ai;
        dT.re[k] += a.T * ar; dT.im[k] += a.T * ai;
      }
    }
    // 2) Ondes de surface (déplacement de Fourier, m·s), dans un spectre à part : on les coupe avant leur arrivée.
    const sZ = spec(), sR = spec(), sT = spec();
    if (p.delta >= 10) {
      const sinD = Math.max(Math.sin(p.delta * RAD), Math.sin(10 * RAD)), sgL = u() < 0.5 ? 1 : -1;
      const onde = (nom, K) => f => {
        const { c0, a } = SURFACE[nom], T = 1 / f, c = c0 + a * Math.log(T), U = (c * c) / (c + a);
        const bande = 1 / (1 + (0.008 / f) ** 4) / (1 + (f / 0.25) ** 4);
        const amp = (K * M0) / (1 + (f / fcS) ** 2) * Math.exp(-CALAGE.prof * 2 * Math.PI * f * p.h / c) * Math.exp(-Math.PI * f * x / (CALAGE.Q * U)) / Math.sqrt(sinD) * bande;
        const w = 2 * Math.PI * f, phi = -w * (x / c - t0) - Math.PI / 4;
        return [-w * w * amp * Math.cos(phi), -w * w * amp * Math.sin(phi)];
      };
      const ray = onde('LR', CALAGE.K), love = onde('LQ', CALAGE.K * 0.8);
      for (let k = 1; k <= N / 2; k++) {
        const f = k * df, [zr, zi] = ray(f), [lr, li] = love(f);
        sZ.re[k] = zr; sZ.im[k] = zi;
        sR.re[k] = 0.7 * zi; sR.im[k] = -0.7 * zr; // déphasage de 90° : ellipse rétrograde
        sT.re[k] = sgL * lr; sT.im[k] = sgL * li;
      }
    }
    const versTemps = d => {
      for (let k = 1; k < N / 2; k++) { d.re[N - k] = d.re[k]; d.im[N - k] = -d.im[k]; }
      d.im[0] = 0; d.im[N / 2] = 0; d.re[0] = 0;
      Sismo.fft(d.re, d.im, true);
      return d.re;
    };
    const [Z, Rr, T] = [dZ, dR, dT].map(versTemps);
    const iP = idx(tP);
    for (const s of [Z, Rr, T]) { for (let i = 0; i < Math.max(0, iP - 20); i++) s[i] = 0; Sismo.compenserDC(s, iP, Math.min(N, iP + Math.round(600 / dt))); }
    const iSurf = Math.max(0, idx(x / 4.7 - 30));
    [sZ, sR, sT].map(versTemps).forEach((s, c) => {
      for (let i = 0; i < iSurf; i++) s[i] = 0;
      for (let i = n; i < N; i++) s[i] = 0; // la part repliée au-delà de la fin de l'enregistrement
      Sismo.compenserDC(s, iSurf, n);
      const dest = [Z, Rr, T][c];
      for (let i = 0; i < N; i++) dest[i] += s[i];
    });

    // 3) Codas diffusées derrière la P et derrière la S (Boore 2003), incohérentes d'une composante à l'autre.
    const spectreAcc = (a, ech) => f => { const fc = a.onde === 'P' ? 1.5 * fcS : fcS, w = 2 * Math.PI * f; return ech * w * w * Math.hypot(a.Z, a.R, a.T) / (1 + (f / fc) ** 2) * Math.exp(-Math.PI * f * a.tstar); };
    const coda = (tArr, montee, tau, duree) => t => (t > duree ? -1 : Math.min(1, t / montee) * Math.exp(-t / tau));
    const premP = ph.find(a => a.onde === 'P'), premS = ph.find(a => a.phase === 'S') || ph.find(a => a.onde === 'S');
    const ajouter = (dest, src, k) => { for (let i = 0; i < N; i++) dest[i] += k * src[i]; };
    // L'énergie diffusée arrive après l'onde directe : la coda commence 2 s (P) ou 4 s (S) après elle, ce qui laisse lire
    // le premier mouvement.
    if (premP) {
      const A = spectreAcc(premP, 0.5), e = coda(premP.temps, 3, 25, 120);
      for (const [dest, k] of [[Z, 1], [Rr, 0.6], [T, 0.35]]) ajouter(dest, Sismo.stochastique(N, dt, u, idx(premP.temps + 2), e, A), k);
    }
    if (premS) {
      const A = spectreAcc(premS, 0.45), e = coda(premS.temps, 5, 60, 300);
      for (const [dest, k] of [[Z, 0.4], [Rr, 0.8], [T, 0.8]]) ajouter(dest, Sismo.stochastique(N, dt, u, idx(premS.temps + 4), e, A), k);
    }

    // 4) Vitesse par intégration sur les séries complètes, puis rotation R/T → N/E (baz : de la station vers la source).
    //    L'intégration par FFT rend une vitesse de moyenne nulle : on retranche son niveau avant la P (le sol y est au
    //    repos), ce qui redonne l'intégrale causale, nulle avant l'arrivée et de retour à zéro à la fin.
    const vit = [Z, Rr, T].map(s => {
      const v = Sismo.versTemps(Sismo.versSpectre(s), Sismo.integrer, dt), i1 = Math.max(1, iP - 40);
      let m = 0;
      for (let i = 0; i < i1; i++) m += v[i];
      m /= i1;
      for (let i = 0; i < N; i++) v[i] -= m;
      return v;
    });
    const phr = ((p.baz + 180) * Math.PI) / 180, cr = Math.cos(phr), sr = Math.sin(phr);
    const tourner = ([z, r, t]) => {
      const o = { Z: new Float64Array(n), N: new Float64Array(n), E: new Float64Array(n) };
      for (let i = 0; i < n; i++) { o.Z[i] = z[i]; o.N[i] = r[i] * cr - t[i] * sr; o.E[i] = r[i] * sr + t[i] * cr; }
      return o;
    };
    const pP = ph.find(a => a.phase === 'P');
    return {
      tele: true, dt, n, t0, p,
      tt: { tP, tS, x, phases: ph.map(a => ({ phase: a.phase, temps: a.temps })), tLQ: x / groupe('LQ', 20), tLR: x / groupe('LR', 20) },
      acc: tourner([Z, Rr, T]), vit: tourner(vit),
      verite: { mec, sP: premP && premP.Z >= 0 ? 1 : -1, polariteLisible: !!premP && Math.abs(premP.Z) >= 0.3 * Math.max(...ph.filter(a => a.onde === 'P').map(a => Math.abs(a.Z))), baz: p.baz, P: pP || null },
    };
  }

  // ── Lectures ─────────────────────────────────────────────────────────────────────────────────────────────────
  // Ms (IASPEI 2013) : A amplitude du déplacement vertical (nm) à la période T (18 à 22 s), 20° ≤ Δ ≤ 160°, h ≤ 60 km.
  const Ms = (Anm, T, distance) => Math.log10(Anm / T) + 1.66 * Math.log10(distance) + 0.3;
  // Amplitude et période d'une trace autour d'un pic (indice i) : demi-période entre les passages par zéro qui
  // l'encadrent.
  function periodeAutour(x, i, dt) {
    let a = i, b = i;
    while (a > 0 && Math.sign(x[a - 1]) === Math.sign(x[i])) a--;
    while (b < x.length - 1 && Math.sign(x[b + 1]) === Math.sign(x[i])) b++;
    // passages par zéro interpolés
    const za = a > 0 ? a - x[a] / (x[a] - x[a - 1]) : a, zb = b < x.length - 1 ? b + x[b] / (x[b] - x[b + 1]) : b;
    return 2 * (zb - za) * dt;
  }
  // Ms mesurée sur le déplacement vertical sans bruit (vérité terrain), dans la fenêtre des ondes de surface.
  function msVraie(ev) {
    const d = Sismo.convertir(ev.vit.Z, ev.dt, 'HH', 'deplacement', FILTRE_MS);
    const i0 = Math.max(0, Math.round((ev.tt.x / 4.7 - ev.t0) / ev.dt));
    let im = i0;
    for (let i = i0; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[im])) im = i;
    const A = Math.abs(d[im]) * 1e9, T = periodeAutour(d, im, ev.dt);
    return { A, T, t: im * ev.dt, Ms: Ms(A, T, ev.p.delta) };
  }
  // Distance (°) d'après S − P (s), foyer à h km ; heure d'origine d'après tP ; profondeur d'après pP − P.
  // Borne basse de la recherche : pour un foyer profond, la P directe n'existe pas aux courtes distances (TauP non plus).
  const distanceSP = (sp, h) => { const a = [10, 15, 20, 25, 30].find(d => Number.isFinite(Tables.spTele(h, d))) ?? 30; return Tables.distanceSP(sp, h, a, 95); };
  const origine = (tP, distance, h) => tP - premieres(h, distance).tP;
  // Lecture complète : Δ par S − P avec la profondeur lue (33 km si pP n'est pas pointée), h par pP − P, itérées.
  function lire({ tP, tS, tpP }) {
    if (!(tS > tP)) return null;
    let h = 33, distance = distanceSP(tS - tP, h), hLu = null;
    for (let k = 0; k < 3 && tpP > tP && Number.isFinite(distance); k++) {
      hLu = Globe.profondeur(tpP - tP, Math.min(95, Math.max(40, distance)));
      if (!Number.isFinite(hLu)) break;
      h = hLu; distance = distanceSP(tS - tP, h);
    }
    return { distance, h, hLu, t0: Number.isFinite(distance) ? origine(tP, distance, h) : NaN };
  }

  return { DT, PHASES, SURFACE, FILTRE_MS, CALAGE, groupe, modeleA, etalement, phases, premieres, generer, Ms, periodeAutour, msVraie, distanceSP, origine, lire };
})();
export default Teleseisme;
