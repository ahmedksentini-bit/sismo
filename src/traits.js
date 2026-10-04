// Traits communs des schémas (cours et notes de calcul) : chemins, étiquettes à liseré, flèches, étoile du foyer,
// station, SVG imbriqué, projection oblique des blocs diagrammes, petit cadre de graphique.
import { texte, ligne, COULEURS } from "./figures.js";

export const RAD = Math.PI / 180;
export const chemin = (pts, ferme = false) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("") + (ferme ? "Z" : "");
export const titre = (x, y, s, ancre = "start") => texte(x, y, s, `text-anchor="${ancre}" style="font-size:12.5px;font-weight:800"`);
export const note = (x, y, s, ancre = "start") => texte(x, y, s, `text-anchor="${ancre}" class="pt"`);
export const etiquette = (x, y, s, couleur = COULEURS.encre, ancre = "start", taille = 11.5) =>
  texte(x, y, s, `text-anchor="${ancre}" class="halo" style="font-size:${taille}px;font-weight:700;fill:${couleur}"`);
export const fleche = (id, x1, y1, x2, y2, couleur = COULEURS.effort, ep = 2, marque = "fl") =>
  ligne(x1, y1, x2, y2, couleur, ep, `marker-end="url(#${id}-${marque})"`);
export const doubleFleche = (id, x1, y1, x2, y2, couleur = COULEURS.cote) =>
  ligne(x1, y1, x2, y2, couleur, 1.4, `marker-start="url(#${id}-fc)" marker-end="url(#${id}-fc)"`);
export const etoile = (x, y, r = 8) => {
  const p = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.45 : r; p.push([x + q * Math.cos(a), y + q * Math.sin(a)]); }
  return `<path d="${chemin(p, true)}" fill="${COULEURS.effort}" stroke="#fff" stroke-width="1"/>`;
};
export const station = (x, y, couleur = COULEURS.reaction) => `<path d="M${x.toFixed(1)} ${(y - 9).toFixed(1)}l7 12h-14z" fill="${couleur}" stroke="#fff" stroke-width="1"/>`;

/** Insère un SVG complet dans un autre, à la position et à la largeur données. */
export function imbriquer(s, x, y, largeur) {
  const [, , w, h] = s.match(/viewBox="([\d.\s-]+)"/)[1].trim().split(/\s+/).map(Number);
  // le style en ligne l'emporte sur les règles de page (.figure-cours svg : largeur 100 %, bordure)
  const H = ((largeur * h) / w).toFixed(1), L = largeur.toFixed(1);
  return s.replace(/^<svg /, `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${L}" height="${H}" style="width:${L}px;height:${H}px;border:0;border-radius:0;background:none" `);
}

// Projection oblique : x vers l'est (droite), y vers le nord (fuyant en haut à droite), z vers le haut.
export const projeter = (ox, oy, e = 1) => ([x, y, z]) => [ox + e * (x + 0.5 * y), oy - e * (z + 0.32 * y)];
export const comb = (a, b, ka, kb) => a.map((v, i) => ka * v + kb * b[i]);

// ── Petits graphiques dans les schémas ────────────────────────────────────

/** Cadre de graphique compact : axes, graduations choisies, échelles linéaires ou logarithmiques. */
export function cadre({ x0, y0, w, h, xmin, xmax, ymin, ymax, logX = false, logY = false, gx = [], gy = [], fx = String, fy = String, xlabel = "", ylabel = "" }) {
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
export const frs = (x, c = 2) => Number(x).toLocaleString("fr-FR", { maximumSignificantDigits: c });
