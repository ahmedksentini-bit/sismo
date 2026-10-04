// Équations des lois d'atténuation mises en texte : tables de coefficients (lues dans les fichiers exportés
// d'OpenQuake), constantes, et étapes de note de calcul terme à terme (Gmpe.LOIS[id].detailler). Sert au
// chapitre 10 (texte, exemple, calculateur) et au chapitre 1.
import Gmpe from "./sismo/gmpe.js";
import Akkar2014 from "./sismo/coefficients/akkar2014.js";
import Bindi2014 from "./sismo/coefficients/bindi2014.js";
import Boore2014 from "./sismo/coefficients/boore2014.js";
import { f, fd } from "./ui.js";

const TABLES = { akkar2014: Akkar2014, bindi2014: Bindi2014, boore2014: Boore2014 };

/** Coefficient tel qu'il est tabulé (jusqu'à 6 chiffres significatifs). */
export const coef = (x) => Number(x).toLocaleString("fr-FR", { maximumSignificantDigits: 6 }).replace("-", "−");
/** Zéro franc pour ce qui s'arrondit à zéro (pas de « −0,000 »). */
const nul = (x, d) => (Math.abs(x) < 0.5 * 10 ** -d ? 0 : x);
/** Valeur arrondie à d décimales. */
const v = (x, d = 3) => fd(nul(x, d), d);
/** « + 0,12 » ou « − 0,12 » : terme suivant d'une somme. */
const plus = (x, d = 3) => (nul(x, d) < 0 ? `− ${fd(-x, d)}` : `+ ${v(x, d)}`);
/** « + 0,0029 » ou « − 0,02807 » : coefficient suivant d'une somme, tel qu'il est tabulé. */
const plusC = (x) => (x < 0 ? `− ${coef(-x)}` : `+ ${coef(x)}`);
/** Facteur entre parenthèses s'il est négatif. */
const par = (x, d = 3) => (nul(x, d) < 0 ? `(${fd(x, d)})` : v(x, d));
const nomGrandeur = (imt) => (imt === "PGA" ? "PGA" : imt === "PGV" ? "PGV" : `Sa(${f(imt, 3)} s)`);

/** Coefficients décrits, par loi : [clé, symbole HTML, rôle]. */
export const COEFFICIENTS = {
  akkar2014: [
    ["a1", "a<sub>1</sub>", "constante"], ["a2", "a<sub>2</sub>", "pente en magnitude (M ≤ c<sub>1</sub>)"], ["a7", "a<sub>7</sub>", "pente en magnitude (M &gt; c<sub>1</sub>)"],
    ["a3", "a<sub>3</sub>", "courbure en magnitude"], ["a4", "a<sub>4</sub>", "expansion géométrique"], ["a5", "a<sub>5</sub>", "pente de distance selon M"],
    ["a6", "a<sub>6</sub>", "pseudo-profondeur (km)"], ["a8", "a<sub>8</sub>", "faille normale"], ["a9", "a<sub>9</sub>", "faille inverse"],
    ["b1", "b<sub>1</sub>", "site, part linéaire"], ["b2", "b<sub>2</sub>", "site, part non linéaire"], ["c", "c", "site non linéaire (g)"], ["n", "n", "site non linéaire, exposant"],
    ["sigma", "φ", "écart type intra-événement (ln)"], ["tau", "τ", "écart type inter-événement (ln)"],
  ],
  bindi2014: [
    ["e1", "e<sub>1</sub>", "constante"], ["b1", "b<sub>1</sub>", "pente en magnitude (M &lt; M<sub>h</sub>)"], ["b2", "b<sub>2</sub>", "courbure en magnitude (M &lt; M<sub>h</sub>)"],
    ["b3", "b<sub>3</sub>", "pente en magnitude (M ≥ M<sub>h</sub>)"], ["c1", "c<sub>1</sub>", "expansion géométrique"], ["c2", "c<sub>2</sub>", "pente de distance selon M"],
    ["c3", "c<sub>3</sub>", "atténuation anélastique (1/km)"], ["h", "h", "pseudo-profondeur (km)"], ["gamma", "γ", "site"],
    ["sofN", "sofN", "faille normale"], ["sofR", "sofR", "faille inverse"], ["sofS", "sofS", "décrochement"],
    ["phi", "φ", "intra-événement (log<sub>10</sub>)"], ["tau", "τ", "inter-événement (log<sub>10</sub>)"], ["sigma", "σ", "total (log<sub>10</sub>)"],
  ],
  boore2014: [
    ["e0", "e<sub>0</sub>", "style inconnu"], ["e1", "e<sub>1</sub>", "décrochement"], ["e2", "e<sub>2</sub>", "faille normale"], ["e3", "e<sub>3</sub>", "faille inverse"],
    ["e4", "e<sub>4</sub>", "pente en magnitude (M ≤ M<sub>h</sub>)"], ["e5", "e<sub>5</sub>", "courbure en magnitude (M ≤ M<sub>h</sub>)"], ["e6", "e<sub>6</sub>", "pente en magnitude (M &gt; M<sub>h</sub>)"],
    ["Mh", "M<sub>h</sub>", "magnitude charnière"], ["c1", "c<sub>1</sub>", "expansion géométrique"], ["c2", "c<sub>2</sub>", "pente de distance selon M"],
    ["c3", "c<sub>3</sub>", "atténuation anélastique (1/km)"], ["Dc3", "Δc<sub>3</sub>", "correction régionale (0 : modèle global)"], ["h", "h", "pseudo-profondeur (km)"],
    ["c", "c", "site, part linéaire"], ["Vc", "V<sub>c</sub>", "plafond de V<sub>s30</sub> (m/s)"], ["f4", "f<sub>4</sub>", "site non linéaire"], ["f5", "f<sub>5</sub>", "site non linéaire (s/m)"],
    ["f1", "φ<sub>1</sub>", "φ pour M ≤ 4,5"], ["f2", "φ<sub>2</sub>", "φ pour M ≥ 5,5"], ["tau1", "τ<sub>1</sub>", "τ pour M ≤ 4,5"], ["tau2", "τ<sub>2</sub>", "τ pour M ≥ 5,5"],
    ["R1", "R<sub>1</sub>", "début de Δφ<sub>R</sub> (km)"], ["R2", "R<sub>2</sub>", "fin de Δφ<sub>R</sub> (km)"], ["DfR", "Δφ<sub>R</sub>", "hausse de φ au loin"], ["DfV", "Δφ<sub>V</sub>", "baisse de φ, sols mous"],
  ],
};
/** Colonnes des tableaux de coefficients. */
export const GRANDEURS = ["PGA", "PGV", 0.1, 0.2, 0.5, 1, 2];

/** Tableau HTML des coefficients d'une loi, aux grandeurs choisies (périodes tabulées, sans interpolation). */
export function tableCoefficients(id, grandeurs = GRANDEURS) {
  const t = TABLES[id], col = (imt) => (imt === "PGA" ? t.PGA : imt === "PGV" ? t.PGV : t.SA.find((c) => Math.abs(c.T - imt) < 1e-9));
  const cols = grandeurs.map(col);
  return `<thead><tr><th>Coefficient</th><th>rôle</th>${grandeurs.map((g) => `<th class="num">${nomGrandeur(g)}</th>`).join("")}</tr></thead><tbody>${
    COEFFICIENTS[id].map(([k, sym, role]) => `<tr><td>${sym}</td><td>${role}</td>${cols.map((c) => `<td class="n">${coef(c[k])}</td>`).join("")}</tr>`).join("")
  }</tbody>`;
}

/** Constantes communes à toutes les périodes et domaine de validité. */
export function constantes(id) {
  const t = TABLES[id], d = Gmpe.LOIS[id].domaine;
  const liste = {
    akkar2014: [["c<sub>1</sub>", t.c1], ["V<sub>ref</sub>", `${coef(t.Vref)} m/s`], ["V<sub>con</sub>", `${coef(t.Vcon)} m/s`]],
    bindi2014: [["M<sub>ref</sub>", t.Mref], ["M<sub>h</sub>", t.Mh], ["R<sub>ref</sub>", `${coef(t.Rref)} km`], ["V<sub>ref</sub>", `${coef(t.Vref)} m/s`]],
    boore2014: [["M<sub>ref</sub>", t.Mref], ["R<sub>ref</sub>", `${coef(t.Rref)} km`], ["V<sub>ref</sub>", `${coef(t.Vref)} m/s`], ["f<sub>1</sub>", t.f1], ["f<sub>3</sub>", `${coef(t.f3)} g`], ["V<sub>1</sub>", `${coef(t.v1)} m/s`], ["V<sub>2</sub>", `${coef(t.v2)} m/s`]],
  }[id];
  return `<strong>Constantes :</strong> ${liste.map(([k, v]) => `${k} = ${typeof v === "number" ? coef(v) : v}`).join(" ; ")}. <strong>Domaine :</strong> M de ${coef(d.M[0])} à ${coef(d.M[1])}, R<sub>jb</sub> jusqu'à ${coef(d.R[1])} km, V<sub>s30</sub> de ${coef(d.vs30[0])} à ${coef(d.vs30[1])} m/s ; ${Gmpe.LOIS[id].periodes.length} périodes de ${coef(Gmpe.LOIS[id].periodes[0])} à ${coef(Gmpe.LOIS[id].periodes.at(-1))} s. <em>${t.reference}.</em>`;
}

/**
 * Étapes de note de calcul : chaque terme de la loi avec ses coefficients, leur somme, la médiane et σ.
 * p = { M, Rjb, vs30, rake } ; imt = "PGA", "PGV" ou une période (s).
 */
export function etapesLoi(id, p, imt = "PGA") {
  const d = Gmpe.LOIS[id].detailler(p, imt), C = d.C, T = d.termes, { M, Rjb, vs30 } = p, Y = nomGrandeur(imt), u = imt === "PGV" ? "cm/s" : "g";
  const mediane = { titre: "Médiane et écart type", formule: `ln ${Y} = somme des termes ; σ = √(τ² + φ²)`,
    calcul: `ln ${Y} = <b>${fd(d.ln, 3)}</b> → ${Y} = e<sup>${fd(d.ln, 3)}</sup> = <b>${f(Math.exp(d.ln), 3)} ${u}</b> ; σ = √(${fd(d.tau, 3)}² + ${fd(d.phi, 3)}²) = <b>${fd(d.sigma, 3)}</b>` };
  if (id === "akkar2014") {
    const k = d.constantes, dm = M - k.c1, r = vs30 / k.Vref;
    return [
      { titre: "Terme de magnitude", formule: `a<sub>1</sub> + a<sub>${M <= k.c1 ? 2 : 7}</sub>·(M − c<sub>1</sub>) + a<sub>3</sub>·(8,5 − M)²`,
        calcul: `${coef(C.a1)} + ${coef(d.aM)} × ${par(dm, 2)} ${plusC(C.a3)} × ${fd(8.5 - M, 2)}² = ${v(T.a1, 3)} ${plus(T.magnitude)} ${plus(T.courbure)} = <b>${v(T.a1 + T.magnitude + T.courbure, 3)}</b>` },
      { titre: "Terme de distance", formule: "[a<sub>4</sub> + a<sub>5</sub>·(M − c<sub>1</sub>)]·ln √(R<sub>jb</sub>² + a<sub>6</sub>²)",
        calcul: `[${coef(C.a4)} ${plusC(C.a5)} × ${par(dm, 2)}] × ln √(${f(Rjb, 4)}² ${plusC(C.a6)}²) = ${fd(C.a4 + C.a5 * dm, 4)} × ln ${fd(d.Reff, 2)} = <b>${v(T.distance, 3)}</b>` },
      { titre: "Style de faille", formule: "a<sub>8</sub>·F<sub>N</sub> + a<sub>9</sub>·F<sub>R</sub>", calcul: `${coef(C.a8)} × ${d.FN} ${plusC(C.a9)} × ${d.FR} = <b>${v(T.style, 3)}</b>` },
      d.nonLineaire
        ? { titre: "Terme de site (non linéaire, V<sub>s30</sub> &lt; V<sub>ref</sub>)", formule: "b<sub>1</sub>·ln(V<sub>s30</sub>/V<sub>ref</sub>) + b<sub>2</sub>·ln[(PGA<sub>ref</sub> + c·(V<sub>s30</sub>/V<sub>ref</sub>)<sup>n</sup>)/((PGA<sub>ref</sub> + c)·(V<sub>s30</sub>/V<sub>ref</sub>)<sup>n</sup>)]",
          calcul: `PGA<sub>ref</sub> = ${f(d.pgaRef, 3)} g ; V<sub>s30</sub>/V<sub>ref</sub> = ${fd(r, 3)} ; ${coef(C.b1)} × ln ${fd(r, 3)} ${plusC(C.b2)} × ln[(${f(d.pgaRef, 3)} ${plusC(C.c)} × ${fd(r, 3)}<sup>${coef(C.n)}</sup>)/((${f(d.pgaRef, 3)} ${plusC(C.c)}) × ${fd(r, 3)}<sup>${coef(C.n)}</sup>)] = <b>${v(T.site, 3)}</b>` }
        : { titre: "Terme de site (linéaire, V<sub>s30</sub> ≥ V<sub>ref</sub>)", formule: "b<sub>1</sub>·ln(min(V<sub>s30</sub> ; V<sub>con</sub>)/V<sub>ref</sub>)",
          calcul: `${coef(C.b1)} × ln(${f(Math.min(vs30, k.Vcon), 4)}/${coef(k.Vref)}) = <b>${v(T.site, 3)}</b>` },
      { titre: "Somme", calcul: `ln ${Y} = ${v(T.a1 + T.magnitude + T.courbure, 3)} ${plus(T.distance)} ${plus(T.style)} ${plus(T.site)} = <b>${fd(d.ln, 3)}</b>` },
      mediane,
    ];
  }
  if (id === "bindi2014") {
    const k = d.constantes, dm = M - k.Mh, uB = imt === "PGV" ? "cm/s" : "cm/s²", style = Math.abs(T.style - C.sofS) < 1e-12 ? "sofS" : Math.abs(T.style - C.sofR) < 1e-12 ? "sofR" : Math.abs(T.style - C.sofN) < 1e-12 ? "sofN" : "0";
    return [
      { titre: "Terme de magnitude", formule: M < k.Mh ? "e<sub>1</sub> + b<sub>1</sub>·(M − M<sub>h</sub>) + b<sub>2</sub>·(M − M<sub>h</sub>)²" : "e<sub>1</sub> + b<sub>3</sub>·(M − M<sub>h</sub>)",
        calcul: M < k.Mh ? `${coef(C.e1)} ${plusC(C.b1)} × ${par(dm, 2)} ${plusC(C.b2)} × ${par(dm, 2)}² = <b>${v(T.e1 + T.magnitude, 4)}</b>` : `${coef(C.e1)} ${plusC(C.b3)} × ${par(dm, 2)} = <b>${v(T.e1 + T.magnitude, 4)}</b>` },
      { titre: "Terme de distance", formule: "R = √(R<sub>jb</sub>² + h²) ; [c<sub>1</sub> + c<sub>2</sub>·(M − M<sub>ref</sub>)]·log<sub>10</sub>(R/R<sub>ref</sub>) − c<sub>3</sub>·(R − R<sub>ref</sub>)",
        calcul: `R = √(${f(Rjb, 4)}² ${plusC(C.h)}²) = ${fd(d.r, 2)} km ; [${coef(C.c1)} ${plusC(C.c2)} × ${par(M - k.Mref, 2)}] × log<sub>10</sub> ${fd(d.r, 2)} − ${coef(C.c3)} × ${fd(d.r - k.Rref, 2)} = <b>${v(T.distance, 4)}</b>` },
      { titre: "Terme de site", formule: "γ·log<sub>10</sub>(V<sub>s30</sub>/V<sub>ref</sub>)", calcul: `${coef(C.gamma)} × log<sub>10</sub>(${f(vs30, 4)}/${coef(k.Vref)}) = <b>${v(T.site, 4)}</b>` },
      { titre: "Style de faille", calcul: `${style} = <b>${v(T.style, 4)}</b>` },
      { titre: "Somme, en logarithme décimal", calcul: `log<sub>10</sub> ${Y} = ${v(T.e1 + T.magnitude, 4)} ${plus(T.distance, 4)} ${plus(T.site, 4)} ${plus(T.style, 4)} = <b>${fd(d.log10Y, 4)}</b> → ${Y} = 10<sup>${fd(d.log10Y, 4)}</sup> = ${f(10 ** d.log10Y, 4)} ${uB}${imt === "PGV" ? "" : ` = ${f(10 ** d.log10Y, 4)}/(100 × 9,807) = ${f(Math.exp(d.ln), 3)} g`}`,
        note: "ln Y = log<sub>10</sub> Y × ln 10 ; les écarts types aussi se multiplient par ln 10 = 2,303." },
      { ...mediane, calcul: `ln ${Y} = <b>${fd(d.ln, 3)}</b> → ${Y} = <b>${f(Math.exp(d.ln), 3)} ${u}</b> ; σ = ${coef(C.sigma)} × 2,303 = <b>${fd(d.sigma, 3)}</b> (τ = ${fd(d.tau, 3)}, φ = ${fd(d.phi, 3)})` },
    ];
  }
  const k = d.constantes, dm = M - C.Mh, nomStyle = { e1: "e<sub>1</sub> (décrochement)", e2: "e<sub>2</sub> (normale)", e3: "e<sub>3</sub> (inverse)" }[d.style];
  return [
    { titre: "Terme de source F<sub>E</sub>", formule: M <= C.Mh ? "e<sub>style</sub> + e<sub>4</sub>·(M − M<sub>h</sub>) + e<sub>5</sub>·(M − M<sub>h</sub>)²" : "e<sub>style</sub> + e<sub>6</sub>·(M − M<sub>h</sub>)",
      calcul: `${nomStyle} = ${coef(C[d.style])} ; ${M <= C.Mh ? `${coef(C.e4)} × ${par(dm, 2)} ${plusC(C.e5)} × ${par(dm, 2)}²` : `${coef(C.e6)} × ${par(dm, 2)}`} = ${v(T.magnitude, 4)} → F<sub>E</sub> = <b>${v(T.style + T.magnitude, 4)}</b>` },
    { titre: "Terme de trajet F<sub>P</sub>", formule: "R = √(R<sub>jb</sub>² + h²) ; [c<sub>1</sub> + c<sub>2</sub>·(M − M<sub>ref</sub>)]·ln(R/R<sub>ref</sub>) + (c<sub>3</sub> + Δc<sub>3</sub>)·(R − R<sub>ref</sub>)",
      calcul: `R = √(${f(Rjb, 4)}² ${plusC(C.h)}²) = ${fd(d.R, 2)} km ; [${coef(C.c1)} ${plusC(C.c2)} × ${par(M - k.Mref, 2)}] × ln ${fd(d.R, 2)} ${plusC(C.c3 + C.Dc3)} × ${fd(d.R - k.Rref, 2)} = <b>${v(T.distance, 4)}</b>` },
    { titre: "Site, part linéaire", formule: "c·ln(min(V<sub>s30</sub> ; V<sub>c</sub>)/V<sub>ref</sub>)", calcul: `${coef(C.c)} × ln(${f(Math.min(vs30, C.Vc), 4)}/${coef(k.Vref)}) = <b>${v(T.siteLineaire, 4)}</b>` },
    { titre: "Site, part non linéaire", formule: "PGA<sub>r</sub> au rocher de référence ; f<sub>2</sub> = f<sub>4</sub>·[e<sup>f<sub>5</sub>·(min(V<sub>s30</sub> ; 760) − 360)</sup> − e<sup>400·f<sub>5</sub></sup>] ; f<sub>1</sub> + f<sub>2</sub>·ln((PGA<sub>r</sub> + f<sub>3</sub>)/f<sub>3</sub>)",
      calcul: `PGA<sub>r</sub> = ${f(d.pgaRocher, 3)} g ; f<sub>2</sub> = ${coef(C.f4)} × [e<sup>${coef(C.f5)} × ${f(Math.min(vs30, 760) - 360, 4)}</sup> − e<sup>${coef(C.f5)} × 400</sup>] = ${f(nul(d.f2, 6), 3)} ; ${coef(k.f1)} + ${f(nul(d.f2, 6), 3)} × ln((${f(d.pgaRocher, 3)} ${plusC(k.f3)})/${coef(k.f3)}) = <b>${v(T.siteNonLineaire, 4)}</b>`,
      note: vs30 >= 760 ? "Au-delà de 760 m/s, f<sub>2</sub> = 0 : pas d'effet non linéaire." : "Un sol mou (f<sub>2</sub> &lt; 0) amplifie moins quand la secousse au rocher est forte." },
    { titre: "Somme", calcul: `ln ${Y} = ${v(T.style + T.magnitude, 4)} ${plus(T.distance, 4)} ${plus(T.siteLineaire, 4)} ${plus(T.siteNonLineaire, 4)} = <b>${fd(d.ln, 3)}</b>` },
    { ...mediane, formule: `ln ${Y} = F<sub>E</sub> + F<sub>P</sub> + F<sub>S</sub> ; τ(M), φ(M, R<sub>jb</sub>, V<sub>s30</sub>) ; σ = √(τ² + φ²)` },
  ];
}

/** Somme en une ligne, pour une note qui combine les trois lois (chapitre 1). */
export function sommeEnLigne(id, p, imt = "PGA") {
  const d = Gmpe.LOIS[id].detailler(p, imt), v = Object.values(d.termes);
  const somme = `${fd(v[0], 3)} ${v.slice(1).map((x) => plus(x)).join(" ")}`;
  return id === "bindi2014" ? `log<sub>10</sub> Y = ${somme} = ${fd(d.log10Y, 3)} (cm/s²) → ln Y = <b>${fd(d.ln, 3)}</b> (g)` : `ln Y = ${somme} = <b>${fd(d.ln, 3)}</b>`;
}
