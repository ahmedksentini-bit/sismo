// Coupe du globe : croûte, manteau (zone de transition 410–660 km), noyau externe liquide, graine ; foyer, station,
// rais des phases (Globe.trajet) et zone d'ombre. Chaîne SVG pure, partagée par le cours et l'exerciseur.
import { svg, texte, ligne, pasJoli, COULEURS } from "./figures.js";
import Globe from "./sismo/globe.js";

const DEG = 180 / Math.PI;
export const COULEURS_PHASES = {
  P: "#0369a1", S: "#dc2626", PcP: "#0891b2", ScS: "#ea580c", PKP: "#7c3aed", PKiKP: "#db2777", PKIKP: "#4c1d95", SKS: "#b45309",
  pP: "#0d9488", sP: "#65a30d",
};

/**
 * rais : [{ phase, points: [[r, θ]…], couleur?, epaisseur?, opacite?, sens? (−1 : tracé vers la gauche) }] ;
 * stations : [{ distance (degrés), nom?, sens? }] ; ombre : [Δ1, Δ2] en degrés (arc de surface grisé) ;
 * h : profondeur du foyer (km) ; legendes : afficher les noms des couches.
 */
export function globe({ rais = [], stations = [], ombre = null, h = 10, largeur = 520, titre = "Coupe du globe", legendes = true, etiquettes = [] } = {}) {
  const L = largeur, cx = L / 2, cy = L / 2 + 6, Rp = L / 2 - 34, k = Rp / Globe.R;
  const X = (r, t) => cx + r * k * Math.sin(t), Y = (r, t) => cy - r * k * Math.cos(t);
  const { moho, d410, d660, noyau, graine } = Globe.RAYONS;
  return svg({
    largeur: L, hauteur: L + 12, titre, contenu: () => {
      let s = "";
      s += `<circle cx="${cx}" cy="${cy}" r="${Rp}" fill="#fde7c7" stroke="#8b5a2b" stroke-width="3"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${(d410 * k).toFixed(1)}" fill="none" stroke="#c4a484" stroke-width="0.8" stroke-dasharray="3 3"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${(d660 * k).toFixed(1)}" fill="#f8d9b0" stroke="#c4a484" stroke-width="0.8" stroke-dasharray="3 3"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${(noyau * k).toFixed(1)}" fill="#fef3c7" stroke="#b45309" stroke-width="1.6"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${(graine * k).toFixed(1)}" fill="#fbbf24" stroke="#92400e" stroke-width="1.4" opacity="0.85"/>`;
      if (ombre) {
        const [a, b] = ombre.map((d) => d / DEG), pas = (b - a) / 30;
        let d = "";
        for (let t = a; t <= b + 1e-9; t += pas) d += `${d ? "L" : "M"}${X(Globe.R * 1.035, t).toFixed(1)} ${Y(Globe.R * 1.035, t).toFixed(1)}`;
        s += `<path d="${d}" fill="none" stroke="#64748b" stroke-width="7" opacity="0.45" stroke-linecap="round"/>`;
        const tm = (a + b) / 2, ancre = Math.sin(tm) > 0.2 ? "end" : Math.sin(tm) < -0.2 ? "start" : "middle";
        s += texte(X(Globe.R * 0.93, tm), Y(Globe.R * 0.93, tm) - 2, "zone d'ombre", `text-anchor="${ancre}" class="halo" style="font-size:11px;font-weight:700;fill:#475569"`);
        s += texte(X(Globe.R * 0.93, tm), Y(Globe.R * 0.93, tm) + 11, "de P", `text-anchor="${ancre}" class="halo" style="font-size:11px;font-weight:700;fill:#475569"`);
      }
      for (const r of rais) {
        if (!r.points) continue;
        const sg = r.sens || 1, d = r.points.map(([rr, t], i) => `${i ? "L" : "M"}${X(rr, sg * t).toFixed(1)} ${Y(rr, sg * t).toFixed(1)}`).join("");
        s += `<path d="${d}" fill="none" stroke="${r.couleur || COULEURS_PHASES[r.phase] || COULEURS.encre}" stroke-width="${r.epaisseur ?? 2}" opacity="${r.opacite ?? 1}" stroke-linejoin="round"/>`;
      }
      if (legendes) {
        s += texte(cx, cy + Rp - 10, "manteau", 'text-anchor="middle" class="halo" style="font-size:11px;font-weight:700;fill:#8b5a2b"');
        s += texte(cx, cy + noyau * k - 12, "noyau externe liquide", 'text-anchor="middle" class="halo" style="font-size:11px;font-weight:700;fill:#b45309"');
        s += texte(cx, cy + 4, "graine", 'text-anchor="middle" class="halo" style="font-size:11px;font-weight:700;fill:#78350f"');
        s += texte(cx, cy + 17, "(solide)", 'text-anchor="middle" class="halo" style="font-size:10px;fill:#78350f"');
        s += texte(L - 6, L + 4, `croûte ${Math.round(Globe.R - moho)} km · 410 et 660 km · noyau ${Math.round(Globe.R - noyau)} km · graine ${Math.round(Globe.R - graine)} km`, 'text-anchor="end" class="pt"');
      }
      // foyer et stations
      const fy = Y(Globe.R - h, 0);
      s += `<path d="M${cx} ${(fy - 8).toFixed(1)}l2.4 5.6 6 .4-4.6 3.9 1.5 5.9-5.3-3.2-5.3 3.2 1.5-5.9-4.6-3.9 6-.4z" fill="${COULEURS.effort}" stroke="#fff" stroke-width="1"/>`;
      for (const st of stations) {
        const t = ((st.sens || 1) * st.distance) / DEG, x = X(Globe.R, t), y = Y(Globe.R, t), ang = t * DEG;
        s += `<path d="M0 -9L7 4H-7Z" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})" fill="${COULEURS.reaction}" stroke="#fff" stroke-width="1"/>`;
        if (st.nom) s += texte(X(Globe.R * 1.08, t), Y(Globe.R * 1.08, t) + 4, st.nom, `text-anchor="${Math.sin(t) > 0.2 ? "start" : Math.sin(t) < -0.2 ? "end" : "middle"}" class="halo" style="font-size:11px;font-weight:700"`);
      }
      for (const e of etiquettes) {
        const t = ((e.sens || 1) * e.angle) / DEG;
        s += texte(X(e.r, t), Y(e.r, t) + 4, e.texte, `text-anchor="middle" class="halo" style="font-size:12px;font-weight:800;fill:${e.couleur || COULEURS.encre}"`);
      }
      return s;
    },
  });
}

/** Rais d'une phase, de la station à la distance donnée (toutes ses arrivées). */
export function raisVers(phase, h, distance, options = {}) {
  return Globe.arrivees(phase, h, distance).map((a) => ({ phase, points: Globe.trajet(phase, h, a.p), ...options }));
}

/** Éventail : premiers rais d'une phase vers des stations régulièrement espacées (distances en degrés). */
export function eventail(phase, h, distances, options = {}) {
  return distances.flatMap((d) => {
    const a = Globe.arrivees(phase, h, d)[0];
    return a ? [{ phase, points: Globe.trajet(phase, h, a.p), epaisseur: 1.2, opacite: 0.8, ...options }] : [];
  });
}

/**
 * Le voisinage du foyer, en coupe (distance le long de la surface, profondeur ; échelles égales) : départs de P vers
 * le bas, de pP et sP vers le haut, réflexion sous la surface. rais : [{ phase, points: [[r, θ]…] }] (Globe.trajet) ;
 * le segment montant de sP, en onde S, est tracé en tirets.
 */
export function foyer({ h, rais = [], largeur = 520, titre = "Départs de P, pP et sP près du foyer", distance = null } = {}) {
  const R = Globe.R, zMax = Math.max(1.7 * h, 60), x0 = -0.6 * zMax, x1 = 2.4 * zMax;
  const g = 46, d = 10, haut = 22, k = (largeur - g - d) / (x1 - x0), H = haut + zMax * k + 30;
  const X = (x) => g + (x - x0) * k, Y = (z) => haut + z * k;
  const { moho, d410, d660 } = Globe.RAYONS;
  return svg({
    largeur, hauteur: H, titre, contenu: (id) => {
      let s = `<defs><clipPath id="${id}-f"><rect x="${g}" y="${haut}" width="${largeur - g - d}" height="${(zMax * k).toFixed(1)}"/></clipPath></defs>`;
      s += `<rect x="${g}" y="${haut}" width="${largeur - g - d}" height="${(zMax * k).toFixed(1)}" fill="#fde7c7"/>`;
      s += `<rect x="${g}" y="${haut}" width="${largeur - g - d}" height="${(Math.min(R - moho, zMax) * k).toFixed(1)}" fill="#f3d9b1"/>`;
      for (const [r, nom] of [[moho, "Moho"], [d410, "410 km"], [d660, "660 km"]]) {
        const z = R - r;
        if (z >= zMax) continue;
        s += ligne(g, Y(z), largeur - d, Y(z), "#c4a484", 0.9, 'stroke-dasharray="4 3"');
        if (z * k > 16) s += texte(largeur - d - 4, Y(z) - 4, nom, 'text-anchor="end" class="pt"');
      }
      if ((R - moho) * k > 34) s += texte(largeur - d - 4, Y((R - moho) / 2) + 4, "croûte", 'text-anchor="end" class="pt"');
      s += texte(largeur - d - 4, Y(zMax) - 6, "manteau", 'text-anchor="end" class="pt"');
      // rais : x = R·θ, z = R − r ; le segment montant (jusqu'au premier point en surface) de sP est en onde S
      s += `<g clip-path="url(#${id}-f)">`;
      for (const r of rais) {
        if (!r.points) continue;
        const iS = r.points.findIndex((q) => q[0] >= R - 1e-9), pts = r.points.map(([rr, t]) => [X(R * t), Y(R - rr)]);
        const chemin = (a) => a.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
        const c = COULEURS_PHASES[r.phase] || COULEURS.encre;
        if (r.phase === "sP" && iS > 0) {
          s += `<path d="${chemin(pts.slice(0, iS + 1))}" fill="none" stroke="${c}" stroke-width="2.2" stroke-dasharray="6 4"/>`;
          s += `<path d="${chemin(pts.slice(iS))}" fill="none" stroke="${c}" stroke-width="2.2"/>`;
        } else s += `<path d="${chemin(pts)}" fill="none" stroke="${c}" stroke-width="2.2"/>`;
        // étiquette là où le rai sort du cadre
        const sortie = pts.find(([x, y]) => x > largeur - d - 2 || y > haut + zMax * k - 2) || pts[pts.length - 1];
        s += texte(Math.min(sortie[0], largeur - d - 22) + 4, Math.min(sortie[1], haut + zMax * k) - 6, r.phase, `class="halo" style="font-size:12px;font-weight:800;fill:${c}"`);
      }
      s += "</g>";
      s += ligne(g, haut, largeur - d, haut, "#8b5a2b", 2.4);
      // axe des profondeurs
      const pas = pasJoli(zMax, 5);
      for (let z = 0; z <= zMax + 1e-9; z += pas) {
        s += ligne(g - 4, Y(z), g, Y(z), COULEURS.trait, 1);
        s += texte(g - 6, Y(z) + 4, `${Math.round(z)}`, 'text-anchor="end" class="pt"');
      }
      s += texte(12, haut + (zMax * k) / 2, "profondeur (km)", `class="pt" transform="rotate(-90 12 ${(haut + (zMax * k) / 2).toFixed(1)})" text-anchor="middle"`);
      s += `<path d="M${X(0).toFixed(1)} ${(Y(h) - 8).toFixed(1)}l2.4 5.6 6 .4-4.6 3.9 1.5 5.9-5.3-3.2-5.3 3.2 1.5-5.9-4.6-3.9 6-.4z" fill="${COULEURS.effort}" stroke="#fff" stroke-width="1"/>`;
      s += texte(X(0) - 10, Y(h) + 4, `foyer, ${Math.round(h)} km`, 'text-anchor="end" class="halo" style="font-size:11px;font-weight:700"');
      s += texte(largeur - d, haut - 7, distance ? `vers la station, à ${distance}° →` : "vers la station →", 'text-anchor="end" class="pt"');
      s += texte(g, H - 8, `échelles égales${rais.some((r) => r.phase === "sP") ? " · tirets : sP part en onde S et devient P à la réflexion" : ""}`, 'class="pt"');
      return s;
    },
  });
}

/**
 * Coupe schématique d'une zone de subduction (sans exagération verticale) : la plaque océanique plonge sous la plaque
 * chevauchante ; les séismes la suivent jusqu'à 700 km (zone de Wadati-Benioff). Figure de principe, non calculée.
 */
export function subduction({ largeur = 560 } = {}) {
  const xMax = 1100, zMax = 720, g = 40, d = 12, haut = 40, k = (largeur - g - d) / xMax, H = haut + zMax * k + 24;
  const X = (x) => g + x * k, Y = (z) => haut + z * k;
  // dessus de la plaque plongeante : de la fosse (x = 330 km) vers 700 km de profondeur, pendage croissant
  const toit = [[0, 6], [330, 8], [420, 30], [500, 75], [570, 140], [640, 230], [710, 330], [780, 440], [850, 560], [915, 690]];
  const ep = 85, normale = (i) => { const [a, b] = [toit[Math.max(0, i - 1)], toit[Math.min(toit.length - 1, i + 1)]], dx = b[0] - a[0], dz = b[1] - a[1], n = Math.hypot(dx, dz); return [-dz / n, dx / n]; };
  const dessous = toit.map(([x, z], i) => { const [nx, nz] = normale(i); return [x - nx * ep, z + nz * ep]; }).map(([x, z], i) => (i === 0 ? [0, 6 + ep] : [x, z]));
  const chemin = (pts) => pts.map(([x, z], i) => `${i ? "L" : "M"}${X(x).toFixed(1)} ${Y(z).toFixed(1)}`).join("");
  // séismes : le long du dessus de la plaque, nombreux en surface, plus rares vers 300 à 450 km (positions fixes)
  const seismes = [];
  for (let i = 0; i < 70; i++) {
    const u = ((i * 0.618034) % 1), z = 4 + u * u * 690;
    if (z > 300 && z < 460 && i % 3) continue;
    let j = 2;
    while (j < toit.length - 1 && toit[j][1] < z) j++;
    const [xa, za] = toit[j - 1], [xb, zb] = toit[j], t = Math.min(1, Math.max(0, (z - za) / (zb - za || 1)));
    const [nx, nz] = normale(j), prof = 6 + ((i * 7) % 5) * 7;
    seismes.push([xa + t * (xb - xa) - nx * prof, z + nz * prof]);
  }
  return svg({
    largeur, hauteur: H, titre: "Coupe d'une zone de subduction", contenu: () => {
      let s = `<rect x="${g}" y="${Y(0)}" width="${largeur - g - d}" height="${(zMax * k).toFixed(1)}" fill="#fbe3c0"/>`;
      // classes de profondeur (bande à gauche, étiquettes posées après les plaques)
      const classes = [[0, 70, "superficiels (0 à 70 km)", "#f59e0b"], [70, 300, "intermédiaires (70 à 300 km)", "#ea580c"], [300, 700, "profonds (300 à 700 km)", "#dc2626"]];
      for (const [z1, z2, , c] of classes) s += `<rect x="${g}" y="${Y(z1).toFixed(1)}" width="7" height="${((z2 - z1) * k).toFixed(1)}" fill="${c}"/>`;
      // plaque chevauchante (lithosphère), puis plaque plongeante
      s += `<path d="M${X(330)} ${Y(0)}L${X(xMax)} ${Y(0)}L${X(xMax)} ${Y(90)}L${X(600)} ${Y(90)}L${X(520)} ${Y(95)}L${X(420)} ${Y(30)}Z" fill="#d6b88f" stroke="#8b5a2b" stroke-width="1"/>`;
      s += `<path d="${chemin(toit)}L${X(dessous[dessous.length - 1][0]).toFixed(1)} ${Y(dessous[dessous.length - 1][1]).toFixed(1)}${chemin([...dessous].reverse()).replace(/^M/, "L")}Z" fill="#94a3b8" stroke="#475569" stroke-width="1" opacity="0.9"/>`;
      s += `<path d="M${X(0)} ${Y(0)}L${X(330)} ${Y(0)}" stroke="#0077be" stroke-width="4"/>`;
      s += ligne(X(0), Y(0), X(xMax), Y(0), "#8b5a2b", 1.4);
      // volcan de l'arc, au-dessus de la plaque à ~110 km
      s += `<path d="M${X(520) - 14} ${Y(0)}L${X(540)} ${Y(0) - 16}L${X(560) + 14} ${Y(0)}Z" fill="#b45309"/>`;
      for (const [x, z] of seismes) s += `<circle cx="${X(x).toFixed(1)}" cy="${Y(z).toFixed(1)}" r="3" fill="${COULEURS.effort}" stroke="#fff" stroke-width="0.8"/>`;
      for (const [z1, z2, nom, c] of classes) s += texte(g + 12, Y(z1 === 0 ? 50 : (z1 + z2) / 2) + 4, nom, `class="halo" style="font-size:11px;font-weight:700;fill:${c}"`);
      s += texte(X(160), Y(0) - 8, "plaque océanique →", 'text-anchor="middle" class="halo" style="font-size:11px;font-weight:700"');
      s += texte(X(330), Y(0) - 8, "fosse", 'text-anchor="middle" class="pt"');
      s += texte(X(540), Y(0) - 20, "arc volcanique", 'text-anchor="middle" class="pt"');
      s += texte(X(850), Y(45), "plaque chevauchante", 'text-anchor="middle" class="halo" style="font-size:11px;font-weight:700"');
      s += texte(X(300), Y(380), "asthénosphère", 'text-anchor="middle" class="halo" style="font-size:11px;font-weight:700;fill:#8b5a2b"');
      s += texte(X(780), Y(250), "zone de Wadati-Benioff", 'text-anchor="start" class="halo" style="font-size:11px;font-weight:700;fill:#b91c1c"');
      s += ligne(g, Y(660), largeur - d, Y(660), "#c4a484", 0.9, 'stroke-dasharray="4 3"');
      s += texte(largeur - d - 4, Y(660) - 4, "660 km", 'text-anchor="end" class="pt"');
      for (let z = 0; z <= 700; z += 100) { s += ligne(g - 4, Y(z), g, Y(z), COULEURS.trait, 1); s += texte(g - 6, Y(z) + 4, `${z}`, 'text-anchor="end" class="pt"'); }
      s += texte(g, H - 6, "Profondeur en km, sans exagération verticale · points : foyers des séismes · figure de principe", 'class="pt"');
      return s;
    },
  });
}
