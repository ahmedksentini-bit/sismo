import Sismo from './signal.js';

// src/sismo/mecanisme.js — mécanisme au foyer par les polarités des premières arrivées P : tenseur des moments
// d'un double couple (Aki et Richards, x nord, y est, z bas), plan auxiliaire, rayonnement P, angles d'émergence
// (Pg montante ou Pn descendante dans le modèle de croûte du site), projection de Schmidt sur l'hémisphère
// inférieur, inversion par recherche exhaustive, axes P et T, type de faille. Vérifié contre ObsPy
// (tests/references/mecanisme.json). Angles en degrés. Solveurs purs.
const Mecanisme = (() => {
  'use strict';
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const norm360 = a => ((a % 360) + 360) % 360, norm180 = a => { const x = norm360(a + 180) - 180; return x === -180 ? 180 : x; };

  // Tenseur des moments unitaire (M0 = 1) d'un double couple, composantes NED [[Mxx, Mxy, Mxz], …].
  function tenseur(azimut, pendage, glissement) {
    const f = azimut * RAD, d = pendage * RAD, l = glissement * RAD;
    const sd = Math.sin(d), cd = Math.cos(d), s2d = Math.sin(2 * d), c2d = Math.cos(2 * d), sl = Math.sin(l), cl = Math.cos(l);
    const sf = Math.sin(f), cf = Math.cos(f), s2f = Math.sin(2 * f), c2f = Math.cos(2 * f);
    const xx = -(sd * cl * s2f + s2d * sl * sf * sf), xy = sd * cl * c2f + 0.5 * s2d * sl * s2f, xz = -(cd * cl * cf + c2d * sl * sf);
    const yy = sd * cl * s2f - s2d * sl * cf * cf, yz = -(cd * cl * sf - c2d * sl * cf), zz = s2d * sl;
    return [[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]];
  }
  // Vecteurs normal n et glissement u d'un plan (NED) ; M = u·nᵀ + n·uᵀ.
  function vecteurs(azimut, pendage, glissement) {
    const f = azimut * RAD, d = pendage * RAD, l = glissement * RAD;
    const n = [-Math.sin(d) * Math.sin(f), Math.sin(d) * Math.cos(f), -Math.cos(d)];
    const u = [Math.cos(l) * Math.cos(f) + Math.cos(d) * Math.sin(l) * Math.sin(f), Math.cos(l) * Math.sin(f) - Math.cos(d) * Math.sin(l) * Math.cos(f), -Math.sin(l) * Math.sin(d)];
    return { n, u };
  }
  // Plan défini par sa normale n et son glissement u (NED) : azimut, pendage (0–90), glissement (−180–180].
  function planDepuis(n, u) {
    if (n[2] > 0) { n = n.map(x => -x); u = u.map(x => -x); } // normale vers le haut (z négatif)
    const pendage = Math.acos(Math.min(1, -n[2])) * DEG;
    const azimut = norm360(Math.atan2(-n[0], n[1]) * DEG);
    const f = azimut * RAD, d = pendage * RAD;
    // direction et ligne de plus grande pente du plan, pour le glissement
    const dir = [Math.cos(f), Math.sin(f), 0], pente = [-Math.cos(d) * Math.sin(f), Math.cos(d) * Math.cos(f), Math.sin(d)];
    const glissement = norm180(Math.atan2(-(u[0] * pente[0] + u[1] * pente[1] + u[2] * pente[2]), u[0] * dir[0] + u[1] * dir[1]) * DEG);
    return { azimut, pendage, glissement };
  }
  // Plan auxiliaire : n et u échangés.
  function planAuxiliaire(azimut, pendage, glissement) {
    const { n, u } = vecteurs(azimut, pendage, glissement);
    return planDepuis(u, n);
  }
  // Rayonnement P pour une direction de rai (émergence i depuis la verticale descendante, azimut φ) : γ·M·γ.
  function direction(i, phi) { return [Math.sin(i * RAD) * Math.cos(phi * RAD), Math.sin(i * RAD) * Math.sin(phi * RAD), Math.cos(i * RAD)]; }
  function rayonnementP(M, i, phi) {
    const g = direction(i, phi);
    let s = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) s += g[a] * M[a][b] * g[b];
    return s;
  }
  // Rayonnement S pour la même direction : vecteur M·γ − (γ·M·γ)·γ, perpendiculaire au rai, et ses composantes SV
  // (selon e_i = ∂γ/∂i, vers les émergences croissantes) et SH (selon e_φ, vers les azimuts croissants).
  function rayonnementS(M, i, phi) {
    const g = direction(i, phi), Mg = M.map(l => l[0] * g[0] + l[1] * g[1] + l[2] * g[2]);
    const p = g[0] * Mg[0] + g[1] * Mg[1] + g[2] * Mg[2], v = Mg.map((x, a) => x - p * g[a]);
    const ci = Math.cos(i * RAD), si = Math.sin(i * RAD), cf = Math.cos(phi * RAD), sf = Math.sin(phi * RAD);
    return { vecteur: v, SV: v[0] * ci * cf + v[1] * ci * sf - v[2] * si, SH: -v[0] * sf + v[1] * cf };
  }
  // Valeurs et vecteurs propres d'une matrice symétrique 3×3 (Jacobi) ; axes T (valeur max), N, P (min).
  function propres(M) {
    const A = M.map(r => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let it = 0; it < 50; it++) {
      let p = 0, q = 1;
      for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) if (Math.abs(A[a][b]) > Math.abs(A[p][q])) { p = a; q = b; }
      if (Math.abs(A[p][q]) < 1e-15) break;
      const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
    return [0, 1, 2].map(j => ({ valeur: A[j][j], vecteur: [V[0][j], V[1][j], V[2][j]] })).sort((a, b) => b.valeur - a.valeur);
  }
  // Axe (NED) → azimut et plongement (vers le bas, 0–90°).
  function axe(v) {
    if (v[2] < 0) v = v.map(x => -x);
    return { azimut: norm360(Math.atan2(v[1], v[0]) * DEG), plongement: Math.asin(Math.min(1, v[2])) * DEG };
  }
  function axes(M) {
    const [t, nn, p] = propres(M);
    return { T: axe(t.vecteur), N: axe(nn.vecteur), P: axe(p.vecteur) };
  }
  // Type de faille selon le glissement (comme les lois d'atténuation) : normale −150 < λ < −30, inverse 30 < λ < 150.
  const typeFaille = l => (l > -150 && l < -30 ? 'normale' : l > 30 && l < 150 ? 'inverse' : 'décrochement');

  // Angle d'émergence de la première arrivée P (depuis la verticale descendante) : Pg montante ou Pn descendante.
  function emergence(delta, h, m = Sismo.MODELE) {
    const t = Sismo.temps(delta, h, m);
    if (t.tPn !== null && t.tPn < t.tPg) return { i: Math.asin(m.vp1 / m.vp2) * DEG, onde: 'Pn' };
    return { i: 180 - Math.atan2(delta, h) * DEG, onde: 'Pg' };
  }
  // Projection de Schmidt (aire égale) sur l'hémisphère inférieur : rayon √2·sin(i/2) dans le cercle unité
  // (x vers l'est, y vers le nord) ; un rai montant est remplacé par la direction opposée.
  function projection(i, phi) {
    if (i > 90) { i = 180 - i; phi += 180; }
    const r = Math.SQRT2 * Math.sin((i * RAD) / 2);
    return { x: r * Math.sin(phi * RAD), y: r * Math.cos(phi * RAD) };
  }
  function projectionInverse(x, y) {
    const r = Math.hypot(x, y);
    if (r > 1) return null;
    return { i: 2 * Math.asin(r / Math.SQRT2) * DEG, phi: norm360(Math.atan2(x, y) * DEG) };
  }

  // Polarités d'un réseau : [{ az, i, polarite (+1 compression, −1 dilatation), amplitude }].
  function polarites(mec, stations) {
    const M = tenseur(mec.azimut, mec.pendage, mec.glissement);
    return stations.map(s => { const r = rayonnementP(M, s.i, s.az); return { ...s, amplitude: r, polarite: r >= 0 ? 1 : -1 }; });
  }
  // Désaccords d'un mécanisme avec des lectures (poids facultatifs).
  function desaccords(mec, lectures) {
    const M = tenseur(mec.azimut, mec.pendage, mec.glissement);
    return lectures.reduce((s, l) => s + (Math.sign(rayonnementP(M, l.i, l.az)) !== l.polarite ? (l.poids ?? 1) : 0), 0);
  }
  // Recherche exhaustive : tous les mécanismes de la grille (pas en degrés) ; renvoie le minimum de désaccords et
  // l'ensemble des solutions qui l'atteignent (pendage ≤ 90°, glissement dans (−180, 180]).
  function inverser(lectures, pas = 10) {
    const dirs = lectures.map(l => ({ g: direction(l.i, l.az), p: l.polarite, w: l.poids ?? 1 }));
    let min = Infinity, sols = [];
    for (let s = 0; s < 360; s += pas) for (let d = pas; d <= 90; d += pas) for (let r = -180 + pas; r <= 180; r += pas) {
      const M = tenseur(s, d, r);
      let e = 0;
      for (const { g, p, w } of dirs) {
        const v = g[0] * (M[0][0] * g[0] + M[0][1] * g[1] + M[0][2] * g[2]) + g[1] * (M[1][0] * g[0] + M[1][1] * g[1] + M[1][2] * g[2]) + g[2] * (M[2][0] * g[0] + M[2][1] * g[1] + M[2][2] * g[2]);
        if ((v >= 0 ? 1 : -1) !== p) { e += w; if (e > min) break; }
      }
      if (e < min) { min = e; sols = [{ azimut: s, pendage: d, glissement: r }]; } else if (e === min) sols.push({ azimut: s, pendage: d, glissement: r });
    }
    return { desaccords: min, solutions: sols };
  }
  // Écart angulaire entre deux mécanismes (rotation minimale des tenseurs, approchée par l'angle entre axes P et T).
  function ecartAxes(a, b) {
    const ang = (u, v) => { const x = direction(90 - u.plongement, u.azimut), y = direction(90 - v.plongement, v.azimut); return Math.acos(Math.min(1, Math.abs(x[0] * y[0] + x[1] * y[1] + x[2] * y[2]))) * DEG; };
    const A = axes(tenseur(a.azimut, a.pendage, a.glissement)), B = axes(tenseur(b.azimut, b.pendage, b.glissement));
    return Math.max(ang(A.P, B.P), ang(A.T, B.T));
  }

  return { tenseur, vecteurs, planDepuis, planAuxiliaire, direction, rayonnementP, rayonnementS, propres, axes, typeFaille, emergence, projection, projectionInverse, polarites, desaccords, inverser, ecartAxes };
})();
export default Mecanisme;
