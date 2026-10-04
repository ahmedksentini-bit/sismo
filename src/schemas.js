// Schémas de principe du cours : une figure par notion physique (ondes, foyer, faille, rupture, instrument…), en
// SVG pur, partagée par le cours et le polycopié. Les grandeurs qui se calculent sortent des solveurs (aires de
// Wells et Coppersmith, mécanismes) ; le reste est dessiné à l'échelle de la notion, sans prétendre à la mesure.
import { svg, texte, ligne, COULEURS } from "./figures.js";
import { ballon } from "./ballon.js";
import Faille from "./sismo/faille.js";
import Spectre from "./sismo/spectre.js";
import Gmpe from "./sismo/gmpe.js";
import Psha from "./sismo/psha.js";
import Batiment from "./sismo/batiment.js";

const RAD = Math.PI / 180;
const chemin = (pts, ferme = false) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("") + (ferme ? "Z" : "");
const titre = (x, y, s, ancre = "start") => texte(x, y, s, `text-anchor="${ancre}" style="font-size:12.5px;font-weight:800"`);
const note = (x, y, s, ancre = "start") => texte(x, y, s, `text-anchor="${ancre}" class="pt"`);
const etiquette = (x, y, s, couleur = COULEURS.encre, ancre = "start", taille = 11.5) =>
  texte(x, y, s, `text-anchor="${ancre}" class="halo" style="font-size:${taille}px;font-weight:700;fill:${couleur}"`);
const fleche = (id, x1, y1, x2, y2, couleur = COULEURS.effort, ep = 2, marque = "fl") =>
  ligne(x1, y1, x2, y2, couleur, ep, `marker-end="url(#${id}-${marque})"`);
const doubleFleche = (id, x1, y1, x2, y2, couleur = COULEURS.cote) =>
  ligne(x1, y1, x2, y2, couleur, 1.4, `marker-start="url(#${id}-fc)" marker-end="url(#${id}-fc)"`);
const etoile = (x, y, r = 8) => {
  const p = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.45 : r; p.push([x + q * Math.cos(a), y + q * Math.sin(a)]); }
  return `<path d="${chemin(p, true)}" fill="${COULEURS.effort}" stroke="#fff" stroke-width="1"/>`;
};
const station = (x, y, couleur = COULEURS.reaction) => `<path d="M${x.toFixed(1)} ${(y - 9).toFixed(1)}l7 12h-14z" fill="${couleur}" stroke="#fff" stroke-width="1"/>`;

/** Insère un SVG complet dans un autre, à la position et à la largeur données. */
function imbriquer(s, x, y, largeur) {
  const [, , w, h] = s.match(/viewBox="([\d.\s-]+)"/)[1].trim().split(/\s+/).map(Number);
  // le style en ligne l'emporte sur les règles de page (.figure-cours svg : largeur 100 %, bordure)
  const H = ((largeur * h) / w).toFixed(1), L = largeur.toFixed(1);
  return s.replace(/^<svg /, `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${L}" height="${H}" style="width:${L}px;height:${H}px;border:0;border-radius:0;background:none" `);
}

// ── Chapitre 1 : les quatre ondes ─────────────────────────────────────────

/**
 * Déformation d'un maillage de roche au passage des ondes P, S, de Rayleigh et de Love (déplacements exagérés).
 * P et S en coupe verticale ; Rayleigh en coupe, amplitude décroissant avec la profondeur, mouvement elliptique
 * rétrograde en surface ; Love vue de dessus (cisaillement horizontal).
 */
export function ondes({ largeur = 560 } = {}) {
  const pw = 262, ph = 112, mx = 14, haut = 30, gy = 64;
  const panneaux = [
    { nom: "Ondes P", texte: "compression et dilatation dans le sens de propagation", u: (x, z, k) => [Math.sin(k * x), 0], mouv: "h" },
    { nom: "Ondes S", texte: "cisaillement perpendiculaire à la propagation", u: (x, z, k) => [0, Math.sin(k * x)], mouv: "v" },
    { nom: "Ondes de Rayleigh", texte: "ellipse rétrograde, décroît avec la profondeur", u: (x, z, k) => { const e = Math.exp(-z / 55); return [e * Math.sin(k * x), -1.4 * e * Math.cos(k * x)]; }, mouv: "e" },
    { nom: "Ondes de Love", texte: "cisaillement horizontal (vue de dessus)", u: (x, z, k) => [0, Math.sin(k * x) * Math.exp(-z / 200)], mouv: "v", dessus: true },
  ];
  return svg({
    largeur, hauteur: 2 * (ph + gy) + 8, titre: "Les quatre ondes sismiques", contenu: (id) => {
      let s = "";
      panneaux.forEach((p, n) => {
        const ox = mx + (n % 2) * (pw + 8), oy = haut + Math.floor(n / 2) * (ph + gy), k = (2 * Math.PI) / 130, A = 9;
        s += titre(ox, oy - 12, p.nom) + note(ox, oy + ph + 18, p.texte);
        s += `<rect x="${ox}" y="${oy}" width="${pw}" height="${ph}" fill="${p.dessus ? "#eef2f7" : "#fde7c7"}" rx="3"/>`;
        if (!p.dessus) s += ligne(ox, oy, ox + pw, oy, "#8b5a2b", 2);
        // maillage déformé : lignes « horizontales » et « verticales » passant par les nœuds déplacés
        const nx = 27, nz = 6, dx = pw / nx, dz = ph / nz, pt = (i, j) => {
          const x = i * dx, z = j * dz, [ux, uz] = p.u(x, z, k);
          return [ox + x + A * ux, oy + z + A * uz];
        };
        let m = "";
        for (let j = 0; j <= nz; j++) m += chemin(Array.from({ length: nx + 1 }, (_, i) => pt(i, j)));
        for (let i = 0; i <= nx; i++) m += chemin(Array.from({ length: nz + 1 }, (_, j) => pt(i, j)));
        s += `<path d="${m}" fill="none" stroke="#8b5a2b" stroke-width="0.8" opacity="0.75"/>`;
        // sens de propagation et mouvement d'une particule
        s += fleche(id, ox + pw - 92, oy - 7, ox + pw - 4, oy - 7, COULEURS.bleu, 1.6, "fb") + note(ox + pw - 96, oy - 3, "propagation", "end");
        const px = ox + pw * 0.5, py = oy + 16;
        if (p.mouv === "h") s += doubleFleche(id, px - 14, py + 18, px + 14, py + 18, COULEURS.effort);
        if (p.mouv === "v") s += doubleFleche(id, px, py + 2, px, py + 34, COULEURS.effort);
        if (p.mouv === "e") {
          s += `<ellipse cx="${px}" cy="${py + 8}" rx="9" ry="13" fill="none" stroke="${COULEURS.effort}" stroke-width="1.6"/>`;
          s += `<path d="M${px - 3} ${py - 5}l-7 0 5 5" fill="none" stroke="${COULEURS.effort}" stroke-width="1.6"/>`;
        }
      });
      return s;
    },
  });
}

// ── Chapitre 2 : profondeur et lacune azimutale ───────────────────────────

/** Coupe verticale : épicentre, foyer, station ; distances épicentrale Δ, hypocentrale R et profondeur h. */
export function profondeurStation({ largeur = 560 } = {}) {
  const sy = 58, ex = 120, sx = 452, fy = 196;
  return svg({
    largeur, hauteur: 236, titre: "Distance épicentrale, distance hypocentrale et profondeur", contenu: (id) => {
      let s = `<rect x="0" y="${sy}" width="${largeur}" height="${236 - sy}" fill="#fde7c7"/>` + ligne(0, sy, largeur, sy, "#8b5a2b", 2.4);
      s += ligne(ex, sy, sx, sy, COULEURS.cote, 1.2, `marker-start="url(#${id}-fc)" marker-end="url(#${id}-fc)"`);
      s += etiquette((ex + sx) / 2, sy - 10, "Δ : distance épicentrale", COULEURS.cote, "middle");
      s += ligne(ex, sy, ex, fy, COULEURS.cote, 1.2, `stroke-dasharray="5 4"`) + etiquette(ex - 8, (sy + fy) / 2 + 4, "h : profondeur", COULEURS.cote, "end");
      s += `<path d="M${ex} ${sy + 12}h12v-12" fill="none" stroke="${COULEURS.cote}" stroke-width="1"/>`;
      s += ligne(ex, fy, sx, sy, COULEURS.effort, 2.2);
      s += etiquette((ex + sx) / 2 + 14, (sy + fy) / 2 + 22, "R = 8,4 × (S − P) : distance hypocentrale", COULEURS.effort);
      s += etoile(ex, fy, 10) + etiquette(ex + 14, fy + 18, "foyer (hypocentre)");
      s += `<circle cx="${ex}" cy="${sy}" r="4.5" fill="${COULEURS.effort}"/>` + etiquette(ex, sy - 28, "épicentre", COULEURS.encre, "middle");
      s += station(sx, sy - 1) + etiquette(sx, sy - 28, "station", COULEURS.reaction, "middle");
      s += `<text x="${largeur - 16}" y="${fy + 22}" text-anchor="end" style="font-size:15px;font-weight:800;fill:${COULEURS.encre}">h = √(R² − Δ²)</text>`;
      return s;
    },
  });
}

/** Vue en plan de deux réseaux : stations tout autour (petite lacune) ou d'un seul côté (grande lacune). */
export function lacune({ largeur = 560 } = {}) {
  const reseaux = [
    { titre: "Stations tout autour", az: [15, 85, 150, 215, 285], d: [0.8, 0.6, 0.9, 0.7, 0.85], ellipse: [10, 12, 0] },
    { titre: "Stations d'un seul côté", az: [25, 50, 80, 105], d: [0.75, 0.9, 0.65, 0.85], ellipse: [9, 34, 0] },
  ];
  const R = 96, cy = 166;
  return svg({
    largeur, hauteur: 304, titre: "La lacune azimutale", contenu: () => {
      let s = "";
      reseaux.forEach((r, n) => {
        const cx = 140 + n * 280, az = [...r.az].sort((a, b) => a - b);
        // plus grand secteur sans station
        let gap = 0, debut = 0;
        az.forEach((a, i) => { const b = i + 1 < az.length ? az[i + 1] : az[0] + 360; if (b - a > gap) { gap = b - a; debut = a; } });
        const P = (a, rr) => [cx + rr * Math.sin(a * RAD), cy - rr * Math.cos(a * RAD)];
        const arc = [];
        for (let a = debut; a <= debut + gap + 1e-9; a += gap / 40) arc.push(P(a, R + 12));
        s += `<path d="M${cx} ${cy}${chemin(arc).replace(/^M/, "L")}Z" fill="#fecaca" opacity="0.55"/>`;
        s += `<circle cx="${cx}" cy="${cy}" r="${R + 12}" fill="none" stroke="#cbd5e1" stroke-dasharray="3 3"/>`;
        s += texte(cx, cy - R - 20, "N", 'text-anchor="middle" style="font-weight:800"');
        const mil = debut + gap / 2, [lx, ly] = P(mil, R * 0.62);
        s += etiquette(lx, ly + 4, `lacune ${Math.round(gap)}°`, COULEURS.rouge, "middle");
        az.forEach((a, i) => { const [x, y] = P(a, R * r.d[r.az.indexOf(a)]); s += ligne(cx, cy, x, y, "#94a3b8", 0.8) + station(x, y + 4); void i; });
        // zone d'incertitude : allongée dans la direction de la lacune
        const [a1, b1] = r.ellipse;
        s += `<ellipse cx="${cx}" cy="${cy}" rx="${a1}" ry="${b1}" transform="rotate(${mil.toFixed(1)} ${cx} ${cy})" fill="rgba(220,38,38,.18)" stroke="${COULEURS.effort}" stroke-width="1.4"/>`;
        s += etoile(cx, cy, 7);
        s += titre(cx, 20, r.titre, "middle") + note(cx, 298, gap < 180 ? "épicentre bien contraint" : "incertitude allongée vers la lacune", "middle");
      });
      return s;
    },
  });
}

// ── Chapitre 3 : les trois angles et les trois types de failles ───────────

// Projection oblique : x vers l'est (droite), y vers le nord (fuyant en haut à droite), z vers le haut.
const projeter = (ox, oy, e = 1) => ([x, y, z]) => [ox + e * (x + 0.5 * y), oy - e * (z + 0.32 * y)];
const comb = (a, b, ka, kb) => a.map((v, i) => ka * v + kb * b[i]);

/** Bloc diagramme d'une faille : azimut φ depuis le nord, pendage δ, glissement λ du toit dans le plan. */
export function anglesFaille({ largeur = 560, phi = 35, delta = 50, lambda = 60 } = {}) {
  const P = projeter(40, 104, 1.4), f = phi * RAD, d = delta * RAD, l = lambda * RAD;
  const sv = [Math.sin(f), Math.cos(f), 0], dh = [Math.cos(f), -Math.sin(f), 0], bv = [Math.cos(d) * Math.cos(f), -Math.cos(d) * Math.sin(f), -Math.sin(d)];
  const O = [100, 60, 0], L = 150, W = 95, pt = (a, c) => O.map((v, i) => v + a * sv[i] + c * bv[i]);
  const arc = (centre, u, v, r, t1) => Array.from({ length: 25 }, (_, i) => { const t = (i / 24) * t1; return P(centre.map((c, j) => c + r * (Math.cos(t) * u[j] + Math.sin(t) * v[j]))); });
  return svg({
    largeur, hauteur: 262, titre: "Azimut, pendage et glissement d'une faille", contenu: (id) => {
      let s = "";
      // surface du sol
      const sol = [[0, 0, 0], [260, 0, 0], [260, 150, 0], [0, 150, 0]].map(P);
      s += `<path d="${chemin(sol, true)}" fill="#fde7c7" stroke="#8b5a2b" stroke-width="1.2"/>`;
      // plan de faille (toit enlevé) et trace
      const plan = [pt(-L / 2, 0), pt(L / 2, 0), pt(L / 2, W), pt(-L / 2, W)].map(P);
      s += `<path d="${chemin(plan, true)}" fill="rgba(148,163,184,.45)" stroke="#475569" stroke-width="1.2"/>`;
      s += `<path d="${chemin([P(pt(-L / 2, 0)), P(pt(L / 2, 0))])}" stroke="#8b5a2b" stroke-width="3"/>`;
      // nord et azimut φ, dans le plan horizontal
      const Nb = [30, 20, 0];
      s += fleche(id, ...P(Nb), ...P([30, 120, 0]), COULEURS.encre, 1.6, "fc") + etiquette(...P([30, 128, 0]), "N", COULEURS.encre, "middle");
      const A0 = pt(-L / 2 + 10, 0);
      s += ligne(...P(A0), ...P(A0.map((v, i) => v + 60 * [0, 1, 0][i])), "#64748b", 1, 'stroke-dasharray="4 3"');
      s += `<path d="${chemin(arc(A0, [0, 1, 0], [1, 0, 0], 38, f))}" fill="none" stroke="${COULEURS.bleu}" stroke-width="2"/>`;
      s += etiquette(...P(A0.map((v, i) => v + 44 * [Math.sin(f / 2), Math.cos(f / 2), 0][i])).map((q, i) => q + [0, -6][i]), "φ azimut", COULEURS.bleu, "end");
      // pendage δ : dans le plan vertical perpendiculaire à la trace
      const B0 = pt(L / 2 - 18, 0);
      s += ligne(...P(B0), ...P(B0.map((v, i) => v + 70 * dh[i])), "#64748b", 1, 'stroke-dasharray="4 3"');
      s += `<path d="${chemin(arc(B0, dh, [0, 0, -1], 40, d))}" fill="none" stroke="${COULEURS.violet}" stroke-width="2"/>`;
      s += etiquette(...P(B0.map((v, i) => v + 50 * dh[i])).map((q, i) => q + [4, 18][i]), "δ pendage", COULEURS.violet);
      // glissement λ : du sens de la trace au vecteur glissement du toit, dans le plan
      const C0 = pt(-10, W * 0.55), u = comb(sv, bv, Math.cos(l), -Math.sin(l));
      s += ligne(...P(C0), ...P(C0.map((v, i) => v + 62 * sv[i])), "#64748b", 1, 'stroke-dasharray="4 3"');
      s += `<path d="${chemin(arc(C0, sv, bv.map((v) => -v), 30, l))}" fill="none" stroke="${COULEURS.reaction}" stroke-width="2"/>`;
      s += fleche(id, ...P(C0), ...P(C0.map((v, i) => v + 48 * u[i])), COULEURS.effort, 2.6);
      s += etiquette(...P(C0.map((v, i) => v + 50 * u[i])).map((q, i) => q + [8, 4][i]), "glissement du toit", COULEURS.effort);
      s += etiquette(...P(C0.map((v, i) => v + 34 * comb(sv, bv, Math.cos(l / 2), -Math.sin(l / 2))[i])).map((q, i) => q + [6, 4][i]), "λ", COULEURS.reaction);
      s += etiquette(...P(pt(L / 2 + 4, W * 0.8)), "plan de faille", "#475569");
      s += note(largeur - 12, 254, `φ = ${phi}°, δ = ${delta}°, λ = ${lambda}° : faille inverse à composante de décrochement`, "end");
      return s;
    },
  });
}

/** Trois blocs diagrammes (faille normale, inverse, décrochement) et leurs sphères focales. */
export function typesFailles({ largeur = 560 } = {}) {
  const types = [
    { nom: "Faille normale", sous: "le toit descend : extension", delta: 60, x0: 52, lambda: -90 },
    { nom: "Faille inverse", sous: "le toit monte : compression", delta: 40, x0: 40, lambda: 90 },
    { nom: "Décrochement", sous: "coulissement horizontal (sénestre)", delta: 90, x0: 62, lambda: 0 },
  ];
  const W = 120, D = 70, H = 56, g = 14, col = (largeur - 2 * g) / 3;
  return svg({
    largeur, hauteur: 372, titre: "Les trois types de failles et leurs sphères focales", contenu: (id) => {
      let s = "";
      types.forEach((t, n) => {
        const d = t.delta * RAD, ox = g + n * col + 12, P = projeter(ox, 102, 1), cot = Math.cos(d) / Math.sin(d);
        const pied = [[0, 0], [t.x0, 0], [t.x0 + H * cot, -H], [0, -H]], toit = [[t.x0, 0], [W, 0], [W, -H], [t.x0 + H * cot, -H]];
        const g0 = 13, decal = t.lambda === 0 ? [0, g0, 0] : t.lambda < 0 ? [g0 * Math.cos(d), 0, -g0 * Math.sin(d)] : [-g0 * Math.cos(d), 0, g0 * Math.sin(d)];
        // prisme d'une section (x, z) extrudée selon y ; faces vues : avant, dessus, droite, plan de faille du mur
        const prisme = (poly, dep, fond, iFaille) => {
          const q = (x, y, z) => P([x + dep[0], y + dep[1], z + dep[2]]);
          let r = "";
          poly.forEach(([x1, z1], i) => {
            // contour parcouru dans le sens horaire (z vers le haut) : normale extérieure (−dz, dx)
            const [x2, z2] = poly[(i + 1) % poly.length], nx = z1 - z2, nz = x2 - x1;
            if (0.5 * nx + 0.32 * nz <= 1e-9) return;
            const face = [q(x1, 0, z1), q(x2, 0, z2), q(x2, D, z2), q(x1, D, z1)];
            r += `<path d="${chemin(face, true)}" fill="${i === iFaille ? "#cbd5e1" : nz > 0.5 * Math.hypot(nx, nz) ? "#fbe3c0" : "#e9c99a"}" stroke="#8b5a2b" stroke-width="1"/>`;
          });
          r += `<path d="${chemin(poly.map(([x, z]) => q(x, 0, z)), true)}" fill="${fond}" stroke="#8b5a2b" stroke-width="1"/>`;
          return r;
        };
        s += prisme(pied, [0, 0, 0], "#f3d9b1", 1) + prisme(toit, decal, "#ecc996", 3);
        // trait de route sur le dessus, pour voir le décalage
        s += `<path d="${chemin([P([0, D / 2, 0]), P([t.x0, D / 2, 0])])}" stroke="#475569" stroke-width="2.4" stroke-dasharray="5 3"/>`;
        s += `<path d="${chemin([P([t.x0 + decal[0], D / 2 + decal[1], decal[2]]), P([W + decal[0], D / 2 + decal[1], decal[2]])])}" stroke="#475569" stroke-width="2.4" stroke-dasharray="5 3"/>`;
        // flèches du mouvement relatif sur la face avant
        if (t.lambda === 0) {
          s += fleche(id, ...P([(t.x0 + W) / 2 + 6, 6 + decal[1], 0]), ...P([(t.x0 + W) / 2 + 6, 64 + decal[1], 0]), COULEURS.effort, 1.5);
          s += fleche(id, ...P([t.x0 / 2 - 6, 64, 0]), ...P([t.x0 / 2 - 6, 6, 0]), COULEURS.effort, 1.5);
        } else {
          // demi-flèches de part et d'autre du plan : le toit (à l'est) et le mur glissent en sens opposés
          const m = [t.x0 + (H / 2) * cot, -H / 2], nrm = [Math.sin(d), Math.cos(d)], u = [Math.cos(d), -Math.sin(d)].map((v) => (t.lambda < 0 ? 1 : -1) * v * 24);
          const c1 = [m[0] + decal[0] + 11 * nrm[0], m[1] + decal[2] + 11 * nrm[1]], c2 = [m[0] - 11 * nrm[0], m[1] - 11 * nrm[1]];
          s += fleche(id, ...P([c1[0] - u[0] / 2, 0, c1[1] - u[1] / 2]), ...P([c1[0] + u[0] / 2, 0, c1[1] + u[1] / 2]), COULEURS.effort, 1.5);
          s += fleche(id, ...P([c2[0] + u[0] / 2, 0, c2[1] + u[1] / 2]), ...P([c2[0] - u[0] / 2, 0, c2[1] - u[1] / 2]), COULEURS.effort, 1.5);
        }
        const cx = g + n * col + col / 2;
        s += titre(cx, 22, t.nom, "middle") + note(cx, 190, t.sous, "middle");
        s += imbriquer(ballon({ mec: { azimut: 0, pendage: t.delta, glissement: t.lambda }, R: 60, axes: false, titre: `Sphère focale : ${t.nom.toLowerCase()}` }), cx - 70, 206, 140);
      });
      s += note(largeur / 2, 366, "Trace de la faille orientée nord–sud, plan plongeant vers l'est ; quadrants en compression teintés.", "middle");
      return s;
    },
  });
}

// ── Chapitre 4 : la taille des ruptures ───────────────────────────────────

/**
 * Ruptures médianes de Wells et Coppersmith (1994), toutes failles, à l'échelle : largeur limitée à 20 km
 * (épaisseur de la croûte sismogène), glissement moyen D = M0/(μA) avec μ = 30 GPa et M0 = 10^(1,5 Mw + 9,05).
 */
export function ruptures({ largeur = 560, magnitudes = [5, 6, 7, 8], Wmax = 20, mu = 3e10 } = {}) {
  const r = magnitudes.map((M) => {
    const A = Faille.aireWC1994(M), W = Math.min(Math.sqrt(A), Wmax), L = A / W, D = Math.pow(10, 1.5 * M + 9.05) / (mu * A * 1e6);
    return { M, A, L, W, D };
  });
  const g = 16, ech = (largeur - 2 * g - 8) / Math.max(...r.map((x) => x.L)), pas = 30 + Wmax * ech;
  const fr = (x, c = 2) => Number(x).toLocaleString("fr-FR", { maximumSignificantDigits: c });
  return svg({
    largeur, hauteur: 46 + r.length * pas + 30, titre: "Taille des ruptures selon la magnitude", contenu: () => {
      let s = "", y = 30;
      for (const x of r) {
        const w = Math.max(x.L * ech, 3), h = Math.max(x.W * ech, 3);
        s += `<rect x="${g}" y="${y + 16}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="rgba(220,38,38,.22)" stroke="${COULEURS.effort}" stroke-width="1.4"/>`;
        s += texte(g, y + 10, `Mw ${x.M} : ${fr(x.L)} km × ${fr(x.W)} km (${fr(x.A, 3)} km²), glissement moyen ${fr(x.D)} m`, 'style="font-size:12px;font-weight:700"');
        y += pas;
      }
      const b = 50 * ech;
      s += ligne(g, y + 6, g + b, y + 6, COULEURS.encre, 2) + ligne(g, y + 1, g, y + 11, COULEURS.encre, 1.4) + ligne(g + b, y + 1, g + b, y + 11, COULEURS.encre, 1.4);
      s += note(g + b + 8, y + 10, "50 km · Wells et Coppersmith (1994), largeur limitée à 20 km, μ = 30 GPa");
      return s;
    },
  });
}

// ── Chapitre 5 : le sismomètre ────────────────────────────────────────────

/** Sismomètre vertical de principe : bâti lié au sol, masse sur ressort et amortisseur, mouvement relatif x. */
export function sismometre({ largeur = 560 } = {}) {
  const sol = 250, bx = 150, bw = 200, top = 40;
  const ressort = (x, y1, y2, n = 9, a = 10) => {
    const p = [[x, y1], [x, y1 + 8]];
    for (let i = 0; i < n; i++) p.push([x + (i % 2 ? -a : a), y1 + 8 + ((i + 0.5) * (y2 - y1 - 16)) / n]);
    p.push([x, y2 - 8], [x, y2]);
    return `<path d="${chemin(p)}" fill="none" stroke="${COULEURS.trait}" stroke-width="1.8"/>`;
  };
  return svg({
    largeur, hauteur: 300, titre: "Principe du sismomètre", contenu: (id) => {
      let s = `<rect x="0" y="${sol}" width="${largeur}" height="50" fill="#e9c99a"/>` + ligne(0, sol, largeur, sol, "#8b5a2b", 2.4);
      for (let x = 6; x < largeur; x += 14) s += ligne(x, sol + 4, x - 8, sol + 14, "#8b5a2b", 1);
      // bâti
      s += `<path d="M${bx} ${sol}V${top}H${bx + bw}V${sol}" fill="none" stroke="${COULEURS.trait}" stroke-width="5" stroke-linejoin="round"/>`;
      // ressort et amortisseur suspendant la masse
      const mx = bx + 60, my = 150, mw = 80, mh = 46;
      s += ressort(mx + 18, top + 2, my, 9, 9);
      const ax = mx + mw - 18;
      s += ligne(ax, top + 2, ax, my - 40, COULEURS.trait, 1.8) + `<rect x="${ax - 9}" y="${my - 44}" width="18" height="30" fill="#fff" stroke="${COULEURS.trait}" stroke-width="1.8"/>`;
      s += ligne(ax - 6, my - 30, ax + 6, my - 30, COULEURS.trait, 2.2) + ligne(ax, my - 30, ax, my, COULEURS.trait, 1.8);
      s += `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="4" fill="#475569"/>` + texte(mx + mw / 2, my + 28, "m", 'text-anchor="middle" style="font-size:16px;font-weight:800;fill:#fff"');
      s += etiquette(mx + 6, top + 50, "k", COULEURS.trait, "end", 13) + etiquette(ax + 14, my - 26, "c", COULEURS.trait, "start", 13);
      // style et tambour enregistreur liés au bâti
      s += ligne(mx + mw, my + mh / 2, bx + bw - 16, my + mh / 2, COULEURS.effort, 1.6);
      s += `<rect x="${bx + bw - 16}" y="${my - 30}" width="12" height="104" rx="5" fill="#fff" stroke="${COULEURS.trait}" stroke-width="1.4"/>`;
      s += `<path d="M${bx + bw - 12} ${my - 24}q3 10 0 20t0 20 0 20 0 20" fill="none" stroke="${COULEURS.effort}" stroke-width="1"/>`;
      // repère du mouvement relatif x
      s += ligne(mx - 26, my + mh / 2, mx - 6, my + mh / 2, "#94a3b8", 1, 'stroke-dasharray="3 2"');
      s += doubleFleche(id, mx - 16, my + mh / 2 - 22, mx - 16, my + mh / 2 + 22, COULEURS.effort);
      s += etiquette(mx - 22, my + mh / 2 + 4, "x", COULEURS.effort, "end", 14);
      // mouvement du sol
      s += doubleFleche(id, 60, sol - 60, 60, sol - 8, COULEURS.bleu) + etiquette(70, sol - 30, "ug : mouvement du sol", COULEURS.bleu);
      s += etiquette(bx + bw + 12, top + 16, "bâti : suit le sol", COULEURS.trait) + etiquette(bx + bw + 12, my + 6, "tambour lié au bâti :", COULEURS.trait);
      s += etiquette(bx + bw + 12, my + 22, "il enregistre x", COULEURS.trait) + etiquette(bx + bw + 12, my + 70, "masse : tarde à suivre", COULEURS.trait);
      s += texte(largeur / 2, 290, "ẍ + 2ξω₀ẋ + ω₀²x = −üg   avec ω₀ = √(k/m) et ξ = c/(2mω₀)", 'text-anchor="middle" style="font-size:13px;font-weight:700"');
      return s;
    },
  });
}


// ── Petits graphiques dans les schémas ────────────────────────────────────

/** Cadre de graphique compact : axes, graduations choisies, échelles linéaires ou logarithmiques. */
function cadre({ x0, y0, w, h, xmin, xmax, ymin, ymax, logX = false, logY = false, gx = [], gy = [], fx = String, fy = String, xlabel = "", ylabel = "" }) {
  const tx = logX ? (v) => (Math.log10(v) - Math.log10(xmin)) / (Math.log10(xmax) - Math.log10(xmin)) : (v) => (v - xmin) / (xmax - xmin);
  const ty = logY ? (v) => (Math.log10(v) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin)) : (v) => (v - ymin) / (ymax - ymin);
  const X = (v) => x0 + w * tx(v), Y = (v) => y0 + h - h * ty(v);
  let s = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff" stroke="#cbd5e1"/>`;
  for (const v of gx) s += ligne(X(v), y0, X(v), y0 + h, COULEURS.grille, 0.8) + note(X(v), y0 + h + 13, fx(v), "middle");
  for (const v of gy) s += ligne(x0, Y(v), x0 + w, Y(v), COULEURS.grille, 0.8) + note(x0 - 4, Y(v) + 4, fy(v), "end");
  if (xlabel) s += note(x0 + w / 2, y0 + h + 27, xlabel, "middle");
  if (ylabel) s += texte(x0 - 38, y0 + h / 2, ylabel, `class="pt" text-anchor="middle" transform="rotate(-90 ${x0 - 38} ${(y0 + h / 2).toFixed(1)})"`);
  const trace = (pts, couleur, ep = 2, attrs = "") => `<path d="${chemin(pts.map(([a, b]) => [X(a), Y(b)]))}" fill="none" stroke="${couleur}" stroke-width="${ep}" ${attrs}/>`;
  return { X, Y, s, trace };
}
const frs = (x, c = 2) => Number(x).toLocaleString("fr-FR", { maximumSignificantDigits: c });

// ── Chapitre 7 : une famille d'oscillateurs ───────────────────────────────

/** Oscillateurs de périodes croissantes sous le même séisme ; leurs maximums tracent le spectre (EC8, sol C). */
export function oscillateurs({ largeur = 560, periodes = [0.1, 0.4, 0.8, 1.4, 2.2, 3] } = {}) {
  const se = (T) => Spectre.ec8(T, { type: 1, sol: "C", ag: 0.2 });
  const c = cadre({ x0: 52, y0: 20, w: largeur - 70, h: 150, xmin: 0, xmax: 3.4, ymin: 0, ymax: 0.65, gx: [0, 0.5, 1, 1.5, 2, 2.5, 3], gy: [0, 0.2, 0.4, 0.6],
    fx: (v) => frs(v), fy: (v) => frs(v), xlabel: "période propre T (s)", ylabel: "Sa (g)" });
  const base = 330;
  return svg({
    largeur, hauteur: 372, titre: "Une famille d'oscillateurs donne le spectre de réponse", contenu: (id) => {
      let s = c.s + c.trace(Array.from({ length: 171 }, (_, i) => { const T = (i / 170) * 3.4; return [T, se(T)]; }), COULEURS.bleu, 2.4);
      s += `<rect x="${c.X(0) - 6}" y="${base}" width="${c.X(3.4) - c.X(0) + 12}" height="9" rx="3" fill="#94a3b8"/>`;
      s += doubleFleche(id, c.X(0) + 4, base + 22, c.X(0) + 60, base + 22, COULEURS.effort) + etiquette(c.X(0) + 66, base + 26, "mouvement du sol : le même pour tous", COULEURS.effort);
      for (const T of periodes) {
        const x = c.X(T), hT = 34 + 40 * Math.sqrt(T), y = se(T);
        s += ligne(x, base, x, base - hT, COULEURS.trait, 2) + `<circle cx="${x}" cy="${base - hT}" r="${6 + 2 * Math.sqrt(T)}" fill="#475569"/>`;
        s += ligne(x, base - hT - 10, x, c.Y(y), "#94a3b8", 1, 'stroke-dasharray="3 3"') + `<circle cx="${x}" cy="${c.Y(y)}" r="4.5" fill="${COULEURS.bleu}"/>`;
        s += note(x, base - hT - 14, `${frs(T)} s`, "middle");
      }
      s += etiquette(c.X(3.35), c.Y(0.6), "spectre : le maximum de chaque oscillateur", COULEURS.bleu, "end");
      return s;
    },
  });
}

// ── Chapitre 8 : nombre et énergie des séismes ────────────────────────────

/** Loi de Gutenberg-Richter (2 séismes M ≥ 4 par an, b = 1) et énergie rayonnée, log E = 1,5 M + 4,8. */
export function nombreEnergie({ largeur = 560, taux4 = 2, b = 1 } = {}) {
  const M = [3, 4, 5, 6, 7], lam = (m) => taux4 * Math.pow(10, -b * (m - 4));
  const c = cadre({ x0: 60, y0: 34, w: 220, h: 190, xmin: 2.5, xmax: 7.5, ymin: 0.001, ymax: 100, logY: true, gx: M, gy: [0.001, 0.01, 0.1, 1, 10, 100],
    fx: (v) => `M ≥ ${v}`, fy: (v) => frs(v, 1), ylabel: "séismes par an" });
  const quand = (l) => (l >= 1 ? [`${frs(l)}`, "par an"] : ["1 tous les", `${frs(1 / l)} ans`]);
  return svg({
    largeur, hauteur: 290, titre: "Nombre et énergie des séismes selon la magnitude", contenu: () => {
      let s = titre(60, 20, "Combien ? Dix fois moins par degré") + c.s;
      for (const m of M) {
        const l = lam(m), x = c.X(m);
        s += `<rect x="${x - 15}" y="${c.Y(l)}" width="30" height="${c.Y(0.001) - c.Y(l)}" fill="rgba(3,105,161,.35)" stroke="${COULEURS.bleu}"/>`;
        quand(l).forEach((q, i) => { s += texte(x, c.Y(l) - 18 + 11 * i, q, 'text-anchor="middle" class="halo" style="font-size:9.5px;font-weight:700"'); });
      }
      // énergie : aires des disques proportionnelles à l'énergie rayonnée
      const E = (m) => Math.pow(10, 1.5 * m + 4.8), r5 = 1.9, cy = 140;
      s += titre(318, 20, "Quelle énergie ? 32 fois plus par degré");
      let x = 336;
      for (const m of [5, 6, 7]) {
        const r = r5 * Math.sqrt(E(m) / E(5));
        s += `<circle cx="${x + r}" cy="${cy}" r="${r}" fill="rgba(220,38,38,.25)" stroke="${COULEURS.effort}" stroke-width="1.4"/>`;
        s += texte(x + r, cy + Math.max(r, 6) + 16, `M ${m}`, 'text-anchor="middle" style="font-weight:800"');
        x += 2 * r + 14;
      }
      s += note(318, 262, "aire ∝ énergie : un M 7 libère autant");
      s += note(318, 276, "que 32 M 6 ou 1 000 M 5");
      return s;
    },
  });
}

// ── Chapitre 9 : le rebond élastique ──────────────────────────────────────

/** Rebond élastique (Reid, 1910) : une clôture qui traverse un décrochement bloqué en profondeur. */
export function rebond({ largeur = 560, D = 12 } = {}) {
  const pw = (largeur - 40) / 3, h = 190, y0 = 46, A = 46, xs = Array.from({ length: 121 }, (_, i) => -60 + i);
  const etapes = [
    { nom: "1. Juste après un séisme", u: () => 0, sous: ["la clôture est droite"] },
    { nom: "2. Des siècles plus tard", u: (x) => (A / Math.PI) * Math.atan(x / D), sous: ["les plaques ont avancé, la faille", "bloquée retient : la clôture se courbe"] },
    { nom: "3. Le séisme", u: (x) => (A / 2) * Math.sign(x), sous: ["la faille glisse d'un coup : la clôture", "se redresse, décalée"] },
  ];
  return svg({
    largeur, hauteur: 290, titre: "Le rebond élastique", contenu: (id) => {
      let s = "";
      etapes.forEach((e, n) => {
        const ox = 10 + n * (pw + 10), cx = ox + pw / 2, cy = y0 + h / 2, kx = (pw - 16) / 120;
        s += `<rect x="${ox}" y="${y0}" width="${pw}" height="${h}" rx="4" fill="#fdf2e0" stroke="#e2c9a0"/>`;
        s += ligne(cx, y0, cx, y0 + h, COULEURS.effort, 2, 'stroke-dasharray="7 4"');
        const pts = xs.map((x) => [cx + x * kx, cy - e.u(x)]);
        if (n === 2) s += `<path d="${chemin(pts.filter(([x]) => x < cx))}" fill="none" stroke="#475569" stroke-width="3"/><path d="${chemin(pts.filter(([x]) => x > cx))}" fill="none" stroke="#475569" stroke-width="3"/>`;
        else s += `<path d="${chemin(pts)}" fill="none" stroke="#475569" stroke-width="3"/>`;
        if (n > 0) {
          s += fleche(id, ox + 16, y0 + 14, ox + 16, y0 + 44, COULEURS.bleu, 1.8, "fb") + fleche(id, ox + pw - 16, y0 + h - 14, ox + pw - 16, y0 + h - 44, COULEURS.bleu, 1.8, "fb");
        }
        if (n === 2) s += doubleFleche(id, cx + 10, cy - A / 2, cx + 10, cy + A / 2, COULEURS.effort);
        s += titre(cx, y0 - 22, e.nom, "middle");
        e.sous.forEach((l, i) => { s += note(cx, y0 + h + 18 + 14 * i, l, "middle"); });
      });
      s += note(largeur / 2, 286, `vue de dessus · faille (tirets rouges) bloquée sur ${D} km · flèches bleues : mouvement des plaques`, "middle");
      return s;
    },
  });
}

// ── Chapitre 10 : les quatre étapes de Cornell ────────────────────────────

/**
 * Les quatre étapes du calcul probabiliste (Cornell, 1968) sur le modèle simple du cours (Psha.modeleSimple :
 * zone circulaire de 100 km centrée sur le site, 1 séisme M ≥ 4 par an, b = 1, Mmax 6,5, trois lois moyennées).
 */
export function cornell({ largeur = 560 } = {}) {
  const pw = 216, ph = 120, g = 62, d = largeur - pw - 22;
  const modele = Psha.modeleSimple({ imts: ["PGA"] }), res = Psha.calculer(modele), N = res.niveaux, P50 = res.moyenne[0];
  const a475 = Psha.niveauPourProba(N, P50, 0.1);
  return svg({
    largeur, hauteur: 2 * ph + 150, titre: "Les quatre étapes du calcul probabiliste de l'aléa", contenu: () => {
      let s = "";
      // 1. sources
      const cx1 = g + pw / 2, cy1 = 32 + ph / 2;
      s += titre(g - 40, 22, "1. Sources : où, à quelle distance ?");
      s += `<circle cx="${cx1}" cy="${cy1}" r="${ph / 2 - 4}" fill="rgba(234,88,12,.12)" stroke="#ea580c" stroke-dasharray="5 3"/>`;
      for (let i = 0; i < 26; i++) { const a = i * 2.39996, r = (ph / 2 - 10) * Math.sqrt((i + 0.5) / 26); s += `<circle cx="${(cx1 + r * Math.cos(a)).toFixed(1)}" cy="${(cy1 + r * Math.sin(a)).toFixed(1)}" r="2.2" fill="${COULEURS.effort}"/>`; }
      s += station(cx1, cy1 + 4) + ligne(cx1, cy1, cx1 + 38, cy1 - 30, COULEURS.cote, 1.2) + etiquette(cx1 + 24, cy1 - 22, "R", COULEURS.cote);
      s += note(cx1, 32 + ph + 16, "zone de 100 km autour du site", "middle");
      // 2. récurrence
      const c2 = cadre({ x0: d, y0: 32, w: pw, h: ph, xmin: 4, xmax: 6.6, ymin: 0.001, ymax: 2, logY: true, gx: [4, 5, 6], gy: [0.001, 0.01, 0.1, 1], fy: (v) => frs(v, 1), xlabel: "magnitude M", ylabel: "λ(≥ M) par an" });
      s += titre(d - 40, 22, "2. Récurrence : combien de séismes ?") + c2.s;
      s += c2.trace(Array.from({ length: 51 }, (_, i) => { const m = 4 + (i / 50) * 2.5; return [m, Math.max(Math.pow(10, -(m - 4)) - Math.pow(10, -2.5), 1e-3)]; }), "#ea580c", 2.2);
      // 3. atténuation : médiane d'Akkar et al. (2014) en Rjb, sol à 800 m/s
      const y3 = 32 + ph + 64, loi = Gmpe.LOIS.akkar2014;
      const c3 = cadre({ x0: g, y0: y3, w: pw, h: ph, xmin: 1, xmax: 200, ymin: 0.002, ymax: 1, logX: true, logY: true, gx: [1, 10, 100], gy: [0.01, 0.1, 1], fx: (v) => frs(v), fy: (v) => frs(v), xlabel: "distance (km)", ylabel: "PGA (g)" });
      s += titre(g - 40, y3 - 10, "3. Atténuation : quel mouvement ?") + c3.s;
      const rs = Array.from({ length: 41 }, (_, i) => Math.pow(10, (i / 40) * Math.log10(200)));
      for (const [M, ep] of [[4.5, 1.2], [5.5, 1.6], [6.5, 2.2]]) {
        const med = rs.map((r) => [r, Math.exp(loi.calculer({ M, Rjb: r, vs30: 800 }, "PGA").ln)]);
        s += c3.trace(med, COULEURS.violet, ep);
        if (M === 6.5) {
          for (const k of [-1, 1]) s += c3.trace(rs.map((r) => { const q = loi.calculer({ M, Rjb: r, vs30: 800 }, "PGA"); return [r, Math.exp(q.ln + k * q.sigma)]; }), COULEURS.violet, 1, 'stroke-dasharray="4 3" opacity="0.7"');
        }
        s += etiquette(c3.X(1.3), c3.Y(Math.exp(loi.calculer({ M, Rjb: 1.3, vs30: 800 }, "PGA").ln)) - 5, `M ${frs(M)}`, COULEURS.violet, "start", 10.5);
      }
      // 4. courbe d'aléa
      const lam = N.map((y, i) => [y, -Math.log(1 - Math.min(P50[i], 1 - 1e-15)) / 50]).filter(([y, l]) => y >= 0.01 && y <= 1 && l >= 1e-5 && l <= 1);
      const c4 = cadre({ x0: d, y0: y3, w: pw, h: ph, xmin: 0.01, xmax: 1, ymin: 1e-5, ymax: 1, logX: true, logY: true, gx: [0.01, 0.1, 1], gy: [1e-4, 1e-3, 1e-2, 1e-1], fx: (v) => frs(v), fy: (v) => `10${["⁻⁴", "⁻³", "⁻²", "⁻¹"][Math.round(Math.log10(v)) + 4]}`, xlabel: "PGA y (g)", ylabel: "λ(PGA > y) par an" });
      s += titre(d - 40, y3 - 10, "4. Courbe d'aléa : combien de fois ?") + c4.s + c4.trace(lam, COULEURS.effort, 2.4);
      s += ligne(c4.X(0.01), c4.Y(1 / 475), c4.X(a475), c4.Y(1 / 475), COULEURS.cote, 1, 'stroke-dasharray="4 3"') + ligne(c4.X(a475), c4.Y(1 / 475), c4.X(a475), c4.Y(1e-5), COULEURS.cote, 1, 'stroke-dasharray="4 3"');
      s += etiquette(c4.X(a475) + 4, c4.Y(1 / 475) - 6, `475 ans → ${frs(a475)} g`, COULEURS.cote, "start", 10.5);
      s += note(largeur / 2, 2 * ph + 144, "Le calcul combine 1 × 2 × 3 pour tous les scénarios (M, R) : λ(Y > y) = Σ λ(M) · P(R | M) · P(Y > y | M, R)", "middle");
      return s;
    },
  });
}

// ── Chapitre 11 : la démarche de sélection ────────────────────────────────

/** De l'aléa au calcul temporel : les étapes de la sélection d'accélérogrammes. */
export function demarche({ largeur = 560 } = {}) {
  const etapes = [
    ["Aléa du site", "courbe d'aléa, UHS,", "désagrégation (ch. 10)"],
    ["Spectre cible", "EN 1998-1, UHS ou spectre", "conditionnel (CMS)"],
    ["Présélection", "magnitude et distance", "du scénario, sol"],
    ["Mise à l'échelle", "sur [0,2·T₁ ; 2·T₁], facteur", "par enregistrement"],
    ["Contrôle EN 1998-1", "3 au moins ; moyenne ≥ 90 %", "du spectre sur [0,2·T₁ ; 2·T₁]"],
    ["Calculs temporels", "7 au moins : la moyenne ;", "sinon : la plus défavorable"],
  ];
  const bw = 162, bh = 70, gx = (largeur - 3 * bw) / 4, y1 = 26, y2 = 150;
  return svg({
    largeur, hauteur: 238, titre: "De l'aléa au calcul temporel", contenu: (id) => {
      let s = "";
      const pos = etapes.map((_, i) => (i < 3 ? [gx + i * (bw + gx), y1] : [gx + (5 - i) * (bw + gx), y2]));
      etapes.forEach(([t, ...l], i) => {
        const [x, y] = pos[i];
        s += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="8" fill="${i === 4 ? "#ecfdf5" : "#f0f9ff"}" stroke="${i === 4 ? COULEURS.reaction : COULEURS.bleu}" stroke-width="1.4"/>`;
        s += texte(x + bw / 2, y + 20, `${i + 1}. ${t}`, 'text-anchor="middle" style="font-weight:800;font-size:12px"');
        l.forEach((q, j) => { s += note(x + bw / 2, y + 38 + 14 * j, q, "middle"); });
      });
      for (let i = 0; i + 1 < etapes.length; i++) {
        const [xa, ya] = pos[i], [xb, yb] = pos[i + 1];
        if (i === 2) s += fleche(id, xa + bw / 2, ya + bh, xb + bw / 2, yb - 4, COULEURS.bleu, 1.4, "fb");
        else if (i < 2) s += fleche(id, xa + bw, ya + bh / 2, xb - 4, yb + bh / 2, COULEURS.bleu, 1.4, "fb");
        else s += fleche(id, xa, ya + bh / 2, xb + bw + 4, yb + bh / 2, COULEURS.bleu, 1.4, "fb");
      }
      s += note(largeur / 2, 234, "si le contrôle 5 échoue, on multiplie tout le jeu par le plus petit facteur commun qui le satisfait", "middle");
      return s;
    },
  });
}


// ── Chapitre 12 : une couche de sol sur un rocher ─────────────────────────

/** Couche de sol molle sur un rocher : onde S montante, réflexion en surface, mode du quart d'onde. */
export function coucheSol({ largeur = 560, Vs = 200, H = 20 } = {}) {
  const top = 40, hs = 150, roc = 70, x0 = 30, w = 300, f0 = Vs / (4 * H);
  return svg({
    largeur, hauteur: top + hs + roc + 40, titre: "Une couche de sol sur un rocher", contenu: (id) => {
      let s = `<rect x="${x0}" y="${top}" width="${w}" height="${hs}" fill="#e8dcc3"/>`;
      s += `<rect x="${x0}" y="${top + hs}" width="${w}" height="${roc}" fill="url(#${id}-roche)" stroke="none"/><rect x="${x0}" y="${top + hs}" width="${w}" height="${roc}" fill="rgba(100,116,139,.25)"/>`;
      s += ligne(x0, top, x0 + w, top, "#8b5a2b", 2.4) + ligne(x0, top + hs, x0 + w, top + hs, "#475569", 1.4);
      s += etiquette(x0 + 8, top + 20, `sol mou : Vs = ${Vs} m/s`, "#5b4a2f") + etiquette(x0 + 8, top + hs + 22, "rocher : Vs élevée", "#334155");
      // onde montante et réfléchie (zigzag)
      const zig = [[x0 + 120, top + hs + roc - 6], [x0 + 150, top + hs], [x0 + 190, top + 2], [x0 + 230, top + hs], [x0 + 262, top + hs + roc - 6]];
      s += fleche(id, ...zig[0], ...zig[1], COULEURS.bleu, 1.6, "fb") + fleche(id, ...zig[1], ...zig[2], COULEURS.bleu, 1.6, "fb");
      s += fleche(id, ...zig[2], ...zig[3], COULEURS.bleu, 1.6, "fb") + fleche(id, ...zig[3], ...zig[4], COULEURS.bleu, 1.2, "fb");
      s += etiquette(x0 + 196, top + hs + 34, "une part repart vers le bas", "#334155", "start", 10.5);
      s += note(x0 + 150, top - 8, "réflexion à la surface libre", "middle");
      s += doubleFleche(id, x0 + w + 14, top, x0 + w + 14, top + hs) + etiquette(x0 + w + 20, top + hs / 2 + 4, `H = ${H} m`, COULEURS.cote);
      // mode fondamental : déplacement cos(πz/2H), maximal en surface, nul au rocher
      const mx = x0 + w + 92, A = 70, pts = Array.from({ length: 41 }, (_, i) => { const z = (i / 40) * hs; return [mx + A * Math.cos((Math.PI * z) / (2 * hs)), top + z]; });
      s += ligne(mx, top - 6, mx, top + hs + 10, "#94a3b8", 1) + `<path d="${chemin(pts)}" fill="none" stroke="${COULEURS.effort}" stroke-width="2.4"/>`;
      s += `<path d="${chemin([[mx, top + hs], ...pts.slice().reverse(), [mx, top]], true)}" fill="rgba(220,38,38,.12)"/>`;
      s += etiquette(mx + 4, top - 12, "déplacement au mode 1", COULEURS.effort);
      s += etiquette(mx + 8, top + hs - 30, "H = λ/4", COULEURS.effort);
      s += texte(x0, top + hs + roc + 26, `Résonance à f₀ = Vs/(4H) = ${frs(f0)} Hz (T₀ = ${frs(1 / f0)} s) : le sol amplifie surtout autour de f₀.`, 'style="font-size:12px;font-weight:700"');
      return s;
    },
  });
}

// ── Chapitre 13 : la liquéfaction ─────────────────────────────────────────

/** Grains de sable saturé avant, pendant et après les secousses : la pression de l'eau annule la contrainte effective. */
export function liquefaction({ largeur = 560 } = {}) {
  const pw = (largeur - 40) / 3, h = 196, y0 = 62, r = 8.5;
  let sommet = 0;
  const grains = (ox, oy, n, pas, dx = 0, dy = 0, decal = 0, bruit = 0) => {
    let g = "";
    sommet = oy - 12 - (n[1] - 1) * (pas + dy) - r;
    for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
      const b = bruit ? Math.sin(i * 12.9898 + j * 78.233) * bruit : 0, c = bruit ? Math.cos(i * 4.1 + j * 7.7) * bruit : 0;
      const x = ox + 12 + i * pas + (j % 2) * decal + b, y = oy - 12 - j * (pas + dy) + c;
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="#e9c46a" stroke="#8a6d1f" stroke-width="1"/>`;
    }
    return g;
  };
  const panneaux = [
    { nom: "1. Avant", lignes: ["les grains se touchent :", "ils portent le poids (σ′)"] },
    { nom: "2. Pendant les secousses", lignes: ["les grains veulent se tasser, l'eau", "ne peut fuir : u monte, σ′ → 0"] },
    { nom: "3. Après", lignes: ["l'eau s'échappe (volcans de sable),", "le sol se tasse, l'ouvrage penche"] },
  ];
  return svg({
    largeur, hauteur: y0 + h + 50, titre: "La liquéfaction d'un sable saturé", contenu: (id) => {
      let s = "";
      panneaux.forEach((p, n) => {
        const ox = 10 + n * (pw + 10), base = y0 + h;
        s += `<rect x="${ox}" y="${y0}" width="${pw}" height="${h}" rx="4" fill="rgba(0,119,190,.14)" stroke="#bfdbfe"/>`;
        if (n === 0) s += grains(ox, base, [9, 9], 17);
        if (n === 1) s += grains(ox, base - 2, [8, 8], 20.5, 0, 1.5, 0, 2.4);
        if (n === 2) s += grains(ox, base, [9, 9], 17, 0, -2.3, 8.5);
        // ouvrage posé en surface
        const bx = ox + pw / 2 - 26, by = sommet + (n === 2 ? 4 : 0), rot = n === 2 ? 7 : 0;
        s += `<rect x="${bx}" y="${by - 26}" width="52" height="26" fill="#cbd5e1" stroke="#475569" transform="rotate(${rot} ${bx + 26} ${by})"/>`;
        if (n === 1) for (const x of [ox + 30, ox + pw - 30]) s += fleche(id, x, y0 + 150, x, y0 + 106, COULEURS.bleu, 1.6, "fb");
        if (n === 1) s += etiquette(ox + pw / 2, y0 + 132, "pression de l'eau u ↑", COULEURS.bleu, "middle", 12);
        if (n === 2) {
          s += `<path d="M${ox + 18} ${sommet + 2}q8 -14 16 0z" fill="#d4a373" stroke="#8a6d1f"/>` + fleche(id, ox + 26, sommet - 8, ox + 26, sommet - 32, COULEURS.bleu, 1.4, "fb");
          s += doubleFleche(id, ox + pw - 14, sommet - 22, ox + pw - 14, sommet, COULEURS.effort) + note(ox + pw - 20, sommet - 26, "tassement", "end");
        }
        s += titre(ox + pw / 2, y0 - 12, p.nom, "middle");
        p.lignes.forEach((l, i) => { s += note(ox + pw / 2, y0 + h + 18 + 14 * i, l, "middle"); });
      });
      return s;
    },
  });
}

// ── Chapitre 14 : résister ou plier ───────────────────────────────────────

/** Oscillateur élastique et élastoplastique sous le même séisme : règle des égaux déplacements, R et μ. */
export function ductilite({ largeur = 560, R = 4 } = {}) {
  const c = cadre({ x0: 50, y0: 26, w: 300, h: 210, xmin: 0, xmax: 1.25, ymin: 0, ymax: 1.12, gx: [], gy: [] });
  const dy = 1 / R, du = 1;
  return svg({
    largeur, hauteur: 300, titre: "Résister élastiquement ou plier", contenu: (id) => {
      let s = c.s;
      s += c.trace([[0, 0], [1, 1]], COULEURS.bleu, 2.4, 'stroke-dasharray="7 4"') + `<circle cx="${c.X(1)}" cy="${c.Y(1)}" r="4" fill="${COULEURS.bleu}"/>`;
      s += c.trace([[0, 0], [dy, 1 / R], [du, 1 / R]], COULEURS.effort, 2.8);
      s += `<path d="${chemin([[c.X(0), c.Y(0)], [c.X(dy), c.Y(1 / R)], [c.X(du), c.Y(1 / R)], [c.X(du), c.Y(0)]], true)}" fill="rgba(220,38,38,.10)"/>`;
      s += ligne(c.X(du), c.Y(1), c.X(du), c.Y(0), "#94a3b8", 1, 'stroke-dasharray="3 3"') + ligne(c.X(dy), c.Y(1 / R), c.X(dy), c.Y(0), "#94a3b8", 1, 'stroke-dasharray="3 3"');
      s += etiquette(c.X(0.55), c.Y(0.62), "élastique", COULEURS.bleu, "end") + etiquette(c.X(0.62), c.Y(1 / R) - 8, "élastoplastique", COULEURS.effort);
      s += note(c.X(dy), c.Y(0) + 14, "dy", "middle") + note(c.X(du), c.Y(0) + 14, "du = dél", "middle");
      s += note(c.X(0) - 6, c.Y(1) + 4, "Fél", "end") + note(c.X(0) - 6, c.Y(1 / R) + 4, "Fy", "end");
      s += note(c.X(1.25), c.Y(0) + 28, "déplacement →", "end") + texte(c.X(0) - 34, c.Y(0.5), "force", `class="pt" text-anchor="middle" transform="rotate(-90 ${c.X(0) - 34} ${c.Y(0.5).toFixed(1)})"`);
      s += doubleFleche(id, c.X(1.12), c.Y(1), c.X(1.12), c.Y(1 / R)) + etiquette(c.X(1.12) - 6, c.Y(0.62), `R = Fél/Fy = ${R}`, COULEURS.cote, "end");
      s += doubleFleche(id, c.X(dy), c.Y(1 / R) + 26, c.X(du), c.Y(1 / R) + 26) + etiquette(c.X((dy + du) / 2), c.Y(1 / R) + 42, `μ = du/dy = ${R}`, COULEURS.cote, "middle");
      const tx = 368;
      [["Même séisme, même période :", true], ["l'ouvrage élastique doit", false], ["résister à Fél ;", false], ["l'ouvrage ductile ne résiste", false], [`qu'à Fél/${R}, mais plastifie`, false], [`(ductilité μ = ${R}).`, false], ["", false], ["Égaux déplacements : vrai", true], ["pour les périodes moyennes", false], ["et longues (chapitre 14).", false]]
        .forEach(([l, gras], i) => { s += texte(tx, 50 + 16 * i, l, gras ? 'style="font-size:11.5px;font-weight:800"' : 'class="pt"'); });
      return s;
    },
  });
}

// ── Chapitre 15 : la console de cisaillement et ses modes ─────────────────

/** Bâtiment de cinq étages en console de cisaillement (200 t et 2·10⁵ kN/m par étage) et ses trois premiers modes. */
export function console({ largeur = 560, n = 5, m = 200, k = 2e5 } = {}) {
  const md = Batiment.modes({ m: Array(n).fill(m), k: Array(n).fill(k) }), he = 40, base = 262, bx = 46, bw = 96;
  return svg({
    largeur, hauteur: 300, titre: "Console de cisaillement et modes propres", contenu: () => {
      let s = `<rect x="0" y="${base}" width="${largeur}" height="38" fill="#e9c99a"/>` + ligne(0, base, largeur, base, "#8b5a2b", 2);
      for (let i = 0; i < n; i++) {
        const y = base - (i + 1) * he;
        s += ligne(bx + 6, y, bx + 6, y + he, COULEURS.trait, 3) + ligne(bx + bw - 6, y, bx + bw - 6, y + he, COULEURS.trait, 3);
        s += `<rect x="${bx}" y="${y - 6}" width="${bw}" height="10" fill="#475569"/>`;
        s += note(bx - 6, y + 4, `m${i + 1}`, "end") + note(bx + bw / 2, y + he / 2 + 4, `k${i + 1}`, "middle");
      }
      s += titre(bx + bw / 2, 26, "planchers rigides,", "middle") + titre(bx + bw / 2, 42, "poteaux souples", "middle");
      // modes : déformées normées au sommet
      md.slice(0, 3).forEach((mo, j) => {
        const cx = 238 + j * 112, A = 44, pts = [[cx, base], ...mo.phi.map((p, i) => [cx + A * p, base - (i + 1) * he])];
        s += ligne(cx, base, cx, base - n * he - 6, "#94a3b8", 1, 'stroke-dasharray="3 3"');
        s += `<path d="${chemin(pts)}" fill="none" stroke="${[COULEURS.bleu, COULEURS.violet, COULEURS.reaction][j]}" stroke-width="2.4"/>`;
        pts.slice(1).forEach(([x, y]) => { s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${[COULEURS.bleu, COULEURS.violet, COULEURS.reaction][j]}"/>`; });
        s += titre(cx, 16, `Mode ${j + 1}`, "middle") + note(cx, 31, `T = ${frs(mo.T)} s`, "middle") + note(cx, 45, `${Math.round(100 * mo.part)} % de la masse`, "middle");
      });
      return s;
    },
  });
}

// ── Chapitre 16 : la poussée progressive ──────────────────────────────────

/** Bâtiment poussé par des forces croissantes ; courbe de capacité, idéalisation et déplacement cible. */
export function pousseeSchema({ largeur = 560 } = {}) {
  const base = 262, n = 4, he = 48, bx = 60, bw = 80, d = 26;
  const c = cadre({ x0: 300, y0: 30, w: 230, h: 200, xmin: 0, xmax: 1, ymin: 0, ymax: 1.1, gx: [], gy: [] });
  // courbe lisse de principe ; idéalisation élastique parfaitement plastique à aire égale jusqu'à dm (annexe B) :
  // Fy = V(dm), dy = 2·(dm − Em/Fy), Em aire sous la courbe
  const V = (x) => 0.95 * (1 - Math.exp(-x / 0.13)) + 0.06 * x, dm = 1, Fy = V(dm);
  let Em = 0;
  for (let i = 0; i < 400; i++) Em += (V((i + 0.5) / 400) * dm) / 400;
  const dyI = 2 * (dm - Em / Fy);
  return svg({
    largeur, hauteur: 300, titre: "Poussée progressive et courbe de capacité", contenu: (id) => {
      let s = `<rect x="0" y="${base}" width="270" height="38" fill="#e9c99a"/>` + ligne(0, base, 270, base, "#8b5a2b", 2);
      // portique déformé : déplacement croissant avec la hauteur
      for (let i = 0; i < n; i++) {
        const y1 = base - i * he, y2 = y1 - he, u1 = (d * i) / n, u2 = (d * (i + 1)) / n;
        s += ligne(bx + u1, y1, bx + u2, y2, COULEURS.trait, 3) + ligne(bx + bw + u1, y1, bx + bw + u2, y2, COULEURS.trait, 3);
        s += `<rect x="${bx + u2 - 2}" y="${y2 - 5}" width="${bw + 4}" height="9" fill="#475569"/>`;
        // force de plancher proportionnelle à la hauteur (profil « modal » d'un mode triangulaire)
        const F = 18 + 14 * i;
        s += fleche(id, bx + u2 - 8 - F, y2, bx + u2 - 6, y2, COULEURS.effort, 2);
      }
      s += doubleFleche(id, bx + bw, base - n * he - 20, bx + bw + d, base - n * he - 20, COULEURS.cote) + etiquette(bx + bw + d + 6, base - n * he - 16, "d (sommet)", COULEURS.cote);
      s += fleche(id, bx + bw / 2 + 50, base + 22, bx + bw / 2 - 10, base + 22, COULEURS.reaction, 2, "fr") + etiquette(bx + bw / 2 + 56, base + 26, "V (effort à la base)", COULEURS.reaction);
      // courbe de capacité et idéalisation bilinéaire
      s += c.s + c.trace(Array.from({ length: 81 }, (_, i) => { const x = i / 80; return [x, V(x)]; }), COULEURS.effort, 2.6);
      s += c.trace([[0, 0], [dyI, Fy], [dm, Fy]], COULEURS.bleu, 1.6, 'stroke-dasharray="6 4"');
      s += ligne(c.X(0.62), c.Y(0), c.X(0.62), c.Y(1.1), COULEURS.cote, 1.2, 'stroke-dasharray="3 3"') + etiquette(c.X(0.62) - 4, c.Y(1.04), "déplacement cible dt", COULEURS.cote, "end");
      s += etiquette(c.X(0.5), c.Y(0.78), "courbe de capacité", COULEURS.effort, "middle") + etiquette(c.X(0.82), c.Y(Fy) + 18, "idéalisation (aire égale)", COULEURS.bleu, "middle");
      s += note(c.X(1), c.Y(0) + 16, "d →", "end") + note(c.X(0) - 4, c.Y(1.05), "V", "end");
      return s;
    },
  });
}

// ── Chapitre 17 : l'isolation à la base ───────────────────────────────────

/** Base fixe et base isolée ; décalage de la période sur le spectre de l'EN 1998-1:2004 (type 1, sol C, ag = 0,2 g). */
export function isolationSchema({ largeur = 560, Tfixe = 0.4, Tiso = 2.5 } = {}) {
  const se = (T) => Spectre.ec8(T, { type: 1, sol: "C", ag: 0.2 }), base = 176, he = 30, n = 4, bw = 64;
  const c = cadre({ x0: 352, y0: 24, w: 196, h: 160, xmin: 0, xmax: 3, ymin: 0, ymax: 0.65, gx: [0, 1, 2, 3], gy: [0, 0.2, 0.4, 0.6], fx: (v) => frs(v), fy: (v) => frs(v), xlabel: "période T (s)", ylabel: "Sa (g)" });
  const batiment = (bx, b0, glis, derive) => {
    let s = "";
    for (let i = 0; i < n; i++) {
      const y1 = b0 - i * he, y2 = y1 - he, u1 = glis + derive * i, u2 = glis + derive * (i + 1);
      s += ligne(bx + u1, y1, bx + u2, y2, COULEURS.trait, 2.6) + ligne(bx + bw + u1, y1, bx + bw + u2, y2, COULEURS.trait, 2.6);
      s += `<rect x="${bx + u2 - 2}" y="${y2 - 4}" width="${bw + 4}" height="8" fill="#475569"/>`;
    }
    return s;
  };
  return svg({
    largeur, hauteur: 250, titre: "Base fixe et base isolée", contenu: (id) => {
      let s = `<rect x="0" y="${base}" width="310" height="74" fill="#e9c99a"/>` + ligne(0, base, 310, base, "#8b5a2b", 2);
      s += `<rect x="40" y="${base - 6}" width="${bw + 12}" height="8" fill="#475569"/>` + batiment(46, base - 6, 0, 7);
      s += titre(80, 20, "Base fixe", "middle") + note(80, base + 22, `T ≈ ${frs(Tfixe)} s`, "middle") + note(80, base + 36, "les étages se déforment", "middle");
      // isolateurs : appuis en caoutchouc fretté, la superstructure glisse en bloc
      const ix = 192, g = 22;
      for (const x of [ix + 2, ix + bw - 12]) s += `<rect x="${x + g / 2}" y="${base - 16}" width="14" height="14" rx="2" fill="#1f2937"/><path d="M${x + g / 2} ${base - 11}h14M${x + g / 2} ${base - 7}h14" stroke="#9ca3af"/>`;
      s += `<rect x="${ix - 2 + g}" y="${base - 22}" width="${bw + 12}" height="8" fill="#475569"/>` + batiment(ix + 4, base - 22, g, 1.2);
      s += doubleFleche(id, ix + 4, base - 34, ix + 4 + g, base - 34, COULEURS.effort);
      s += titre(ix + 40, 20, "Base isolée", "middle") + note(ix + 40, base + 22, `T ≈ ${frs(Tiso)} s`, "middle") + note(ix + 40, base + 36, "l'isolateur prend le déplacement", "middle");
      // spectre et décalage de période
      s += c.s + c.trace(Array.from({ length: 151 }, (_, i) => { const T = (i / 150) * 3; return [T, se(T)]; }), COULEURS.bleu, 2.2);
      for (const [T, coul] of [[Tfixe, COULEURS.effort], [Tiso, COULEURS.reaction]]) s += `<circle cx="${c.X(T)}" cy="${c.Y(se(T))}" r="5" fill="${coul}"/>` + etiquette(c.X(T) + 7, c.Y(se(T)) - 6, `${frs(se(T))} g`, coul, "start", 10.5);
      s += `<path d="M${c.X(Tfixe) + 8} ${c.Y(se(Tfixe)) + 12}Q${c.X(1.6)} ${c.Y(0.45)} ${c.X(Tiso) - 6} ${c.Y(se(Tiso)) - 10}" fill="none" stroke="${COULEURS.cote}" stroke-width="1.4" marker-end="url(#${id}-fc)"/>`;
      return s;
    },
  });
}

/** Schémas du cours, par identifiant du conteneur dans cours.html. */
export const SCHEMAS = {
  schemaOndes: { f: ondes, legende: "Déformation de la roche au passage de chaque onde (déplacements très exagérés). P et S traversent la Terre ; Rayleigh et Love restent près de la surface." },
  schemaProfondeur: { f: profondeurStation, legende: "La station la plus proche voit le foyer à la distance R ; la profondeur s'en déduit si Δ n'est pas grand devant h." },
  schemaLacune: { f: lacune, legende: "Le secteur rouge est la lacune azimutale ; l'ellipse, la zone d'incertitude de l'épicentre." },
  schemaAngles: { f: anglesFaille, legende: "La trace de la faille fait l'angle φ avec le nord ; le plan plonge de δ sous l'horizontale ; le toit glisse dans le plan selon l'angle λ compté depuis la trace." },
  schemaTypes: { f: typesFailles, legende: "Le trait tireté, une route coupée par la faille, montre le rejet. Sous chaque bloc, la sphère focale du même mécanisme." },
  schemaRuptures: { f: ruptures, legende: "Chaque degré de magnitude multiplie la surface rompue par 8 environ et le glissement par 4 : un séisme de magnitude 8 rompt 300 km de faille." },
  schemaOscillateurs: { f: oscillateurs, legende: "Chaque oscillateur, de période T, répond au même mouvement du sol ; le maximum de sa réponse est un point du spectre. Ici le spectre de l'EN 1998-1:2004 (type 1, sol C, ag = 0,2 g)." },
  schemaGR: { f: nombreEnergie, legende: "À gauche, une région à 2 séismes de magnitude ≥ 4 par an et b = 1. À droite, l'énergie rayonnée, log E = 1,5 M + 4,8 (en joules) : chaque degré multiplie l'énergie par 32." },
  schemaRebond: { f: rebond, legende: "Le rebond élastique (Reid, 1910) : la faille bloquée accumule la déformation entre deux séismes, puis la libère d'un coup. La courbe du milieu est v(x) = (s/π)·arctan(x/D)." },
  schemaCornell: { f: cornell, legende: "Les quatre étapes du calcul de Cornell (1968), calculées sur le modèle du cours : zone de 100 km autour du site, 1 séisme M ≥ 4 par an, b = 1, Mmax 6,5, trois lois d'atténuation (médianes d'Akkar et al. 2014 en 3)." },
  schemaDemarche: { f: demarche, legende: "La sélection d'accélérogrammes, de l'aléa au calcul temporel : chaque étape reprend une notion du cours." },
  schemaCouche: { f: coucheSol, legende: "L'onde S venue du rocher se piège dans la couche molle : réfléchie en surface, elle repart vers le bas. La couche résonne quand son épaisseur vaut le quart de la longueur d'onde." },
  schemaLiquefaction: { f: liquefaction, legende: "Sous les secousses, le sable lâche veut se tasser ; l'eau ne peut s'échapper assez vite, sa pression u monte et la contrainte effective σ′ = σ − u s'annule : le sol se comporte comme un liquide." },
  schemaDuctilite: { f: ductilite, legende: "Sous le même séisme, l'oscillateur ductile, quatre fois moins résistant, atteint à peu près le même déplacement que l'élastique : il plastifie au lieu de résister." },
  schemaConsole: { f: console, legende: "Bâtiment de cinq étages de 200 t et 2·10⁵ kN/m : ses trois premiers modes, calculés comme au chapitre (déformées normées au sommet, part de la masse totale)." },
  schemaPoussee: { f: pousseeSchema, legende: "On pousse le bâtiment par des forces croissantes, réparties selon la hauteur, et l'on trace l'effort à la base en fonction du déplacement du sommet : la courbe de capacité. Figure de principe." },
  schemaIsolation: { f: isolationSchema, legende: "L'isolateur allonge la période : sur le spectre de l'EN 1998-1:2004 (type 1, sol C, ag = 0,2 g), l'accélération chute ; le déplacement, lui, se concentre dans l'isolateur." },
  schemaSismometre: { f: sismometre, legende: "Le tambour, lié au bâti, bouge avec le sol ; la masse, par inertie, tarde à le suivre : le style trace leur mouvement relatif x." },
};

/** Remplit les conteneurs présents dans la page (cours, polycopié). */
export function remplirSchemas(doc = globalThis.document) {
  if (!doc) return;
  for (const [id, { f, legende }] of Object.entries(SCHEMAS)) {
    const e = doc.getElementById(id);
    if (e) e.innerHTML = `${f()}<figcaption>${legende}</figcaption>`;
  }
}
