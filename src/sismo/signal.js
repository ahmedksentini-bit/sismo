// src/sismo/signal.js — générateur de sismogrammes pédagogiques et lectures.
// Solveurs purs, sans accès au DOM : tout ce qui est ici est testé par `npm test`.
// Méthode stochastique de Boore (2003) pour les fenêtres P et S, impulsions
// directes causales (source de Brune) pour donner une arrivée nette et une
// polarité, coda d'Aki, ondes de surface dispersées, bruit de site.
const Sismo = (() => {
  'use strict';

  // ── Aléatoire reproductible (une graine = un exercice) ──────────────────
  function aleatoire(graine) {
    let a = graine >>> 0;
    const u = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    u.gauss = () => {
      let x = 0;
      while (x === 0) x = u();
      return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u());
    };
    u.entre = (a0, b0) => a0 + (b0 - a0) * u();
    return u;
  }

  // ── FFT radix 2 en place ────────────────────────────────────────────────
  const tables = new Map();
  function twiddles(n) {
    if (!tables.has(n)) {
      const c = new Float64Array(n / 2), s = new Float64Array(n / 2);
      for (let k = 0; k < n / 2; k++) { c[k] = Math.cos(2 * Math.PI * k / n); s[k] = Math.sin(2 * Math.PI * k / n); }
      tables.set(n, { c, s });
    }
    return tables.get(n);
  }
  function fft(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    const { c, s } = twiddles(n), sg = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
      const demi = len >> 1, pas = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0, k = 0; j < demi; j++, k += pas) {
          const wr = c[k], wi = sg * s[k];
          const a = i + j, b = a + demi;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  const puissance2 = n => { let p = 1; while (p < n) p <<= 1; return p; };

  // Multiplie un spectre (signal réel) par une réponse H(f) définie pour f ≥ 0 ;
  // la symétrie hermitienne est conservée (f < 0 → conjugué).
  function multiplier(re, im, dt, H) {
    const n = re.length, df = 1 / (n * dt);
    for (let k = 0; k <= n / 2; k++) {
      const [hr, hi] = H(k * df);
      const r = re[k], i = im[k];
      re[k] = r * hr - i * hi; im[k] = r * hi + i * hr;
      if (k > 0 && k < n / 2) {
        const r2 = re[n - k], i2 = im[n - k];
        re[n - k] = r2 * hr + i2 * hi; im[n - k] = -r2 * hi + i2 * hr;
      }
    }
  }
  const versSpectre = x => { const re = Float64Array.from(x), im = new Float64Array(x.length); fft(re, im, false); return { re, im }; };
  function versTemps(sp, H, dt) {
    const re = Float64Array.from(sp.re), im = Float64Array.from(sp.im);
    if (H) multiplier(re, im, dt, H);
    fft(re, im, true);
    return re;
  }

  // ── Réponses en fréquence (causales sauf mention) ───────────────────────
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  // Butterworth analogique d'ordre n, passe-bas (fc) ou passe-haut, évalué en s = i·f/fc.
  function butter(f, fc, n, passeHaut) {
    let h = [1, 0];
    const x = passeHaut ? (f > 0 ? -fc / f : -1e12) : f / fc; // s normalisé = i·x
    for (let k = 1; k <= n; k++) {
      const th = Math.PI * (2 * k + n - 1) / (2 * n);
      h = cdiv(h, [-Math.cos(th), x - Math.sin(th)]);
    }
    return h;
  }
  function passeBande(fmin, fmax, ordre = 2) {
    return f => {
      let h = [1, 0];
      if (fmin > 0) h = cmul(h, butter(f, fmin, ordre, true));
      if (fmax > 0) h = cmul(h, butter(f, fmax, ordre, false));
      return h;
    };
  }
  // Intégration / dérivation : division ou multiplication par i·2πf.
  const integrer = f => f === 0 ? [0, 0] : [0, -1 / (2 * Math.PI * f)];
  const deriver = f => [0, 2 * Math.PI * f];
  // Wood-Anderson (T0 = 0,8 s, h = 0,8) en déplacement, grandissement statique 1 (IASPEI).
  const WA = { T0: 0.8, h: 0.8, gain: 2080 };
  // Écrit ici depuis l'accélération du sol : X = A / (4π²·(f0² − f² + 2i·h·f0·f)).
  function woodAndersonAcc(f) {
    const f0 = 1 / WA.T0;
    return cdiv([1 / (4 * Math.PI * Math.PI), 0], [f0 * f0 - f * f, 2 * WA.h * f0 * f]);
  }

  // ── Modèle de Terre : croûte sur manteau, couche superficielle lente ────
  const MODELE = {
    H: 32, vp1: 6.0, vs1: 3.5, vp2: 8.0, vs2: 4.6, vp0: 2.5, vs0: 1.2,
    rho: 2800, dsigma: 60, kappa: 0.05, Q0: 130, eta: 0.6, Qmin: 80, Rx: 40, site: true,
  };
  const kmS = MODELE.vp1 * MODELE.vs1 / (MODELE.vp1 - MODELE.vs1); // 8,4 km/s

  function temps(delta, h, m = MODELE) {
    const R = Math.hypot(delta, h);
    const tete = (v1, v2) => {
      const ic = Math.asin(v1 / v2), xc = (2 * m.H - h) * Math.tan(ic);
      return delta >= xc ? delta / v2 + (2 * m.H - h) * Math.cos(ic) / v1 : null;
    };
    const tPg = R / m.vp1, tSg = R / m.vs1, tPn = tete(m.vp1, m.vp2), tSn = tete(m.vs1, m.vs2);
    return {
      R, tPg, tSg, tPn, tSn,
      tP: tPn !== null ? Math.min(tPg, tPn) : tPg,
      tS: tSn !== null ? Math.min(tSg, tSn) : tSg,
      tLQ: delta / 3.4, tLR: delta / 3.1, // début des trains de Love et de Rayleigh (vitesses de groupe)
    };
  }

  // Source de Brune : M0 (N·m), fréquence coin (Hz).
  function source(Mw, beta, dsigma) {
    const M0 = Math.pow(10, 1.5 * Mw + 9.05);
    const fc = 4.906e6 * beta * Math.cbrt(dsigma / (M0 * 1e7));
    return { M0, fc };
  }
  // Expansion géométrique (R en km, référence 1 km), Q(f).
  const G = (R, m = MODELE) => R <= m.Rx ? 1 / R : (1 / m.Rx) * Math.sqrt(m.Rx / R);
  // Amplification générique « rocher » (Boore & Joyner 1997, Vs30 ≈ 620 m/s), interpolée en log-log.
  const AMP_ROCHER = [[0.01, 1.0], [0.09, 1.10], [0.16, 1.18], [0.51, 1.42], [0.84, 1.58], [1.25, 1.74], [2.26, 2.06], [3.17, 2.25], [6.05, 2.58], [16.6, 3.13], [61.2, 4.0]];
  function ampSite(f) {
    if (f <= AMP_ROCHER[0][0]) return 1;
    for (let i = 1; i < AMP_ROCHER.length; i++) {
      const [f1, a1] = AMP_ROCHER[i - 1], [f2, a2] = AMP_ROCHER[i];
      if (f <= f2) return Math.exp(Math.log(a1) + Math.log(a2 / a1) * Math.log(f / f1) / Math.log(f2 / f1));
    }
    return 4;
  }
  const Q = (f, m = MODELE) => Math.max(m.Qmin, m.Q0 * Math.pow(Math.max(f, 1e-3), m.eta));
  // Distance effective (saturation de faille finie, Yenier & Atkinson 2015).
  const Reff = (R, Mw) => Math.hypot(R, Math.pow(10, -0.405 + 0.235 * Mw));

  // Spectre de Fourier d'accélération (m/s) d'une onde de volume.
  function spectreAcc(Mw, R, onde, m = MODELE) {
    const P = onde === 'P';
    const beta = P ? m.vp1 : m.vs1;
    const { M0, fc: fcS } = source(Mw, m.vs1, m.dsigma);
    const fc = P ? 1.5 * fcS : fcS;
    const rad = P ? 0.52 : 0.63, qf = P ? 1.5 : 1;
    const C = rad * 2 / (4 * Math.PI * m.rho * Math.pow(beta * 1000, 3) * 1000);
    const re = Reff(R, Mw), g = G(re, m);
    const kap = P ? m.kappa / 1.5 : m.kappa;
    const A = f => {
      const w = 2 * Math.PI * f;
      return C * M0 * w * w / (1 + (f / fc) ** 2) * g * Math.exp(-Math.PI * f * R / (qf * Q(f, m) * beta)) * Math.exp(-Math.PI * kap * f) * (m.site ? ampSite(f) : 1);
    };
    // Paramètres de l'impulsion directe causale : niveau Ω0 (m·s), coins source et atténuation.
    const tstar = R / (qf * Q(3, m) * beta) + kap;
    return { A, fc, Omega0: C * M0 * g, fa: 1 / (2 * Math.PI * tstar), duree: 1 / fc + (P ? 0.03 : 0.05) * R };
  }

  // Après un découpage (retrait de l'énergie acausale), l'intégrale de l'accélération n'est plus
  // nulle : la vitesse garderait un palier. On répartit la correction sur [i0, i1] en cloche.
  function compenserDC(x, i0, i1) {
    i1 = Math.min(x.length, i1);
    if (i1 - i0 < 4) return;
    let s = 0, sh = 0;
    for (let i = 0; i < x.length; i++) s += x[i];
    for (let i = i0; i < i1; i++) sh += Math.sin(Math.PI * (i - i0) / (i1 - i0)) ** 2;
    for (let i = i0; i < i1; i++) x[i] -= s * Math.sin(Math.PI * (i - i0) / (i1 - i0)) ** 2 / sh;
  }

  // Bruit blanc fenêtré (Saragoni-Hart ou enveloppe imposée), mis au spectre cible.
  function stochastique(N, dt, u, i0, enveloppe, A) {
    const re = new Float64Array(N), im = new Float64Array(N);
    let s2 = 0, j = 0;
    for (; i0 + j < N; j++) {
      const w = enveloppe(j * dt);
      if (w < 0) break;
      const v = w * u.gauss();
      re[i0 + j] = v; s2 += v * v;
    }
    if (s2 === 0) return re;
    fft(re, im, false);
    const k = 1 / (Math.sqrt(s2) * dt);
    multiplier(re, im, dt, f => [A(f) * k, 0]);
    fft(re, im, true);
    for (let i = 0; i < Math.max(0, i0); i++) re[i] = 0; // aucune énergie avant l'arrivée
    compenserDC(re, i0, i0 + j);
    return re;
  }
  function saragoniHart(Tdur) {
    const eps = 0.2, eta = 0.05, tn = 2 * Tdur;
    const b = -eps * Math.log(eta) / (1 + eps * (Math.log(eps) - 1)), c = b / eps, a = Math.pow(Math.E / eps, b);
    return t => t > tn ? -1 : a * Math.pow(t / tn, b) * Math.exp(-c * t / tn);
  }
  // Coda d'Aki : A(t) ∝ t⁻¹·exp(−t/τ), t compté depuis l'origine ; montée sur `montee` secondes.
  function enveloppeCoda(tArr, montee, tau, tFin, fondu = 0) {
    return t => {
      const tl = tArr + t;
      if (tl > tFin) return -1;
      const f = fondu > 0 ? Math.min(1, (tFin - tl) / fondu) : 1;
      return f * Math.min(1, t / montee) * (tArr / tl) * Math.exp(-t / tau);
    };
  }

  // ── Génération d'un événement vu par une station 3 composantes ──────────
  // p : { Mw, delta (km), h (km), baz (°), graine, bruit: 'calme'|'standard'|'urbain' }
  function generer(p) {
    const m = Object.assign({}, MODELE, p.modele || {}), dt = 0.01, u = aleatoire(p.graine);
    const tt = temps(p.delta, p.h, m);
    const R = tt.R;
    // Début et fin d'enregistrement, comptés depuis l'origine ; imposés par le réseau s'il y en a un.
    const t0 = p.t0 !== undefined ? p.t0 : tt.tP - 20;
    const fin = p.fin !== undefined ? p.fin : Math.max(tt.tSg + 60 + 4 * R / 100, p.delta / 2.6 + 40) + 15 * Math.max(0, p.Mw - 3);
    const n = Math.round((fin - t0) / dt);
    const N = puissance2(Math.ceil(n * 1.25));
    const idx = t => Math.round((t - t0) / dt);

    // Tirages du mécanisme (pédagogiques) : polarités et partition SH/SV.
    const sP = u() < 0.5 ? 1 : -1, uP = u.entre(0.15, 1);
    const sS = u() < 0.5 ? 1 : -1, psi = u.entre(0.25, 1.3);
    const sSV = u() < 0.5 ? 1 : -1;

    // Angles d'incidence en surface (couche lente) : P presque vertical, S presque horizontal.
    const ic = Math.atan2(p.delta, p.h);
    const iP = Math.asin(Math.min(0.95, Math.sin(ic) / m.vp1 * m.vp0));
    const iS = Math.asin(Math.min(0.95, Math.sin(ic) / m.vs1 * m.vs0));
    const iPn = Math.asin(m.vp0 / m.vp2), iSn = Math.asin(m.vs0 / m.vs2);

    const Z = new Float64Array(N), Rr = new Float64Array(N), T = new Float64Array(N);
    const ajouter = (dest, src, k) => { for (let i = 0; i < N; i++) dest[i] += k * src[i]; };

    const sp = spectreAcc(p.Mw, R, 'P', m), ss = spectreAcc(p.Mw, R, 'S', m);

    // 1) Partie déterministe, construite en fréquence : impulsions directes + ondes de surface.
    const dZ = { re: new Float64Array(N), im: new Float64Array(N) };
    const dR = { re: new Float64Array(N), im: new Float64Array(N) };
    const dT = { re: new Float64Array(N), im: new Float64Array(N) };
    const df = 1 / (N * dt);
    const impulsion = (s, fc, fa, Omega0, tArr) => f => {
      // déplacement Ω0/((1+if/fc)²(1+if/fa)²) retardé, puis ×(i2πf)² → accélération
      let h = cdiv([Omega0, 0], cmul(cmul([1, f / fc], [1, f / fc]), cmul([1, f / fa], [1, f / fa])));
      const w = 2 * Math.PI * f, ph = -w * (tArr - t0);
      h = cmul(h, [Math.cos(ph), Math.sin(ph)]);
      return [-w * w * h[0] * s, -w * w * h[1] * s];
    };
    const directes = [];
    // P direct (Pg) : polarité sP, amplitude selon la distance au plan nodal (uP).
    directes.push({ H: impulsion(sP * uP * 0.9, sp.fc, sp.fa, sp.Omega0, tt.tPg), z: Math.cos(iP), r: Math.sin(iP), t: 0 });
    // S direct : SH sur T, SV sur R (et un peu sur Z).
    const hS = impulsion(1, ss.fc, ss.fa, ss.Omega0, tt.tSg);
    directes.push({ H: hS, z: 0.5 * sSV * Math.sin(psi) * Math.sin(iS), r: 0.5 * sSV * Math.sin(psi) * Math.cos(iS), t: 0.5 * sS * Math.cos(psi) });
    // Ondes coniques Pn, Sn : faibles, au-delà de la distance critique.
    if (tt.tPn !== null) {
      const a = 0.7 * Math.sqrt(70 / Math.max(70, p.delta));
      directes.push({ H: impulsion(sP * uP * a, sp.fc, sp.fa, sp.Omega0, tt.tPn), z: Math.cos(iPn), r: Math.sin(iPn), t: 0 });
    }
    if (tt.tSn !== null) {
      const a = 0.4 * Math.sqrt(70 / Math.max(70, p.delta));
      directes.push({ H: impulsion(1, ss.fc, ss.fa, ss.Omega0, tt.tSn), z: 0, r: a * sSV * Math.sin(psi), t: a * sS * Math.cos(psi) });
    }
    for (let k = 0; k <= N / 2; k++) {
      const f = k * df;
      for (const d of directes) {
        const [hr, hi] = d.H(f);
        dZ.re[k] += d.z * hr; dZ.im[k] += d.z * hi;
        dR.re[k] += d.r * hr; dR.im[k] += d.r * hi;
        dT.re[k] += d.t * hr; dT.im[k] += d.t * hi;
      }
    }
    // Ondes de surface : Rayleigh (Z, R en quadrature) et Love (T), dispersion normale.
    const facteurDist = Math.min(1, Math.max(0, (p.delta - 15) / 45));
    if (facteurDist > 0) {
      const { M0, fc } = source(p.Mw, m.vs1, m.dsigma);
      const Ksw = 5e-17;
      const gsw = 1 / Math.sqrt(Math.max(p.delta, 30) * 30);
      const onde = (c0, a, prof, K) => f => {
        if (f === 0) return [0, 0];
        const T_ = 1 / f, c = c0 + a * Math.log(T_), U = c * c / (c + a);
        const bande = 1 / (1 + (0.025 / f) ** 4) / (1 + (f / 0.7) ** 4);
        const amp = K * M0 / (1 + (f / fc) ** 2) * Math.exp(-0.85 * 2 * Math.PI * f * prof / c)
          * Math.exp(-Math.PI * f * p.delta / (200 * U)) * gsw * bande * facteurDist;
        const w = 2 * Math.PI * f, ph = -w * (p.delta / c - t0) - Math.PI / 4;
        return [-w * w * amp * Math.cos(ph), -w * w * amp * Math.sin(ph)];
      };
      const ray = onde(3.0, 0.25, p.h, Ksw), love = onde(3.3, 0.25, p.h, Ksw * 0.8 * Math.abs(Math.cos(psi)) + Ksw * 0.3);
      for (let k = 1; k <= N / 2; k++) {
        const f = k * df, [zr, zi] = ray(f), [lr, li] = love(f);
        dZ.re[k] += zr; dZ.im[k] += zi;
        dR.re[k] += 0.7 * zi; dR.im[k] += -0.7 * zr; // déphasage de 90° : ellipse rétrograde
        dT.re[k] += lr * sS; dT.im[k] += li * sS;
      }
    }
    for (const d of [dZ, dR, dT]) {
      for (let k = 1; k < N / 2; k++) { d.re[N - k] = d.re[k]; d.im[N - k] = -d.im[k]; }
      d.im[0] = 0; d.im[N / 2] = 0;
      fft(d.re, d.im, true);
    }
    const muet = Math.max(0, idx(p.delta / 4.3) - 200);
    ajouter(Z, dZ.re, 1); ajouter(Rr, dR.re, 1); ajouter(T, dT.re, 1);
    for (const x of [Z, Rr, T]) {
      for (let i = 0; i < Math.min(muet, idx(tt.tP) - 50); i++) x[i] = 0;
      compenserDC(x, idx(tt.tP), Math.max(idx(p.delta / 2.4), idx(tt.tS) + 1000));
    }

    // 2) Parties stochastiques (Boore 2003).
    const wP = saragoniHart(sp.duree), wS = saragoniHart(ss.duree);
    // P diffusée : Z et R cohérents, un peu de T.
    const pz = stochastique(N, dt, u, idx(tt.tPg), wP, sp.A);
    ajouter(Z, pz, 0.8 * Math.cos(iP)); ajouter(Rr, pz, 0.8 * Math.sin(iP) + 0.1);
    ajouter(T, stochastique(N, dt, u, idx(tt.tPg), wP, sp.A), 0.15);
    // Pn, Sn : courtes fenêtres diffusées derrière les ondes coniques.
    if (tt.tPn !== null && tt.tPn < tt.tPg - 0.5) {
      const kn = 0.45 * Math.sqrt(70 / Math.max(70, p.delta));
      const pn = stochastique(N, dt, u, idx(tt.tPn), saragoniHart(Math.min(sp.duree, tt.tPg - tt.tPn)), sp.A);
      ajouter(Z, pn, kn * Math.cos(iPn)); ajouter(Rr, pn, kn * Math.sin(iPn));
    }
    if (tt.tSn !== null && tt.tSn < tt.tSg - 0.5) {
      const kn = 0.3 * Math.sqrt(70 / Math.max(70, p.delta));
      const sn = stochastique(N, dt, u, idx(tt.tSn), saragoniHart(Math.min(ss.duree, tt.tSg - tt.tSn)), ss.A);
      ajouter(Rr, sn, kn * 0.7); ajouter(T, sn, kn * 0.7); ajouter(Z, sn, kn * 0.3);
    }
    // S : SV (R et un peu Z) et SH (T), séries indépendantes.
    const sv = stochastique(N, dt, u, idx(tt.tSg), wS, ss.A);
    const sh = stochastique(N, dt, u, idx(tt.tSg), wS, ss.A);
    ajouter(Rr, sv, Math.sin(psi) * Math.cos(iS) + 0.25); ajouter(Z, sv, Math.sin(psi) * Math.sin(iS) + 0.12);
    ajouter(T, sh, Math.abs(Math.cos(psi)) + 0.25);
    // Coda P (entre P et S) et coda S, incohérentes d'une composante à l'autre.
    const tFin = t0 + n * dt;
    const codaP = enveloppeCoda(tt.tPg, sp.duree * 0.6, 12, tt.tSg + 4, 6);
    const codaS = enveloppeCoda(tt.tSg, ss.duree * 0.6, 30, tFin);
    const ampCodaS = 0.9;
    for (const [dest, kp, ks] of [[Z, 0.5, 0.8], [Rr, 0.4, 1], [T, 0.3, 1]]) {
      ajouter(dest, stochastique(N, dt, u, idx(tt.tPg), codaP, sp.A), kp);
      ajouter(dest, stochastique(N, dt, u, idx(tt.tSg), codaS, ss.A), ampCodaS * ks);
    }

    // 3) Vitesse par intégration sur les séries complètes (aucune troncature avant l'intégration),
    //    puis rotation R/T → N/E. baz : azimut de la station vers la source.
    const vit = [Z, Rr, T].map(x => versTemps(versSpectre(x), integrer, dt));
    const phr = ((p.baz + 180) * Math.PI) / 180, cr = Math.cos(phr), sr = Math.sin(phr);
    const tourner = ([z, r, t]) => {
      const o = { Z: new Float64Array(n), N: new Float64Array(n), E: new Float64Array(n) };
      for (let i = 0; i < n; i++) { o.Z[i] = z[i]; o.N[i] = r[i] * cr - t[i] * sr; o.E[i] = r[i] * sr + t[i] * cr; }
      return o;
    };
    return {
      dt, n, t0, tt, p,
      acc: tourner([Z, Rr, T]), // accélération vraie du sol (m/s²), sans bruit
      vit: tourner(vit),        // vitesse vraie du sol (m/s), sans bruit
      verite: { sP, uP, polariteLisible: uP >= 0.35, baz: p.baz },
    };
  }

  // ── Enregistrement : bruit du site et capteur ───────────────────────────
  const NIVEAUX = {
    calme: { ms: 0.3e-6, hf: 10e-9 },
    standard: { ms: 0.8e-6, hf: 50e-9 },
    urbain: { ms: 1.5e-6, hf: 300e-9 },
  };
  const CAPTEURS = {
    HH: { nom: 'Vélocimètre large bande', grandeur: 'vitesse', saturation: 0.015 },
    HN: { nom: 'Accéléromètre', grandeur: 'acceleration', bruit: 1e-4 },
  };
  function bruitBande(n, dt, u, fmin, fmax, rms, ordre = 2) {
    const N = puissance2(n);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = u.gauss();
    fft(re, im, false);
    const H = passeBande(fmin, fmax, ordre);
    multiplier(re, im, dt, H);
    fft(re, im, true);
    let s = 0;
    for (let i = 0; i < n; i++) s += re[i] * re[i];
    const k = rms / Math.sqrt(s / n), out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = re[i] * k;
    return out;
  }
  // Renvoie les séries enregistrées (vitesse en m/s pour HH, accélération en m/s² pour HN).
  function enregistrer(ev, capteur, niveau, graineBruit) {
    const u = aleatoire(graineBruit), { n, dt } = ev, N = puissance2(Math.ceil(n * 1.25));
    const lv = NIVEAUX[niveau] || NIVEAUX.standard, out = {}, sature = {};
    for (const c of ['Z', 'N', 'E']) {
      if (capteur === 'HH') {
        const v = ev.vit[c];
        const kms = c === 'Z' ? 1.2 : 1;
        // microséisme : bande de 0,1 à 0,35 Hz à flancs raides (ordre 4), comme le pic de la houle qui retombe vite
        // au-dessus de 0,5 Hz ; bruit de site au-dessus de 1 Hz
        const b1 = bruitBande(n, dt, u, 0.1, 0.35, lv.ms * kms, 4), b2 = bruitBande(n, dt, u, 1, 25, lv.hf);
        const y = new Float64Array(n), s = CAPTEURS.HH.saturation;
        let nb = 0;
        for (let i = 0; i < n; i++) {
          let w = v[i] + b1[i] + b2[i];
          if (w > s) { w = s; nb++; } else if (w < -s) { w = -s; nb++; }
          y[i] = w;
        }
        out[c] = y; sature[c] = nb;
      } else {
        const b = bruitBande(n, dt, u, 0.05, 40, CAPTEURS.HN.bruit);
        const y = new Float64Array(n);
        for (let i = 0; i < n; i++) y[i] = ev.acc[c][i] + b[i];
        out[c] = y; sature[c] = 0;
      }
    }
    return { capteur, series: out, sature, n, dt };
  }

  // Convertit une série enregistrée vers la grandeur affichée, filtre compris.
  // grandeur : 'vitesse' | 'acceleration' | 'deplacement' | 'wa' ; filtre : [fmin, fmax] ou [fmin, fmax, ordre] (2 par
  // défaut), ou null.
  function convertir(serie, dt, capteur, grandeur, filtre) {
    const n = serie.length, N = puissance2(Math.ceil(n * 1.25));
    const x = new Float64Array(N);
    // Retrait de la moyenne et petite rampe d'entrée pour limiter les effets de bord.
    let moy = 0;
    for (let i = 0; i < n; i++) moy += serie[i];
    moy /= n;
    const nt = Math.min(200, n >> 3);
    for (let i = 0; i < n; i++) {
      const w = i < nt ? 0.5 - 0.5 * Math.cos(Math.PI * i / nt) : i > n - nt ? 0.5 - 0.5 * Math.cos(Math.PI * (n - i) / nt) : 1;
      x[i] = (serie[i] - moy) * w;
    }
    const sp = versSpectre(x);
    const base = capteur === 'HH' ? 'vitesse' : 'acceleration';
    const ordre = { acceleration: 0, vitesse: 1, deplacement: 2, wa: 2 };
    const ecart = ordre[grandeur] - ordre[base];
    const coupe = passeBande(0.03, 0, 2), bande = filtre ? passeBande(filtre[0], filtre[1], filtre[2] || 2) : null;
    const H = f => {
      let h = [1, 0];
      if (grandeur === 'wa') {
        if (base === 'vitesse') h = deriver(f);
        h = cmul(h, woodAndersonAcc(f));
      } else {
        for (let k = 0; k < ecart; k++) h = cmul(h, integrer(f));
        for (let k = 0; k > ecart; k--) h = cmul(h, deriver(f));
        if (ecart > 0) h = cmul(h, coupe(f));
      }
      if (bande) h = cmul(h, bande(f));
      return h;
    };
    return versTemps(sp, H, dt).subarray(0, n);
  }

  // ── Lectures : distance, heure d'origine, ML, azimut ────────────────────
  const distanceSP = dts => dts * kmS;
  const origineDepuis = (tP, dts) => tP - dts * MODELE.vs1 / (MODELE.vp1 - MODELE.vs1);
  // IASPEI (2013) : A en nm (Wood-Anderson de grandissement 1), R hypocentrale en km.
  const ML = (Anm, R) => Math.log10(Anm) + 1.11 * Math.log10(R) + 0.00189 * R - 2.09;

  // Azimut de la source par analyse en composantes principales du mouvement N-E
  // pendant la P ; l'ambiguïté de 180° est levée avec le signe de Z.
  function azimutP(z, nn, e) {
    let snn = 0, see = 0, sne = 0;
    for (let i = 0; i < z.length; i++) { snn += nn[i] * nn[i]; see += e[i] * e[i]; sne += nn[i] * e[i]; }
    const th = 0.5 * Math.atan2(2 * sne, snn - see); // direction principale depuis le nord
    const cn = Math.cos(th), ce = Math.sin(th);
    let corr = 0;
    for (let i = 0; i < z.length; i++) corr += z[i] * (nn[i] * cn + e[i] * ce);
    const tr = snn + see, det = snn * see - sne * sne;
    const l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr - l1;
    let dir = (th * 180) / Math.PI; // sens du mouvement si corr > 0 (compression : on s'éloigne de la source)
    let baz = corr > 0 ? dir + 180 : dir;
    baz = ((baz % 360) + 360) % 360;
    return { baz, rectilinearite: l1 > 0 ? 1 - l2 / l1 : 0 };
  }

  // Vérité terrain de la magnitude locale : mesure sur le Wood-Anderson sans bruit.
  function mlVraie(ev) {
    const { n, dt } = ev, N = puissance2(Math.ceil(n * 1.25)), res = {};
    for (const c of ['N', 'E']) {
      const x = new Float64Array(N); x.set(ev.acc[c]);
      const w = versTemps(versSpectre(x), woodAndersonAcc, dt);
      let a = 0, ia = 0;
      for (let i = 0; i < n; i++) if (Math.abs(w[i]) > a) { a = Math.abs(w[i]); ia = i; }
      res[c] = { A: a * 1e9, t: ia * dt };
    }
    const R = ev.tt.R;
    const mN = ML(res.N.A, R), mE = ML(res.E.A, R);
    return { N: res.N, E: res.E, ML: (mN + mE) / 2, mN, mE };
  }

  // ── Localisation par un réseau ──────────────────────────────────────────
  // Temps de trajet prédits : P = première arrivée (Pg ou Pn), S = Sg (la S que l'on pointe).
  function predicteur(m = MODELE) {
    const ic = Math.asin(m.vp1 / m.vp2), tg = Math.tan(ic), cs = Math.cos(ic);
    return (delta, h, phase) => {
      const R = Math.hypot(delta, h);
      if (phase === 1) return R / m.vs1;
      const e = 2 * m.H - h, tPg = R / m.vp1;
      return delta >= e * tg ? Math.min(tPg, delta / m.vp2 + e * cs / m.vp1) : tPg;
    };
  }
  const azimut = (dx, dy) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  // Gap azimutal : plus grand secteur sans station vu depuis l'épicentre.
  function gapAzimutal(x, y, stations) {
    const a = stations.map(s => azimut(s.x - x, s.y - y)).sort((p, q) => p - q);
    let gap = 360 - a[a.length - 1] + a[0];
    for (let i = 1; i < a.length; i++) gap = Math.max(gap, a[i] - a[i - 1]);
    return gap;
  }
  // stations : [{x, y}] en km (x vers l'est, y vers le nord) ; lectures : [{tP, tS}] dans une même
  // échelle de temps (null si absent). Recherche sur grille de (x, y, h), t0 analytique (moyenne pondérée).
  function localiser(stations, lectures, m = MODELE) {
    const pred = predicteur(m), obs = [];
    lectures.forEach((l, k) => {
      if (l.tP !== null) obs.push({ k, ph: 0, t: l.tP, w: 1 });
      if (l.tS !== null) obs.push({ k, ph: 1, t: l.tS, w: 0.5 });
    });
    const nP = new Set(obs.filter(o => o.ph === 0).map(o => o.k)).size;
    if (obs.length < 4 || nP < 3) return null;
    const W = obs.reduce((a, o) => a + o.w, 0), p = new Float64Array(obs.length);
    const evaluer = (x, y, h) => {
      let s0 = 0;
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i], st = stations[o.k];
        p[i] = pred(Math.hypot(x - st.x, y - st.y), h, o.ph);
        s0 += o.w * (o.t - p[i]);
      }
      const t0 = s0 / W;
      let e = 0;
      for (let i = 0; i < obs.length; i++) { const r = obs[i].t - t0 - p[i]; e += obs[i].w * r * r; }
      return { t0, rms: Math.sqrt(e / W) };
    };
    const cx = stations.reduce((a, s) => a + s.x, 0) / stations.length, cy = stations.reduce((a, s) => a + s.y, 0) / stations.length;
    let b = { rms: Infinity };
    const essayer = (x, y, h) => { const r = evaluer(x, y, h); if (r.rms < b.rms) b = { x, y, h, t0: r.t0, rms: r.rms }; };
    for (let x = cx - 200; x <= cx + 200; x += 5) for (let y = cy - 200; y <= cy + 200; y += 5) for (let h = 1; h <= 31; h += 3) essayer(x, y, h);
    let c = { ...b };
    for (let x = c.x - 6; x <= c.x + 6; x += 0.5) for (let y = c.y - 6; y <= c.y + 6; y += 0.5) for (let h = 0.5; h <= 31; h += 1) essayer(x, y, h);
    c = { ...b };
    for (let x = c.x - 0.6; x <= c.x + 0.6; x += 0.1) for (let y = c.y - 0.6; y <= c.y + 0.6; y += 0.1) for (let h = Math.max(0.2, c.h - 1); h <= Math.min(31, c.h + 1); h += 0.2) essayer(x, y, h);
    // Zone de confiance : cellules dont le résidu dépasse le minimum de moins de 0,25 s (à h optimal).
    const zone = [], seuil = b.rms + 0.25;
    for (let x = b.x - 50; x <= b.x + 50; x += 1) for (let y = b.y - 50; y <= b.y + 50; y += 1) if (evaluer(x, y, b.h).rms <= seuil) zone.push([x, y]);
    const residus = lectures.map((l, k) => {
      const st = stations[k], d = Math.hypot(b.x - st.x, b.y - st.y);
      return {
        dP: l.tP !== null ? l.tP - b.t0 - pred(d, b.h, 0) : null,
        dS: l.tS !== null ? l.tS - b.t0 - pred(d, b.h, 1) : null,
      };
    });
    return { ...b, zone, residus, gap: gapAzimutal(b.x, b.y, stations), nObs: obs.length };
  }
  // Diagramme de Wadati : tS − tP = (Vp/Vs − 1)(tP − t0), droite des moindres carrés.
  function wadati(lectures) {
    const pts = lectures.filter(l => l.tP !== null && l.tS !== null && l.tS > l.tP).map(l => [l.tP, l.tS - l.tP]);
    if (pts.length < 2) return null;
    const n = pts.length, mx = pts.reduce((a, q) => a + q[0], 0) / n, my = pts.reduce((a, q) => a + q[1], 0) / n;
    let sxy = 0, sxx = 0;
    for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
    if (sxx < 1e-6) return null;
    const pente = sxy / sxx, a = my - pente * mx;
    if (pente <= 0) return null;
    return { pente, a, t0: -a / pente, vpvs: 1 + pente, pts };
  }

  return {
    predicteur, localiser, wadati, gapAzimutal, azimut,
    aleatoire, fft, MODELE, kmS, WA, NIVEAUX, CAPTEURS, temps, source,
    generer, enregistrer, convertir, distanceSP, origineDepuis, ML, azimutP, mlVraie, passeBande,
    stochastique, saragoniHart, puissance2, etalement: G, Q, ampSite, Reff, compenserDC, versSpectre, versTemps, integrer,
  };
})();
export default Sismo;
