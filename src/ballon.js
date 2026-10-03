// Sphère focale (« ballon ») en projection de Schmidt, hémisphère inférieur : quadrants en compression
// teintés, plans nodaux, axes P et T, polarités lues. Chaîne SVG pure, partagée par le cours et l'exerciseur.
import { svg, texte, COULEURS } from "./figures.js";
import Me from "./sismo/mecanisme.js";

const RAD = Math.PI / 180;

/** Chemin d'un plan nodal (grand cercle) sur l'hémisphère inférieur. */
function planNodal(cx, cy, R, mec) {
  const f = mec.azimut * RAD, d = mec.pendage * RAD, s = [Math.cos(f), Math.sin(f), 0], b = [-Math.cos(d) * Math.sin(f), Math.cos(d) * Math.cos(f), Math.sin(d)];
  let p = "";
  for (let k = 0; k <= 90; k++) {
    const th = (k * Math.PI) / 90, v = [0, 1, 2].map((j) => Math.cos(th) * s[j] + Math.sin(th) * b[j]);
    const q = Me.projection(Math.acos(Math.max(-1, Math.min(1, v[2]))) / RAD, Math.atan2(v[1], v[0]) / RAD);
    p += `${k ? "L" : "M"}${(cx + R * q.x).toFixed(1)} ${(cy - R * q.y).toFixed(1)}`;
  }
  return p;
}

/**
 * mec : { azimut, pendage, glissement } ; stations : [{ i, az, polarite, nom? }] ; solutions : mécanismes
 * tracés en fins traits (famille d'une inversion) ; vrai : mécanisme tracé en tirets ; masquer : ne montre
 * ni quadrants ni plans (exercice de lecture).
 */
export function ballon({ mec = null, R = 110, stations = [], solutions = [], vrai = null, axes = true, titre = "Sphère focale", masquer = false, lignes = 110 } = {}) {
  const m = 30, T = 2 * (R + m), cx = T / 2, cy = T / 2 + 4;
  return svg({
    largeur: T, hauteur: T + 8, titre, contenu: () => {
      let s = "";
      if (mec && !masquer) {
        const M = Me.tenseur(mec.azimut, mec.pendage, mec.glissement), h = (2 * R) / lignes;
        for (let r = 0; r < lignes; r++) {
          const y = -R + (r + 0.5) * h;
          let debut = null;
          for (let c = 0; c <= lignes; c++) {
            const x = -R + (c + 0.5) * h, d = c < lignes ? Me.projectionInverse(x / R, -y / R) : null;
            const comp = d && Me.rayonnementP(M, d.i, d.phi) > 0;
            if (comp && debut === null) debut = c;
            if (!comp && debut !== null) {
              s += `<rect x="${(cx - R + debut * h).toFixed(1)}" y="${(cy + y - h / 2).toFixed(1)}" width="${((c - debut) * h + 0.4).toFixed(1)}" height="${(h + 0.4).toFixed(1)}" fill="${COULEURS.bleu}" opacity="0.32"/>`;
              debut = null;
            }
          }
        }
      }
      s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${COULEURS.encre}" stroke-width="1.6"/>`;
      s += texte(cx, cy - R - 9, "N", 'text-anchor="middle" style="font-weight:800"');
      s += `<path d="M${cx} ${cy - R}v6M${cx + R} ${cy}h-6M${cx} ${cy + R}v-6M${cx - R} ${cy}h6" stroke="${COULEURS.encre}" stroke-width="1.4"/>`;
      for (const so of solutions.slice(0, 160)) {
        for (const p of [so, Me.planAuxiliaire(so.azimut, so.pendage, so.glissement)]) s += `<path d="${planNodal(cx, cy, R, p)}" fill="none" stroke="#b45309" stroke-width="0.6" opacity="0.4"/>`;
      }
      if (vrai) for (const p of [vrai, Me.planAuxiliaire(vrai.azimut, vrai.pendage, vrai.glissement)]) s += `<path d="${planNodal(cx, cy, R, p)}" fill="none" stroke="${COULEURS.reaction}" stroke-width="1.8" stroke-dasharray="6 4"/>`;
      if (mec && !masquer) {
        for (const p of [mec, Me.planAuxiliaire(mec.azimut, mec.pendage, mec.glissement)]) s += `<path d="${planNodal(cx, cy, R, p)}" fill="none" stroke="${COULEURS.bleu}" stroke-width="2.2"/>`;
        if (axes) {
          const ax = Me.axes(Me.tenseur(mec.azimut, mec.pendage, mec.glissement));
          for (const [nom, a] of [["P", ax.P], ["T", ax.T]]) {
            const q = Me.projection(90 - a.plongement, a.azimut);
            s += texte(cx + R * q.x, cy - R * q.y + 5, nom, 'text-anchor="middle" class="halo" style="font-weight:900;font-size:15px"');
          }
        }
      }
      for (const st of stations) {
        const q = Me.projection(st.i, st.az), x = cx + R * q.x, y = cy - R * q.y;
        s += st.polarite > 0
          ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="${COULEURS.encre}" stroke="#fff" stroke-width="1"/>`
          : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#fff" stroke="${COULEURS.encre}" stroke-width="1.6"/>`;
        if (st.faux) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9.5" fill="none" stroke="${COULEURS.effort}" stroke-width="2"/>`;
        if (st.nom) s += texte(x + 8, y - 6, st.nom, 'class="halo" style="font-weight:800;font-size:12px"');
      }
      return s;
    },
  });
}
