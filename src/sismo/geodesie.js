import Sismo from './signal.js';

// src/sismo/geodesie.js — modèle géodésique de sismicité : vitesses GNSS, taux de déformation par
// moindres carrés, taux de moment de Kostrov, loi de Gutenberg-Richter équilibrée en moment.
// Unités : km, mm/an, déformations en nanodéformation par an (ns/an = 1e-9/an), moments en N·m/an.
// Conventions vérifiées contre OpenQuake : invariants de GeodeticStrain (HMTK), moment et a des
// TruncatedGRMFD (_get_total_moment_rate, _set_a). Solveurs purs.
const Geodesie = (() => {
  'use strict';

  // ── Champ de vitesses vrai : il ne dépend que de x (profil E–O) ──
  // - faille décrochante dextre N–S en x = xf, bloquée de la surface à D km et glissant en
  //   profondeur à s mm/an (Savage et Burford, 1973) : vN = −(s/π)·arctan((x − xf)/D) ;
  // - bande de raccourcissement E–O entre x0 et x1 : vE = −V·(x − x0)/(x1 − x0), bornée à [0, V] ;
  // - translation d'ensemble (repère de référence), sans effet sur la déformation.
  function champDefaut() {
    return { faille: { x: -10, s: 0.4, D: 12 }, bande: { x0: 95, x1: 215, V: 2.4 }, translation: { e: 0, n: 0 } };
  }
  function vitesse(x, y, c) {
    const { faille: f, bande: b, translation: t } = c;
    const r = Math.min(1, Math.max(0, (x - b.x0) / (b.x1 - b.x0)));
    return { e: t.e - b.V * r, n: t.n - (f.s / Math.PI) * Math.atan((x - f.x) / f.D) };
  }
  // Tenseur des taux de déformation vrai au point (ns/an) : 1 mm/an/km = 1000 ns/an.
  function deformation(x, y, c) {
    const { faille: f, bande: b } = c;
    const dvE = x > b.x0 && x < b.x1 ? -b.V / (b.x1 - b.x0) : 0;
    const dvN = -(f.s / Math.PI) * f.D / ((x - f.x) ** 2 + f.D ** 2);
    return { exx: 1000 * dvE, eyy: 0, exy: 500 * dvN, omega: 500 * dvN };
  }

  // ── Géométrie des zones (km) ──
  function dansPolygone(x, y, poly) {
    let dedans = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
  }
  const aire = poly => Math.abs(poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
  // Tenseur moyen sur la zone (intégration sur une grille de `pas` km) : c'est la vérité du générateur.
  function deformationMoyenne(c, poly, pas = 1) {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    let n = 0, exx = 0, eyy = 0, exy = 0;
    for (let y = Math.min(...ys) + pas / 2; y < Math.max(...ys); y += pas)
      for (let x = Math.min(...xs) + pas / 2; x < Math.max(...xs); x += pas)
        if (dansPolygone(x, y, poly)) { const d = deformation(x, y, c); exx += d.exx; eyy += d.eyy; exy += d.exy; n++; }
    return { exx: exx / n, eyy: eyy / n, exy: exy / n };
  }

  // ── Réseau GNSS simulé : stations tirées dans le domaine, bruit gaussien de σ mm/an par composante ──
  const DOMAINE = { x0: -120, x1: 240, y0: -120, y1: 150 };
  function genererReseau({ n = 70, sigma = 0.5, graine = 7, champ = champDefaut(), domaine = DOMAINE } = {}) {
    const u = Sismo.aleatoire(graine), stations = [];
    for (let i = 0; i < n; i++) {
      const x = u.entre(domaine.x0, domaine.x1), y = u.entre(domaine.y0, domaine.y1), v = vitesse(x, y, champ);
      stations.push({ id: 'G' + String(i + 1).padStart(3, '0'), x, y, eVrai: v.e, nVrai: v.n, e: v.e + sigma * u.gauss(), n: v.n + sigma * u.gauss(), sigma });
    }
    return stations;
  }

  // ── Taux de déformation uniforme par moindres carrés : v = v0 + L·(r − r̄), séparément sur E et N ──
  function inverse3(m) {
    const [[a, b, c], [d, e, f], [g, h, i]] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
      [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
      [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  // Renvoie le tenseur (ns/an), la rotation, la covariance de (exx, eyy, exy) et le χ² réduit ; null si
  // moins de trois stations ou stations alignées. `vrai: true` ajuste les vitesses sans bruit.
  function ajuster(stations, { vrai = false } = {}) {
    const n = stations.length;
    if (n < 3) return null;
    const w = stations.map(s => 1 / (s.sigma * s.sigma)), W = w.reduce((a, b) => a + b, 0);
    const cx = stations.reduce((s, p, i) => s + w[i] * p.x, 0) / W, cy = stations.reduce((s, p, i) => s + w[i] * p.y, 0) / W;
    const N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bE = [0, 0, 0], bN = [0, 0, 0];
    stations.forEach((s, i) => {
      const r = [1, s.x - cx, s.y - cy], ve = vrai ? s.eVrai : s.e, vn = vrai ? s.nVrai : s.n;
      for (let j = 0; j < 3; j++) { bE[j] += w[i] * r[j] * ve; bN[j] += w[i] * r[j] * vn; for (let k = 0; k < 3; k++) N[j][k] += w[i] * r[j] * r[k]; }
    });
    const Q = inverse3(N);
    if (!Q || Q[1][1] * Q[2][2] - Q[1][2] * Q[2][1] > 1e6) return null;
    const pE = Q.map(l => l[0] * bE[0] + l[1] * bE[1] + l[2] * bE[2]), pN = Q.map(l => l[0] * bN[0] + l[1] * bN[1] + l[2] * bN[2]);
    // L en mm/an/km → ns/an
    const Lee = 1000 * pE[1], Len = 1000 * pE[2], Lne = 1000 * pN[1], Lnn = 1000 * pN[2];
    let chi2 = 0;
    stations.forEach((s, i) => {
      const dx = s.x - cx, dy = s.y - cy;
      chi2 += w[i] * ((s.e - (pE[0] + pE[1] * dx + pE[2] * dy)) ** 2 + (s.n - (pN[0] + pN[1] * dx + pN[2] * dy)) ** 2);
    });
    // Covariance (ns/an)² : var(Lee) = Q11, cov(Lee, Len) = Q12… ; E et N indépendants.
    const k = 1e6, cov = [
      [k * Q[1][1], 0, k * Q[1][2] / 2],
      [0, k * Q[2][2], k * Q[2][1] / 2],
      [k * Q[1][2] / 2, k * Q[2][1] / 2, k * (Q[2][2] + Q[1][1]) / 4],
    ];
    return { n, centre: { x: cx, y: cy }, v0: { e: pE[0], n: pN[0] }, exx: Lee, eyy: Lnn, exy: (Len + Lne) / 2, omega: (Lne - Len) / 2, cov, chi2r: n > 3 ? chi2 / (2 * n - 6) : NaN };
  }

  // ── Invariants (mêmes définitions que GeodeticStrain d'HMTK) et axes principaux ──
  function principales({ exx, eyy, exy }) {
    const c = (exx + eyy) / 2, r = Math.hypot((exx - eyy) / 2, exy);
    // Azimut (degrés depuis le nord, sens horaire) de l'axe de raccourcissement maximal e1h
    const theta = 0.5 * Math.atan2(2 * exy, exx - eyy) * 180 / Math.PI;
    let azMin = (90 - (theta + 90)) % 180;
    if (azMin < 0) azMin += 180;
    return { e1h: c - r, e2h: c + r, deuxiemeInvariant: Math.sqrt(exx * exx + eyy * eyy + 2 * exy * exy), dilatation: exx + eyy, err: -(exx + eyy), cisaillementMax: r, azimutRaccourcissement: azMin };
  }

  // Écarts types de ε̇1h et ε̇2h par propagation linéaire de la covariance de (exx, eyy, exy).
  // Peu fiable quand le cisaillement r est de l'ordre de son incertitude (les axes tournent).
  function incertitudePrincipales(aj) {
    const r = Math.hypot((aj.exx - aj.eyy) / 2, aj.exy) || 1e-12, C = aj.cov;
    const g1 = [0.5 - (aj.exx - aj.eyy) / (4 * r), 0.5 + (aj.exx - aj.eyy) / (4 * r), -aj.exy / r];
    const g2 = [0.5 + (aj.exx - aj.eyy) / (4 * r), 0.5 - (aj.exx - aj.eyy) / (4 * r), aj.exy / r];
    const q = g => Math.sqrt(g.reduce((s, gi, i) => s + gi * g.reduce((t, gj, j) => t + C[i][j] * gj, 0), 0));
    return { e1h: q(g1), e2h: q(g2) };
  }

  // ── Taux de moment ──
  // Kostrov (1974), sous la forme de Savage et Simpson (1997) : Ṁ0 = 2μHA·max(|ε̇1|, |ε̇2|, |ε̇1 + ε̇2|).
  // μ en Pa, H en km, A en km², tenseur en ns/an → N·m/an.
  function momentKostrov(t, { mu = 3e10, H = 15, A }) {
    const { e1h, e2h } = principales(t);
    return 2 * mu * H * 1e3 * A * 1e6 * Math.max(Math.abs(e1h), Math.abs(e2h), Math.abs(e1h + e2h)) * 1e-9;
  }
  // Faille : Ṁ0 = μ·L·W·s (L, W en km, s en mm/an).
  const momentFaille = ({ mu = 3e10, L, W, s }) => mu * L * 1e3 * W * 1e3 * s * 1e-3;
  // Incertitude par tirages de (exx, eyy, exy) selon la covariance de l'ajustement : quantiles du moment.
  // Le moment est une valeur absolue : quand le bruit domine, sa médiane est biaisée vers le haut.
  function momentTires(aj, opts, { n = 4000, graine = 11 } = {}) {
    const C = aj.cov, u = Sismo.aleatoire(graine);
    // Cholesky 3×3
    const l11 = Math.sqrt(Math.max(C[0][0], 0)), l21 = l11 ? C[1][0] / l11 : 0, l31 = l11 ? C[2][0] / l11 : 0;
    const l22 = Math.sqrt(Math.max(C[1][1] - l21 * l21, 0)), l32 = l22 ? (C[2][1] - l31 * l21) / l22 : 0;
    const l33 = Math.sqrt(Math.max(C[2][2] - l31 * l31 - l32 * l32, 0));
    const m = [];
    for (let i = 0; i < n; i++) {
      const z1 = u.gauss(), z2 = u.gauss(), z3 = u.gauss();
      m.push(momentKostrov({ exx: aj.exx + l11 * z1, eyy: aj.eyy + l21 * z1 + l22 * z2, exy: aj.exy + l31 * z1 + l32 * z2 + l33 * z3 }, opts));
    }
    m.sort((a, b) => a - b);
    const q = p => m[Math.min(n - 1, Math.floor(p * n))];
    return { q16: q(0.16), q50: q(0.5), q84: q(0.84), moyenne: m.reduce((s, v) => s + v, 0) / n };
  }

  // ── Magnitude de moment (Hanks et Kanamori, 1979) ──
  const moment = M => Math.pow(10, 1.5 * M + 9.05);
  const magnitude = M0 => (Math.log10(M0) - 9.05) / 1.5;

  // ── Gutenberg-Richter tronquée et moment (comme TruncatedGRMFD d'OpenQuake) ──
  // Taux de moment de la loi continue entre mmin et mmax : (10^ai / bi)·(10^(bi·mmax) − 10^(bi·mmin)),
  // ai = a + log10(b) + 9,05, bi = 1,5 − b.
  function momentGR({ a, b, mmin, mmax }) {
    const ai = 9.05 + a + Math.log10(b), bi = 1.5 - b;
    return bi === 0 ? Math.pow(10, ai) * (mmax - mmin) : (Math.pow(10, ai) / bi) * (Math.pow(10, bi * mmax) - Math.pow(10, bi * mmin));
  }
  // Valeur a qui libère le taux de moment donné (TruncatedGRMFD._set_a).
  function aDepuisMoment({ moment: tmr, b, mmin, mmax }) {
    const bi = 1.5 - b;
    return bi === 0 ? Math.log10(tmr / (mmax - mmin)) - 9.05 - Math.log10(b)
      : Math.log10((tmr * bi) / (Math.pow(10, bi * mmax) - Math.pow(10, bi * mmin))) - 9.05 - Math.log10(b);
  }
  // Taux annuel des séismes de magnitude ≥ M pour la loi tronquée à mmax.
  const tauxGR = ({ a, b, mmax }, M) => (M >= mmax ? 0 : Math.pow(10, a - b * M) - Math.pow(10, a - b * mmax));

  // Bilan d'une zone : moment géodésique, part sismique χ, loi équilibrée en moment.
  function bilanZone({ tenseur, A, mu = 3e10, H = 15, chi, b, mmin, mmax }) {
    const momentGeo = momentKostrov(tenseur, { mu, H, A }), momentSismique = chi * momentGeo;
    const a = aDepuisMoment({ moment: momentSismique, b, mmin, mmax });
    return { momentGeo, momentSismique, a, b, mmin, mmax, taux: M => tauxGR({ a, b, mmax }, M) };
  }

  // Taux de moment géodésiques vrais des zones (tenseur moyen du générateur), pour le modèle d'école.
  function momentsVrais(polygones, { champ = champDefaut(), mu = 3e10, H = 15 } = {}) {
    return polygones.map(p => momentKostrov(deformationMoyenne(champ, p), { mu, H, A: aire(p) }));
  }

  return { champDefaut, vitesse, deformation, dansPolygone, aire, deformationMoyenne, DOMAINE, genererReseau, ajuster, principales, incertitudePrincipales, momentKostrov, momentFaille, momentTires, moment, magnitude, momentGR, aDepuisMoment, tauxGR, bilanZone, momentsVrais };
})();
export default Geodesie;
