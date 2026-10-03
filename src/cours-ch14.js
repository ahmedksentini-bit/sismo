// Calculateurs du chapitre 14 : oscillateur élastoplastique sous un accélérogramme (boucle, ductilité,
// résiduel) ; ductilité demandée face aux règles R–μ–T ; spectre de calcul de l'EN 1998-1:2004.
import { el, num, f, fd, brancher, garde } from "./ui.js";
import { graphe, COULEURS } from "./figures.js";
import Inelastique from "./sismo/inelastique.js";
import Accelero from "./sismo/accelerogramme.js";
import Spectre from "./sismo/spectre.js";

const G = Spectre.G;
let rec = null;
const enregistrement = () => (rec ||= Accelero.simuler({ M: 6.5, R: 10, graine: 5 }));

// ── Un oscillateur élastoplastique sous un séisme ────────────────────────
const majBoucle = garde("boOut", () => {
  const T = num("boT"), R = num("boR"), alpha = num("boAlpha", 0);
  if (!(T >= 0.05 && T <= 5 && R >= 1 && alpha >= 0 && alpha < 1)) { el("boOut").textContent = "Période de 0,05 à 5 s, R ≥ 1, écrouissage de 0 à 1."; el("boFig").innerHTML = ""; return; }
  const r0 = enregistrement(), sae = Inelastique.saElastique(r0.acc, r0.dt, T), res = Inelastique.integrer(r0.acc, r0.dt, { T, fy: sae / R, alpha });
  const sdEl = sae * (T / (2 * Math.PI)) ** 2, n = res.u.length, pas = Math.max(1, Math.floor(n / 1500)), dtc = (r0.dt * (r0.acc.length - 1)) / (n - 1);
  const umax = Math.max(res.umax, sdEl) * 1000 * 1.1, fmax = (sae / G) * 1.1;
  el("boFig").innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${graphe({
    largeur: 300, hauteur: 280, xmin: -umax, xmax: umax, ymin: -fmax, ymax: fmax,
    xlabel: "déplacement (mm)", ylabel: "force / masse (g)",
    series: [
      { points: [[-sdEl * 1000, -sae / G], [sdEl * 1000, sae / G]], couleur: COULEURS.discret, epaisseur: 1.2, tirets: "5 4", libelle: "élastique" },
      { points: Array.from(res.u, (u, i) => [u * 1000, res.f[i] / G]).filter((_, i) => i % pas === 0), couleur: COULEURS.bleu, epaisseur: 1.4, libelle: "boucle" },
    ],
  })}${graphe({
    largeur: 300, hauteur: 280, xmin: 0, xmax: Math.ceil((n - 1) * dtc), ymin: -umax, ymax: umax,
    xlabel: "temps (s)", ylabel: "déplacement (mm)",
    series: [{ points: Array.from(res.u, (u, i) => [i * dtc, u * 1000]).filter((_, i) => i % pas === 0), couleur: COULEURS.bleu, epaisseur: 1.4 },
      { points: [[0, res.residuel * 1000], [Math.ceil((n - 1) * dtc), res.residuel * 1000]], couleur: COULEURS.effort, epaisseur: 1, tirets: "4 3", libelle: "résiduel" }],
  })}</div>`;
  el("boOut").innerHTML = `S<sub>a</sub> élastique ${f(sae / G, 3)} g, résistance f<sub>y</sub>/m = ${f(sae / G / R, 3)} g · u<sub>y</sub> = ${f(res.uy * 1000, 3)} mm ·
    <strong>u<sub>max</sub> = ${f(res.umax * 1000, 3)} mm</strong> (élastique : ${f(sdEl * 1000, 3)} mm) · <strong>μ = ${fd(res.mu, 2)}</strong> · résiduel ${f(res.residuel * 1000, 2)} mm
    <small>Règles : égaux déplacements μ = ${fd(R, 1)} ; N2 avec T<sub>C</sub> = 0,4 s : μ = ${fd(Inelastique.regles.n2(R, T, 0.4), 2)}. Un seul accélérogramme : forte variabilité d'un séisme à l'autre.</small>`;
});
brancher(["boT", "boR", "boAlpha"], majBoucle);

// ── Ductilité demandée : règles et calculs temporels ─────────────────────
let recs = null;
const TS = [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2];
const cacheMu = new Map();
const majRegles = garde("rgOut", () => {
  const R = num("rgR"), TC = num("rgTC");
  if (!(R >= 1 && R <= 12 && TC > 0)) { el("rgOut").textContent = "R de 1 à 12, TC positive."; el("rgFig").innerHTML = ""; return; }
  recs ||= [1, 2, 3, 4, 5].map((g) => Accelero.simuler({ M: 6.5, R: 10, graine: 40 + g }));
  if (!cacheMu.has(R)) cacheMu.set(R, TS.map((T) => recs.reduce((s, r) => s + Inelastique.ductiliteR(r.acc, r.dt, T, R), 0) / recs.length));
  const mus = cacheMu.get(R), Tg = Array.from({ length: 191 }, (_, i) => 0.1 + i * 0.01);
  const ymax = Math.ceil(Math.max(...mus, (R * R + 1) / 2, Inelastique.regles.n2(R, 0.1, TC)) * 1.1);
  el("rgFig").innerHTML = graphe({
    largeur: 560, hauteur: 300, xmin: 0.1, xmax: 2, ymin: 0, ymax, logX: true,
    xlabel: "période T (s)", ylabel: "ductilité μ",
    series: [
      { points: Tg.map((t) => [t, R]), couleur: COULEURS.discret, epaisseur: 1.4, tirets: "5 4", libelle: "égaux déplacements" },
      { points: Tg.map((t) => [t, (R * R + 1) / 2]), couleur: COULEURS.violet, epaisseur: 1.4, tirets: "2 3", libelle: "égales énergies" },
      { points: Tg.map((t) => [t, Inelastique.regles.n2(R, t, TC)]), couleur: COULEURS.reaction, epaisseur: 2, libelle: `règle N2 (TC = ${fd(TC, 2)} s)` },
      { points: TS.map((t, i) => [t, mus[i]]), couleur: COULEURS.bleu, epaisseur: 2.4, marqueurs: true, libelle: "moyenne de 5 calculs temporels" },
    ],
  });
  el("rgOut").innerHTML = `R = ${fd(R, 1)} : ductilité moyenne calculée <strong>${fd(mus[0], 1)} à ${f(TS[0], 2)} s</strong>, ${fd(mus[5], 1)} à 0,5 s, <strong>${fd(mus[9], 1)} à 2 s</strong>
    <small>Aux longues périodes, la règle des égaux déplacements (μ = R) tient en moyenne ; aux courtes, la demande de ductilité explose.</small>`;
});
brancher(["rgR", "rgTC"], majRegles);

// ── Spectre de calcul ────────────────────────────────────────────────────
const majCalcul = garde("sdOut", () => {
  const ag = num("sdAg"), sol = el("sdSol").value, q = num("sdQ"), T = num("sdT");
  if (!(ag > 0 && q >= 1 && T > 0 && T <= 4)) { el("sdOut").textContent = "ag positif, q ≥ 1, période de 0 à 4 s."; el("sdFig").innerHTML = ""; return; }
  const Tg = Array.from({ length: 401 }, (_, i) => i * 0.01), o = { type: 1, sol, ag };
  const se = Spectre.ec8(T, o), sd = Spectre.ec8Calcul(T, { ...o, q }), p = Spectre.EC8_2004[1][sol];
  el("sdFig").innerHTML = graphe({
    largeur: 560, hauteur: 300, xmin: 0, xmax: 4, ymin: 0, ymax: Math.ceil(ag * p.S * 2.5 * 11) / 10,
    xlabel: "période T (s)", ylabel: "accélération spectrale (g)",
    series: [
      { points: Tg.map((t) => [t, Spectre.ec8(t, o)]), couleur: COULEURS.discret, epaisseur: 1.6, tirets: "5 4", libelle: "élastique Se" },
      { points: Tg.map((t) => [t, Spectre.ec8Calcul(t, { ...o, q })]), couleur: COULEURS.bleu, epaisseur: 2.6, libelle: `calcul Sd, q = ${fd(q, 1)}` },
      { points: [[0, 0.2 * ag], [4, 0.2 * ag]], couleur: COULEURS.effort, epaisseur: 1, tirets: "2 3", libelle: "β·ag" },
    ],
    marques: [{ x: T, y: sd, couleur: COULEURS.effort, guides: true, libelle: `${f(sd, 3)} g` }],
  });
  el("sdOut").innerHTML = `T = ${f(T, 3)} s : S<sub>e</sub> = ${f(se, 3)} g, <strong>S<sub>d</sub> = ${f(sd, 3)} g</strong> (rapport ${f(se / sd, 3)})
    <small>Au plateau, le rapport vaut exactement q ; à T = 0, S<sub>d</sub> = 2/3·a<sub>g</sub>S ; aux longues périodes, le plancher β·a<sub>g</sub> = ${f(0.2 * ag, 3)} g peut s'appliquer.</small>`;
});
brancher(["sdAg", "sdSol", "sdQ", "sdT"], majCalcul);
