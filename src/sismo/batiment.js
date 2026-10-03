import Spectre from './spectre.js';
import Oscillateur from './oscillateur.js';

// src/sismo/batiment.js — bâtiment à étages modélisé en console de cisaillement : masses concentrées aux
// planchers (t), rigidités d'étage (kN/m), hauteurs d'étage (m) ; forces en kN, déplacements en m. Modes propres
// (Jacobi sur M^−½·K·M^−½), facteurs de participation et masses modales effectives ; méthode des forces latérales
// et analyse modale spectrale de l'EN 1998-1:2004 (§ 4.3.3.2 et § 4.3.3.3), combinaisons SRSS et CQC (Der
// Kiureghian 1981), limitation des dommages (§ 4.4.3.2) et coefficient θ (§ 4.4.2.2) ; calcul temporel par
// superposition modale, chaque mode intégré par Newmark à accélération moyenne (sous-pas ≤ T/20 comme le
// spectre). Vérifié contre OpenSeesPy (tests/references/batiment.json). Solveurs purs.
const Batiment = (() => {
  'use strict';
  const G = Spectre.G;
  const somme = a => a.reduce((s, x) => s + x, 0);
  // Cotes des planchers depuis les hauteurs d'étage.
  const cotes = h => h.reduce((z, x) => (z.push((z.length ? z[z.length - 1] : 0) + x), z), []);

  // Valeurs et vecteurs propres d'une matrice symétrique (Jacobi cyclique).
  function jacobi(A0) {
    const n = A0.length, A = A0.map(r => r.slice()), V = A0.map((_, i) => A0.map((__, j) => (i === j ? 1 : 0)));
    for (let balayage = 0; balayage < 100; balayage++) {
      let hors = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) hors += A[p][q] * A[p][q];
      if (hors < 1e-30 * somme(A.map((r, i) => r[i] * r[i]))) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (A[p][q] === 0) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    return A.map((r, j) => ({ valeur: r[j], vecteur: V.map(x => x[j]) }));
  }

  // Matrice de rigidité d'une console de cisaillement (étage i entre les planchers i − 1 et i, base fixe).
  function rigidite(k) {
    const n = k.length, K = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      K[i][i] += k[i];
      if (i + 1 < n) { K[i][i] += k[i + 1]; K[i][i + 1] = -k[i + 1]; K[i + 1][i] = -k[i + 1]; }
    }
    return K;
  }

  // Modes propres, du plus long au plus court : T, ω, déformée φ (sommet = 1), Γ = φᵀM1 / φᵀMφ, masse effective
  // (φᵀM1)² / φᵀMφ (t) et sa part de la masse totale.
  function modes({ m, k }) {
    const n = m.length, K = rigidite(k), r = m.map(Math.sqrt);
    const A = K.map((ligne, i) => ligne.map((x, j) => x / (r[i] * r[j])));
    const M = somme(m);
    return jacobi(A).sort((a, b) => a.valeur - b.valeur).map(({ valeur, vecteur }) => {
      let phi = vecteur.map((x, i) => x / r[i]);
      phi = phi.map(x => x / phi[n - 1]);
      const l = somme(phi.map((x, i) => m[i] * x)), mg = somme(phi.map((x, i) => m[i] * x * x));
      const w = Math.sqrt(Math.max(valeur, 0));
      return { w, T: (2 * Math.PI) / w, phi, gamma: l / mg, meff: (l * l) / mg, part: (l * l) / mg / M };
    });
  }

  // Déplacements statiques sous des forces de plancher F (kN) : effort tranchant d'étage V_i = Σ_{j ≥ i} F_j,
  // glissement V_i / k_i, cumulé depuis la base.
  function statique(k, F) {
    const n = k.length, V = new Array(n), u = new Array(n);
    for (let i = n - 1, s = 0; i >= 0; i--) { s += F[i]; V[i] = s; }
    for (let i = 0, s = 0; i < n; i++) { s += V[i] / k[i]; u[i] = s; }
    return { V, u };
  }
  // EN 1998-1:2004, § 4.3.3.2.2 (3), expression (4.9) : T1 = 2·√d, d déplacement en tête (m) sous les charges
  // de gravité appliquées horizontalement ; et quotient de Rayleigh sous les mêmes forces.
  function periodeDeplacement({ m, k }) {
    const d = statique(k, m.map(x => x * G)).u[m.length - 1];
    return 2 * Math.sqrt(d);
  }
  function periodeRayleigh({ m, k }, F) {
    const { u } = statique(k, F);
    return 2 * Math.PI * Math.sqrt(somme(u.map((x, i) => m[i] * x * x)) / somme(u.map((x, i) => F[i] * x)));
  }

  // Méthode des forces latérales (§ 4.3.3.2) : Fb = Sd(T1)·m·λ (4.5), λ = 0,85 si T1 ≤ 2·TC et plus de deux
  // étages ; Fi = Fb·si·mi / Σ sj·mj, si = zi (4.11) ou la déformée du mode 1 (4.10). Sd en m/s².
  function forcesLaterales({ m, h }, { T1, Sd, TC, forme = null }) {
    const n = m.length, lambda = T1 <= 2 * TC && n > 2 ? 0.85 : 1, Fb = Sd * somme(m) * lambda;
    const s = forme || cotes(h), d = somme(s.map((x, i) => x * m[i]));
    const F = s.map((x, i) => (Fb * x * m[i]) / d);
    return { lambda, Fb, F };
  }
  // Domaine d'emploi (§ 4.3.3.2.1 (2)) : T1 ≤ min(4·TC ; 2,0 s), plus la régularité en élévation (jugée à part).
  const forcesLateralesPermises = (T1, TC) => T1 <= Math.min(4 * TC, 2);

  // Réponses d'un mode pour une pseudo-accélération spectrale Sa (m/s²) : déplacements u, glissements d'étage d,
  // efforts tranchants d'étage V (= k·d), forces de plancher F.
  function reponseModale(mode, { m, k }, Sa) {
    const q = (mode.gamma * Sa) / (mode.w * mode.w);
    const u = mode.phi.map(x => x * q), d = u.map((x, i) => x - (i ? u[i - 1] : 0));
    return { u, d, V: d.map((x, i) => x * k[i]), F: mode.phi.map((x, i) => m[i] * mode.gamma * x * Sa) };
  }
  // Coefficient de corrélation de la CQC à amortissement égal ξ (Der Kiureghian 1981).
  function rhoCQC(wi, wj, xi = 0.05) {
    const r = Math.min(wi, wj) / Math.max(wi, wj);
    return (8 * xi * xi * (1 + r) * Math.pow(r, 1.5)) / ((1 - r * r) ** 2 + 4 * xi * xi * r * (1 + r) ** 2);
  }
  // Combinaison des réponses modales R[mode][composante] : SRSS (4.16) ou CQC.
  function combiner(R, w, regle = 'srss', xi = 0.05) {
    return R[0].map((_, c) => {
      let s = 0;
      for (let i = 0; i < R.length; i++) {
        if (regle === 'srss') { s += R[i][c] * R[i][c]; continue; }
        for (let j = 0; j < R.length; j++) s += (i === j ? 1 : rhoCQC(w[i], w[j], xi)) * R[i][c] * R[j][c];
      }
      return Math.sqrt(Math.max(s, 0));
    });
  }
  // § 4.3.3.3.1 (3) : plus petit nombre de modes (dans l'ordre des périodes) dont la somme des masses effectives
  // atteint 90 % et qui contient tous les modes de plus de 5 %.
  function modesRetenus(md) {
    let dernier5 = 0, n90 = md.length, cumul = 0;
    md.forEach((x, j) => { if (x.part > 0.05) dernier5 = j + 1; });
    for (let j = 0; j < md.length; j++) { cumul += md[j].part; if (cumul >= 0.9 - 1e-12) { n90 = j + 1; break; } }
    const n = Math.max(dernier5, n90);
    return { n, cumul: somme(md.slice(0, n).map(x => x.part)) };
  }
  // § 4.3.3.3.2 (2) : réponses de deux modes indépendantes si Tj ≤ 0,9·Ti ; alors SRSS, sinon CQC.
  function independants(md, n = md.length) {
    for (let j = 1; j < n; j++) if (md[j].T > 0.9 * md[j - 1].T + 1e-12) return false;
    return true;
  }

  // Analyse modale spectrale complète : spectre Sa(T) (m/s²), n modes retenus, règle. Renvoie les réponses de
  // chaque mode et les enveloppes combinées (u, d, V, F) ; l'effort à la base est V[0].
  function spectrale(bat, md, Sa, { n = md.length, regle = 'srss', xi = 0.05 } = {}) {
    const R = md.slice(0, n).map(x => ({ Sa: Sa(x.T), ...reponseModale(x, bat, Sa(x.T)) }));
    const w = md.slice(0, n).map(x => x.w), comb = cle => combiner(R.map(r => r[cle]), w, regle, xi);
    return { modes: R, u: comb('u'), d: comb('d'), V: comb('V'), F: comb('F') };
  }

  // Limitation des dommages (§ 4.4.3.2) : dr = q·de (4.23) ; dr·ν / h comparé à 0,005, 0,0075 ou 0,010.
  // Coefficient de sensibilité au déplacement relatif (§ 4.4.2.2 (2)) : θ = Ptot·dr / (Vtot·h), Ptot = g·Σ m
  // au-dessus de l'étage. de et Vtot viennent de l'analyse avec le spectre de calcul.
  function verifications({ m, h }, { d, V }, { q, nu = 0.5 }) {
    const n = m.length, P = new Array(n);
    for (let i = n - 1, s = 0; i >= 0; i--) { s += m[i] * G; P[i] = s; }
    const dr = d.map(x => q * x);
    return { dr, ratio: dr.map((x, i) => (x * nu) / h[i]), theta: dr.map((x, i) => (P[i] * x) / (V[i] * h[i])), P };
  }

  // Calcul temporel par superposition modale : accélération du sol acc (m/s²) au pas dt, amortissement ξ dans
  // chaque mode, n modes. Tous les modes sur la même grille fine h = dt/s, s = ⌈dt / (Tmin/20)⌉ (ou sousPas
  // imposé), accélération interpolée linéairement : c'est l'intégration de Newmark du système couplé à
  // amortissement modal, mode par mode. u = Σ Γj·φj·qj. Renvoie les historiques des planchers sur la grille fine
  // (pas h), l'effort à la base k1·u1, les maxima des déplacements, des glissements et des efforts d'étage, et
  // Sd de chaque mode (max |qj|).
  function temporel({ k }, md, acc, dt, { xi = 0.05, n = md.length, sousPas = null } = {}) {
    const s = sousPas || Math.max(...md.slice(0, n).map(x => Spectre.sousPas(dt, x.T))), h = dt / s;
    const fin = Spectre.surEchantillonner(acc, s), N = k.length, L = fin.length;
    const u = Array.from({ length: N }, () => new Float64Array(L)), Sd = [];
    for (let j = 0; j < n; j++) {
      const { x } = Oscillateur.integrer(fin, h, 1 / md[j].T, xi);
      let sd = 0;
      for (let t = 0; t < L; t++) {
        const qj = x[t];
        sd = Math.max(sd, Math.abs(qj));
        for (let i = 0; i < N; i++) u[i][t] += md[j].gamma * md[j].phi[i] * qj;
      }
      Sd.push(sd);
    }
    const base = Float64Array.from(u[0], x => k[0] * x), dMax = new Array(N).fill(0), VMax = new Array(N).fill(0), uMax = new Array(N).fill(0);
    for (let t = 0; t < L; t++) for (let i = 0; i < N; i++) {
      const d = u[i][t] - (i ? u[i - 1][t] : 0);
      dMax[i] = Math.max(dMax[i], Math.abs(d)); VMax[i] = Math.max(VMax[i], Math.abs(d * k[i])); uMax[i] = Math.max(uMax[i], Math.abs(u[i][t]));
    }
    return { h, u, base, uMax, dMax, VMax, Sd };
  }

  return { cotes, jacobi, rigidite, modes, statique, periodeDeplacement, periodeRayleigh, forcesLaterales, forcesLateralesPermises, reponseModale, rhoCQC, combiner, modesRetenus, independants, spectrale, verifications, temporel };
})();
export default Batiment;
