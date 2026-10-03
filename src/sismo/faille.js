// src/sismo/faille.js — sources de faille à ruptures étendues : faille simple (trace rectiligne, pendage,
// profondeurs du haut et du bas), maillage et ruptures flottantes comme SimpleFaultSource d'OpenQuake,
// loi d'échelle de Wells et Coppersmith (1994), distances de Joyner-Boore et à la rupture.
// Coordonnées en km (x vers l'est, y vers le nord, z en profondeur). Solveurs purs.
const Faille = (() => {
  'use strict';
  const RAD = Math.PI / 180;
  const arrondiPython = x => (Math.abs(x - Math.trunc(x)) === 0.5 ? 2 * Math.round(x / 2) : Math.round(x));

  // Aire médiane de rupture (km²), Wells et Coppersmith (1994), comme WC1994 d'hazardlib.
  function aireWC1994(M, rake) {
    if (rake === null || rake === undefined) return Math.pow(10, -3.49 + 0.91 * M);
    if ((rake >= -45 && rake <= 45) || rake >= 135 || rake <= -135) return Math.pow(10, -3.42 + 0.90 * M); // décrochement
    if (rake > 0) return Math.pow(10, -3.99 + 0.98 * M); // inverse
    return Math.pow(10, -2.87 + 0.82 * M); // normale
  }
  // Magnitude dont l'aire médiane couvre toute la faille.
  function magnitudeFailleEntiere(aire, rake) {
    if ((rake >= -45 && rake <= 45) || rake >= 135 || rake <= -135) return (Math.log10(aire) + 3.42) / 0.90;
    return rake > 0 ? (Math.log10(aire) + 3.99) / 0.98 : (Math.log10(aire) + 2.87) / 0.82;
  }

  // Maillage : colonnes tous les `pas` km le long de la trace, rangées tous les `pas` km le long du pendage
  // (azimut du pendage = direction + 90°, règle de la main droite).
  function geometrie(f, pas = 1) {
    const [[x0, y0], [x1, y1]] = f.trace, Lt = Math.hypot(x1 - x0, y1 - y0);
    const s = [(x1 - x0) / Lt, (y1 - y0) / Lt], d = [s[1], -s[0]]; // d : horizontal, vers le pendage
    const p = f.pendage * RAD, largeur = (f.zBas - f.zHaut) / Math.sin(p);
    const nCols = arrondiPython(Lt / pas) + 1, nRangs = arrondiPython(largeur / pas) + 1;
    const decalageHaut = f.zHaut / Math.tan(p);
    return { x0, y0, s, d, p, pas, nCols, nRangs, L: (nCols - 1) * pas, W: (nRangs - 1) * pas, decalageHaut, zHaut: f.zHaut,
      aire: (nCols - 1) * pas * (nRangs - 1) * pas };
  }
  // Point du maillage (colonne c, rang r) : { x, y, z }.
  function noeud(g, c, r) {
    const a = c * g.pas, h = g.decalageHaut + r * g.pas * Math.cos(g.p), z = g.zHaut + r * g.pas * Math.sin(g.p);
    return { x: g.x0 + a * g.s[0] + h * g.d[0], y: g.y0 + a * g.s[1] + h * g.d[1], z };
  }

  // Dimensions d'une rupture de magnitude M en nombre de nœuds (comme _get_rupture_dimensions).
  function dimensions(g, M, rake, rapport = 1) {
    const aire = aireWC1994(M, rake);
    let L = Math.sqrt(aire * rapport), W = aire / L;
    if (aire >= g.L * g.W) { L = g.L; W = g.W; }
    else if (W > g.W) { L = L * (W / g.W); W = g.W; }
    else if (L > g.L) { W = W * (L / g.L); L = g.L; }
    return { cols: arrondiPython(L / g.pas) + 1, rangs: arrondiPython(W / g.pas) + 1 };
  }
  // Ruptures flottantes : toutes les positions (colonne et rang de départ) d'une rupture de magnitude M.
  // Le taux de la classe se partage également entre elles.
  function ruptures(g, M, rake, rapport = 1) {
    const { cols, rangs } = dimensions(g, M, rake, rapport), out = [];
    for (let r0 = 0; r0 <= g.nRangs - rangs; r0++) for (let c0 = 0; c0 <= g.nCols - cols; c0++) out.push({ c0, r0, cols, rangs });
    return out;
  }

  // Distance d'un point du plan à un segment.
  function distSegment(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
    return Math.hypot(px - ax - t * vx, py - ay - t * vy);
  }
  // Coins de la rupture (rectangle du maillage) : haut-début, haut-fin, bas-fin, bas-début.
  function coins(g, rup) {
    const c1 = rup.c0 + rup.cols - 1, r1 = rup.r0 + rup.rangs - 1;
    return [noeud(g, rup.c0, rup.r0), noeud(g, c1, rup.r0), noeud(g, c1, r1), noeud(g, rup.c0, r1)];
  }
  // Distance de Joyner-Boore : à la projection en surface de la rupture (nulle au-dessus). Comme OpenQuake,
  // à moins de 40 km la projection est dilatée de 5 m (DIST_TOLERANCE de geo.mesh) : sans effet pratique,
  // mais la queue de la loi normale tronquée, aux niveaux extrêmes, y est sensible.
  const TOLERANCE = 0.005;
  function rjb(g, rup, site) {
    const d = rjbGeometrique(g, rup, site);
    return d < 40 ? Math.max(0, d - TOLERANCE) : d;
  }
  function rjbGeometrique(g, rup, site) {
    const q = coins(g, rup);
    // dans le parallélogramme projeté ? (coordonnées le long de la direction et du pendage)
    const ux = site.x - q[0].x, uy = site.y - q[0].y, a = ux * g.s[0] + uy * g.s[1], b = ux * g.d[0] + uy * g.d[1];
    const La = (rup.cols - 1) * g.pas, Lb = (rup.rangs - 1) * g.pas * Math.cos(g.p);
    if (a >= 0 && a <= La && b >= 0 && b <= Lb + 1e-12 && Lb > 1e-9) return 0;
    let dmin = Infinity;
    for (let i = 0; i < 4; i++) { const p1 = q[i], p2 = q[(i + 1) % 4]; dmin = Math.min(dmin, distSegment(site.x, site.y, p1.x, p1.y, p2.x, p2.y)); }
    return dmin;
  }
  // Distance à la rupture (plus courte distance au rectangle en 3D, site en surface).
  function rrup(g, rup, site) {
    const q = coins(g, rup), P = [site.x, site.y, 0], O = [q[0].x, q[0].y, q[0].z];
    const e1 = [q[1].x - q[0].x, q[1].y - q[0].y, q[1].z - q[0].z], e2 = [q[3].x - q[0].x, q[3].y - q[0].y, q[3].z - q[0].z];
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], w = [P[0] - O[0], P[1] - O[1], P[2] - O[2]];
    const l1 = dot(e1, e1), l2 = dot(e2, e2);
    const t1 = l1 ? Math.max(0, Math.min(1, dot(w, e1) / l1)) : 0, t2 = l2 ? Math.max(0, Math.min(1, dot(w, e2) / l2)) : 0;
    const X = [O[0] + t1 * e1[0] + t2 * e2[0], O[1] + t1 * e1[1] + t2 * e2[1], O[2] + t1 * e1[2] + t2 * e2[2]];
    return Math.hypot(P[0] - X[0], P[1] - X[1], P[2] - X[2]);
  }

  // Rrup comme OpenQuake : plus courte distance en ligne droite aux nœuds du maillage, sur la Terre
  // sphérique (rayon 6371 km, positions en degrés sur l'équateur : 1° = 6371·π/180 km).
  const RT = 6371, KM_DEG = RT * RAD;
  function cartesien(x, y, z) {
    const lon = (x / KM_DEG) * RAD, lat = (y / KM_DEG) * RAD, r = RT - z;
    return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
  }
  function rrupSphere(g, rup, site) {
    const S = cartesien(site.x, site.y, 0);
    let d2 = Infinity;
    for (let r = rup.r0; r < rup.r0 + rup.rangs; r++) for (let c = rup.c0; c < rup.c0 + rup.cols; c++) {
      const n = noeud(g, c, r), P = cartesien(n.x, n.y, n.z);
      d2 = Math.min(d2, (P[0] - S[0]) ** 2 + (P[1] - S[1]) ** 2 + (P[2] - S[2]) ** 2);
    }
    return Math.sqrt(d2);
  }

  // Taux de moment de la faille : μ·L·W·s (aire du maillage, s en mm/an, μ en Pa) → N·m/an.
  const moment = (g, s, mu = 3e10) => mu * g.aire * 1e6 * s * 1e-3;

  return { aireWC1994, magnitudeFailleEntiere, geometrie, noeud, dimensions, ruptures, coins, rjb, rrup, rrupSphere, moment };
})();
export default Faille;
