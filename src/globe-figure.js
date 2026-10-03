// Coupe du globe : croûte, manteau (zone de transition 410–660 km), noyau externe liquide, graine ; foyer, station,
// rais des phases (Globe.trajet) et zone d'ombre. Chaîne SVG pure, partagée par le cours et l'exerciseur.
import { svg, texte, COULEURS } from "./figures.js";
import Globe from "./sismo/globe.js";

const DEG = 180 / Math.PI;
export const COULEURS_PHASES = {
  P: "#0369a1", S: "#dc2626", PcP: "#0891b2", ScS: "#ea580c", PKP: "#7c3aed", PKiKP: "#db2777", PKIKP: "#4c1d95", SKS: "#b45309",
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
