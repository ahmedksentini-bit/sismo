// Boîte à outils des figures SVG (reprise du site de fondations, même charte) : graphiques, cotes,
// étiquettes placées sans chevauchement. Tout est produit sous forme de chaîne SVG — la même figure
// sert au cours, à l'exerciseur et au polycopié.
//
// Règles de mise en page, tenues partout :
//  · une légende ne se pose jamais sur les courbes : elle va sous le graphique ;
//  · les étiquettes sont posées par un placeur, qui essaie plusieurs positions
//    et retient la première qui ne touche ni tracé, ni point, ni autre texte ;
//  · un texte qui peut frôler un tracé porte un liseré blanc (classe halo) ;
//  · une étiquette trop longue pour la place libre passe à la ligne sur « · » ;
//  · aucun libellé ne sort du cadre de la figure.

export const COULEURS = {
  encre: "#0f172a", trait: "#334155", discret: "#64748b", grille: "#e2e8f0",
  beton: "#cbd5e1", betonTrait: "#475569",
  eau: "#0077be", eauFond: "rgba(0,119,190,0.12)",
  effort: "#dc2626", reaction: "#0f766e", cote: "#2b2d42",
  f62: "#b45309", ec7: "#0f766e", bleu: "#0369a1", cyan: "#0891b2", rouge: "#b91c1c", violet: "#7c3aed",
};

/** Teintes et motifs par nature de terrain. */
export const SOLS = {
  remblai: { nom: "Remblai", fond: "#eadfd2", motif: "remblai" },
  argile: { nom: "Argile", fond: "#dccab0", motif: "argile" },
  limon: { nom: "Limon", fond: "#e8dcc3", motif: "argile" },
  intermediaire: { nom: "Sol intermédiaire", fond: "#e9dbb7", motif: "sable" },
  sable: { nom: "Sable", fond: "#f3e5ae", motif: "sable" },
  grave: { nom: "Grave", fond: "#e3d3a0", motif: "grave" },
  craie: { nom: "Craie", fond: "#f4f6f8", motif: "craie" },
  marne: { nom: "Marne", fond: "#cfd8c7", motif: "marne" },
  roche: { nom: "Roche", fond: "#b8bec7", motif: "roche" },
  tourbe: { nom: "Tourbe", fond: "#8d7a64", motif: "argile" },
};
export const solDe = (cle = "") => {
  const k = String(cle).split("-")[0];
  if (k.startsWith("intermediaire")) return SOLS.intermediaire;
  return SOLS[k] ?? SOLS.argile;
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const fmt = (x, c = 3) => (Number.isFinite(x) ? Number(x).toLocaleString("fr-FR", { maximumSignificantDigits: c }) : "—");

/** Pas « rond » (1, 2 ou 5 × 10ⁿ) qui découpe une étendue en n intervalles environ. */
export function pasJoli(etendue, n = 6) {
  const brut = etendue / n, p = 10 ** Math.floor(Math.log10(brut)), r = brut / p;
  return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
}

// Chasse approchée des caractères (en em), pour une police sans empattement.
const ETROITS = new Set(" il.,:;'’|!·ıj");
const MI_ETROITS = new Set("tfr()[]1*-/");
const LARGES = new Set("mwMW%—");
/** Largeur approchée d'un texte, en unités SVG (graisse forte par défaut). */
export function largeurTexte(s, taille = 12, gras = true) {
  let em = 0;
  for (const c of String(s ?? "")) {
    em += ETROITS.has(c) ? 0.29 : MI_ETROITS.has(c) ? 0.4 : LARGES.has(c) ? 0.86
      : c === "I" ? 0.32 : c >= "A" && c <= "Z" ? 0.7 : /[0-9=+−×<>≥≤→]/.test(c) ? 0.6 : 0.56;
  }
  return em * taille * (gras ? 1.05 : 0.98);
}

let compteur = 0;
/** Préfixe unique par figure : deux figures d'une même page ne partagent pas leurs motifs. */
const nouvelId = () => `f${(compteur++).toString(36)}`;

function defs(id) {
  return `<defs>
    <marker id="${id}-fl" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0l9 4.5-9 4.5z" fill="${COULEURS.effort}"/></marker>
    <marker id="${id}-fr" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0l9 4.5-9 4.5z" fill="${COULEURS.reaction}"/></marker>
    <marker id="${id}-fb" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0l9 4.5-9 4.5z" fill="${COULEURS.bleu}"/></marker>
    <marker id="${id}-fc" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0 0l7 3.5-7 3.5z" fill="${COULEURS.cote}"/></marker>
    <pattern id="${id}-argile" width="14" height="8" patternUnits="userSpaceOnUse"><path d="M1 4h6" stroke="#8b7355" stroke-width="1" opacity=".55"/></pattern>
    <pattern id="${id}-sable" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" fill="#8a6d1f" opacity=".55"/><circle cx="6.5" cy="6" r=".9" fill="#8a6d1f" opacity=".5"/></pattern>
    <pattern id="${id}-grave" width="14" height="12" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2.2" fill="none" stroke="#7c6a3a" stroke-width=".9" opacity=".6"/><circle cx="10.5" cy="9" r="1.6" fill="none" stroke="#7c6a3a" stroke-width=".9" opacity=".55"/></pattern>
    <pattern id="${id}-craie" width="16" height="10" patternUnits="userSpaceOnUse"><path d="M0 0h16M0 5h16M4 0v5M12 5v5" stroke="#94a3b8" stroke-width=".8" fill="none" opacity=".6"/></pattern>
    <pattern id="${id}-marne" width="12" height="10" patternUnits="userSpaceOnUse"><path d="M0 3h12M0 8h5" stroke="#5b6b52" stroke-width=".9" opacity=".5"/></pattern>
    <pattern id="${id}-roche" width="18" height="14" patternUnits="userSpaceOnUse"><path d="M0 7h18M9 0v7M3 7v7M15 7v7" stroke="#4b5563" stroke-width=".9" fill="none" opacity=".55"/></pattern>
    <pattern id="${id}-remblai" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M2 10l3-3M7 11l2-2M8 4l2-2" stroke="#7c6a58" stroke-width=".9" opacity=".6"/></pattern>
    <pattern id="${id}-beton" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v7" stroke="#94a3b8" stroke-width="1"/></pattern>
  </defs>`;
}

/** Cadre SVG commun ; `contenu(id)` reçoit le préfixe des motifs. */
export function svg({ largeur = 560, hauteur = 300, titre = "", contenu }) {
  const id = nouvelId();
  return `<svg viewBox="0 0 ${largeur} ${Math.round(hauteur)}" role="img" aria-label="${esc(titre)}" xmlns="http://www.w3.org/2000/svg">
  ${defs(id)}<style>text{font-family:Inter,-apple-system,"Segoe UI",sans-serif;font-size:12px;fill:${COULEURS.encre}}.pt{font-size:11px;fill:${COULEURS.discret}}.gr{font-weight:800}.halo{paint-order:stroke;stroke:#fff;stroke-width:3.5px;stroke-linejoin:round}</style>
  ${contenu(id)}</svg>`;
}

export const texte = (x, y, s, attrs = "") => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${attrs}>${esc(s)}</text>`;
export const ligne = (x1, y1, x2, y2, couleur = COULEURS.trait, ep = 1.4, attrs = "") =>
  `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${couleur}" stroke-width="${ep}" fill="none" ${attrs}/>`;

/**
 * Découpe une étiquette en lignes qui tiennent dans `largeurMax`, en coupant
 * d'abord sur « · », puis sur les espaces.
 */
export function couper(s, largeurMax, taille = 11) {
  if (largeurTexte(s, taille) <= largeurMax) return [s];
  const morceaux = String(s).split(" · ");
  const lignes = [];
  let courant = "";
  const pousser = (m) => {
    const essai = courant ? `${courant} · ${m}` : m;
    if (!courant || largeurTexte(essai, taille) <= largeurMax) courant = essai;
    else { lignes.push(courant); courant = m; }
  };
  for (const m of morceaux) {
    if (largeurTexte(m, taille) <= largeurMax) { pousser(m); continue; }
    // Morceau trop long : on le coupe sur les espaces.
    for (const mot of m.split(" ")) {
      const essai = courant ? `${courant} ${mot}` : mot;
      if (!courant || largeurTexte(essai, taille) <= largeurMax) courant = essai;
      else { lignes.push(courant); courant = mot; }
    }
  }
  if (courant) lignes.push(courant);
  return lignes;
}

/** Texte sur plusieurs lignes (une ligne par élément). */
function texteLignes(x, y, lignes, attrs, pas = 13) {
  return lignes.map((l, i) => texte(x, y + i * pas, l, attrs)).join("");
}

// ───────────────────────── Placement des étiquettes ──────────────────────

/** Le segment (x1, y1)–(x2, y2) traverse-t-il le rectangle r ? (Liang–Barsky) */
function coupeRect(x1, y1, x2, y2, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
const chevauche = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contient = (a, b) => b.x >= a.x - 0.5 && b.y >= a.y - 0.5 && b.x + b.w <= a.x + a.w + 0.5 && b.y + b.h <= a.y + a.h + 0.5;

/** Boîte d'un texte d'une ou plusieurs lignes ; y est la ligne de base de la première. */
export function boiteTexte(x, y, lignes, { taille = 12, ancre = "start", pas = 13 } = {}) {
  const ls = Array.isArray(lignes) ? lignes : [lignes];
  const w = Math.max(...ls.map((l) => largeurTexte(l, taille)));
  return { x: ancre === "end" ? x - w : ancre === "middle" ? x - w / 2 : x, y: y - 0.8 * taille, w, h: 1.05 * taille + (ls.length - 1) * pas };
}

/**
 * Placeur d'étiquettes. Les tracés déclarent leurs obstacles (segments,
 * boîtes) ; chaque étiquette propose des positions candidates, par ordre de
 * préférence, et rendre() les pose toutes à la fin : la première position qui
 * ne touche rien l'emporte, sinon la moins gênée. Une étiquette posée devient
 * à son tour un obstacle. cadre : rectangle dont aucune étiquette ne sort.
 */
export function placeur(cadre = null) {
  const segments = [], boites = [], demandes = [];
  const cout = (b, dedans) => {
    const r = { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
    let c = 0;
    if (cadre && !contient(cadre, b)) c += 100;
    if (dedans && !contient(dedans, b)) c += 40;
    for (const [x1, y1, x2, y2, p] of segments) if (coupeRect(x1, y1, x2, y2, r)) c += p;
    for (const o of boites) if (chevauche(o, r)) c += o.poids;
    return c;
  };
  return {
    segment(x1, y1, x2, y2, poids = 1) { segments.push([x1, y1, x2, y2, poids]); },
    polyligne(pts, poids = 1) {
      for (let i = 1; i < pts.length; i++) segments.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], poids]);
    },
    boite(b, poids = 4) { boites.push({ ...b, poids }); },
    /**
     * Étiquette différée : candidats [{ x, y, ancre, lignes, dedans? }] ; style :
     * attributs SVG communs ; dedans : zone dont l'étiquette ne doit pas sortir.
     */
    texte(candidats, style, { taille = 12, pas = 13, dedans = null, priorite = 0 } = {}) {
      demandes.push({ candidats, style, taille, pas, dedans, priorite, rang: demandes.length });
    },
    rendre() {
      let s = "";
      demandes.sort((a, b) => b.priorite - a.priorite || a.rang - b.rang);
      for (const d of demandes) {
        let retenu = null, min = Infinity;
        d.candidats.forEach((c, i) => {
          const b = boiteTexte(c.x, c.y, c.lignes, { taille: d.taille, ancre: c.ancre, pas: d.pas });
          const k = cout(b, c.dedans ?? d.dedans) + i * 1e-3;
          if (k < min) { min = k; retenu = { ...c, b }; }
        });
        if (!retenu) continue;
        boites.push({ ...retenu.b, poids: 4 });
        s += texteLignes(retenu.x, retenu.y, retenu.lignes, `text-anchor="${retenu.ancre}" ${d.style}`, d.pas);
      }
      demandes.length = 0;
      return s;
    },
  };
}

/**
 * Rectangle de sol avec son motif et, éventuellement, son étiquette (posée
 * sans placeur : les coupes passent par leur propre placement).
 */
export function couche(id, { x, y, w, h, sol, etiquette = null, cote = "droite", position = "haut", largeurMax = null }) {
  const s = typeof sol === "string" ? solDe(sol) : sol;
  let t = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.fond}"/>
    <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="url(#${id}-${s.motif})"/>`;
  if (etiquette && h > 13) {
    const lignes = couper(etiquette, largeurMax ?? w - 12, 11).slice(0, Math.max(1, Math.floor((h - 4) / 13)));
    const tx = cote === "droite" ? x + w - 6 : x + 6;
    const ty = position === "bas" ? y + h - 6 - (lignes.length - 1) * 13 : y + Math.min(h / 2 + 4, 16);
    t += texteLignes(tx, ty, lignes, `text-anchor="${cote === "droite" ? "end" : "start"}" class="gr halo" style="font-size:11px"`);
  }
  return t;
}

/**
 * Candidats d'étiquette pour une bande de terrain [y0, y1] entre xg et xd :
 * d'une traite dans la bande (côté et hauteur préférés d'abord), puis, si
 * `dehors` donne la place libre de part et d'autre ({ gauche, droite }), à
 * l'extérieur du bloc, en face de la bande ; en dernier recours, coupée.
 */
function candidatsBande(etiquette, { xg, xd, y0, y1, cote = "droite", position = "haut", largeurs = [200, 150, 110, 80], dehors = null }) {
  const h = y1 - y0, nMax = Math.max(1, Math.floor((h - 4) / 13));
  const dedans = { x: xg, y: y0, w: xd - xg, h };
  const variantes = [[etiquette]];
  for (const lmax of largeurs) {
    const l = couper(etiquette, Math.min(lmax, xd - xg - 12), 11);
    if (l.length <= nMax && !variantes.some((v) => v.join("|") === l.join("|"))) variantes.push(l);
  }
  const autre = cote === "droite" ? "gauche" : "droite";
  const verticales = [position, position === "haut" ? "bas" : "haut", "milieu"];
  const yDe = (v, n) => (v === "haut" ? y0 + Math.min(h / 2 + 4, 16) : v === "bas" ? y1 - 6 - (n - 1) * 13 : y0 + h / 2 + 4 - (n - 1) * 6.5);
  const interieur = (v, l, c) => ({ x: c === "droite" ? xd - 6 : xg + 6, y: yDe(v, l.length), ancre: c === "droite" ? "end" : "start", lignes: l, dedans });
  const exterieur = (l, c) => ({
    x: c === "droite" ? xd + 6 : xg - 6, y: yDe("haut", l.length), ancre: c === "droite" ? "start" : "end", lignes: l,
    dedans: c === "droite" ? { x: xd, y: y0, w: dehors.droite - xd, h } : { x: dehors.gauche, y: y0, w: xg - dehors.gauche, h },
  });
  const cands = [];
  for (const l of variantes) {
    for (const v of verticales) for (const c of [cote, autre]) cands.push(interieur(v, l, c));
    if (dehors) for (const c of [cote, autre]) cands.push(exterieur(l, c));
  }
  return cands;
}

/**
 * Ligne de cote avec flèches aux deux bouts et libellé. Avec un placeur P,
 * le libellé cherche sa place (côté demandé d'abord, au milieu puis vers les
 * bouts) et la cote devient un obstacle pour les autres étiquettes.
 */
export function cote(id, x1, y1, x2, y2, libelle, { cote: position = "haut", decalage = 5, P = null } = {}) {
  const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
  const trait = ligne(x1, y1, x2, y2, COULEURS.cote, 1.1, `marker-start="url(#${id}-fc)" marker-end="url(#${id}-fc)"`);
  if (P) P.segment(x1, y1, x2, y2, 2);
  if (!libelle) return trait;
  const style = `class="halo" style="font-size:11.5px;font-weight:700;fill:${COULEURS.cote}"`;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  let cands;
  if (vertical) {
    const g = position === "gauche";
    const pos = (gauche, f) => ({ x: mx + (gauche ? -decalage : decalage), y: y1 + f * (y2 - y1) + 4, ancre: gauche ? "end" : "start" });
    cands = [pos(g, 0.5), pos(g, 0.3), pos(g, 0.7), pos(g, 0.15), pos(g, 0.85), pos(!g, 0.5), pos(!g, 0.3), pos(!g, 0.7)];
  } else {
    const bas = position === "bas";
    const pos = (dessous, f) => ({ x: x1 + f * (x2 - x1), y: my + (dessous ? 14 : -decalage), ancre: "middle" });
    // Cote courte au bord de la figure : libellé calé sur l'un de ses bouts.
    const bout = (dessous, droite) => ({ x: droite ? Math.max(x1, x2) : Math.min(x1, x2), y: my + (dessous ? 14 : -decalage), ancre: droite ? "end" : "start" });
    cands = [pos(bas, 0.5), pos(!bas, 0.5), pos(bas, 0.3), pos(bas, 0.7), pos(!bas, 0.3), pos(!bas, 0.7),
      bout(bas, true), bout(bas, false), bout(!bas, true), bout(!bas, false)];
  }
  cands = cands.map((c) => ({ ...c, lignes: [libelle] }));
  if (!P) return trait + texte(cands[0].x, cands[0].y, libelle, `text-anchor="${cands[0].ancre}" ${style}`);
  P.texte(cands, style, { taille: 11.5, priorite: 3 });
  return trait;
}

/**
 * Flèche d'effort (rouge), de réaction (vert) ou d'écoulement (bleu). Le
 * libellé s'accroche à l'extrémité désignée par `position` : au-dessus d'une
 * flèche horizontale, à droite d'une flèche verticale ; avec un placeur P, il
 * se déplace si cette place est prise.
 */
export function fleche(id, x1, y1, x2, y2, { type = "effort", libelle = "", ep = 2.4, position = "fin", P = null } = {}) {
  const couleur = type === "reaction" ? COULEURS.reaction : type === "bleu" ? COULEURS.bleu : COULEURS.effort;
  const m = type === "reaction" ? "fr" : type === "bleu" ? "fb" : "fl";
  const trait = ligne(x1, y1, x2, y2, couleur, ep, `marker-end="url(#${id}-${m})"`);
  if (P) P.segment(x1, y1, x2, y2, 2);
  if (!libelle) return trait;
  const fin = position === "fin";
  const [ax, ay] = fin ? [x2, y2] : [x1, y1]; // extrémité qui porte le libellé
  const [bx, by] = fin ? [x1, y1] : [x2, y2];
  let cands;
  if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
    // Le texte part de l'extrémité et longe la flèche.
    const s = Math.sign(bx - ax) || 1, ancre = s > 0 ? "start" : "end";
    cands = [
      { x: ax + 2 * s, y: ay - 7, ancre }, { x: ax + 2 * s, y: ay + 16, ancre },
      { x: ax - 7 * s, y: ay + 4, ancre: s > 0 ? "end" : "start" },
      { x: (ax + bx) / 2, y: ay - 7, ancre: "middle" }, { x: (ax + bx) / 2, y: ay + 16, ancre: "middle" },
    ];
  } else {
    const ty = ay + (y2 > y1 ? (fin ? -2 : 4) : 12);
    cands = [
      { x: ax + 7, y: ty, ancre: "start" }, { x: ax - 7, y: ty, ancre: "end" },
      { x: ax, y: by > ay ? ay - 5 : ay + 14, ancre: "middle" },
      { x: ax + 7, y: (ay + by) / 2 + 4, ancre: "start" }, { x: ax - 7, y: (ay + by) / 2 + 4, ancre: "end" },
    ];
  }
  cands = cands.map((c) => ({ ...c, lignes: [libelle] }));
  const style = `class="halo" style="font-weight:800;fill:${couleur}"`;
  if (!P) return trait + texte(cands[0].x, cands[0].y, libelle, `text-anchor="${cands[0].ancre}" ${style}`);
  P.texte(cands, style, { taille: 12, priorite: 3 });
  return trait;
}

/** Symbole de nappe (triangle inversé, à droite) et trait du niveau d'eau. */
export function nappe(x, y, largeur, P = null) {
  const xs = x + largeur - 22;
  if (P) { P.segment(x, y, x + largeur, y, 1); P.boite({ x: xs - 6, y: y - 10, w: 12, h: 10 }); }
  return `${ligne(x, y, x + largeur, y, COULEURS.eau, 1.4, 'stroke-dasharray="6 4"')}
    <path d="M${xs} ${y - 1}l6-9h-12z" fill="${COULEURS.eau}"/>`;
}

// ───────────────────────────── Graphique x–y ──────────────────────────────

/**
 * Graphique cartésien : séries de points, axes gradués, légende sous le
 * graphique (jamais sur les courbes).
 * series : [{ points: [[x, y]], couleur, libelle, tirets, epaisseur, marqueurs }]
 * zones : [{ x0, x1, y0, y1, couleur, opacite, libelle, position: "gauche"|"droite" }]
 * marques : [{ x, y, couleur, libelle, guides, rayon }]
 * inverserY : pour un profil en profondeur (z croissant vers le bas).
 * logX, logY : échelles logarithmiques (bornes strictement positives).
 * textes : [{ x, y, texte, couleur }] annotations libres, posées près du point.
 * legende : "dessous" (défaut) | "dedans" | false.
 * Les libellés des marques, des annotations puis des zones sont posés par le
 * placeur : ils évitent les courbes, les guides, les points et les autres libellés.
 */
export function graphe({
  largeur = 560, hauteur = 300, xmin, xmax, ymin, ymax, xlabel = "", ylabel = "", series = [],
  titre = "", inverserY = false, pasX = null, pasY = null, marques = [], legende = "dessous", zones = [],
  logX = false, logY = false, textes = [],
}) {
  const g = { gauche: 58, droite: 18, haut: 14, bas: 44 };
  const W = largeur - g.gauche - g.droite, H = hauteur - g.haut - g.bas;
  const fx = logX ? (x) => (Math.log10(x) - Math.log10(xmin)) / (Math.log10(xmax) - Math.log10(xmin)) : (x) => (x - xmin) / (xmax - xmin);
  const fy = logY ? (y) => (Math.log10(y) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin)) : (y) => (y - ymin) / (ymax - ymin);
  const X = (x) => g.gauche + fx(x) * W;
  const Y = (y) => inverserY ? g.haut + fy(y) * H : g.haut + H - fy(y) * H;
  const px = pasX || pasJoli(xmax - xmin), py = pasY || pasJoli(ymax - ymin);
  // Graduations : pas rond en linéaire ; en logarithmique, 1-2-5 par décade, chiffres aux décades
  // (et aux 2 et 5 quand l'axe ne couvre qu'une ou deux décades).
  const graduer = (a, b, pas, log) => {
    if (!log) {
      const t = [];
      for (let v = Math.ceil(a / pas - 1e-9) * pas; v <= b + 1e-9; v += pas) t.push({ v: Math.abs(v) < pas * 1e-9 ? 0 : v, chiffre: true });
      return t;
    }
    const decades = Math.log10(b / a);
    return graduationsLog(a, b).map((v) => {
      const m = Math.round(v / 10 ** Math.floor(Math.log10(v) + 1e-9));
      return { v, chiffre: m === 1 || (decades <= 2.2 && (m === 2 || m === 5)), majeur: m === 1 };
    });
  };
  const okX = (x) => Number.isFinite(x) && (!logX || x > 0), okY = (y) => Number.isFinite(y) && (!logY || y > 0);

  // Légende : rangées d'éléments sous le titre de l'axe x.
  const avecLibelle = series.filter((se) => se.libelle);
  const rangees = [];
  if (legende && legende !== "dedans" && avecLibelle.length) {
    let rangee = [], occupe = 0;
    for (const se of avecLibelle) {
      const w = 34 + largeurTexte(se.libelle, 11);
      if (rangee.length && occupe + w > largeur - 20) { rangees.push({ rangee, occupe }); rangee = []; occupe = 0; }
      rangee.push({ se, w }); occupe += w;
    }
    rangees.push({ rangee, occupe });
  }
  const hLegende = rangees.length ? rangees.length * 17 + 6 : 0;

  return svg({
    largeur, hauteur: hauteur + hLegende, titre, contenu: (id) => {
      let s = "";
      const P = placeur({ x: g.gauche, y: g.haut, w: W, h: H });
      for (const z of zones) {
        s += `<rect x="${X(z.x0).toFixed(1)}" y="${Math.min(Y(z.y0), Y(z.y1)).toFixed(1)}" width="${(X(z.x1) - X(z.x0)).toFixed(1)}" height="${Math.abs(Y(z.y1) - Y(z.y0)).toFixed(1)}" fill="${z.couleur}" opacity="${z.opacite ?? 0.18}"/>`;
      }
      // Graduations ; le zéro s'écrit « 0 », jamais « -0 ».
      for (const { v, chiffre, majeur } of graduer(xmin, xmax, px, logX)) {
        s += ligne(X(v), g.haut, X(v), g.haut + H, COULEURS.grille, logX && !majeur ? 0.7 : 1);
        if (chiffre) s += texte(X(v), g.haut + H + 16, fmt(v, 4), `text-anchor="middle" class="pt"`);
      }
      for (const { v, chiffre, majeur } of graduer(ymin, ymax, py, logY)) {
        s += ligne(g.gauche, Y(v), g.gauche + W, Y(v), COULEURS.grille, logY && !majeur ? 0.7 : 1);
        if (chiffre) s += texte(g.gauche - 7, Y(v) + 4, fmt(v, 4), `text-anchor="end" class="pt"`);
      }
      s += `<rect x="${g.gauche}" y="${g.haut}" width="${W}" height="${H}" fill="none" stroke="${COULEURS.trait}" stroke-width="1.2"/>`;
      s += texte(g.gauche + W / 2, hauteur - 10, xlabel, `text-anchor="middle" style="font-weight:700"`);
      s += `<text transform="translate(14 ${g.haut + H / 2}) rotate(-90)" text-anchor="middle" style="font-weight:700">${esc(ylabel)}</text>`;
      const clip = `${id}-clip`;
      s += `<clipPath id="${clip}"><rect x="${g.gauche}" y="${g.haut}" width="${W}" height="${H}"/></clipPath>`;
      // Guides des marques d'abord : ils passent sous les courbes.
      for (const m of marques) {
        if (!m.guides || !okX(m.x) || !okY(m.y)) continue;
        const col = m.couleur ?? COULEURS.effort, cx = X(m.x), cy = Y(m.y);
        s += ligne(cx, cy, cx, g.haut + H, col, 1, `stroke-dasharray="4 3" clip-path="url(#${clip})"`);
        s += ligne(g.gauche, cy, cx, cy, col, 1, `stroke-dasharray="4 3" clip-path="url(#${clip})"`);
        P.segment(cx, cy, cx, g.haut + H, 0.5);
        P.segment(g.gauche, cy, cx, cy, 0.5);
      }
      series.forEach((se) => {
        const pts = se.points.filter(([x, y]) => okX(x) && okY(y));
        if (!pts.length) return;
        // Série « nuage » : des points seuls, sans trait (mesures d'un profil sur un abaque…).
        if (!se.nuage) {
          const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join("");
          s += `<path d="${d}" fill="none" stroke="${se.couleur}" stroke-width="${se.epaisseur ?? 2.2}" ${se.tirets ? `stroke-dasharray="${se.tirets}"` : ""} stroke-linejoin="round" clip-path="url(#${clip})"/>`;
          P.polyligne(pts.map(([x, y]) => [X(x), Y(y)]));
        }
        if (se.marqueurs || se.nuage) pts.forEach(([x, y], i) => {
          const col = se.couleurs?.[i] ?? se.couleur;
          s += `<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="${se.rayon ?? 3}" fill="${col}"${se.nuage ? ' fill-opacity=".85" stroke="#fff" stroke-width=".6"' : ""} clip-path="url(#${clip})"/>`;
          if (!se.nuage) P.boite({ x: X(x) - 3, y: Y(y) - 3, w: 6, h: 6 }, 2);
        });
      });
      // Annotations libres : près de leur point, sans rien recouvrir.
      for (const t of textes) {
        if (!okX(t.x) || !okY(t.y) || t.x < xmin || t.x > xmax || t.y < Math.min(ymin, ymax) || t.y > Math.max(ymin, ymax)) continue;
        const cx = X(t.x), cy = Y(t.y);
        P.texte([
          { x: cx, y: cy + 4, ancre: "middle" }, { x: cx + 6, y: cy - 4, ancre: "start" }, { x: cx - 6, y: cy - 4, ancre: "end" },
          { x: cx + 6, y: cy + 13, ancre: "start" }, { x: cx - 6, y: cy + 13, ancre: "end" },
        ].map((c) => ({ ...c, lignes: [t.texte] })), `class="halo" style="font-size:${t.taille ?? 11}px;font-weight:${t.gras === false ? 400 : 700};fill:${t.couleur ?? COULEURS.discret}"`, { taille: t.taille ?? 11, priorite: 1.5 });
      }
      for (const m of marques) {
        if (!okX(m.x) || !okY(m.y)) continue;
        const col = m.couleur ?? COULEURS.effort, cx = X(m.x), cy = Y(m.y), r = m.rayon ?? 5;
        s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${col}" stroke="#fff" stroke-width="1.5"/>`;
        P.boite({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r });
        if (!m.libelle) continue;
        const d = r + 3;
        P.texte([
          { x: cx + d, y: cy - d, ancre: "start" }, { x: cx - d, y: cy - d, ancre: "end" },
          { x: cx + d, y: cy + d + 10, ancre: "start" }, { x: cx - d, y: cy + d + 10, ancre: "end" },
          { x: cx + d + 2, y: cy + 4, ancre: "start" }, { x: cx - d - 2, y: cy + 4, ancre: "end" },
          { x: cx, y: cy - d - 2, ancre: "middle" }, { x: cx, y: cy + d + 12, ancre: "middle" },
        ].map((c) => ({ ...c, lignes: [m.libelle] })), `class="halo" style="font-weight:800;fill:${col}"`, { taille: 12, priorite: 2 });
      }
      // Libellés des zones : dans leur zone, là où aucune courbe ne passe.
      for (const z of zones) {
        if (!z.libelle) continue;
        const haut = Math.max(Math.min(Y(z.y0), Y(z.y1)), g.haut), bas = Math.min(Math.max(Y(z.y0), Y(z.y1)), g.haut + H);
        const gx = Math.max(X(z.x0), g.gauche), dx = Math.min(X(z.x1), g.gauche + W);
        if (bas - haut < 15 || dx - gx < 30) continue;
        const Z = { x: gx, y: haut, w: dx - gx, h: bas - haut };
        const lignes = couper(z.libelle, Z.w - 10, 11).slice(0, Math.max(1, Math.floor((Z.h - 4) / 13)));
        const n = lignes.length;
        const pref = z.position === "droite" ? "droite" : "gauche";
        const cands = [];
        for (const yv of [Z.y + 12.5, Z.y + Z.h - 5 - (n - 1) * 13, Z.y + Z.h / 2 + 4 - (n - 1) * 6.5]) {
          for (const c of [pref, pref === "droite" ? "gauche" : "droite"]) {
            cands.push({ x: c === "droite" ? Z.x + Z.w - 5 : Z.x + 5, y: yv, ancre: c === "droite" ? "end" : "start", lignes });
          }
        }
        P.texte(cands, `class="pt halo"`, { taille: 11, dedans: Z, priorite: 1 });
      }
      s += P.rendre();
      if (legende === "dedans") {
        avecLibelle.forEach((se, i) => {
          const lx = g.gauche + 10, ly = g.haut + 14 + i * 16;
          s += ligne(lx, ly - 4, lx + 16, ly - 4, se.couleur, 2.4, se.tirets ? `stroke-dasharray="${se.tirets}"` : "");
          s += texte(lx + 21, ly, se.libelle, `class="halo" style="font-size:11px;font-weight:700"`);
        });
      } else {
        rangees.forEach(({ rangee, occupe }, i) => {
          let lx = (largeur - occupe) / 2 + 4;
          const ly = hauteur + 8 + i * 17;
          for (const { se, w } of rangee) {
            s += ligne(lx, ly - 4, lx + 18, ly - 4, se.couleur, se.epaisseur ? Math.max(se.epaisseur, 2.2) : 2.4, se.tirets ? `stroke-dasharray="${se.tirets}"` : "");
            s += texte(lx + 24, ly, se.libelle, `style="font-size:11px;font-weight:700"`);
            lx += w;
          }
        });
      }
      return s;
    },
  });
}

/** Échantillonne une fonction sur [a, b]. */
export const echantillon = (f, a, b, n = 80) => Array.from({ length: n + 1 }, (_, i) => {
  const x = a + ((b - a) * i) / n;
  return [x, f(x)];
});

/** Graduations 1-2-5 d'un axe logarithmique sur [a, b]. */
function graduationsLog(a, b) {
  const t = [];
  for (let n = Math.floor(Math.log10(a)); n <= Math.ceil(Math.log10(b)); n++) {
    for (const m of [1, 2, 5]) { const v = m * 10 ** n; if (v >= a * 0.999 && v <= b * 1.001) t.push(v); }
  }
  return t;
}
