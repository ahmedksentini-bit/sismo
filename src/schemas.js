// Schémas de principe du cours : une figure par notion physique (ondes, foyer, faille, rupture, instrument…), en
// SVG pur, partagée par le cours et le polycopié. Les grandeurs qui se calculent sortent des solveurs (aires de
// Wells et Coppersmith, mécanismes) ; le reste est dessiné à l'échelle de la notion, sans prétendre à la mesure.
import { svg, texte, ligne, COULEURS } from "./figures.js";
import { ballon } from "./ballon.js";
import Faille from "./sismo/faille.js";

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

/** Schémas du cours, par identifiant du conteneur dans cours.html. */
export const SCHEMAS = {
  schemaOndes: { f: ondes, legende: "Déformation de la roche au passage de chaque onde (déplacements très exagérés). P et S traversent la Terre ; Rayleigh et Love restent près de la surface." },
  schemaProfondeur: { f: profondeurStation, legende: "La station la plus proche voit le foyer à la distance R ; la profondeur s'en déduit si Δ n'est pas grand devant h." },
  schemaLacune: { f: lacune, legende: "Le secteur rouge est la lacune azimutale ; l'ellipse, la zone d'incertitude de l'épicentre." },
  schemaAngles: { f: anglesFaille, legende: "La trace de la faille fait l'angle φ avec le nord ; le plan plonge de δ sous l'horizontale ; le toit glisse dans le plan selon l'angle λ compté depuis la trace." },
  schemaTypes: { f: typesFailles, legende: "Le trait tireté, une route coupée par la faille, montre le rejet. Sous chaque bloc, la sphère focale du même mécanisme." },
  schemaRuptures: { f: ruptures, legende: "Chaque degré de magnitude multiplie la surface rompue par 8 environ et le glissement par 4 : un séisme de magnitude 8 rompt 300 km de faille." },
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
