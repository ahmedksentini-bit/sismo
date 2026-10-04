// Schémas des notes de calcul : une figure explicative par étape qui le demande, dessinée avec les valeurs mêmes
// du calcul (géométrie des rais, triangle de la profondeur, lacune, angles d'une faille, fenêtres de déclusterage,
// cercle de Mohr, loi normale, zone source, contraintes, lois force–déplacement…). SVG pur, sans accès au DOM :
// le chapitre appelle la fonction et passe la chaîne à `ui.noter` (étape { schema, legende }).
import { svg, texte, ligne, graphe, largeurTexte, COULEURS } from "./figures.js";
import { RAD, chemin, titre, fleche, doubleFleche, etoile, station, cadre, projeter } from "./traits.js";

/** Nombre à la française, c chiffres significatifs, vrai signe moins. */
const fr = (x, c = 3) => (Number.isFinite(x) ? Number(x).toLocaleString("fr-FR", { maximumSignificantDigits: c }).replace("-", "−") : "—");
/** Nombre à la française, d décimales. */
const frd = (x, d = 1) => (Number.isFinite(x) ? Number(x).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).replace("-", "−") : "—");
const borne = (x, a, b) => Math.min(b, Math.max(a, x));
/** Écriture scientifique pour `riche` : 6,00·10^{18}. */
const sci = (x) => { const p = Math.floor(Math.log10(Math.abs(x))); return `${frd(x / 10 ** p, 2)}·10^{${String(p).replace("-", "−")}}`; };
const arcPts = (cx, cy, r, a1, a2, n = 24) => Array.from({ length: n + 1 }, (_, k) => { const a = a1 + ((a2 - a1) * k) / n; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; });
const echapper = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** Texte à indices et exposants : « i_c », « x_{crit} » (indice abaissé, plus petit), « 10^{18} » (exposant). */
function riche(x, y, s, attrs = "") {
  let n = 0;
  const h = echapper(s).replace(/_\{([^}]*)\}|_([0-9A-Za-zà-ÿ])|\^\{([^}]*)\}/g, (_, a, b, c) => {
    n++;
    return c !== undefined ? `<tspan dy="-5" style="font-size:75%">${c}</tspan><tspan dy="5">` : `<tspan dy="3" style="font-size:78%">${a ?? b}</tspan><tspan dy="-3">`;
  });
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${attrs}>${h}${"</tspan>".repeat(n)}</text>`;
}
/** Étiquette à liseré blanc (indices permis). */
const et = (x, y, s, couleur = COULEURS.encre, ancre = "start", taille = 11.5) => riche(x, y, s, `text-anchor="${ancre}" class="halo" style="font-size:${taille}px;font-weight:700;fill:${couleur}"`);
/** Étiquette centrée sur x mais gardée entre les bornes gauche et droite de la figure. */
const etBorne = (x, y, s, couleur, taille, gauche, droite) => {
  const w = largeurTexte(s.replace(/_\{([^}]*)\}|_/g, "$1"), taille) / 2 + 2;
  return et(borne(x, gauche + w, droite - w), y, s, couleur, "middle", taille);
};
/** Note discrète (indices permis). */
const nt = (x, y, s, ancre = "start") => riche(x, y, s, `text-anchor="${ancre}" class="pt"`);
const arc = (cx, cy, r, a1, a2, couleur, ep = 1.6) => `<path d="${chemin(arcPts(cx, cy, r, a1, a2))}" fill="none" stroke="${couleur}" stroke-width="${ep}"/>`;

/**
 * Échelle d'une coupe : largeur utile W pour l'étendue horizontale Lx, hauteur visée entre hmin et hmax pour
 * l'étendue verticale Lz ; exagération verticale k quand l'échelle commune donnerait une coupe trop plate ou trop haute.
 */
function echelleCoupe(W, Lx, Lz, hmin = 120, hmax = 230) {
  const sx = W / Lx, h0 = Lz * sx;
  const k = h0 < hmin ? hmin / h0 : h0 > hmax ? hmax / h0 : 1;
  return { sx, sz: sx * k, k, texte: k === 1 ? "échelles horizontale et verticale égales" : k > 1 ? `échelle verticale exagérée × ${fr(k, 2)}` : `échelle verticale réduite × ${fr(k, 2)}` };
}

// ── Chapitres 1 et 6 : onde directe et onde réfractée ─────────────────────

/**
 * Coupe d'une couche (vitesse V1, épaisseur H) sur un milieu plus rapide (V2) : rai direct de la source à la station
 * et rai réfracté (descente à l'angle critique, trajet le long de l'interface, remontée), distance critique, angle
 * critique, temps des deux ondes. Unités au choix : km et s, ou m et ms (vitesses alors en m/ms).
 * noms : libellés des deux ondes ; vitesses : libellés des deux milieux ; xc : distance de croisement à marquer.
 */
export function raisCroute({ V1, V2, H, h = 0, delta, xc = null, unite = "km", uniteT = "s", noms = ["Pg", "Pn"], vitesses = null, interface: nomInterface = "Moho", largeur = 520 }) {
  const ic = Math.asin(V1 / V2), ti = ((2 * H - h) * Math.cos(ic)) / V1, xcrit = (2 * H - h) * Math.tan(ic);
  const x1 = (H - h) * Math.tan(ic), x2 = delta - H * Math.tan(ic), existe = delta >= xcrit - 1e-9;
  const xmax = Math.max(delta, xcrit, xc ?? 0) * 1.1, xmin = -0.08 * xmax, g = 40, haut = 62;
  const E = echelleCoupe(largeur - 2 * g, xmax - xmin, 1.45 * H);
  const X = (x) => g + (x - xmin) * E.sx, Z = (z) => haut + z * E.sz, bas = Z(1.45 * H);
  const tPg = Math.hypot(delta, h) / V1, tPn = delta / V2 + ti, auCroisement = xc && Math.abs(xc - delta) < 1e-6 * xmax;
  const [v1t, v2t] = vitesses ?? [`V₁ = ${fr(V1)} ${unite}/${uniteT}`, `V₂ = ${fr(V2)} ${unite}/${uniteT}`];
  return svg({
    largeur, hauteur: bas + 58, titre: `Rais ${noms[0]} et ${noms[1]}`, contenu: (id) => {
      let s = `<rect x="${g}" y="${haut}" width="${largeur - 2 * g}" height="${Z(H) - haut}" fill="#fde7c7"/>`;
      s += `<rect x="${g}" y="${Z(H)}" width="${largeur - 2 * g}" height="${bas - Z(H)}" fill="#e2d3bf"/>`;
      s += ligne(g, haut, largeur - g, haut, "#8b5a2b", 2.2) + ligne(g, Z(H), largeur - g, Z(H), "#7c5a3a", 1.4);
      // vitesses : au milieu du trajet réfracté quand il existe (la remontée longe le bord droit), sinon à droite
      s += existe ? et((X(x1) + X(x2)) / 2, Z(H) - 10, v1t, "#5b4a2f", "middle") : et(largeur - g - 6, Z(H) - 10, v1t, "#5b4a2f", "end");
      s += et(largeur - g - 6, Z(H) + 18, v2t, "#5b4a2f", "end");
      s += nt(largeur - g - 6, Z(H) + 34, nomInterface, "end");
      // rai direct
      s += fleche(id, X(0), Z(h), X(delta) - 4 * (delta > 0 ? 1 : 0), Z(0) + 4 * (h > 0 ? 1 : 0), COULEURS.bleu, 2, "fb");
      // rai réfracté, ou rai critique quand la station est trop proche
      const crit = [[X(0), Z(h)], [X(x1), Z(H)]];
      if (existe) {
        s += `<path d="${chemin([...crit, [X(x2), Z(H)], [X(delta), Z(0)]])}" fill="none" stroke="${COULEURS.effort}" stroke-width="2.2" marker-end="url(#${id}-fl)"/>`;
        s += et((X(x1) + X(x2)) / 2, Z(H) + 16, noms[1], COULEURS.effort, "middle", 12);
      } else {
        s += `<path d="${chemin([...crit, [X(x1 + 0.02 * xmax), Z(H)], [X(xcrit), Z(0)]])}" fill="none" stroke="${COULEURS.effort}" stroke-width="1.6" stroke-dasharray="6 4"/>`;
        s += et(X(xcrit) - 8, Z(H * 0.35), `rai critique`, COULEURS.effort, "end", 10.5);
      }
      s += et(X(delta * 0.55), Z(h * 0.45) - 8, noms[0], COULEURS.bleu, "middle", 12);
      // angle critique au premier point de réfraction : entre la normale et le rai incident
      const ax = X(x1), az = Z(H), a = Math.atan2(X(x1) - X(0), Z(H) - Z(h));
      s += ligne(ax, az, ax, az - 46, "#64748b", 1, 'stroke-dasharray="3 3"') + arc(ax, az, 30, -a, 0, COULEURS.violet);
      s += et(ax + 6, az - 34, `i_c = ${frd(ic / RAD, 1)}°`, COULEURS.violet);
      // cotes : Δ, distance critique, H et h
      s += doubleFleche(id, X(0), haut - 40, X(delta), haut - 40) + etBorne((X(0) + X(delta)) / 2, haut - 45, `Δ = ${fr(delta)} ${unite}${auCroisement ? " (croisement)" : ""}`, COULEURS.reaction, 11, 4, largeur - 4);
      s += doubleFleche(id, X(0), haut - 14, X(xcrit), haut - 14) + etBorne((X(0) + X(xcrit)) / 2, haut - 19, `x_{crit} = (2H − h)·tan i_c = ${fr(xcrit)} ${unite}`, COULEURS.cote, 11, 4, largeur - 4);
      s += doubleFleche(id, largeur - g + 12, haut, largeur - g + 12, Z(H)) + et(largeur - g + 8, (haut + Z(H)) / 2 + 4, `H = ${fr(H)}`, COULEURS.cote, "end", 11);
      if (h > 0) s += doubleFleche(id, X(0) - 14, haut, X(0) - 14, Z(h)) + et(X(0) - 18, (haut + Z(h)) / 2 + 4, `h = ${fr(h)}`, COULEURS.cote, "end", 11);
      if (xc && !auCroisement && xc <= xmax) s += ligne(X(xc), haut - 4, X(xc), haut + 7, COULEURS.encre, 2) + et(X(xc), haut + 20, `croisement ${fr(xc)} ${unite}`, COULEURS.encre, "middle", 10.5);
      s += etoile(X(0), Z(h), h > 0 ? 9 : 8) + station(X(delta), Z(0) - 1);
      // temps des deux ondes
      const l1 = `${noms[0]} : √(Δ² + h²)/V₁ = ${frd(tPg, 2)} ${uniteT}`;
      const l2 = existe ? `${noms[1]} : Δ/V₂ + tᵢ = ${frd(delta / V2, 2)} + ${frd(ti, 2)} = ${frd(tPn, 2)} ${uniteT}` : `${noms[1]} : n'existe qu'au-delà de x_{crit} (tirets : rai critique)`;
      s += et(g, bas + 18, l1, COULEURS.bleu, "start", 11.5) + et(g, bas + 34, l2, COULEURS.effort, "start", 11.5);
      s += nt(largeur - g, bas + 50, E.texte, "end");
      return s;
    },
  });
}

// ── Chapitre 1 : la règle S − P et l'heure d'origine ──────────────────────

/** Diagramme temps–distance : les droites des ondes P et S partent de l'heure d'origine ; à R, leur écart est S − P. */
export function heureOrigine({ tP, tS, Vp, Vs, t0, R, largeur = 520 }) {
  const xmax = Math.max(10, Math.ceil((R * 1.3) / 10) * 10), ymin = Math.min(0, Math.floor(t0)), ymax = Math.ceil(Math.max(tS, t0 + xmax / Vs) * 1.05);
  return graphe({
    largeur, hauteur: 260, xmin: 0, xmax, ymin, ymax,
    xlabel: "distance au foyer (km)", ylabel: "temps (s)",
    series: [
      { points: [[0, t0], [xmax, t0 + xmax / Vp]], couleur: COULEURS.effort, epaisseur: 2.2, libelle: `onde P : t = t₀ + R/${fr(Vp)}` },
      { points: [[0, t0], [xmax, t0 + xmax / Vs]], couleur: COULEURS.bleu, epaisseur: 2.2, libelle: `onde S : t = t₀ + R/${fr(Vs)}` },
      { points: [[R, tP], [R, tS]], couleur: COULEURS.encre, epaisseur: 4, libelle: `S − P = ${frd(tS - tP, 1)} s, lu à la station` },
    ],
    marques: [
      { x: 0, y: t0, couleur: COULEURS.violet, libelle: `t₀ = ${frd(t0, 1)} s` },
      { x: R, y: tP, couleur: COULEURS.effort, guides: true, rayon: 4, libelle: `P ${frd(tP, 1)} s` },
      { x: R, y: tS, couleur: COULEURS.bleu, rayon: 4, libelle: `S ${frd(tS, 1)} s` },
    ],
    textes: [{ x: R, y: ymin + 0.06 * (ymax - ymin), texte: `R = ${fr(R)} km`, couleur: COULEURS.encre }],
  });
}

// ── Chapitre 2 : la lacune azimutale ──────────────────────────────────────

/** Rose des azimuts des stations vues de l'épicentre ; écarts entre stations voisines et plus grand secteur vide. */
export function rosaceAzimuts({ stations, largeur = 520 }) {
  const az = stations.map((s) => ((s.az % 360) + 360) % 360), ordre = az.map((a, i) => i).sort((i, j) => az[i] - az[j]);
  const ecarts = ordre.map((i, k) => { const j = ordre[(k + 1) % ordre.length]; return { de: az[i], a: az[j] + (k + 1 === ordre.length ? 360 : 0) }; });
  const gap = ecarts.reduce((m, e) => (e.a - e.de > m.a - m.de ? e : m), ecarts[0]), lacune = gap.a - gap.de;
  const R = 96, cx = 174, cy = 158, dmax = Math.max(...stations.map((s) => s.d), 1e-9);
  const P = (a, r) => [cx + r * Math.sin(a * RAD), cy - r * Math.cos(a * RAD)];
  return svg({
    largeur, hauteur: 306, titre: "Lacune azimutale vue de l'épicentre", contenu: (id) => {
      const sect = Array.from({ length: 41 }, (_, k) => P(gap.de + (lacune * k) / 40, R + 14));
      let s = `<path d="M${cx} ${cy}${chemin(sect).replace(/^M/, "L")}Z" fill="#fecaca" opacity="0.6"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${R + 14}" fill="none" stroke="#cbd5e1" stroke-dasharray="3 3"/>`;
      s += fleche(id, cx, cy, cx, cy - R - 22, COULEURS.encre, 1.2, "fc");
      s += texte(cx + 8, cy - R - 16, "N", 'style="font-weight:800"');
      for (const e of ecarts) {
        const w = e.a - e.de;
        if (w < 25 && e !== gap) continue;
        const [x, y] = P((e.de + e.a) / 2, R + 30);
        s += et(x, y + 4, `${frd(w, 0)}°`, e === gap ? COULEURS.rouge : COULEURS.discret, "middle", e === gap ? 12 : 10.5);
      }
      stations.forEach((st, i) => {
        const [x, y] = P(az[i], 26 + (R - 26) * (st.d / dmax)), gauche = x < cx - 1;
        s += ligne(cx, cy, x, y, "#94a3b8", 1) + station(x, y + 4) + et(x + (gauche ? -9 : 9), y - 4, `${st.nom} ${frd(az[i], 0)}°`, COULEURS.reaction, gauche ? "end" : "start", 10.5);
      });
      s += etoile(cx, cy, 8);
      const tx = 336;
      [["Azimut : angle depuis le nord,", true], ["vu de l'épicentre, vers l'est.", false], ["", false], [`Plus grand secteur sans station :`, true],
        [`${frd(lacune, 0)}° (de ${frd(gap.de % 360, 0)}° à ${frd(gap.a % 360, 0)}°)`, false], ["", false],
        [lacune > 180 ? "> 180° : séisme hors du réseau," : "< 180° : séisme entouré,", true], [lacune > 180 ? "épicentre mal contraint vers" : "épicentre bien contraint.", false], [lacune > 180 ? "la lacune." : "", false]]
        .forEach(([l, gras], k) => { if (l) s += texte(tx, 40 + 16 * k, l, gras ? `style="font-size:11.5px;font-weight:800;fill:${k === 6 ? (lacune > 180 ? COULEURS.rouge : COULEURS.reaction) : COULEURS.encre}"` : 'class="pt"'); });
      return s;
    },
  });
}

// ── Chapitre 2 : la profondeur par la station la plus proche ──────────────

/**
 * Coupe épicentre–station–foyer : h = √(R² − Δ²). Les arcs de rayon R − 8,4e et R + 8,4e, centrés sur la station,
 * coupent la verticale de l'épicentre en h− et h+ : l'erreur de lecture s'amplifie quand Δ grandit devant h.
 */
export function triangleProfondeur({ D, h, R, Rm = null, Rp = null, largeur = 520 }) {
  const g = 54, xmin = -0.18 * Math.max(D, h), xmax = Math.max(D * 1.08 + 0.05 * h, D + 0.5 * h), zmax = Math.max(h, Rp ? Math.sqrt(Math.max(Rp * Rp - D * D, 0)) : h) * 1.18;
  const E = echelleCoupe(largeur - 2 * g, xmax - xmin, zmax, 130, 240), haut = 34;
  const X = (x) => g + (x - xmin) * E.sx, Z = (z) => haut + z * E.sz, bas = Z(zmax);
  const hDe = (r) => (r > D ? Math.sqrt(r * r - D * D) : null);
  return svg({
    largeur, hauteur: bas + 56, titre: "Profondeur par la station la plus proche", contenu: (id) => {
      let s = `<rect x="${g - 20}" y="${haut}" width="${largeur - 2 * g + 40}" height="${bas - haut}" fill="#fde7c7"/>` + ligne(g - 20, haut, largeur - g + 20, haut, "#8b5a2b", 2.2);
      // arcs centrés sur la station (ellipses si l'échelle verticale est exagérée)
      const arcR = (r, couleur, ep, tirets) => {
        const hz = hDe(r);
        if (hz === null) return "";
        const t0 = Math.atan2(hz, D), pts = [];
        for (let k = -30; k <= 30; k++) { const t = t0 + (k / 30) * 0.22; if (t > 0 && t < Math.PI / 2) pts.push([X(D - r * Math.cos(t)), Z(r * Math.sin(t))]); }
        return `<path d="${chemin(pts)}" fill="none" stroke="${couleur}" stroke-width="${ep}" ${tirets ? `stroke-dasharray="${tirets}"` : ""}/>`;
      };
      s += `<clipPath id="${id}-c"><rect x="${g - 20}" y="${haut}" width="${largeur - 2 * g + 40}" height="${bas - haut}"/></clipPath>`;
      s += ligne(X(0), haut, X(0), bas, "#94a3b8", 1, 'stroke-dasharray="4 3"');
      for (const [r, nom] of [[Rm, "−"], [Rp, "+"]]) {
        if (!r) continue;
        s += `<g clip-path="url(#${id}-c)">${arcR(r, COULEURS.violet, 1.3, "5 3")}</g>`;
        const hz = hDe(r);
        if (hz !== null) s += `<circle cx="${X(0)}" cy="${Z(hz)}" r="3" fill="${COULEURS.violet}"/>` + et(X(0) + 7, Z(hz) + (nom === "+" ? 13 : -5), `h${nom} = ${fr(hz)} km`, COULEURS.violet, "start", 10.5);
      }
      s += `<g clip-path="url(#${id}-c)">${arcR(R, COULEURS.effort, 1.2, "2 3")}</g>`;
      s += ligne(X(D), Z(0), X(0), Z(h), COULEURS.effort, 2.2);
      s += doubleFleche(id, X(0), haut - 12, X(D), haut - 12) + et((X(0) + X(D)) / 2, haut - 17, `Δ = ${fr(D)} km`, COULEURS.cote, "middle");
      s += doubleFleche(id, X(0) - 16, haut, X(0) - 16, Z(h)) + et(X(0) - 20, (haut + Z(h)) / 2 + 4, `h = ${fr(h)} km`, COULEURS.cote, "end");
      s += `<path d="M${X(0)} ${haut + 10}h10v-10" fill="none" stroke="${COULEURS.cote}" stroke-width="1"/>`;
      const mx = (X(D) + X(0)) / 2, mz = (Z(0) + Z(h)) / 2;
      s += et(mx + 8, mz + 16, `R = 8,4 × (S − P) = ${fr(R)} km`, COULEURS.effort);
      s += etoile(X(0), Z(h), 9) + station(X(D), Z(0) - 1) + `<circle cx="${X(0)}" cy="${Z(0)}" r="3.5" fill="${COULEURS.effort}"/>`;
      s += et(X(D), haut + 22, "station", COULEURS.reaction, "middle", 10.5);
      if (Rm) s += nt(g - 20, bas + 18, "Arcs violets : rayons R ± 8,4·e, centrés sur la station (e : erreur de lecture de S − P) ;") + nt(g - 20, bas + 33, "ils coupent la verticale de l'épicentre en h− et h+.");
      s += nt(largeur - g + 20, bas + 48, E.texte, "end");
      return s;
    },
  });
}

// ── Chapitre 3 : la faille, ses angles et ses vecteurs ────────────────────

/** Nature d'un mécanisme d'après le glissement λ (en degrés), avec sa composante secondaire. */
export function natureMecanisme(lambda) {
  const l = ((((lambda + 180) % 360) + 360) % 360) - 180, a = Math.abs(l);
  if (a > 30 && a < 150) return `faille ${l > 0 ? "inverse" : "normale"}${a >= 75 && a <= 105 ? " pure" : " à composante de décrochement"}`;
  return `décrochement ${a < 90 ? "sénestre" : "dextre"}${a > 15 && a < 165 ? ` à composante ${l > 0 ? "inverse" : "normale"}` : ""}`;
}

/**
 * À gauche, vue en plan : le nord, la trace de la faille à l'azimut φ et le sens du pendage (à droite de la trace).
 * À droite, bloc diagramme dans le repère de la faille (trace de gauche à droite, plan plongeant vers l'observateur,
 * toit enlevé) : pendage δ, glissement λ compté dans le plan depuis la trace, vecteur glissement u du toit, normale n.
 */
export function failleLocale({ phi, delta, lambda, largeur = 520 }) {
  const f = phi * RAD, d = delta * RAD, l = lambda * RAD, H = 262;
  const P = projeter(176, 118, 1), sv = [1, 0, 0], b = [0, -Math.cos(d), -Math.sin(d)], up = b.map((v) => -v);
  const u = sv.map((v, i) => Math.cos(l) * v + Math.sin(l) * up[i]), n = [0, -Math.sin(d), Math.cos(d)];
  const O = [120, 44, 0], Lf = 150, W = 92, pt = (a, c) => O.map((v, i) => v + a * sv[i] + c * b[i]);
  const add = (A, B, k = 1) => A.map((v, i) => v + k * B[i]);
  const arc3 = (C, e1, e2, r, t1) => chemin(Array.from({ length: 25 }, (_, k) => { const t = (k / 24) * t1; return P(C.map((c, j) => c + r * (Math.cos(t) * e1[j] + Math.sin(t) * e2[j]))); }));
  return svg({
    largeur, hauteur: H, titre: "Angles et vecteurs du plan de faille", contenu: (id) => {
      // vue en plan
      const cx = 74, cy = 104, R = 44, Pm = (a, r) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
      let s = titre(cx, 24, "Vue en plan", "middle") + `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#fdf2e0" stroke="#cbd5e1"/>`;
      s += fleche(id, cx, cy, cx, cy - R - 8, COULEURS.encre, 1.4, "fc") + texte(cx + 6, cy - R - 2, "N", 'style="font-weight:800"');
      s += `<path d="${chemin([Pm(f + Math.PI, R), Pm(f, R)])}" stroke="#8b5a2b" stroke-width="3.2"/>` + fleche(id, ...Pm(f, R - 6), ...Pm(f, R + 4), "#8b5a2b", 1.6, "fc");
      s += fleche(id, cx, cy, ...Pm(f + Math.PI / 2, R * 0.62), COULEURS.violet, 1.6, "fc");
      s += `<path d="${chemin(Array.from({ length: 21 }, (_, k) => Pm((f * k) / 20, 22)))}" fill="none" stroke="${COULEURS.bleu}" stroke-width="2"/>`;
      s += et(cx, cy + R + 18, `φ = ${fr(phi, 3)}°`, COULEURS.bleu, "middle", 11.5) + nt(cx, cy + R + 32, "azimut de la trace", "middle");
      s += et(cx, cy + R + 48, "pendage : à droite", COULEURS.violet, "middle", 10.5) + et(cx, cy + R + 61, "de la trace", COULEURS.violet, "middle", 10.5);
      // bloc dans le repère de la faille : le mur (derrière la trace) ; le toit, devant, est enlevé
      const sol = [[0, O[1], 0], [240, O[1], 0], [240, 150, 0], [0, 150, 0]].map(P);
      s += `<path d="${chemin(sol, true)}" fill="#fde7c7" stroke="#8b5a2b" stroke-width="1.1"/>`;
      const plan = [pt(-Lf / 2, 0), pt(Lf / 2, 0), pt(Lf / 2, W), pt(-Lf / 2, W)].map(P);
      s += `<path d="${chemin(plan, true)}" fill="rgba(148,163,184,.55)" stroke="#475569" stroke-width="1.1"/>`;
      s += `<path d="${chemin([P(pt(-Lf / 2, 0)), P(pt(Lf / 2, 0))])}" stroke="#8b5a2b" stroke-width="3"/>`;
      s += fleche(id, ...P(pt(Lf / 2 - 20, 0)), ...P(pt(Lf / 2 + 22, 0)), "#8b5a2b", 1.6, "fc") + et(...P(pt(Lf / 2 + 26, 0)).map((q, i) => q + [0, 4][i]), "trace", "#8b5a2b", "start", 10.5);
      // pendage δ : dans le plan vertical perpendiculaire à la trace, au bout gauche
      const B0 = pt(-Lf / 2 + 10, 0), hz = [0, -1, 0];
      s += `<path d="${chemin([P(B0), P(add(B0, hz, 58))])}" stroke="#64748b" stroke-width="1" stroke-dasharray="4 3"/>`;
      s += `<path d="${arc3(B0, hz, [0, 0, -1], 36, d)}" fill="none" stroke="${COULEURS.violet}" stroke-width="2"/>`;
      s += et(...P(add(B0, hz, 60)).map((q, i) => q + [-4, 4][i]), `δ = ${fr(delta, 3)}°`, COULEURS.violet, "end", 11);
      // glissement λ et vecteur u du toit, au centre du plan
      const C0 = pt(-16, W * 0.58);
      s += `<path d="${chemin([P(C0), P(add(C0, sv, 54))])}" stroke="#64748b" stroke-width="1" stroke-dasharray="4 3"/>`;
      s += `<path d="${arc3(C0, sv, up, 26, l)}" fill="none" stroke="${COULEURS.reaction}" stroke-width="2"/>`;
      s += fleche(id, ...P(C0), ...P(add(C0, u, 48)), COULEURS.effort, 2.6);
      s += et(...P(add(C0, u, 54)).map((q, i) => q + [Math.cos(l) >= 0 ? 4 : -4, 4][i]), "u", COULEURS.effort, Math.cos(l) >= 0 ? "start" : "end", 13);
      const mil = sv.map((v, i) => Math.cos(l / 2) * v + Math.sin(l / 2) * up[i]), q = P(add(C0, mil, 34));
      s += et(q[0] + (Math.cos(l / 2) >= 0 ? 4 : -4), q[1] + 4, `λ = ${fr(lambda, 3)}°`, COULEURS.reaction, Math.cos(l / 2) >= 0 ? "start" : "end", 11);
      // normale n, vers le toit, près du bout droit
      const N0 = pt(Lf / 2 - 12, W * 0.14);
      s += fleche(id, ...P(N0), ...P(add(N0, n, 42)), COULEURS.violet, 2.2, "fc") + et(...P(add(N0, n, 48)).map((q2, i) => q2 + [4, 0][i]), "n", COULEURS.violet, "start", 13);
      s += et(...P(pt(Lf / 2, W)).map((q2, i) => q2 + [6, 4][i]), "plan de faille", "#475569", "start", 10.5);
      s += nt(largeur - 10, H - 8, `${natureMecanisme(lambda)} · u : glissement du toit · n : normale vers le toit`, "end");
      return s;
    },
  });
}

// ── Chapitre 3 : angles de départ des rais ────────────────────────────────

/**
 * Coupe à travers le foyer : direction de départ de quelques rais, comptée depuis la verticale descendante
 * (rai direct montant vers la station proche : i > 90° ; rai réfracté sur le Moho : i = i_c < 90°).
 * rais : [{ nom, delta, i }] ; h et H en km.
 */
export function departs({ h, H, rais, largeur = 520 }) {
  const g = 20, haut = 26, Hp = 180, s1 = Hp / (H * 1.25), cx = g + 44, X = (x) => cx + x * s1, Z = (z) => haut + z * s1, droite = largeur - g;
  const xlim = (droite - cx) / s1, bas = haut + Hp, COUL = [COULEURS.bleu, COULEURS.effort, COULEURS.violet, COULEURS.reaction];
  return svg({
    largeur, hauteur: bas + 30 + 17 * rais.length, titre: "Angles de départ des rais au foyer", contenu: (id) => {
      let s = `<rect x="${g}" y="${haut}" width="${droite - g}" height="${Z(H) - haut}" fill="#fde7c7"/><rect x="${g}" y="${Z(H)}" width="${droite - g}" height="${bas - Z(H)}" fill="#e2d3bf"/>`;
      s += ligne(g, haut, droite, haut, "#8b5a2b", 2.2) + ligne(g, Z(H), droite, Z(H), "#7c5a3a", 1.4) + nt(droite - 4, Z(H) + 14, "Moho", "end");
      s += ligne(X(0), Z(h), X(0), Z(H) - 2, "#334155", 1.2, 'stroke-dasharray="4 3"') + et(X(0) + 6, Z(H) - 8, "i = 0 : verticale descendante", "#334155", "start", 10);
      rais.forEach((r, k) => {
        const i = r.i * RAD, col = COUL[k % 4];
        let pts;
        if (r.i > 90) {
          // rai direct montant : il atteint la surface à Δ
          pts = r.delta <= xlim ? [[X(0), Z(h)], [X(r.delta), Z(0)]] : [[X(0), Z(h)], [X(xlim), Z(h - xlim / Math.tan(Math.PI - i))]];
        } else {
          const x1 = (H - h) * Math.tan(i);
          pts = [[X(0), Z(h)], [X(Math.min(x1, xlim)), Z(Math.min(H, h + Math.min(x1, xlim) / Math.tan(i)))]];
          if (x1 < xlim) pts.push([X(xlim), Z(H)]);
        }
        const fin = pts[pts.length - 1];
        s += `<path d="${chemin(pts)}" fill="none" stroke="${col}" stroke-width="2" marker-end="url(#${id}-fl)"/>`;
        s += arc(X(0), Z(h), 20 + 11 * k, Math.PI, Math.PI - i, col, 1.4);
        s += et(Math.min(fin[0], droite - 12), fin[1] + (r.i > 90 ? 15 : -7), `${k + 1}`, col, "middle", 12);
        s += `<path d="M${g} ${bas + 17 * k + 20}h22" stroke="${col}" stroke-width="2.4"/>` + et(g + 28, bas + 17 * k + 24, `${k + 1}. ${r.nom} : Δ = ${fr(r.delta)} km → i = ${frd(r.i, 0)}° (${r.i > 90 ? "Pg montante : i = 180° − arctan(Δ/h)" : "Pn : i = arcsin(Vp/Vp₂)"})`, col, "start", 11);
      });
      s += etoile(X(0), Z(h), 9) + et(X(0) + 10, Z(h) + 16, `foyer, h = ${fr(h)} km`, COULEURS.encre, "start", 10.5);
      return s;
    },
  });
}

// ── Chapitre 4 : la surface rompue et le moment ───────────────────────────

/** Rectangle rompu L × W et glissement D, face à l'aire médiane de Wells et Coppersmith (1994) de même allongement. */
export function ruptureMoment({ L, W, D, Awc, M0, Mw, largeur = 520 }) {
  const A = L * W, k = Math.sqrt(Awc / A), Lw = L * k, Ww = W * k, g = 24, utile = (largeur - 3 * g) / 2;
  const e = Math.min(utile / Math.max(L, Lw), 140 / Math.max(W, Ww)), hR = Math.max(W * e, 4), hW = Math.max(Ww * e, 4), haut = 46, Hc = Math.max(hR, hW);
  return svg({
    largeur, hauteur: haut + Hc + 82, titre: "Surface rompue et moment sismique", contenu: (id) => {
      let s = titre(g, 22, "Rupture saisie") + titre(2 * g + utile, 22, "Wells et Coppersmith, même Mw");
      const x1 = g, y1 = haut + (Hc - hR) / 2;
      s += `<rect x="${x1}" y="${y1}" width="${(L * e).toFixed(1)}" height="${hR.toFixed(1)}" fill="rgba(220,38,38,.2)" stroke="${COULEURS.effort}" stroke-width="1.4"/>`;
      // glissement : les deux lèvres se décalent de D
      const xm = x1 + (L * e) / 2, ym = y1 + hR / 2;
      if (hR >= 22) s += fleche(id, xm - 26, ym - 7, xm + 14, ym - 7, COULEURS.effort, 1.8) + fleche(id, xm + 26, ym + 7, xm - 14, ym + 7, COULEURS.effort, 1.8);
      s += nt(x1, haut + Hc + 20, `L × W = ${fr(L)} × ${fr(W)} km, A = ${fr(A)} km², D = ${fr(D)} m`);
      const x2 = 2 * g + utile, y2 = haut + (Hc - hW) / 2;
      s += `<rect x="${x2}" y="${y2}" width="${(Lw * e).toFixed(1)}" height="${hW.toFixed(1)}" fill="rgba(3,105,161,.15)" stroke="${COULEURS.bleu}" stroke-width="1.4" stroke-dasharray="5 3"/>`;
      s += nt(x2, haut + Hc + 20, `A = ${fr(Awc)} km² (log A = −3,49 + 0,91·Mw)`);
      s += riche(g, haut + Hc + 44, `M₀ = μ·A·D = ${sci(M0)} N·m → Mw = ${frd(Mw, 2)}`, 'style="font-size:12px;font-weight:800"');
      s += nt(g, haut + Hc + 60, `Mêmes échelles : la rupture saisie est ${A > Awc ? "plus grande" : "plus petite"} que la médiane du même moment,`) + nt(g, haut + Hc + 74, `son glissement moyen ${A > Awc ? "plus faible" : "plus fort"} (D = M₀/(μA)).`);
      return s;
    },
  });
}

// ── Chapitre 5 : l'instrument sous un mouvement sinusoïdal ────────────────

/**
 * À gauche, l'instrument : bâti lié au sol (u_g), masse sur ressort et amortisseur, mouvement relatif x. À droite,
 * |X/Ug| en fonction de r = f/f₀ pour l'amortissement de l'instrument, et le point du calcul.
 */
export function instrument({ f0, xi, fs, theo, nom = "instrument", largeur = 520 }) {
  const r = fs / f0, H = 240, sol = 196;
  const c = cadre({ x0: 262, y0: 26, w: largeur - 262 - 16, h: 150, xmin: 0.01, xmax: 100, ymin: 0.0001, ymax: 100, logX: true, logY: true,
    gx: [0.01, 0.1, 1, 10, 100], gy: [0.0001, 0.01, 1, 100], fx: (v) => fr(v), fy: (v) => fr(v), xlabel: "r = f/f₀", ylabel: "|X/Ug|" });
  const rep = (q) => (q * q) / Math.sqrt((1 - q * q) ** 2 + (2 * xi * q) ** 2);
  const regime = r < 0.3 ? "r ≪ 1 : x ∝ accélération du sol" : r > 3 ? "r ≫ 1 : x ≈ déplacement du sol" : "r ≈ 1 : résonance";
  return svg({
    largeur, hauteur: H, titre: `${nom} sous un mouvement sinusoïdal`, contenu: (id) => {
      let s = `<rect x="10" y="${sol}" width="226" height="30" fill="#e9c99a"/>` + ligne(10, sol, 236, sol, "#8b5a2b", 2);
      const bx = 60, bw = 130, top = 40;
      s += `<path d="M${bx} ${sol}V${top}H${bx + bw}V${sol}" fill="none" stroke="${COULEURS.trait}" stroke-width="4" stroke-linejoin="round"/>`;
      const mx = bx + 34, my = 112, mw = 62, mh = 36, kx = mx + 14;
      const pts = [[kx, top + 2], [kx, top + 8]];
      for (let i = 0; i < 9; i++) pts.push([kx + (i % 2 ? -7 : 7), top + 8 + ((i + 0.5) * (my - top - 16)) / 9]);
      pts.push([kx, my - 8], [kx, my]);
      s += `<path d="${chemin(pts)}" fill="none" stroke="${COULEURS.trait}" stroke-width="1.6"/>`;
      const ax = mx + mw - 14;
      s += ligne(ax, top + 2, ax, my - 34, COULEURS.trait, 1.6) + `<rect x="${ax - 7}" y="${my - 38}" width="14" height="24" fill="#fff" stroke="${COULEURS.trait}" stroke-width="1.6"/>` + ligne(ax, my - 26, ax, my, COULEURS.trait, 1.6);
      s += `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="4" fill="#475569"/>` + texte(mx + mw / 2, my + 23, "m", 'text-anchor="middle" style="font-size:14px;font-weight:800;fill:#fff"');
      s += et(kx - 10, top + 36, "k", COULEURS.trait, "end") + et(ax + 11, my - 22, "c", COULEURS.trait);
      s += doubleFleche(id, mx - 14, my - 4, mx - 14, my + mh + 4, COULEURS.effort) + et(mx - 18, my + mh / 2 + 4, "x", COULEURS.effort, "end", 13);
      s += doubleFleche(id, 30, sol - 54, 30, sol - 8, COULEURS.bleu) + et(36, sol - 60, "u_g", COULEURS.bleu, "start", 12);
      s += nt(123, sol + 20, `f₀ = ${fr(f0)} Hz, ξ = ${fr(xi)}, sol à ${fr(fs)} Hz`, "middle");
      // réponse en fréquence
      s += c.s + c.trace(Array.from({ length: 161 }, (_, k) => { const q = 10 ** (-2 + (4 * k) / 160); return [q, rep(q)]; }), COULEURS.bleu, 2.2);
      s += c.trace([[0.01, 1], [100, 1]], "#94a3b8", 1, 'stroke-dasharray="4 3"');
      if (r >= 0.01 && r <= 100) {
        const y = Math.max(theo, 1e-4);
        s += `<circle cx="${c.X(r).toFixed(1)}" cy="${c.Y(y).toFixed(1)}" r="5" fill="${COULEURS.effort}" stroke="#fff" stroke-width="1.5"/>`;
        s += et(c.X(r) + (r > 3 ? -8 : 8), c.Y(y) + (r > 3 ? 18 : -8), `r = ${fr(r)} → ${fr(theo)}`, COULEURS.effort, r > 3 ? "end" : "start", 11);
      }
      s += nt(c.X(100), 222, regime, "end");
      return s;
    },
  });
}

// ── Chapitre 6 : la phase de profondeur pP ────────────────────────────────

/**
 * Géométrie plane près du foyer : P part vers le bas à l'angle i, pP monte au même angle, se réfléchit à la surface
 * et repart parallèle à P. Le miroir du foyer montre le chemin supplémentaire 2h·cos i (avant le front d'onde commun).
 */
export function pPgeometrie({ h, i, v, retard = null, largeur = 520 }) {
  const surf = 112, sy = 212, hp = sy - surf, sx = 160, a = i * RAD, d = [Math.sin(a), Math.cos(a)], H = 350;
  const S = [sx, sy], I = [sx, surf - hp], Rf = [sx + hp * Math.tan(a), surf];
  // pied F de la perpendiculaire abaissée de S sur la droite I → Rf (prolongée) : IF = 2h·cos i
  const t = (S[0] - I[0]) * d[0] + (S[1] - I[1]) * d[1], F = [I[0] + t * d[0], I[1] + t * d[1]];
  const L = (H - 64 - sy) / Math.cos(a), Pfin = [S[0] + L * d[0], S[1] + L * d[1]], Qfin = [F[0] + L * d[0], F[1] + L * d[1]], n = [d[1], -d[0]];
  return svg({
    largeur, hauteur: H, titre: "Chemin supplémentaire de pP", contenu: (id) => {
      let s = `<rect x="10" y="${surf}" width="${largeur - 20}" height="${H - surf - 50}" fill="#fde7c7"/>` + ligne(10, surf, largeur - 10, surf, "#8b5a2b", 2.2);
      s += nt(largeur - 14, surf - 6, "surface libre : miroir", "end");
      // chemin en plus, surligné sous les rais : de l'image du foyer au front d'onde commun
      s += `<path d="${chemin([I, F])}" stroke="#fdba74" stroke-width="9" stroke-linecap="round" fill="none"/>`;
      s += ligne(sx, I[1], sx, sy, "#94a3b8", 1, 'stroke-dasharray="3 3"');
      s += `<path d="${chemin([I, Rf])}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="5 4" fill="none"/>`;
      s += `<circle cx="${I[0]}" cy="${I[1]}" r="7" fill="#fff" stroke="${COULEURS.effort}" stroke-width="1.6"/>` + et(I[0] + 12, I[1] + 4, "image du foyer, à h au-dessus de la surface", COULEURS.discret, "start", 10.5);
      // rais P et pP
      s += fleche(id, ...S, ...Pfin, COULEURS.effort, 2.2) + et(Pfin[0] + 6, Pfin[1] + 4, "P", COULEURS.effort, "start", 13);
      s += `<path d="${chemin([S, Rf, Qfin])}" fill="none" stroke="${COULEURS.violet}" stroke-width="2.2" marker-end="url(#${id}-fc)"/>` + et(Qfin[0] + 6, Qfin[1] + 4, "pP", COULEURS.violet, "start", 13);
      // front d'onde commun : au-delà, P et pP font le même chemin jusqu'à la station lointaine
      s += ligne(S[0] - 46 * n[0], S[1] - 46 * n[1], F[0] + 40 * n[0], F[1] + 40 * n[1], COULEURS.reaction, 1.4, 'stroke-dasharray="6 3"');
      s += et(F[0] + 44 * n[0] + 4, F[1] + 44 * n[1] - 2, "front d'onde commun", COULEURS.reaction, "start", 10.5);
      const M = [(I[0] + F[0]) / 2, (I[1] + F[1]) / 2];
      s += et(M[0] + 12, M[1] - 18, "chemin en plus : 2h·cos i", "#c2410c", "start", 12);
      // angle i au foyer, cote h
      s += ligne(sx, sy, sx, sy + 58, "#64748b", 1, 'stroke-dasharray="3 3"') + arc(sx, sy, 38, Math.PI, Math.PI - a, COULEURS.violet);
      s += et(sx - 6, sy + 52, `i = ${frd(i, 1)}°`, COULEURS.violet, "end", 11);
      s += doubleFleche(id, sx - 26, surf, sx - 26, sy) + et(sx - 30, (surf + sy) / 2 + 4, `h = ${fr(h)} km`, COULEURS.cote, "end", 11);
      s += etoile(sx, sy, 9) + et(sx + 12, sy + 4, "foyer", COULEURS.encre, "start", 10.5);
      s += nt(14, H - 24, `pP − P ≈ 2h·cos i / v = 2 × ${fr(h)} × ${frd(Math.cos(a), 3)} / ${frd(v, 2)} = ${frd((2 * h * Math.cos(a)) / v, 1)} s${retard !== null ? `, rais dans ak135 : ${frd(retard, 1)} s` : ""}`);
      s += nt(14, H - 8, "Le rai réfléchi part de l'image du foyer : jusqu'au front d'onde, il parcourt 2h·cos i de plus que P.");
      return s;
    },
  });
}

// ── Chapitres 7 et 14 : les branches du spectre de l'EN 1998-1:2004 ────────

/**
 * Spectre en périodes logarithmiques, découpé en ses quatre branches (montée, plateau, 1/T, 1/T²) ; point à la
 * période du calcul. courbe(T) : le spectre étudié ; elastique(T) : le spectre élastique en tirets (spectre de calcul) ;
 * plancher : β·ag (spectre de calcul).
 */
export function branchesEC8({ courbe, elastique = null, TB, TC, TD, T, plancher = null, nom = "Se", largeur = 520 }) {
  const Ts = Array.from({ length: 161 }, (_, k) => 0.02 * 200 ** (k / 160)), v = courbe(T);
  const ymax = Math.ceil(Math.max(...Ts.map(courbe), ...(elastique ? Ts.map(elastique) : [0])) * 11) / 10;
  const zone = (x0, x1, libelle, couleur) => ({ x0, x1, y0: 0, y1: ymax, couleur, opacite: 0.07, libelle });
  return graphe({
    largeur, hauteur: 270, xmin: 0.02, xmax: 4, ymin: 0, ymax, logX: true,
    xlabel: "période T (s), échelle logarithmique", ylabel: `${nom} (g)`,
    zones: [zone(0.02, TB, "montée", COULEURS.reaction), zone(TB, TC, "plateau", COULEURS.bleu), zone(TC, TD, "∝ 1/T", COULEURS.violet), zone(TD, 4, "∝ 1/T²", COULEURS.f62)],
    series: [
      elastique && { points: Ts.map((t) => [t, elastique(t)]), couleur: COULEURS.discret, epaisseur: 1.4, tirets: "5 4", libelle: "élastique Se" },
      plancher && { points: [[0.02, plancher], [4, plancher]], couleur: COULEURS.effort, epaisseur: 1, tirets: "2 3", libelle: "plancher β·ag" },
      { points: Ts.map((t) => [t, courbe(t)]), couleur: COULEURS.bleu, epaisseur: 2.6, libelle: nom },
      ...[[TB, "TB"], [TC, "TC"], [TD, "TD"]].map(([t]) => ({ points: [[t, 0], [t, ymax]], couleur: "#94a3b8", epaisseur: 1, tirets: "3 3" })),
    ].filter(Boolean),
    textes: [[TB, "TB", 0.84], [TC, "TC", 0.74], [TD, "TD", 0.84]].map(([t, n, h]) => ({ x: t, y: ymax * h, texte: `${n} = ${fr(t, 2)} s`, couleur: COULEURS.discret, taille: 10 })),
    marques: [{ x: borne(T, 0.02, 4), y: v, couleur: COULEURS.effort, guides: true, libelle: `T = ${fr(T)} s : ${fr(v)} g` }],
  });
}

// ── Chapitre 8 : les fenêtres de Gardner et Knopoff ───────────────────────

/**
 * Séismes voisins du plus fort du catalogue, en distance et en temps écoulé depuis lui (échelle logarithmique) ;
 * la fenêtre L × T de Gardner et Knopoff (1974) ; en rouge, ceux qu'elle retire comme répliques.
 * evenements : [{ dt (jours), r (km), M, retire }].
 */
export function fenetresGK({ M, L, T, evenements, largeur = 520 }) {
  // la fenêtre du plus fort séisme est traitée la première : tout ce qu'elle contient après lui est une réplique
  const tmin = 0.01, tmax = 10 ** Math.ceil(Math.log10(3 * T)), rmax = Math.ceil((2.2 * L) / 10) * 10;
  const gx = []; for (let p = -2; 10 ** p <= tmax; p++) gx.push(10 ** p);
  const c = cadre({ x0: 64, y0: 22, w: largeur - 84, h: 190, xmin: tmin, xmax: tmax, ymin: 0, ymax: rmax, logX: true, gx, gy: [0, rmax / 4, rmax / 2, (3 * rmax) / 4, rmax],
    fx: (v) => fr(v), fy: (v) => fr(v), xlabel: "temps après le choc principal (jours)", ylabel: "distance (km)" });
  const dedans = (e) => e.dt <= T && e.r <= L, visibles = evenements.filter((e) => e.dt >= tmin && e.dt <= tmax && e.r <= rmax), retires = evenements.filter((e) => e.dt > 0 && dedans(e)).length;
  return svg({
    largeur, hauteur: 290, titre: "Fenêtre espace-temps de Gardner et Knopoff", contenu: () => {
      let s = c.s + `<rect x="${c.X(tmin)}" y="${c.Y(L)}" width="${c.X(T) - c.X(tmin)}" height="${c.Y(0) - c.Y(L)}" fill="rgba(220,38,38,.10)" stroke="${COULEURS.effort}" stroke-width="1.6" stroke-dasharray="6 3"/>`;
      for (const e of visibles) s += `<circle cx="${c.X(e.dt).toFixed(1)}" cy="${c.Y(e.r).toFixed(1)}" r="${(1.4 + 0.9 * Math.max(0, e.M - 2)).toFixed(1)}" fill="${dedans(e) ? COULEURS.effort : "#94a3b8"}" fill-opacity=".75" stroke="#fff" stroke-width=".5"/>`;
      s += et(c.X(T) - 4, c.Y(L) - 6, `L = ${fr(L)} km, T = ${fr(T)} jours`, COULEURS.effort, "end", 11);
      s += nt(64, 268, `Choc principal M ${frd(M, 1)} à l'origine des temps et des distances (temps en échelle logarithmique).`);
      s += nt(64, 283, `Dans la fenêtre, en rouge : ${retires} répliques retirées ; dehors, en gris : des séismes gardés.`);
      return s;
    },
  });
}

// ── Chapitre 8 : la probabilité de Poisson ─────────────────────────────────

/** P(au moins un) = 1 − e^(−λt) en fonction du nombre moyen λt, approximation λt, et le point du calcul. */
export function poissonCourbe({ lt, P, largeur = 520 }) {
  const xmax = Math.max(3, Math.ceil(lt * 1.25)), pts = Array.from({ length: 121 }, (_, k) => (xmax * k) / 120);
  return graphe({
    largeur, hauteur: 250, xmin: 0, xmax, ymin: 0, ymax: 100,
    xlabel: "nombre moyen d'événements λt = t / TR", ylabel: "probabilité (%)",
    series: [
      { points: pts.map((x) => [x, 100 * Math.min(x, 1.2)]), couleur: COULEURS.discret, epaisseur: 1.2, tirets: "5 4", libelle: "P ≈ λt (petites valeurs)" },
      { points: pts.map((x) => [x, 100 * (1 - Math.exp(-x) * (1 + x))]), couleur: COULEURS.violet, epaisseur: 1.6, libelle: "au moins deux" },
      { points: pts.map((x) => [x, 100 * (1 - Math.exp(-x))]), couleur: COULEURS.bleu, epaisseur: 2.6, libelle: "au moins un : 1 − e^(−λt)" },
    ],
    marques: [
      Math.abs(lt + Math.log(0.9)) > 0.08 * xmax && { x: -Math.log(0.9), y: 10, couleur: COULEURS.discret, rayon: 3.5, libelle: "10 % en 50 ans" },
      { x: Math.min(lt, xmax), y: 100 * P, couleur: COULEURS.effort, guides: true, libelle: `λt = ${fr(lt)} → ${frd(100 * P, 1)} %` },
    ].filter(Boolean),
  });
}

// ── Chapitre 9 : la faille bloquée ─────────────────────────────────────────

/**
 * Décrochement vertical vu de biais : en haut, la faille bloquée sur la profondeur D (elle accumule) ; dessous, elle
 * glisse en continu à la vitesse s ; loin de la faille, les deux plaques avancent de ±s/2. Moment : μ·L·D·s.
 */
export function failleBloquee({ s: vit, D, L, M0, largeur = 520 }) {
  const P = projeter(64, 92, 1), Lp = 290, Dp = 82, Bp = 56, prof = Dp + Bp, Yb = 150;
  const q = (x, y, z) => P([x, y, z]);
  return svg({
    largeur, hauteur: 292, titre: "Faille bloquée en surface, glissement continu en profondeur", contenu: (id) => {
      // bloc du fond (compartiment nord), face de faille visible
      let s = `<path d="${chemin([q(0, 0, 0), q(Lp, 0, 0), q(Lp, Yb, 0), q(0, Yb, 0)], true)}" fill="#fde7c7" stroke="#8b5a2b" stroke-width="1"/>`;
      s += `<path d="${chemin([q(0, 0, 0), q(Lp, 0, 0), q(Lp, 0, -Dp), q(0, 0, -Dp)], true)}" fill="rgba(220,38,38,.22)" stroke="${COULEURS.effort}" stroke-width="1.2"/>`;
      s += `<path d="${chemin([q(0, 0, -Dp), q(Lp, 0, -Dp), q(Lp, 0, -prof), q(0, 0, -prof)], true)}" fill="rgba(3,105,161,.12)" stroke="${COULEURS.bleu}" stroke-width="1.2"/>`;
      // hachures de la partie bloquée
      for (let x = 12; x < Lp; x += 18) s += `<path d="${chemin([q(x, 0, -4), q(x - 10, 0, -Dp + 4)])}" stroke="${COULEURS.effort}" stroke-width=".8" opacity=".6"/>`;
      s += et(...q(Lp / 2, 0, -Dp / 2 + 6), "bloquée : accumule", COULEURS.effort, "middle", 12);
      s += et(...q(Lp / 2, 0, -Dp / 2 - 10), `de la surface à D = ${fr(D)} km`, COULEURS.effort, "middle", 11);
      // glissement continu dessous
      for (const x of [60, 150, 240]) s += fleche(id, ...q(x - 22, 0, -Dp - Bp / 2), ...q(x + 22, 0, -Dp - Bp / 2), COULEURS.bleu, 2, "fb");
      s += et(...q(Lp / 2, 0, -prof + 9), `glisse en continu à s = ${fr(vit)} mm/an`, COULEURS.bleu, "middle", 11);
      // plaques loin de la faille
      s += fleche(id, ...q(60, Yb * 0.62, 0), ...q(130, Yb * 0.62, 0), COULEURS.reaction, 2.2, "fr") + et(...q(140, Yb * 0.62, 0).map((v, i) => v + [6, 5][i]), `loin de la faille : +s/2 = ${fr(vit / 2)} mm/an`, COULEURS.reaction, "start", 10.5);
      s += `<path d="${chemin([q(0, 0, 0), q(Lp, 0, 0)])}" stroke="#8b5a2b" stroke-width="3"/>` + et(...q(Lp + 4, 0, 0).map((v, i) => v + [4, 4][i]), "trace", "#8b5a2b", "start", 10.5);

      // cotes
      s += doubleFleche(id, ...q(0, 0, -prof - 12), ...q(Lp, 0, -prof - 12)) + et(...q(Lp / 2, 0, -prof - 26), `L = ${fr(L)} km`, COULEURS.cote, "middle", 11);
      s += doubleFleche(id, ...q(-12, 0, 0), ...q(-12, 0, -Dp)) + et(...q(-16, 0, -Dp / 2), `W = D`, COULEURS.cote, "end", 11);
      s += riche(14, 268, `Moment accumulé : Ṁ₀ = μ·L·W·s = ${sci(M0)} N·m/an`, 'style="font-size:12px;font-weight:800"');
      s += nt(14, 284, "Le compartiment d'en face, enlevé pour voir le plan, avance de −s/2 : le saut s se rattrape au séisme.");
      return s;
    },
  });
}

// ── Chapitre 9 : le cercle de Mohr des taux de déformation ────────────────

/**
 * Cercle de Mohr du tenseur horizontal (ns/an) : points (ε̇xx ; ε̇xy) et (ε̇yy ; −ε̇xy), centre c, rayon r, taux
 * principaux ε̇1 = c − r (le plus compressif) et ε̇2 = c + r. À droite, les axes principaux en plan.
 */
export function mohrDeformation({ exx, eyy, exy, e1, e2, az, largeur = 520 }) {
  const c = (exx + eyy) / 2, r = Math.max(Math.hypot((exx - eyy) / 2, exy), 1e-9), Hp = 200, W = 270, g = 76, top = 24;
  const xmin = Math.min(c - 1.25 * r, 0 - 0.1 * r), xmax = Math.max(c + 1.25 * r, 0 + 0.1 * r), k = Math.min(W / (xmax - xmin), Hp / (2.5 * r));
  const X = (v) => g + (v - xmin) * k, Y = (v) => top + Hp / 2 - v * k;
  return svg({
    largeur, hauteur: top + Hp + 50, titre: "Cercle de Mohr des taux de déformation", contenu: (id) => {
      let s = ligne(g - 6, Y(0), g + W + 10, Y(0), COULEURS.trait, 1.2) + nt(g + W + 8, Y(0) - 6, "ε̇_n", "end");
      if (r < 1e-3 * Math.max(Math.abs(c), 1)) {
        // tenseur isotrope : le cercle se réduit à un point, toutes les directions sont principales
        return s + `<circle cx="${X(c)}" cy="${Y(0)}" r="5" fill="${COULEURS.effort}"/>` + et(X(c), Y(0) - 10, `ε̇₁ = ε̇₂ = ${fr(c)}`, COULEURS.effort, "middle", 11.5)
          + nt(14, top + Hp + 24, "Tenseur isotrope : le cercle de Mohr se réduit à un point, toutes les directions sont principales.");
      }
      if (0 >= xmin && 0 <= xmax) s += ligne(X(0), top, X(0), top + Hp, COULEURS.trait, 1) + nt(X(0) + 4, top + 10, "ε̇_{xy} (cisaillement)");
      s += `<circle cx="${X(c)}" cy="${Y(0)}" r="${(r * k).toFixed(1)}" fill="rgba(3,105,161,.07)" stroke="${COULEURS.bleu}" stroke-width="2"/>`;
      s += ligne(X(exx), Y(exy), X(eyy), Y(-exy), COULEURS.violet, 1.4, 'stroke-dasharray="5 3"');
      // points du tenseur ; quand ils sont presque sur l'axe, leurs étiquettes passent au-dessus et au-dessous du cercle
      const plat = Math.abs(exy) < 0.3 * r, lx = `(ε̇_{xx} ; ε̇_{xy}) = (${fr(exx)} ; ${fr(exy)})`, ly = `(ε̇_{yy} ; −ε̇_{xy}) = (${fr(eyy)} ; ${fr(-exy || 0)})`;
      s += `<circle cx="${X(exx)}" cy="${Y(exy)}" r="4" fill="${COULEURS.violet}"/>` + (plat ? etBorne(X(c), Y(r) - 8, lx, COULEURS.violet, 10.5, 4, 360) : et(X(exx) + 7, Y(exy) - 7, lx, COULEURS.violet, "start", 10.5));
      s += `<circle cx="${X(eyy)}" cy="${Y(-exy)}" r="4" fill="${COULEURS.violet}"/>` + (plat ? etBorne(X(c), Y(-r) + 16, ly, COULEURS.violet, 10.5, 4, 360) : et(X(eyy) + 7, Y(-exy) + 15, ly, COULEURS.violet, "start", 10.5));
      s += `<circle cx="${X(c)}" cy="${Y(0)}" r="3" fill="${COULEURS.encre}"/>` + et(X(c), Y(0) + 15, `c = ${fr(c)}`, COULEURS.encre, "middle", 10.5);
      s += `<circle cx="${X(e1)}" cy="${Y(0)}" r="5" fill="${COULEURS.effort}"/>` + et(X(e1) - 4, Y(0) - 8, `ε̇₁ = ${fr(e1)}`, COULEURS.effort, "end", 11);
      s += `<circle cx="${X(e2)}" cy="${Y(0)}" r="5" fill="${COULEURS.reaction}"/>` + et(X(e2) + 4, Y(0) - 8, `ε̇₂ = ${fr(e2)}`, COULEURS.reaction, "start", 11);
      s += doubleFleche(id, X(c), Y(-r / 2), X(c + r), Y(-r / 2)) + et(X(c + r / 2), Y(-r / 2) + 14, `r = ${fr(r)}`, COULEURS.cote, "middle", 10.5);
      // axes principaux en plan : raccourcissement (rouge, flèches vers le centre) à l'azimut az
      const ox = 432, oy = top + Hp / 2, R0 = 52, A = az * RAD, dir = (a, l) => [ox + l * Math.sin(a), oy - l * Math.cos(a)];
      s += `<circle cx="${ox}" cy="${oy}" r="${R0 + 8}" fill="#fdf2e0" stroke="#cbd5e1"/>` + fleche(id, ox, oy + R0 + 8, ox, oy - R0 - 14, COULEURS.encre, 1, "fc") + texte(ox + 5, oy - R0 - 6, "N", 'style="font-weight:800"');
      const paire = (a, couleur, entrant, marque) => [1, -1].map((sg) => entrant
        ? fleche(id, ...dir(a, sg * R0), ...dir(a, sg * 12), couleur, 2.4, marque) : fleche(id, ...dir(a, sg * 12), ...dir(a, sg * R0), couleur, 2.4, marque)).join("");
      if (Math.abs(e1) > 1e-9) s += paire(A, COULEURS.effort, e1 < 0, "fl");
      if (Math.abs(e2) > 1e-9) s += paire(A + Math.PI / 2, COULEURS.reaction, e2 < 0, "fr");
      s += nt(ox, top + Hp + 8, `ε̇₁ à l'azimut ${frd(((az % 180) + 180) % 180, 0)}°`, "middle");
      s += nt(14, top + Hp + 24, "Taux en ns/an. Sur le cercle, l'angle au centre vaut deux fois l'angle entre directions réelles.");
      s += nt(14, top + Hp + 40, `ε̇₁ = c − r, ε̇₂ = c + r ; flèches rentrantes : raccourcissement, sortantes : allongement.`);
      return s;
    },
  });
}

// ── Chapitre 10 : la loi normale des résidus ───────────────────────────────

/**
 * Densité de la loi normale réduite, tronquée à ±3σ ; la médiane, le seuil à ε écarts types et l'aire de
 * dépassement P. En dessous, l'échelle des accélérations : médiane × e^(kσ).
 */
export function gaussienne({ eps, P, med, sigma, y, unite = "g", largeur = 520 }) {
  const g = 30, W = largeur - 2 * g, top = 18, Hp = 150, X = (e) => g + ((e + 3.6) / 7.2) * W, phi = (e) => Math.exp(-e * e / 2) / Math.sqrt(2 * Math.PI);
  const Y = (v) => top + Hp - (v / 0.42) * Hp, e0 = borne(eps, -3, 3);
  return svg({
    largeur, hauteur: top + Hp + 82, titre: "Loi normale de ln y et probabilité de dépassement", contenu: () => {
      let s = "";
      const aire = []; for (let k = 0; k <= 60; k++) { const e = e0 + ((3 - e0) * k) / 60; aire.push([X(e), Y(phi(e))]); }
      if (e0 < 3) s += `<path d="M${X(e0).toFixed(1)} ${Y(0).toFixed(1)}${chemin(aire).replace(/^M/, "L")}L${X(3).toFixed(1)} ${Y(0).toFixed(1)}Z" fill="rgba(220,38,38,.25)"/>`;
      const courbe = (a, b) => chemin(Array.from({ length: 61 }, (_, k) => { const e = a + ((b - a) * k) / 60; return [X(e), Y(phi(e))]; }));
      s += `<path d="${courbe(-3, 3)}" fill="none" stroke="${COULEURS.bleu}" stroke-width="2.4"/>`;
      s += `<path d="${courbe(-3.6, -3)}" fill="none" stroke="${COULEURS.bleu}" stroke-width="1.2" stroke-dasharray="3 3"/><path d="${courbe(3, 3.6)}" fill="none" stroke="${COULEURS.bleu}" stroke-width="1.2" stroke-dasharray="3 3"/>`;
      s += ligne(g, Y(0), g + W, Y(0), COULEURS.trait, 1.2);
      for (const e of [-3, 3]) s += ligne(X(e), Y(0), X(e), Y(0.2), COULEURS.discret, 1, 'stroke-dasharray="2 3"') + nt(X(e), Y(0.2) - 4, "troncature", "middle");
      s += ligne(X(0), Y(0), X(0), Y(phi(0)), COULEURS.encre, 1.2, 'stroke-dasharray="4 3"') + et(X(0), Y(phi(0)) - 6, "médiane (ε = 0)", COULEURS.encre, "middle", 11);
      if (Math.abs(eps) <= 3.6) s += ligne(X(eps), Y(0), X(eps), Y(phi(eps)) - 18, COULEURS.effort, 1.8) + et(X(eps) + (eps < 0 ? -6 : 6), Y(phi(eps)) - 20, `ε = ${frd(eps, 2)}`, COULEURS.effort, eps < 0 ? "end" : "start", 11.5);
      s += et(X(Math.min(e0 + 0.9, 2.4)), Y(0.05), `P = ${frd(100 * P, 1)} %`, COULEURS.effort, "middle", 12.5);
      // échelles : ε, puis l'accélération correspondante
      for (let k = -3; k <= 3; k++) {
        s += ligne(X(k), Y(0), X(k), Y(0) + 5, COULEURS.trait, 1) + nt(X(k), Y(0) + 17, `${k > 0 ? "+" : k < 0 ? "−" : ""}${Math.abs(k)}`, "middle");
        s += nt(X(k), Y(0) + 46, fr(med * Math.exp(k * sigma), 2), "middle");
      }
      s += nt(g + W, Y(0) + 31, `ε (écarts types de ${frd(sigma, 2)} en ln)`, "end") + nt(g + W, Y(0) + 60, `accélération (${unite}) = médiane × e^(εσ) ; seuil y = ${fr(y)} ${unite}`, "end");
      return s;
    },
  });
}

// ── Chapitre 10 : la zone source et un terme de la somme ───────────────────

/** Vue en plan : le site, la zone circulaire, les points de la grille, et le point du terme détaillé. */
export function zonePSHA({ polygone, points, ex, largeur = 520 }) {
  const xs = [0, ...polygone.map((p) => p[0])], ys = [0, ...polygone.map((p) => p[1])];
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), Hp = 230, Wp = 330;
  const k = Math.min(Wp / (x1 - x0 || 1), Hp / (y1 - y0 || 1)) * 0.92, cx = 24 + Wp / 2 - ((x0 + x1) / 2) * k, cy = 18 + Hp / 2 + ((y0 + y1) / 2) * k;
  const X = (x) => cx + x * k, Y = (y) => cy - y * k, R = Math.hypot(ex.x, ex.y);
  return svg({
    largeur, hauteur: Hp + 44, titre: "Zone source discrétisée et site", contenu: () => {
      let s = `<path d="${chemin(polygone.map(([x, y]) => [X(x), Y(y)]), true)}" fill="rgba(234,88,12,.08)" stroke="#ea580c" stroke-width="1.4" stroke-dasharray="5 3"/>`;
      for (const p of points) s += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="1.6" fill="#ea580c" opacity=".7"/>`;
      s += ligne(X(0), Y(0), X(ex.x), Y(ex.y), COULEURS.cote, 1.6) + `<circle cx="${X(ex.x)}" cy="${Y(ex.y)}" r="5" fill="${COULEURS.effort}" stroke="#fff" stroke-width="1.4"/>`;
      s += et((X(0) + X(ex.x)) / 2 + 6, (Y(0) + Y(ex.y)) / 2 - 6, `R = ${fr(R)} km`, COULEURS.cote, "start", 11.5);
      s += station(X(0), Y(0) + 4) + et(X(0) + 9, Y(0) + 16, "site", COULEURS.reaction, "start", 11);
      const tx = 24 + Wp + 14;
      [["Grille de la zone :", true], [`${points.length} points`, false], ["chacun reçoit λᵢ/N", false], ["", false], ["Point du terme détaillé :", true], [`à ${fr(R)} km du site`, false], ["", false], ["La courbe d'aléa somme", true], ["tous les points et", false], ["toutes les classes M.", false]]
        .forEach(([l, gras], i) => { if (l) s += texte(tx, 34 + 15 * i, l, gras ? 'style="font-size:11.5px;font-weight:800"' : 'class="pt"'); });
      return s;
    },
  });
}

// ── Chapitre 12 : la colonne de sol et Vs30 ────────────────────────────────

/** Colonne de sol à l'échelle, profil de Vs, profondeur de 30 m et temps de parcours h/V de chaque tranche. */
export function colonneVs30({ couches, vr, vs30, classe, largeur = 520 }) {
  const Ht = couches.reduce((a, c) => a + c.h, 0), zmax = Math.max(30, Ht) * 1.12, top = 24, Hp = 230, k = Hp / zmax, Z = (z) => top + z * k;
  const cx0 = 26, cw = 70, vmax = Math.max(vr, ...couches.map((c) => c.vs)) * 1.1;
  const p = cadre({ x0: 128, y0: top, w: 120, h: Hp, xmin: 0, xmax: vmax, ymin: 0, ymax: 1, gx: [0, Math.round(vmax / 2 / 100) * 100], gy: [], fx: (v) => fr(v), xlabel: "Vs (m/s)" });
  return svg({
    largeur, hauteur: top + Hp + 72, titre: "Colonne de sol et Vs30", contenu: () => {
      let s = "", z = 0, z30 = 0, profil = [];
      couches.forEach((c, i) => {
        const teinte = ["#f3e5ae", "#e8dcc3", "#e9dbb7", "#dccab0", "#e3d3a0", "#cfd8c7"][i % 6];
        s += `<rect x="${cx0}" y="${Z(z)}" width="${cw}" height="${(c.h * k).toFixed(1)}" fill="${teinte}" stroke="#8b5a2b" stroke-width=".8"/>`;
        s += texte(cx0 + cw / 2, Z(z + c.h / 2) + 4, `${fr(c.h)} m`, 'text-anchor="middle" style="font-size:10.5px;font-weight:700"');
        profil.push([c.vs, z], [c.vs, z + c.h]);
        const hh = Math.max(0, Math.min(c.h, 30 - z30));
        if (hh > 0) s += et(270, Z(z + hh / 2) + 4, `${fr(hh)} / ${fr(c.vs)} = ${frd(hh / c.vs, 4)} s`, COULEURS.encre, "start", 10.5);
        z30 += hh; z += c.h;
      });
      s += `<rect x="${cx0}" y="${Z(z)}" width="${cw}" height="${(Z(zmax) - Z(z)).toFixed(1)}" fill="#b8bec7" stroke="#475569" stroke-width=".8"/>` + texte(cx0 + cw / 2, Z((z + zmax) / 2) + 4, "rocher", 'text-anchor="middle" style="font-size:10.5px;font-weight:700"');
      if (z < 30) s += et(270, Z((z + 30) / 2) + 4, `${fr(30 - z)} / ${fr(vr)} = ${frd((30 - z) / vr, 4)} s (rocher)`, COULEURS.encre, "start", 10.5);
      profil.push([vr, z], [vr, zmax]);
      // profil de Vs (profondeur vers le bas)
      s += p.s.replace(/<rect[^>]*\/>/, `<rect x="128" y="${top}" width="120" height="${Hp}" fill="#fff" stroke="#cbd5e1"/>`);
      s += `<path d="${chemin(profil.map(([v, zz]) => [p.X(v), Z(zz)]))}" fill="none" stroke="${COULEURS.bleu}" stroke-width="2.2"/>`;
      s += ligne(cx0 - 6, Z(30), largeur - 14, Z(30), COULEURS.effort, 1.6, 'stroke-dasharray="6 3"') + et(largeur - 14, Z(30) - 5, "30 m", COULEURS.effort, "end", 11);
      s += nt(cx0, top - 8, "0 m");
      s += riche(cx0, top + Hp + 46, `Vs30 = 30 / Σ(h_i/V_i) = ${fr(vs30)} m/s → classe ${classe}`, 'style="font-size:12px;font-weight:800"');
      s += nt(cx0, top + Hp + 62, "Le temps de parcours vertical des 30 premiers mètres, ramené à une vitesse moyenne.");
      return s;
    },
  });
}

// ── Chapitre 13 : les contraintes au point de l'essai ──────────────────────

/** Colonne avec nappe et point d'essai ; profils de σv, u et σ′v jusqu'à la profondeur de l'essai. */
export function contraintesSPT({ z, gwl, gamma = 18, gw = 9.8, largeur = 520 }) {
  const zmax = z * 1.2, top = 24, Hp = 220, k = Hp / zmax, Z = (zz) => top + zz * k, sv = gamma * z, u = gw * Math.max(0, z - gwl), sve = sv - u;
  const c = cadre({ x0: 226, y0: top, w: 180, h: Hp, xmin: 0, xmax: sv * 1.25, ymin: 0, ymax: 1, gx: [0, Math.round(sv / 2), Math.round(sv)], gy: [], fx: (v) => fr(v), xlabel: "contrainte (kPa)" });
  return svg({
    largeur, hauteur: top + Hp + 58, titre: "Contraintes au point de l'essai", contenu: () => {
      let s = `<rect x="30" y="${Z(0)}" width="80" height="${Z(Math.min(gwl, zmax)) - Z(0)}" fill="#f3e5ae"/>`;
      if (gwl < zmax) s += `<rect x="30" y="${Z(gwl)}" width="80" height="${Z(zmax) - Z(gwl)}" fill="#d9e8d0"/><rect x="30" y="${Z(gwl)}" width="80" height="${Z(zmax) - Z(gwl)}" fill="${COULEURS.eauFond}"/>`;
      s += ligne(24, Z(0), 116, Z(0), "#8b5a2b", 2.2);
      if (gwl < zmax) s += `<path d="M${70} ${Z(gwl) - 9}l7 0-3.5 7z" fill="${COULEURS.eau}"/>` + ligne(30, Z(gwl), 110, Z(gwl), COULEURS.eau, 1.2) + et(116, Z(gwl) + 4, `nappe ${fr(gwl)} m`, COULEURS.eau, "start", 10.5);
      s += `<rect x="64" y="${Z(z) - 9}" width="12" height="18" fill="#475569"/>` + ligne(70, Z(0), 70, Z(z) - 9, "#475569", 2) + et(116, Z(z) + 4, `essai à z = ${fr(z)} m`, COULEURS.encre, "start", 10.5);
      s += c.s.replace(/<rect[^>]*\/>/, `<rect x="226" y="${top}" width="180" height="${Hp}" fill="#fff" stroke="#cbd5e1"/>`);
      const zw = Math.min(gwl, z);
      s += `<path d="${chemin([[c.X(0), Z(0)], [c.X(sv), Z(z)]])}" stroke="${COULEURS.encre}" stroke-width="2.2" fill="none"/>`;
      if (gwl < z) s += `<path d="${chemin([[c.X(0), Z(gwl)], [c.X(u), Z(z)]])}" stroke="${COULEURS.eau}" stroke-width="2.2" fill="none"/>`;
      s += `<path d="${chemin([[c.X(0), Z(0)], [c.X(gamma * zw), Z(zw)], [c.X(sve), Z(z)]])}" stroke="${COULEURS.effort}" stroke-width="2.6" fill="none"/>`;
      s += ligne(c.X(0), Z(z), c.X(sv * 1.25), Z(z), "#94a3b8", 1, 'stroke-dasharray="3 3"');
      const lab = [[sv, `σ_v = ${fr(sv)}`, COULEURS.encre], [sve, `σ′_v = ${fr(sve)}`, COULEURS.effort], [u, `u = ${fr(u)}`, COULEURS.eau]].sort((a, b) => b[0] - a[0]);
      lab.forEach(([v, t, col], i) => { s += `<circle cx="${c.X(v)}" cy="${Z(z)}" r="3.5" fill="${col}"/>` + et(414, Z(z) - 30 + 16 * i, `${t} kPa`, col, "start", 11); });
      s += nt(30, top + Hp + 48, `σ_v = ${fr(gamma)}·z ; u = ${fr(gw)}·(z − z_{nappe}) ; σ′_v = σ_v − u`);
      return s;
    },
  });
}

// ── Chapitre 14 : l'oscillateur élastoplastique ────────────────────────────

/** Loi force–déplacement : élastique jusqu'à Sa, ou plastique à Sa/R (écrouissage α) jusqu'à u_max ; R et μ. */
export function forceDeplacement({ Sa, R, uy, umax, sdEl, alpha = 0, largeur = 520 }) {
  const fy = Sa / R, kk = fy / uy, fmax = fy + alpha * kk * (umax - uy), xm = Math.max(umax, sdEl) * 1.18, ym = Math.max(Sa, fmax) * 1.16;
  const c = cadre({ x0: 60, y0: 20, w: 300, h: 200, xmin: 0, xmax: xm, ymin: 0, ymax: ym, gx: [0], gy: [0], fx: () => "0", fy: () => "0", ylabel: "force / masse (g)" });
  return svg({
    largeur, hauteur: 290, titre: "Oscillateur élastique et élastoplastique", contenu: (id) => {
      let s = c.s + c.trace([[0, 0], [sdEl, Sa]], COULEURS.bleu, 2, 'stroke-dasharray="7 4"') + `<circle cx="${c.X(sdEl)}" cy="${c.Y(Sa)}" r="4" fill="${COULEURS.bleu}"/>`;
      s += c.trace([[0, 0], [uy, fy], [umax, fmax]], COULEURS.effort, 2.8) + `<circle cx="${c.X(umax)}" cy="${c.Y(fmax)}" r="4" fill="${COULEURS.effort}"/>`;
      for (const [x, y] of [[uy, fy], [umax, fmax], [sdEl, Sa]]) s += ligne(c.X(x), c.Y(y), c.X(x), c.Y(0), "#94a3b8", 1, 'stroke-dasharray="3 3"');
      s += ligne(c.X(0), c.Y(Sa), c.X(sdEl), c.Y(Sa), "#94a3b8", 1, 'stroke-dasharray="3 3"') + ligne(c.X(0), c.Y(fy), c.X(uy), c.Y(fy), "#94a3b8", 1, 'stroke-dasharray="3 3"');
      s += et(c.X(0) - 4, c.Y(Sa) + 4, `${fr(Sa)}`, COULEURS.bleu, "end", 10.5) + et(c.X(0) - 4, c.Y(fy) + 4, `${fr(fy)}`, COULEURS.effort, "end", 10.5);
      s += et(c.X(uy), c.Y(0) + 14, `u_y = ${fr(uy)}`, COULEURS.effort, "middle", 10.5) + et(c.X(umax), c.Y(0) + 28, `u_{max} = ${fr(umax)}`, COULEURS.effort, "middle", 10.5);
      s += et(c.X(sdEl), c.Y(0) + 42, `Sd élastique = ${fr(sdEl)}`, COULEURS.bleu, "middle", 10.5) + nt(c.X(0), c.Y(0) + 60, "déplacement (mm) →");
      s += doubleFleche(id, c.X(xm * 0.95), c.Y(Sa), c.X(xm * 0.95), c.Y(fy)) + et(c.X(xm * 0.95) - 5, c.Y((Sa + fy) / 2) + 4, `÷ R = ${fr(R)}`, COULEURS.cote, "end", 11);
      s += doubleFleche(id, c.X(uy), c.Y(fy) - 18, c.X(umax), c.Y(fy) - 18) + et(c.X((uy + umax) / 2), c.Y(fy) - 24, `μ = u_{max}/u_y = ${frd(umax / uy, 2)}`, COULEURS.cote, "middle", 11);
      const tx = 376;
      [["Élastique (tirets) :", true, COULEURS.bleu], ["résiste à Sa, atteint Sd.", false], ["", false], ["Élastoplastique :", true, COULEURS.effort], ["résiste à Sa/R, plastifie", false], ["et va jusqu'à u_{max}.", false], ["", false], [`Rapport u_{max}/Sd : ${frd(umax / sdEl, 2)}`, true, COULEURS.encre]]
        .forEach(([l, gras, col], i) => { if (l) s += riche(tx, 40 + 15 * i, l, gras ? `style="font-size:11.5px;font-weight:800;fill:${col}"` : 'class="pt"'); });
      return s;
    },
  });
}

/** Les deux règles de principe : égaux déplacements (μ = R) et égales énergies (μ = (R² + 1)/2), aux mêmes axes. */
export function reglesRmu({ R, largeur = 520 }) {
  const pw = (largeur - 60) / 2, du2 = R / 2 + 1 / (2 * R), xm = Math.max(1.15, du2 * 1.1);
  const panneau = (x0, titreP, du) => cadre({ x0, y0: 30, w: pw - 24, h: 170, xmin: 0, xmax: xm, ymin: 0, ymax: 1.12, gx: [], gy: [] });
  const c1 = panneau(40, "", 1), c2 = panneau(40 + pw + 10, "", du2);
  const fy = 1 / R, dy = 1 / R;
  return svg({
    largeur, hauteur: 262, titre: "Égaux déplacements et égales énergies", contenu: (id) => {
      let s = titre(c1.X(0), 20, "Égaux déplacements") + titre(c2.X(0), 20, "Égales énergies");
      for (const [c, du] of [[c1, 1], [c2, du2]]) {
        s += c.s;
        if (c === c2) {
          s += `<path d="${chemin([[c.X(0), c.Y(0)], [c.X(1), c.Y(1)], [c.X(1), c.Y(0)]], true)}" fill="rgba(3,105,161,.15)"/>`;
          s += `<path d="${chemin([[c.X(0), c.Y(0)], [c.X(dy), c.Y(fy)], [c.X(du), c.Y(fy)], [c.X(du), c.Y(0)]], true)}" fill="rgba(220,38,38,.15)"/>`;
        }
        s += c.trace([[0, 0], [1, 1]], COULEURS.bleu, 2, 'stroke-dasharray="7 4"') + c.trace([[0, 0], [dy, fy], [du, fy]], COULEURS.effort, 2.6);
        s += ligne(c.X(du), c.Y(fy), c.X(du), c.Y(0), "#94a3b8", 1, 'stroke-dasharray="3 3"') + ligne(c.X(1), c.Y(1), c.X(1), c.Y(0), "#94a3b8", 1, 'stroke-dasharray="3 3"');
        s += nt(c.X(dy), c.Y(0) + 13, "dy", "middle") + nt(c.X(du), c.Y(0) + 13, "du", "middle") + (Math.abs(du - 1) > 0.08 ? nt(c.X(1), c.Y(0) + 13, "dél", "middle") : "");
        s += nt(c.X(0) - 4, c.Y(1) + 4, "Fél", "end") + nt(c.X(0) - 4, c.Y(fy) + 4, "Fy", "end");
      }
      s += et(c1.X(0.5), c1.Y(0.5) - 34, "du = dél", COULEURS.encre, "middle", 11);
      s += et(c1.X(0.55), c1.Y(fy) - 10, `μ = R = ${fr(R)}`, COULEURS.effort, "middle", 12);
      s += et(c2.X(du2 * 0.6), c2.Y(fy) - 10, `μ = (R² + 1)/2 = ${fr((R * R + 1) / 2)}`, COULEURS.effort, "middle", 12);
      s += nt(c2.X(0), 232, "aires égales (énergies)");
      s += nt(c1.X(0), 232, "même déplacement maximal");
      s += nt(c1.X(0), 252, `R = Fél/Fy = ${fr(R)} dans les deux cas. N2 : égaux déplacements au-delà de TC.`);
      return s;
    },
  });
}

// ── Chapitre 15 : la console de cisaillement ───────────────────────────────

/** Bâtiment et son modèle brochette : masses mᵢ aux planchers, raideurs kᵢ entre planchers (8 niveaux dessinés au plus). */
export function consoleModele({ m, k, largeur = 520 }) {
  const n = m.length, montres = n <= 8 ? [...Array(n).keys()] : [0, 1, 2, -1, n - 3, n - 2, n - 1], base = 262, he = Math.min(34, 220 / montres.length);
  return svg({
    largeur, hauteur: 300, titre: "Console de cisaillement : masses et raideurs", contenu: () => {
      let s = `<rect x="0" y="${base}" width="${largeur}" height="38" fill="#e9c99a"/>` + ligne(0, base, largeur, base, "#8b5a2b", 2);
      const bx = 40, bw = 90, mx = 250;
      montres.forEach((i, j) => {
        const y = base - (j + 1) * he;
        if (i < 0) { s += texte(bx + bw / 2, y + he / 2 + 4, "⋮", 'text-anchor="middle" style="font-size:16px"') + texte(mx, y + he / 2 + 4, "⋮", 'text-anchor="middle" style="font-size:16px"'); return; }
        s += ligne(bx + 6, y, bx + 6, y + he, COULEURS.trait, 3) + ligne(bx + bw - 6, y, bx + bw - 6, y + he, COULEURS.trait, 3) + `<rect x="${bx}" y="${y - 5}" width="${bw}" height="9" fill="#475569"/>`;
        // brochette : ressort entre le niveau inférieur et ce niveau, masse au niveau
        const pts = [[mx, y + he], [mx, y + he - 5]];
        for (let q = 0; q < 6; q++) pts.push([mx + (q % 2 ? -6 : 6), y + he - 5 - ((q + 0.5) * (he - 10)) / 6]);
        pts.push([mx, y + 5], [mx, y]);
        s += `<path d="${chemin(pts)}" fill="none" stroke="${COULEURS.trait}" stroke-width="1.4"/>` + `<circle cx="${mx}" cy="${y}" r="6.5" fill="#475569"/>`;
        s += et(mx + 14, y + 4, `m_{${i + 1}} = ${fr(m[i], 4)} t`, COULEURS.encre, "start", 10.5) + et(mx - 12, y + he / 2 + 4, `k_{${i + 1}} = ${fr(k[i], 3)} kN/m`, COULEURS.discret, "end", 10);
      });
      s += titre(bx + bw / 2, 22, "Bâtiment", "middle") + titre(mx, 22, "Modèle", "middle");
      const tx = 380;
      [["Matrice de masse :", true], ["M = diag(mᵢ)", false], ["", false], ["Matrice de rigidité :", true], ["K_{ii} = k_i + k_{i+1}", false], ["K_{i,i+1} = −k_{i+1}", false], ["(dernier niveau : K_{nn} = k_n)", false], ["", false], ["Modes : (K − ω²M)·φ = 0", true]]
        .forEach(([l, gras], i) => { if (l) s += riche(tx, 46 + 16 * i, l, gras ? 'style="font-size:11.5px;font-weight:800"' : 'class="pt"'); });
      return s;
    },
  });
}

/** Forces latérales Fᵢ à l'échelle sur les planchers, effort à la base F_b. */
export function forcesEtages({ z, F, Fb, largeur = 520 }) {
  const n = F.length, base = 266, Ht = z[n - 1], k = 220 / Ht, Y = (zz) => base - zz * k, bx = 236, bw = 70, Fm = Math.max(...F), L = 120 / Fm;
  const etiquetes = new Set(n <= 6 ? [...Array(n).keys()] : [0, 1, n - 2, n - 1]);
  return svg({
    largeur, hauteur: 300, titre: "Forces latérales sur la hauteur", contenu: (id) => {
      let s = `<rect x="0" y="${base}" width="${largeur}" height="34" fill="#e9c99a"/>` + ligne(0, base, largeur, base, "#8b5a2b", 2);
      s += ligne(bx + 4, base, bx + 4, Y(Ht), COULEURS.trait, 3) + ligne(bx + bw - 4, base, bx + bw - 4, Y(Ht), COULEURS.trait, 3);
      F.forEach((Fi, i) => {
        const y = Y(z[i]);
        s += `<rect x="${bx}" y="${y - 3.5}" width="${bw}" height="7" fill="#475569"/>`;
        s += fleche(id, bx - 6 - Fi * L, y, bx - 4, y, COULEURS.effort, n > 12 ? 1.4 : 2);
        if (etiquetes.has(i)) s += et(bx - 10 - Fi * L, y + 4, `F_{${i + 1}} = ${fr(Fi)} kN`, COULEURS.effort, "end", 10.5);
      });
      s += fleche(id, bx + bw + 80, base + 16, bx + bw + 8, base + 16, COULEURS.reaction, 2.4, "fr") + et(bx + bw + 84, base + 20, `F_b = ${fr(Fb, 4)} kN`, COULEURS.reaction, "start", 11);
      s += doubleFleche(id, bx + bw + 14, base, bx + bw + 14, Y(Ht)) + et(bx + bw + 20, (base + Y(Ht)) / 2 + 4, `H = ${fr(Ht)} m`, COULEURS.cote, "start", 10.5);
      [["F_b = ΣF_i", true], ["effort à la base", false], ["", false], ["F_i = F_b·z_im_i / Σz_jm_j", true], ["triangle inversé : le", false], ["premier mode approché", false], ["par une droite", false]]
        .forEach(([l, gras], i) => { if (l) s += riche(bx + bw + 76, 40 + 15 * i, l, gras ? 'style="font-size:11px;font-weight:800"' : 'class="pt"'); });
      return s;
    },
  });
}

// ── Chapitre 16 : la méthode N2 en accélération–déplacement ────────────────

/**
 * Format accélération–déplacement : la demande élastique Se(T) tracée contre Sd = Se·(T/2π)², la droite de période T*,
 * la capacité bilinéaire du système équivalent, les déplacements d*et et d*t.
 */
export function n2ADRS({ se, Ts, TC, dy, ay, de, dt, sae, largeur = 520 }) {
  // se(T) en g ; Sd = Se·g·(T/2π)², en mm ; dy, de, dt en m ; ay et sae en g
  const sdDe = (a, T) => a * 9.81 * (T / (2 * Math.PI)) ** 2 * 1000;
  const pts = Array.from({ length: 160 }, (_, k) => { const T = 0.02 + k * 0.025; const a = se(T); return [sdDe(a, T), a]; });
  const xmax = Math.max(dt, de) * 1000 * 1.8, ymax = Math.max(...pts.map((p) => p[1]), sae) * 1.12, dTC = sdDe(se(TC), TC);
  return graphe({
    largeur, hauteur: 290, xmin: 0, xmax: Math.ceil(xmax / 10) * 10, ymin: 0, ymax: Math.ceil(ymax * 10) / 10,
    xlabel: "déplacement spectral Sd (mm)", ylabel: "accélération spectrale (g)",
    series: [
      { points: pts.filter((p) => p[0] <= xmax * 1.2), couleur: COULEURS.encre, epaisseur: 2, libelle: "demande élastique Se" },
      { points: [[0, 0], [dTC * 3, se(TC) * 3]], couleur: COULEURS.discret, epaisseur: 1, tirets: "2 3", libelle: "droite de période TC" },
      { points: [[0, 0], [de * 1000 * 1.25, sae * 1.25]], couleur: COULEURS.violet, epaisseur: 1.4, tirets: "6 4", libelle: `période T* = ${fr(Ts)} s` },
      { points: [[0, 0], [dy * 1000, ay], [xmax * 1.2, ay]], couleur: COULEURS.bleu, epaisseur: 2.6, libelle: "capacité F*/m*" },
    ],
    marques: [
      { x: de * 1000, y: sae, couleur: COULEURS.violet, guides: true, libelle: `d*et = ${fr(de * 1000)} mm` },
      { x: dt * 1000, y: ay, couleur: COULEURS.effort, guides: true, libelle: `d*t = ${fr(dt * 1000)} mm` },
    ],
  });
}

// ── Chapitre 17 : la boucle de l'isolateur ─────────────────────────────────

/** Boucle bilinéaire à l'amplitude d : raideurs K₁ et K₂, force caractéristique Q, raideur effective et énergie E_D. */
export function boucleIsolateur({ K1, K2, Q, dy, d, F, largeur = 520 }) {
  const Fy = K1 * dy, xm = d * 1000 * 1.25, ym = F * 1.3;
  const c = cadre({ x0: 70, y0: 16, w: 290, h: 230, xmin: -xm, xmax: xm, ymin: -ym, ymax: ym, gx: [], gy: [], xlabel: "déplacement (mm)", ylabel: "force (kN)" });
  // au-delà de d_y, parallélogramme ; en deçà, l'isolateur reste élastique : un simple segment
  const boucle = (d > dy ? [[-d, -F], [-d + 2 * dy, -F + 2 * Fy], [d, F], [d - 2 * dy, F - 2 * Fy]] : [[-d, -F], [d, F]]).map(([x, y]) => [x * 1000, y]);
  return svg({
    largeur, hauteur: 290, titre: "Boucle de l'isolateur et linéarisation équivalente", contenu: () => {
      let s = c.s + ligne(c.X(-xm), c.Y(0), c.X(xm), c.Y(0), COULEURS.trait, 1) + ligne(c.X(0), c.Y(-ym), c.X(0), c.Y(ym), COULEURS.trait, 1);
      s += `<path d="${chemin(boucle.map(([x, y]) => [c.X(x), c.Y(y)]), true)}" fill="rgba(220,38,38,.14)" stroke="${COULEURS.bleu}" stroke-width="2.4"/>`;
      s += c.trace([[-d * 1000, -F], [d * 1000, F]], COULEURS.effort, 1.6, 'stroke-dasharray="6 4"');
      s += `<circle cx="${c.X(0)}" cy="${c.Y(Q)}" r="4" fill="${COULEURS.violet}"/>` + et(c.X(0) - 6, c.Y(Q) - 6, `Q = ${fr(Q)} kN`, COULEURS.violet, "end", 11);
      s += `<circle cx="${c.X(d * 1000)}" cy="${c.Y(F)}" r="4" fill="${COULEURS.effort}"/>` + et(c.X(d * 1000) - 8, c.Y(F) - 8, `(d ; F) = (${fr(d * 1000)} mm ; ${fr(F)} kN)`, COULEURS.effort, "end", 10.5);
      s += et(c.X((-d + dy) * 1000) + 6, c.Y(-F + Fy) + 16, "K₁", COULEURS.bleu, "start", 11.5) + et(c.X(d * 500), c.Y(Q + K2 * d * 0.5) - 8, "K₂", COULEURS.bleu, "end", 11.5);
      s += et(c.X(-d * 400), c.Y(-K2 * d * 0.4 - (F - K2 * d)) + 34, "E_D : aire de la boucle", "#b91c1c", "middle", 11);
      s += et(c.X(d * 650), c.Y(F * 0.65) + 22, "K_{eff} = F/d", COULEURS.effort, "start", 11);
      const tx = 376;
      [["K₂ = M·(2π/T_{iso})²", false], [`Q = ${fr(Q)} kN, d_y = ${fr(dy * 1000)} mm`, false], ["", false], ["F = Q + K₂·d", true], ["K_{eff} = F/d", true], ["E_D = 4Q·(d − d_y)", true], ["ξ_{eff} = E_D / (2π·K_{eff}·d²)", true]]
        .forEach(([l, gras], i) => { if (l) s += riche(tx, 40 + 17 * i, l, gras ? 'style="font-size:11.5px;font-weight:800"' : 'class="pt"'); });
      return s;
    },
  });
}
