import Sismo from './signal.js';

// src/sismo/sismicite.js — statistique de la sismicité : catalogue simulé (Gutenberg-Richter, répliques
// d'Omori-Utsu, complétude variable dans le temps), magnitude de complétude, valeur b, déclusterage
// de Gardner et Knopoff, probabilités de Poisson. Solveurs purs.
const Sismicite = (() => {
  'use strict';
  const LN10 = Math.LN10, MMIN = 2.5, DM = 0.1;
  // Complétude par défaut : un catalogue ancien n'enregistre que les gros séismes.
  const COMPLETUDE = [[1900, 5.5], [1930, 4.5], [1964, 3.5], [1990, 2.5]];
  const mcAnnee = (an, comp) => { let m = comp[0][1]; for (const [a, v] of comp) if (an >= a) m = v; return m; };

  // Magnitude tirée d'une loi exponentielle tronquée entre m0 et m1 (pente b).
  function tirerM(u, b, m0, m1) {
    const beta = b * LN10;
    return m0 - Math.log(1 - u() * (1 - Math.exp(-beta * (m1 - m0)))) / beta;
  }
  function poissonTirage(u, moyenne) {
    if (moyenne > 30) return Math.max(0, Math.round(moyenne + Math.sqrt(moyenne) * u.gauss()));
    let k = 0, p = Math.exp(-moyenne), s = p;
    const x = u();
    while (x > s && k < 200) { k++; p *= moyenne / k; s += p; }
    return k;
  }
  // Fenêtres de Gardner et Knopoff (1974) : distance (km) et durée (jours).
  function fenetreGK(M) {
    return { L: Math.pow(10, 0.1238 * M + 0.983), T: M >= 6.5 ? Math.pow(10, 0.032 * M + 2.7389) : Math.pow(10, 0.5409 * M - 0.547) };
  }

  // Catalogue simulé dans une région de 300 × 300 km, de `debut` à `fin` (années décimales).
  // taux4 : nombre annuel de chocs principaux de magnitude ≥ 4.
  function genererCatalogue({ b = 1, taux4 = 2, Mmax = 7.5, debut = 1900, fin = 2025, repliques = true, completude = COMPLETUDE, graine = 1, arrondi = 0.1 }) {
    const u = Sismo.aleatoire(graine), lam = taux4 * Math.pow(10, b * (4 - MMIN)), tous = [];
    let t = debut, id = 0;
    for (;;) {
      t += -Math.log(1 - u()) / lam;
      if (t >= fin) break;
      const M = tirerM(u, b, MMIN, Mmax), x = 300 * u(), y = 300 * u(), choc = { id: id++, t, M, x, y, rep: false, parent: null };
      tous.push(choc);
      if (!repliques || M < 4) continue;
      // Productivité de Båth : la plus forte réplique vaut M − 1,2 en moyenne.
      const n = Math.min(3000, poissonTirage(u, Math.pow(10, b * (M - 1.2 - MMIN))));
      const c = 0.05, p = 1.1, Tj = 730, q = 1 - p, A = Math.pow(c, q), B = A - Math.pow(Tj + c, q);
      const sigma = Math.pow(10, -2.44 + 0.59 * M) / 4;
      for (let k = 0; k < n; k++) {
        const dtj = Math.pow(A - u() * B, 1 / q) - c, tr = t + dtj / 365.25;
        if (tr >= fin) continue;
        tous.push({ id: id++, t: tr, M: tirerM(u, b, MMIN, M - 0.1), x: x + sigma * u.gauss(), y: y + sigma * u.gauss(), rep: true, parent: choc.id });
      }
    }
    // Détection : rampe de 0,6 unité de magnitude autour de la complétude de l'époque.
    const cat = [];
    for (const e of tous) {
      const mc = mcAnnee(e.t, completude), pd = Math.min(1, Math.max(0, (e.M - mc + 0.3) / 0.6));
      if (u() < pd) cat.push({ ...e, M: Math.round(e.M / arrondi) * arrondi });
    }
    cat.sort((p, q) => p.t - q.t);
    return cat;
  }

  // Déclusterage de Gardner et Knopoff, avec les conventions de HMTK (GardnerKnopoffType1) :
  // du plus fort au plus faible, chaque séisme qui n'appartient encore à aucun amas ouvre une
  // fenêtre [t − f·T, t + T] × L ; tous les séismes libres qu'elle contient, quelle que soit leur
  // magnitude, rejoignent son amas. Fenêtre de temps en années de 364,75 jours.
  // Renvoie l'amas de chaque séisme et un drapeau : 0 choc principal ou isolé, 1 réplique, −1 précurseur.
  const JOURS_GK = 364.75;
  const distancePlane = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // Distance épicentrale d'HMTK (haversine, rayon 6371,227 km) entre deux séismes { lat, lon } : celle du déclusterage
  // d'un catalogue réel.
  const haversine = (a, b) => {
    const r = Math.PI / 180, dlat = (a.lat - b.lat) * r, dlon = (a.lon - b.lon) * r;
    const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlon / 2) ** 2;
    return 2 * 6371.227 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };
  function amasGK(cat, { distance = distancePlane, propPrecurseurs = 0 } = {}) {
    const n = cat.length, amas = new Int32Array(n), drapeau = new Int8Array(n);
    const parTemps = [...cat.keys()].sort((i, j) => cat[i].t - cat[j].t), temps = parTemps.map(i => cat[i].t);
    const premier = t => { let a = 0, b = n; while (a < b) { const m = (a + b) >> 1; if (temps[m] < t) a = m + 1; else b = m; } return a; };
    const ordre = [...cat.keys()].sort((i, j) => cat[j].M - cat[i].M);
    let numero = 0;
    for (let k = 0; k < n - 1; k++) {
      const i = ordre[k];
      if (amas[i]) continue;
      const e = cat[i], w = fenetreGK(e.M), T = w.T / JOURS_GK, membres = [];
      for (let q = premier(e.t - T * propPrecurseurs); q < n && temps[q] <= e.t + T; q++) {
        const j = parTemps[q];
        if (j !== i && !amas[j] && distance(cat[j], e) <= w.L) membres.push(j);
      }
      if (!membres.length) continue;
      numero++;
      amas[i] = numero;
      for (const j of membres) { amas[j] = numero; drapeau[j] = cat[j].t >= e.t ? 1 : -1; }
    }
    return { amas, drapeau };
  }
  // Séismes gardés (chocs principaux et isolés) : drapeau nul.
  const declusterGK = (cat, options) => Array.from(amasGK(cat, options).drapeau, d => d === 0);

  // Magnitude de complétude par courbure maximale (+0,2, Woessner et Wiemer 2005).
  function mcCourbureMax(mags) {
    const h = new Map();
    for (const m of mags) { const k = Math.round(m * 10); h.set(k, (h.get(k) || 0) + 1); }
    let best = null, nb = -1;
    for (const [k, v] of h) if (v > nb || (v === nb && k < best)) { best = k; nb = v; }
    return Math.round((best / 10 + 0.2) * 10) / 10;
  }
  // Valeur b par maximum de vraisemblance (Aki 1965, correction de classe d'Utsu), écart type de Shi et Bolt (1982).
  function valeurB(mags, Mc) {
    const sel = mags.filter(m => m >= Mc - 1e-9), N = sel.length;
    if (N < 5) return null;
    const moy = sel.reduce((a, m) => a + m, 0) / N;
    const b = Math.LOG10E / (moy - (Mc - DM / 2));
    const s2 = sel.reduce((a, m) => a + (m - moy) ** 2, 0) / (N * (N - 1));
    return { b, sigma: 2.3 * b * b * Math.sqrt(s2), N };
  }
  // Loi de récurrence ajustée : λ(≥m) = λ(≥Mc)·10^(−b(m − Mc)) ; a annuel = log λ(≥Mc) + b·Mc.
  function recurrence(mags, Mc, annees) {
    const r = valeurB(mags, Mc);
    if (!r) return null;
    const lamMc = r.N / annees;
    return { ...r, Mc, lamMc, a: Math.log10(lamMc) + r.b * Mc, taux: m => lamMc * Math.pow(10, -r.b * (m - Mc)) };
  }
  // Comptages par classe de magnitude avec une table de complétude [[année, Mc], …] rangée de la plus
  // récente à la plus ancienne (mêmes conventions que HMTK, get_completeness_counts). anneeFin : dernière
  // année du catalogue. Renvoie les centres de classe, les durées d'observation et les effectifs.
  function arange(debut, fin, pas) { const n = Math.max(0, Math.ceil((fin - debut) / pas)); return Array.from({ length: n }, (_, i) => debut + i * pas); }
  function histogramme(valeurs, bords) {
    const h = new Array(bords.length - 1).fill(0), der = bords[bords.length - 1];
    for (const v of valeurs) {
      if (v < bords[0] || v > der) continue;
      if (v === der) { h[h.length - 1]++; continue; }
      let a = 0, b = bords.length - 1;
      while (b - a > 1) { const m = (a + b) >> 1; if (bords[m] <= v) a = m; else b = m; }
      h[a]++;
    }
    return h;
  }
  function comptagesCompletude(evts, table, dm, anneeFin) {
    const mmaxObs = evts.reduce((a, e) => Math.max(a, e.M), -Infinity); // boucle : un catalogue réel peut dépasser la pile
    let cmag = table.map(r => r[1]);
    if (mmaxObs > Math.max(...cmag)) cmag = [...cmag, mmaxObs];
    const cannee = [anneeFin + 1, ...table.map(r => r[0])];
    const bords = arange(Math.min(...cmag) - 1e-7, Math.max(...cmag) + dm, dm);
    const nobs = new Array(bords.length - 1).fill(0), duree = new Array(bords.length - 1).fill(0);
    for (let i = 0; i < cannee.length - 1; i++) {
      const sel = evts.filter(e => e.t < cannee[i] && e.t >= cannee[i + 1]).map(e => e.M);
      const idx = bords.map((v, k) => k).filter(k => bords[k] >= cmag[i] - dm / 2);
      const h = histogramme(sel, idx.map(k => bords[k]));
      for (let q = 0; q < idx.length - 1; q++) { nobs[idx[q]] += h[q]; duree[idx[q]] += cannee[i] - cannee[i + 1]; }
    }
    let der = -1;
    nobs.forEach((v, k) => { if (v > 0) der = k; });
    const centres = nobs.map((_, k) => Math.round(((bords[k] + bords[k + 1]) / 2) * 1000) / 1000);
    return { centres: centres.slice(0, der + 1), duree: duree.slice(0, der + 1), nobs: nobs.slice(0, der + 1) };
  }
  // Weichert (1980) : maximum de vraisemblance avec des durées d'observation différentes par classe.
  // Itérations de Newton sur β = b·ln 10, comme HMTK. Renvoie b, σb, le taux λ(≥ m0) avec
  // m0 = premier centre − dm/2, et le taux à la magnitude de référence mref.
  function weichert({ centres, duree, nobs }, mref = 4, b0 = 1, tol = 1e-5, maxIter = 1000) {
    if (centres.length < 2) return null;
    let beta = b0 * Math.LN10;
    const dm = centres[1] - centres[0], N = nobs.reduce((a, v) => a + v, 0);
    const snm = nobs.reduce((a, v, k) => a + v * centres[k], 0);
    for (let it = 1; it <= maxIter; it++) {
      let sumexp = 0, sumtex = 0, stmex = 0, stm2x = 0;
      centres.forEach((m, k) => { const e = Math.exp(-beta * m), te = duree[k] * e; sumexp += e; sumtex += te; stmex += te * m; stm2x += te * m * m; });
      const d1 = stmex / sumtex, d2 = N * (d1 * d1 - stm2x / sumtex), grad = d1 * N - snm, ancien = beta;
      beta -= grad / d2;
      if (Math.abs(beta - ancien) <= tol) {
        // fngtm0 = λ(≥ m0) ; 10^a = λ(≥ 0) = fngtm0·e^(β·m0) (le « fn0 » de HMTK).
        const sigBeta = Math.sqrt(-1 / d2), lam0 = N * (sumexp / sumtex), m0 = centres[0] - dm / 2, b = beta / Math.LN10;
        return {
          b, sigma: sigBeta / Math.LN10, N, m0, lam0, sigmaLam0: lam0 / Math.sqrt(N),
          a: Math.log10(lam0) + b * m0, lamRef: lam0 * Math.exp(-beta * (mref - m0)), taux: m => lam0 * Math.pow(10, -b * (m - m0)),
        };
      }
    }
    return null;
  }

  // Graphique de Stepp (1971) : pour chaque classe de magnitude, taux λ = n/T sur les T dernières années
  // et son écart type σλ = √(λ/T). Tant que la classe est complète, σλ décroît comme 1/√T.
  function stepp(evts, { classes = [[3, 3.5], [3.5, 4], [4, 4.5], [4.5, 5], [5, 6]], anneeFin = 2025, durees = [2, 3, 5, 7, 10, 15, 20, 30, 40, 50, 60, 80, 100, 125] } = {}) {
    return classes.map(([m0, m1]) => ({
      m0, m1,
      points: durees.map(T => {
        const n = evts.filter(e => e.M >= m0 - 1e-9 && e.M < m1 - 1e-9 && e.t >= anneeFin - T).length, lam = n / T;
        return { T, n, lam, sigma: Math.sqrt(lam / T) };
      }),
    }));
  }

  // Poisson : probabilité d'au moins un événement en t années, période de retour associée.
  const probabilite = (lam, t) => 1 - Math.exp(-lam * t);
  const periodeRetour = (P, t) => -t / Math.log(1 - P);

  return { MMIN, DM, COMPLETUDE, JOURS_GK, mcAnnee, fenetreGK, genererCatalogue, haversine, amasGK, declusterGK, mcCourbureMax, valeurB, recurrence, comptagesCompletude, weichert, stepp, probabilite, periodeRetour };
})();
export default Sismicite;
